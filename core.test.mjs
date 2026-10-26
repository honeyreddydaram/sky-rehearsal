import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
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
  destinationPoint,
  validateAirportData,
  approximateRunwayEnds,
  resolveRunwayEnds,
  validateCircuitData,
  reverseCircuit,
  resolveAircraftProfile,
  lastLetterCallSign,
  validateAircraftType,
  validateLandmarksData,
  nearestNamedPoint,
} from './src/flight/core.mjs';
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

// destinationPoint: forward geodesy should round-trip with bearing()/distance()
// (the inverse problem) to within a small tolerance.
const start = [78.4676, 17.4531];
const dest = destinationPoint(start, 90, 10000); // 10 km due east
assert.ok(Math.abs(distance(start, dest) - 10000) < 1);
assert.ok(Math.abs(bearing(start, dest) - 90) < 0.5);

// airport data validation + approximate runway geometry
const goodAirport = {
  schemaVersion: 1,
  icao: 'VOHY',
  referencePoint: {lat: 17.4531, lon: 78.4675},
  runways: [{id: '09/27', lengthM: 3230, nominalAlignment: 90}],
};
assert.equal(validateAirportData(goodAirport), goodAirport);
assert.throws(() => validateAirportData({...goodAirport, schemaVersion: 2}));
assert.throws(() => validateAirportData({...goodAirport, runways: []}));
const ends = approximateRunwayEnds(goodAirport.referencePoint, goodAirport.runways[0]);
assert.ok(ends['09'] && ends['27']);
assert.ok(ends['09'][0] < ends['27'][0]); // "09" (west end) should be west of "27" (east end) at this alignment
assert.ok(Math.abs(distance(ends['09'], ends['27']) - 3230) < 1);

// resolveRunwayEnds: falls back to the approximation when there's no real data,
// prefers real ends when present
assert.deepEqual(resolveRunwayEnds(goodAirport.referencePoint, goodAirport.runways[0]), ends);
const withRealEnds = {
  ...goodAirport.runways[0],
  ends: {
    '09': {lon: 78.1, lat: 17.1, source: 'OpenStreetMap test fixture'},
    27: {lon: 78.2, lat: 17.2, source: 'OpenStreetMap test fixture'},
  },
};
assert.deepEqual(resolveRunwayEnds(goodAirport.referencePoint, withRealEnds), {
  '09': [78.1, 17.1],
  27: [78.2, 17.2],
});
assert.equal(validateAirportData({...goodAirport, runways: [withRealEnds]}).runways[0], withRealEnds);
assert.throws(() =>
  validateAirportData({
    ...goodAirport,
    runways: [{...goodAirport.runways[0], ends: {'09': {lon: 1, lat: 1}}}],
  }),
);

// circuit data validation
const goodCircuit = {
  schemaVersion: 1,
  runway: '27',
  circuitDirection: 'left-hand',
  side: 'south of runway',
  legs: [
    {
      name: 'upwind',
      headingTrue: 270,
      checkpoints: [{name: 'Police Tower', side: 'LEFT', distanceNm: 2, coords: null}],
    },
    {
      name: 'crosswind',
      headingTrue: 180,
      checkpoints: [
        {
          name: 'Wells Fargo building',
          side: null,
          distanceNm: 3,
          coords: [78.3775143, 17.4249629],
          confidence: 'medium',
        },
      ],
    },
  ],
};
assert.equal(validateCircuitData(goodCircuit), goodCircuit);
assert.throws(() => validateCircuitData({...goodCircuit, circuitDirection: 'clockwise'}));
assert.throws(() =>
  validateCircuitData({...goodCircuit, legs: [{...goodCircuit.legs[0], name: 'base-leg'}]}),
);
assert.throws(() =>
  validateCircuitData({
    ...goodCircuit,
    legs: [{name: 'upwind', headingTrue: 270, checkpoints: [{name: 'X', coords: [1, 2]}]}], // coords with no confidence
  }),
);

// reverseCircuit: reversing twice should return to the original leg order/headings
// (direction flips back, sides flip back).
const rwy09 = reverseCircuit(goodCircuit, {runway: '09', side: 'south of runway'});
assert.equal(rwy09.circuitDirection, 'right-hand');
assert.equal(rwy09.derived, true);
assert.equal(rwy09.legs[0].name, 'upwind'); // renamed by new position, not carried from the source leg
assert.equal(rwy09.legs[0].headingTrue, 0); // 180 + 180, wrapped
assert.equal(rwy09.legs[1].checkpoints[0].side, 'RIGHT'); // LEFT -> RIGHT
const backTo27 = reverseCircuit(rwy09, {runway: '27', side: 'south of runway'});
assert.equal(backTo27.circuitDirection, 'left-hand');
assert.equal(backTo27.legs[0].name, 'upwind');
assert.equal(backTo27.legs[0].headingTrue, 270);
assert.equal(backTo27.legs[0].checkpoints[0].side, 'LEFT');

// resolveAircraftProfile: common profile merges in, type-specific fields win
const common = {profile: {rotateKt: 55, cruiseKt: 87}};
const typeUsingCommon = {usesCommonProfile: true, profile: {cruiseKt: 90}};
assert.deepEqual(resolveAircraftProfile(typeUsingCommon, common).profile, {rotateKt: 55, cruiseKt: 90});
const typeNotUsingCommon = {usesCommonProfile: false, profile: {rotateKt: null}};
assert.deepEqual(resolveAircraftProfile(typeNotUsingCommon, common), typeNotUsingCommon);

// call-sign derivation + aircraft type validation
assert.equal(lastLetterCallSign('VT-TSB'), 'Bravo');
assert.equal(lastLetterCallSign('VT-STC'), 'Charlie');
assert.equal(lastLetterCallSign('VT-AKN'), 'November');
assert.equal(lastLetterCallSign('VT-CAM'), 'Mike');
const goodAircraft = {
  schemaVersion: 1,
  typeCode: 'c152',
  usesCommonProfile: true,
  profile: {},
  registrations: ['VT-AKN'],
};
assert.equal(validateAircraftType(goodAircraft), goodAircraft);
assert.throws(() => validateAircraftType({...goodAircraft, usesCommonProfile: 'yes'}));
assert.throws(() => validateAircraftType({...goodAircraft, registrations: 'VT-AKN'}));

// Integration check: every shipped data file must actually validate against its
// schema, and the Cessna profile merge must work on the real files, not just fixtures.
// This catches a data-file typo or schema drift at test time, before it reaches the UI.
const readJson = (path) => JSON.parse(readFileSync(`public/${path}`, 'utf8'));

validateRouteData(readJson('routes.json'));
validateAirportData(readJson('data/airport-vohy.json'));

const shippedRwy27 = validateCircuitData(readJson('data/circuits/vohy-rwy27.json'));
const shippedRwy09 = validateCircuitData(readJson('data/circuits/vohy-rwy09.json'));
assert.equal(shippedRwy09.derived, true);
assert.equal(shippedRwy09.legs.length, shippedRwy27.legs.length);
assert.deepEqual(
  shippedRwy09.legs.map((l) => l.name),
  shippedRwy27.legs.map((l) => l.name), // same 5 leg names, just reassigned by new position
);

const cessnaCommon = readJson('data/aircraft/cessna-common.json');
for (const file of ['c152.json', 'c172r.json', 'c172s.json', 'da42ng.json']) {
  const aircraft = validateAircraftType(readJson(`data/aircraft/${file}`));
  const resolved = resolveAircraftProfile(aircraft, cessnaCommon);
  if (aircraft.usesCommonProfile) assert.equal(resolved.profile.rotateKt, 55);
}

const fleet = readJson('data/aircraft/fleet.json');
for (const entry of fleet.aircraft) {
  if (entry.registration && entry.callSignSource === 'derived from the last-letter rule') {
    assert.equal(lastLetterCallSign(entry.registration), entry.callSign);
  }
}

const shippedAirport = readJson('data/airport-vohy.json');
const shippedRunway = shippedAirport.runways[0];
if (shippedRunway.ends) {
  const realEnds = resolveRunwayEnds(shippedAirport.referencePoint, shippedRunway);
  const realLengthM = distance(realEnds['09'], realEnds['27']);
  // Loose sanity bound, not a re-assertion of the known ~4% OSM-vs-published
  // discrepancy (that's flagged in the data file's geometryNote, not "fixed" here) --
  // this just catches a gross typo in a future coordinate edit.
  assert.ok(Math.abs(realLengthM - shippedRunway.lengthM) / shippedRunway.lengthM < 0.1);
}

// nearestNamedPoint
assert.equal(nearestNamedPoint([0, 0], []), null);
const near = nearestNamedPoint(
  [78.47, 17.45],
  [
    {name: 'far', lon: 79, lat: 18},
    {name: 'close', lon: 78.471, lat: 17.451},
  ],
);
assert.equal(near.name, 'close');
assert.ok(near.distanceM < 500);

const landmarks = validateLandmarksData(readJson('data/landmarks.json'));
for (const l of landmarks.landmarks) {
  const d = distance([landmarks.center.lon, landmarks.center.lat], [l.lon, l.lat]) / 1852;
  assert.ok(d <= landmarks.radiusNm + 0.5, `${l.name} is ${d.toFixed(1)} NM out, outside radiusNm`);
  if (Number.isFinite(l.distanceNm))
    assert.ok(Math.abs(d - l.distanceNm) < 0.2, `${l.name} distanceNm looks stale`);
}

console.log(
  'Core tests passed: bearings, wind vectors/correction, impossible wind, drift distance, route interpolation, profile validation, route-data validation, progress-backup validation, destination point, airport data, runway geometry, circuit data, circuit reversal, aircraft profile merge, call signs, aircraft type validation, landmarks validation, shipped data-file integration checks.',
);
