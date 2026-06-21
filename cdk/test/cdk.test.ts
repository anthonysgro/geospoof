import { describe, it, expect } from "vitest";
import * as cdk from "aws-cdk-lib";
import { Match, Template } from "aws-cdk-lib/assertions";
import { GeoTzCdnStack } from "../lib/stacks/geo-tz-cdn-stack";
import { environments } from "../lib/config/app";

describe("GeoTzCdnStack (dev)", () => {
  const app = new cdk.App();
  const env = environments.dev;
  const stack = new GeoTzCdnStack(app, "TestStack", {
    envConfig: env,
    env: { account: env.account, region: env.region },
  });
  const template = Template.fromStack(stack);

  it("creates exactly one S3 bucket, private and encrypted", () => {
    template.resourceCountIs("AWS::S3::Bucket", 1);
    template.hasResourceProperties("AWS::S3::Bucket", {
      PublicAccessBlockConfiguration: {
        BlockPublicAcls: true,
        BlockPublicPolicy: true,
        IgnorePublicAcls: true,
        RestrictPublicBuckets: true,
      },
      BucketEncryption: Match.objectLike({
        ServerSideEncryptionConfiguration: Match.anyValue(),
      }),
    });
  });

  it("serves the bucket via CloudFront with the custom domain", () => {
    const customDomain = env.customDomain;
    if (!customDomain?.certificateArn) {
      throw new Error("dev env is expected to have a custom domain with a certificate");
    }
    template.hasResourceProperties("AWS::CloudFront::Distribution", {
      DistributionConfig: Match.objectLike({
        Aliases: [customDomain.domainName],
        ViewerCertificate: Match.objectLike({
          AcmCertificateArn: customDomain.certificateArn,
          SslSupportMethod: "sni-only",
        }),
      }),
    });
  });

  it("reaches the origin with Origin Access Control (not a public bucket)", () => {
    template.resourceCountIs("AWS::CloudFront::OriginAccessControl", 1);
  });

  it("uploads data under a versioned prefix with immutable cache headers", () => {
    template.hasResourceProperties("Custom::CDKBucketDeployment", {
      DestinationBucketKeyPrefix: Match.stringLikeRegexp("^geo-tz/"),
      Prune: false,
      SystemMetadata: Match.objectLike({
        "cache-control": Match.stringLikeRegexp("immutable"),
      }),
    });
  });

  it("emits CORS response headers for the extension's cross-origin fetch", () => {
    template.hasResourceProperties("AWS::CloudFront::ResponseHeadersPolicy", {
      ResponseHeadersPolicyConfig: Match.objectLike({
        CorsConfig: Match.objectLike({
          AccessControlAllowOrigins: { Items: ["*"] },
        }),
        SecurityHeadersConfig: Match.objectLike({
          StrictTransportSecurity: Match.objectLike({ Override: true }),
          ContentTypeOptions: Match.objectLike({ Override: true }),
        }),
      }),
    });
  });

  it("alarms on the distribution's 5xx error rate", () => {
    template.hasResourceProperties("AWS::CloudWatch::Alarm", {
      Namespace: "AWS/CloudFront",
      MetricName: "5xxErrorRate",
      ComparisonOperator: "GreaterThanThreshold",
      TreatMissingData: "notBreaching",
    });
  });

  it("synthesizes the GeoTzBaseUrl output for the extension to consume", () => {
    const outputs = template.findOutputs("*", {});
    const keys = Object.keys(outputs);
    expect(keys.some((k) => k.includes("GeoTzBaseUrl"))).toBe(true);
  });
});
