import { Stack, StackProps, Tags } from "aws-cdk-lib";
import { Construct } from "constructs";
import { GeoTzCdnEnv } from "../config/app";
import { GeoTzCdn } from "../constructs/geo-tz-cdn";
import { GpsDownloads } from "../constructs/gps-downloads";

export interface GeoTzCdnStackProps extends StackProps {
  readonly envConfig: GeoTzCdnEnv;
}

export class GeoTzCdnStack extends Stack {
  constructor(scope: Construct, id: string, props: GeoTzCdnStackProps) {
    super(scope, id, props);

    const cdn = new GeoTzCdn(this, "GeoTzCdn", { env: props.envConfig });

    // Reuse the same bucket + distribution to also serve the GeoSpoof GPS DMG,
    // published from the private geospoof-gps repo's CI via GitHub OIDC.
    if (props.envConfig.gpsRelease) {
      new GpsDownloads(this, "GpsDownloads", {
        bucket: cdn.bucket,
        distribution: cdn.distribution,
        githubRepo: props.envConfig.gpsRelease.githubRepo,
        oidcProviderArn: props.envConfig.gpsRelease.oidcProviderArn,
      });
    }

    Tags.of(this).add("project", "geospoof");
    Tags.of(this).add("component", "geo-tz-cdn");
    Tags.of(this).add("env", props.envConfig.name);
  }
}
