import {normalizeRecording, parseCsv, parseGpx, recordingAt, replay} from '../flight/recording.mjs';
import {refresh} from '../flight/playback.js';
import {state, stateAt} from '../flight/state.js';
import {renderPosition, setRecording} from '../map/map.js';
import {$, text} from '../ui/ui.js';

export function wireRecording() {
  let recording = null,
    seconds = 0,
    playing = false,
    previous = performance.now(),
    request = 0;
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
    replay.sample = null;
    text('recording-play', 'Replay recording');
    renderPosition(stateAt(state.t));
  };
  replay.stop = stop;
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
      seconds = 0;
      setRecording(recording.points);
      for (const id of ['recording-play', 'recording-clear', 'recording-time']) $(id).disabled = false;
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
    seconds = (Number(event.target.value) / 1000) * recording.duration;
    show();
  };
  $('recording-clear').onclick = () => {
    request++;
    stop();
    recording = null;
    setRecording([]);
    for (const id of ['recording-play', 'recording-clear', 'recording-time']) $(id).disabled = true;
    $('recording-time').value = 0;
    text('recording-status', 'No recorded flight loaded.');
    text('recording-telemetry', '');
  };
  const controls =
    '[data-route], [data-mode], [data-runway], #play, #restart, #timeline, #wind-from, #wind-speed, #compensate, #flight-profile, #profile-open';
  for (const event of ['click', 'input', 'change']) {
    document.addEventListener(
      event,
      (e) => {
        if (e.target.closest(controls)) stop();
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
      if (seconds >= recording.duration) playing = false;
      show();
    }
    previous = now;
    requestAnimationFrame(tick);
  };
  requestAnimationFrame(tick);
}
