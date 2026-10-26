import assert from 'node:assert/strict';
import {assessFlight, recallBreakdown, CRITERIA} from '../src/training/assessment.mjs';
import {validDebrief} from '../src/training/debrief-schema.mjs';
import {validateProgressBackup} from '../src/flight/core.mjs';
const phases = ['takeoff', 'upwind', 'crosswind', 'downwind', 'base', 'final', 'landing'];
const reference = Array.from({length: 26}, (_, i) => ({
  timestamp: i * 10000,
  position: [78 + i * 0.001, 17],
  height: 600,
  heading: 90,
  course: 90,
  tasKt: 90,
  phase: phases[Math.min(6, Math.floor(i / 4))],
  progress: i / 25,
}));
const run = (samples = reference, extra = {}) =>
  assessFlight({samples, reference, verified: true, windKnown: true, source: 'recording', ...extra});
const perfect = run();
assert.equal(perfect.overall, 100);
assert.ok(validDebrief(perfect));
assert.deepEqual(run(), perfect, 'same inputs must produce identical reports');
assert.equal(perfect.metrics.altitude.mean, 0);
const noisy = structuredClone(reference);
for (const p of noisy) {
  p.position[1] += 0.002;
  p.height += 150 * 0.3048;
  p.heading = 105;
  p.tasKt = 100;
}
const report = run(noisy);
assert.equal(report.metrics.altitude.score, 50);
assert.equal(report.metrics.heading.score, 50);
assert.equal(report.metrics.airspeed.score, 50);
assert.ok(report.metrics.track.max > 200);
assert.ok(report.events.some((e) => e.kind === 'track'));
assert.ok(report.events.length <= 20);
assert.ok(validDebrief(report));
const wrapped = reference.map((p) => ({...p, heading: 359}));
const wrapRef = reference.map((p) => ({...p, heading: 1}));
assert.equal(
  assessFlight({samples: wrapped, reference: wrapRef, verified: true, windKnown: true}).metrics.heading.mean,
  2,
);
const missing = reference.map(({tasKt: _tasKt, phase: _phase, ...p}) => ({
  ...p,
  headingDerived: true,
  speedKt: 90,
}));
const gps = run(missing, {verified: false, windKnown: false});
assert.equal(gps.metrics.airspeed.score, null);
assert.equal(gps.metrics.heading.score, null);
assert.equal(gps.metrics.turns.score, null);
assert.equal(gps.metrics.trackDirection.score, 100);
assert.equal(gps.overall, null);
assert.ok(validDebrief(gps));
const delayed = reference.map((p, i) => ({...p, timestamp: p.timestamp + (i >= 16 ? 20000 : 0)}));
assert.equal(run(delayed).metrics.turns.max, 20);
const gapped = reference.map((p, i) => ({...p, timestamp: p.timestamp + (i >= 16 ? 60000 : 0)}));
const gaps = run(gapped);
assert.equal(gaps.gapSeconds, 70);
assert.equal(gaps.observedSeconds, 240);
assert.equal(gaps.overall, null);
assert.ok(gaps.warnings.some((w) => w.includes('gaps')));
assert.equal(run(reference.slice(4, 20)).overall, null);
assert.equal(run(reference, {source: 'simulation'}).overall, null);
assert.equal(run(reference, {verified: false}).overall, null);
const partialHeading = reference.map((p, i) => ({...p, headingDerived: i > 0}));
assert.equal(run(partialHeading).overall, null, 'one measured heading cannot validate an entire flight');
const recall = recallBreakdown([
  {type: 'landmark', passed: false},
  {type: 'heading', passed: true},
  {type: 'decision', skill: 'wind', passed: true},
]);
assert.equal(recall.percent, 67);
assert.equal(recall.groups.landmark.percent, 0);
assert.equal(recall.groups.wind.percent, 100);
assert.equal(recallBreakdown([]).percent, null);
assert.doesNotThrow(() => recallBreakdown([{skill: '__proto__', passed: true}]));
const invalid = structuredClone(reference);
invalid[1].timestamp = invalid[0].timestamp;
assert.throws(() => run(invalid), /strictly increasing/);
assert.throws(() => run(reference, {criteria: {...CRITERIA, trackM: 0}}), /tolerances/);
const corrupt = structuredClone(report);
corrupt.metrics.altitude.score = 101;
assert.equal(validDebrief(corrupt), false);
const backup = {
  schemaVersion: 1,
  learner: {
    name: 'Student',
    flightProfiles: [],
    sessions: [
      {
        route: 'circuit27',
        mode: 'guided',
        profile: 'Demo',
        completedAt: '2026-01-01T00:00:00Z',
        debrief: report,
      },
    ],
  },
};
assert.doesNotThrow(() => validateProgressBackup(backup));
backup.learner.sessions[0].debrief = corrupt;
assert.throws(() => validateProgressBackup(backup), /invalid session/);
console.log(
  'Assessment tests passed: deterministic scores, wraparound, missing sensors, phase timing, gaps, partial coverage, recall and report validation.',
);

// Time weighting must not reward a recorder merely for sampling more densely.
const shortReference = [
  {...reference[0], progress: 0},
  {...reference[1], timestamp: 10000, progress: 1},
];
const sampled = (times) =>
  times.map((t) => ({
    ...shortReference[0],
    timestamp: t * 1000,
    progress: t / 10,
    position: [78 + t * 0.0001, 17],
    height: 600 + t * 10 * 0.3048,
    phase: null,
  }));
const compare = (times) =>
  assessFlight({samples: sampled(times), reference: shortReference, verified: false});
assert.ok(Math.abs(compare([0, 1, 10]).metrics.altitude.mean - 50) < 1e-8);
assert.ok(
  Math.abs(
    compare([0, 1, 10]).metrics.altitude.mean -
      compare(Array.from({length: 11}, (_, i) => i)).metrics.altitude.mean,
  ) < 1e-8,
);

const inconsistent = structuredClone(report);
inconsistent.metrics.altitude.mean = null;
assert.equal(validDebrief(inconsistent), false, 'available scores must have actual numerical measurements');
assert.deepEqual(JSON.parse(JSON.stringify(perfect)), perfect);
