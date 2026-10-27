# Airport packages and builder (Milestone 10)

**Airports → select → Use installed airport** switches the same flight engine
between versioned data packages. Begumpet uses `VOHY / vohy-legacy-v1`; its existing
illustrative vertices, altitude and speed schedule are preserved exactly by tests.
`ZZZZ / synthetic-v1` is a clearly fictional second airport, not new real-world
aviation data. It demonstrates different coordinates, elevation, geoid offset and
runways 18/36 without a new flight-engine implementation.

Use **Copy current package into editor** as the template for a new airport. Edit
JSON data, or import a JSON file under 1 MB; validate/preview before applying or
exporting. A package contains:

- `version: 1`, immutable `revision`, `source`, review status and reviewer/date;
- `airport`: ICAO, name, city, reference point, elevation, runways, circuit altitude;
- `geoidOffsetM`: ellipsoid minus MSL height, explicitly supplied per airport;
- `weatherStation`: an explicit METAR station or `null` (no nearest-station guess);
- `aircraft` supported type codes and `fleet` registrations/call-sign provenance;
- `landmarks`: source-labelled locations;
- `circuits`: one to eight runway-specific reference patterns, each with eight
  `[longitude, latitude]` vertices, eight `altitudesFt`, eight demo TAS `speedsKt`,
  plus the five ordered reference legs and checkpoints.

The seven geometry segments are takeoff, upwind, crosswind, downwind, base, final
and landing. Side landmarks are reference cues, not track vertices. Runway IDs
support 01–36 and L/R/C suffixes; up to four physical runway pairs are supported.
Explicit thresholds are preferred; without them the map uses the existing
approximate runway-end calculation. The package validator checks identity, source,
review provenance, coordinates, local extent, nonzero segment lengths and bounded
altitude/speed schedules. It does not independently verify aviation correctness,
reciprocal runway designations, clearance from terrain, procedures or aircraft POH
performance. Review status remains a user declaration and never unlocks certified
flight scores. Circuit corners remain instantaneous.

Switching airport clears the attempt, assignment context, current recording view,
wind scenario and active aircraft performance selection. Imported type performance
can be selected again explicitly. Airport/runway controls, map, labels, field
concepts, weather station and geoid offset follow the package. Legacy screenshot
loops are restricted to VOHY. Sessions store airport identity/revision; old records
without these fields mean legacy VOHY. Profile import/selection requires the
matching airport and revision. Recall adaptation is scoped to airport and route.

An imported package is local to the current tab. To make an airport available to a
school, review its data, put its JSON in `public/data/airports`, add its ICAO,
revision, display name and relative path to `catalog.json`, and run:

```sh
npm run check:airports
npm test
```

Commit/release the package and catalog together. Catalog paths are local assets;
requests and uploaded packages cannot select arbitrary weather URLs. The API uses
the same catalog in its container. School scenarios pin an installed package
revision and runway; assignment launch reloads that catalog package rather than
trusting a same-named local edit. The backend checks the submitted session's airport
revision too. Old M9 assignments without a revision pin legacy VOHY explicitly.
Deploy matching frontend/API catalogs; incompatible revisions fail rather than
silently substituting geometry.

The default VOHY file is generated from the retained original reference files by
`scripts/build-vohy-package.mjs`; regenerate only when intentionally revising that
package, then format/check and change the revision when its training inputs change.
No second real airport or instructor-approved circuit has been supplied or verified
in this environment. Do not publish invented operational packages.
