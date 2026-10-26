// app.js
// Entry point loaded by index.html. Wires together the feature modules (state, ui,
// map, playback, quiz, progress, settings) and starts the simulation loop.
//
// This is intentionally the only file that imports every other module, and the only
// place that wires the "cross-cutting" controls — route/mode selection, wind scenario
// sliders, and flight-profile selection — because changing any of those touches
// state.js + playback.js + map.js + progress.js all at once. Giving any ONE of those
// modules ownership of that wiring would force it to import the others, which is
// exactly the import-cycle problem each module's own header comment describes. The
// three cycles that would otherwise appear are broken with an injected-callback
// pattern (map.setInteractionHandler, playback.setQuizHandler,
// progress.setContextChangeHandler) wired up below.

import {headingText} from './flight/core.mjs';
import {state, loadRouteData, loadCircuits, models, rebuildTrace} from './flight/state.js';
import * as ui from './ui/ui.js';
import * as map from './map/map.js';
import * as playback from './flight/playback.js';
import * as quiz from './training/quiz.js';
import * as progress from './progress/progress.js';
import {wireAccount} from './progress/account.js';
import {wireRecording} from './progress/recording.js';
import * as settings from './ui/settings.js';
import * as airport from './aviation/airport.js';
import * as airfield from './aviation/airfield.js';

try {
  await loadRouteData();
} catch (err) {
  console.warn('routes.json failed to load or validate:', err);
  ui.toast('Route data could not load. Please refresh.');
  throw err;
}

// The airfield/circuit reference layer (Phase 2) is supplementary — if it fails to
// load, the flight simulator above should still work, so this failure doesn't stop
// the rest of app.js the way a routes.json failure does.
let airfieldAvailable = true;
try {
  await airport.loadAirportData();
  loadCircuits();
} catch (err) {
  console.warn('Airfield/circuit reference data failed to load:', err);
  airfieldAvailable = false;
}

ui.initDialogs();
ui.wireAudioControls();

// Break the import cycles described above: each module calls one of these instead of
// importing the module that would otherwise need to import it back.
map.setInteractionHandler(playback.refresh);
playback.setQuizHandler(quiz.beginQuestion);
progress.setContextChangeHandler(() => {
  playback.reset();
  rebuildTrace();
  map.refreshRouteVisuals();
});

quiz.wireQuizDialog();
playback.wireControls();
progress.wireLearnerDialog();
progress.wireProgressDialog();
progress.wireProfileImport();
settings.init();
map.wireViewControls();

// Route / mode selection. Changing route resets the flight-profile picker back to the
// demo profile (imported profiles are recorded per-route) and refits the camera;
// changing mode only needs a fresh session.
ui.all('[data-route]').forEach((b) => {
  b.onclick = () => {
    state.route =
      b.dataset.route === 'circuit' ? `circuit${airport.airportState.activeRunway}` : b.dataset.route;
    if (!models[state.route]) {
      state.route = 'outer';
      ui.toast('Circuit unavailable; using the legacy loop.');
    }
    progress.profileOptions();
    playback.reset();
    rebuildTrace();
    map.refreshRouteVisuals();
    map.fit();
  };
});
ui.all('[data-mode]').forEach((b) => {
  b.onclick = () => {
    state.mode = b.dataset.mode;
    playback.reset();
  };
});

ui.$('flight-profile').onchange = (e) => progress.setProfile(e.target.value);

// Wind scenario sliders — changing any of them restarts the session so the logged
// score and ground track reflect one consistent wind, rather than mixing scenarios
// mid-attempt.
function windChanged() {
  state.windFrom = +ui.$('wind-from').value;
  state.windSpeed = +ui.$('wind-speed').value;
  state.correctWind = ui.$('compensate').checked;
  ui.text('wind-from-value', headingText(state.windFrom));
  ui.text('wind-speed-value', state.windSpeed + ' kt');
  const wasStarted = state.started;
  playback.reset();
  rebuildTrace();
  map.refreshRouteVisuals();
  playback.refresh();
  if (wasStarted) {
    ui.callout(
      'NEW WIND SCENARIO',
      'The session restarted so your score and ground track reflect one consistent wind scenario.',
      false,
    );
  }
}
ui.$('wind-from').oninput = windChanged;
ui.$('wind-speed').oninput = windChanged;
ui.$('compensate').onchange = windChanged;

// --- Bootstrap ------------------------------------------------------------------
// Order matters here: rebuildTrace() draws the SVG fallback diagram immediately
// (map.init() hasn't run yet, so there's no Cesium viewer to draw into instead); if
// map.init() goes on to create a working Cesium viewer, the SVG stays hidden.
progress.profilesUI();
progress.profileOptions();
rebuildTrace();
map.refreshRouteVisuals();
playback.reset();
wireRecording();
wireAccount();
await map.init();
// Pilot is the default camera mode, but only once a Cesium viewer actually exists to
// put it in that mode (state.js's raw `view: 'overview'` stays as the pre-viewer
// value — see its comment). Going through setView() rather than hand-setting
// state.view/state.pitch here keeps this in one place: it also sets the zoomed-in
// field of view and fires the look-around hint toast, exactly as if the pilot had
// clicked the Pilot tab themselves. Falls back to Overview (map.init()'s own default)
// if WebGL isn't available, same as switching to Pilot manually would.
map.setView('pilot');
if (airfieldAvailable) {
  airfield.init(() => {
    if (!state.route.startsWith('circuit')) return;
    state.route = `circuit${airport.airportState.activeRunway}`;
    progress.profileOptions();
    playback.reset();
    rebuildTrace();
    map.refreshRouteVisuals();
    map.fit();
  });
} else {
  ui.$('airfield-panel')?.setAttribute('hidden', '');
}
playback.startLoop();
