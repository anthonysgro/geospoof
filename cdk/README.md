# GeoSpoof CDK

Infrastructure-as-code for GeoSpoof's AWS footprint. A single stack per
environment (`GeoSpoofGeoTzCdn-<env>`) provisions:

- **geo-tz boundary-data CDN** — a private S3 bucket fronted by CloudFront
  (OAC), serving timezone data at `cdn.geospoof.com/geo-tz/<version>/` for the
  extension. Includes a 5xx alarm and a monthly cost budget.
- **GeoSpoof GPS downloads** (prod only) — reuses the same bucket + distribution
  to serve the signed, notarized macOS DMG under `cdn.geospoof.com/gps/`,
  published by the private `geospoof-gps` repo's CI via GitHub OIDC (no stored
  AWS keys). See [GPS DMG publishing](#gps-dmg-publishing) below.

## Layout

| Path                              | What                                              |
| --------------------------------- | ------------------------------------------------- |
| `lib/app.ts`                      | CDK app entry; instantiates the stack per env     |
| `lib/config/app.ts`               | Per-env config (accounts, domain, GPS release)    |
| `lib/stacks/geo-tz-cdn-stack.ts`  | The stack                                         |
| `lib/constructs/geo-tz-cdn.ts`    | S3 + CloudFront + monitoring for the geo-tz data  |
| `lib/constructs/gps-downloads.ts` | OIDC role letting geospoof-gps CI publish the DMG |
| `test/`                           | Vitest unit/assertion tests                       |

## Prerequisites

- **Node.js 18+** and npm
- **AWS CLI v2** (`aws --version`) — needed for SSO login and querying envs
- CDK is pinned as a dev dependency (`aws-cdk`), so use `npx cdk` or the npm
  scripts; no global install required.

```sh
npm install
```

## AWS access (SSO)

Access is via AWS IAM Identity Center (SSO). Deploys and queries run under two
named profiles — `geospoof-dev` and `geospoof-prod` — that the npm scripts
already reference.

### 1. Configure the profiles (one time)

Add these to `~/.aws/config` (fill in the two placeholders from your Identity
Center portal — the start URL and the SSO region; the role name is whatever
permission set you're granted, e.g. `AdministratorAccess`):

```ini
[sso-session geospoof]
sso_start_url = https://<your-portal>.awsapps.com/start
sso_region = <your-sso-region>        # e.g. us-east-1
sso_registration_scopes = sso:account:access

[profile geospoof-dev]
sso_session = geospoof
sso_account_id = 898565151814
sso_role_name = <YourPermissionSet>
region = us-east-1
output = json

[profile geospoof-prod]
sso_session = geospoof
sso_account_id = 682844365870
sso_role_name = <YourPermissionSet>
region = us-east-1
output = json
```

Alternatively run `aws configure sso` and follow the prompts (name the profiles
`geospoof-dev` / `geospoof-prod`).

### 2. Log in (per session — SSO tokens expire)

```sh
aws sso login --profile geospoof-prod   # or geospoof-dev
```

### 3. Verify you're pointed at the right account

```sh
aws sts get-caller-identity --profile geospoof-prod
# Account should be 682844365870 (prod) / 898565151814 (dev)
```

## Environments

| Env  | Account        | Profile         | Region      | Domain                 |
| ---- | -------------- | --------------- | ----------- | ---------------------- |
| dev  | `898565151814` | `geospoof-dev`  | `us-east-1` | `cdn-dev.geospoof.com` |
| prod | `682844365870` | `geospoof-prod` | `us-east-1` | `cdn.geospoof.com`     |

The environment is selected with `-c env=dev|prod` (the npm scripts pass this).
Each env's account is pinned, so a deploy only succeeds against the matching
account/profile.

## Common commands

Build / quality (what `build:full` chains before every deploy):

```sh
npm run build          # tsc compile
npm run test           # vitest
npm run lint           # eslint
npm run format:check   # prettier --check   (npm run format to fix)
```

Preview + deploy (these wrap `--context env` and `--profile` for you):

```sh
# Always log in first:
aws sso login --profile geospoof-dev      # or geospoof-prod

npm run diff:dev       # cdk diff  against dev
npm run deploy:dev     # build:full + cdk deploy --all (dev)

npm run diff:prod      # cdk diff  against prod
npm run deploy:prod    # build:full + cdk deploy --all (prod)
```

Running the CDK CLI directly (equivalent to the scripts, handy for one-offs):

```sh
npx cdk synth  --context env=prod --profile geospoof-prod
npx cdk diff   --all --context env=prod --profile geospoof-prod
npx cdk deploy --all --context env=prod --profile geospoof-prod
```

## Querying the deployed environments

Read stack outputs (role ARN, bucket, distribution id, data version, base URL):

```sh
aws cloudformation describe-stacks \
  --stack-name GeoSpoofGeoTzCdn-prod \
  --profile geospoof-prod \
  --query "Stacks[0].Outputs" --output table
```

Inspect the CDN bucket and objects:

```sh
# Bucket name comes from the BucketName / GpsCdnBucket output above.
aws s3 ls "s3://<bucket>/gps/"            --profile geospoof-prod
aws s3 ls "s3://<bucket>/geo-tz/"         --profile geospoof-prod
```

List CloudFront distributions / check invalidations:

```sh
aws cloudfront list-distributions \
  --profile geospoof-prod \
  --query "DistributionList.Items[].{Id:Id,Domain:DomainName,Aliases:Aliases.Items}" \
  --output table
```

## Configuration

- **Alarm + budget email** is kept out of the repo. Set it via env var (or a
  gitignored `cdk/.env`): `GEOSPOOF_ALARM_EMAIL_PROD` / `GEOSPOOF_ALARM_EMAIL_DEV`
  (or the shared `GEOSPOOF_ALARM_EMAIL`). Without it, the alarm topic is created
  with no subscriber and the budget is skipped. See `.env.example`.
- **Custom-domain certificates** are ACM certs in `us-east-1`, created and
  DNS-validated out of band (DNS lives at Namecheap, not Route 53) and imported
  by ARN in `lib/config/app.ts`.

## GPS DMG publishing

Prod serves the GeoSpoof GPS DMG from `cdn.geospoof.com/gps/`. The private
`geospoof-gps` repo's release workflow uploads it using GitHub OIDC against an
IAM role this stack creates — no long-lived AWS keys.

To wire it up after a prod deploy:

1. `npm run deploy:prod` and note these stack outputs:
   - `GpsDownloadsGpsPublishRoleArn`
   - `GpsDownloadsGpsCdnBucket`
   - `GpsDownloadsGpsCdnDistributionId`
2. In the **geospoof-gps** repo → Settings → Secrets and variables → Actions →
   **Variables**, set:
   - `GPS_PUBLISH_ROLE_ARN` = the role ARN
   - `GPS_CDN_BUCKET` = the bucket name
   - `GPS_CDN_DISTRIBUTION_ID` = the distribution id
3. Cut a GPS release; the workflow publishes `GeoSpoof-GPS-v<version>.dmg`,
   `latest.dmg`, and `latest.json`, then invalidates the moving pointers.

> **OIDC provider gotcha:** an AWS account may hold only ONE GitHub Actions OIDC
> provider (`token.actions.githubusercontent.com`). If the prod account already
> has one, importing it — not creating a second — is required: set
> `gpsRelease.oidcProviderArn` in `lib/config/app.ts` to the existing provider's
> ARN and redeploy.

## First-time account bootstrap

Each account/region must be CDK-bootstrapped once before the first deploy:

```sh
aws sso login --profile geospoof-prod
npx cdk bootstrap aws://682844365870/us-east-1 --profile geospoof-prod
# dev: aws://898565151814/us-east-1 --profile geospoof-dev
```

## Notes

- **CloudFront access logging is intentionally OFF** — it records client IPs,
  which conflicts with a location-privacy product. Aggregate CloudWatch metrics
  carry no PII.
- The prod data bucket is **retained** on stack delete (dev is destroyed +
  auto-emptied), so a `cdk destroy` in prod won't nuke served data.
