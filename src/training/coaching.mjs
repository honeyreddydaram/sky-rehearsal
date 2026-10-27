// Pure teaching context. This module never changes flight state or scores.
export function learningFocus(sessions, route, airportId = 'VOHY') {
  const recent = sessions
    .filter((s) => s.route === route && (s.airportId ?? 'VOHY') === airportId)
    .slice(-20);
  const groups = new Map();
  for (const session of recent)
    for (const [key, group] of Object.entries(session.debrief?.recall?.groups ?? {})) {
      if (
        !['landmark', 'sequence', 'heading', 'decision', 'wind', 'recall'].includes(key) ||
        !Number.isInteger(group?.total) ||
        !Number.isInteger(group?.correct) ||
        group.total < 1 ||
        group.correct < 0 ||
        group.correct > group.total
      )
        continue;
      const sum = groups.get(key) ?? {correct: 0, total: 0};
      sum.correct += group.correct;
      sum.total += group.total;
      groups.set(key, sum);
    }
  const weakest = [...groups]
    .filter(([, g]) => g.total > 0)
    .sort((a, b) => a[1].correct / a[1].total - b[1].correct / b[1].total)[0];
  return {focus: weakest?.[0] ?? 'recall', attempts: Math.min(300, recent.length)};
}

export function coachingHint({phase, waypoint, level, focus, attempts}) {
  const landmark = waypoint?.landmarks?.[0];
  const question = {
    landmark: 'Which reference landmark belongs to the next checkpoint?',
    sequence: 'Which leg follows this phase in the circuit sequence?',
    heading: 'Recall the next leg’s true track. How does wind affect the heading?',
    decision: 'What action follows the next checkpoint in the reference notes?',
    wind: 'How would you distinguish heading from ground track in this wind scenario?',
    recall: 'What comes next? Recall the checkpoint before opening the reference notes.',
  }[focus];
  const message =
    level === 0
      ? question
      : level === 1
        ? `You are studying ${phase}. Relate this phase to the next checkpoint in the circuit sequence.`
        : level === 2
          ? landmark?.side
            ? `The next checkpoint’s reference landmark is described on the ${landmark.side.toLowerCase()}. Its location may be unconfirmed.`
            : 'Compare the current leg with the next leg in your instructor-reviewed circuit notes.'
          : `${waypoint?.name ?? 'Checkpoint'}: ${waypoint?.cue ?? 'No checkpoint note is available.'}`;
  return {
    message,
    context: {
      kind: 'hint',
      phase,
      focus,
      attempts,
      level,
      facts: [
        'Ground rehearsal; automatic simulated flight, unverified circuit reference.',
        `Teaching hint: ${message}`.slice(0, 500),
        ...(level === 3 && landmark ? [`Unverified reference landmark: ${landmark.name}`.slice(0, 500)] : []),
      ],
    },
  };
}

export function debriefContext(report) {
  const facts = [
    `Source: ${report.source}. Reference verification: ${report.verified ? 'verified' : 'unverified'}.`,
    report.overall === null
      ? `Overall unavailable: ${report.overallReason}`
      : `Deterministic overall: ${report.overall}%.`,
    report.warnings.slice(0, 2).join(' ').slice(0, 500),
    `Teaching tolerances: ${JSON.stringify(report.criteria)}.`,
  ];
  for (const [key, metric] of Object.entries(report.metrics))
    facts.push(
      metric.score === null
        ? `${key}: unavailable; ${metric.reason}`
        : `${key}: mean ${metric.mean.toFixed(1)} ${metric.unit}; maximum ${metric.max.toFixed(1)}; deterministic comparison score ${metric.score}%.`,
    );
  facts.push(
    `Knowledge recall: ${report.recall.percent === null ? 'unavailable' : report.recall.percent + '%'}. Groups: ${JSON.stringify(report.recall.groups)}`,
  );
  if (report.events?.length)
    facts.push(`Study exercise: ${report.events[0].phase}: ${report.events[0].advice}`);
  const weakest = Object.entries(report.recall.groups ?? {}).sort((a, b) => a[1].percent - b[1].percent)[0];
  return {
    kind: 'debrief',
    phase: 'Completed session',
    focus: weakest?.[0] ?? 'recall',
    attempts: null,
    level: 3,
    facts: facts.slice(0, 12).map((f) => f.slice(0, 500)),
  };
}
