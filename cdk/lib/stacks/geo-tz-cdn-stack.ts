import { Stack, StackProps, Tags } from "aws-cdk-lib";
import { Construct } from "constructs";
import { GeoTzCdnEnv } from "../config/app";
import { GeoTzCdn } from "../constructs/geo-tz-cdn";

export interface GeoTzCdnStackProps extends StackProps {
  readonly envConfig: GeoTzCdnEnv;
}

export class GeoTzCdnStack extends Stack {
  constructor(scope: Construct, id: string, props: GeoTzCdnStackProps) {
    super(scope, id, props);

    new GeoTzCdn(this, "GeoTzCdn", { env: props.envConfig });

    Tags.of(this).add("project", "geospoof");
    Tags.of(this).add("component", "geo-tz-cdn");
    Tags.of(this).add("env", props.envConfig.name);
  }
}
