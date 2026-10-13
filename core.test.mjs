import assert from 'node:assert/strict';
import {
  bearing,
  windTriangle,
  driftPoint,
  distance,
  routeModel,
  at,
  profileAt,
  validateProfile,
  validateRouteData,
  validateProgressBackup,
  headingText,
} from './core.mjs';
assert.equal(bearing([0, 0], [0, 1]), 0);
assert.equal(bearing([0, 0], [1, 0]), 90);
assert.equal(headingText(359.8), '000°T');
let w = windTriangle(0, 100, 270, 20, false);
assert.ok(w.track > 0 && w.track < 15);
assert.equal(w.heading, 0);
assert.ok(Math.abs(w.groundspeed - Math.hypot(100, 20)) < 1e-8);
w = windTriangle(0, 100, 270, 20, true);
assert.ok(w.heading > 340);
assert.ok(Math.min(w.track, 360 - w.track) < 1e-8);
assert.ok(w.groundspeed < 100);
assert.equal(windTriangle(0, 60, 270, 80, true).possible, false);
assert.equal(windTriangle(0, 60, 0, 80, true).possible, false);
const still = driftPoint([78.4, 17.4], 600, 0, 0);
assert.deepEqual(still, [78.4, 17.4]);
const drift = driftPoint([78.4, 17.4], 3600, 270, 10);
assert.ok(drift[0] > 78.4);
assert.ok(Math.abs(distance(still, drift) / 1852 - 10) < 0.1);
const model = routeModel([
  [78.4, 17.4],
  [78.5, 17.4],
  [78.5, 17.5],
]);
assert.deepEqual(at(model, 0), [78.4, 17.4]);
assert.deepEqual(at(model, 1), [78.5, 17.5]);
const p = {
  schemaVersion: 1,
  route: 'inner',
  name: 'Test profile',
  source: 'Test fixture',
  altitudeReference: 'ELLIPSOID',
  frames: [
    {progress: 0, altitudeFt: 2700, tasKt: 80},
    {progress: 1, altitudeFt: 3000, tasKt: 100},
  ],
};
assert.equal(validateProfile(p).frames.length, 2);
assert.deepEqual(profileAt(p.frames, 0.5), {altitudeFt: 2850, tasKt: 90});
assert.throws(() => validateProfile({...p, altitudeReference: 'MSL'}));
assert.throws(() => validateProfile({...p, frames: [p.frames[1], p.frames[0]]}));
assert.throws(() =>
  validateProfile({...p, frames: [p.frames[0], {progress: 1, altitudeFt: 3000, tasKt: 0}]}),
);
assert.equal(validateProfile({...p, altitudeReference: 'MSL', geoidOffsetM: -65}).geoidOffsetM, -65);

// routes.json validation
const route = [78.4, 17.4],
  route2 = [78.5, 17.4],
  route3 = [78.5, 17.5];
const goodRoutes = {
  schemaVersion: 1,
  loops: {inner: [route, route2, route3], outer: [route, route2, route3]},
  places: [{name: 'Begumpet Airport', lon: 78.4676, lat: 17.4531}],
};
assert.equal(validateRouteData(goodRoutes), goodRoutes);
assert.throws(() => validateRouteData({...goodRoutes, schemaVersion: 2}));
assert.throws(() =>
  validateRouteData({...goodRoutes, loops: {inner: [route, route2], outer: goodRoutes.loops.outer}}),
);
assert.throws(() => validateRouteData({...goodRoutes, places: [{name: '', lon: 1, lat: 1}]}));
assert.throws(() =>
  validateRouteData({
    ...goodRoutes,
    loops: {inner: [[200, 0], route2, route3], outer: goodRoutes.loops.outer},
  }),
);

// progress-backup validation
const goodBackup = {
  schemaVersion: 1,
  learner: {
    name: 'Alex',
    sessions: [
      {
        route: 'inner',
        mode: 'quiz',
        completedAt: new Date().toISOString(),
        profile: 'Demo familiarization profile',
        score: 4,
        total: 5,
      },
    ],
    flightProfiles: [],
  },
};
assert.deepEqual(validateProgressBackup(goodBackup).sessions, goodBackup.learner.sessions);
assert.throws(() => validateProgressBackup({...goodBackup, schemaVersion: 2}));
assert.throws(() =>
  validateProgressBackup({schemaVersion: 1, learner: {name: '', sessions: [], flightProfiles: []}}),
);
assert.throws(() =>
  validateProgressBackup({
    schemaVersion: 1,
    learner: {
      name: 'Alex',
      sessions: [{...goodBackup.learner.sessions[0], route: 'nowhere'}],
      flightProfiles: [],
    },
  }),
);
assert.throws(() =>
  validateProgressBackup({
    schemaVersion: 1,
    learner: {name: 'Alex', sessions: [{...goodBackup.learner.sessions[0], score: 9}], flightProfiles: []},
  }),
);

console.log(
  'Core tests passed: bearings, wind vectors/correction, impossible wind, drift distance, route interpolation, profile validation, route-data validation, progress-backup validation.',
);
