import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {buildCircuit, circuitStage} from '../src/flight/circuit.mjs';
import {at, bearing} from '../src/flight/core.mjs';
const read = (path) => JSON.parse(readFileSync(`public/data/${path}`, 'utf8'));
const airport = read('airport-vohy.json');
const circuits = {27: read('circuits/vohy-rwy27.json'), '09': read('circuits/vohy-rwy09.json')};
const a = buildCircuit(airport, circuits, '27');
const b = buildCircuit(airport, circuits, '09');
assert.deepEqual(b.model.points, [...a.model.points].reverse());
assert.equal(a.verified, false);
assert.equal(a.stages.length, 7);
assert.deepEqual(a.model.points[2], circuits['27'].legs[0].checkpoints.at(-1).coords);
assert.deepEqual(a.model.points[4], circuits['27'].legs[2].checkpoints.at(-1).coords);
// A side landmark must never divert the aircraft off the leg.
assert.ok(
  !a.model.points.some(
    (p) => JSON.stringify(p) === JSON.stringify(circuits['27'].legs[0].checkpoints[0].coords),
  ),
);
for (const circuit of [a, b]) {
  for (const stage of circuit.stages) {
    assert.ok(stage.end > stage.start);
    assert.equal(circuitStage(circuit, (stage.start + stage.end) / 2).name, stage.name);
    assert.deepEqual(at(circuit.model, stage.end), stage.turnPoint);
  }
  assert.equal(circuitStage(circuit, 1).name, 'landing');
  const end = circuit.model.points;
  assert.ok(Math.abs(bearing(end[5], end[6]) - bearing(end[0], end[1])) < 3);
}
const broken = structuredClone(circuits);
broken['27'].legs[0].checkpoints.at(-1).coords = null;
assert.throws(() => buildCircuit(airport, broken, '27'), /Missing turn point/);
console.log(
  'Circuit tests passed: sourced turns, runway direction, phases, missing geometry, side landmarks.',
);
