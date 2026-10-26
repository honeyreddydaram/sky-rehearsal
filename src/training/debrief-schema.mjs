const number = (value, min = 0, max = Number.MAX_SAFE_INTEGER) =>
  Number.isFinite(value) && value >= min && value <= max;
const text = (value, max) => typeof value === 'string' && value.length <= max;
const score = (value) => value === null || number(value, 0, 100);
const position = (p) =>
  Array.isArray(p) && p.length === 2 && number(p[0], -180, 180) && number(p[1], -90, 90);
export function validDebrief(d) {
  if (
    !d ||
    d.version !== 1 ||
    !['simulation', 'recording'].includes(d.source) ||
    typeof d.verified !== 'boolean' ||
    !text(d.referenceName, 300) ||
    !score(d.overall) ||
    ((!d.verified || d.source === 'simulation') && d.overall !== null)
  )
    return false;
  if (
    !number(d.sampleCount, 2, 50000) ||
    !number(d.observedSeconds) ||
    !number(d.gapSeconds) ||
    !number(d.coverage, 0, 1.000001) ||
    !(d.overallReason === null || text(d.overallReason, 300))
  )
    return false;
  if (
    !d.criteria ||
    d.criteria.version !== 1 ||
    !['trackM', 'headingDeg', 'altitudeFt', 'airspeedKt', 'turnSeconds', 'maxGapSeconds'].every((key) =>
      number(d.criteria[key], Number.EPSILON),
    )
  )
    return false;
  if (!Array.isArray(d.warnings) || d.warnings.length > 10 || !d.warnings.every((w) => text(w, 500)))
    return false;
  if (
    !d.metrics ||
    !['track', 'heading', 'altitude', 'airspeed', 'turns', 'trackDirection'].every((key) => {
      const m = d.metrics[key];
      return (
        m &&
        score(m.score) &&
        (m.score === null
          ? m.mean === null &&
            m.max === null &&
            m.withinPercent === null &&
            m.count === 0 &&
            m.coverage === 0 &&
            text(m.reason, 300)
          : number(m.mean) &&
            number(m.max) &&
            number(m.withinPercent, 0, 100.000001) &&
            m.count >= 1 &&
            m.coverage > 0 &&
            m.reason === null) &&
        (m.mean === null || number(m.mean)) &&
        (m.max === null || number(m.max)) &&
        (m.withinPercent === null || number(m.withinPercent, 0, 100.000001)) &&
        number(m.count, 0, 50000) &&
        number(m.coverage, 0, 1.000001) &&
        number(m.tolerance, Number.EPSILON) &&
        text(m.unit, 10) &&
        (m.reason === null || text(m.reason, 300))
      );
    })
  )
    return false;
  if (
    !d.recall ||
    !number(d.recall.total, 0, 5) ||
    !score(d.recall.percent) ||
    !d.recall.groups ||
    Object.keys(d.recall.groups).length > 6 ||
    !Object.values(d.recall.groups).every(
      (g) => number(g.correct, 0, 5) && number(g.total, 1, 5) && g.correct <= g.total && score(g.percent),
    )
  )
    return false;
  const groups = Object.values(d.recall.groups);
  if (
    !Number.isInteger(d.recall.total) ||
    !Object.keys(d.recall.groups).every((key) =>
      ['landmark', 'sequence', 'heading', 'decision', 'wind', 'recall'].includes(key),
    ) ||
    groups.some(
      (g) =>
        !Number.isInteger(g.total) ||
        !Number.isInteger(g.correct) ||
        g.percent !== Math.round((g.correct / g.total) * 100),
    ) ||
    groups.reduce((n, g) => n + g.total, 0) !== d.recall.total
  )
    return false;
  if (
    d.recall.percent !==
    (d.recall.total ? Math.round((groups.reduce((n, g) => n + g.correct, 0) / d.recall.total) * 100) : null)
  )
    return false;
  if (
    !Array.isArray(d.events) ||
    d.events.length > 20 ||
    !d.events.every(
      (e) =>
        ['track', 'heading', 'altitude', 'airspeed', 'turns'].includes(e.kind) &&
        text(e.phase, 80) &&
        number(e.atSeconds) &&
        number(e.progress, 0, 1.000001) &&
        number(e.value) &&
        number(e.tolerance, Number.EPSILON) &&
        number(e.severity, 1) &&
        text(e.advice, 500) &&
        (e.position === undefined || position(e.position)) &&
        (e.referencePosition === undefined || position(e.referencePosition)),
    )
  )
    return false;
  return true;
}
