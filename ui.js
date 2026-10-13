// ui.js
// Small DOM helpers, toasts, dialogs, and spoken/text callouts used across the app.
// Nothing in this module knows about routes, flight state, or Cesium — it only touches
// the DOM, so every other module can import it safely with no risk of a circular
// dependency.

export const $ = (id) => document.getElementById(id);
export const all = (selector) => [...document.querySelectorAll(selector)];

export function text(id, value) {
  $(id).textContent = value;
}

let toastTimer;
export function toast(message) {
  text('notification', message);
  $('notification').hidden = false;
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => {
    $('notification').hidden = true;
  }, 6000);
}

export function download(name, data) {
  const blob = new Blob([JSON.stringify(data, null, 2)], {type: 'application/json'});
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = name;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

export function showDialog(id) {
  if (!$(id).open) $(id).showModal();
}

export function say(message) {
  if (!('speechSynthesis' in window)) return;
  window.speechSynthesis.cancel();
  const utterance = new SpeechSynthesisUtterance(message);
  utterance.rate = 0.92;
  utterance.lang = 'en-US';
  window.speechSynthesis.speak(utterance);
}

// Updates the on-screen callout card, and optionally speaks it if the pilot has
// turned on spoken callouts.
export function callout(title, message, speak = true) {
  text('callout-title', title);
  text('callout-text', message);
  if (speak && $('audio').checked) say(message);
}

// Keeps the [data-route]/[data-mode]/[data-view] button groups' .selected class and
// aria-pressed state in sync with the current session state.
export function selectStates(state) {
  all('[data-route]').forEach((b) => {
    b.classList.toggle('selected', b.dataset.route === state.route);
    b.setAttribute('aria-pressed', b.dataset.route === state.route);
  });
  all('[data-mode]').forEach((b) => {
    b.classList.toggle('selected', b.dataset.mode === state.mode);
    b.setAttribute('aria-pressed', b.dataset.mode === state.mode);
  });
  all('[data-view]').forEach((b) => {
    b.classList.toggle('selected', b.dataset.view === state.view);
    b.setAttribute('aria-pressed', b.dataset.view === state.view);
  });
}

export function initDialogs() {
  all('[data-close]').forEach((b) => {
    b.onclick = () => b.closest('dialog').close();
  });
}

export function wireAudioControls() {
  $('audio').onchange = () => {
    if (!('speechSynthesis' in window)) {
      $('audio').checked = false;
      text('audio-state', 'Audio is not supported in this browser. Text callouts remain available.');
    } else if ($('audio').checked) {
      say('Spoken callouts enabled.');
    } else {
      window.speechSynthesis.cancel();
    }
  };
  $('repeat').onclick = () => {
    if ($('audio').checked) say($('callout-text').textContent);
    else toast('Enable spoken callouts to hear the current cue.');
  };
}
