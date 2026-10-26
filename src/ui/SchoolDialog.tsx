import React from 'react';
export default function SchoolDialog() {
  return (
    <dialog id="school-dialog" aria-labelledby="school-title">
      <button data-close="school-dialog" aria-label="Close school">
        ×
      </button>
      <h2 id="school-title">Flight school</h2>
      <p className="micro">
        Only submitted work is shared. Results are self-study evidence; instructor review remains separate
        from recall scores.
      </p>
      <label>
        School ID
        <input id="school-id" maxLength={128} autoComplete="off" />
      </label>
      <button id="school-load">Open / refresh school</button>
      <p id="school-status" role="status">
        Sign in and enter the school ID provided by your school.
      </p>
      <div id="school-content" hidden>
        <section id="school-admin" hidden>
          <h3>Manage membership</h3>
          <form id="school-member-form">
            <label>
              Account ID
              <input id="school-member-uid" maxLength={128} required />
            </label>
            <label>
              Display name
              <input id="school-member-name" maxLength={80} required />
            </label>
            <label>
              School role
              <select id="school-member-role">
                <option value="student">Student</option>
                <option value="instructor">Instructor</option>
              </select>
            </label>
            <label>
              Assigned instructor<select id="school-member-mentor"></select>
            </label>
            <button>Save membership</button>
            <button type="button" id="school-member-revoke">
              Revoke membership for this account ID
            </button>
          </form>
          <p className="micro">
            An instructor also needs a trusted global instructor role from the platform operator. School
            administrators cannot grant that role here.
          </p>
        </section>
        <section id="school-staff" hidden>
          <h3>Scenario builder</h3>
          <form id="school-scenario-form">
            <label>
              Title
              <input id="school-scenario-title" maxLength={120} required />
            </label>
            <p>Airport: VOHY · unverified circuit geometry</p>
            <label>
              Runway
              <select id="school-scenario-runway">
                <option value="27">27</option>
                <option value="09">09</option>
              </select>
            </label>
            <label>
              Aircraft
              <select id="school-scenario-aircraft">
                <option value="demo">Explicit demo aircraft</option>
                <option value="c152">C152</option>
                <option value="c172r">C172R</option>
                <option value="c172s">C172S</option>
                <option value="da42ng">DA42 NG</option>
              </select>
            </label>
            <label>
              Reviewed aircraft JSON (required for named types)
              <input id="school-scenario-performance" type="file" accept=".json,application/json" />
            </label>
            <label>
              Weather
              <select id="school-scenario-weather">
                <option value="calm">Calm / standard</option>
                <option value="westerly">Westerly</option>
                <option value="crosswind">Crosswind</option>
              </select>
            </label>
            <label>
              Wind from (°T)
              <input
                id="school-scenario-wind-from"
                type="number"
                min="0"
                max="360"
                defaultValue="270"
                required
              />
            </label>
            <label>
              Wind speed (kt)
              <input
                id="school-scenario-wind-speed"
                type="number"
                min="0"
                max="35"
                defaultValue="10"
                required
              />
            </label>
            <label>
              Mode
              <select id="school-scenario-mode">
                <option value="landmarks">Landmark recognition</option>
                <option value="decisions">Decision training</option>
                <option value="quiz">Quiz</option>
                <option value="exam">Exam</option>
              </select>
            </label>
            <label>
              Difficulty
              <select id="school-scenario-difficulty">
                <option value="beginner">Beginner</option>
                <option value="intermediate">Intermediate</option>
                <option value="advanced">Advanced</option>
                <option value="examiner">Examiner</option>
              </select>
            </label>
            <label>
              Required recall score (%)
              <input id="school-scenario-score" type="number" min="0" max="100" defaultValue="80" required />
            </label>
            <label>
              Training notes
              <textarea id="school-scenario-notes" maxLength={1000} />
            </label>
            <button>Save scenario draft</button>
          </form>
          <div id="school-scenarios"></div>
          <h3>Assign a published scenario</h3>
          <form id="school-assignment-form">
            <label>
              Student<select id="school-assignment-student" required></select>
            </label>
            <label>
              Scenario<select id="school-assignment-scenario" required></select>
            </label>
            <button>Assign exercise</button>
          </form>
        </section>
        <h3 id="school-roster-heading">Student progress</h3>
        <div id="school-roster"></div>
        <h3>Assignments</h3>
        <div id="school-assignments"></div>
        <h3>Submitted attempts</h3>
        <div id="school-submissions"></div>
        <div id="school-debrief"></div>
      </div>
    </dialog>
  );
}
