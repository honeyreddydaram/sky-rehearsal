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
