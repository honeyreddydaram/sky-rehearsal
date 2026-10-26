# Architecture

The frontend is a React/TypeScript application built with Vite. The API is a small
FastAPI service with PostgreSQL connectivity. Keep each system focused:

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
required. The screenshot-derived loops remain available as legacy routes. Browser-only learners
are not authenticated accounts (M4). No production database schema, AWS resources,
or authentication is implied by the health endpoints. GitHub Pages serves only
static frontend files. AWS deployment and its security/operations work belong to M10.

The product remains ground-based familiarization software. Aviation data retains
its source, confidence, and confirmation notes; unverified geometry is not promoted
to an operational procedure by this migration.
