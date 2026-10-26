# Firebase and Google Cloud direction

Prioritize managed Google services and official Google APIs. This supersedes the
original AWS deployment and PostgreSQL account-storage plan for future milestones.
Keep the current React/TypeScript interface, Cesium renderer, flight engine, and
FastAPI API; changing cloud providers does not require rewriting them.

| Need                                                   | Preferred service                                       |
| ------------------------------------------------------ | ------------------------------------------------------- |
| Student/instructor sign-in                             | Firebase Authentication                                 |
| Users, organizations, assignments, sessions and scores | Cloud Firestore                                         |
| Uploaded GPX/CSV files and larger normalized tracks    | Cloud Storage for Firebase                              |
| Built frontend and HTTPS delivery                      | Firebase Hosting                                        |
| Trusted FastAPI operations and deterministic scoring   | Google Cloud Run                                        |
| Credentials for trusted services                       | Secret Manager and workload service accounts            |
| Operational logs and errors                            | Cloud Logging and Error Reporting                       |
| Speech transcription / generated speech                | Google Cloud Speech-to-Text / Text-to-Speech            |
| AI coaching and debrief explanations                   | Gemini through Vertex AI                                |
| Place search and optional Google 3D imagery            | Google Maps Platform, subject to coverage and licensing |
| Local account/data/storage development                 | Firebase Emulator Suite                                 |

Firestore documents hold searchable session metadata; large flight samples belong
in Storage, with ownership and object references in Firestore. Keep roles and school
membership server-controlled. Enforce access in Security Rules and in backend token
and authorization checks. Admin SDK access bypasses Rules, so every backend operation
must check the authenticated user and organization. Public sign-up must never grant
instructor, school-admin, or platform-admin privileges. Test cross-user and cross-school
access denial in emulators before enabling cloud access.

Cloud Run verifies Firebase ID tokens for trusted endpoints and uses a scoped service
identity. Use emulator configuration only for local development/tests; fail closed in
production. Keep private API credentials on the server. Firebase web configuration
identifies a project and does not replace authorization rules.

Google 3D integration must preserve required attribution and respect imagery/tiles
terms. Existing Cesium ion Google 3D beta is not a fully validated Google Maps Platform
integration. Retain the current globe/diagram fallback while evaluating it.

Google does not supply every aviation source. Continue using authoritative METAR,
airport, and instructor-reviewed aircraft/procedure data where no equivalent Google
service exists. AI explains structured observations; deterministic code computes
flight behavior and scores.

M4 implements Auth, Firestore, Storage, emulator-backed tests, and matching readiness
checks; see [Firebase setup](firebase.md). Later milestones add the Google APIs they actually need. Cloud publication
requires a real project, enabled APIs, billing where required, and appropriately
scoped identity/access. Do not invent project identifiers, credentials, or deployment
results. No production Firebase or Google Cloud resource is provisioned by local emulator tests.
