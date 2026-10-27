// Preserve the existing illustrative geometry exactly; no new aviation claims.
import {readFileSync, writeFileSync} from 'node:fs';
import {buildCircuit} from '../src/flight/circuit.mjs';
const read = (path) => JSON.parse(readFileSync(`public/data/${path}`, 'utf8'));
const airport = read('airport-vohy.json');
const circuits = Object.fromEntries(['27', '09'].map((id) => [id, read(`circuits/vohy-rwy${id}.json`)]));
const data = {
  version: 1,
  revision: 'vohy-legacy-v1',
  source:
    'Existing SkyRehearsal reference data; trainee notes and source citations retained. Unverified geometry.',
  review: {status: 'unverified', reviewer: null, reviewedAt: null},
  geoidOffsetM: -76.5548,
  weatherStation: 'VOHY',
  airport,
  aircraft: ['c152', 'c172r', 'c172s', 'da42ng'],
  fleet: read('aircraft/fleet.json'),
  landmarks: read('landmarks.json'),
  circuits: Object.entries(circuits).map(([runway, reference]) => {
    const built = buildCircuit(airport, circuits, runway);
    return {
      ...reference,
      points: built.model.points,
      altitudesFt: [...built.stages.map((s) => s.altitudeFt), airport.elevation.ft],
      speedsKt: [...built.stages.map((s) => s.speedKt), 30],
    };
  }),
};
writeFileSync('public/data/airports/vohy.json', JSON.stringify(data, null, 2) + '\n');
