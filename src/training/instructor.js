import {airport} from '../aviation/airport.js';
import {windTriangle} from '../flight/core.mjs';
import {state, stateAt, waypoints} from '../flight/state.js';
import {learner} from '../progress/progress.js';
import {assistance, assessed} from './engine.mjs';
import {coachingHint, learningFocus} from './coaching.mjs';
import {addGeminiExplanation} from './instructor-service.js';
import {$} from '../ui/ui.js';

let level = 0;
let lastCheckpoint = '';
export function resetInstructor() {
  level = 0;
  lastCheckpoint = '';
  const allowed = assistance(state.mode, state.difficulty).hints && !assessed(state.mode);
  $('instructor-hint').disabled = !allowed;
  $('instructor-content').replaceChildren();
  $('instructor-policy').textContent = allowed
    ? 'Progressive study hints adapt to your recent recall results on this route.'
    : 'Instructor coaching is unavailable during assessments or at examiner difficulty. Review your debrief after completion.';
}

export function wireInstructor(refresh) {
  $('instructor-hint').onclick = () => {
    if (!assistance(state.mode, state.difficulty).hints || assessed(state.mode)) return;
    // Freeze the simulator while reading; requesting help never changes scores.
    state.playing = false;
    refresh();
    const checkpoint = waypoints().find((w) => w.p > state.t) ?? waypoints().at(-1);
    const current = stateAt(state.t);
    const checkpointKey = `${current.phase}|${checkpoint?.name}`;
    if (checkpointKey !== lastCheckpoint) level = 0;
    lastCheckpoint = checkpointKey;
    const learning = learningFocus(learner().sessions, state.route, airport.icao);
    const maxLevel = state.difficulty === 'advanced' ? 0 : state.difficulty === 'intermediate' ? 2 : 3;
    const result = coachingHint({
      phase: current.phase ?? 'Legacy route',
      waypoint: checkpoint,
      level: Math.min(level++, maxLevel),
      ...learning,
    });
    const target = windTriangle(current.course, current.tasKt, state.windFrom, state.windSpeed, true);
    if (target.possible && current.possible) {
      const error = ((current.heading - target.heading + 540) % 360) - 180;
      result.context.facts.push(
        `Automatic simulated true-heading error against the wind-corrected model: ${error.toFixed(1)} degrees. Not measured pilot performance.`,
      );
    }
    state.hintsUsed++;
    const host = $('instructor-content');
    host.replaceChildren();
    const text = document.createElement('p');
    text.textContent = `Local coaching · focus: ${learning.focus} · ${learning.attempts} recent route attempts. ${result.message}`;
    host.append(text);
    addGeminiExplanation(host, result.context);
  };
  resetInstructor();
}
