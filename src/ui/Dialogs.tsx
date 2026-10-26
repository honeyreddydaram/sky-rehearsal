import React from 'react';
export default function Dialogs() {
  return (
    <>
      <dialog id="quiz-dialog" aria-labelledby="quiz-title">
        <p className="eyebrow" id="question-number"></p>
        <h2 id="quiz-title">Before the next turn…</h2>
        <p id="question"></p>
        <div id="answers" className="answers"></div>
        <p id="feedback" aria-live="polite"></p>
        <div className="dialog-actions">
          <button id="end-quiz">End attempt</button>
          <button id="continue-quiz" className="primary" disabled>
            Continue flight
          </button>
        </div>
        <p className="micro">Questions refer to the selected illustrative route. Headings use true north.</p>
      </dialog>
      <dialog id="results-dialog">
        <p className="eyebrow">SESSION COMPLETE</p>
        <h2 id="result-title"></h2>
        <p id="result-body"></p>
        <div id="result-review"></div>
        <button data-close className="primary">
          Done
        </button>
      </dialog>
      <dialog id="progress-dialog">
        <div className="section-head">
          <h2>Your flight log</h2>
          <button data-close aria-label="Close">
            ×
          </button>
        </div>
        <p id="progress-person" className="micro"></p>
        <div id="progress-stats" className="stats"></div>
        <div id="history"></div>
        <div className="dialog-actions">
          <button id="export-progress" className="secondary">
            Export progress
          </button>
          <label className="file-button">
            Import backup
            <input type="file" id="restore-progress" accept="application/json,.json" />
          </label>
        </div>
        <p className="micro">
          Profiles are saved on this browser only. Export a backup to move them to another device. There is no
          cloud account or automatic sync.
        </p>
      </dialog>
      <dialog id="profile-dialog">
        <div className="section-head">
          <h2>Learner profiles</h2>
          <button data-close aria-label="Close">
            ×
          </button>
        </div>
        <p className="micro">Separate practice histories on this device.</p>
        <div id="profile-list"></div>
        <form id="new-profile">
          <label>
            Learner name
            <input id="learner-name" maxLength={40} required autoComplete="off" placeholder="Your name" />
          </label>
          <button className="primary">Add learner</button>
        </form>
      </dialog>
      <dialog id="settings-dialog">
        <div className="section-head">
          <h2>Map settings</h2>
          <button data-close aria-label="Close">
            ×
          </button>
        </div>
        <label>
          Imagery
          <select id="basemap">
            <option defaultValue="satellite">Satellite</option>
            <option defaultValue="streets">Street map</option>
          </select>
        </label>
        <label>
          Quality
          <select id="quality">
            <option defaultValue="balanced">Balanced</option>
            <option defaultValue="sharp">Sharp</option>
          </select>
        </label>
        <label className="check">
          <input type="checkbox" id="labels" defaultChecked />
          Landmark labels
        </label>
        <hr />
        <h3>Terrain &amp; buildings</h3>
        <p className="micro">
          Use a Cesium ion read-only token with access to World Terrain and OSM Buildings. It is used only for
          this tab session and sent to Cesium to load these assets. Building coverage and detail vary by
          location.
        </p>
        <label>
          Cesium ion access token
          <input id="ion-token" type="password" autoComplete="off" placeholder="Paste your read-only token" />
        </label>
        <label className="check">
          <input type="checkbox" id="google-3d-beta" /> Google 3D (beta)
        </label>
        <p className="micro">
          Experimental: loads Google Photorealistic 3D Tiles through Cesium ion using the token above, instead
          of World Terrain. Google’s terms for this asset require hiding other imagery, terrain, and OSM
          buildings while it’s on, so this does that automatically; Google’s own credits stay visible below
          the map. Needs a token with the <b>geocode</b> scope — your account’s default ion token has this,
          but a token you scoped down to specific assets (as suggested above for World Terrain) usually won’t,
          and Google 3D will fail to load with that one. Not verified end-to-end in development — try it and
          report back if something looks wrong.
        </p>
        <button id="connect-terrain" className="primary">
          Load 3D detail
        </button>
        <button id="disconnect-terrain" className="secondary">
          Use basic globe
        </button>
        <p id="terrain-message" aria-live="polite" className="micro"></p>
      </dialog>
      <dialog id="import-dialog">
        <div className="section-head">
          <h2>Bring your flight profile</h2>
          <button data-close aria-label="Close">
            ×
          </button>
        </div>
        <p>
          Import altitude and true airspeed schedules from your instructor or a prepared flight recording.
        </p>
        <p className="micro">
          Use route progress 0–1, altitude in feet with an explicit reference, and true airspeed in knots. MSL
          heights also need a local geoid offset to position them in Cesium. Imported data remains on this
          browser; it does not certify the route.
        </p>
        <label className="file-button">
          Choose JSON profile
          <input type="file" id="import-profile" accept="application/json,.json" />
        </label>
        <button id="template-download" className="secondary">
          Download example format
        </button>
        <p id="import-message" aria-live="polite"></p>
        <p className="micro">
          Optional callouts can include your instructor’s turn and descent instructions. The example file
          contains demo values, not an actual flight profile.
        </p>
      </dialog>
    </>
  );
}
