import {normalizeRecording, parseCsv, parseGpx, recordingAt, replay} from '../flight/recording.mjs';
import {assessFlight} from '../training/assessment.mjs';
import {comparisonTrace} from '../training/reference.mjs';
import {renderDebrief} from '../training/debrief.js';
import {saveTrack, listTracks, readTrack} from '../cloud/firebase';
import {refresh} from '../flight/playback.js';
import {state, stateAt, routeLabel} from '../flight/state.js';
import {renderPosition, setRecording, showDeviation} from '../map/map.js';
import {$, text} from '../ui/ui.js';

let acceptSharedRecording = null;
export function reviewSharedRecording(track) {
  if (!acceptSharedRecording) throw Error('Recording player is not ready.');
  acceptSharedRecording(track);
}
export function wireRecording() {
  let recording = null,
    seconds = 0,
    playing = false,
    previous = performance.now(),
    request = 0,
    savedRows = null,
    savedName = null,
    savedReference = null,
    savedOffset = null,
    lastReport = null,
    replayEnd = null;
  const show = () => {
    if (!recording) return;
    replay.sample = recordingAt(recording, seconds);
    const s = replay.sample;
    $('recording-time').value = Math.round((seconds / recording.duration) * 1000);
    text('recording-play', playing ? 'Pause recording' : 'Replay recording');
    text(
      'recording-telemetry',
      `${seconds.toFixed(1)} / ${recording.duration.toFixed(1)} s · ${new Date(s.timestamp).toISOString()} · ${(s.altitudeM / 0.3048).toFixed(0)} ft ${recording.reference} · ${s.heading.toFixed(0)}° heading/track · ${s.speedKt.toFixed(1)} kt ground · ${s.verticalSpeedFpm.toFixed(0)} ft/min`,
    );
    renderPosition(s);
  };
  const stop = () => {
    playing = false;
    replayEnd = null;
    replay.sample = null;
    text('recording-play', 'Replay recording');
    renderPosition(stateAt(state.t));
  };
  replay.stop = stop;
  acceptSharedRecording = (track) => {
    const imported = normalizeRecording(track.rows, {
      reference: track.reference,
      geoidOffsetM: track.geoidOffsetM,
    });
    stop();
    state.playing = false;
    refresh();
    recording = imported;
    seconds = 0;
    lastReport = null;
    replayEnd = null;
    savedRows = track.rows;
    savedName = track.name;
    savedReference = track.reference;
    savedOffset = track.geoidOffsetM;
    $('recording-debrief').replaceChildren();
    setRecording(recording.points);
    for (const id of [
      'recording-play',
      'recording-clear',
      'recording-time',
      'recording-save-cloud',
      'recording-assess',
    ])
      $(id).disabled = false;
    text(
      'recording-status',
      `Shared with your school: ${track.name} · ${recording.points.length} points. Original file remains owned by the student.`,
    );
    show();
  };
  $('recording-file').onchange = async (event) => {
    const file = event.target.files[0];
    if (!file) return;
    const current = ++request;
    try {
      if (file.size > 5 * 1024 * 1024) throw new Error('Maximum file size is 5 MB.');
      const content = await file.text();
      if (current !== request) return;
      const rows = /\.csv$/i.test(file.name)
        ? parseCsv(content)
        : /\.gpx$/i.test(file.name)
          ? parseGpx(content)
          : (() => {
              throw new Error('Choose a .gpx or .csv file.');
            })();
      const offset = $('recording-geoid').value.trim();
      const imported = normalizeRecording(rows, {
        reference: $('recording-reference').value,
        geoidOffsetM: offset === '' ? undefined : Number(offset),
      });
      stop();
      state.playing = false;
      refresh();
      recording = imported;
      lastReport = null;
      $('recording-debrief').replaceChildren();
      savedRows = rows;
      savedName = file.name;
      savedReference = $('recording-reference').value;
      savedOffset = offset === '' ? null : Number(offset);
      seconds = 0;
      setRecording(recording.points);
      for (const id of [
        'recording-play',
        'recording-clear',
        'recording-time',
        'recording-save-cloud',
        'recording-assess',
      ])
        $(id).disabled = false;
      text(
        'recording-status',
        `${file.name}: ${recording.points.length} points loaded. Altitude: ${recording.reference}. Replay is not scored.`,
      );
      show();
    } catch (error) {
      text('recording-status', `Import failed: ${error.message}. Previous recording retained.`);
    } finally {
      event.target.value = '';
    }
  };
  $('recording-play').onclick = () => {
    if (!recording) return;
    state.playing = false;
    refresh();
    replayEnd = null;
    if (seconds >= recording.duration) seconds = 0;
    playing = !playing;
    previous = performance.now();
    show();
  };
  $('recording-time').oninput = (event) => {
    if (!recording) return;
    state.playing = false;
    refresh();
    playing = false;
    replayEnd = null;
    seconds = (Number(event.target.value) / 1000) * recording.duration;
    show();
  };
  $('recording-clear').onclick = () => {
    request++;
    stop();
    showDeviation();
    recording = null;
    lastReport = null;
    $('recording-debrief').replaceChildren();
    savedRows = null;
    savedName = null;
    setRecording([]);
    for (const id of [
      'recording-play',
      'recording-clear',
      'recording-time',
      'recording-save-cloud',
      'recording-assess',
    ])
      $(id).disabled = true;
    $('recording-time').value = 0;
    text('recording-status', 'No recorded flight loaded.');
    text('recording-telemetry', '');
  };
  $('recording-assess').onclick = () => {
    try {
      if (!recording) throw new Error('Import a recording first.');
      stop();
      state.playing = false;
      refresh();
      const {reference} = comparisonTrace();
      const report = assessFlight({
        samples: recording.points,
        reference,
        source: 'recording',
        referenceName: routeLabel() + ' · ' + state.profile.name,
        verified: false,
        windKnown: false,
      });
      lastReport = report;
      renderDebrief($('recording-debrief'), report, (event) => {
        seconds = Math.max(0, event.atSeconds - 5);
        playing = true;
        replayEnd = Math.min(recording.duration, event.atSeconds + 5);
        previous = performance.now();
        show();
      });
    } catch (error) {
      text('recording-status', `Comparison unavailable: ${error.message}`);
    }
  };
  $('recording-save-cloud').onclick = async () => {
    try {
      if (!savedRows) throw new Error('Import a flight first.');
      await saveTrack(savedName, savedRows, savedReference, savedOffset, lastReport);
      text('recording-status', 'Flight saved to your account.');
    } catch (error) {
      text('recording-status', `Cloud save failed: ${error.message}`);
    }
  };
  $('recording-list-cloud').onclick = async () => {
    try {
      const tracks = await listTracks();
      $('recording-cloud-list').replaceChildren();
      for (const track of tracks) {
        const option = document.createElement('option');
        option.value = track.id;
        option.textContent = track.name;
        $('recording-cloud-list').append(option);
      }
      text('recording-status', `${tracks.length} account flights available.`);
    } catch (error) {
      text('recording-status', `Cloud list failed: ${error.message}`);
    }
  };
  $('recording-load-cloud').onclick = async () => {
    try {
      const track = await readTrack($('recording-cloud-list').value);
      const imported = normalizeRecording(track.rows, {
        reference: track.reference,
        geoidOffsetM: track.geoidOffsetM,
      });
      stop();
      state.playing = false;
      refresh();
      recording = imported;
      lastReport = null;
      $('recording-debrief').replaceChildren();
      seconds = 0;
      savedRows = track.rows;
      savedName = track.name;
      savedReference = track.reference;
      savedOffset = track.geoidOffsetM;
      setRecording(recording.points);
      for (const id of [
        'recording-play',
        'recording-clear',
        'recording-time',
        'recording-save-cloud',
        'recording-assess',
      ])
        $(id).disabled = false;
      if (track.debrief) {
        lastReport = track.debrief;
        renderDebrief($('recording-debrief'), track.debrief);
      }
      text('recording-status', `${track.name}: ${recording.points.length} points loaded from account.`);
      show();
    } catch (error) {
      text('recording-status', `Cloud load failed: ${error.message}. Previous recording retained.`);
    }
  };
  window.addEventListener('account-changed', () => {
    $('recording-cloud-list').replaceChildren();
    // Do not leave a signed-out account's private recording visible on a shared screen.
    $('recording-clear').click();
  });
  const controls =
    '[data-route], [data-mode], [data-runway], #play, #restart, #timeline, #wind-from, #wind-speed, #compensate, #flight-profile, #profile-open, #difficulty, #weather-scenario, #weather-apply, #performance-type, #performance-file, #aircraft-select';
  for (const event of ['click', 'input', 'change']) {
    document.addEventListener(
      event,
      (e) => {
        if (e.target.closest(controls)) stop();
        if (
          e.target.closest(
            '[data-route], [data-runway], #wind-from, #wind-speed, #compensate, #flight-profile, #import-profile, #weather-scenario, #weather-apply, #performance-type, #performance-file, #aircraft-select',
          )
        ) {
          lastReport = null;
          $('recording-debrief').replaceChildren();
        }
      },
      true,
    );
  }
  const tick = (now) => {
    if (playing && recording && !document.hidden) {
      seconds = Math.min(
        recording.duration,
        seconds + Math.min((now - previous) / 1000, 0.25) * Number($('recording-rate').value),
      );
      if (replayEnd !== null && seconds >= replayEnd) {
        seconds = replayEnd;
        playing = false;
        replayEnd = null;
      }
      if (seconds >= recording.duration) playing = false;
      show();
    }
    previous = now;
    requestAnimationFrame(tick);
  };
  requestAnimationFrame(tick);
}
