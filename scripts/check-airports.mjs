import {readFileSync} from 'node:fs';
import {validateAirportPackage} from '../src/aviation/package.mjs';
const manifest = JSON.parse(readFileSync('public/data/airports/catalog.json', 'utf8'));
const seen = new Set();
for (const entry of manifest.airports) {
  if (!/^\.\/data\/airports\/[a-z0-9-]+\.json$/.test(entry.path)) throw Error('Invalid catalog path');
  const data = validateAirportPackage(JSON.parse(readFileSync('public/' + entry.path.slice(2), 'utf8')));
  if (seen.has(entry.icao) || entry.icao !== data.airport.icao || entry.revision !== data.revision)
    throw Error('Duplicate airport or revision mismatch');
  seen.add(entry.icao);
}
console.log(`Validated ${seen.size} versioned airport packages`);
