# Adaptive instructor (Milestone 7)

Open **Adaptive instructor → Study hint / next hint** during Guided, Practice or
Free Explore. Reading a hint pauses the rehearsal. Hints count toward help used;
they do not change deterministic flight scores. Each checkpoint starts with a
recall question, then a broad cue, a narrower cue, and the reference note.
Intermediate difficulty stops at the narrower cue; Advanced stays at recall.
Examiner difficulty and every assessment mode disable this panel. Existing
assessment hints retain their Milestone 5 policy. After completion, debriefs can
request a Gemini explanation of the original results.

The weakest recall competency is selected by pooled correct/total answers in the
last 20 sessions on the same route. No history defaults to general recall. Ties
follow stored competency order. This is a small deterministic teaching policy,
not a model-generated diagnosis. Simulated instruments do not measure pilot skill.

## Gemini on Google Cloud

The app works without AI. Local coaching is labelled **Local coaching**. Clicking
**Ask Gemini to explain** explicitly sends a bounded teaching summary to the
same-origin FastAPI `/api/instructor` endpoint with a Firebase ID token. A successful
response is labelled **Gemini / Vertex AI**. Missing configuration, sign-in, quota,
timeout, blocked/empty output or model failure leaves local hints and scores intact.

Server configuration (see `.env.example`):

- `FIREBASE_PROJECT_ID`: the real Firebase project used for token verification.
- `GOOGLE_CLOUD_PROJECT`: the Google project billed for Vertex AI.
- `GOOGLE_CLOUD_LOCATION`: `global` by default; choose a supported location matching
  your data-placement requirements and model availability.
- `GEMINI_MODEL`: an explicit supported Gemini model ID, for example
  `gemini-2.5-flash` if available in your project/location.

Enable the Vertex AI API (`aiplatform.googleapis.com`) and billing in the chosen
project. Give the Cloud Run service identity the necessary Vertex AI invocation
permissions (usually Vertex AI User) plus the existing Firebase Auth and Firestore
permissions. Use Application Default Credentials/workload identity; never put model
keys or service-account credentials in Vite, source, uploads or chat. Firebase demo
emulators cannot call live Gemini.

In development Vite already proxies `/api` to port 8000. For Firebase Hosting, add a
project-specific `/api/**` Cloud Run rewrite **before** the SPA fallback in
`firebase.json` after choosing and deploying the actual service/region. GitHub Pages
alone cannot serve the API. No production project, rewrite or deployment is assumed.
Allow the actual Vertex endpoint (`aiplatform.googleapis.com` for global, or the
selected regional endpoint), ADC token endpoint if required, and existing Firebase
API destinations in managed environments. Keep proxy and CA trust configured.

## Boundaries and operation

- The model receives phase, focus, recent route attempt count, hint level and at
  most 12 facts of 500 characters each. Hints send only the detail available at that
  hint level, plus simulated heading error when feasible. Debriefs send deterministic
  metric summaries, criteria, missing-data reasons and study advice. Raw tracks,
  coordinates, reference/profile titles, account names, email and session histories
  are not sent as model fields. Reference notes may contain user-entered text; review
  them before requesting AI help. Attempt count is unknown (`null`) for a saved debrief.
- Responses are plain text displayed via `textContent`. No HTML, tools, physics
  callbacks, score writes or model-chosen endpoints are supported. Server-chosen
  model/project settings cannot be overridden by requests.
- AI may still give incorrect explanations or mishandle instructions embedded in
  reference text. Treat generated prose as optional study help, check it against
  source notes, and never use it for airborne navigation or certification.
- Existing scores and reference-verification limits remain visible. AI text is not
  persisted as assessment evidence. Users can forge their own submitted context;
  this endpoint does not attest client measurements or enforce supervised exams.
- Firebase verifies revoked/disabled users before calls. A Firestore transaction
  limits each UID to six requests per UTC minute across Cloud Run instances; failed
  model calls consume quota too. Quota service failures deny generation. Internal
  `_coachQuota/{uid}` records have no client Rules access. Set project billing
  budgets/operational limits for deployment; per-user limits are not a global budget.
- The SDK has a 15-second request timeout, no automatic retry and bounded output. Browser requests time
  out after 20 seconds. Restart/account/route changes discard stale UI responses.
  A browser abort does not guarantee cancellation of an already-started cloud call.
- No live Vertex call or production deployment was validated in the managed
  environment because no Google project/identity is configured. SDK calls are
  exercised with mocks; local Firebase flows use emulators.

Run `npm test`, `npm run test:e2e`, and
`uv run --project backend --frozen pytest backend/tests` for coaching and API checks.
`npm run test:firebase` additionally checks real local token verification, Rules,
account persistence and the signed-in browser flow.
