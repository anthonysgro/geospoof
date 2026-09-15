import { Construct } from "constructs";
import { CfnOutput, Stack } from "aws-cdk-lib";
import * as iam from "aws-cdk-lib/aws-iam";
import * as s3 from "aws-cdk-lib/aws-s3";
import * as cloudfront from "aws-cdk-lib/aws-cloudfront";
import { githubActionsPrincipal, githubOidcProvider, grantCdnPublish } from "./github-oidc";

export interface ExtensionUpdatesProps {
  /** The existing CDN origin bucket (shared with geo-tz data and the GPS DMG). */
  readonly bucket: s3.IBucket;
  /** The existing CloudFront distribution fronting the bucket. */
  readonly distribution: cloudfront.IDistribution;
  /**
   * OIDC `sub` claim patterns allowed to publish the update manifest, matched
   * with StringLike. NOT plain "owner/repo" - see
   * `GpsDownloadsProps.githubSubjectPatterns` and `cdk/README.md` for why
   * GitHub's current subject embeds numeric owner and repo ids and will not
   * match a hand-written name.
   */
  readonly githubSubjectPatterns: readonly string[];
  /**
   * The account's existing GitHub Actions OIDC provider. An account may hold
   * only ONE provider for `token.actions.githubusercontent.com`, so when the GPS
   * publisher is also in the stack this MUST be its provider rather than a new
   * one. Omit only if nothing else in the account has created it.
   */
  readonly oidcProvider?: iam.IOpenIdConnectProvider;
  /** Key prefix the update manifest lives under. Defaults to "firefox". */
  readonly prefix?: string;
}

/**
 * Serves the Firefox self-hosted update manifest from a domain we own.
 *
 * WHY THIS EXISTS, because it is not an optimization. `update_url` is compiled
 * into every shipped copy of the extension (`src/build/manifest.ts`), and Mozilla
 * is explicit that an installed extension keeps polling the URL it was built
 * with - an existing install cannot be told about a new one. That manifest was
 * historically served from GitHub Pages at
 * `anthonysgro.github.io/geospoof/update.json`, which ties the update path of
 * every self-hosted install to a personal GitHub username. GitHub does not
 * redirect Pages when a repo is transferred, so moving the repo would strand
 * those installs on their current version - and strand them SILENTLY, since a
 * failed update check is invisible to the user.
 *
 * Publishing to `cdn.geospoof.com/firefox/` removes GitHub from the update path
 * entirely. After the installed base has rolled forward onto a build pointing
 * here, the repo can be moved, renamed, or re-owned with no effect on updates.
 *
 * The workflow uploads one object under `<prefix>/`:
 *   - update.json  (moving pointer; short TTL + invalidated on publish)
 *
 * It MUST be uploaded with a short `Cache-Control` - `public, max-age=300`,
 * matching `gps/latest.json` - because the distribution's default behaviour is
 * CACHING_OPTIMIZED and honours the origin's header. Uploading it with the
 * long-lived, immutable header used for the versioned geo-tz data would pin a
 * stale version pointer in CloudFront's cache for up to a year.
 *
 * Note the manifest's `update_link` still points at github.com release assets,
 * which DO follow a repo transfer's redirect. That redirect is permanently
 * disabled if anything is ever created at the old repo path, so the old name
 * must stay unused.
 */
export class ExtensionUpdates extends Construct {
  readonly publishRole: iam.Role;
  readonly prefix: string;

  constructor(scope: Construct, id: string, props: ExtensionUpdatesProps) {
    super(scope, id);
    this.prefix = props.prefix ?? "firefox";

    const provider = githubOidcProvider(this, "GithubOidc", {
      existing: props.oidcProvider,
    });

    const publishRole = new iam.Role(this, "PublishRole", {
      assumedBy: githubActionsPrincipal("ExtensionUpdates", provider, props.githubSubjectPatterns),
      description: `GitHub Actions publish role for the extension update manifest -> CDN (${props.githubSubjectPatterns.length} trusted subject pattern(s))`,
    });

    // Least privilege: this role can write ONLY the update manifest prefix. It
    // deliberately cannot touch geo-tz data or the GPS release artifacts, which
    // live under other prefixes in the same bucket.
    grantCdnPublish(publishRole, {
      bucketArnForPrefix: props.bucket.arnForObjects(`${this.prefix}/*`),
      distributionArn: `arn:aws:cloudfront::${Stack.of(this).account}:distribution/${props.distribution.distributionId}`,
    });

    this.publishRole = publishRole;

    // Outputs to paste into the extension repo's Actions variables.
    new CfnOutput(this, "ExtPublishRoleArn", {
      value: publishRole.roleArn,
      description: "extension repo variable EXT_PUBLISH_ROLE_ARN (role-to-assume).",
    });
    new CfnOutput(this, "ExtCdnBucket", {
      value: props.bucket.bucketName,
      description: "extension repo variable EXT_CDN_BUCKET.",
    });
    new CfnOutput(this, "ExtCdnDistributionId", {
      value: props.distribution.distributionId,
      description: "extension repo variable EXT_CDN_DISTRIBUTION_ID.",
    });
    new CfnOutput(this, "ExtUpdateManifestUrl", {
      value: `https://cdn.geospoof.com/${this.prefix}/update.json`,
      description: "The update_url the extension manifest must point at.",
    });
  }
}
