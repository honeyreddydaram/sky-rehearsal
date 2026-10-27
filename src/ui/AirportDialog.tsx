import React from 'react';
export default function AirportDialog() {
  return (
    <dialog id="airport-dialog" aria-labelledby="airport-builder-title">
      <button data-close="airport-dialog" aria-label="Close airport builder">
        ×
      </button>
      <h2 id="airport-builder-title">Airports &amp; package builder</h2>
      <p>
        Choose an installed airport or edit a data package. Switching airports clears the active attempt and
        recording view.
      </p>
      <label>
        Installed airport<select id="airport-catalog"></select>
      </label>
      <button id="airport-load">Use installed airport</button>
      <button id="airport-edit">Copy current package into editor</button>
      <label>
        Import airport JSON
        <input id="airport-file" type="file" accept=".json,application/json" />
      </label>
      <label>
        Airport package JSON
        <textarea id="airport-json" rows={16} maxLength={1000000} spellCheck={false} />
      </label>
      <button id="airport-validate">Validate &amp; preview</button>
      <button id="airport-export" disabled>
        Export validated package
      </button>
      <button id="airport-apply" disabled>
        Use validated package
      </button>
      <p id="airport-status" role="status"></p>
      <p className="micro">
        Source, geometry, demo flight values, landmarks, aircraft, geoid offset and review provenance stay in
        the package. A reviewer field is a user declaration, not certification. ZZZZ is a fictional example.
        School assignments use installed catalog revisions.
      </p>
    </dialog>
  );
}
