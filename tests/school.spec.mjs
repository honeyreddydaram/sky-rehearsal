import {execFileSync} from 'node:child_process';
import {test, expect} from '@playwright/test';

test('school admin assigns an exercise, student submits it, and instructor reviews and replays shared work', async ({
  browser,
}) => {
  test.setTimeout(150000);
  const fixture = JSON.parse(
    execFileSync(
      'uv',
      ['run', '--project', 'backend', '--frozen', 'python', 'backend/tests/seed_school.py'],
      {
        encoding: 'utf8',
        env: {
          ...process.env,
          FIREBASE_PROJECT_ID: 'demo-sky-rehearsal',
          FIREBASE_AUTH_EMULATOR_HOST: '127.0.0.1:9099',
          FIRESTORE_EMULATOR_HOST: '127.0.0.1:8080',
        },
      },
    ),
  );
  const teacherContext = await browser.newContext(),
    studentContext = await browser.newContext();
  const teacher = await teacherContext.newPage(),
    student = await studentContext.newPage();
  const signIn = async (page, account) => {
    await page.goto('/');
    await page.click('#account-open');
    await page.fill('#account-email', account.email);
    await page.fill('#account-password', fixture.password);
    await page.click('#account-signin');
    await expect(page.locator('#account-status')).toContainText('Account progress loaded');
    await page.locator('#account-dialog [data-close]').click();
  };
  const openSchool = async (page) => {
    await page.click('#school-open');
    await page.fill('#school-id', fixture.school);
    await page.click('#school-load');
    await expect(page.locator('#school-status')).toContainText('School loaded');
  };
  await signIn(teacher, fixture.teacher);
  await openSchool(teacher);
  await teacher.fill('#school-member-uid', fixture.student.uid);
  await teacher.fill('#school-member-name', 'Student fixture');
  await teacher.selectOption('#school-member-mentor', fixture.teacher.uid);
  await teacher
    .locator('#school-member-form button[type="submit"], #school-member-form button:not([type])')
    .click();
  await expect(teacher.locator('#school-status')).toContainText('membership saved');
  await teacher.fill('#school-scenario-title', 'Beginner RWY 27 landmark exercise');
  await teacher.locator('#school-scenario-form button').click();
  await expect(teacher.locator('#school-status')).toContainText('Draft saved');
  await expect(teacher.locator('#school-scenarios')).toContainText('DRAFT');
  await teacher.getByRole('button', {name: 'Publish reviewed scenario'}).click();
  await expect(teacher.locator('#school-status')).toContainText('Scenario published');
  await teacher.locator('#school-assignment-form button').click();
  await expect(teacher.locator('#school-status')).toContainText('scenario assigned');
  await signIn(student, fixture.student);
  await openSchool(student);
  await expect(student.locator('#school-staff')).toBeHidden();
  await student.getByRole('button', {name: 'Launch assignment'}).click();
  await expect(student.locator('#assignment-status')).toContainText('Beginner RWY 27');
  expect(
    await student.evaluate(async () => {
      const {state} = await import('/src/flight/state.js');
      state.rate = 10000;
      return [state.mode, state.windSpeed, state.correctWind, Boolean(state.assignment)];
    }),
  ).toEqual(['landmarks', 10, true, true]);
  await student.click('#play');
  for (let checkpoint = 0; checkpoint < 5; checkpoint++) {
    await expect(student.locator('#quiz-dialog')).toBeVisible();
    const answer = await student.evaluate(async () => {
      const {state, waypoints, planBearing, stateAt} = await import('/src/flight/state.js');
      const {questionFor} = await import('/src/training/engine.mjs');
      const w = waypoints()[state.pending];
      return questionFor({
        mode: state.mode,
        index: state.pending,
        waypoints: waypoints(),
        course: planBearing(Math.min(1, w.p + 0.045)),
        windSpeed: state.windSpeed,
        windPossible: stateAt(w.p).possible,
      }).correct;
    });
    await student.locator('#answers').getByRole('button', {name: answer, exact: true}).click();
    await student.click('#continue-quiz');
  }
  await expect(student.locator('#results-dialog')).toBeVisible();
  await student.locator('#results-dialog [data-close]').click();
  await expect(student.locator('#save-status')).toHaveText('Saved to your cloud account');
  await student.selectOption('#recording-reference', 'ELLIPSOID');
  await student.locator('#recording-file').setInputFiles('public/examples/demo-flight.gpx');
  await student.click('#recording-save-cloud');
  await expect(student.locator('#recording-status')).toContainText('Flight saved');
  await student.click('#school-open');
  await student.click('#school-load');
  await student.getByRole('button', {name: 'Choose an owned recording to share'}).click();
  await student.getByRole('combobox', {name: 'Optional shared recording'}).selectOption({index: 1});
  await student.getByRole('button', {name: 'Submit selected attempt'}).click();
  await expect(student.locator('#school-status')).toContainText('Attempt submitted');
  await expect(student.locator('#school-submissions')).toContainText('recall 100%');
  await teacher.click('#school-load');
  await expect(teacher.locator('#school-roster')).toContainText('1 submitted attempts');
  await teacher.getByRole('button', {name: 'View submitted debrief'}).click();
  await expect(teacher.locator('#school-debrief')).toContainText('Criteria v1');
  await teacher
    .getByRole('textbox', {name: 'Instructor review notes'})
    .fill('Review the base landmark before the next exercise.');
  await teacher.getByRole('button', {name: 'Save instructor review'}).click();
  await expect(teacher.locator('#school-status')).toContainText('review saved');
  await teacher.getByRole('button', {name: /Replay shared recording:/}).click();
  await expect(teacher.locator('#recording-status')).toContainText('Shared with your school');
  await teacher.click('#recording-play');
  await expect(teacher.locator('#recording-play')).toHaveText('Pause recording');
  await student.click('#school-load');
  await expect(student.locator('#school-submissions')).toContainText('Review the base landmark');
  await teacher.click('#account-open');
  await teacher.click('#account-signout');
  await expect(teacher.locator('#account-status')).toContainText('Guest practice');
  await expect(teacher.locator('#recording-play')).toBeDisabled();
  await expect(teacher.locator('#school-roster')).toBeEmpty();
  await teacherContext.close();
  await studentContext.close();
});
