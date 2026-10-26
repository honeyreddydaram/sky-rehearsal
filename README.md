# Sky Rehearsal (Digital Twin)

A browser-based route rehearsal prototype for the Begumpet area in Hyderabad.

## Practice

- Guided rehearsals with waypoint text and optional browser speech.
- Five-question quizzes that pause before route stages, give feedback, and save completed scores.
- Separate learner profiles with completed sessions and progress backup/import. Guest data stays in this browser; sign in through Account to sync completed sessions and profiles.
- Animated aircraft, pilot/chase/overview cameras, and look-around controls.
- Adjustable constant wind, ground-track drift, true heading/track, groundspeed, and optional wind correction.
- Altitude and true airspeed profiles with a JSON importer for sourced flight data and custom callouts.
- Cesium satellite globe; World Terrain and OSM 3D buildings connect automatically on the deployed site using a shared Cesium ion token (see "Cesium ion token" below), or paste your own read-only token in Settings to use your own account's quota instead. A pasted token is held only for the current page session.
- A route diagram fallback keeps practice available when WebGL cannot initialize.

## Flight profiles

Use **Import profile → Download example** for the supported JSON structure. Replace the example values with instructor-reviewed data. Profiles contain `schemaVersion: 1`, a name/source, route (`inner` or `outer`), altitude reference (`MSL` or `ELLIPSOID`), and frames with increasing `progress` from 0 to 1, `altitudeFt`, and `tasKt`. Optional callouts contain progress and text. MSL profiles require `geoidOffsetM` (ellipsoid height minus MSL height).

Importing a profile changes altitude, airspeed, and callouts; it does not replace the screenshot-derived horizontal route. Values interpolate between frames. Directions are true, not magnetic. Wind is a simplified constant-vector scenario, not a weather forecast or aircraft dynamics model.

## Cloud accounts (M4)

SkyRehearsal now uses Firebase Authentication, Firestore, and Cloud Storage.
Use **Account** to sign in with Google or email/password, create a student account,
or request a password reset. Completed sessions (including quiz answers/scores) and
imported altitude profiles sync to the account. **Sync progress** refreshes records
from another device. **Copy guest progress into account** is an explicit opt-in;
signing in never silently merges a shared browser's learners. Signing out restores
the guest profile and clears the visible private recording. Cloud progress is not
written to the guest browser store. Export remains available if a cloud write fails.

Imported GPX/CSV files stay in the tab until **Save flight to account** is selected.
**Refresh saved flights** and **Load saved flight** retrieve private tracks on another
computer. File bytes live in Storage; metadata lives in Firestore. Data is private
to the signed-in UID. Static airport/aircraft reference packages remain versioned
in `public/data`; assignment and school-review workflows arrive in M9.

## Develop

Requires Node 24, Python 3.12+, [uv](https://docs.astral.sh/uv/), and Java 21 for
Firebase emulators. Install and run guest rehearsal:

```sh
npm ci
uv sync --project backend --frozen
npm run dev
```

For local cloud-account development, start the emulators in one terminal:

```sh
npm run emulators
```

Then start Vite in another terminal using the isolated demo project:

```sh
VITE_FIREBASE_PROJECT_ID=demo-sky-rehearsal VITE_FIREBASE_EMULATORS=true npm run dev
```

This connects Auth (9099), Firestore (8080), and Storage (9199) on loopback. It needs
no real account, API key, billing, or service-account file. Emulator data is temporary;
production accounts use the configuration described in [Firebase setup](docs/firebase.md).
Guest mode remains available when no Firebase web configuration is supplied.

The optional trusted API runs from `backend/`:

```sh
APP_ENV=development FIREBASE_PROJECT_ID=demo-sky-rehearsal \
FIREBASE_AUTH_EMULATOR_HOST=127.0.0.1:9099 FIRESTORE_EMULATOR_HOST=127.0.0.1:8080 \
uv run --frozen uvicorn app.main:app --reload --host 127.0.0.1 --port 8000
```

`/api/health` checks liveness; `/api/ready` performs a Firestore read. `/api/me`
requires a verified Firebase ID token; `/api/admin/health` additionally requires the
trusted `platform_admin` claim. Emulators are rejected unless the API explicitly
runs in development with the demo project and expected loopback addresses.
PostgreSQL and its Compose scaffold have been removed.

## Check and build

From the repository root:

```sh
npm test
npm run lint
npm run format:check
npm run build
npx playwright install --with-deps chromium
npm run test:e2e
uv run --project backend --frozen pytest backend/tests
```

Run `npm run test:firebase` for actual Auth/Firestore/Storage rule tests, API token
verification, and the cross-browser account/flight round trip. Backend emulator
tests are explicitly skipped when running pytest without the emulator suite. To use an installed Chromium instead
of downloading Playwright's browser, set `PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH` to
its executable. Browser checks cover boot, route/mode selection, airport data,
runway switching, map identification, cameras, and settings. Pilot view requires WebGL.

`npm run build` type-checks the new TypeScript interface and produces `dist/`.
`npm run preview` serves that output. GitHub Pages builds and deploys `dist/` after
frontend, API, and Firebase emulator checks pass. It hosts the frontend only; API/Google Cloud
deployment comes later. Do not serve the source with Python's static server anymore.

## Cesium ion token

Basic globe and imagery need no token. For optional terrain and 3D buildings, paste
a read-only Cesium ion token into Settings; it remains in that page session.
GitHub Pages can supply the existing `CESIUM_ION_TOKEN` Actions secret as
`VITE_CESIUM_ION_TOKEN` at build time. Every `VITE_` value is visible in the browser:
restrict this token's allowed URLs and asset scope in Cesium ion. Never use a private
server credential. Nothing writes tokens into committed source.

## Architecture and milestones

See [architecture](docs/architecture.md) for module responsibilities and the
incremental migration boundary, and [milestones](docs/milestones.md) for delivery order.

## Scope and credits

The default illustrative runway circuit connects sourced turn pins, with an inferred final intercept; RWY 09 reverses that geometry. It is not instructor verified. Legacy inner/outer routes retain the screenshot geometry. Turns are instantaneous and flight values are demo targets. The included altitude and airspeed schedule is a demo, not recorded flight data. Operational procedures and flight values must come from the instructor; this prototype is not a navigation aid.

CesiumJS, Esri World Imagery, and OpenStreetMap attribution remains visible beneath the map. No platform watermark is added.

## Recorded-flight replay (M3)

Import one `.gpx` or `.csv` in **Recorded flight**. Choose the altitude reference
before import: GPX `ele` and CSV `altitude_m` are metres, but the recorder's altitude
datum must be confirmed. MSL data requires the local geoid offset (ellipsoid minus
MSL, metres); the app never guesses it. Files remain in tab memory until cleared or
reloaded. They are not uploaded unless you choose Save flight to account, and are never counted as scored attempts.

CSV requires the exact headers `timestamp,latitude,longitude,altitude_m`.
Optional columns are `heading_true` (degrees), `speed_kt` (ground speed in knots),
and `vertical_speed_fpm`. Time uses ISO 8601 with `Z` or a numeric timezone. The
numeric/time CSV dialect accepts quoted fields but not embedded commas/newlines.
GPX supports one continuous `trkseg` with `lat`, `lon`, `ele`, and `time` on every
point. Missing heading/speed/vertical speed are derived from successive samples;
derived heading is ground track, not aircraft nose heading. GPX extensions are not
used. Multiple segments, missing altitude/time, duplicate or out-of-order times,
files over 5 MB, and tracks outside 2–50,000 points are rejected without replacing
a valid recording. No smoothing, resampling, or flight-physics correction is applied.

The cyan recording overlays the purple ideal route and amber simulated wind track
in Cesium and in the diagram fallback. Scrub or replay using the separate recorded
time control; Pilot/Chase/Overview follows the recorded aircraft. The original
telemetry panel remains the rehearsal's telemetry; recorded values have their own
readout. Starting/changing a rehearsal exits recorded replay. Tracks use independent
clocks rather than implying time-aligned comparisons or assessment scores.

Synthetic [CSV](public/examples/demo-flight.csv) and [GPX](public/examples/demo-flight.gpx)
examples are included; they are not actual flight data. For these Begumpet examples,
MSL offset approximately -76.55 m places them consistently with the existing demo.
Real recordings require their own source/datum verification. Cloud track storage and accounts are available through M4; deterministic comparison and replayable debriefs are available through M6.

## Training modes (M5)

Choose **Guided**, **Practice**, **Landmark recognition**, **Decision training**,
**Quiz**, **Exam**, or **Free explore**. Beginner → Intermediate → Advanced → Examiner
progressively removes labels, route lines, checkpoint markers, phase/target hints,
and on-demand help. Exam disables assistance at every level and defers answer
feedback until all five questions are complete. Mode/difficulty changes restart
the attempt. Results and cloud/backup history retain mode, difficulty and hint use.

Question content follows the selected route's reference notes, including explicit
uncertainty for unlocated landmarks. This is a self-study recall exercise; flight
performance scoring/debrief comes in M6. See [training behavior](docs/training.md)
for the mode differences and assistance matrix. Measured aircraft telemetry remains
visible when target hints are hidden. The test runner starts its own Vite server;
stop any old preview/dev server using 4173/4174 before running browser checks.

## Flight comparison and debrief (M6)

Completed rehearsals now show deterministic error metrics and recall breakdowns.
Use **Compare flight with current route** after importing a recording to inspect
available track/altitude differences. A debrief entry replays a short window around
the difference and shows the ideal/actual position connector. Reports export as JSON,
remain in session history, and can be saved with private account flights.

Missing true heading, TAS, wind data, or phase tags stay unavailable. GPS ground
speed is never treated as TAS. Optional CSV `tas_kt` and `phase` columns support
additional measurements. The minute-spaced replay demo is too sparse for the default
30-second assessment gap limit; use suitably sampled flight data. Current illustrative
references and automatically generated rehearsals do not receive an overall flight
proficiency score. See [assessment methods and limits](docs/assessment.md).

### Milestone 7 — adaptive instructor

Progressive local hints now adapt to recent recall weaknesses. Optional signed-in
Gemini / Vertex AI explanations use structured training facts and deterministic
debriefs. AI cannot change flight physics or scores. See [instructor setup and
limits](docs/instructor.md). Live Gemini needs a configured Google Cloud project
and workload identity; local coaching works without either.

### Milestone 8 — weather, aircraft and radio

Weather presets and fresh METAR inputs drive steady-wind rehearsal. Reviewed
C152/C172R/C172S/DA42 NG performance imports change circuit speeds and wind
correction; no unreviewed POH values are invented. Radio prompts support typed
readbacks and optional Google Cloud Speech-to-Text. See [setup, data requirements
and simulation limits](docs/conditions.md).

### Milestone 9 — instructor and flight-school platform

School administrators manage enrollment and teaching rosters. Instructors create
and publish scenario configurations, assign exercises, review explicitly submitted
scores/debriefs, replay shared recordings and leave review notes. Students launch
assigned settings and choose what to submit. Private history remains private.
See [school setup, workflow and limits](docs/schools.md).
