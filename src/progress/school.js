import {airport, airportPackage} from '../aviation/airport.js';
import {schoolRequest} from '../school-client.js';
import {learner} from './progress.js';
import {listTracks} from '../cloud/firebase.ts';
import {$, text, showDialog} from '../ui/ui.js';
import {renderDebrief} from '../training/debrief.js';
import {studentSummary, validateScenario} from '../training/school.mjs';
import {validatePerformance} from '../aviation/conditions.mjs';
import {reviewSharedRecording} from './recording.js';

export function wireSchool(launch) {
  let school = '',
    version = 0,
    dashboard = null,
    selectedStudent = null,
    launchGeneration = 0;
  const status = (value) => text('school-status', value);
  const clear = () => {
    version++;
    dashboard = null;
    selectedStudent = null;
    $('school-content').hidden = true;
    $('school-debrief').replaceChildren();
    for (const id of [
      'school-roster',
      'school-assignments',
      'school-submissions',
      'school-scenarios',
      'school-pagination',
      'school-student-filter',
    ])
      $(id).replaceChildren();
  };
  window.addEventListener('account-changed', () => {
    clear();
    school = '';
    for (const id of ['school-member-form', 'school-scenario-form', 'school-assignment-form']) $(id).reset();
    for (const id of ['school-member-mentor', 'school-assignment-student', 'school-assignment-scenario'])
      $(id).replaceChildren();
    $('school-id').value = '';
    status('Sign in and open your school.');
  });
  $('school-id').oninput = clear;
  $('school-open').onclick = () => showDialog('school-dialog');
  window.addEventListener('assignment-cleared', () => text('assignment-status', ''));
  const api = async (path = '', body, method) => {
    const current = version;
    const result = await schoolRequest(school, path, body, method);
    if (version !== current) throw Error('School or account changed; open the school again.');
    return result;
  };
  const action = (fn) => async (event) => {
    event?.preventDefault();
    const current = version;
    const button = event?.submitter ?? event?.currentTarget;
    if (button?.tagName === 'BUTTON') button.disabled = true;
    try {
      await fn();
    } catch (error) {
      if (current === version) status(error.message);
    } finally {
      if (button?.isConnected && button.tagName === 'BUTTON') button.disabled = false;
    }
  };
  const node = (parent, tag, value) => {
    const item = document.createElement(tag);
    item.textContent = value;
    parent.append(item);
    return item;
  };
  const button = (parent, label, handler) => {
    const item = node(parent, 'button', label);
    item.onclick = action(handler);
    return item;
  };
  const options = (id, items) => {
    $(id).replaceChildren();
    for (const item of items) {
      const option = node($(id), 'option', item.name);
      option.value = item.id;
    }
  };
  const configText = (c) =>
    `${c.title} · ${c.airport} RWY ${c.runway} · ${c.aircraft.toUpperCase()} · ${c.weather}, ${c.windFrom}°T / ${c.windSpeed} kt · ${c.mode}, ${c.difficulty} · recall target ${c.requiredScore}%`;
  window.addEventListener('airport-changed', () => {
    text(
      'school-scenario-airport',
      `Airport: ${airport.icao} / ${airportPackage.revision} · reference package`,
    );
    options(
      'school-scenario-runway',
      airportPackage.circuits.map((c) => ({id: c.runway, name: c.runway})),
    );
  });
  const refresh = async () => {
    $('school-content').hidden = true;
    dashboard = await api(selectedStudent ? `?student_uid=${encodeURIComponent(selectedStudent)}` : '');
    selectedStudent = dashboard.selectedStudent;
    render();
  };
  const render = () => {
    $('school-content').hidden = false;
    $('school-student-filter-label').hidden = !dashboard.staff;
    options(
      'school-student-filter',
      dashboard.students.map((s) => ({id: s.id, name: s.name})),
    );
    $('school-student-filter').value = dashboard.selectedStudent ?? '';
    $('school-pagination').replaceChildren();
    for (const [collection, cursor] of Object.entries(dashboard.cursors)) {
      if (!cursor) continue;
      button($('school-pagination'), `Load more ${collection}`, async () => {
        const page = await api(
          `/page/${collection}?after=${encodeURIComponent(cursor)}${dashboard.selectedStudent ? '&student_uid=' + encodeURIComponent(dashboard.selectedStudent) : ''}`,
        );
        dashboard[collection] = [
          ...new Map([...dashboard[collection], ...page.items].map((item) => [item.id, item])).values(),
        ];
        dashboard.cursors[collection] = page.nextCursor;
        render();
      });
    }
    $('school-staff').hidden = !dashboard.staff;
    $('school-admin').hidden = !dashboard.admin;
    options(
      'school-member-mentor',
      dashboard.instructors.map((m) => ({id: m.id, name: `${m.name} (${m.id})`})),
    );
    options(
      'school-assignment-student',
      dashboard.students.map((m) => ({id: m.id, name: m.name})),
    );
    options(
      'school-assignment-scenario',
      dashboard.scenarios
        .filter((s) => s.state === 'published')
        .map((s) => ({id: s.id, name: s.config.title})),
    );
    $('school-roster').replaceChildren();
    for (const student of dashboard.students) {
      if (student.id !== dashboard.selectedStudent) {
        node($('school-roster'), 'p', `${student.name} · select this student to review submitted work.`);
        continue;
      }
      const summary = studentSummary(dashboard.submissions.filter((s) => s.studentUid === student.id));
      node(
        $('school-roster'),
        'p',
        `${student.name}: ${summary.attempts} submitted attempts (loaded) · first → latest recall ${summary.first ?? '—'}% → ${summary.latest ?? '—'}% · areas below 80%: ${summary.weak.map((g) => `${g.name} ${g.percent}%`).join(', ') || 'none measured'}`,
      );
    }
    $('school-scenarios').replaceChildren();
    for (const scenario of dashboard.scenarios) {
      const row = node($('school-scenarios'), 'section', '');
      node(row, 'p', `${scenario.state.toUpperCase()} · ${configText(scenario.config)}`);
      node(row, 'p', scenario.config.notes);
      if (scenario.state === 'draft')
        button(row, 'Publish reviewed scenario', async () => {
          await api(`/scenarios/${scenario.id}/publish`, {});
          await refresh();
          status('Scenario published. Its configuration is immutable; create a new draft for changes.');
        });
    }
    $('school-assignments').replaceChildren();
    for (const assignment of dashboard.assignments) {
      const row = node($('school-assignments'), 'section', '');
      node(row, 'h4', configText(assignment.config));
      node(
        row,
        'p',
        `Student: ${dashboard.students.find((s) => s.id === assignment.studentUid)?.name ?? assignment.studentUid}. ${assignment.config.notes}`,
      );
      if (!dashboard.staff) {
        button(row, 'Launch assignment', async () => {
          const currentVersion = version,
            currentLaunch = ++launchGeneration;
          const active = () => currentVersion === version && currentLaunch === launchGeneration;
          await launch(
            validateScenario(assignment.config),
            {schoolId: school, assignmentId: assignment.id},
            active,
          );
          if (!active()) return;
          text(
            'assignment-status',
            `Active assignment: ${assignment.config.title}. Changing training settings ends this assignment attempt; relaunch it to submit.`,
          );
          $('school-dialog').close();
        });
        const select = node(row, 'select', '');
        select.setAttribute('aria-label', 'Completed assignment attempt');
        for (const session of learner()
          .sessions.filter(
            (s) => s.assignment?.schoolId === school && s.assignment.assignmentId === assignment.id,
          )
          .slice(-20)
          .reverse()) {
          const option = node(
            select,
            'option',
            `${new Date(session.completedAt).toLocaleString()} · ${session.score}/${session.total}`,
          );
          option.value = session.id;
        }
        const tracks = node(row, 'select', '');
        tracks.setAttribute('aria-label', 'Optional shared recording');
        node(tracks, 'option', 'No recording shared').value = '';
        button(row, 'Choose an owned recording to share', async () => {
          const owned = await listTracks();
          if (!row.isConnected) return;
          tracks.replaceChildren();
          node(tracks, 'option', 'No recording shared').value = '';
          for (const track of owned) node(tracks, 'option', track.name).value = track.id;
          status('Selecting a recording shares that recording with authorized school staff when you submit.');
        });
        button(row, 'Submit selected attempt', async () => {
          if (!select.value) throw Error('Complete this assignment and refresh the school first.');
          await api(`/assignments/${assignment.id}/submit`, {
            sessionId: select.value,
            trackId: tracks.value || null,
          });
          await refresh();
          status('Attempt submitted for instructor review. Recall is self-reported training evidence.');
        });
      }
    }
    $('school-submissions').replaceChildren();
    for (const submission of [...dashboard.submissions].sort((a, b) =>
      b.submittedAt.localeCompare(a.submittedAt),
    )) {
      const row = node($('school-submissions'), 'section', '');
      node(
        row,
        'p',
        `${dashboard.students.find((s) => s.id === submission.studentUid)?.name ?? submission.studentUid} · recall ${submission.score}% · ${submission.thresholdMet ? 'recall target met' : 'more recall practice needed'} · ${new Date(submission.completedAt).toLocaleString()}`,
      );
      node(
        row,
        'p',
        submission.review
          ? `${submission.review.status}: ${submission.review.notes}`
          : 'Awaiting instructor review.',
      );
      if (submission.debrief)
        button(row, 'View submitted debrief', () => renderDebrief($('school-debrief'), submission.debrief));
      if (submission.track)
        button(row, `Replay shared recording: ${submission.track.name}`, async () => {
          const track = await api(`/submissions/${submission.id}/track`);
          reviewSharedRecording(track);
          $('school-dialog').close();
        });
      if (dashboard.staff) {
        const review = node(row, 'textarea', '');
        review.maxLength = 2000;
        review.setAttribute('aria-label', 'Instructor review notes');
        const choice = node(row, 'select', '');
        choice.setAttribute('aria-label', 'Instructor review outcome');
        node(choice, 'option', 'Needs practice').value = 'needs_practice';
        node(choice, 'option', 'Reviewed').value = 'reviewed';
        button(row, 'Save instructor review', async () => {
          await api(`/submissions/${submission.id}/review`, {notes: review.value, status: choice.value});
          await refresh();
          status('Instructor review saved.');
        });
      }
    }
  };
  $('school-student-filter').onchange = (event) => {
    version++;
    return action(async () => {
      selectedStudent = $('school-student-filter').value;
      await refresh();
    })(event);
  };
  $('school-load').onclick = action(async () => {
    school = $('school-id').value.trim();
    await refresh();
    status(`School loaded · ${dashboard.role}. Showing explicitly submitted work only.`);
  });
  $('school-member-form').onsubmit = action(async () => {
    await api(
      `/members/${encodeURIComponent($('school-member-uid').value.trim())}`,
      {
        name: $('school-member-name').value,
        role: $('school-member-role').value,
        instructorUid: $('school-member-role').value === 'student' ? $('school-member-mentor').value : null,
      },
      'PUT',
    );
    await refresh();
    status('School membership saved.');
  });
  $('school-member-revoke').onclick = action(async () => {
    await api(`/members/${encodeURIComponent($('school-member-uid').value.trim())}`, undefined, 'DELETE');
    await refresh();
    status('School membership revoked.');
  });
  $('school-scenario-form').onsubmit = action(async () => {
    const versionAtStart = version;
    const file = $('school-scenario-performance').files[0];
    let performance = null;
    if ($('school-scenario-aircraft').value !== 'demo') {
      if (!file || file.size > 10000) throw Error('Attach a reviewed aircraft JSON file under 10 KB.');
      performance = validatePerformance(JSON.parse(await file.text()));
      if (versionAtStart !== version) throw Error('School or account changed.');
    }
    const config = validateScenario({
      title: $('school-scenario-title').value,
      airport: airport.icao,
      packageRevision: airportPackage.revision,
      runway: $('school-scenario-runway').value,
      aircraft: $('school-scenario-aircraft').value,
      performance,
      weather: $('school-scenario-weather').value,
      windFrom: Number($('school-scenario-wind-from').value),
      windSpeed: Number($('school-scenario-wind-speed').value),
      mode: $('school-scenario-mode').value,
      difficulty: $('school-scenario-difficulty').value,
      requiredScore: Number($('school-scenario-score').value),
      notes: $('school-scenario-notes').value,
    });
    await api('/scenarios', config);
    await refresh();
    status('Draft saved. Review its displayed settings before publishing.');
  });
  $('school-assignment-form').onsubmit = action(async () => {
    await api('/assignments', {
      scenarioId: $('school-assignment-scenario').value,
      studentUid: $('school-assignment-student').value,
    });
    await refresh();
    status('Published scenario assigned.');
  });
}
