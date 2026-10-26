import assert from 'node:assert/strict';
import {coachingHint, learningFocus, debriefContext} from '../src/training/coaching.mjs';

const sessions = [
  {
    route: 'circuit27',
    debrief: {recall: {groups: {landmark: {correct: 0, total: 2}, heading: {correct: 2, total: 2}}}},
  },
  {route: 'circuit09', debrief: {recall: {groups: {wind: {correct: 0, total: 5}}}}},
];
assert.deepEqual(learningFocus(sessions, 'circuit27'), {focus: 'landmark', attempts: 1});
assert.deepEqual(learningFocus([], 'circuit27'), {focus: 'recall', attempts: 0});
assert.equal(learningFocus(Array(30).fill(sessions[0]), 'circuit27').attempts, 20);
const input = {
  phase: 'Downwind',
  waypoint: {
    name: 'Checkpoint Secret',
    cue: 'Secret answer',
    landmarks: [{name: 'Secret landmark', side: 'Right'}],
  },
  focus: 'landmark',
  attempts: 3,
};
for (let level = 0; level < 3; level++) {
  const hint = coachingHint({...input, level});
  assert.ok(!JSON.stringify(hint).includes('Secret'));
  assert.equal(hint.context.level, level);
}
assert.match(coachingHint({...input, level: 3}).message, /Secret answer/);
assert.match(coachingHint({...input, level: 2}).message, /right/);
assert.match(coachingHint({...input, waypoint: null, level: 3}).message, /No checkpoint/);
const report = {
  source: 'simulation',
  referenceName: 'unverified example',
  overall: null,
  overallReason: 'No verified reference',
  warnings: ['Automatic simulation'],
  metrics: {airspeed: {score: null, reason: 'No TAS measurement'}},
  recall: {percent: null},
};
const before = structuredClone(report);
const context = debriefContext(report);
assert.match(context.facts.join(' '), /Overall unavailable/);
assert.match(context.facts.join(' '), /No TAS measurement/);
assert.deepEqual(report, before);
assert.ok(context.facts.every((f) => f.length <= 500));
console.log('Coaching tests passed');

assert.equal(context.attempts, null);
assert.ok(!JSON.stringify(context).includes(report.referenceName));
