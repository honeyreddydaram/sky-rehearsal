# Sky Rehearsal (Digital Twin)

A browser-based route rehearsal prototype for the Begumpet area in Hyderabad.

## Practice

- Guided rehearsals with waypoint text and optional browser speech.
- Five-question quizzes that pause before route stages, give feedback, and save completed scores.
- Separate learner profiles with completed sessions and progress backup/import. Data stays in this browser; there is no account server or automatic cross-device sync.
- Animated aircraft, pilot/chase/overview cameras, and look-around controls.
- Adjustable constant wind, ground-track drift, true heading/track, groundspeed, and optional wind correction.
- Altitude and true airspeed profiles with a JSON importer for sourced flight data and custom callouts.
- Cesium satellite globe; optional World Terrain and OSM buildings using your own read-only Cesium ion token. The token is held only for the current page session. Asset coverage and access depend on the provider.
- A route diagram fallback keeps practice available when WebGL cannot initialize.

## Flight profiles

Use **Import profile → Download example** for the supported JSON structure. Replace the example values with instructor-reviewed data. Profiles contain `schemaVersion: 1`, a name/source, route (`inner` or `outer`), altitude reference (`MSL` or `ELLIPSOID`), and frames with increasing `progress` from 0 to 1, `altitudeFt`, and `tasKt`. Optional callouts contain progress and text. MSL profiles require `geoidOffsetM` (ellipsoid height minus MSL height).

Importing a profile changes altitude, airspeed, and callouts; it does not replace the screenshot-derived horizontal route. Values interpolate between frames. Directions are true, not magnetic. Wind is a simplified constant-vector scenario, not a weather forecast or aircraft dynamics model.

## Run and check

Serve this folder with `python -m http.server 8000`, then open `http://localhost:8000`. Run `node core.test.mjs` for bearing, interpolation, profile validation, and wind-vector tests.

GitHub Pages serves the `main` branch root. No build step is needed. CesiumJS 1.121 and map assets require an internet connection.

## Scope and credits

The route geometry is recreated from screenshots for ground-based familiarization. The included altitude and airspeed schedule is a demo, not recorded flight data. Operational procedures and flight values must come from the instructor; this prototype is not a navigation aid.

CesiumJS, Esri World Imagery, and OpenStreetMap attribution remains visible beneath the map. No platform watermark is added.
