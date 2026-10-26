import {validateProgressBackup} from '../src/flight/core.mjs';
import assert from 'node:assert/strict';
import {
  PHASES,
  WEATHER,
  parseMetar,
  usableWeather,
  trueAirspeed,
  turnCharacteristics,
  validatePerformance,
  environmentSnapshot,
  validEnvironment,
} from '../src/aviation/conditions.mjs';
import {radioExercise, checkReadback} from '../src/training/radio.mjs';
const now = new Date('2026-10-26T12:00:00Z');
const report = parseMetar('METAR VOHY 261130Z 27010G20KT 8000 SCT030 30/22 Q1008 NOSIG', now);
assert.equal(report.station, 'VOHY');
assert.equal(report.windFrom, 270);
assert.equal(report.gustKt, 20);
assert.equal(report.qnh, 1008);
assert.equal(report.visibilityM, 8000);
assert.equal(report.observedAt, '2026-10-26T11:30:00.000Z');
assert.equal(usableWeather(report, now).temperature, 30);
assert.throws(() => usableWeather(report, new Date('2026-10-26T14:00:00Z')), /stale/);
assert.throws(
  () => usableWeather(parseMetar('VOHY 261130Z VRB05KT CAVOK 20/10 Q1013', now), now),
  /Variable/,
);
assert.throws(
  () => usableWeather(parseMetar('VOHY 261130Z 27010KT 240V300 CAVOK 20/10 Q1013', now), now),
  /Variable/,
);
assert.throws(() => usableWeather(parseMetar('VOHY 261130Z 27040KT CAVOK 20/10 Q1013', now), now), /35 kt/);
assert.throws(() => usableWeather(parseMetar('VOHY 261130Z 27010KT CAVOK 20/10', now), now), /missing/);
assert.equal(parseMetar('VOHY 261130Z 00000KT CAVOK M02/M05 A2992 TEMPO 27030KT', now).windSpeed, 0);
assert.equal(parseMetar('VOHY 261130Z 27005MPS CAVOK M02/M05 Q1013', now).temperature, -2);
assert.ok(Math.abs(parseMetar('VOHY 261130Z 27005MPS CAVOK M02/M05 Q1013', now).windSpeed - 9.71922) < 0.001);
assert.equal(
  parseMetar('VOHY 302330Z 27010KT CAVOK 20/10 Q1013', new Date('2026-10-01T00:00Z')).observedAt,
  '2026-09-30T23:30:00.000Z',
);
for (const raw of [
  'bad',
  'VOHY 269999Z 27010KT',
  'VOHY 261230Z 27010KT',
  'VOHY 261130Z 99910KT CAVOK 20/10 Q1013',
])
  assert.throws(() => parseMetar(raw, now));
assert.ok(Math.abs(trueAirspeed(100, 0, WEATHER.calm) - 100) < 0.01);
assert.ok(trueAirspeed(100, 2800, WEATHER.westerly, 1740) > trueAirspeed(100, 2800, WEATHER.calm, 1740));
assert.ok(turnCharacteristics(120, 20).radiusM > turnCharacteristics(90, 20).radiusM);
const profile = {
  version: 1,
  typeCode: 'c152',
  source: 'Synthetic test source',
  reference: 'Fixture only, not POH',
  reviewedBy: 'Test reviewer',
  bankDeg: 20,
  phaseSpeedsKias: Object.fromEntries(PHASES.map((p) => [p, 80])),
};
assert.equal(validatePerformance(profile).phaseSpeedsKias.final, 80);
for (const changes of [
  {reviewedBy: ''},
  {typeCode: 'unknown'},
  {bankDeg: 50},
  {phaseSpeedsKias: {final: 65}},
])
  assert.throws(() => validatePerformance({...profile, ...changes}));
const snapshot = environmentSnapshot({...WEATHER.calm, source: 'Training scenario'}, profile);
assert.ok(validEnvironment(snapshot));
assert.ok(!validEnvironment({...snapshot, weather: {...snapshot.weather, qnh: 0}}));
const exercise = radioExercise('27', 'downwind', 'November');
assert.ok(checkReadback('November downwind runway two seven', exercise).passed);
assert.ok(checkReadback('November down wind run way 27', exercise).passed);
for (const phrase of [
  'Bravo downwind runway 27',
  'November base runway 27',
  'November downwind runway 09',
  'November not downwind runway 27',
  'November downwind runway 27 runway 09',
])
  assert.ok(!checkReadback(phrase, exercise).passed, phrase);
assert.ok(checkReadback('November final runway zero niner', radioExercise('09', 'final', 'November')).passed);
console.log(
  'Conditions tests passed: METAR freshness/units, atmosphere, reviewed inputs, snapshots and readbacks.',
);

const backup = {
  schemaVersion: 1,
  learner: {
    name: 'Fixture',
    flightProfiles: [],
    sessions: [
      {
        route: 'circuit27',
        mode: 'guided',
        completedAt: now.toISOString(),
        profile: 'Demo',
        environment: snapshot,
      },
    ],
  },
};
assert.deepEqual(validateProgressBackup(backup).sessions[0].environment, snapshot);
assert.throws(
  () =>
    validateProgressBackup({
      ...backup,
      learner: {
        ...backup.learner,
        sessions: [{...backup.learner.sessions[0], environment: {...snapshot, version: 9}}],
      },
    }),
  /invalid session/,
);
