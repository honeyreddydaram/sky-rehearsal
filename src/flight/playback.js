// playback.js
// The simulation clock: advances progress along the route, gates waypoints/quiz
// checkpoints/custom callouts as they're reached, and keeps the telemetry HUD
// (heading/altitude/speed/etc) and waypoint sidebar in sync. Also owns session
// completion (finish()), which is where a guided/quiz attempt gets logged.
//
// playback.js does not import quiz.js. When the simulation clock hits a quiz
// checkpoint it needs to open a question, but quiz.js also needs to call back into
// this module (reset(), refresh()) when an attempt ends — importing each other would
// create a cycle. Instead app.js registers quiz.beginQuestion via setQuizHandler().

import {replay} from './recording.mjs';
import {distance, at, headingText} from './core.mjs';
import {state, demo, routeLabel, flightFrame, models, waypoints, stateAt, secondsAt} from './state.js';
import {$, all, text, toast, callout, selectStates, showDialog} from '../ui/ui.js';
import {renderPosition} from '../map/map.js';
import {learner, save} from '../progress/progress.js';

let onQuizCheckpoint = null;
export function setQuizHandler(fn) {
  onQuizCheckpoint = fn;
}

let last = performance.now();
let uiStamp = 0;

// --- Waypoint sidebar -------------------------------------------------------------

export function waypointList() {
  const list = $('waypoints');
  list.replaceChildren();
  waypoints().forEach((w, i) => {
    const li = document.createElement('li');
    const b = document.createElement('button');
    const num = document.createElement('span');
    const title = document.createElement('span');
    num.className = 'num';
    num.textContent = String(i + 1).padStart(2, '0');
    title.textContent = w.name;
    b.append(num, title);
    b.onclick = () => {
      if (state.mode === 'quiz') {
        toast('Complete each question in order during a quiz.');
        return;
      }
      state.playing = false;
      state.t = w.p;
      state.eligible = false; // jumping ahead means this attempt won't be logged
      state.seen = new Set(
        waypoints()
          .map((x, j) => (x.p <= state.t ? j : -1))
          .filter((j) => j >= 0),
      );
      callout(w.name, w.cue);
      refresh();
    };
    li.append(b);
    list.append(li);
  });
}

// --- Session lifecycle --------------------------------------------------------------

export function reset() {
  replay.stop?.();
  state.playing = false;
  state.started = false;
  state.eligible = true;
  state.completed = false;
  state.seen.clear();
  state.customSeen.clear();
  state.answers = [];
  state.pending = null;
  state.t = 0;
  state.sessionId = crypto.randomUUID();
  if ($('quiz-dialog').open) $('quiz-dialog').close();
  window.speechSynthesis?.cancel();
  waypointList();
  selectStates(state);
  refresh();
  callout(
    'READY WHEN YOU ARE',
    state.mode === 'quiz'
      ? 'The flight will pause before each checkpoint. Answer five questions to complete your attempt.'
      : 'Start your rehearsal. Listen for cues, pause, and look around.',
    false,
  );
}

// Redraws every HUD element (telemetry numbers, waypoint list highlight, map/plane
// position) from the current state. Cheap enough to call after any state change;
// the animation loop throttles how often it calls this during playback (see tick()).
export function refresh() {
  const s = stateAt(state.t);
  text('heading', s.possible ? headingText(s.heading) : '—');
  const isAmsl = state.profile.altitudeReference === 'MSL';
  text('altitude', Math.round(s.altitudeFt).toLocaleString() + (isAmsl ? ' ft AMSL' : ' ft'));
  text(
    'altitude-label',
    'ALTITUDE · ' + (state.profile === demo ? 'DEMO' : isAmsl ? 'AMSL' : 'ELLIPSOID (GPS)'),
  );
  text('airspeed', Math.round(s.tasKt) + ' kt');
  text('groundspeed', s.possible ? Math.round(s.groundspeed) + ' kt' : '—');
  text('track', s.possible ? headingText(s.track) : '—');
  text('crosswind', Math.abs(s.crosswind || 0).toFixed(1) + ' kt');
  text(
    'correction',
    s.possible ? (state.correctWind ? s.correction.toFixed(1) + '°' : 'Off') : 'Not feasible',
  );
  text('drift', (distance(at(models[state.route], state.t), s.position) / 1852).toFixed(2) + ' NM');
  text('percentage', Math.round(state.t * 100) + '%');
  const sec = Math.round(secondsAt(state.t));
  text(
    'elapsed',
    `${String(Math.floor(sec / 60)).padStart(2, '0')}:${String(sec % 60).padStart(2, '0')} elapsed`,
  );
  $('timeline').value = Math.round(state.t * 1000);
  $('timeline').disabled = state.mode === 'quiz';
  text(
    'play',
    state.playing
      ? 'Pause'
      : state.completed
        ? 'Practice again'
        : state.started
          ? 'Resume'
          : 'Start rehearsal',
  );
  text('route-distance', (models[state.route].total / 1852).toFixed(1) + ' NM');
  // Use the same integrated schedule and wind as live playback.
  text('route-duration', Math.round(secondsAt(1) / 60) + ' min');
  text(
    'flight-phase',
    s.phase
      ? `${routeLabel()} · ${s.phase} · ${Math.round(flightFrame(state.t).altitudeFt)} ft / ${Math.round(s.tasKt)} kt targets (demo)`
      : routeLabel(),
  );
  all('#waypoints li').forEach((li, i) => {
    li.classList.toggle('passed', state.seen.has(i));
    li.classList.toggle('active', !state.seen.has(i) && (i === 0 || state.seen.has(i - 1)));
  });
  renderPosition(s);
}

function finish() {
  state.playing = false;
  state.completed = true;
  const loggable =
    state.eligible && state.mode !== 'explore' && (state.mode !== 'quiz' || state.answers.length === 5);
  if (loggable) {
    const record = {
      id: state.sessionId,
      route: state.route,
      mode: state.mode,
      completedAt: new Date().toISOString(),
      score: state.mode === 'quiz' ? state.answers.filter((a) => a.passed).length : null,
      total: state.mode === 'quiz' ? 5 : null,
      profile: state.profile.name,
      windFrom: state.windFrom,
      windSpeed: state.windSpeed,
      correctWind: state.correctWind,
      answers: [...state.answers],
    };
    if (!learner().sessions.some((s) => s.id === record.id)) {
      learner().sessions.push(record);
      learner().sessions = learner().sessions.slice(-300);
      save();
    }
    text('result-title', state.mode === 'quiz' ? `${record.score} / 5 — quiz complete` : 'Route rehearsed');
    text('result-body', `${routeLabel()} saved to ${learner().name}’s flight log.`);
    $('result-review').replaceChildren();
    state.answers.forEach((a) => {
      const p = document.createElement('p');
      p.className = 'review-row';
      p.textContent = (a.passed ? '✓ ' : '↺ ') + a.waypoint + ' · ' + a.correct;
      $('result-review').append(p);
    });
    showDialog('results-dialog');
  } else {
    callout(
      'EXPLORATION COMPLETE',
      'Start a full guided rehearsal or quiz to add a session to your flight log.',
      false,
    );
  }
  refresh();
}

// Advances the simulation by dt seconds, gating waypoints/quiz checkpoints/custom
// profile callouts as progress crosses them.
function step(dt) {
  if (!state.playing || document.hidden) return;
  const s = stateAt(state.t);
  if (!s.possible) {
    state.playing = false;
    toast('This wind is too strong for the selected airspeed and track. Reduce wind speed.');
    refresh();
    return;
  }
  const next = Math.min(1, state.t + (dt * state.rate * s.alongSpeed * 0.514444) / models[state.route].total);
  for (const [i, w] of waypoints().entries()) {
    // In quiz mode the gate sits slightly before the waypoint so the question
    // appears just ahead of it, not exactly on top of it.
    const gate = state.mode === 'quiz' ? Math.max(0, w.p - 0.028) : w.p;
    if (!state.seen.has(i) && state.t <= gate && next >= gate) {
      state.t = gate;
      if (state.mode === 'quiz') {
        onQuizCheckpoint?.(i);
        return;
      }
      state.seen.add(i);
      if (state.mode === 'guided') callout(w.name, w.cue);
    }
  }
  for (const [i, c] of (state.profile.callouts || []).entries()) {
    if (!state.customSeen.has(i) && c.progress >= state.t && c.progress <= next) {
      state.customSeen.add(i);
      if (state.mode === 'guided') callout('PROFILE CALLOUT', c.text);
    }
  }
  state.t = next;
  if (state.t >= 1) finish();
}

function tick(now) {
  const dt = Math.min((now - last) / 1000, 0.15);
  last = now;
  step(dt);
  if (state.playing && now - uiStamp > 80) {
    refresh();
    uiStamp = now;
  }
  requestAnimationFrame(tick);
}

export function startLoop() {
  requestAnimationFrame(tick);
}

// Called once a quiz question has been answered and the pilot presses "Continue
// flight" (see quiz.js). Marks the checkpoint seen and resumes playback.
export function resumeAfterCheckpoint(index) {
  state.seen.add(index);
  const w = waypoints()[index];
  callout(w.name, w.cue);
  state.pending = null;
  state.playing = true;
  last = performance.now();
  refresh();
}

export function wireControls() {
  $('play').onclick = () => {
    if (state.pending !== null) {
      showDialog('quiz-dialog');
      return;
    }
    if (state.completed) reset();
    if (!state.started) {
      state.started = true;
      if (state.t !== 0) state.eligible = false; // resuming mid-route won't be logged
      callout(
        state.mode === 'quiz' ? 'QUIZ FLIGHT' : 'REHEARSAL IN PROGRESS',
        'Follow the route and study the surroundings.',
      );
    }
    state.playing = !state.playing;
    last = performance.now();
    refresh();
  };
  $('restart').onclick = reset;
  $('rate').onchange = (e) => {
    state.rate = +e.target.value;
  };
  $('timeline').oninput = (e) => {
    if (state.mode === 'quiz') return;
    state.t = +e.target.value / 1000;
    state.playing = false;
    state.eligible = false;
    state.completed = false;
    state.seen = new Set(
      waypoints()
        .map((w, i) => (w.p <= state.t ? i : -1))
        .filter((i) => i >= 0),
    );
    state.customSeen = new Set(
      (state.profile.callouts || []).map((w, i) => (w.progress <= state.t ? i : -1)).filter((i) => i >= 0),
    );
    refresh();
  };
}
