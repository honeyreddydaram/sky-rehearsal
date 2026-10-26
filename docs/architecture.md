# Architecture

The frontend is a React/TypeScript application built with Vite. The API is a small
FastAPI service that verifies Firebase ID tokens and checks Firestore readiness. Keep each system focused:

| System          | Location                          | Responsibility                                                         |
| --------------- | --------------------------------- | ---------------------------------------------------------------------- |
| Application     | `src/App.tsx`, `src/bootstrap.js` | Mount the interface and wire systems together                          |
| Flight engine   | `src/flight/`                     | Geometry, profiles, wind, session state, playback clock                |
| Training engine | `src/training/`                   | Questions, answers, training flow                                      |
| Map / 3D engine | `src/map/`                        | Cesium, fallback diagram, cameras, scene objects                       |
| Aviation data   | `src/aviation/`, `public/data/`   | Load and validate airport, runway, circuit, aircraft and landmark data |
| User / progress | `src/progress/`                   | Browser learners, history, profile imports and backups                 |
| Interface       | `src/ui/`                         | React panels, dialogs, small DOM/audio helpers                         |
| Backend API     | `backend/app/`                    | HTTP endpoints and database readiness                                  |

## Migration boundary

React mounts the existing interface once. The working JavaScript engines still
update those DOM controls, driven by the existing callback wiring in `bootstrap.js`.
They do not import React. Do not add React state that also controls the same elements.
As a feature is changed in a later milestone, migrate its state and handlers together
to typed React components. This avoids two competing owners and a risky full rewrite.
Development source edits reload the page so existing animation loops and DOM listeners
are cleaned up together. New UI components are strictly type-checked; existing JavaScript is deliberately not
claimed to be fully typed. Pure flight calculations remain independently testable.

`public/` contains runtime data and models. Never fetch files from `src/` at runtime.
Cesium assets are copied from the installed package after `npm ci`, not from a CDN.
Cesium 1.121's engine/widgets and zip dependency are pinned through npm overrides:
newer compatible-range releases removed exports this version imports. Update these
versions together and run both build and browser tests.

## Deliberately deferred

The default flight now follows the illustrative circuit engine in `src/flight/circuit.mjs`.
RWY 27 uses explicit turn-point pins; its final intercept is inferred by projecting
the base turn onto the runway line. RWY 09 reverses that geometry, consistent with
the derived circuit file. Side landmarks and null coordinates never become flight
vertices. Straight segments have instantaneous turns, not bank dynamics. All
geometry remains unverified, and altitude/speed schedules are demo targets rather
than reviewed aircraft performance. Instructor/recorded-flight validation is still
required. The screenshot-derived loops remain available as legacy routes. Guest learners remain local; Firebase accounts sync private progress. No live
Google Cloud deployment is implied by local emulator validation. GitHub Pages serves only
static frontend files. Google Cloud deployment and its security/operations work belong to M10.

The product remains ground-based familiarization software. Aviation data retains
its source, confidence, and confirmation notes; unverified geometry is not promoted
to an operational procedure by this migration.

## Recording boundary (M3)

`flight/recording.mjs` parses/normalizes tracks and interpolates by timestamp.
`progress/recording.js` owns file input and the independent replay clock. A small
shared `replay.sample` lets the map follow a recording without changing the scored
rehearsal's state or route. The map owns the recording polyline and diagram overlay.
Local replay needs no backend; M4 adds explicit private Storage upload/download through the Firebase SDK. Clearing removes the overlay and restores
the simulated aircraft; import failure preserves the previous recording.

## Cloud direction

Implementation uses Firebase Auth, Firestore sessions/profiles/track metadata, and
Cloud Storage recording files. `cloud/firebase.ts` owns SDK access; `progress/account.js`
connects account identity to existing learner/progress features. Guest state and
cloud state are separate, and guest data is copied only by explicit user action.
Completed sessions are immutable per ID, so devices add records without overwriting
an entire progress snapshot. Cloud state is refreshed on sign-in or Sync; live
concurrent editing and offline cloud persistence are not implemented.

Rules enforce UID ownership; roles come from trusted custom claims. The FastAPI
backend verifies Firebase tokens with revocation checks before applying role checks.
Instructor/school roles do not grant blanket access to private user data. Assignments
and delegated school access are deferred to M9. See [Firebase setup](firebase.md).

## Training engine (M5)

`training/engine.mjs` owns deterministic question generation and assistance policy.
`training/quiz.js` owns the question dialog and feedback timing. The existing flight
clock gates assessed modes; it does not change physics by training difficulty.
Map entities and the fallback consult the same assistance policy. Completed records
retain difficulty and hint counts, with backwards-compatible backup and Firestore
validation. See [mode definitions](training.md). No AI or performance-score engine is
introduced by this milestone.

## Assessment and debrief (M6)

`training/assessment.mjs` is a pure, deterministic metrics engine.
`training/reference.mjs` adapts the current route/profile/wind into reference and
simulation samples; `training/debrief.js` renders reports and replay actions.
`training/debrief-schema.mjs` validates persisted reports without browser dependencies.
Recording comparison reuses the existing replay clock, while completed rehearsal
review uses an unlogged bounded replay. Report snapshots accompany session records
or private flight metadata; stored reports are not silently rescored. No model/AI
service is involved. See [assessment method](assessment.md) for missing-data policy
and the distinction between exploratory comparisons, recall and proficiency scores.

## Coaching and conditions (M7–M8)

`training/coaching.mjs` builds bounded teaching facts; `backend/app/instructor.py`
uses Gemini / Vertex AI for optional explanations. Scores and flight math never
call the model. Firebase tokens and a transactional Firestore quota protect paid
Google requests.

`aviation/conditions.mjs` validates METAR/performance inputs and computes density
and turn estimates. `conditions.js` wires controls through one reset/rebuild callback.
`flight/state.js` applies reviewed-input speeds only to demo circuit schedules;
imported TAS profiles take precedence. Completed sessions retain their environment
snapshot and wind settings through account storage and backup restoration.
`training/radio.mjs` checks constrained readbacks deterministically; `radio.js`
owns microphone capture and transcript review. `backend/app/conditions.py` provides
a fixed-source METAR cache and Google Cloud Speech-to-Text, sharing the Google
request quota. These modules do not supply unreviewed aircraft performance values
or expand the flight model into a full aircraft dynamics simulator.
