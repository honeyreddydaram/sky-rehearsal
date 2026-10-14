// ion-token.js
// A Cesium ion access token to connect automatically on page load, so every
// visitor sees World Terrain + OSM 3D buildings without pasting their own token
// first (see README "Cesium ion token" for what this does and doesn't protect).
//
// Committed here EMPTY. .github/workflows/deploy.yml substitutes the real value
// (from the repository's CESIUM_ION_TOKEN secret) into this file only in the
// deployed output on GitHub Pages — this file, in this repository's source and
// git history, never holds the real token. Running the app locally (e.g.
// `python -m http.server`) or from a non-deploy branch checkout, this stays
// empty: 3D detail then requires pasting a token into Settings, exactly as
// before this file existed.
//
// This token IS still visible to anyone who opens the deployed page (view
// source, browser devtools, network requests) once it's substituted in — that's
// inherent to how Cesium ion's browser SDK works (the same is true of Mapbox or
// Google Maps JS keys), and nothing about this setup hides it from end users.
// The protection against it being copied out and reused elsewhere comes from
// restricting it in the Cesium ion dashboard (cesium.com/ion/tokens): scope it
// to only the assets this app needs, and set "Allowed URLs" to this site's
// GitHub Pages domain.
export const PUBLIC_ION_TOKEN = '';
