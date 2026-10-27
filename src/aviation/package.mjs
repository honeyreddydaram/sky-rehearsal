import {
  validateAirportData,
  validateCircuitData,
  validateLandmarksData,
  distance,
  bearing,
} from '../flight/core.mjs';
import {PHASES, AIRCRAFT} from './conditions.mjs';
export const LEGACY_VOHY_REVISION = 'vohy-legacy-v1';
export const runwayId = (id) => typeof id === 'string' && /^(0[1-9]|[12][0-9]|3[0-6])[LRC]?$/.test(id);
const text = (v, max) => typeof v === 'string' && v.trim().length > 0 && v.length <= max;
const number = (v, min, max) => Number.isFinite(v) && v >= min && v <= max;
const coords = (v) => Array.isArray(v) && v.length === 2 && number(v[0], -180, 180) && number(v[1], -85, 85);

export function validateAirportPackage(data) {
  const fail = (message) => {
    throw Error(`Airport package: ${message}`);
  };
  if (
    !data ||
    data.version !== 1 ||
    !text(data.revision, 80) ||
    !/^[a-zA-Z0-9_-]+$/.test(data.revision) ||
    !text(data.source, 1000)
  )
    fail('version, revision and source are required.');
  const airport = validateAirportData(data.airport);
  if (
    !/^[A-Z]{4}$/.test(airport.icao) ||
    !text(airport.name, 120) ||
    !text(airport.city, 150) ||
    !coords([airport.referencePoint.lon, airport.referencePoint.lat]) ||
    !number(airport.elevation?.ft, 0, 15000) ||
    !number(data.geoidOffsetM, -150, 150)
  )
    fail('invalid airport coordinates, elevation or geoid offset.');
  if (
    !number(airport.circuitAltitude?.circuitAltitudeAmslFt, airport.elevation.ft, 20000) ||
    !text(airport.circuitAltitude?.source, 300) ||
    !text(airport.circuitAltitude?.displayText, 150)
  )
    fail('circuit altitude needs a source and display text.');
  if (!Array.isArray(airport.runways) || airport.runways.length > 4)
    fail('supply one to four physical runways.');
  const runwayIds = new Set();
  for (const runway of airport.runways) {
    const ids = runway.id.split('/');
    if (
      ids.length !== 2 ||
      ids.some((id) => !runwayId(id) || runwayIds.has(id)) ||
      ids[0] === ids[1] ||
      !number(runway.lengthM, 100, 6000) ||
      !number(runway.nominalAlignment, 0, 360)
    )
      fail('invalid or duplicate runway ends.');
    ids.forEach((id) => runwayIds.add(id));
    if (
      runway.ends &&
      (Object.keys(runway.ends).length !== 2 ||
        ids.some((id) => !coords([runway.ends[id]?.lon, runway.ends[id]?.lat])))
    )
      fail('runway threshold coordinates must match its two end IDs.');
  }
  const review = data.review;
  if (
    !review ||
    !['unverified', 'reviewed'].includes(review.status) ||
    (review.status === 'reviewed' &&
      (!text(review.reviewer, 100) ||
        !text(review.reviewedAt, 40) ||
        !Number.isFinite(Date.parse(review.reviewedAt))))
  )
    fail('review status and review provenance are required.');
  if (!(data.weatherStation === null || /^[A-Z]{4}$/.test(data.weatherStation)))
    fail('weatherStation must be an explicit ICAO code or null.');
  if (
    !Array.isArray(data.aircraft) ||
    !data.aircraft.length ||
    data.aircraft.some((type) => !AIRCRAFT.includes(type))
  )
    fail('unknown aircraft type.');
  if (
    !data.fleet ||
    !Array.isArray(data.fleet.aircraft) ||
    data.fleet.aircraft.length > 50 ||
    data.fleet.aircraft.some(
      (a) =>
        !data.aircraft.includes(a.typeCode) ||
        !(a.registration === null || text(a.registration, 30)) ||
        !(a.callSign === null || text(a.callSign, 60)) ||
        !text(a.callSignSource, 200),
    )
  )
    fail('fleet registrations require type and call-sign provenance.');
  const landmarks = validateLandmarksData(data.landmarks);
  if (
    landmarks.landmarks.length > 100 ||
    landmarks.landmarks.some((l) => !coords([l.lon, l.lat]) || !text(l.name, 100))
  )
    fail('invalid landmarks.');
  if (!Array.isArray(data.circuits) || !data.circuits.length || data.circuits.length > 8)
    fail('supply one to eight circuits.');
  const seen = new Set();
  for (const circuit of data.circuits) {
    validateCircuitData(circuit);
    if (
      !runwayIds.has(circuit.runway) ||
      seen.has(circuit.runway) ||
      !text(circuit.source, 300) ||
      circuit.legs.length !== 5 ||
      circuit.legs.some((leg, i) => leg.name !== PHASES[i + 1])
    )
      fail('each circuit needs a unique runway and five ordered reference legs.');
    seen.add(circuit.runway);
    if (
      !Array.isArray(circuit.points) ||
      circuit.points.length !== 8 ||
      circuit.points.some(
        (p) => !coords(p) || distance(p, [airport.referencePoint.lon, airport.referencePoint.lat]) > 50000,
      )
    )
      fail('provide eight circuit vertices within 50 km of the airport.');
    if (circuit.points.slice(1).some((p, i) => distance(p, circuit.points[i]) < 1))
      fail('circuit segments must be at least one metre long.');
    if (
      !Array.isArray(circuit.altitudesFt) ||
      circuit.altitudesFt.length !== 8 ||
      circuit.altitudesFt.some((a) => !number(a, airport.elevation.ft, 20000)) ||
      !Array.isArray(circuit.speedsKt) ||
      circuit.speedsKt.length !== 8 ||
      circuit.speedsKt.some((s) => !number(s, 30, 250))
    )
      fail('eight bounded altitude and demo TAS values are required.');
    for (const leg of circuit.legs) {
      if (
        leg.checkpoints.length > 20 ||
        leg.checkpoints.some(
          (c) =>
            !text(c.name, 100) ||
            (c.coords !== null && !coords(c.coords)) ||
            (c.side && !['LEFT', 'RIGHT', 'AHEAD'].includes(c.side)),
        )
      )
        fail('invalid checkpoint or side.');
    }
  }
  return structuredClone(data);
}

export function packageCircuit(circuit) {
  const points = circuit.points,
    lengths = [0];
  points.slice(1).forEach((point, i) => lengths.push(lengths[i] + distance(points[i], point)));
  const model = {points, lengths, total: lengths.at(-1)};
  const stages = PHASES.map((name, i) => {
    const leg = circuit.legs.find((leg) => leg.name === name);
    return {
      name,
      start: lengths[i] / model.total,
      end: lengths[i + 1] / model.total,
      altitudeFt: circuit.altitudesFt[i],
      speedKt: circuit.speedsKt[i],
      headingTrue: bearing(points[i], points[i + 1]),
      referenceHeadingTrue: leg?.headingTrue ?? bearing(points[i], points[i + 1]),
      landmarks: leg?.checkpoints ?? [],
      turnPoint: points[i + 1],
      nextLeg: PHASES[i + 1] ?? null,
      expectedAction: `Continue ${name}; ${i < 6 ? 'next: ' + PHASES[i + 1] : 'complete the rehearsal'}.`,
    };
  });
  return {
    model,
    stages,
    runway: circuit.runway,
    terminalAltitudeFt: circuit.altitudesFt.at(-1),
    terminalSpeedKt: circuit.speedsKt.at(-1),
    verified: false,
  }; // Package reviews never certify the simulator.
}
