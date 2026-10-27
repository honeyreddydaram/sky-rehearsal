import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {validateAirportPackage, packageCircuit} from '../src/aviation/package.mjs';
import {buildCircuit} from '../src/flight/circuit.mjs';
import {validateProfile, validateProgressBackup} from '../src/flight/core.mjs';
import {checkReadback, radioExercise} from '../src/training/radio.mjs';
const read = (name) => JSON.parse(readFileSync(`public/data/airports/${name}.json`, 'utf8'));
const vohy = validateAirportPackage(read('vohy')),
  synthetic = validateAirportPackage(read('synthetic'));
const refs = Object.fromEntries(vohy.circuits.map((c) => [c.runway, c]));
for (const circuit of vohy.circuits) {
  const result = packageCircuit(circuit),
    original = buildCircuit(vohy.airport, refs, circuit.runway);
  assert.deepEqual(result.model, original.model, 'migration must preserve all legacy vertices and distances');
  assert.deepEqual(
    result.stages.map((s) => [s.start, s.end, s.altitudeFt, s.speedKt]),
    original.stages.map((s) => [s.start, s.end, s.altitudeFt, s.speedKt]),
  );
}
assert.ok(packageCircuit(synthetic.circuits[0]).model.total > 1000);
for (const mutate of [
  (d) => (d.geoidOffsetM = 999),
  (d) => (d.airport.referencePoint.lat = 90),
  (d) => (d.circuits[0].points[1] = d.circuits[0].points[0]),
  (d) => (d.circuits[0].runway = '__proto__'),
  (d) => (d.review = {status: 'reviewed'}),
  (d) => (d.circuits[0].altitudesFt[0] = -1),
]) {
  const invalid = structuredClone(synthetic);
  mutate(invalid);
  assert.throws(() => validateAirportPackage(invalid));
}
assert.ok(checkReadback('Alpha final runway one eight left', radioExercise('18L', 'final', 'Alpha')).passed);
const profile = validateProfile({
  schemaVersion: 1,
  route: 'circuit18',
  airportId: 'ZZZZ',
  airportRevision: 'synthetic-v1',
  name: 'Test',
  source: 'Synthetic',
  altitudeReference: 'ELLIPSOID',
  frames: [
    {progress: 0, altitudeFt: 1000, tasKt: 60},
    {progress: 1, altitudeFt: 1000, tasKt: 60},
  ],
});
assert.equal(profile.airportId, 'ZZZZ');
assert.equal(
  validateProgressBackup({
    schemaVersion: 1,
    learner: {
      name: 'Test',
      flightProfiles: [],
      sessions: [
        {
          route: 'circuit18',
          airportId: 'ZZZZ',
          airportRevision: 'synthetic-v1',
          mode: 'guided',
          completedAt: new Date().toISOString(),
          profile: 'Demo',
        },
      ],
    },
  }).sessions[0].airportId,
  'ZZZZ',
);
console.log(
  'Airport packages passed: migration equivalence, generic geometry, provenance, runway IDs and airport-scoped persistence.',
);
