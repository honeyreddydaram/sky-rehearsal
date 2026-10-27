import {cloud} from '../cloud/firebase.ts';
import {learner} from './progress.js';
import {$, download} from '../ui/ui.js';
export function wireTelemetry() {
  window.addEventListener('account-changed', () => {
    $('share-usage').checked = false;
  });
  window.addEventListener('training-completed', async (event) => {
    const user = cloud?.auth.currentUser;
    if (!user || !$('share-usage').checked) return;
    const controller = new AbortController(),
      timer = setTimeout(() => controller.abort(), 10000);
    try {
      const token = await user.getIdToken();
      if (cloud.auth.currentUser?.uid !== user.uid || !$('share-usage').checked) return;
      await fetch('/api/telemetry', {
        method: 'POST',
        headers: {Authorization: `Bearer ${token}`, 'Content-Type': 'application/json'},
        body: JSON.stringify(event.detail),
        signal: controller.signal,
      });
    } catch {
      /* Usage telemetry never blocks practice or changes scores. */
    } finally {
      clearTimeout(timer);
    }
  });
  $('export-beta-metrics').onclick = () => {
    const groups = new Map();
    for (const session of learner().sessions) {
      const key = `${session.airportId ?? 'VOHY'}:${session.mode}`;
      const group = groups.get(key) ?? {
        airport: session.airportId ?? 'VOHY',
        mode: session.mode,
        sessions: 0,
        recallScores: [],
      };
      group.sessions++;
      if (session.total && Number.isFinite(session.score))
        group.recallScores.push(Math.round((session.score / session.total) * 100));
      groups.set(key, group);
    }
    download('sky-rehearsal-beta-metrics.json', {
      version: 1,
      exportedAt: new Date().toISOString(),
      groups: [...groups.values()],
      note: 'Self-study measurements; no participant identities or certified proficiency claims.',
    });
  };
}
