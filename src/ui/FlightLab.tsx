import React from 'react';
export default function FlightLab() {
  return (
    <aside className="panel conditions">
      <div className="section-head">
        <h2>Flight lab</h2>
        <span className="step">02</span>
      </div>
      <h3>Weather rehearsal</h3>
      <label>
        Scenario
        <select id="weather-scenario" defaultValue="calm">
          <option value="calm">Calm / standard</option>
          <option value="westerly">Westerly wind</option>
          <option value="crosswind">Crosswind exercise</option>
        </select>
      </label>
      <button id="weather-load">Load latest VOHY METAR</button>
      <label>
        Or paste METAR
        <textarea id="weather-metar" maxLength={1500} rows={2} />
      </label>
      <button id="weather-decode">Decode observation</button>
      <button id="weather-apply" disabled>
        Practice these conditions
      </button>
      <p id="weather-status" role="status" className="micro">
        Training scenario · calm / standard.
      </p>
      <p className="micro">
        Only steady wind drives the route. QNH and temperature affect imported aircraft IAS-to-TAS conversion.
        Visibility, clouds and gusts are briefing values; no cloud or turbulence physics.
      </p>
      <h3>Wind scenario</h3>
      <p className="micro">
        Compare the planned route with a steady wind’s effect. Manual changes create a new training scenario.
      </p>
      <label>
        Wind from <span id="wind-from-value">270°T</span>
        <input id="wind-from" type="range" min="0" max="360" step="1" defaultValue="270" />
      </label>
      <label>
        Wind speed <span id="wind-speed-value">0 kt</span>
        <input id="wind-speed" type="range" min="0" max="35" step="1" defaultValue="0" />
      </label>
      <label className="check">
        <input id="compensate" type="checkbox" /> Apply wind correction
      </label>
      <div className="wind-facts">
        <p>
          Ground track <b id="track">—</b>
        </p>
        <p>
          Crosswind <b id="crosswind">—</b>
        </p>
        <p>
          Drift from route <b id="drift">—</b>
        </p>
        <p>
          Heading correction <b id="correction">—</b>
        </p>
      </div>
      <p className="micro">
        Without correction, the aircraft follows the planned heading while wind moves its ground track.
      </p>
      <hr />
      <h3>Aircraft performance</h3>
      <label>
        Training type
        <select id="performance-type" defaultValue="none">
          <option value="none">Demo — no reviewed type performance</option>
          <option value="c152">C152</option>
          <option value="c172r">C172R</option>
          <option value="c172s">C172S</option>
          <option value="da42ng">DA42 NG</option>
        </select>
      </label>
      <button id="performance-template">Download POH input template</button>
      <label>
        Import reviewed aircraft JSON
        <input type="file" id="performance-file" accept=".json,application/json" />
      </label>
      <p id="performance-status" role="status" className="micro">
        No reviewed POH values supplied. Demo speeds remain active.
      </p>
      <h3>Altitude &amp; speed</h3>
      <select id="flight-profile" aria-label="Flight profile">
        <option defaultValue="demo">Demo familiarization profile</option>
      </select>
      <p id="profile-source" className="micro"></p>
      <svg id="altitude-chart" viewBox="0 0 240 70" aria-label="Altitude profile"></svg>
      <button id="import-open" className="secondary wide">
        Import flight profile
      </button>
      <hr />
      <h3>Scene detail</h3>
      <p id="terrain-status" className="micro">
        Satellite imagery · smooth globe
      </p>
      <label className="check">
        <input type="checkbox" id="buildings-toggle" defaultChecked /> Buildings
      </label>
      <button id="terrain-open" className="secondary wide">
        Connect terrain &amp; buildings
      </button>
      <p className="micro">Real terrain and available 3D buildings through Cesium ion.</p>
    </aside>
  );
}
