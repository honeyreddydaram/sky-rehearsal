import {cloud} from '../cloud/firebase.ts';
import {state} from '../flight/state.js';
import {airportState, selectedAircraft} from '../aviation/airport.js';
import {$, text} from '../ui/ui.js';
import {radioExercise, checkReadback} from './radio.mjs';

let exercise = null,
  recorder = null,
  stream = null,
  timer = null,
  request = null,
  generation = 0;
function stopMicrophone() {
  clearTimeout(timer);
  if (recorder?.state === 'recording') recorder.stop();
  stream?.getTracks().forEach((track) => track.stop());
  stream = null;
  $('radio-stop').disabled = true;
}
export function resetRadio() {
  generation++;
  request?.abort();
  stopMicrophone();
  exercise = null;
  text('radio-tower', 'Choose a tower prompt.');
  text('radio-result', '');
  $('radio-readback').value = '';
  for (const id of ['radio-check', 'radio-listen', 'radio-record']) $(id).disabled = true;
}
export function wireRadio(refresh) {
  $('radio-new').onclick = () => {
    resetRadio();
    if (state.mode === 'exam') {
      text('radio-result', 'Radio practice is separate from exams. Choose a practice mode.');
      return;
    }
    if (!state.route.startsWith('circuit')) {
      text('radio-result', 'Choose a runway circuit for radio practice.');
      return;
    }
    state.playing = false;
    refresh();
    exercise = radioExercise(
      airportState.activeRunway,
      $('radio-phase').value,
      selectedAircraft()?.callSign ?? 'November',
    );
    text('radio-tower', `Tower (training): ${exercise.tower}`);
    for (const id of ['radio-check', 'radio-listen', 'radio-record']) $(id).disabled = false;
  };
  $('radio-phase').onchange = resetRadio;
  $('radio-listen').onclick = () => {
    if (!exercise || !window.speechSynthesis) return;
    window.speechSynthesis.cancel();
    window.speechSynthesis.speak(new SpeechSynthesisUtterance(exercise.tower));
  };
  $('radio-check').onclick = () => {
    if (!exercise) return;
    const result = checkReadback($('radio-readback').value, exercise);
    text(
      'radio-result',
      result.passed
        ? 'Readback contains the expected call sign, leg and runway. This is a limited text check, not an ATC qualification.'
        : `Review: ${result.missing.join(', ')}. Training example: ${exercise.expected}`,
    );
  };
  $('radio-stop').onclick = stopMicrophone;
  $('radio-record').onclick = async () => {
    const user = cloud?.auth.currentUser;
    if (!exercise || !user) {
      text('radio-result', 'Sign in for Google transcription, or type your readback.');
      return;
    }
    if (
      !navigator.mediaDevices?.getUserMedia ||
      !window.MediaRecorder ||
      !MediaRecorder.isTypeSupported('audio/webm;codecs=opus')
    ) {
      text('radio-result', 'WebM/Opus recording is unavailable in this browser. Type your readback.');
      return;
    }
    const current = ++generation;
    const valid = () => current === generation && cloud.auth.currentUser?.uid === user.uid;
    $('radio-record').disabled = true;
    try {
      const acquired = await navigator.mediaDevices.getUserMedia({
        audio: {sampleRate: 48000, channelCount: 1},
      });
      if (!valid()) {
        acquired.getTracks().forEach((track) => track.stop());
        return;
      }
      stream = acquired;
      const chunks = [];
      let size = 0;
      recorder = new MediaRecorder(stream, {mimeType: 'audio/webm;codecs=opus', audioBitsPerSecond: 32000});
      recorder.ondataavailable = (event) => {
        chunks.push(event.data);
        size += event.data.size;
        if (size > 1000000) stopMicrophone();
      };
      recorder.onstop = async () => {
        if (!valid()) return;
        try {
          const blob = new Blob(chunks, {type: 'audio/webm'});
          if (blob.size < 1 || blob.size > 1000000) throw Error('Audio too large or empty');
          text('radio-result', 'Transcribing with Google Cloud…');
          const audio = await new Promise((resolve, reject) => {
            const reader = new FileReader();
            reader.onload = () => resolve(String(reader.result).split(',')[1]);
            reader.onerror = reject;
            reader.readAsDataURL(blob);
          });
          const token = await user.getIdToken();
          if (!valid()) return;
          request = new AbortController();
          const timeout = setTimeout(() => request?.abort(), 20000);
          try {
            const response = await fetch('/api/radio/transcribe', {
              method: 'POST',
              headers: {'Content-Type': 'application/json', Authorization: `Bearer ${token}`},
              body: JSON.stringify({audio}),
              signal: request.signal,
            });
            if (!response.ok) throw Error('Transcription unavailable');
            const result = await response.json();
            if (typeof result.transcript !== 'string' || result.transcript.length > 500)
              throw Error('Invalid transcript');
            if (valid()) {
              $('radio-readback').value = result.transcript;
              text('radio-result', 'Google transcript ready. Review it, then check the readback.');
            }
          } finally {
            clearTimeout(timeout);
          }
        } catch {
          if (valid()) text('radio-result', 'Transcription unavailable. Type your readback instead.');
        } finally {
          if (valid()) $('radio-record').disabled = false;
        }
      };
      recorder.start(1000);
      $('radio-stop').disabled = false;
      text('radio-result', 'Recording — stop to send for transcription (15 second limit).');
      timer = setTimeout(stopMicrophone, 15000);
    } catch {
      stopMicrophone();
      if (valid()) {
        $('radio-record').disabled = false;
        text('radio-result', 'Microphone unavailable. Type your readback instead.');
      }
    }
  };
  resetRadio();
}
