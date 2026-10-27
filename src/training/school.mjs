import {AIRCRAFT, WEATHER, validatePerformance} from '../aviation/conditions.mjs';
import {validDebrief} from './debrief-schema.mjs';
export function validateScenario(config) {
  if (
    !config ||
    !/^[A-Z]{4}$/.test(config.airport) ||
    !/^(0[1-9]|[12][0-9]|3[0-6])[LRC]?$/.test(config.runway) ||
    !['demo', ...AIRCRAFT].includes(config.aircraft) ||
    !Object.hasOwn(WEATHER, config.weather) ||
    !['landmarks', 'decisions', 'quiz', 'exam'].includes(config.mode) ||
    !['beginner', 'intermediate', 'advanced', 'examiner'].includes(config.difficulty) ||
    !Number.isInteger(config.windFrom) ||
    config.windFrom < 0 ||
    config.windFrom > 360 ||
    !Number.isInteger(config.windSpeed) ||
    config.windSpeed < 0 ||
    config.windSpeed > 35 ||
    !Number.isInteger(config.requiredScore) ||
    config.requiredScore < 0 ||
    config.requiredScore > 100
  )
    throw Error('Scenario contains unsupported training settings.');
  if (config.aircraft === 'demo') {
    if (config.performance !== null) throw Error('Demo scenarios cannot claim type performance.');
  } else if (validatePerformance(config.performance).typeCode !== config.aircraft)
    throw Error('Reviewed performance does not match the selected aircraft.');
  return config;
}
export function studentSummary(submissions) {
  const attempts = submissions
    .filter((s) => Number.isFinite(s.score) && s.score >= 0 && s.score <= 100)
    .sort((a, b) => Date.parse(a.completedAt) - Date.parse(b.completedAt));
  const groups = new Map();
  for (const attempt of attempts) {
    if (!validDebrief(attempt.debrief)) continue;
    for (const [name, value] of Object.entries(attempt.debrief.recall.groups)) {
      const group = groups.get(name) ?? {correct: 0, total: 0};
      group.correct += value.correct;
      group.total += value.total;
      groups.set(name, group);
    }
  }
  return {
    attempts: attempts.length,
    first: attempts[0]?.score ?? null,
    latest: attempts.at(-1)?.score ?? null,
    weak: [...groups]
      .map(([name, group]) => ({name, percent: Math.round((group.correct / group.total) * 100)}))
      .filter((g) => g.percent < 80)
      .sort((a, b) => a.percent - b.percent),
  };
}
