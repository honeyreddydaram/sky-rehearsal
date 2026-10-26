import React from 'react';
import RecordingPanel from './RecordingPanel';
export default function FlightPanel() {
  return (
    <section className="flight-column">
      <div className="panel flight-panel">
        <div className="map-toolbar">
          <span id="engine-status" className="status-pill">
            Opening map
          </span>
          <div className="view-tabs" aria-label="Camera view">
            <button data-view="overview">Overview</button>
            <button data-view="follow">Chase</button>
            <button data-view="pilot" className="selected">
              Pilot
            </button>
            <button id="fit" aria-label="Fit entire route">
              ⤢
            </button>
          </div>
        </div>
        <div className="map-shell">
          <div id="map"></div>
          <svg
            id="fallback-map"
            viewBox="0 0 900 600"
            role="img"
            aria-label="Route study diagram"
            {...{hidden: true}}
          ></svg>
          <div id="map-note" className="map-note" hidden></div>
          <div className="map-legend">
            <span className="dot purple"></span>Planned <span className="dot amber"></span>Wind track{' '}
            <span className="dot runway"></span>Runway <span className="dot landmark"></span>Landmarks
          </div>
          <div id="identify-panel" className="identify-panel" hidden>
            <div>
              <small>CLICKED</small>
              <strong id="identify-coords">—</strong>
              <span id="identify-nearest" className="micro"></span>
            </div>
            <button id="identify-close" aria-label="Close">
              ×
            </button>
          </div>
          <div className="look-controls">
            <button data-look="left" aria-label="Look left">
              ←
            </button>
            <button data-look="ahead">Ahead</button>
            <button data-look="right" aria-label="Look right">
              →
            </button>
            <button data-look="down">Below</button>
          </div>
        </div>
        <div id="credits"></div>
        <p id="flight-phase" className="micro" aria-live="polite"></p>
        <div className="telemetry">
          <div>
            <small>HEADING · TRUE</small>
            <strong id="heading">—</strong>
          </div>
          <div>
            <small id="altitude-label">ALTITUDE · DEMO</small>
            <strong id="altitude">—</strong>
          </div>
          <div>
            <small>TRUE AIRSPEED</small>
            <strong id="airspeed">—</strong>
          </div>
          <div>
            <small>GROUND SPEED</small>
            <strong id="groundspeed">—</strong>
          </div>
        </div>
        <div className="playback">
          <div className="playback-top">
            <button id="play" className="primary">
              Start rehearsal
            </button>
            <button id="restart" className="icon-button" aria-label="Restart session">
              ↺
            </button>
            <label>
              Playback{' '}
              <select id="rate" defaultValue="5">
                <option value="1">1×</option>
                <option value="5">5×</option>
                <option value="15">15×</option>
                <option value="30">30×</option>
              </select>
            </label>
            <span id="percentage">0%</span>
          </div>
          <label className="sr-only" htmlFor="timeline">
            Route position
          </label>
          <input id="timeline" type="range" min="0" max="1000" defaultValue="0" />
          <div className="micro timeline-labels">
            <span>Departure area</span>
            <span id="elapsed">00:00 elapsed</span>
            <span>Return</span>
          </div>
        </div>
      </div>
      <section className="panel" aria-label="Adaptive instructor">
        <h2>Adaptive instructor</h2>
        <p id="instructor-policy" className="micro"></p>
        <button id="instructor-hint">Study hint / next hint</button>
        <div id="instructor-content" aria-live="polite"></div>
      </section>
      <RecordingPanel />
      <div className="panel callout">
        <span className="callout-icon">◎</span>
        <div>
          <p className="eyebrow" id="callout-title">
            READY WHEN YOU ARE
          </p>
          <p id="callout-text" aria-live="polite">
            Choose a mode and start your rehearsal. Pause at any point to study the view.
          </p>
        </div>
        <button id="repeat" aria-label="Repeat callout aloud">
          ↻
        </button>
      </div>
      <p className="scope-note" id="scope-note">
        Demo geometry and flight values support familiarization. Import a sourced flight profile for your own
        altitude and airspeed schedule.
      </p>
    </section>
  );
}
