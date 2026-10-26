import React from 'react';
export default function Briefing() {
  return (
    <aside className="panel briefing">
      <div className="section-head">
        <h2>Route briefing</h2>
        <span className="step">01</span>
      </div>
      <div className="segmented" aria-label="Select route">
        <button data-route="circuit">Runway circuit</button>
        <button data-route="inner">Inner loop</button>
        <button data-route="outer" className="selected">
          Outer loop
        </button>
      </div>
      <p className="micro">
        Circuit uses sourced turn pins with an inferred runway intercept. Unverified geometry; RWY 09 is
        derived. Inner/outer loops retain legacy screenshots.
      </p>
      <div className="route-facts">
        <div>
          <strong id="route-distance">—</strong>
          <small>Route distance</small>
        </div>
        <div>
          <strong id="route-duration">—</strong>
          <small>Estimated time</small>
        </div>
      </div>
      <div className="section-head">
        <h3>Practice mode</h3>
      </div>
      <div className="modes">
        <button data-mode="guided" className="selected">
          <b>Guided practice</b>
          <small>Waypoint cues as you fly</small>
        </button>
        <button data-mode="quiz">
          <b>Quiz flight</b>
          <small>Pause, recall, then continue</small>
        </button>
        <button data-mode="explore">
          <b>Free explore</b>
          <small>Look around at your own pace</small>
        </button>
      </div>
      <ol id="waypoints" className="waypoints"></ol>
      <label className="check">
        <input type="checkbox" id="audio" /> Spoken callouts
      </label>
      <p id="audio-state" className="micro">
        Optional audio uses your browser’s voice.
      </p>
    </aside>
  );
}
