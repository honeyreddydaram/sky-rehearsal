import {test, expect} from '@playwright/test';

test('account progress and flights follow the user across fresh browsers', async ({browser}) => {
  test.setTimeout(90000);
  const email = `student-${Date.now()}@example.test`,
    password = 'Local-test-password-123';
  const first = await browser.newContext();
  const page = await first.newPage();
  await page.goto('/');
  await page.click('#account-open');
  await page.fill('#account-email', email);
  await page.fill('#account-password', password);
  await page.click('#account-register');
  await expect(page.locator('#account-status')).toContainText('Account progress loaded');
  await page.locator('#account-dialog [data-close]').click();
  // Mock only the optional model response; real Firebase Auth still signs the request.
  const coachingRequests = [];
  let available = true;
  await page.route('**/api/instructor', async (route) => {
    coachingRequests.push({
      body: route.request().postDataJSON(),
      authorization: route.request().headers().authorization,
    });
    await route.fulfill({
      status: available ? 200 : 503,
      contentType: 'application/json',
      body: JSON.stringify(
        available ? {message: '<b>Recall the next checkpoint.</b>'} : {detail: 'Unavailable'},
      ),
    });
  });
  await page.click('#instructor-hint');
  await page.locator('#instructor-content button').click();
  await expect(page.locator('#instructor-content')).toContainText('Gemini / Vertex AI');
  await expect(page.locator('#instructor-content b')).toHaveCount(0);
  expect(coachingRequests[0].authorization).toMatch(/^Bearer /);
  expect(coachingRequests[0].body.kind).toBe('hint');
  expect(JSON.stringify(coachingRequests[0].body)).not.toContain(email);
  available = false;
  await page.locator('#instructor-content button').click();
  await expect(page.locator('#instructor-content')).toContainText('Gemini is unavailable');
  // Exercise microphone lifecycle and transcript review with synthetic audio/model output.
  await page.evaluate(() => {
    window.testMicrophoneStopped = false;
    navigator.mediaDevices.getUserMedia = async () => ({
      getTracks: () => [
        {
          stop: () => {
            window.testMicrophoneStopped = true;
          },
        },
      ],
    });
    window.MediaRecorder = class {
      static isTypeSupported() {
        return true;
      }
      state = 'inactive';
      start() {
        this.state = 'recording';
      }
      stop() {
        this.state = 'inactive';
        this.ondataavailable({data: new Blob([new Uint8Array([26, 69, 223, 163, 0])])});
        void this.onstop();
      }
    };
  });
  await page.route('**/api/radio/transcribe', async (route) => {
    expect(route.request().headers().authorization).toMatch(/^Bearer /);
    expect(route.request().postDataJSON().audio).toBeTruthy();
    await route.fulfill({
      contentType: 'application/json',
      body: JSON.stringify({
        transcript: 'November downwind runway two seven',
        source: 'Google Cloud Speech-to-Text',
      }),
    });
  });
  await page.click('#radio-new');
  await page.click('#radio-record');
  await expect(page.locator('#radio-result')).toContainText('Recording');
  await page.click('#radio-stop');
  await expect(page.locator('#radio-result')).toContainText('Review it, then check');
  await expect(page.locator('#radio-readback')).toHaveValue('November downwind runway two seven');
  expect(await page.evaluate(() => window.testMicrophoneStopped)).toBe(true);
  await page.click('#radio-check');
  await expect(page.locator('#radio-result')).toContainText('expected call sign');
  await page.selectOption('#weather-scenario', 'westerly');
  // Complete an actual guided circuit quickly without skipping eligibility gates.
  await page.evaluate(async () => {
    const {state} = await import('/src/flight/state.js');
    state.rate = 10000;
  });
  await page.click('#play');
  await expect(page.locator('#results-dialog')).toBeVisible({timeout: 30000});
  await page.locator('#results-dialog [data-close]').click();
  await expect(page.locator('#save-status')).toHaveText('Saved to your cloud account');
  await page.selectOption('#recording-reference', 'ELLIPSOID');
  await page.locator('#recording-file').setInputFiles('public/examples/demo-flight.gpx');
  await expect(page.locator('#recording-status')).toContainText('3 points loaded');
  await page.click('#recording-assess');
  await expect(page.locator('#recording-debrief')).toContainText('Overall flight score unavailable');
  await page.click('#recording-save-cloud');
  await expect(page.locator('#recording-status')).toHaveText('Flight saved to your account.');
  const second = await browser.newContext();
  const other = await second.newPage();
  await other.goto('/');
  await other.click('#account-open');
  await other.fill('#account-email', email);
  await other.fill('#account-password', password);
  await other.click('#account-signin');
  await expect(other.locator('#account-status')).toContainText('Account progress loaded');
  await other.locator('#account-dialog [data-close]').click();
  await other.click('#progress-open');
  await expect(other.locator('#history .history-row')).toHaveCount(1);
  await expect(other.locator('#history')).toContainText('QNH 1008 hPa');
  await other.locator('#history button').filter({hasText: 'View debrief'}).click();
  await expect(other.locator('#history-debrief')).toContainText('Criteria v1');
  await other.locator('#progress-dialog [data-close]').click();
  await other.click('#recording-list-cloud');
  await expect(other.locator('#recording-cloud-list option')).toHaveCount(1);
  await other.click('#recording-load-cloud');
  await expect(other.locator('#recording-status')).toContainText('3 points loaded from account');
  await expect(other.locator('#recording-debrief')).toContainText('Criteria v1');
  await other.click('#account-open');
  await other.click('#account-signout');
  await expect(other.locator('#account-status')).toContainText('Guest practice');
  await other.locator('#account-dialog [data-close]').click();
  await other.click('#progress-open');
  await expect(other.locator('#history .history-row')).toHaveCount(0);
  await expect(other.locator('#recording-play')).toBeDisabled();
  await first.close();
  await second.close();
});
