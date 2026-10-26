import {at, windTriangle} from '../flight/core.mjs';
import {state, models, stateAt, planBearing, secondsAt, flightFrame} from '../flight/state.js';

export function comparisonTrace() {
  const reference = [],
    samples = [];
  for (let i = 0; i <= 240; i++) {
    const progress = i / 240,
      actual = stateAt(progress),
      frame = flightFrame(progress),
      course = planBearing(progress);
    const corrected = windTriangle(course, frame.tasKt, state.windFrom, state.windSpeed, true);
    if (!corrected.possible) throw new Error('This reference track is not feasible in the configured wind.');
    const timestamp = secondsAt(progress) * 1000;
    reference.push({
      timestamp,
      position: at(models[state.route], progress),
      progress,
      height: actual.height,
      heading: corrected.heading,
      course,
      tasKt: frame.tasKt,
      phase: actual.phase,
    });
    samples.push({
      timestamp,
      position: actual.position,
      progress,
      height: actual.height,
      heading: actual.heading,
      headingDerived: false,
      tasKt: actual.tasKt,
      phase: actual.phase,
    });
  }
  return {reference, samples};
}
