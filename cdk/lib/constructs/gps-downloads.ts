import { Construct } from "constructs";
import { CfnOutput, Stack } from "aws-cdk-lib";
import * as iam from "aws-cdk-lib/aws-iam";
import * as s3 from "aws-cdk-lib/aws-s3";
import * as cloudfront from "aws-cdk-lib/aws-cloudfront";

export interface GpsDownloadsProps {
  /** The existing CDN origin bucket (shared with the geo-tz data). */
  readonly bucket: s3.IBucket;
  /** The existing CloudFront distribution fronting the bucket. */
  readonly distribution: cloudfront.IDistribution;
  /**
   * "owner/repo" of every GitHub repo allowed to publish. Normally one entry.
   *
   * A LIST, not a string, so that transferring the GPS repo between owners has
   * no window in which publishing is broken: add the new "owner/repo" and
   * deploy BEFORE moving the repo, then drop the old entry after the first
   * successful release under the new name. GitHub's OIDC `sub` claim carries
   * the repo's full name, so a transfer changes it and a single-valued trust
   * policy stops matching the moment the repo moves.
   *
   * Deliberately exact strings rather than an owner wildcard pinned to
   * `repository_id`, which is how the Entra side solves the same problem: AWS
   * has only reliably honored `sub` and `aud` from GitHub tokens, so a policy
   * leaning on `repository_id` risks either denying every publish or, worse,
   * trusting any account that happens to own a repo with a matching name.
   */
  readonly githubRepos: readonly string[];
  /**
   * ARN of an existing GitHub Actions OIDC provider to import. If omitted, one
   * is created. (Only ONE provider for token.actions.githubusercontent.com may
   * exist per account.)
   */
  readonly oidcProviderArn?: string;
  /** Key prefix the DMG + pointers live under. Defaults to "gps". */
  readonly prefix?: string;
}

/**
 * Lets the private geospoof-gps release workflow publish the signed, notarized
 * DMG to the CDN, using GitHub OIDC (no long-lived AWS access keys).
 *
 * It provisions a single IAM role, trusted only by the named repo's Actions,
 * whose permissions are scoped to exactly what a publish needs:
 *   - s3:PutObject under `<prefix>/*` on the CDN bucket
 *   - cloudfront:CreateInvalidation on this one distribution
 *
 * The workflow uploads these objects under `<prefix>/`:
 *   - GeoSpoof-GPS-v<version>.dmg  (immutable, versioned archive)
 *   - latest.dmg                   (stable download URL; short TTL + invalidated)
 *   - latest.json                  (version pointer for the /gps page UI)
 *   - appcast.xml                  (Sparkle auto-update feed; short TTL + invalidated,
 *                                   EdDSA-signed, enclosure points at the versioned DMG)
 *
 * No extra IAM is needed for the appcast: it lives under `<prefix>/`, so the
 * `s3:PutObject` on `<prefix>/*` and the distribution `CreateInvalidation` grant
 * below already cover uploading and invalidating it.
 */
export class GpsDownloads extends Construct {
  readonly publishRole: iam.Role;
  readonly prefix: string;

  constructor(scope: Construct, id: string, props: GpsDownloadsProps) {
    super(scope, id);
    this.prefix = props.prefix ?? "gps";

    // Create or import the GitHub Actions OIDC provider. `sts.amazonaws.com` is
    // the audience the official aws-actions/configure-aws-credentials uses.
    const provider = props.oidcProviderArn
      ? iam.OpenIdConnectProvider.fromOpenIdConnectProviderArn(
          this,
          "GithubOidc",
          props.oidcProviderArn
        )
      : new iam.OpenIdConnectProvider(this, "GithubOidc", {
          url: "https://token.actions.githubusercontent.com",
          clientIds: ["sts.amazonaws.com"],
        });

    // An empty list would render a StringLike with no values, which matches
    // nothing and so fails closed rather than open - but it fails closed at
    // release time, on a tag push, which is the worst moment to discover it.
    // Fail at synth instead.
    if (props.githubRepos.length === 0) {
      throw new Error(
        "GpsDownloads: githubRepos must name at least one owner/repo allowed to publish"
      );
    }

    // Trust: only tokens minted for these repos' workflows may assume the role.
    // `:*` covers tag pushes (gps-v*) and manual dispatch; tighten to
    // `repo:<owner/repo>:ref:refs/tags/gps-v*` if you want tag-only publishes.
    //
    // StringLike with a list is OR, so each entry is independently sufficient.
    const publishRole = new iam.Role(this, "PublishRole", {
      assumedBy: new iam.OpenIdConnectPrincipal(provider, {
        StringEquals: {
          "token.actions.githubusercontent.com:aud": "sts.amazonaws.com",
        },
        StringLike: {
          "token.actions.githubusercontent.com:sub": props.githubRepos.map(
            (repo) => `repo:${repo}:*`
          ),
        },
      }),
      description: `GitHub Actions publish role for ${props.githubRepos.join(", ")} (GPS DMG -> CDN)`,
    });

    // Least privilege: write only under the gps/ prefix.
    publishRole.addToPolicy(
      new iam.PolicyStatement({
        actions: ["s3:PutObject"],
        resources: [props.bucket.arnForObjects(`${this.prefix}/*`)],
      })
    );

    // Allow invalidating the moving pointers (latest.dmg / latest.json) so a
    // new release is visible immediately instead of after the short TTL.
    publishRole.addToPolicy(
      new iam.PolicyStatement({
        actions: ["cloudfront:CreateInvalidation"],
        resources: [
          `arn:aws:cloudfront::${Stack.of(this).account}:distribution/${props.distribution.distributionId}`,
        ],
      })
    );

    this.publishRole = publishRole;

    // Outputs to paste into the geospoof-gps repo's Actions variables.
    new CfnOutput(this, "GpsPublishRoleArn", {
      value: publishRole.roleArn,
      description: "geospoof-gps repo variable GPS_PUBLISH_ROLE_ARN (role-to-assume).",
    });
    new CfnOutput(this, "GpsCdnBucket", {
      value: props.bucket.bucketName,
      description: "geospoof-gps repo variable GPS_CDN_BUCKET.",
    });
    new CfnOutput(this, "GpsCdnDistributionId", {
      value: props.distribution.distributionId,
      description: "geospoof-gps repo variable GPS_CDN_DISTRIBUTION_ID.",
    });
  }
}
