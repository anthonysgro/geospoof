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
  /** "owner/repo" of the private GPS repo allowed to publish. */
  readonly githubRepo: string;
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

    // Trust: only tokens minted for this repo's workflows may assume the role.
    // `:*` covers tag pushes (gps-v*) and manual dispatch; tighten to
    // `repo:<owner/repo>:ref:refs/tags/gps-v*` if you want tag-only publishes.
    const publishRole = new iam.Role(this, "PublishRole", {
      assumedBy: new iam.OpenIdConnectPrincipal(provider, {
        StringEquals: {
          "token.actions.githubusercontent.com:aud": "sts.amazonaws.com",
        },
        StringLike: {
          "token.actions.githubusercontent.com:sub": `repo:${props.githubRepo}:*`,
        },
      }),
      description: `GitHub Actions publish role for ${props.githubRepo} (GPS DMG -> CDN)`,
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
