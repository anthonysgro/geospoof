import { Construct } from "constructs";
import { Annotations, CfnOutput, Duration, RemovalPolicy } from "aws-cdk-lib";
import * as s3 from "aws-cdk-lib/aws-s3";
import * as s3deploy from "aws-cdk-lib/aws-s3-deployment";
import * as cloudfront from "aws-cdk-lib/aws-cloudfront";
import * as origins from "aws-cdk-lib/aws-cloudfront-origins";
import * as acm from "aws-cdk-lib/aws-certificatemanager";
import * as route53 from "aws-cdk-lib/aws-route53";
import * as targets from "aws-cdk-lib/aws-route53-targets";
import * as cloudwatch from "aws-cdk-lib/aws-cloudwatch";
import * as cwActions from "aws-cdk-lib/aws-cloudwatch-actions";
import * as sns from "aws-cdk-lib/aws-sns";
import * as subscriptions from "aws-cdk-lib/aws-sns-subscriptions";
import * as budgets from "aws-cdk-lib/aws-budgets";
import { GeoTzCdnEnv } from "../config/app";
import { resolveGeoTzData } from "../util/geo-tz-data";

export interface GeoTzCdnProps {
  readonly env: GeoTzCdnEnv;
}

/**
 * Hosts the geo-tz boundary data on a private S3 bucket fronted by CloudFront.
 *
 * - The bucket is private; CloudFront reads it via Origin Access Control (OAC).
 * - CloudFront is the global layer (edge caching), so a single-region origin
 *   serves users worldwide.
 * - Data is uploaded under a version-scoped prefix (geo-tz/<version>/) and
 *   served `immutable` for a year, matching the extension's caching contract.
 * - CORS is emitted by CloudFront so the extension's cross-origin background
 *   fetch (and single-range byte requests) succeed.
 */
export class GeoTzCdn extends Construct {
  readonly bucket: s3.Bucket;
  readonly distribution: cloudfront.Distribution;
  readonly dataVersion: string;

  constructor(scope: Construct, id: string, props: GeoTzCdnProps) {
    super(scope, id);
    const { env } = props;
    const data = resolveGeoTzData();
    this.dataVersion = data.version;

    // Private origin bucket — never public; CloudFront reads via OAC.
    this.bucket = new s3.Bucket(this, "DataBucket", {
      encryption: s3.BucketEncryption.S3_MANAGED,
      blockPublicAccess: s3.BlockPublicAccess.BLOCK_ALL,
      enforceSSL: true,
      removalPolicy: env.retainBucket ? RemovalPolicy.RETAIN : RemovalPolicy.DESTROY,
      autoDeleteObjects: !env.retainBucket,
    });

    // Resolve a cert + domain only if a custom domain is configured AND we have
    // a way to obtain a cert. Otherwise we serve on the CloudFront domain.
    let certificate: acm.ICertificate | undefined;
    let domainNames: string[] | undefined;
    let managedZone: route53.IHostedZone | undefined;

    const cd = env.customDomain;
    if (cd) {
      if (cd.certificateArn) {
        certificate = acm.Certificate.fromCertificateArn(this, "Cert", cd.certificateArn);
        domainNames = [cd.domainName];
      } else if (cd.hostedZone) {
        managedZone = route53.HostedZone.fromHostedZoneAttributes(this, "Zone", {
          hostedZoneId: cd.hostedZone.hostedZoneId,
          zoneName: cd.hostedZone.zoneName,
        });
        certificate = new acm.Certificate(this, "Cert", {
          domainName: cd.domainName,
          validation: acm.CertificateValidation.fromDns(managedZone),
        });
        domainNames = [cd.domainName];
      } else {
        Annotations.of(this).addWarning(
          `customDomain.domainName "${cd.domainName}" is set but neither ` +
            "certificateArn nor hostedZone was provided — deploying on the " +
            "CloudFront domain only. Supply one to enable the custom domain."
        );
      }
    }

    // CORS for the extension's cross-origin background fetch. Single-range
    // requests (bytes=a-b) are CORS-safelisted so no preflight fires, but the
    // response still needs Access-Control-Allow-Origin and the range/length
    // headers exposed. originOverride so these always win.
    //
    // Plus defense-in-depth security headers: HSTS (everything already rides
    // HTTPS via redirect-to-https; scoped to this host, no includeSubdomains so
    // it can't affect the rest of geospoof.com) and X-Content-Type-Options:
    // nosniff (the .dat is octet-stream; don't let a client MIME-sniff it).
    const responseHeaders = new cloudfront.ResponseHeadersPolicy(this, "Cors", {
      corsBehavior: {
        accessControlAllowOrigins: ["*"],
        accessControlAllowMethods: ["GET", "HEAD", "OPTIONS"],
        accessControlAllowHeaders: ["*"],
        accessControlExposeHeaders: ["*"],
        accessControlAllowCredentials: false,
        accessControlMaxAge: Duration.days(1),
        originOverride: true,
      },
      securityHeadersBehavior: {
        strictTransportSecurity: {
          accessControlMaxAge: Duration.days(365),
          includeSubdomains: false,
          preload: false,
          override: true,
        },
        contentTypeOptions: { override: true }, // X-Content-Type-Options: nosniff
      },
    });

    this.distribution = new cloudfront.Distribution(this, "Distribution", {
      comment: `geospoof geo-tz data (${env.name})`,
      defaultBehavior: {
        origin: origins.S3BucketOrigin.withOriginAccessControl(this.bucket),
        viewerProtocolPolicy: cloudfront.ViewerProtocolPolicy.REDIRECT_TO_HTTPS,
        allowedMethods: cloudfront.AllowedMethods.ALLOW_GET_HEAD_OPTIONS,
        cachedMethods: cloudfront.CachedMethods.CACHE_GET_HEAD_OPTIONS,
        // CACHING_OPTIMIZED honors Range requests and caches byte ranges, which
        // is exactly how browser-geo-tz reads the .dat.
        cachePolicy: cloudfront.CachePolicy.CACHING_OPTIMIZED,
        responseHeadersPolicy: responseHeaders,
        // Compresses the JSON index on the fly. The .dat is octet-stream and
        // served via identity range requests, so it is not compressed.
        compress: true,
      },
      priceClass: env.priceClassAll
        ? cloudfront.PriceClass.PRICE_CLASS_ALL
        : cloudfront.PriceClass.PRICE_CLASS_100,
      domainNames,
      certificate,
      httpVersion: cloudfront.HttpVersion.HTTP2_AND_3,
      enableIpv6: true,
    });

    // Alias records only when we manage the zone in Route 53. For Vercel-hosted
    // DNS, add a CNAME (cdn.geospoof.com -> <distribution domain>) at Vercel.
    if (managedZone && cd) {
      const aliasTarget = route53.RecordTarget.fromAlias(
        new targets.CloudFrontTarget(this.distribution)
      );
      new route53.ARecord(this, "AliasA", {
        zone: managedZone,
        recordName: cd.domainName,
        target: aliasTarget,
      });
      new route53.AaaaRecord(this, "AliasAAAA", {
        zone: managedZone,
        recordName: cd.domainName,
        target: aliasTarget,
      });
    }

    // Upload ONLY the full-dataset pair, under the version-scoped prefix.
    // destinationKeyPrefix = geo-tz/<version> means each version lives at its
    // own immutable path: bumping the version deploys a NEW prefix and leaves
    // old ones untouched (prune is scoped to this prefix), so already-installed
    // clients pinned to an older version keep working.
    new s3deploy.BucketDeployment(this, "DeployData", {
      sources: [
        s3deploy.Source.asset(data.dataDir, {
          // Keep the asset small: ship only the two files we serve.
          exclude: ["*", `!${data.files[0]}`, `!${data.files[1]}`],
        }),
      ],
      destinationBucket: this.bucket,
      destinationKeyPrefix: `geo-tz/${data.version}`,
      // Authoritative sync filter — only these two objects land in the bucket,
      // even if the asset ever picks up extra files.
      exclude: ["*"],
      include: [data.files[0], data.files[1]],
      cacheControl: [s3deploy.CacheControl.fromString("public, max-age=31536000, immutable")],
      // Never prune other versions' prefixes.
      prune: false,
      // The .dat is ~29 MB; give the deployment Lambda headroom.
      memoryLimit: 512,
    });

    const baseHost = domainNames?.[0] ?? this.distribution.distributionDomainName;
    new CfnOutput(this, "DistributionDomainName", {
      value: this.distribution.distributionDomainName,
    });
    new CfnOutput(this, "DistributionId", { value: this.distribution.distributionId });
    new CfnOutput(this, "BucketName", { value: this.bucket.bucketName });
    new CfnOutput(this, "DataVersion", { value: data.version });
    new CfnOutput(this, "GeoTzBaseUrl", {
      value: `https://${baseHost}/geo-tz/${data.version}`,
      description: "Set the extension's GEO_TZ_BASE to this value.",
    });

    this.addMonitoring(env);
  }

  /**
   * Alarms + cost guardrails.
   *
   * - A 5xx error-rate alarm on the distribution. This is a *correctness*
   *   signal, not just ops: if the data fails to serve, manual-location
   *   timezone lookups fall back to null and the extension leaks the user's
   *   REAL zone (see docs/TIMEZONE_GEO_DATA.md).
   * - A monthly cost budget as cheap insurance against a surprise bill or
   *   unexpected traffic.
   *
   * Notifications go to env.alarmEmail (from GEOSPOOF_ALARM_EMAIL). We do NOT
   * enable CloudFront access logging — it records client IPs, which is at odds
   * with a location-privacy product; aggregate metrics carry no PII.
   */
  private addMonitoring(env: GeoTzCdnEnv): void {
    const alarmTopic = new sns.Topic(this, "AlarmTopic", {
      displayName: `geospoof geo-tz CDN alarms (${env.name})`,
    });
    if (env.alarmEmail) {
      alarmTopic.addSubscription(new subscriptions.EmailSubscription(env.alarmEmail));
    }

    // CloudFront metrics live in the AWS/CloudFront namespace with the special
    // Region=Global dimension and are only published to us-east-1 (where this
    // stack already runs).
    const fivexxRate = new cloudwatch.Metric({
      namespace: "AWS/CloudFront",
      metricName: "5xxErrorRate",
      dimensionsMap: {
        DistributionId: this.distribution.distributionId,
        Region: "Global",
      },
      statistic: "Average",
      period: Duration.minutes(5),
    });

    const fivexxAlarm = new cloudwatch.Alarm(this, "Distribution5xxAlarm", {
      alarmName: `geospoof-geotz-${env.name}-5xx`,
      alarmDescription:
        "CloudFront 5xx error rate is elevated — the geo-tz data may be failing to serve, " +
        "which makes manual-location timezone lookups fall back to null and leak the user's real zone.",
      metric: fivexxRate,
      threshold: 5, // percent of requests
      evaluationPeriods: 2,
      datapointsToAlarm: 2, // ~10 min sustained, to ride out single blips on low traffic
      comparisonOperator: cloudwatch.ComparisonOperator.GREATER_THAN_THRESHOLD,
      // No traffic => no datapoints => healthy, not alarming.
      treatMissingData: cloudwatch.TreatMissingData.NOT_BREACHING,
    });
    fivexxAlarm.addAlarmAction(new cwActions.SnsAction(alarmTopic));

    // A budget needs at least one subscriber, so only create it when we have an
    // email. These accounts are single-purpose, so an account-wide cost budget
    // effectively tracks this CDN.
    if (env.alarmEmail && env.monthlyBudgetUsd) {
      const subscriber = { subscriptionType: "EMAIL", address: env.alarmEmail };
      new budgets.CfnBudget(this, "MonthlyBudget", {
        budget: {
          budgetName: `geospoof-geotz-${env.name}-monthly`,
          budgetType: "COST",
          timeUnit: "MONTHLY",
          budgetLimit: { amount: env.monthlyBudgetUsd, unit: "USD" },
        },
        notificationsWithSubscribers: [
          {
            // Warn early: 80% of the limit already spent this month.
            notification: {
              notificationType: "ACTUAL",
              comparisonOperator: "GREATER_THAN",
              threshold: 80,
              thresholdType: "PERCENTAGE",
            },
            subscribers: [subscriber],
          },
          {
            // Warn when the month is forecast to blow the limit.
            notification: {
              notificationType: "FORECASTED",
              comparisonOperator: "GREATER_THAN",
              threshold: 100,
              thresholdType: "PERCENTAGE",
            },
            subscribers: [subscriber],
          },
        ],
      });
    }
  }
}
