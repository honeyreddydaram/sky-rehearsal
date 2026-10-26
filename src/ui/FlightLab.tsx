import React from 'react';
export default function FlightLab() {
  return (
    <aside className="panel conditions">
      <div className="section-head">
        <h2>Flight lab</h2>
        <span className="step">02</span>
      </div>
      <h3>Wind scenario</h3>
      <p className="micro">
        Compare the planned route with a steady wind’s effect. This is a training scenario, not live weather.
      </p>
      <label>
        Wind from <span id="wind-from-value">270°T</span>
        <input id="wind-from" type="range" min="0" max="350" step="10" defaultValue="270" />
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
