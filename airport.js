// airport.js
// Loads and exposes the real-world reference data added in Phase 2: the airport
// record (ARP, approximate runway, circuit-altitude convention), the two circuit
// patterns (vohy-rwy27.json and its derived reverse, vohy-rwy09.json), and the
// aircraft fleet. Also owns the two small pieces of state this data introduces:
// which runway is active, and which aircraft the pilot picked.
//
// This is deliberately a reference/briefing layer, not the flight simulator: the
// circuit pattern here is NOT used as the flyable route (see routes.json and
// state.js for that — the "legacy screenshot reconstruction" loop is still what the
// guided/quiz rehearsal actually flies). Several circuit checkpoints have no
// confirmed coordinates yet, so there isn't enough geometry to fly the real pattern
// until more of them are confirmed or a recorded GPX flight fills the gaps. Blending
// the two now would risk implying the plane is "on" a real-world checkpoint it isn't
// actually near — so for now this module only drives a reference panel and the map's
// static runway/checkpoint markers.

import {
  validateAirportData,
  validateCircuitData,
  validateAircraftType,
  resolveAircraftProfile,
} from './core.mjs';

export let airport = null;
export const circuits = {}; // '27' | '09' -> validated circuit data
export let fleet = null;
export const aircraftTypes = {}; // typeCode -> validated aircraft type data
export let cessnaCommon = null;

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
  const [airportRaw, rwy27Raw, rwy09Raw, fleetRaw, commonRaw, c152Raw, c172rRaw, c172sRaw, da42Raw] =
    await Promise.all([
      fetchJson('./data/airport-vohy.json'),
      fetchJson('./data/circuits/vohy-rwy27.json'),
      fetchJson('./data/circuits/vohy-rwy09.json'),
      fetchJson('./data/aircraft/fleet.json'),
      fetchJson('./data/aircraft/cessna-common.json'),
      fetchJson('./data/aircraft/c152.json'),
      fetchJson('./data/aircraft/c172r.json'),
      fetchJson('./data/aircraft/c172s.json'),
      fetchJson('./data/aircraft/da42ng.json'),
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

  airportState.selectedRegistration = fleet.aircraft.find((a) => a.registration)?.registration ?? null;
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
