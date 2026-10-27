# Google Cloud release and operations (Milestone 10)

This milestone supplies launch engineering, not evidence of a production rollout
or successful pilot beta. The managed environment has no configured real Google
project/identity. No cloud resources were deployed, Terraform applied, backup
restored or participant contacted. See [beta protocol](beta.md) for those remaining
launch activities and [airport packages](airports.md) for data requirements.

## Release workflow

`.github/workflows/google-cloud.yml` is manual (`workflow_dispatch`), runs the test
workflow first and targets a selected GitHub environment. Configure environment
protection/required reviewers in GitHub before production use. Pushing a milestone
branch does not invoke this release workflow. Existing guest-compatible GitHub
Pages deployment remains separate.

Configure per-environment repository variables:

- `GCP_PROJECT_ID`, `GCP_REGION`, `CLOUD_RUN_SERVICE`, `ARTIFACT_REPOSITORY`;
- `WORKLOAD_IDENTITY_PROVIDER`, `DEPLOY_SERVICE_ACCOUNT`, `BUILD_SERVICE_ACCOUNT`,
  `RUNTIME_SERVICE_ACCOUNT` (dedicated identities, not service-account key files);
- public Firebase web configuration: `FIREBASE_API_KEY`, `FIREBASE_AUTH_DOMAIN`,
  `FIREBASE_APP_ID`, `FIREBASE_STORAGE_BUCKET`;
- optional `GEMINI_MODEL`, after enabling Vertex AI and its billing/access.

Provision the Firebase Auth providers/authorized domains, Firestore database,
Storage bucket, Artifact Registry repository, Workload Identity Federation trust
and needed APIs first. Restrict the OIDC trust to the intended repository and
protected deployment environment. The deploy identity needs scoped build submission,
Artifact Registry image inspection, Cloud Run deploy/tagging, Firebase Hosting/
Rules/index deployment and service-account impersonation permissions. The build
identity needs source-bucket access, Artifact Registry write and Cloud Logging
write. The runtime identity needs Firebase Auth verification/revocation checks,
Firestore data access, bucket object read for explicitly shared recordings, and
optional Vertex AI/Speech invocation permissions. Review exact IAM against your
project; avoid broad default service identities. No emulator variables belong in
production.

The workflow builds from the repository root using `backend/Dockerfile`, resolves
the image digest, deploys the non-root API to Cloud Run, generates a reviewed-shape
Hosting configuration and publishes Rules/indexes/Hosting. Cloud Run is publicly
reachable for Firebase Hosting; private application endpoints independently verify
Firebase bearer tokens. Health, release metadata and catalog-restricted weather
are intentionally public. Current resource defaults are one CPU, 1 GiB memory,
20 concurrent requests and at most three instances. They bound initial resources;
they are not a measured capacity/SLO claim. Tune after load testing and billing review.

`scripts/hosting-config.mjs SERVICE REGION` generates ignored `firebase.release.json`
with `/api/**` before the SPA fallback and a pinned Cloud Run tag. The workflow's
API image includes the same versioned airport catalog as the static app. Firebase
headers include anti-framing, nosniff, referrer/permissions policy and static asset
cache rules. API responses are `no-store`. TLS and ingress protections are supplied
by Google Cloud/Firebase, not an embedded web server certificate.

The Docker build context is restricted by `.dockerignore`. In a managed environment
with a session proxy, pass the public combined CA bundle as BuildKit secret
`proxy_ca`; pip/uv use it only during dependency installation. It is not copied into
image layers. Ordinary Cloud Build uses normal CA roots. Docker smoke checks should
use a non-root container, read-only filesystem, writable `/tmp`, dropped Linux
capabilities and no-new-privileges. No Google identity is needed for health/catalog
smoke checks.

## Runtime protections and observability

- Request bodies are capped at 2 MiB, including chunked POST/PUT/PATCH input.
- School requests share a transactional per-UID limit of 60 per UTC minute across
  instances. Paid coaching/speech retain the stricter six-per-minute quota. Quota
  failures deny work. `_apiQuota` records have a two-day TTL field and no client
  Rules access; deploy the field override to enable eventual Firestore cleanup.
- School dashboard pages return at most 50 records. Roster queries filter active
  students and the instructor link before reading; attempt pages are scoped to one
  authorized student. Cursor manipulation never grants broader access. Load all
  relevant pages before interpreting full-history recall statistics. Pagination is
  not a transactionally frozen snapshot; concurrent changes may require refresh.
- Request IDs, route templates, status and duration are JSON operational logs.
  Exceptions log type/request ID and return a sanitized failure. Application logs
  omit bearer tokens, request bodies, UID/path parameters and raw tracks. Google
  infrastructure access logs have their own fields, access controls and retention;
  do not assume all provider logs are identity-free.
- Usage metrics are optional and off by default per signed-in session. An explicit
  account checkbox permits airport, mode and recall score only; sign-out/account
  changes reset consent. Metrics are untrusted self-study analytics, not grades.
  A local aggregate JSON export contains no learner name, account ID or raw track.

`deploy/operations.tf` supplies a daily Firestore backup schedule (seven-day
retention), HTTPS health checks, a log-based API error metric and alert policies for
sustained errors/uptime failures. Terraform syntax and provider schema can be checked
without deploying:

```sh
terraform -chdir=deploy init -backend=false -input=false
terraform -chdir=deploy validate
```

Use the supplied example variables only as a template. Select real notification
channels, confirm alert delivery and configure protected remote Terraform state
before team use. Inspect/import any existing backup schedule before applying, so
you do not create conflicting policies. `terraform validate` does not establish
resource availability, IAM, billing or notification delivery.

Enable Firestore point-in-time recovery and Cloud Storage object versioning under
your reviewed retention/cost policy. For example, after selecting the real project
and bucket, the operator can review `gcloud firestore databases update --database
'(default)' --enable-pitr --project PROJECT` and `gcloud storage buckets update
gs://BUCKET --versioning`. They have not been run here. Set lifecycle limits for
noncurrent objects deliberately; this repository does not silently delete data.
Firestore backups do not back up Storage objects or Firebase Auth users. Establish
separate Auth configuration/export and Storage recovery procedures.

Before admitting beta users, restore a backup into an isolated test database,
recover a versioned recording, verify Rules/IAM and record restore times and data
integrity. Choose a recovery point/time target with the school. Backup configuration
alone is not a successful recovery drill.

## Release checks and rollback

Run unit/API tests, emulator Rules and two-account school tests, browser/phone tests,
format/lint/build, airport checks and Docker smoke checks. CI includes Docker build
and Terraform validation. Staging must additionally verify real OAuth/reset-email,
ADC/IAM, Rules/index publication, Hosting rewrites, current METAR availability,
Vertex/Speech if enabled, alerts, backups/restore and tablet browsers.

After release, compare `/api/version` with the expected Git SHA and package revisions,
then smoke-test health, sign-in, own progress, a school assignment and shared-track
review. Keep the previous image digest and Hosting release. To roll back, restore
the matching API revision and Hosting release as a pair; check package compatibility.
Rules/database changes require their own compatibility review. This workflow is
not an atomic cross-service deployment, and no rollback or migration is automatic.
Existing Cesium bundles remain large; tablet/GPU capability, cold starts, concurrent
load, rate limits, billing alerts and performance need measurements on target devices.
