# Sky Rehearsal (Digital Twin)

An interactive route-familiarization prototype around Begumpet Airport in Hyderabad.

## Explore

- Inner and outer route loops reconstructed from reference screenshots
- Animated aircraft with adjustable playback and a route scrubber
- Overview, aerial, follow-aircraft, and pilot camera views
- Look around along the route, with satellite and street-map options
- Responsive layout for desktop and mobile

## Run locally

Run `python -m http.server 8000` in this folder, then open `http://localhost:8000`.

## Hosting

This is a static HTML, CSS, and JavaScript site. GitHub Pages serves the `main` branch root. No build or API key is required. CesiumJS 1.121 loads from Cesium's hosted distribution; map imagery requires an internet connection.

## Technology and credits

CesiumJS, Esri World Imagery, and OpenStreetMap. Provider attribution stays visible beneath the map. The application has no added platform watermarks.

## Project scope

The current digital twin prototype is a visual reconstruction for ground-based exploration. The loops are approximations from screenshots, and aircraft height and playback speed are illustrative. It does not include live flight telemetry or serve as a navigation aid.
