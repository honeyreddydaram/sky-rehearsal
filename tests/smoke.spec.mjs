// End-to-end smoke test: loads the real page in a real browser and checks the app
// actually booted. This is the test that would have caught the broken <script> tag
// from the Phase 1 PR (a missing </script> on the Cesium tag silently swallowed the
// <script type="module" src="app.js"> tag as text — valid HTML, so no linter or HTML
// validator flags it; only running the page for real shows app.js never executed).
import {test, expect} from '@playwright/test';

test('app boots: route distance populates and no page errors', async ({page}) => {
  const pageErrors = [];
  page.on('pageerror', (err) => pageErrors.push(err));

  await page.goto('/');

  // route-distance starts as an em dash and is set once app.js's bootstrap
  // (profilesUI -> profileOptions -> rebuildTrace -> reset -> refresh) runs. This
  // happens before Cesium/WebGL init, so the assertion doesn't depend on the CDN or
  // on headless Chromium's WebGL support -- only on app.js having executed at all.
  await expect(page.locator('#route-distance')).not.toHaveText('—', {timeout: 10_000});
  await expect(page.locator('#route-distance')).toContainText('NM');

  expect(pageErrors.map((e) => e.message)).toEqual([]);
});

test('switching route and mode updates the briefing panel', async ({page}) => {
  await page.goto('/');
  await expect(page.locator('#route-distance')).not.toHaveText('—', {timeout: 10_000});

  const before = await page.locator('#route-distance').textContent();
  // Outer loop is the default route, so switch to inner to actually exercise a change.
  await page.click('[data-route="inner"]');
  await expect(page.locator('#route-distance')).not.toHaveText(before ?? '', {timeout: 5_000});

  await page.click('[data-mode="quiz"]');
  await expect(page.locator('[data-mode="quiz"]')).toHaveClass(/selected/);
});

test('Phase 2b: airfield panel loads real data, runway switch, and click-to-identify', async ({page}) => {
  const pageErrors = [];
  page.on('pageerror', (err) => pageErrors.push(err));

  await page.goto('/');
  await expect(page.locator('#route-distance')).not.toHaveText('—', {timeout: 10_000});

  // Engine status settles to either "Satellite / Cesium" (WebGL worked) or "Study
  // diagram" (fell back to SVG) -- either is a valid outcome in headless CI, both
  // code paths (map.init()'s try and catch) must leave the rest of app.js working.
  await expect(page.locator('#engine-status')).not.toHaveText('Opening map', {timeout: 10_000});

  // airport.js's fetch-and-validate of 10 JSON files + airfield.js's rendering ran
  // without throwing, and actually populated the DOM from real data.
  await expect(page.locator('#circuit-legs .circuit-leg').first()).toBeVisible({timeout: 10_000});
  await expect(page.locator('#aircraft-select option[value="VT-TSB"]')).toHaveCount(1);
  const rwy27Note = await page.locator('#circuit-source-note').textContent();
  expect(rwy27Note).toContain('trainee pilot');

  // Switching the active runway re-renders the circuit-leg list for RWY 09 (derived,
  // reversed leg order) without a page error.
  await page.click('[data-runway="09"]');
  await expect(page.locator('#runway-note')).toContainText('Derived from RWY 27');

  // Click-to-identify: works through either rendering path (Cesium canvas or the
  // SVG fallback) -- click whichever one is actually visible and expect the same
  // result either way.
  const target = (await page.locator('#fallback-map').isVisible()) ? '#fallback-map' : '#map canvas';
  await page.click(target, {position: {x: 450, y: 300}});
  await expect(page.locator('#identify-panel')).toBeVisible({timeout: 5_000});
  await expect(page.locator('#identify-coords')).not.toHaveText('—');

  expect(pageErrors.map((e) => e.message)).toEqual([]);
});

test('Phase 2b: Pilot view and look-around controls run without error', async ({page}) => {
  const pageErrors = [];
  page.on('pageerror', (err) => pageErrors.push(err));

  await page.goto('/');
  await expect(page.locator('#route-distance')).not.toHaveText('—', {timeout: 10_000});
  await expect(page.locator('#engine-status')).not.toHaveText('Opening map', {timeout: 10_000});

  await page.click('[data-view="pilot"]');
  await expect(page.locator('[data-view="pilot"]')).toHaveClass(/selected/);
  // Small waits between clicks: rapid back-to-back camera changes with no pause
  // overloaded the software WebGL renderer (SwiftShader) in this environment and
  // crashed the page — pacing the clicks like an actual person would avoids that
  // without hiding a real app bug (the crash was in the renderer under GPU stall,
  // not in map.js's camera logic itself).
  for (const look of ['left', 'ahead', 'right', 'down', 'ahead']) {
    await page.click(`[data-look="${look}"]`);
    await page.waitForTimeout(150);
  }
  await page.click('[data-view="follow"]');
  await page.waitForTimeout(150);
  await page.click('[data-view="overview"]');
  await expect(page.locator('[data-view="overview"]')).toHaveClass(/selected/);

  expect(pageErrors.map((e) => e.message)).toEqual([]);
});

test('Phase 2b: Google 3D (beta) checkbox exists, unchecked, no network by default', async ({page}) => {
  const pageErrors = [];
  page.on('pageerror', (err) => pageErrors.push(err));

  await page.goto('/');
  await expect(page.locator('#route-distance')).not.toHaveText('—', {timeout: 10_000});

  // Native <dialog> elements aren't rendered/accessible until opened.
  await page.click('#settings-open');
  await expect(page.locator('#settings-dialog')).toBeVisible({timeout: 5_000});
  await expect(page.locator('#google-3d-beta')).toBeVisible();
  await expect(page.locator('#google-3d-beta')).not.toBeChecked();

  expect(pageErrors.map((e) => e.message)).toEqual([]);
});

test('circuit drives playback and runway changes reset the active flight', async ({page}) => {
  await page.goto('/');
  await expect(page.locator('#flight-phase')).toContainText('RWY 27 circuit');
  await expect(page.locator('#waypoints li').first()).toContainText('upwind');
  await page.click('#play');
  await page.locator('#timeline').fill('500');
  await expect(page.locator('#flight-phase')).toContainText('downwind');
  await page.click('[data-runway="09"]');
  await expect(page.locator('#flight-phase')).toContainText('RWY 09 circuit');
  await expect(page.locator('#percentage')).toHaveText('0%');
  await expect(page.locator('#play')).toHaveText('Start rehearsal');
  await page.click('[data-route="inner"]');
  await expect(page.locator('#flight-phase')).toContainText('Inner legacy loop');
  await page.click('[data-route="circuit"]');
  await expect(page.locator('#flight-phase')).toContainText('RWY 09 circuit');
});

test('recorded flight import, replay, cameras, rejection and clearing', async ({page}) => {
  await page.goto('/');
  await expect(page.locator('#flight-phase')).toContainText('RWY 27');
  await page.locator('#recording-geoid').fill('-76');
  const csv =
    'timestamp,latitude,longitude,altitude_m\n2026-01-01T00:00:00Z,17.45,78.45,600\n2026-01-01T00:00:10Z,17.46,78.46,610';
  await page
    .locator('#recording-file')
    .setInputFiles({name: 'flight.csv', mimeType: 'text/csv', buffer: Buffer.from(csv)});
  await expect(page.locator('#recording-status')).toContainText('2 points loaded');
  await page.locator('#recording-time').fill('500');
  await expect(page.locator('#recording-telemetry')).toContainText('5.0 / 10.0 s');
  await page.click('[data-view="follow"]');
  await page.click('#recording-play');
  await expect(page.locator('#recording-play')).toHaveText('Pause recording');
  await page.click('#recording-play');
  await page
    .locator('#recording-file')
    .setInputFiles({name: 'bad.csv', mimeType: 'text/csv', buffer: Buffer.from('wrong,columns\n1,2')});
  await expect(page.locator('#recording-status')).toContainText('Import failed');
  await expect(page.locator('#recording-clear')).toBeEnabled();
  await page.click('#play');
  await expect(page.locator('#play')).toHaveText('Pause');
  await expect(page.locator('#recording-play')).toHaveText('Replay recording');
  await page.click('#recording-clear');
  await expect(page.locator('#recording-play')).toBeDisabled();
  await expect(page.locator('#recording-status')).toHaveText('No recorded flight loaded.');
});

test('GPX overlay and replay work in diagram fallback', async ({page}) => {
  await page.addInitScript(() => {
    const getContext = HTMLCanvasElement.prototype.getContext;
    HTMLCanvasElement.prototype.getContext = function (type, ...args) {
      if (String(type).includes('webgl')) return null;
      return getContext.call(this, type, ...args);
    };
  });
  await page.goto('/');
  await expect(page.locator('#engine-status')).toHaveText('Study diagram');
  await page.locator('#recording-reference').selectOption('ELLIPSOID');
  await page.locator('#recording-file').setInputFiles('public/examples/demo-flight.gpx');
  await expect(page.locator('#diagram-recording')).toHaveCount(1);
  const before = await page.locator('#diagram-plane').getAttribute('transform');
  await page.locator('#recording-time').fill('700');
  await expect(page.locator('#diagram-plane')).not.toHaveAttribute('transform', before);
  await page.click('[data-route="inner"]');
  await expect(page.locator('#diagram-recording')).toHaveCount(1);
  await page.click('#recording-clear');
  await expect(page.locator('#diagram-recording')).toHaveCount(0);
});

test('difficulty removes diagram assistance and exam defers answer feedback', async ({page}) => {
  await page.addInitScript(() => {
    const original = HTMLCanvasElement.prototype.getContext;
    HTMLCanvasElement.prototype.getContext = function (type, ...args) {
      return String(type).includes('webgl') ? null : original.call(this, type, ...args);
    };
  });
  await page.goto('/');
  await expect(page.locator('#engine-status')).toHaveText('Study diagram');
  await expect(page.locator('#diagram-planned')).toHaveCount(1);
  await page.selectOption('#difficulty', 'intermediate');
  await expect(page.locator('#waypoints')).toBeHidden();
  await expect(page.locator('#diagram-planned')).toHaveCount(1);
  await page.selectOption('#difficulty', 'advanced');
  await expect(page.locator('#diagram-planned')).toHaveCount(0);
  await expect(page.locator('#flight-phase')).toBeHidden();
  await page.click('#training-hint-button');
  await expect(page.locator('#training-hint')).toContainText('Recall the circuit sequence');
  await page.click('[data-mode="exam"]');
  await expect(page.locator('#training-hint-button')).toBeDisabled();
  await expect(page.locator('#timeline')).toBeDisabled();
  await expect(page.locator('#airfield-panel')).toBeHidden();
  await page.evaluate(async () => {
    const {state} = await import('/src/flight/state.js');
    state.rate = 10000;
  });
  await page.click('#play');
  for (let index = 0; index < 5; index++) {
    await expect(page.locator('#quiz-dialog')).toBeVisible();
    await expect(page.locator('#question-number')).toHaveText(`CHECKPOINT ${index + 1} OF 5`);
    await expect(page.locator('#question-hint')).toBeDisabled();
    await page.locator('#answers button').first().click();
    await expect(page.locator('#answers .correct, #answers .incorrect')).toHaveCount(0);
    await expect(page.locator('#feedback')).toContainText('after completion');
    await page.click('#continue-quiz');
  }
  await expect(page.locator('#results-dialog')).toBeVisible();
  await expect(page.locator('#result-review .review-row')).toHaveCount(5);
  const sessions = await page.evaluate(
    () => JSON.parse(localStorage.getItem('sky-rehearsal-learners-v1')).learners[0].sessions,
  );
  expect(sessions).toHaveLength(1);
  expect(sessions[0]).toMatchObject({mode: 'exam', difficulty: 'advanced', hintsUsed: 0, total: 5});
  await page.locator('#results-dialog [data-close]').click();
  await page.click('[data-mode="guided"]');
  await page.selectOption('#difficulty', 'beginner');
  await expect(page.locator('#diagram-planned')).toHaveCount(1);
  await expect(page.locator('#waypoints')).toBeVisible();
});

test('landmark and decision exercises use checkpoint questions; changing difficulty resets them', async ({
  page,
}) => {
  await page.goto('/');
  await expect(page.locator('#route-distance')).toContainText('NM');
  await page.click('[data-mode="landmarks"]');
  await page.evaluate(async () => {
    const {state} = await import('/src/flight/state.js');
    state.rate = 10000;
  });
  await page.click('#play');
  await expect(page.locator('#question')).toContainText('reference notes');
  await page.click('#question-hint');
  await expect(page.locator('#question-hint-text')).toContainText('Recall the circuit sequence');
  await page.locator('#answers button').first().click();
  await expect(page.locator('#feedback')).not.toBeEmpty();
  await page.click('#end-quiz');
  await page.click('[data-mode="decisions"]');
  await page.click('#play');
  await expect(page.locator('#question')).toContainText('What follows');
  await page.click('#end-quiz');
  await page.click('[data-mode="practice"]');
  await page.click('#training-hint-button');
  await expect(page.locator('#training-hint')).not.toBeEmpty();
  await page.selectOption('#difficulty', 'examiner');
  await expect(page.locator('#training-hint')).toBeEmpty();
  await expect(page.locator('#training-hint-button')).toBeDisabled();
  await expect(page.locator('#percentage')).toHaveText('0%');
});

test('recorded comparison shows missing sensors and replays the largest path difference', async ({page}) => {
  await page.addInitScript(() => {
    const original = HTMLCanvasElement.prototype.getContext;
    HTMLCanvasElement.prototype.getContext = function (type, ...args) {
      return String(type).includes('webgl') ? null : original.call(this, type, ...args);
    };
  });
  await page.goto('/');
  await expect(page.locator('#engine-status')).toHaveText('Study diagram');
  await page.selectOption('#recording-reference', 'ELLIPSOID');
  await page.locator('#recording-file').setInputFiles({
    name: 'comparison.csv',
    mimeType: 'text/csv',
    buffer: Buffer.from(
      'timestamp,latitude,longitude,altitude_m\n2026-01-01T00:00:00Z,17.50,78.60,900\n2026-01-01T00:00:10Z,17.501,78.601,910\n2026-01-01T00:00:20Z,17.502,78.602,920',
    ),
  });
  await expect(page.locator('#recording-assess')).toBeEnabled();
  await page.click('#recording-assess');
  await expect(page.locator('#recording-debrief')).toContainText('Overall flight score unavailable');
  await expect(page.locator('#recording-debrief')).toContainText('No measured true airspeed');
  await expect(page.locator('#recording-debrief')).toContainText('GPS track is not nose heading');
  const replay = page
    .locator('#recording-debrief button')
    .filter({hasText: /^Replay /})
    .first();
  await expect(replay).toBeEnabled();
  await replay.click();
  await expect(page.locator('#diagram-deviation')).toHaveCount(1);
  await expect(page.locator('#recording-play')).toHaveText('Pause recording');
  await page.click('#recording-clear');
  await expect(page.locator('#recording-debrief')).toBeEmpty();
  await expect(page.locator('#diagram-deviation')).toHaveCount(0);
  await expect(page.locator('#recording-assess')).toBeDisabled();
});

test('completed rehearsal retains an honest debrief and can replay a difference without logging again', async ({
  page,
}) => {
  await page.goto('/');
  await expect(page.locator('#route-distance')).toContainText('NM');
  await page.fill('#wind-speed', '20');
  await page.evaluate(async () => {
    const {state} = await import('/src/flight/state.js');
    state.rate = 10000;
  });
  await page.click('#play');
  await expect(page.locator('#results-dialog')).toBeVisible();
  await expect(page.locator('#result-debrief')).toContainText('not independently measured pilot control');
  await expect(page.locator('#result-debrief')).toContainText('Overall flight score unavailable');
  const before = await page.evaluate(
    () => JSON.parse(localStorage.getItem('sky-rehearsal-learners-v1')).learners[0].sessions,
  );
  expect(before).toHaveLength(1);
  expect(before[0].debrief.version).toBe(1);
  await page
    .locator('#result-debrief button')
    .filter({hasText: /^Replay /})
    .first()
    .click();
  await expect(page.locator('#results-dialog')).not.toBeVisible();
  await expect(page.locator('#callout-title')).toHaveText('DEBRIEF REPLAY COMPLETE');
  const after = await page.evaluate(
    () => JSON.parse(localStorage.getItem('sky-rehearsal-learners-v1')).learners[0].sessions,
  );
  expect(after).toHaveLength(1);
  await page.click('#progress-open');
  await page.locator('#history button').filter({hasText: 'View debrief'}).click();
  await expect(page.locator('#history-debrief')).toContainText('Criteria v1');
  await expect(
    page
      .locator('#history-debrief button')
      .filter({hasText: /^Replay /})
      .first(),
  ).toBeDisabled();
});

test('adaptive instructor progresses hints and respects assessment policy', async ({page}) => {
  await page.goto('/');
  await expect(page.locator('#route-distance')).toContainText('NM');
  await page.click('#play');
  await expect(page.locator('#play')).toHaveText('Pause');
  await page.click('#instructor-hint');
  await expect(page.locator('#play')).toHaveText('Resume');
  await expect(page.locator('#instructor-content')).toContainText('What comes next?');
  await page.getByRole('button', {name: 'Ask Gemini to explain', exact: true}).click();
  await expect(page.locator('#instructor-content')).toContainText('Sign in to use Gemini');
  await page.click('#instructor-hint');
  await expect(page.locator('#instructor-content')).toContainText('You are studying');
  await page.click('[data-mode="exam"]');
  await expect(page.locator('#instructor-hint')).toBeDisabled();
  await expect(page.locator('#instructor-content')).toBeEmpty();
  await page.click('[data-mode="practice"]');
  await page.selectOption('#difficulty', 'examiner');
  await expect(page.locator('#instructor-hint')).toBeDisabled();
  await page.selectOption('#difficulty', 'beginner');
  await page.click('#instructor-hint');
  await expect(page.locator('#instructor-content')).toContainText('What comes next?');
});

test('weather observations require fresh steady wind and apply a reproducible scenario', async ({page}) => {
  await page.goto('/');
  await expect(page.locator('#route-distance')).toContainText('NM');
  const now = new Date();
  const stamp = [now.getUTCDate(), now.getUTCHours(), now.getUTCMinutes()]
    .map((n) => String(n).padStart(2, '0'))
    .join('');
  await page.route('**/api/weather/metar', (route) =>
    route.fulfill({
      contentType: 'application/json',
      body: JSON.stringify({raw: `VOHY ${stamp}Z 27010G20KT 8000 SCT030 30/22 Q1008`}),
    }),
  );
  await page.click('#weather-load');
  await expect(page.locator('#weather-status')).toContainText('QNH 1008');
  await page.click('#play');
  await page.click('#weather-apply');
  await expect(page.locator('#percentage')).toHaveText('0%');
  await expect(page.locator('#weather-status')).toContainText('Applied VOHY observation');
  expect(
    await page.evaluate(async () => {
      const {state} = await import('/src/flight/state.js');
      return [state.windSpeed, state.weather.qnh];
    }),
  ).toEqual([10, 1008]);
  await page.fill('#weather-metar', `VOHY ${stamp}Z VRB05KT CAVOK 20/10 Q1013`);
  await page.click('#weather-decode');
  await expect(page.locator('#weather-apply')).toBeDisabled();
  await expect(page.locator('#weather-status')).toContainText('Variable wind');
  await page.selectOption('#weather-scenario', 'crosswind');
  expect(
    await page.evaluate(async () => {
      const {state} = await import('/src/flight/state.js');
      return state.windSpeed;
    }),
  ).toBe(12);
  await page.locator('#wind-speed').press('ArrowRight');
  await expect(page.locator('#weather-status')).toContainText('Manual scenario');
});

test('reviewed aircraft inputs change the flight and radio readbacks stay separate from scores', async ({
  page,
}) => {
  await page.goto('/');
  await expect(page.locator('#route-distance')).toContainText('NM');
  const upload = async (type, speed) =>
    page.locator('#performance-file').setInputFiles({
      name: `${type}.json`,
      mimeType: 'application/json',
      buffer: Buffer.from(
        JSON.stringify({
          version: 1,
          typeCode: type,
          source: 'Synthetic test source',
          reference: 'Fixture — not POH',
          reviewedBy: 'Test reviewer',
          bankDeg: 20,
          phaseSpeedsKias: Object.fromEntries(
            ['takeoff', 'upwind', 'crosswind', 'downwind', 'base', 'final', 'landing'].map((phase) => [
              phase,
              speed,
            ]),
          ),
        }),
      ),
    });
  const duration = () =>
    page.evaluate(async () => {
      const {secondsAt} = await import('/src/flight/state.js');
      return secondsAt(1);
    });
  await upload('c152', 65);
  await expect(page.locator('#performance-status')).toContainText('C152');
  const slower = await duration();
  await upload('da42ng', 100);
  await expect(page.locator('#performance-status')).toContainText('DA42NG');
  expect(await duration()).toBeLessThan(slower);
  await page.click('[data-route="inner"]');
  expect(
    await page.evaluate(async () => {
      const {activePerformance} = await import('/src/flight/state.js');
      return activePerformance();
    }),
  ).toBeNull();
  await expect(page.locator('#profile-source')).toContainText('Demo altitude');
  await page.click('[data-route="circuit"]');
  await page.selectOption('#performance-type', 'c172r');
  await expect(page.locator('#performance-status')).toContainText('Demo speeds remain active');
  await page.click('#radio-new');
  await expect(page.locator('#radio-tower')).toContainText('November, report downwind runway 2 7');
  await page.fill('#radio-readback', 'November downwind runway two seven');
  await page.click('#radio-check');
  await expect(page.locator('#radio-result')).toContainText('expected call sign');
  await page.fill('#radio-readback', 'November base runway zero nine');
  await page.click('#radio-check');
  await expect(page.locator('#radio-result')).toContainText('correct circuit leg, correct runway');
  await page.click('#radio-record');
  await expect(page.locator('#radio-result')).toContainText('Sign in for Google transcription');
  await page.click('[data-mode="exam"]');
  await expect(page.locator('#radio-tower')).toHaveText('Choose a tower prompt.');
  await page.click('#radio-new');
  await expect(page.locator('#radio-result')).toContainText('separate from exams');
});

test('restored progress retains weather and wind settings', async ({page}) => {
  await page.goto('/');
  await expect(page.locator('#route-distance')).toContainText('NM');
  const environment = {
    version: 1,
    aircraft: null,
    weather: {
      source: 'Fixture weather',
      observedAt: null,
      qnh: 1008,
      temperature: 30,
      visibilityM: 8000,
      clouds: 'SCT030',
      gustKt: null,
    },
  };
  const backup = {
    schemaVersion: 1,
    learner: {
      name: 'Backup fixture',
      flightProfiles: [],
      sessions: [
        {
          route: 'circuit27',
          mode: 'guided',
          completedAt: new Date().toISOString(),
          profile: 'Demo',
          windFrom: 270,
          windSpeed: 10,
          correctWind: true,
          environment,
        },
      ],
    },
  };
  await page.click('#profile-open');
  await page.locator('#restore-progress').setInputFiles({
    name: 'backup.json',
    mimeType: 'application/json',
    buffer: Buffer.from(JSON.stringify(backup)),
  });
  await expect(page.locator('#profile-open')).toContainText('Backup fixture');
  const restored = await page.evaluate(async () => {
    const {learner} = await import('/src/progress/progress.js');
    const session = learner().sessions[0];
    return {
      windFrom: session.windFrom,
      windSpeed: session.windSpeed,
      correctWind: session.correctWind,
      environment: session.environment,
    };
  });
  expect(restored).toEqual({windFrom: 270, windSpeed: 10, correctWind: true, environment});
});
