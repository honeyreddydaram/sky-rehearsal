# Sky Rehearsal (Digital Twin)

A browser-based route rehearsal prototype for the Begumpet area in Hyderabad.

## Practice

- Guided rehearsals with waypoint text and optional browser speech.
- Five-question quizzes that pause before route stages, give feedback, and save completed scores.
- Separate learner profiles with completed sessions and progress backup/import. Data stays in this browser; there is no account server or automatic cross-device sync.
- Animated aircraft, pilot/chase/overview cameras, and look-around controls.
- Adjustable constant wind, ground-track drift, true heading/track, groundspeed, and optional wind correction.
- Altitude and true airspeed profiles with a JSON importer for sourced flight data and custom callouts.
- Cesium satellite globe; World Terrain and OSM 3D buildings connect automatically on the deployed site using a shared Cesium ion token (see "Cesium ion token" below), or paste your own read-only token in Settings to use your own account's quota instead. A pasted token is held only for the current page session.
- A route diagram fallback keeps practice available when WebGL cannot initialize.

## Flight profiles

Use **Import profile → Download example** for the supported JSON structure. Replace the example values with instructor-reviewed data. Profiles contain `schemaVersion: 1`, a name/source, route (`inner` or `outer`), altitude reference (`MSL` or `ELLIPSOID`), and frames with increasing `progress` from 0 to 1, `altitudeFt`, and `tasKt`. Optional callouts contain progress and text. MSL profiles require `geoidOffsetM` (ellipsoid height minus MSL height).

Importing a profile changes altitude, airspeed, and callouts; it does not replace the screenshot-derived horizontal route. Values interpolate between frames. Directions are true, not magnetic. Wind is a simplified constant-vector scenario, not a weather forecast or aircraft dynamics model.

## Develop

Requires Node 24, Python 3.12+, and [uv](https://docs.astral.sh/uv/).

```sh
npm ci
npm run dev
```

Vite serves the React/TypeScript interface. CesiumJS 1.121, workers, and globe assets
are installed from npm and served locally. Satellite/street imagery still needs
internet access. No backend or token is required for local rehearsal.

For the API and PostgreSQL (requires Docker Compose):

```sh
cp .env.example .env
# Choose a local POSTGRES_PASSWORD in .env before starting PostgreSQL.
docker compose up -d --wait db
uv sync --project backend --frozen
# Use the password chosen in .env; URL-encode special characters in DATABASE_URL.
export DATABASE_URL='postgresql://sky_rehearsal:YOUR_LOCAL_PASSWORD@127.0.0.1:5432/sky_rehearsal'
cd backend
uv run --frozen uvicorn app.main:app --reload --host 127.0.0.1 --port 8000
```

`GET /api/health` reports API liveness. `GET /api/ready` checks a real PostgreSQL
connection and returns 503 if it is unavailable. API docs are at `/docs` on the
API server. Vite forwards `/api` to port 8000 during development. The API currently
provides infrastructure checks only; browser progress remains local until M4.

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

Set `DATABASE_URL` before backend tests to include the PostgreSQL integration test;
otherwise that one test is explicitly skipped. To use an installed Chromium instead
of downloading Playwright's browser, set `PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH` to
its executable. Browser checks cover boot, route/mode selection, airport data,
runway switching, map identification, cameras, and settings. Pilot view requires WebGL.

`npm run build` type-checks the new TypeScript interface and produces `dist/`.
`npm run preview` serves that output. GitHub Pages builds and deploys `dist/` after
frontend and PostgreSQL-backed API checks pass. It hosts the frontend only; API/AWS
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
reloaded. They are not uploaded, saved as accounts, or counted as scored attempts.

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
Real recordings require their own source/datum verification. Cloud track storage,
accounts, and debrief/scoring remain later milestones.
