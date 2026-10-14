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

## Run and check

Serve this folder with `python -m http.server 8000`, then open `http://localhost:8000`. Run `node core.test.mjs` for bearing, interpolation, profile validation, and wind-vector tests.

GitHub Pages deploys via `.github/workflows/deploy.yml` on every push to `main` (after the same checks as above pass): it builds no bundle, just substitutes the real Cesium ion token into a copy of `ion-token.js` for the deployed output only, then publishes it. CesiumJS 1.121 and map assets require an internet connection.

## Cesium ion token

`ion-token.js` is committed with an empty `PUBLIC_ION_TOKEN`, so this repository's source and git history never contain a real token. The deploy workflow fills it in from the `CESIUM_ION_TOKEN` repository secret (Settings → Secrets and variables → Actions) only in what gets deployed — set or rotate it with:

```
gh secret set CESIUM_ION_TOKEN
```

That still means the token is visible to every visitor of the deployed page (view source, devtools, network tab) — Cesium ion tokens work like Mapbox/Google Maps JS keys, verified by domain restriction and asset scope, not by secrecy. In the Cesium ion dashboard (cesium.com/ion/tokens), restrict the token's **Allowed URLs** to this site's GitHub Pages domain and scope it to only the assets this app uses (Cesium World Terrain, OSM Buildings, and `geocode` if Google 3D should also work for visitors) — that way, if it's ever copied out and reused elsewhere, it won't work off this domain and can be rotated without touching broader account access. Running locally or on a branch other than `main`, `ion-token.js` stays empty and 3D detail requires pasting a token into Settings, same as before this existed.

## Scope and credits

The route geometry is recreated from screenshots for ground-based familiarization. The included altitude and airspeed schedule is a demo, not recorded flight data. Operational procedures and flight values must come from the instructor; this prototype is not a navigation aid.

CesiumJS, Esri World Imagery, and OpenStreetMap attribution remains visible beneath the map. No platform watermark is added.
