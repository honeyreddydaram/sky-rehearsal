// Generates data/circuits/vohy-rwy09.json from vohy-rwy27.json by reversing the
// ground track (see core.mjs reverseCircuit for the rules this applies). Run this
// manually with `node scripts/generate-rwy09-circuit.mjs` whenever vohy-rwy27.json
// changes -- the output is committed as a plain data file, not regenerated at page
// load, so it stays reviewable like any other data change.
import {readFileSync, writeFileSync} from 'node:fs';
import {validateCircuitData, reverseCircuit} from '../core.mjs';

const source = JSON.parse(readFileSync(new URL('../data/circuits/vohy-rwy27.json', import.meta.url), 'utf8'));
validateCircuitData(source);

const derived = reverseCircuit(source, {runway: '09', side: 'south of runway'});
derived.note =
  'Generated from vohy-rwy27.json by scripts/generate-rwy09-circuit.mjs (reverseCircuit in core.mjs): same ground track flown in the opposite direction, right-hand instead of left-hand, legs/checkpoints reversed, L/R swapped. Not independently confirmed by a pilot flying RWY 09 -- needsConfirmation is true. Re-run this script after editing vohy-rwy27.json rather than hand-editing this file.';
validateCircuitData(derived);

const outPath = new URL('../data/circuits/vohy-rwy09.json', import.meta.url);
writeFileSync(outPath, JSON.stringify(derived, null, 2) + '\n');
console.log('Wrote', outPath.pathname.replace(/^\/([A-Za-z]):/, '$1:'));
