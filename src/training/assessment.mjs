import {distance} from '../flight/core.mjs';

// Teaching tolerances, not POH limits or certification standards. Persist the
// version and thresholds with every report so results can be interpreted later.
export const CRITERIA = Object.freeze({
  version: 1,
  trackM: 185.2,
  headingDeg: 15,
  altitudeFt: 150,
  airspeedKt: 10,
  turnSeconds: 15,
  maxGapSeconds: 30,
});
const angle = (a, b) => Math.abs(((a - b + 540) % 360) - 180);
const mixAngle = (a, b, t) => (a + (((b - a + 540) % 360) - 180) * t + 360) % 360;
const finite = Number.isFinite;
const score = (mean, tolerance) => Math.round(Math.max(0, 1 - mean / (2 * tolerance)) * 100);
const advice = {
  track:
    'Compare the ideal and actual path. Rehearse the turn points and review the wind correction setting.',
  heading: 'Review the true heading and, when known, the wind correction needed to hold the intended track.',
  altitude: 'Review the sourced altitude profile and altitude datum before practising the climb or descent.',
  airspeed:
    'Review the aircraft-specific, instructor-approved speed schedule. Ground speed is not true airspeed.',
  turns: 'Review this phase transition against a correctly aligned, instructor-reviewed reference.',
};
function validate(points) {
  if (!Array.isArray(points) || points.length < 2 || points.length > 50000)
    throw new Error('Assessment needs 2–50,000 samples.');
  points.forEach((p, i) => {
    if (
      !finite(p.timestamp) ||
      Math.abs(p.timestamp) > 8.64e15 ||
      !Array.isArray(p.position) ||
      p.position.length !== 2 ||
      !p.position.every(finite) ||
      Math.abs(p.position[0]) > 180 ||
      Math.abs(p.position[1]) > 85 ||
      !finite(p.height) ||
      (i && p.timestamp <= points[i - 1].timestamp)
    )
      throw new Error(
        'Assessment samples need valid coordinates, ellipsoid heights and strictly increasing times.',
      );
  });
}
function interpolate(a, b, t) {
  const mix = (key) => (finite(a[key]) && finite(b[key]) ? a[key] + (b[key] - a[key]) * t : null);
  return {
    position: a.position.map((v, k) => v + (b.position[k] - v) * t),
    height: mix('height'),
    tasKt: mix('tasKt'),
    heading: mixAngle(a.heading, b.heading, t),
    course: mixAngle(a.course, b.course, t),
    phase: t === 1 ? b.phase : a.phase,
    progress: mix('progress'),
  };
}
function match(sample, reference) {
  // Known simulation progress is independent of geometric drift. Recorded tracks
  // use nearest-segment matching; tagged phases disambiguate the shared runway.
  let best = null;
  const scale = Math.cos((sample.position[1] * Math.PI) / 180);
  for (let i = 1; i < reference.length; i++) {
    const a = reference[i - 1],
      b = reference[i];
    let t;
    if (finite(sample.progress)) {
      if (sample.progress < a.progress || sample.progress > b.progress) continue;
      t = (sample.progress - a.progress) / (b.progress - a.progress || 1);
    } else {
      if (sample.phase && sample.phase !== a.phase && sample.phase !== b.phase) continue;
      const dx = (b.position[0] - a.position[0]) * scale,
        dy = b.position[1] - a.position[1];
      t = Math.max(
        0,
        Math.min(
          1,
          ((sample.position[0] - a.position[0]) * scale * dx + (sample.position[1] - a.position[1]) * dy) /
            (dx * dx + dy * dy || 1),
        ),
      );
    }
    const lon = a.position[0] + (b.position[0] - a.position[0]) * t;
    const lat = a.position[1] + (b.position[1] - a.position[1]) * t;
    const squared = ((sample.position[0] - lon) * scale) ** 2 + (sample.position[1] - lat) ** 2;
    if (!best || squared < best.squared) best = {index: i, t, squared};
  }
  if (!best) return null;
  const expected = interpolate(reference[best.index - 1], reference[best.index], best.t);
  return {expected, error: distance(sample.position, expected.position)};
}

function metric(errors, weights, tolerance, unit, unavailable) {
  let duration = 0,
    sum = 0,
    within = 0,
    max = 0,
    count = 0;
  errors.forEach((error, i) => {
    if (!finite(error) || !weights[i]) return;
    duration += weights[i];
    sum += error * weights[i];
    max = Math.max(max, error);
    count++;
    if (error <= tolerance) within += weights[i];
  });
  return duration
    ? {
        mean: sum / duration,
        max,
        score: score(sum / duration, tolerance),
        withinPercent: (100 * within) / duration,
        count,
        unit,
        tolerance,
        coverage: duration / weights.reduce((n, w) => n + w, 0),
        reason: null,
      }
    : {
        mean: null,
        max: null,
        score: null,
        withinPercent: null,
        count: 0,
        unit,
        tolerance,
        coverage: 0,
        reason: unavailable,
      };
}
export function recallBreakdown(answers = []) {
  if (!Array.isArray(answers) || answers.length > 5) throw new Error('Use at most five recall answers.');
  const groups = {};
  for (const answer of answers) {
    if (!answer || typeof answer.passed !== 'boolean') continue;
    const proposed = answer.skill || answer.type;
    const key = ['landmark', 'sequence', 'heading', 'decision', 'wind', 'recall'].includes(proposed)
      ? proposed
      : 'recall';
    const group = (groups[key] ??= {correct: 0, total: 0, percent: 0});
    group.total++;
    group.correct += Number(answer.passed);
    group.percent = Math.round((group.correct / group.total) * 100);
  }
  const total = Object.values(groups).reduce((n, g) => n + g.total, 0);
  return {
    total,
    percent: total
      ? Math.round((Object.values(groups).reduce((n, g) => n + g.correct, 0) / total) * 100)
      : null,
    groups,
  };
}

export function assessFlight({
  samples,
  reference,
  answers = [],
  source = 'recording',
  referenceName = 'Reference route',
  verified = false,
  windKnown = false,
  criteria = CRITERIA,
}) {
  if (
    !['simulation', 'recording'].includes(source) ||
    typeof verified !== 'boolean' ||
    criteria.version !== 1
  )
    throw new Error('Unsupported assessment context.');
  validate(samples);
  validate(reference);
  for (const key of Object.keys(CRITERIA).filter((k) => k !== 'version'))
    if (!finite(criteria[key]) || criteria[key] <= 0)
      throw new Error('Assessment tolerances must be positive.');
  if (
    !reference.every(
      (p, i) =>
        finite(p.progress) &&
        p.progress >= 0 &&
        p.progress <= 1 &&
        (!i || p.progress > reference[i - 1].progress) &&
        finite(p.heading) &&
        finite(p.course),
    )
  )
    throw new Error('Reference needs progress, heading and track.');
  const warnings = [];
  if (!verified)
    warnings.push(
      'Reference geometry/profile is illustrative or unverified. Differences are exploratory, not flight proficiency grades.',
    );
  if (source === 'simulation')
    warnings.push(
      'This trajectory is generated by the rehearsal engine, not independently measured pilot control.',
    );
  const weights = samples.map(() => 0);
  let observedSeconds = 0,
    gapSeconds = 0;
  for (let i = 1; i < samples.length; i++) {
    const dt = (samples[i].timestamp - samples[i - 1].timestamp) / 1000;
    if (dt > criteria.maxGapSeconds) {
      gapSeconds += dt;
      continue;
    }
    weights[i - 1] += dt / 2;
    weights[i] += dt / 2;
    observedSeconds += dt;
  }
  if (source === 'recording' && samples.some((p) => !p.phase))
    warnings.push(
      'Leg names are nearest-reference associations, not independently identified flight phases.',
    );
  if (gapSeconds)
    warnings.push(
      `${gapSeconds.toFixed(1)} seconds of recording gaps were excluded; no invented measurements fill them.`,
    );
  const matched = samples.map((sample) => match(sample, reference));
  const errors = {track: [], heading: [], altitude: [], airspeed: [], trackDirection: []};
  const events = new Map();
  const recordEvent = (event) => {
    const key = `${event.phase}:${event.kind}`;
    if (!events.has(key) || events.get(key).severity < event.severity) events.set(key, event);
  };
  const tolerance = {
    track: criteria.trackM,
    heading: criteria.headingDeg,
    altitude: criteria.altitudeFt,
    airspeed: criteria.airspeedKt,
  };
  matched.forEach((m, i) => {
    const actual = samples[i],
      expected = m?.expected;
    const headingMeasured = finite(actual.heading) && actual.headingDerived !== true;
    errors.track.push(m?.error ?? null);
    errors.heading.push(
      expected && headingMeasured && (source === 'simulation' || windKnown)
        ? angle(actual.heading, expected.heading)
        : null,
    );
    errors.altitude.push(expected ? Math.abs(actual.height - expected.height) / 0.3048 : null);
    errors.airspeed.push(
      expected && finite(actual.tasKt) && finite(expected.tasKt)
        ? Math.abs(actual.tasKt - expected.tasKt)
        : null,
    );
    errors.trackDirection.push(
      expected && actual.headingDerived === true ? angle(actual.heading, expected.course) : null,
    );
    for (const key of ['track', 'heading', 'altitude', 'airspeed']) {
      const value = errors[key][i];
      if (!finite(value) || value <= tolerance[key] || !weights[i]) continue;
      recordEvent({
        kind: key,
        phase: expected.phase || 'route',
        atSeconds: (actual.timestamp - samples[0].timestamp) / 1000,
        progress: expected.progress,
        position: actual.position,
        referencePosition: expected.position,
        height: actual.height,
        referenceHeight: expected.height,
        actualValue:
          key === 'track'
            ? actual.position
            : key === 'heading'
              ? actual.heading
              : key === 'altitude'
                ? actual.height / 0.3048
                : actual.tasKt,
        expectedValue:
          key === 'track'
            ? expected.position
            : key === 'heading'
              ? expected.heading
              : key === 'altitude'
                ? expected.height / 0.3048
                : expected.tasKt,
        value,
        tolerance: tolerance[key],
        severity: value / tolerance[key],
        advice: advice[key],
      });
    }
  });
  const metrics = {
    track: metric(errors.track, weights, criteria.trackM, 'm', 'No comparable track samples.'),
    heading: metric(
      errors.heading,
      weights,
      criteria.headingDeg,
      '°',
      'True heading and a known wind scenario are required. Derived GPS track is not nose heading.',
    ),
    altitude: metric(
      errors.altitude,
      weights,
      criteria.altitudeFt,
      'ft',
      'A common altitude datum is required.',
    ),
    airspeed: metric(
      errors.airspeed,
      weights,
      criteria.airspeedKt,
      'kt',
      'No measured true airspeed. Recorded ground speed is not compared with target TAS.',
    ),
    trackDirection: metric(
      errors.trackDirection,
      weights,
      criteria.headingDeg,
      '°',
      'No derived ground-track direction samples.',
    ),
  };
  const phaseEvents = (points) =>
    points
      .slice(1)
      .flatMap((p, i) =>
        p.phase &&
        points[i].phase &&
        p.phase !== points[i].phase &&
        (p.timestamp - points[i].timestamp) / 1000 <= criteria.maxGapSeconds
          ? [{phase: p.phase, time: (p.timestamp - points[0].timestamp) / 1000}]
          : [],
      );
  const expectedTurns = phaseEvents(reference),
    actualTurns = phaseEvents(samples);
  const aligned = samples[0].phase === 'takeoff' && reference[0].phase === 'takeoff';
  const turnErrors = [];
  for (const turn of expectedTurns) {
    const actual = actualTurns.find((event) => event.phase === turn.phase);
    if (actual && aligned) {
      const value = Math.abs(actual.time - turn.time);
      turnErrors.push(value);
      if (value > criteria.turnSeconds)
        recordEvent({
          kind: 'turns',
          phase: turn.phase,
          atSeconds: actual.time,
          actualValue: actual.time,
          expectedValue: turn.time,
          progress: reference.find((p) => p.phase === turn.phase)?.progress ?? 0,
          value,
          tolerance: criteria.turnSeconds,
          severity: value / criteria.turnSeconds,
          advice: advice.turns,
        });
    }
  }
  metrics.turns =
    turnErrors.length && turnErrors.length === expectedTurns.length
      ? metric(
          turnErrors,
          turnErrors.map(() => 1),
          criteria.turnSeconds,
          's',
          '',
        )
      : metric(
          [],
          [],
          criteria.turnSeconds,
          's',
          'Explicit phase tags and a takeoff-aligned comparison window are required for all phase/turn timings.',
        );
  const progress = matched.filter(Boolean).map((m) => m.expected.progress);
  const coverage = progress.length ? Math.max(...progress) - Math.min(...progress) : 0;
  const comparable =
    Object.keys(tolerance).every((key) => metrics[key].score !== null && metrics[key].coverage >= 0.95) &&
    metrics.turns.score !== null;
  const complete =
    coverage >= 0.9 &&
    samples[0].phase === 'takeoff' &&
    samples.at(-1).phase === 'landing' &&
    gapSeconds === 0;
  const overall =
    verified && comparable && complete && source !== 'simulation'
      ? Math.round(
          ['track', 'heading', 'altitude', 'airspeed', 'turns'].reduce(
            (sum, key) => sum + metrics[key].score,
            0,
          ) / 5,
        )
      : null;
  const reason =
    overall !== null
      ? null
      : !verified
        ? 'Reference has not been verified.'
        : source === 'simulation'
          ? 'Automatic rehearsal is not an independent flight assessment.'
          : !complete
            ? 'Incomplete or unaligned flight coverage.'
            : 'Required measurements are unavailable.';
  // Keep the worst difference per phase/metric; avoid hundreds of repeated alerts.
  return {
    version: 1,
    source,
    referenceName,
    verified,
    criteria: {...criteria},
    sampleCount: samples.length,
    observedSeconds,
    gapSeconds,
    coverage,
    overall,
    overallReason: reason,
    metrics,
    recall: recallBreakdown(answers),
    events: [...events.values()].sort((a, b) => b.severity - a.severity).slice(0, 20),
    warnings,
  };
}
