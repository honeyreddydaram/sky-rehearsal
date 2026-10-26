import React from 'react';
import Briefing from './ui/Briefing';
import FlightPanel from './ui/FlightPanel';
import FlightLab from './ui/FlightLab';
import AirfieldPanel from './ui/AirfieldPanel';
import Dialogs from './ui/Dialogs';
import {useEffect} from 'react';

// React mounts the interface once. Existing engines own its live DOM until their
// individual features are migrated; React must not rerender those controls.
export default function App() {
  useEffect(() => {
    void import('./bootstrap.js').catch((error) => {
      console.error('Rehearsal startup failed:', error);
      const status = document.getElementById('engine-status');
      if (status) status.textContent = 'Unable to start. Please refresh.';
    });
  }, []);
  return (
    <>
      <header>
        <a className="brand" href="./">
          <span className="brand-icon">↗</span>
          <span>
            Sky Rehearsal<small>ROUTE TRAINING</small>
          </span>
        </a>
        <nav>
          <button id="progress-open">My progress</button>
          <button id="settings-open">Settings</button>
          <button id="profile-open" className="profile-pill">
            Learner
          </button>
        </nav>
      </header>
      <main>
        <section className="page-heading">
          <div>
            <p className="eyebrow">HYDERABAD / BEGUMPET</p>
            <h1>Know the route. Build confidence.</h1>
            <p>Brief, rehearse, and test your recall — one waypoint at a time.</p>
          </div>
          <span className="subtle-pill">Ground rehearsal</span>
        </section>
        <div className="layout">
          <Briefing />
          <FlightPanel />
          <FlightLab />
        </div>
        <AirfieldPanel />
        <footer>
          <span>SKY REHEARSAL / PRACTICE WITH PURPOSE</span>
          <span id="save-status">Progress stays on this browser.</span>
        </footer>
        <p id="notification" role="status" hidden></p>
      </main>
      <Dialogs />
    </>
  );
}
