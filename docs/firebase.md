# Firebase setup and delivery

M4 supplies the account UI, Firebase SDK integration, Security Rules, trusted role
checks, and reproducible emulator tests. A real Firebase project and deployment
have not been supplied by this repository. Local tests do not establish live service
access, billing readiness, Google OAuth configuration, or production deployment.

## Local validation

Use Node 24, Java 21, Python 3.12+ and uv. `npm ci` and
`uv sync --project backend --frozen` install locked dependencies.

`npm run test:firebase` starts the real Auth, Firestore and Storage emulators, runs
Rules tests, runs API token/role/revocation/readiness tests, and runs a Playwright
account round trip using fresh browser contexts. It shuts down only its own services.
The browser test completes a real guided rehearsal and verifies that progress and
an uploaded GPX flight can be retrieved after a new sign-in. Tests also reject
cross-user reads/writes, unsigned access, client role escalation, invalid scores,
foreign Storage paths, and unsupported upload types.

For the managed cloud environment, writable cache settings may be needed:

```sh
FIREBASE_EMULATORS_PATH=/workspace/.cache/firebase/emulators \
XDG_CONFIG_HOME=/workspace/.config NO_UPDATE_NOTIFIER=1 \
PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH=/usr/bin/chromium \
UV_CACHE_DIR=/workspace/.uv-cache npm run test:firebase
```

Emulator artifacts are downloaded with Firebase CLI checksum verification from
`storage.googleapis.com`. Keep TLS and artifact verification enabled. The demo
project is `demo-sky-rehearsal`, not a live project. Do not run destructive emulator
commands against a real project. The demo web configuration is accepted only in
Vite development mode; the backend separately rejects emulator configuration outside
explicit demo development mode.

## Connect an existing project

1. Supply the real Firebase project ID. In Firebase, enable Google and email/password
   Authentication, create Firestore in Native mode, and enable Cloud Storage. Review
   regional placement and billing requirements before provisioning.
2. Register a web app and put its public config into environment settings using the
   names in `.env.firebase.example`. These identify the project; private Admin SDK
   credentials never belong in Vite variables, source, or chat. For local work, copy
   the example to an ignored `.env.local`. Set `VITE_FIREBASE_EMULATORS=false` for
   real service access.
3. Add actual application domains to Firebase Auth's authorized domains. Enable
   email-enumeration protection and configure password policy/reset email settings.
   Production Google sign-in requires project-specific OAuth configuration.
4. After emulator tests pass, deploy rules/indexes with the authenticated Firebase
   CLI, targeting the explicit real project:
   `npx firebase deploy --project YOUR_PROJECT --only firestore:rules,firestore:indexes,storage`.
   Keep rules private; never switch them to public test mode. Supply project ID and
   access through environment settings before attempting deployment.
5. Build the frontend with its public web configuration. Firebase Hosting deployment
   uses `dist/` and `firebase.json`. Existing GitHub Pages remains a guest-compatible
   fallback and is not automatically migrated or published by an agent commit.
6. The optional API can run on Cloud Run using `backend/Dockerfile` (build context
   `backend/`). Set `APP_ENV=production`, `FIREBASE_PROJECT_ID`, and a scoped workload
   service identity with needed Firestore and Firebase Authentication permissions.
   Do not set emulator variables. Route `/api/**` to the chosen Cloud Run service in
   Hosting if exposing the API through that origin. No service name/region is assumed
   or deployed by this configuration.

Network access for a real app includes its authorized Firebase Auth domain,
`accounts.google.com`, `identitytoolkit.googleapis.com`, `securetoken.googleapis.com`,
`firestore.googleapis.com`, and `firebasestorage.googleapis.com`. Admin SDK token
verification can also need `www.googleapis.com` / `www.gstatic.com` for Google's
signing certificates. Add only the project-specific destinations needed to environment
settings, preserving existing allowlist entries. No private key should be requested
merely because a token variable is absent: prefer scoped workload identity.

## Roles and data model

Firebase Auth stores the user identity. Public registration always yields a student.
A trusted operator with Firebase Auth admin credentials can run:

```sh
uv run --project backend python backend/scripts/set_role.py YOUR_PROJECT USER_UID instructor
```

Supported roles are `student`, `instructor`, `school_admin`, and `platform_admin`.
Role assignment is not exposed to clients. Users sign in again to refresh claims.
The CLI preserves unrelated claims and performs a real privileged operation; run it
only for the reviewed user/project. The platform-admin API check is verified on the
server. School membership, instructor assignments, and delegated access are M9 work;
no role currently gives blanket access to another person's recordings.

- Auth UID owns `users/{uid}/sessions/{sessionId}` (immutable completed session, quiz
  answers and score included), `profiles/{profileId}`, and `tracks/{trackId}` metadata.
- Recording files use `users/{uid}/tracks/{trackId}.json` in Storage. MIME type is JSON,
  maximum size is under 15 MB, and path ownership is enforced independently of metadata.
- Track files contain the parsed recording rows and are revalidated before replay.
  A failed metadata write can leave an owned orphaned file; retrying saves another ID.
  Retention/garbage collection and deletion UI belong to the later operations work.
- Guest progress is never automatically uploaded. Signed-in progress stays in memory
  and syncs remotely; failures show an explicit retry/export message. Sign-out waits
  for pending saves so unsaved work is not silently discarded.
- Completed sessions merge by independent IDs. Imported profiles with the same ID
  use the latest write. Sign-in/Sync loads the latest 300 sessions and profiles;
  this is not a real-time collaborative editor. Cloud scores remain client-submitted
  rehearsal results until authoritative deterministic assessment is introduced in M6.
- Airport and aircraft source data remain version-controlled packages; instructor
  scenario/assignment authoring and an editable cloud catalog are later milestones.

## Current limits

Firebase email/password and data flows are validated locally with emulators. Real
Google OAuth sign-in, reset-email delivery, real-project Rules publication, Hosting,
Cloud Run, and the Docker image require separate real-service/deployment validation.
