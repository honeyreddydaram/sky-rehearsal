import assert from 'node:assert/strict';
import {validateScenario, studentSummary} from '../src/training/school.mjs';
const config = {
  airport: 'VOHY',
  runway: '27',
  aircraft: 'demo',
  performance: null,
  weather: 'westerly',
  windFrom: 270,
  windSpeed: 10,
  mode: 'landmarks',
  difficulty: 'beginner',
  requiredScore: 80,
};
assert.equal(validateScenario(config).windSpeed, 10);
for (const changes of [{windSpeed: 36}, {aircraft: 'c152'}, {weather: '__proto__'}, {mode: 'unknown'}])
  assert.throws(() => validateScenario({...config, ...changes}));
assert.deepEqual(studentSummary([]), {attempts: 0, first: null, latest: null, weak: []});
assert.deepEqual(
  studentSummary([
    {score: 40, completedAt: '2026-01-01'},
    {score: 80, completedAt: '2026-02-01'},
    {score: null},
  ]),
  {attempts: 2, first: 40, latest: 80, weak: []},
);
console.log('School scenario and progress summary tests passed');

// Recall gaps come from the stored deterministic breakdown, never an AI estimate.
const {assessFlight} = await import('../src/training/assessment.mjs');
const reference = [0, 1].map((progress) => ({
  timestamp: progress * 1000,
  position: [78 + progress * 0.001, 17],
  height: 600,
  heading: 90,
  course: 90,
  tasKt: 90,
  progress,
  phase: 'downwind',
}));
const report = assessFlight({
  samples: reference,
  reference,
  source: 'simulation',
  verified: false,
  referenceName: 'Synthetic fixture',
  answers: [
    {skill: 'landmark', passed: false},
    {skill: 'landmark', passed: true},
  ],
});
assert.deepEqual(studentSummary([{score: 50, completedAt: '2026-01-01', debrief: report}]).weak, [
  {name: 'landmark', percent: 50},
]);
