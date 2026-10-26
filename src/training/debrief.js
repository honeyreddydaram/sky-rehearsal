import {debriefContext} from './coaching.mjs';
import {addGeminiExplanation} from './instructor-service.js';
import {validDebrief} from './debrief-schema.mjs';
import {showDeviation} from '../map/map.js';
import {download} from '../ui/ui.js';
const labels = {
  track: 'Track deviation',
  heading: 'True-heading error',
  altitude: 'Altitude error',
  airspeed: 'True-airspeed error',
  turns: 'Turn / phase timing',
  trackDirection: 'Ground-track direction error',
};
export function renderDebrief(container, report, replayAt = null) {
  container.replaceChildren();
  if (!validDebrief(report)) {
    container.textContent = 'Saved debrief is not a supported report.';
    return;
  }
  const add = (tag, text) => {
    const node = document.createElement(tag);
    node.textContent = text;
    container.append(node);
    return node;
  };
  add('h3', 'Flight debrief');
  add(
    'p',
    report.overall === null
      ? `Overall flight score unavailable: ${report.overallReason}`
      : `Overall flight score: ${report.overall}%`,
  );
  if (report.recall.percent !== null)
    add(
      'p',
      `Recall score: ${report.recall.percent}% (${report.recall.total} answers). Knowledge recall is separate from flight metrics.`,
    );
  for (const [key, group] of Object.entries(report.recall.groups))
    add(
      'p',
      `${{landmark: 'Landmark recognition', sequence: 'Circuit sequence', heading: 'Heading recall', decision: 'Procedure decisions', wind: 'Wind correction recall', recall: 'Quiz recall'}[key] ?? key}: ${group.percent}% (${group.correct}/${group.total})`,
    );
  add(
    'p',
    `Reference: ${report.referenceName}. Criteria v${report.criteria.version}. ${report.sampleCount} samples; ${report.observedSeconds.toFixed(1)} seconds observed; ${report.gapSeconds.toFixed(1)} seconds of gaps excluded.`,
  );
  for (const warning of report.warnings) add('p', warning).className = 'micro';
  const table = add('table', '');
  const header = table.insertRow();
  for (const title of ['Comparison', 'Mean / maximum', 'Comparison score']) {
    const cell = document.createElement('th');
    cell.textContent = title;
    header.append(cell);
  }
  for (const [key, m] of Object.entries(report.metrics)) {
    const row = table.insertRow();
    row.insertCell().textContent = labels[key];
    row.insertCell().textContent =
      m.score === null
        ? m.reason
        : `${m.mean.toFixed(1)} / ${m.max.toFixed(1)} ${m.unit} (tolerance ${m.tolerance} ${m.unit})`;
    row.insertCell().textContent =
      m.score === null ? 'Unavailable' : `${m.score}% · ${m.withinPercent.toFixed(0)}% within tolerance`;
  }
  add(
    'p',
    'Altitude differences use common ellipsoid heights after conversion. Scores use teaching tolerances, not aircraft operating limits. Unavailable measurements do not become zeros. Simulated altitude and speed follow the profile automatically.',
  ).className = 'micro';
  addGeminiExplanation(container, debriefContext(report));
  add('h4', 'Replay comparison differences');
  if (!report.events.length)
    add(
      'p',
      'No above-tolerance differences in the available measurements. Missing measurements and an unverified reference still prevent a proficiency claim.',
    );
  for (const event of report.events) {
    const row = add('div', '');
    row.className = 'review-row';
    const detail = document.createElement('p');
    detail.textContent = `${event.phase} · ${labels[event.kind]}: ${event.value.toFixed(1)} ${report.metrics[event.kind].unit} at ${event.atSeconds.toFixed(1)} s. ${event.advice}`;
    row.append(detail);
    if (event.actualValue !== undefined && event.expectedValue !== undefined) {
      const format = (value) =>
        Array.isArray(value) ? value.map((v) => Number(v).toFixed(5)).join(', ') : Number(value).toFixed(1);
      const values = document.createElement('p');
      values.textContent = `What happened: actual ${format(event.actualValue)}; reference ${format(event.expectedValue)}. Difference ${event.value.toFixed(1)} ${report.metrics[event.kind].unit}.`;
      row.append(values);
    }
    const button = document.createElement('button');
    button.textContent = `Replay ${event.phase} at ${event.atSeconds.toFixed(1)} s`;
    button.disabled = !replayAt;
    button.onclick = () => {
      showDeviation(event.position, event.referencePosition, event.height, event.referenceHeight);
      replayAt(event);
    };
    row.append(button);
  }
  if (!replayAt && report.events.length)
    add(
      'p',
      'Replay is available for the current recording or rehearsal trace only. This saved report retains the original metrics and criteria.',
    ).className = 'micro';
  const exportButton = add('button', 'Export debrief JSON');
  exportButton.onclick = () => download('sky-rehearsal-debrief.json', report);
}
