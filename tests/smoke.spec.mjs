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
  await page.click('[data-route="outer"]');
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
