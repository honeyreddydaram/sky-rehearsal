import React from 'react';
import {MODES, DIFFICULTIES, modeLabel} from '../training/engine.mjs';
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
        {MODES.map((mode) => (
          <button key={mode} data-mode={mode}>
            {modeLabel(mode)}
          </button>
        ))}
      </div>
      <label>
        Difficulty
        <select id="difficulty" defaultValue="beginner">
          {DIFFICULTIES.map((level) => (
            <option key={level} value={level}>
              {level[0].toUpperCase() + level.slice(1)}
            </option>
          ))}
        </select>
      </label>
      <p id="training-policy" className="micro"></p>
      <button id="training-hint-button">Request hint</button>
      <p id="training-hint" className="micro" role="status"></p>
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
