// airfield.js
// UI wiring for the "Airfield & circuit" reference panel: the active-runway selector,
// aircraft/call-sign picker, the Concepts blurb (ARP/AMSL/AGL/QNH/circuit altitude),
// and a read-only checklist of the active circuit's legs and checkpoints. All of this
// is reference material built from data/airport-vohy.json, data/circuits/*.json, and
// data/aircraft/*.json. Runway selection notifies bootstrap to reset the live circuit.

import {$, text, all} from '../ui/ui.js';
import {
  airport,
  airportState,
  fleet,
  activeCircuit,
  setActiveRunway,
  setSelectedRegistration,
} from './airport.js';
import {refreshAirportLayer, refreshLandmarksLayer, wireIdentify} from '../map/map.js';

function renderRunwaySelector() {
  all('[data-runway]').forEach((b) => {
    b.classList.toggle('selected', b.dataset.runway === airportState.activeRunway);
  });
  const circuit = activeCircuit();
  text(
    'runway-note',
    circuit.derived
      ? `Derived from RWY ${circuit.derivedFrom} (same ground track, flown the other way) — not independently confirmed.`
      : `${circuit.circuitDirection}, ${circuit.side}. Source: ${circuit.source} — not an official chart.`,
  );
}

function renderAircraftOptions() {
  const select = $('aircraft-select');
  select.replaceChildren();
  fleet.aircraft.forEach((a) => {
    const o = document.createElement('option');
    o.value = a.registration ?? '';
    o.textContent = a.registration
      ? `${a.callSign ?? '?'} — ${a.typeCode.toUpperCase()} (${a.registration})`
      : `${a.typeCode.toUpperCase()} — registration TBD`;
    o.disabled = !a.registration;
    select.append(o);
  });
  select.value = airportState.selectedRegistration ?? '';
  renderAircraftNote();
}

function renderAircraftNote() {
  const entry = fleet.aircraft.find((a) => a.registration === airportState.selectedRegistration);
  text(
    'aircraft-note',
    entry
      ? `Call-sign source: ${entry.callSignSource}. ${entry.typeCode === 'c152' || entry.typeCode === 'c172r' || entry.typeCode === 'c172s' ? 'Uses the shared Cessna profile -- confirm type-specific values in the POH.' : 'Performance values not yet confirmed (TODO).'}`
      : '',
  );
}

function renderConcepts() {
  const list = $('concepts-list');
  list.replaceChildren();
  const add = (term, def) => {
    const dt = document.createElement('dt');
    dt.textContent = term;
    const dd = document.createElement('dd');
    dd.textContent = def;
    list.append(dt, dd);
  };
  add(
    'ARP',
    'Airport Reference Point — the published lat/lon used to locate the field as a whole, not any one runway threshold.',
  );
  add(
    'AMSL',
    'Above Mean Sea Level — altitude measured from sea level, read directly off the altimeter when it is set to the current QNH.',
  );
  add('AGL', 'Above Ground Level — height above the ground directly below the aircraft, not sea level.');
  add(
    'QNH',
    'The altimeter setting that makes it read AMSL at the field; shown on today’s METAR once Phase 3 adds live weather.',
  );
  const alt = airport.circuitAltitude;
  add(
    'Circuit altitude',
    `${alt.displayText} (${alt.aerodromeElevationFtPilotRounded} ft rounded elevation + ${alt.circuitHeightAglFt} ft AGL). Source: ${alt.source}, verified: ${alt.verified}.`,
  );
}

function renderCircuitLegs() {
  const circuit = activeCircuit();
  text('circuit-runway-label', circuit.runway);
  text(
    'circuit-source-note',
    `Source: ${circuit.source}. verified: ${circuit.verified}.${circuit.derived ? ' derived: true, needsConfirmation: true.' : ''} ${circuit.note}`,
  );
  const container = $('circuit-legs');
  container.replaceChildren();
  circuit.legs.forEach((leg) => {
    const section = document.createElement('div');
    section.className = 'circuit-leg';
    const heading = document.createElement('h4');
    heading.textContent = `${leg.name} — heading ${String(Math.round(leg.headingTrue)).padStart(3, '0')}°T`;
    section.append(heading);
    const list = document.createElement('ul');
    leg.checkpoints.forEach((c) => {
      const li = document.createElement('li');
      const confidence = c.coords ? c.confidence : 'unconfirmed';
      const name = document.createElement('span');
      name.textContent = c.name + (c.side ? ` (${c.side})` : '');
      const badge = document.createElement('span');
      badge.className = `confidence confidence-${confidence}`;
      badge.textContent = c.coords ? confidence : 'not located';
      li.append(name, badge);
      list.append(li);
    });
    section.append(list);
    container.append(section);
  });
}

function refreshAll() {
  renderRunwaySelector();
  renderCircuitLegs();
  refreshAirportLayer();
}

export function init(onRunwayChange = () => {}) {
  renderConcepts();
  renderAircraftOptions();
  refreshAll();
  refreshLandmarksLayer(); // runway-independent, so only needs drawing once
  wireIdentify();

  all('[data-runway]').forEach((b) => {
    b.onclick = () => {
      setActiveRunway(b.dataset.runway);
      onRunwayChange();
      refreshAll();
    };
  });

  $('aircraft-select').onchange = (e) => {
    setSelectedRegistration(e.target.value || null);
    renderAircraftNote();
  };
}
