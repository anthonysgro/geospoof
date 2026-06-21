#!/usr/bin/env node
import * as cdk from "aws-cdk-lib";
import { environments, EnvName } from "./config/app";
import { GeoTzCdnStack } from "./stacks/geo-tz-cdn-stack";

const app = new cdk.App();

// Select the environment via `-c env=dev|prod` (what deploy:dev / deploy:prod
// pass). With no env context we instantiate every environment, which keeps a
// plain `cdk synth` / CI diff working. Each env's account is pinned, so a
// `--all` deploy under a single profile only succeeds for the matching env.
const requested = app.node.tryGetContext("env") as string | undefined;

const selected: EnvName[] = requested
  ? [requested as EnvName]
  : (Object.keys(environments) as EnvName[]);

for (const name of selected) {
  const envConfig = environments[name];
  if (!envConfig) {
    throw new Error(
      `Unknown env "${name}" (from -c env=...). Valid values: ${Object.keys(environments).join(", ")}`
    );
  }
  new GeoTzCdnStack(app, `GeoSpoofGeoTzCdn-${envConfig.name}`, {
    envConfig,
    env: { account: envConfig.account, region: envConfig.region },
    description: `GeoSpoof geo-tz boundary data CDN (${envConfig.name})`,
  });
}

app.synth();
