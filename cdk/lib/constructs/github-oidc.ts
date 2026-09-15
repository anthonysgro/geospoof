import { Construct } from "constructs";
import * as iam from "aws-cdk-lib/aws-iam";

/**
 * Shared pieces for the CDN publish roles that GitHub Actions assumes.
 *
 * These are plain FUNCTIONS rather than a base construct on purpose. A CDK
 * logical id is derived from the construct PATH, so wrapping an existing role in
 * a new parent construct would change its path, and CloudFormation would replace
 * the role and mint a new ARN. The GPS publish role's ARN is recorded in a
 * GitHub Actions variable (`GPS_PUBLISH_ROLE_ARN`), so a replacement breaks
 * publishing silently, at release time. Sharing code as functions lets each
 * caller keep creating its own role at its own unchanged path.
 */

/** Audience the official `aws-actions/configure-aws-credentials` requests. */
export const GITHUB_OIDC_AUDIENCE = "sts.amazonaws.com";
export const GITHUB_OIDC_ISSUER = "https://token.actions.githubusercontent.com";

/**
 * Create or import the account's GitHub Actions OIDC provider.
 *
 * An AWS account may hold only ONE provider for
 * `token.actions.githubusercontent.com`, so a second publisher in the same
 * account must IMPORT the first one's rather than create its own. Pass the
 * existing provider through `existing` when one is already in the stack.
 */
export function githubOidcProvider(
  scope: Construct,
  id: string,
  options: {
    readonly existing?: iam.IOpenIdConnectProvider;
    readonly existingArn?: string;
  } = {}
): iam.IOpenIdConnectProvider {
  if (options.existing) return options.existing;
  if (options.existingArn) {
    return iam.OpenIdConnectProvider.fromOpenIdConnectProviderArn(scope, id, options.existingArn);
  }
  return new iam.OpenIdConnectProvider(scope, id, {
    url: GITHUB_OIDC_ISSUER,
    clientIds: [GITHUB_OIDC_AUDIENCE],
  });
}

/**
 * Validate `sub` patterns and turn them into a principal, failing at SYNTH on
 * anything that would misbehave at release time.
 *
 * Two failures are worth catching here rather than in a workflow log:
 *
 *   - An EMPTY list renders a StringLike with no values. That matches nothing,
 *     so it fails closed rather than open - but it fails closed on a tag push,
 *     which is the worst moment to discover it.
 *   - A pattern not anchored on `repo:` cannot match a GitHub Actions token at
 *     all, so it is a silently dead entry; and a bare `*` would be a wide open
 *     role. Neither should reach production.
 *
 * See `GpsDownloadsProps.githubSubjectPatterns` for why these are full `sub`
 * patterns rather than "owner/repo" strings - GitHub's current subject embeds
 * numeric owner and repo ids and will not match a hand-written name.
 */
export function githubActionsPrincipal(
  label: string,
  provider: iam.IOpenIdConnectProvider,
  subjectPatterns: readonly string[]
): iam.OpenIdConnectPrincipal {
  if (subjectPatterns.length === 0) {
    throw new Error(`${label}: githubSubjectPatterns must contain at least one sub pattern`);
  }

  const malformed = subjectPatterns.filter((pattern) => !pattern.startsWith("repo:"));
  if (malformed.length > 0) {
    throw new Error(
      `${label}: githubSubjectPatterns entries must start with "repo:" - got ${malformed.join(", ")}`
    );
  }

  // StringLike with a list is OR, so each entry is independently sufficient.
  return new iam.OpenIdConnectPrincipal(provider, {
    StringEquals: {
      "token.actions.githubusercontent.com:aud": GITHUB_OIDC_AUDIENCE,
    },
    StringLike: {
      "token.actions.githubusercontent.com:sub": [...subjectPatterns],
    },
  });
}

/**
 * Least-privilege publish permissions: write under one key prefix, and
 * invalidate the one distribution so moving pointers go live immediately
 * instead of after their TTL.
 */
export function grantCdnPublish(
  // Deliberately `Role`, not `IRole`, so this uses `addToPolicy` exactly as the
  // callers did before this was extracted. `addToPrincipalPolicy` on an IRole is
  // near-equivalent but is not guaranteed to synthesize identically, and the GPS
  // role must come out of this refactor byte-for-byte unchanged.
  role: iam.Role,
  options: {
    readonly bucketArnForPrefix: string;
    readonly distributionArn: string;
  }
): void {
  role.addToPolicy(
    new iam.PolicyStatement({
      actions: ["s3:PutObject"],
      resources: [options.bucketArnForPrefix],
    })
  );
  role.addToPolicy(
    new iam.PolicyStatement({
      actions: ["cloudfront:CreateInvalidation"],
      resources: [options.distributionArn],
    })
  );
}
