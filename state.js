// state.js
// Shared, mutable "flight session" state, plus the pure-ish math that derives a
// position/heading/speed from it at any point along the route.
//
// This module owns no DOM elements and no Cesium objects — it only knows about route
// geometry, the active flight profile, and wind. Every other module imports the same
// `state` object below and reads/writes its fields directly. That is a deliberate,
// minimal alternative to an event bus or a framework store: this app is small enough
// that "one shared object everybody can see" is easier to reason about than wiring up
// subscriptions, and it is exactly how the original single-file app.js worked.
//
// Two modules are intentionally NOT imported here: map.js (rendering) and playback.js
// (the simulation clock). If they were, we'd have a cycle, since both of them need to
// read `state` too. Anything here that needs rendering to react (rebuildTrace) just
// recomputes data — the caller is responsible for telling map.js to redraw.

import {bearing, routeModel, at, profileAt, windTriangle, driftPoint, validateRouteData} from './core.mjs';

// Geoid undulation (N) at VOHY: the height of the geoid (mean sea level) above the
// WGS84 ellipsoid. Pilots fly altitudes AMSL (orthometric height, H) on QNH; Cesium
// needs ellipsoid height (h) to place anything with Cartesian3.fromDegrees(). The
// relation (same one used throughout geodesy, e.g. GeographicLib's GeoidEval) is:
//   h = N + H   (ellipsoid height = geoid undulation + orthometric/AMSL height)
// N at VOHY (17.4531N, 78.4675E), computed from NGA's official EGM grids via
// GeographicLib's online evaluator (https://geographiclib.sourceforge.io/cgi-bin/GeoidEval,
// retrieved 2026-10-13): EGM2008 N = -76.5548 m, EGM96 N = -76.7629 m. Using EGM2008
// (the more modern/higher-resolution model) as the app's constant. Negative here means
// the geoid sits below the ellipsoid at this location, which is typical for this part
// of India.
export const EGM2008_UNDULATION_M_VOHY = -76.5548;

// The demo altitude/true-airspeed schedule shown until the pilot imports a real
// instructor-reviewed profile (Phase 2+) or a recorded GPX flight. The altitude values
// are illustrative, but ARE meant to represent realistic AMSL figures for this circuit
// (compare the real circuit altitude convention in data/airport-vohy.json:
// circuitAltitude, ~2800 ft AMSL) — hence altitudeReference MSL with the real geoid
// offset above, not ELLIPSOID with a zero offset as this used to be set. See README
// "Scope and credits".
export const demo = {
  name: 'Demo familiarization profile',
  source: 'Illustrative values for this route walkthrough',
  altitudeReference: 'MSL',
  geoidOffsetM: EGM2008_UNDULATION_M_VOHY,
  frames: [
    {progress: 0, altitudeFt: 2700, tasKt: 90},
    {progress: 0.18, altitudeFt: 2900, tasKt: 95},
    {progress: 0.44, altitudeFt: 2900, tasKt: 95},
    {progress: 0.7, altitudeFt: 2800, tasKt: 90},
    {progress: 1, altitudeFt: 2700, tasKt: 85},
  ],
  callouts: [],
};

// The single shared state object. Fields match 1:1 with the loose `let` variables the
// original app.js kept at module scope.
export const state = {
  route: 'inner', // 'inner' | 'outer'
  mode: 'guided', // 'guided' | 'quiz' | 'explore'
  view: 'overview', // 'overview' | 'follow' | 'pilot'
  t: 0, // progress along the route, 0..1
  playing: false,
  started: false,
  eligible: true, // false once the pilot has skipped ahead — session won't count as a logged attempt
  completed: false,
  seen: new Set(), // waypoint indices already passed/announced
  customSeen: new Set(), // imported-profile callout indices already announced
  answers: [], // quiz answers for the current attempt
  pending: null, // waypoint index of the quiz question currently open, or null
  profile: demo,
  windFrom: 270, // degrees true, the direction the wind is blowing FROM
  windSpeed: 0, // knots
  correctWind: false, // apply a heading correction to hold the planned track
  rate: 15, // playback speed multiplier
  sessionId: '',
  yaw: 0, // look-around offset, radians, added to the flight heading
  pitch: -20, // look-around pitch, degrees
  viewRange: 230, // chase-camera distance, metres
};

// routes.json, once loaded and validated, plus the smoothed route geometry built from
// it (see core.mjs routeModel — a Catmull-Rom spline through the screenshot-derived
// points, so the aircraft doesn't visibly cut corners).
export let routeData = null;
export let models = null;

export async function loadRouteData() {
  const response = await fetch('./routes.json');
  if (!response.ok) throw new Error('Route data request failed');
  const raw = await response.json();
  routeData = validateRouteData(raw); // throws on a malformed/incompatible file
  models = {
    inner: routeModel(routeData.loops.inner),
    outer: routeModel(routeData.loops.outer),
  };
}

// The five fixed study checkpoints along either loop. The eastern-turn name differs
// by route (inner loop passes Malkajgiri side; outer loop passes Moula Ali side).
export function waypoints() {
  return [
    {p: 0.055, name: 'Begumpet Airport', cue: 'Orient yourself to the runway and surrounding city.'},
    {p: 0.205, name: 'Western turn', cue: 'Look toward Balkampet and the KBR Park side of the loop.'},
    {p: 0.46, name: 'Hussain Sagar side', cue: 'Identify the lake and trace the route across the city.'},
    {
      p: 0.73,
      name: state.route === 'inner' ? 'Malkajgiri side' : 'Moula Ali side',
      cue: 'Study the eastern turn and the surrounding landmarks.',
    },
    {
      p: 0.94,
      name: 'Return to Begumpet',
      cue: 'Locate the airport again and recall the sequence of landmarks.',
    },
  ];
}

// True bearing of the route itself at a given progress, sampled a hair before/after so
// corners read as a sensible course instead of a discontinuity right at the corner.
export function planBearing(progress) {
  const model = models[state.route];
  return bearing(at(model, Math.max(0, progress - 0.001)), at(model, Math.min(1, progress + 0.001)));
}

// Wind-drifted ground track cache: 241 samples (0..1 in 240 steps) of ground position
// and cumulative travel time. Playback reads this instead of re-integrating wind drift
// every animation frame. Rebuilt whenever route, profile, or wind settings change —
// callers must also tell map.js to redraw afterward (see map.refreshRouteVisuals).
let trackPoints = [];
let travelTimes = [0];

export function rebuildTrace() {
  const n = 240;
  trackPoints = [];
  travelTimes = [0];
  for (let i = 0; i <= n; i++) {
    const p = i / n;
    const point = at(models[state.route], p);
    const frame = profileAt(state.profile.frames, p);
    const wind = windTriangle(
      planBearing(p),
      frame.tasKt,
      state.windFrom,
      state.windSpeed,
      state.correctWind,
    );
    if (i) {
      const speedMs = Math.max(1, wind.possible ? wind.alongSpeed : frame.tasKt) * 0.514444; // kt -> m/s
      travelTimes[i] = travelTimes[i - 1] + models[state.route].total / n / speedMs;
    }
    trackPoints.push(
      state.correctWind ? point : driftPoint(point, travelTimes[i], state.windFrom, state.windSpeed),
    );
  }
}

export function getTrackPoints() {
  return trackPoints;
}

export function secondsAt(progress) {
  const x = Math.max(0, Math.min(1, progress)) * 240;
  const i = Math.min(239, Math.floor(x));
  return travelTimes[i] + (travelTimes[i + 1] - travelTimes[i]) * (x - i);
}

export function positionAt(progress) {
  const p = at(models[state.route], progress);
  return state.correctWind ? p : driftPoint(p, secondsAt(progress), state.windFrom, state.windSpeed);
}

export function heightAt(progress) {
  const frame = profileAt(state.profile.frames, progress);
  return frame.altitudeFt * 0.3048 + (state.profile.geoidOffsetM || 0); // ft -> metres, ellipsoid height
}

// The full derived flight state at a point along the route: position, height, course,
// and the wind-triangle result (heading/track/groundspeed/crosswind/correction/...).
export function stateAt(progress) {
  const frame = profileAt(state.profile.frames, progress);
  const course = planBearing(progress);
  const wind = windTriangle(course, frame.tasKt, state.windFrom, state.windSpeed, state.correctWind);
  return {...frame, ...wind, course, position: positionAt(progress), height: heightAt(progress)};
}
