import React from 'react';
export default function RecordingPanel() {
  return (
    <section id="recording-panel" className="panel">
      <h2>Recorded flight</h2>
      <p className="micro">
        Compare ideal circuit (purple), rehearsal wind track (amber), and recording (cyan). Files stay in this
        tab. GPX elevation / CSV altitude_m are metres; speed_kt is ground speed. Recorded comparisons are
        separate from knowledge-recall scores. Optional CSV tas_kt and phase tags support additional
        measurements.
      </p>
      <label>
        Altitude reference{' '}
        <select id="recording-reference" defaultValue="MSL">
          <option value="MSL">MSL</option>
          <option value="ELLIPSOID">WGS84 ellipsoid</option>
        </select>
      </label>
      <label>
        Geoid offset (ellipsoid minus MSL, metres; required for MSL)
        <input
          id="recording-geoid"
          type="number"
          step="any"
          placeholder="Use the offset for the flight area"
        />
      </label>
      <label className="file-button">
        Import GPX / CSV
        <input id="recording-file" type="file" accept=".gpx,.csv" />
      </label>
      <p className="micro">
        Synthetic examples (MSL; not actual flights):{' '}
        <a href="./examples/demo-flight.csv" download>
          CSV
        </a>{' '}
        ·{' '}
        <a href="./examples/demo-flight.gpx" download>
          GPX
        </a>
        . Choose altitude reference and offset before importing; changes apply to the next import.
      </p>
      <p id="recording-status" role="status">
        No recorded flight loaded.
      </p>
      <button id="recording-play" disabled>
        Replay recording
      </button>
      <button id="recording-save-cloud" disabled>
        Save flight to account
      </button>
      <button id="recording-list-cloud">Refresh saved flights</button>
      <label>
        Account flights
        <select id="recording-cloud-list">
          <option value="">Choose saved flight</option>
        </select>
      </label>
      <button id="recording-load-cloud">Load saved flight</button>
      <button id="recording-clear" disabled>
        Clear recording
      </button>
      <label>
        Replay speed{' '}
        <select id="recording-rate" defaultValue="1">
          <option value="1">1×</option>
          <option value="5">5×</option>
          <option value="15">15×</option>
        </select>
      </label>
      <label>
        Recorded time
        <input id="recording-time" type="range" min="0" max="1000" defaultValue="0" disabled />
      </label>
      <button id="recording-assess" disabled>
        Compare flight with current route
      </button>
      <p className="micro">
        Comparison uses the currently selected illustrative route/profile. GPS track is not nose heading, and
        ground speed is not true airspeed. Unknown measurements remain unscored.
      </p>
      <div id="recording-debrief"></div>
      <p id="recording-telemetry" className="micro" aria-live="polite"></p>
      <p className="micro">
        Use Pilot, Chase, or Overview above to replay the recorded aircraft. The main flight telemetry remains
        the rehearsal’s telemetry. Starting a rehearsal exits recorded replay. Missing heading, ground speed,
        and vertical speed are derived from successive samples; derived heading is ground track, not aircraft
        nose heading.
      </p>
    </section>
  );
}
