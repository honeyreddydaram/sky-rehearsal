import {validateAirportPackage} from './package.mjs';
// airport.js
// Loads and exposes the real-world reference data added in Phase 2: the airport
// record (ARP, approximate runway, circuit-altitude convention), the two circuit
// patterns (vohy-rwy27.json and its derived reverse, vohy-rwy09.json), and the
// aircraft fleet. Also owns the two small pieces of state this data introduces:
// which runway is active, and which aircraft the pilot picked.
//
// The flight engine consumes these validated records to build an explicitly
// illustrative circuit. Missing checkpoints remain missing; side landmarks are
// reference cues, not aircraft track vertices. See flight/circuit.mjs.

import {validateAircraftType, resolveAircraftProfile} from '../flight/core.mjs';

export let airport = null;
export const circuits = {}; // '27' | '09' -> validated circuit data
export let fleet = null;
export const aircraftTypes = {}; // typeCode -> validated aircraft type data
export let cessnaCommon = null;
export let landmarks = null;

export const airportState = {
  activeRunway: '27',
  selectedRegistration: null,
};

async function fetchJson(path) {
  const response = await fetch(path);
  if (!response.ok) throw new Error(`Request for ${path} failed`);
  return response.json();
}

export let airportPackage = null;
export let airportCatalog = [];
export function applyAirportPackage(raw) {
  const data = validateAirportPackage(raw);
  airportPackage = data;
  airport = data.airport;
  for (const id of Object.keys(circuits)) delete circuits[id];
  for (const circuit of data.circuits) circuits[circuit.runway] = circuit;
  fleet = data.fleet;
  landmarks = data.landmarks;
  airportState.activeRunway = data.circuits[0].runway;
  airportState.selectedRegistration = fleet.aircraft.find((a) => a.registration)?.registration ?? null;
  return data;
}
export async function catalogPackage(id, revision = null) {
  const entry = airportCatalog.find((a) => a.icao === id && (!revision || a.revision === revision));
  if (!entry) throw Error('The assigned airport revision is not installed. Contact your instructor.');
  const data = validateAirportPackage(await fetchJson(entry.path));
  if (data.airport.icao !== entry.icao || data.revision !== entry.revision)
    throw Error('Airport catalog and package revision disagree.');
  return data;
}
export async function loadAirportData() {
  const catalog = await fetchJson('./data/airports/catalog.json');
  if (
    catalog.version !== 1 ||
    !Array.isArray(catalog.airports) ||
    catalog.airports.length > 100 ||
    catalog.airports.some(
      (a) => !/^[A-Z]{4}$/.test(a.icao) || !/^\.\/data\/airports\/[a-z0-9-]+\.json$/.test(a.path),
    )
  )
    throw Error('Invalid airport catalog.');
  airportCatalog = catalog.airports;
  const common = await fetchJson('./data/aircraft/cessna-common.json');
  cessnaCommon = common;
  await Promise.all(
    ['c152', 'c172r', 'c172s', 'da42ng'].map(async (type) => {
      aircraftTypes[type] = validateAircraftType(await fetchJson(`./data/aircraft/${type}.json`));
    }),
  );
  applyAirportPackage(await catalogPackage('VOHY'));
}

export function activeCircuit() {
  return circuits[airportState.activeRunway];
}

export function setActiveRunway(id) {
  if (circuits[id]) airportState.activeRunway = id;
}

// Resolves the pilot's selected aircraft to {registration, callSign, typeCode, profile}
// with the Cessna common profile merged in where the type opts into it.
export function selectedAircraft() {
  const entry = fleet.aircraft.find((a) => a.registration === airportState.selectedRegistration);
  if (!entry) return null;
  const type = aircraftTypes[entry.typeCode];
  return {...entry, type: resolveAircraftProfile(type, cessnaCommon)};
}

export function setSelectedRegistration(registration) {
  airportState.selectedRegistration = registration;
}
