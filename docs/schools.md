# Instructor and flight-school platform (Milestone 9)

M10 update: scenarios can use installed airport packages and pin their revisions.
Dashboard pages are limited to 50 records per request, with explicit load-more
controls and a selected-student review scope. The original fixed school-size caps
below are superseded; see [release operations](launch.md).

## School workflow

Open **Flight school**, sign in and enter the school ID supplied by your school.
Guest practice continues to work without a backend. Schools use Firestore through
the authenticated FastAPI service; Firebase Rules deny direct client access to all
school documents. Production requires the existing Firebase/Cloud Run setup and
the same-origin `/api/**` Hosting rewrite. A static GitHub Pages site alone cannot
provide this service.

A school administrator enrolls existing accounts by their account IDs, chooses a
school role, and links each student to an instructor. Account IDs are shown in the
account dialog after sign-in. No email invitation or account creation is performed
by the dashboard. An instructor needs both an active school instructor membership
and a trusted global instructor/school-admin/platform-admin token role. School
administrators cannot create global privileges. Initial school/admin enrollment
and global role assignment are trusted operator tasks (below).

Instructors and school administrators can:

1. Create a scenario draft with VOHY runway, aircraft, weather preset, custom steady
   wind, assessment mode, difficulty, recall threshold and notes.
2. Review the displayed draft settings and publish it. Published configurations
   cannot be edited through the API; create a new draft for revisions.
3. Assign a published scenario to a student on their teaching roster. Each assignment
   stores its own configuration snapshot.
4. Review submitted recall scores, deterministic debriefs, measured weak recall
   competencies, first/latest submitted scores and explicitly shared recordings.
5. Save a separate instructor review, including reviewer identity, time and notes.

Students launch an assignment from the dashboard. Launch sets the circuit, aircraft
inputs, weather, wind correction, mode and difficulty as one configuration. Named
aircraft require matching reviewed-input packages; choosing **demo** is explicit.
The existing unverified circuit/physics limitations remain. Changing training
settings or restarting clears assignment eligibility; relaunch from the school
if an assigned attempt needs restarting.

After completing all five checkpoint questions, wait for account saving, reopen
or refresh the school, select that attempt and submit it. No private history is
shared automatically. An optional recording must be selected explicitly before
submission; otherwise only the session/debrief is shared. Submitting the same
attempt twice is rejected. To share a different recording, complete and submit a
new attempt. Failed account saves require Sync/retry before submission.

The server reads the authenticated student's owned session, checks its assignment
ID, completion time, runway, mode, difficulty, wind correction, weather pressure/
temperature and aircraft package, and computes recall from five unique checkpoint
answers. It does not accept a browser-supplied overall score in the submission
request. However, source sessions and answers are still client-computed self-study
evidence. This is **not** proctored assessment or server-attested pilot proficiency.
Meeting a recall threshold never automatically certifies a student; the human review
stays separate. Aircraft physics and flight scoring still do not call AI.

Weak competencies are pooled valid debrief recall groups below 80% across submitted
attempts on the dashboard. First/latest are chronological submitted recall scores,
not a causal improvement claim. Private or unsubmitted flights never enter these
statistics. Missing/unavailable flight measurements retain their original meaning.

## Access and sharing

- Every school request verifies the Firebase token (including disabled/revoked
  accounts), active school membership, global staff role where needed and current
  teaching roster. A platform-admin role alone gives no cross-school access.
- A student sees only their own assignments/submissions. An instructor sees only
  students currently linked to them. A school administrator sees that school's
  roster and submitted work. Reassignment moves review access to the new instructor;
  inactive students are excluded until re-enrolled.
- Revocation denies subsequent API calls. Already downloaded information cannot be
  recalled; this is not a remote-erasure mechanism. Sign-out clears school controls,
  reviews and visible shared tracks in the app.
- The shared debrief is a bounded JSON copy at submission time. The optional track is
  an explicit reference to the student's owned file. It is fetched through an
  authorized school API, not a public URL or broader Storage Rule. The student can
  delete the file; an unavailable file does not erase the debrief/review. If the owner
  replaces the same object, later review sees the current file; recordings are not
  immutable evidence. A generation precondition prevents a mid-download replacement.
- Stored school fields: `schools/{school}/members`, `scenarios`, `assignments`,
  `submissions`. Submission IDs deterministically bind assignment and session, so
  client retries cannot create duplicates. Students cannot alter shared evidence
  or instructor notes through the API or direct Firebase writes.
- Backup restores remain guest imports. They do not restore assignment eligibility;
  launch and complete the live school assignment to submit fresh evidence.

## Trusted setup

Use a configured real Firebase project and operator identity with Firebase Auth
administrative and Firestore permissions. No private key should be placed in Vite,
source or chat. Create the administrator's Firebase account first, then run:

```sh
uv run --project backend python backend/scripts/school_admin.py YOUR_PROJECT SCHOOL_ID ADMIN_UID "School administrator name"
```

This creates the school record and its first administrator membership, and assigns
the global `school_admin` claim while preserving unrelated custom claims. Sign in
again to refresh the token. Do not run this operator script against production
unless the project, school and account have been reviewed. Existing `set_role.py`
can give a trusted instructor their global role before they sign in again:

```sh
uv run --project backend python backend/scripts/set_role.py YOUR_PROJECT INSTRUCTOR_UID instructor
```

The Cloud Run identity additionally needs read access to the recording bucket for
explicitly shared files. `FIREBASE_STORAGE_BUCKET` selects the actual bucket;
otherwise it defaults to `<project>.firebasestorage.app`. IAM grants server access;
application membership/roster checks restrict every student file read. All emulator
variables remain forbidden in production. Local Storage uses the guarded loopback
suite, with the Python Storage SDK pointed at its local endpoint.

## Beta limits and validation

The dashboard pages active rosters, scenarios, assignments and submissions. Review
one authorized student at a time and load remaining pages before interpreting full
submitted-history statistics. Retention, audit-log export, automated invitations,
scheduling, notification delivery and real-time collaboration remain future work.
Scenario creation uses an explicit form; natural-language Gemini scenario generation
is not implemented.

`npm run test:firebase` runs Rules tests, real local Firebase/API workflows, account
browser checks and a two-account school browser test. It starts a dedicated API on
8001 and Vite on 4174, then stops both; Google APIs are not invoked. `npm test`,
`npm run test:e2e`, lint and build cover the independent engines and guest app.
The managed environment has no real Firebase project/identity: production IAM,
Hosting/Cloud Run deployment and real-service behavior require separate validation.
