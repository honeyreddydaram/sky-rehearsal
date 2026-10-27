import {airport, airportPackage} from '../aviation/airport.js';
// progress.js
// Guest learners use localStorage. A signed-in learner lives separately in memory
// and saves through the injected Firebase callback. Guest data is never implicitly
// merged into an account. This module also owns profile selection and backups.
//
// progress.js does not import playback.js or map.js. A few flows here (switching
// learner, importing a profile, restoring a backup) need the simulation reset and the
// route trace rebuilt afterward — but playback.js already needs `learner`/`save` from
// THIS file (to log a finished session), so importing playback.js back would create a
// cycle. Instead app.js registers a callback via setContextChangeHandler() and we call
// that instead of importing playback.js/state.js's rebuildTrace/map.js directly. This
// is the same inversion-of-control trick used in map.js (setInteractionHandler) and
// playback.js (setQuizHandler) — see README "Architecture".

import {renderDebrief} from '../training/debrief.js';
import {assessed, modeLabel} from '../training/engine.mjs';
import {validateProfile, validateProgressBackup} from '../flight/core.mjs';
import {state, demo, routeLabel, flightFrame, activePerformance, models} from '../flight/state.js';
import {$, text, toast, download, showDialog} from '../ui/ui.js';

const KEY = 'sky-rehearsal-learners-v1';

function loadStore() {
  try {
    const d = JSON.parse(localStorage.getItem(KEY));
    const looksValid =
      d &&
      Array.isArray(d.learners) &&
      d.learners.length &&
      d.learners.every(
        (p) =>
          typeof p.id === 'string' &&
          typeof p.name === 'string' &&
          Array.isArray(p.sessions) &&
          Array.isArray(p.flightProfiles),
      );
    if (looksValid) {
      if (!d.learners.some((p) => p.id === d.active)) d.active = d.learners[0].id;
      return d;
    }
  } catch (err) {
    console.warn('Stored learner data was unreadable, starting fresh:', err);
  }
  return {active: 'default', learners: [{id: 'default', name: 'Learner', sessions: [], flightProfiles: []}]};
}

let store = loadStore();
let cloudLearner = null;
let onCloudSave = null;
export function activateAccount(account, persist = null) {
  cloudLearner = account;
  onCloudSave = persist;
  profileOptions();
  profilesUI();
  renderProgress();
  onContextChange();
}
export function guestProgress() {
  return structuredClone(store.learners.find((p) => p.id === store.active));
}
export function learner() {
  return cloudLearner ?? store.learners.find((p) => p.id === store.active);
}

export function save() {
  if (cloudLearner) {
    const account = cloudLearner;
    text('save-status', 'Saving account progress…');
    void onCloudSave(structuredClone(account))
      .then(() => {
        if (cloudLearner === account) text('save-status', 'Saved to your cloud account');
      })
      .catch(() => {
        if (cloudLearner === account)
          text('save-status', 'Cloud save failed · retry Sync or export a backup before leaving');
      });
    return;
  }
  try {
    localStorage.setItem(KEY, JSON.stringify(store));
    text('save-status', 'Saved for ' + learner().name + ' · this browser');
  } catch (err) {
    console.warn('localStorage write failed:', err);
    text('save-status', 'Storage unavailable · export progress to keep it');
    toast('Browser storage is unavailable. Export your progress before leaving.');
  }
}

let onContextChange = () => {};
export function setContextChangeHandler(fn) {
  onContextChange = fn;
}

// --- Flight profile selection / display --------------------------------------------

export function profileOptions() {
  const select = $('flight-profile');
  select.replaceChildren();
  const opt = document.createElement('option');
  opt.value = 'demo';
  opt.textContent = 'Demo familiarization profile';
  select.append(opt);
  learner()
    .flightProfiles.filter(
      (p) =>
        p.route === state.route &&
        (p.airportId ?? 'VOHY') === (airport?.icao ?? 'VOHY') &&
        (!p.airportRevision || p.airportRevision === airportPackage?.revision),
    )
    .forEach((p) => {
      const o = document.createElement('option');
      o.value = p.id;
      o.textContent = p.name;
      select.append(o);
    });
  select.value = 'demo';
  state.profile = demo;
  profileCopy();
}

function chart() {
  const frames = Array.from({length: 81}, (_, i) => flightFrame(i / 80));
  const min = Math.min(...frames.map((f) => f.altitudeFt));
  const max = Math.max(...frames.map((f) => f.altitudeFt));
  const lo = min - 100;
  const hi = max + 100;
  const points = Array.from(
    {length: 81},
    (_, i) => `${i * 3},${60 - ((frames[i].altitudeFt - lo) / (hi - lo)) * 45}`,
  ).join(' ');
  $('altitude-chart').innerHTML =
    `<path d="M0 60H240" stroke="#344159"/>` +
    `<polyline points="${points}" stroke="#bda7fa" stroke-width="2" fill="none"/>` +
    `<text x="0" y="10" fill="#97a7bf" font-size="9">${Math.round(min)}–${Math.round(max)} ft · ${state.profile === demo ? 'demo' : state.profile.altitudeReference}</text>`;
}

export function profileCopy() {
  text(
    'profile-source',
    state.profile === demo
      ? activePerformance()
        ? `${state.performance.typeCode.toUpperCase()} reviewed-input IAS converted to TAS using scenario density · demo altitude schedule.`
        : 'Demo altitude and TAS schedule · ft AMSL.'
      : state.profile.source +
          ' · ' +
          (state.profile.altitudeReference === 'MSL' ? 'ft AMSL' : 'ellipsoid height') +
          ' · user supplied',
  );
  text(
    'scope-note',
    state.profile === demo
      ? 'Demo geometry and flight values support familiarization. Import a sourced flight profile for your own altitude and airspeed schedule.'
      : 'Using “' +
          state.profile.name +
          '” on the selected rehearsal route. Confirm the geometry and profile with your instructor before using it for training.',
  );
  chart();
}

// Called by app.js when the pilot picks a different flight profile from the dropdown.
export function setProfile(value) {
  state.profile = value === 'demo' ? demo : learner().flightProfiles.find((p) => p.id === value) || demo;
  profileCopy();
  onContextChange();
}

// --- Learner profile dialog ---------------------------------------------------------

export function profilesUI() {
  text('profile-open', learner().name);
  $('profile-list').replaceChildren();
  $('new-profile').hidden = Boolean(cloudLearner);
  $('restore-progress').disabled = Boolean(cloudLearner);
  if (cloudLearner) return;
  store.learners.forEach((p) => {
    const b = document.createElement('button');
    b.textContent = (p.id === store.active ? '✓ ' : '') + p.name;
    b.onclick = () => {
      store.active = p.id;
      save();
      profileOptions();
      profilesUI();
      $('profile-dialog').close();
      onContextChange();
    };
    $('profile-list').append(b);
  });
}

export function wireLearnerDialog() {
  $('profile-open').onclick = () => {
    profilesUI();
    showDialog('profile-dialog');
  };
  $('new-profile').onsubmit = (e) => {
    e.preventDefault();
    const name = $('learner-name').value.trim();
    if (!name) return;
    const p = {id: crypto.randomUUID(), name, sessions: [], flightProfiles: []};
    store.learners.push(p);
    store.active = p.id;
    $('learner-name').value = '';
    save();
    profileOptions();
    profilesUI();
    $('profile-dialog').close();
    onContextChange();
  };
}

// --- Progress dialog (flight log) ---------------------------------------------------

export function renderProgress() {
  text('progress-person', learner().name + (cloudLearner ? ' · cloud account' : ' · local browser profile'));
  const sessions = learner().sessions;
  const quizzes = sessions.filter((s) => assessed(s.mode));
  const best = quizzes.length
    ? Math.max(...quizzes.map((s) => Math.round((s.score / s.total) * 100))) + '%'
    : '—';
  $('progress-stats').replaceChildren();
  for (const [v, l] of [
    [sessions.length, 'Sessions'],
    [new Set(sessions.map((s) => s.route)).size, 'Routes rehearsed'],
    [best, 'Best recall score'],
  ]) {
    const d = document.createElement('div');
    const b = document.createElement('strong');
    const sm = document.createElement('small');
    b.textContent = v;
    sm.textContent = l;
    d.append(b, sm);
    $('progress-stats').append(d);
  }
  $('history').replaceChildren();
  $('history-debrief').replaceChildren();
  if (!sessions.length) {
    const p = document.createElement('p');
    p.textContent = 'Your first completed rehearsal will appear here.';
    $('history').append(p);
  }
  sessions
    .slice(-20)
    .reverse()
    .forEach((s) => {
      const d = document.createElement('div');
      const sm = document.createElement('small');
      d.className = 'history-row';
      d.textContent = `${s.airportId ?? 'VOHY'} · ${routeLabel(s.route)} · ${modeLabel(s.mode)}${assessed(s.mode) ? ` ${s.score}/${s.total}` : ''} · ${s.difficulty ?? 'beginner'} · ${s.hintsUsed ?? 0} hints`;
      sm.textContent = new Date(s.completedAt).toLocaleString() + ' · ' + s.profile;
      d.append(sm);
      if (s.environment) {
        const conditions = document.createElement('small');
        conditions.textContent = `${s.environment.aircraft?.typeCode.toUpperCase() ?? 'Profile schedule'} · ${s.environment.weather.source} · QNH ${s.environment.weather.qnh} hPa · ${s.environment.weather.temperature}°C`;
        d.append(conditions);
      }
      if (s.debrief) {
        const button = document.createElement('button');
        button.textContent = 'View debrief';
        button.onclick = () => renderDebrief($('history-debrief'), s.debrief);
        d.append(button);
      }
      $('history').append(d);
    });
}

export function wireProgressDialog() {
  $('progress-open').onclick = () => {
    renderProgress();
    showDialog('progress-dialog');
  };
  $('export-progress').onclick = () =>
    download('sky-rehearsal-progress.json', {
      schemaVersion: 1,
      exportedAt: new Date().toISOString(),
      learner: learner(),
    });

  $('restore-progress').onchange = async (e) => {
    const file = e.target.files[0];
    try {
      if (!file || file.size > 10_000_000) throw new Error('Choose a progress backup under 10 MB.');
      const data = JSON.parse(await file.text());
      const checked = validateProgressBackup(data);
      const restored = {
        id: crypto.randomUUID(),
        name: checked.name.slice(0, 29) + ' (imported)',
        sessions: checked.sessions.map((s) => ({
          id: crypto.randomUUID(),
          route: s.route,
          ...(s.airportId ? {airportId: s.airportId} : {}),
          ...(s.airportRevision ? {airportRevision: s.airportRevision} : {}),
          mode: s.mode,
          difficulty: s.difficulty ?? 'beginner',
          hintsUsed: s.hintsUsed ?? 0,
          completedAt: s.completedAt,
          score: s.score,
          total: s.total,
          profile: s.profile,
          answers: [],
          debrief: s.debrief ?? null,
          ...(s.environment ? {environment: s.environment} : {}),
          ...(s.windFrom !== undefined ? {windFrom: s.windFrom} : {}),
          ...(s.windSpeed !== undefined ? {windSpeed: s.windSpeed} : {}),
          ...(s.correctWind !== undefined ? {correctWind: s.correctWind} : {}),
        })),
        flightProfiles: checked.flightProfiles.map((f) => ({...validateProfile(f), id: crypto.randomUUID()})),
      };
      store.learners.push(restored);
      store.active = restored.id;
      save();
      profilesUI();
      profileOptions();
      renderProgress();
      toast('Backup imported as a separate learner profile.');
      onContextChange();
    } catch (err) {
      toast(err.message);
    }
    e.target.value = '';
  };
}

// --- Flight profile import -----------------------------------------------------------

export function wireProfileImport() {
  $('import-open').onclick = () => showDialog('import-dialog');
  $('template-download').onclick = () =>
    download('flight-profile-example.json', {
      schemaVersion: 1,
      route: state.route,
      name: 'Example only — replace with your flight data',
      source: 'Replace with instructor or flight recording reference',
      altitudeReference: 'MSL',
      airportId: airport.icao,
      airportRevision: airportPackage.revision,
      geoidOffsetM: airportPackage.geoidOffsetM, // pre-filled for VOHY; adjust for a profile recorded elsewhere
      frames: demo.frames,
      callouts: [{progress: 0.2, text: 'Replace this with your instructor’s waypoint instruction.'}],
    });

  $('import-profile').onchange = async (e) => {
    const file = e.target.files[0];
    try {
      if (!file || file.size > 200_000) throw new Error('Choose a JSON profile under 200 KB.');
      const p = validateProfile(JSON.parse(await file.text()));
      if (
        (p.airportId ?? 'VOHY') !== (airport?.icao ?? 'VOHY') ||
        (p.airportRevision && p.airportRevision !== airportPackage.revision) ||
        !models[p.route] ||
        (!p.route.startsWith('circuit') && airport.icao !== 'VOHY')
      )
        throw Error('Choose the matching airport package before importing this profile.');
      if (learner().flightProfiles.length >= 30)
        throw new Error('This learner already has 30 imported profiles.');
      p.id = crypto.randomUUID();
      learner().flightProfiles.push(p);
      save();
      state.route = p.route; // the profile dictates which loop it was recorded for
      profileOptions(); // rebuilds the <select> for the (possibly new) route...
      $('flight-profile').value = p.id; // ...then we point it at the profile just imported
      state.profile = p;
      profileCopy();
      text(
        'import-message',
        'Loaded ' + p.name + '. Altitude, airspeed, and callouts now follow this profile.',
      );
      toast('Flight profile loaded.');
      onContextChange();
    } catch (err) {
      text('import-message', err.message);
    }
    e.target.value = '';
  };
}
