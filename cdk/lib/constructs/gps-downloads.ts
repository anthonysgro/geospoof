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
   * `sub` claim patterns whose GitHub Actions tokens may assume the publish
   * role, matched with StringLike (so a list is OR, and `*` is a wildcard).
   * Written out in full rather than assembled from an "owner/repo" string,
   * because the shape of this claim is NOT what you would guess.
   *
   * DO NOT WRITE `repo:<owner>/<repo>:*` FROM MEMORY. GitHub now issues an
   * IMMUTABLE subject that embeds the numeric owner and repo ids:
   *
   *   repo:GeoSpoof@320249603/geospoof-gps@1291874641:ref:refs/tags/gps-v0.2.2
   *
   * Repos created after 2026-07-15, and any repo RENAMED OR TRANSFERRED after
   * that date, use this format; older untouched repos keep the classic
   * name-based one until opted in. Transferring geospoof-gps to the GeoSpoof
   * org flipped it, and a name-based policy silently stopped matching - the
   * failure is an unassumable role at publish time, long after the build.
   *
   * Get the current value from the repo itself rather than reconstructing it:
   *
   *   gh api repos/OWNER/REPO/actions/oidc/customization/sub \
   *     --jq .sub_claim_prefix
   *
   * The owner segment is wildcarded here so a future transfer needs no change
   * (a transfer alters the owner id, never the repo id). That is safe WITHOUT
   * any `repository_id` condition precisely because the immutable subject
   * embeds the repo id: only tokens minted for repo 1291874641 can match, and
   * repo ids are globally unique and never reused. Which matters, because AWS
   * has only reliably honored `sub` and `aud` from GitHub tokens, so a policy
   * leaning on a custom `repository_id` claim risks denying every publish.
   *
   * A LIST because a format migration or an owner move can need two entries
   * trusted at once; keep it at one whenever nothing is in flight.
   */
  readonly githubSubjectPatterns: readonly string[];
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
    if (props.githubSubjectPatterns.length === 0) {
      throw new Error(
        "GpsDownloads: githubSubjectPatterns must contain at least one sub pattern allowed to publish"
      );
    }

    // A pattern not anchored on "repo:" cannot match a GitHub Actions token and
    // would be a silently dead entry - or, if someone wrote a bare "*", a wide
    // open role. Neither is worth discovering later.
    const malformed = props.githubSubjectPatterns.filter((pattern) => !pattern.startsWith("repo:"));
    if (malformed.length > 0) {
      throw new Error(
        `GpsDownloads: githubSubjectPatterns entries must start with "repo:" - got ${malformed.join(", ")}`
      );
    }

    // Trust: only tokens whose `sub` matches one of these patterns may assume
    // the role. StringLike with a list is OR, so each entry is independently
    // sufficient. Tighten a pattern's trailing `:*` to `:ref:refs/tags/gps-v*`
    // if you ever want tag-only publishes.
    const publishRole = new iam.Role(this, "PublishRole", {
      assumedBy: new iam.OpenIdConnectPrincipal(provider, {
        StringEquals: {
          "token.actions.githubusercontent.com:aud": "sts.amazonaws.com",
        },
        StringLike: {
          "token.actions.githubusercontent.com:sub": [...props.githubSubjectPatterns],
        },
      }),
      description: `GitHub Actions publish role for GPS DMG -> CDN (${props.githubSubjectPatterns.length} trusted subject pattern(s))`,
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
