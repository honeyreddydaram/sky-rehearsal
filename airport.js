// airport.js
// Loads and exposes the real-world reference data added in Phase 2: the airport
// record (ARP, approximate runway, circuit-altitude convention), the two circuit
// patterns (vohy-rwy27.json and its derived reverse, vohy-rwy09.json), and the
// aircraft fleet. Also owns the two small pieces of state this data introduces:
// which runway is active, and which aircraft the pilot picked.
//
// This is mostly a reference/briefing layer, not the flight simulator: the circuit
// pattern's actual ground track (checkpoint-to-checkpoint geometry) is NOT used as
// the flyable route (see routes.json and state.js for that — the "legacy screenshot
// reconstruction" loop is still what the guided/quiz rehearsal actually flies). Even
// with every checkpoint located, their spacing is too sparse and leg-by-leg to form a
// smooth continuous path the way routeModel()'s spline needs; that still waits on
// real GPX data. One connection DOES exist, though: switching active runway flips
// state.direction (see app.js's runway-change wiring below and state.js), which
// flies the existing legacy loop in the matching rotational direction — same path
// shape, opposite course/heading — so the simulated flight's direction of travel
// matches the real circuit's even though its exact ground track doesn't yet.

import {
  validateAirportData,
  validateCircuitData,
  validateAircraftType,
  validateLandmarksData,
  resolveAircraftProfile,
} from './core.mjs';

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

export async function loadAirportData() {
  const [
    airportRaw,
    rwy27Raw,
    rwy09Raw,
    fleetRaw,
    commonRaw,
    c152Raw,
    c172rRaw,
    c172sRaw,
    da42Raw,
    landmarksRaw,
  ] = await Promise.all([
    fetchJson('./data/airport-vohy.json'),
    fetchJson('./data/circuits/vohy-rwy27.json'),
    fetchJson('./data/circuits/vohy-rwy09.json'),
    fetchJson('./data/aircraft/fleet.json'),
    fetchJson('./data/aircraft/cessna-common.json'),
    fetchJson('./data/aircraft/c152.json'),
    fetchJson('./data/aircraft/c172r.json'),
    fetchJson('./data/aircraft/c172s.json'),
    fetchJson('./data/aircraft/da42ng.json'),
    fetchJson('./data/landmarks.json'),
  ]);

  airport = validateAirportData(airportRaw);
  circuits['27'] = validateCircuitData(rwy27Raw);
  circuits['09'] = validateCircuitData(rwy09Raw);
  fleet = fleetRaw;
  cessnaCommon = commonRaw;
  aircraftTypes.c152 = validateAircraftType(c152Raw);
  aircraftTypes.c172r = validateAircraftType(c172rRaw);
  aircraftTypes.c172s = validateAircraftType(c172sRaw);
  aircraftTypes.da42ng = validateAircraftType(da42Raw);
  landmarks = validateLandmarksData(landmarksRaw);

  airportState.selectedRegistration = fleet.aircraft.find((a) => a.registration)?.registration ?? null;
}

export function activeCircuit() {
  return circuits[airportState.activeRunway];
}

// Called whenever the active runway changes, after airportState.activeRunway is
// already updated. app.js wires this (same injected-callback pattern used elsewhere
// in this codebase, e.g. map.setInteractionHandler) to flip state.direction and
// rebuild the flight model/trace — kept as a callback rather than an import so this
// module doesn't need to depend on state.js/playback.js/map.js just for this one hook.
let onRunwayChange = () => {};
export function setRunwayChangeHandler(fn) {
  onRunwayChange = fn;
}

export function setActiveRunway(id) {
  if (!circuits[id]) return;
  airportState.activeRunway = id;
  onRunwayChange(id);
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
