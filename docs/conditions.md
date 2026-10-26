# Weather, aircraft and radio (Milestone 8)

## Weather rehearsal

The Flight lab offers calm, westerly and crosswind scenarios. Each sets wind,
QNH, field temperature, visibility and a cloud briefing. Changes restart the
rehearsal. Manual wind edits create a new training scenario; compensation toggles
preserve the selected weather source.

**Load latest VOHY METAR** calls the same-origin FastAPI endpoint
`GET /api/weather/metar`, cached for five minutes. NOAA Aviation Weather Center is
used because Google Weather is not an aviation METAR service. The source is fixed
to VOHY; callers cannot request arbitrary URLs or stations. Availability depends
on the station reporting to that feed. A missing report or outage leaves training
scenarios and pasted observations available. Vite proxies `/api` locally; production
Hosting needs the Cloud Run rewrite described in [Firebase setup](firebase.md).

Decoded observations require a separate **Practice these conditions** click. The
restricted decoder supports KT/MPS wind, gusts, variable wind flags, Q/A pressure,
positive/negative temperature, metric visibility, CAVOK and common cloud tokens.
Trend groups are excluded. Unsupported/missing values remain unknown; this is not
a complete operational METAR decoder. US statute-mile visibility is not decoded.
Times are resolved to the nearest valid month using the device's UTC clock.
Reports older than two hours, more than ten minutes in the future, with missing
wind/QNH/temperature, variable winds or winds/gusts over 35 kt cannot be applied.
The observation timestamp remains visible; a rehearsal uses the chosen snapshot,
not a continuously updated feed. `9999` represents at least 10 km, not an exact
visibility measurement. The current decoder displays its literal code value.

Only steady wind changes drift, corrected heading and ground speed. QNH and
field temperature feed the aircraft IAS-to-TAS approximation. Cloud, visibility and
gust values are briefing information; no volumetric clouds, turbulence, gust
integration, altimeter instrument error or operational VFR decision is simulated.

## Aircraft performance inputs

The fleet's existing C152/C172R/C172S/DA42 NG files have **no reviewed type-specific
POH performance data**. Their shared Cessna values are not promoted to validated
performance. Default flight speeds remain explicitly demo values. Selecting a type
without an imported package keeps the demo schedule and says so.

Select a type, download its JSON template and have an instructor fill it using the
applicable aircraft POH/AFM revision and operating assumptions. Import requires:

- `version: 1`, `typeCode`: `c152`, `c172r`, `c172s` or `da42ng`;
- `source`, `reference` (POH/AFM revision, pages and applicable conditions), `reviewedBy`;
- `phaseSpeedsKias`: takeoff, upwind, crosswind, downwind, base, final, landing;
- `bankDeg` for the illustrative coordinated-turn calculation.

Null/absent values, blank provenance, unsupported types and out-of-range inputs are
rejected. Accepted inputs are **user-declared reviews**, not independently verified
or certified by the app. Numeric bounds validate the data format; they are not
aircraft operating limits. Templates deliberately contain no invented speeds.

On demo circuit routes, phase IAS values are converted approximately to TAS using
dry-air density, QNH, field temperature, the standard pressure-height relation
and an assumed lapse rate from the field elevation. IAS is approximated as EAS;
compressibility, calibration, humidity, weight and engine performance are excluded.
Phase values interpolate smoothly. Different packages therefore change actual
rehearsal speed, route duration and wind correction. Existing imported TAS/altitude
profiles take precedence; legacy loops retain their own schedules.

A derived turn radius is displayed for a selected bank angle. Ground geometry
still has instantaneous corners: this does not implement bank dynamics, stall,
lift/drag, takeoff roll, engine differences or validated climb/descent performance.
The fleet registration selector also selects that type's loaded performance input;
the Flight lab type selector can independently study any supported package.

Packages stay in the current tab. Completed sessions save a bounded environment
snapshot containing weather and any performance input, alongside existing wind
settings. Account history and backups preserve these inputs; they are not
server-attested measurements. Changing conditions clears an old recording
comparison so it cannot silently represent a different reference.

## Radio practice and Google speech

Choose **New tower prompt**, optionally listen using the browser's speech synthesis,
then type a readback or record up to 15 seconds. The prompt uses the circuit runway,
selected fleet's local call sign, and a chosen downwind/base/final leg. It pauses
the rehearsal. These are illustrative local training phrases; local abbreviations
and phraseology need instructor review. Changing the exercise, runway, learner or
rehearsal configuration clears it. Radio practice is disabled during exams.

Text checking is deterministic: it normalizes digit words (including niner),
requires the expected call sign, one correct leg and one matching runway mention,
and rejects explicit negative/ambiguous readbacks. This narrow check is not a
full semantic ATC parser, clearance validator or aviation-English assessment.
Results remain separate from flight scores; no AI grades radio or aircraft physics.
Radio attempts and recordings are not persisted.

Microphone capture requires a secure context, permission, WebM/Opus support and
Firebase sign-in. Stop/15 seconds ends capture, stops microphone tracks and sends
the audio to authenticated `POST /api/radio/transcribe`. The server uses Google
Cloud Speech-to-Text v1 with `en-IN`, WebM/Opus at 48 kHz, max 1 MB, a 15-second
request timeout and no SDK retry. The browser times out at 20 seconds. A transcript
must be reviewed and checked explicitly; recognition never submits an answer.
Navigation/account changes abort requests and discard stale results. Typing
remains available for unsupported browsers, denied permissions and cloud failures.

Use the existing `GOOGLE_CLOUD_PROJECT` and workload identity/ADC setup. Enable
`speech.googleapis.com` with billing and grant the Cloud Run identity the needed
Cloud Speech Client permissions, plus existing Firebase Auth/Firestore permissions.
No browser speech API key is used. Production egress needs `speech.googleapis.com`,
`aviationweather.gov` and the existing identity/Firebase endpoints. Real cloud
speech is disabled with Firebase emulators. Google requests share the existing
transactional per-user quota of six per minute with Gemini; set project budgets
and deployment-wide operational limits separately.

## Validation and remaining external work

Run `npm test`, `npm run test:e2e`, `npm run test:firebase`, and
`uv run --project backend --frozen pytest backend/tests`. Tests use synthetic
performance values, METAR fixtures, model mocks and local Firebase emulators.
No private flight recordings are committed. The managed environment has no Google
project/identity, and its policy blocks `aviationweather.gov`; live speech/METAR
access and production deployment are unvalidated. Approved aircraft POH/AFM inputs
and instructor review remain required for type-specific training use.
