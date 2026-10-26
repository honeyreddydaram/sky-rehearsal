// progress.js
// Per-learner data: the localStorage-backed store of learners/sessions/imported
// flight profiles, the profile picker + altitude chart, and backup/profile import.
// Everything here stays on this browser — see README "Practice" for the user-facing
// disclosure.
//
// progress.js does not import playback.js or map.js. A few flows here (switching
// learner, importing a profile, restoring a backup) need the simulation reset and the
// route trace rebuilt afterward — but playback.js already needs `learner`/`save` from
// THIS file (to log a finished session), so importing playback.js back would create a
// cycle. Instead app.js registers a callback via setContextChangeHandler() and we call
// that instead of importing playback.js/state.js's rebuildTrace/map.js directly. This
// is the same inversion-of-control trick used in map.js (setInteractionHandler) and
// playback.js (setQuizHandler) — see README "Architecture".

import {profileAt, validateProfile, validateProgressBackup} from '../flight/core.mjs';
import {state, demo, EGM2008_UNDULATION_M_VOHY} from '../flight/state.js';
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
export function learner() {
  return store.learners.find((p) => p.id === store.active);
}

export function save() {
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
    .flightProfiles.filter((p) => p.route === state.route)
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
  const frames = state.profile.frames;
  const min = Math.min(...frames.map((f) => f.altitudeFt));
  const max = Math.max(...frames.map((f) => f.altitudeFt));
  const lo = min - 100;
  const hi = max + 100;
  const points = Array.from(
    {length: 81},
    (_, i) => `${i * 3},${60 - ((profileAt(frames, i / 80).altitudeFt - lo) / (hi - lo)) * 45}`,
  ).join(' ');
  $('altitude-chart').innerHTML =
    `<path d="M0 60H240" stroke="#344159"/>` +
    `<polyline points="${points}" stroke="#bda7fa" stroke-width="2" fill="none"/>` +
    `<text x="0" y="10" fill="#97a7bf" font-size="9">${Math.round(min)}–${Math.round(max)} ft · ${state.profile === demo ? 'demo' : state.profile.altitudeReference}</text>`;
}

function profileCopy() {
  text(
    'profile-source',
    state.profile === demo
      ? 'Demo altitude and TAS schedule · ft AMSL.'
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
          '” on the screenshot-based route. Confirm the geometry and profile with your instructor before using it for training.',
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
  text('progress-person', learner().name + ' · local browser profile');
  const sessions = learner().sessions;
  const quizzes = sessions.filter((s) => s.mode === 'quiz');
  const best = quizzes.length
    ? Math.max(...quizzes.map((s) => Math.round((s.score / s.total) * 100))) + '%'
    : '—';
  $('progress-stats').replaceChildren();
  for (const [v, l] of [
    [sessions.length, 'Sessions'],
    [new Set(sessions.map((s) => s.route)).size, 'Routes rehearsed'],
    [best, 'Best quiz'],
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
      d.textContent = `${s.route === 'inner' ? 'Inner' : 'Outer'} loop · ${s.mode === 'quiz' ? `Quiz ${s.score}/${s.total}` : 'Guided rehearsal'}`;
      sm.textContent = new Date(s.completedAt).toLocaleString() + ' · ' + s.profile;
      d.append(sm);
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
      if (!file || file.size > 2_000_000) throw new Error('Choose a progress backup under 2 MB.');
      const data = JSON.parse(await file.text());
      const checked = validateProgressBackup(data);
      const restored = {
        id: crypto.randomUUID(),
        name: checked.name.slice(0, 29) + ' (imported)',
        sessions: checked.sessions.map((s) => ({
          id: crypto.randomUUID(),
          route: s.route,
          mode: s.mode,
          completedAt: s.completedAt,
          score: s.score,
          total: s.total,
          profile: s.profile,
          answers: [],
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
      geoidOffsetM: EGM2008_UNDULATION_M_VOHY, // pre-filled for VOHY; adjust for a profile recorded elsewhere
      frames: demo.frames,
      callouts: [{progress: 0.2, text: 'Replace this with your instructor’s waypoint instruction.'}],
    });

  $('import-profile').onchange = async (e) => {
    const file = e.target.files[0];
    try {
      if (!file || file.size > 200_000) throw new Error('Choose a JSON profile under 200 KB.');
      const p = validateProfile(JSON.parse(await file.text()));
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
