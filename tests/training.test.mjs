import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {
  MODES,
  DIFFICULTIES,
  assistance,
  assessed,
  questionFor,
  trainingHint,
} from '../src/training/engine.mjs';
import {validateProgressBackup} from '../src/flight/core.mjs';
const circuit = JSON.parse(readFileSync('public/data/circuits/vohy-rwy27.json'));
const waypoints = circuit.legs.map((leg, i) => ({
  ...leg,
  landmarks: leg.checkpoints,
  nextLeg: circuit.legs[i + 1]?.name ?? 'landing',
  cue: 'Reference cue',
}));
for (const mode of MODES) {
  assert.equal(assessed(mode), ['landmarks', 'decisions', 'quiz', 'exam'].includes(mode));
  if (assessed(mode))
    for (let index = 0; index < 5; index++) {
      const q = questionFor({mode, index, waypoints, course: 90});
      assert.equal(q.choices.length, 4);
      assert.equal(new Set(q.choices).size, 4);
      assert.ok(q.choices.includes(q.correct));
      assert.ok(q.explanation);
    }
}
for (const level of DIFFICULTIES) {
  const aids = assistance('exam', level);
  assert.ok(Object.values(aids).every((value) => value === false));
}
assert.equal(assistance('guided', 'intermediate').labels, true);
assert.equal(assistance('guided', 'intermediate').markers, false);
assert.equal(assistance('practice', 'advanced').route, false);
assert.equal(assistance('practice', 'advanced').hints, true);
assert.equal(assistance('guided', 'examiner').hints, false);
assert.equal(assistance('guided', 'invalid').route, false);
assert.match(
  questionFor({mode: 'landmarks', index: 3, waypoints, course: 0}).prompt,
  /location is not confirmed/,
);
assert.equal(
  questionFor({mode: 'decisions', index: 0, waypoints, course: 270, windSpeed: 10}).correct,
  'Apply wind correction',
);
assert.match(
  questionFor({mode: 'decisions', index: 0, waypoints, course: 270, windSpeed: 100, windPossible: false})
    .correct,
  /Pause/,
);
assert.equal(
  questionFor({mode: 'decisions', index: 1, waypoints, course: 180}).correct,
  'Continue to downwind',
);
assert.equal(trainingHint(waypoints[0], 'beginner', 1), 'Reference cue');
assert.notEqual(trainingHint(waypoints[0], 'advanced', 2), 'Reference cue');
const backup = {schemaVersion: 1, learner: {name: 'Student', sessions: [], flightProfiles: []}};
for (const mode of MODES.filter((m) => m !== 'explore')) {
  const session = {
    mode,
    route: 'circuit27',
    profile: 'Demo',
    completedAt: '2026-10-14T00:00:00Z',
    difficulty: 'advanced',
    hintsUsed: 0,
    score: 4,
    total: 5,
  };
  backup.learner.sessions = [session];
  assert.doesNotThrow(() => validateProgressBackup(backup));
  if (assessed(mode)) {
    session.score = 6;
    assert.throws(() => validateProgressBackup(backup));
    session.score = 4;
  }
  session.difficulty = 'unknown';
  assert.throws(() => validateProgressBackup(backup));
}
console.log(
  'Training tests passed: all modes/questions, assistance policy, source gaps, wind decisions and backup compatibility.',
);
