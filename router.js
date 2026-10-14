// router.js
// Lightweight hash-based screen router — no framework, no build step, consistent
// with this being a static site. Each top-level screen is a <section class="screen"
// id="screen-NAME"> in index.html; the router shows the one matching location.hash
// and hides the rest. Using the hash (not real paths) means GitHub Pages needs no
// server-side routing config, and back/forward + bookmarking a screen both work for
// free via the browser's native hash history.
//
// "Quiz" in the nav is a redirect, not a fifth screen: quiz flight is a *mode* of
// the existing Rehearsal workspace (data-mode="quiz", already wired in app.js), not
// separate UI. Clicking it sets that mode and lands on #rehearsal — see init() below
// — rather than inventing a static page with nothing live on it.

import {$, all} from './ui.js';
import {state} from './state.js';
import {reset as resetPlayback} from './playback.js';

export const SCREENS = ['overview', 'briefing', 'rehearsal', 'progress'];
const DEFAULT_SCREEN = 'rehearsal'; // where users spend most of their time

// Per-screen "just became visible" hooks — e.g. map.js needs to resize/re-render
// its Cesium canvas on re-entering Rehearsal (a hidden container can leave it with
// a stale size), and progress.js needs to (re)render the flight log on entering
// Progress now that it's a screen rather than a dialog opened on demand. Keeping
// this as a registry rather than one hard-coded import per screen avoids router.js
// needing to import map.js/progress.js directly just for these hooks.
const onShow = {};
export function setScreenShownHandler(screen, fn) {
  onShow[screen] = fn;
}

function parseHash() {
  const name = location.hash.replace(/^#/, '');
  return SCREENS.includes(name) ? name : DEFAULT_SCREEN;
}

function render() {
  const screen = parseHash();
  SCREENS.forEach((name) => {
    $(`screen-${name}`).hidden = name !== screen;
  });
  all('[data-nav]').forEach((link) => {
    const isCurrent =
      link.dataset.nav === screen ||
      (link.dataset.nav === 'quiz' && screen === 'rehearsal' && state.mode === 'quiz');
    link.classList.toggle('active', isCurrent);
    link.setAttribute('aria-current', isCurrent ? 'page' : 'false');
  });
  onShow[screen]?.();
}

// Programmatic navigation.
export function navigate(screen) {
  if (!SCREENS.includes(screen)) return;
  if (parseHash() === screen) {
    render(); // same screen requested again — still re-run its onShow hook
    return;
  }
  location.hash = `#${screen}`; // triggers hashchange -> render()
}

export function currentScreen() {
  return parseHash();
}

export function init() {
  window.addEventListener('hashchange', render);
  all('[data-nav]').forEach((link) => {
    link.onclick = (e) => {
      e.preventDefault();
      if (link.dataset.nav === 'quiz') {
        state.mode = 'quiz';
        resetPlayback(); // same as clicking the in-sidebar Quiz mode button: fresh attempt, syncs .selected states
        navigate('rehearsal');
        render(); // mode changed without a hash change on a same-screen click — repaint nav active-state
      } else {
        navigate(link.dataset.nav);
      }
    };
  });
  render(); // initial paint, whether or not the URL already had a hash
}
