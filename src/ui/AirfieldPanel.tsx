import React from 'react';
export default function AirfieldPanel() {
  return (
    <section id="airfield-panel" className="panel airfield">
      <div className="section-head">
        <h2>Airfield &amp; circuit</h2>
        <span className="step">03</span>
      </div>
      <p className="micro">
        Reference data for VOHY (Begumpet) — not for flight planning or navigation. Sources and confidence are
        noted throughout; see README.
      </p>
      <div className="airfield-grid">
        <div>
          <h3>Active runway</h3>
          <div className="segmented" aria-label="Select active runway">
            <button data-runway="27" className="selected">
              RWY 27
            </button>
            <button data-runway="09">RWY 09</button>
          </div>
          <p className="micro" id="runway-note"></p>
        </div>
        <div>
          <h3>Aircraft</h3>
          <select id="aircraft-select" aria-label="Select aircraft"></select>
          <p className="micro" id="aircraft-note"></p>
        </div>
      </div>
      <div className="concepts">
        <h3>Concepts</h3>
        <dl id="concepts-list"></dl>
      </div>
      <h3>
        Circuit legs (RWY <span id="circuit-runway-label"></span>)
      </h3>
      <p className="micro" id="circuit-source-note"></p>
      <div id="circuit-legs" className="circuit-legs"></div>
    </section>
  );
}
