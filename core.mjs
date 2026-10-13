export const clamp = (x, a, b) => Math.max(a, Math.min(b, x));
export const rad = (x) => (x * Math.PI) / 180,
  deg = (x) => (x * 180) / Math.PI;
export const wrap = (x) => ((x % 360) + 360) % 360;
export const headingText = (x) => `${Math.round(wrap(x)) % 360}`.padStart(3, '0') + '°T';
export function distance(a, b) {
  const p = rad(b[1] - a[1]),
    q = rad(b[0] - a[0]),
    v = Math.sin(p / 2) ** 2 + Math.cos(rad(a[1])) * Math.cos(rad(b[1])) * Math.sin(q / 2) ** 2;
  return 6371000 * 2 * Math.atan2(Math.sqrt(v), Math.sqrt(1 - v));
}
export function bearing(a, b) {
  const lon = rad(b[0] - a[0]),
    lat1 = rad(a[1]),
    lat2 = rad(b[1]);
  const y = Math.sin(lon) * Math.cos(lat2),
    x = Math.cos(lat1) * Math.sin(lat2) - Math.sin(lat1) * Math.cos(lat2) * Math.cos(lon);
  return wrap(deg(Math.atan2(y, x)));
}
export function routeModel(raw) {
  const points = [];
  for (let i = 0; i < raw.length - 1; i++) {
    const a = raw[Math.max(0, i - 1)],
      b = raw[i],
      c = raw[i + 1],
      d = raw[Math.min(raw.length - 1, i + 2)];
    for (let j = 0; j < 12; j++) {
      const t = j / 12;
      points.push(
        [0, 1].map(
          (k) =>
            0.5 *
            (2 * b[k] +
              (-a[k] + c[k]) * t +
              (2 * a[k] - 5 * b[k] + 4 * c[k] - d[k]) * t * t +
              (-a[k] + 3 * b[k] - 3 * c[k] + d[k]) * t * t * t),
        ),
      );
    }
  }
  points.push(raw.at(-1));
  const lengths = [0];
  points.slice(1).forEach((p, i) => lengths.push(lengths.at(-1) + distance(points[i], p)));
  return {points, lengths, total: lengths.at(-1)};
}
export function at(model, t) {
  const d = clamp(t, 0, 1) * model.total;
  let i = 1;
  while (i < model.lengths.length - 1 && model.lengths[i] < d) i++;
  const f = (d - model.lengths[i - 1]) / (model.lengths[i] - model.lengths[i - 1] || 1),
    a = model.points[i - 1],
    b = model.points[i];
  return [a[0] + (b[0] - a[0]) * f, a[1] + (b[1] - a[1]) * f];
}
export function profileAt(frames, t) {
  let i = 1;
  while (i < frames.length - 1 && frames[i].progress < t) i++;
  const a = frames[i - 1],
    b = frames[i],
    f = clamp((t - a.progress) / (b.progress - a.progress), 0, 1);
  return {
    altitudeFt: a.altitudeFt + (b.altitudeFt - a.altitudeFt) * f,
    tasKt: a.tasKt + (b.tasKt - a.tasKt) * f,
  };
}
export function windTriangle(course, tas, from, speed, compensate) {
  const r = rad(course),
    to = rad(wrap(from + 180)),
    east = speed * Math.sin(to),
    north = speed * Math.cos(to),
    along = east * Math.sin(r) + north * Math.cos(r),
    cross = east * Math.cos(r) - north * Math.sin(r);
  if (compensate && (Math.abs(cross) >= tas || Math.sqrt(tas * tas - cross * cross) + along <= 0))
    return {possible: false};
  const correction = compensate ? Math.asin(-cross / tas) : 0,
    h = r + correction,
    ve = tas * Math.sin(h) + east,
    vn = tas * Math.cos(h) + north;
  return {
    possible: true,
    heading: wrap(deg(h)),
    track: wrap(deg(Math.atan2(ve, vn))),
    groundspeed: Math.hypot(ve, vn),
    alongSpeed: compensate ? Math.sqrt(tas * tas - cross * cross) + along : tas,
    crosswind: cross,
    east,
    north,
    correction: deg(correction),
  };
}
export function elapsedAt(model, frames, t) {
  let seconds = 0;
  const n = 160,
    step = t / n;
  for (let i = 0; i < n; i++)
    seconds += (model.total * step) / (profileAt(frames, (i + 0.5) * step).tasKt * 0.514444);
  return seconds;
}
export function driftPoint(point, seconds, from, speed) {
  const r = rad(wrap(from + 180)),
    meters = speed * 0.514444 * seconds;
  return [
    point[0] + (meters * Math.sin(r)) / (111320 * Math.cos(rad(point[1]))),
    point[1] + (meters * Math.cos(r)) / 111320,
  ];
}
export function validateProfile(d) {
  const fail = (m) => {
    throw Error(m);
  };
  if (!d || d.schemaVersion !== 1 || !['inner', 'outer'].includes(d.route))
    fail('Use schemaVersion 1 and route inner or outer.');
  if (
    typeof d.name !== 'string' ||
    !d.name.trim() ||
    d.name.length > 100 ||
    typeof d.source !== 'string' ||
    !d.source.trim() ||
    d.source.length > 300
  )
    fail('Include a profile name and source.');
  if (!['MSL', 'ELLIPSOID'].includes(d.altitudeReference))
    fail('altitudeReference must be MSL or ELLIPSOID.');
  if (d.altitudeReference === 'MSL' && (!Number.isFinite(d.geoidOffsetM) || Math.abs(d.geoidOffsetM) > 150))
    fail('MSL requires geoidOffsetM: ellipsoid height minus MSL height, in metres.');
  if (!Array.isArray(d.frames) || d.frames.length < 2 || d.frames.length > 500)
    fail('Provide 2–500 profile frames.');
  let prev = -1;
  for (const f of d.frames) {
    if (!Number.isFinite(f.progress) || f.progress <= prev || f.progress < 0 || f.progress > 1)
      fail('Frame progress must increase from 0 to 1.');
    if (
      !Number.isFinite(f.altitudeFt) ||
      f.altitudeFt < 0 ||
      f.altitudeFt > 30000 ||
      !Number.isFinite(f.tasKt) ||
      f.tasKt < 30 ||
      f.tasKt > 400
    )
      fail('Each frame needs altitudeFt (0–30000) and tasKt (30–400).');
    prev = f.progress;
  }
  if (d.frames[0].progress !== 0 || d.frames.at(-1).progress !== 1)
    fail('First and last progress must be 0 and 1.');
  if (
    d.callouts !== undefined &&
    (!Array.isArray(d.callouts) ||
      d.callouts.length > 30 ||
      d.callouts.some(
        (c) =>
          !Number.isFinite(c.progress) ||
          c.progress < 0 ||
          c.progress > 1 ||
          typeof c.text !== 'string' ||
          c.text.length > 350,
      ))
  )
    fail('Callouts need progress (0–1) and text (up to 350 characters).');
  return {
    schemaVersion: 1,
    name: d.name.trim(),
    source: d.source.trim(),
    route: d.route,
    altitudeReference: d.altitudeReference,
    geoidOffsetM: d.altitudeReference === 'MSL' ? d.geoidOffsetM : 0,
    frames: d.frames.map((f) => ({progress: f.progress, altitudeFt: f.altitudeFt, tasKt: f.tasKt})),
    callouts: (d.callouts || [])
      .map((c) => ({progress: c.progress, text: c.text}))
      .sort((a, b) => a.progress - b.progress),
  };
}

// Validates routes.json on load (the screenshot-derived route geometry + named places).
// Kept pure/testable so a broken data file fails loudly in core.test.mjs and at runtime,
// instead of silently drawing a garbled route.
export function validateRouteData(d) {
  const fail = (m) => {
    throw Error(m);
  };
  if (!d || d.schemaVersion !== 1) fail('routes.json must declare schemaVersion 1.');
  const isLonLat = (p) =>
    Array.isArray(p) &&
    p.length === 2 &&
    Number.isFinite(p[0]) &&
    Number.isFinite(p[1]) &&
    p[0] > -180 &&
    p[0] < 180 &&
    p[1] > -90 &&
    p[1] < 90;
  const isLoop = (loop) => Array.isArray(loop) && loop.length >= 3 && loop.every(isLonLat);
  if (!d.loops || !isLoop(d.loops.inner) || !isLoop(d.loops.outer))
    fail('routes.json needs loops.inner and loops.outer as arrays of at least 3 [lon, lat] pairs.');
  if (
    !Array.isArray(d.places) ||
    d.places.some(
      (p) =>
        typeof p.name !== 'string' || !p.name.trim() || !Number.isFinite(p.lon) || !Number.isFinite(p.lat),
    )
  )
    fail('routes.json places must be {name, lon, lat} entries.');
  return d;
}

// Validates an exported progress-backup file before it is merged in as a new learner
// profile. Mirrors the inline checks the UI used to run, moved here so they are unit
// tested; id generation (crypto.randomUUID) stays in progress.js since it isn't pure.
export function validateProgressBackup(d) {
  const fail = (m) => {
    throw Error(m);
  };
  const p = d && d.learner;
  if (
    !d ||
    d.schemaVersion !== 1 ||
    !p ||
    typeof p.name !== 'string' ||
    !p.name.trim() ||
    p.name.length > 40 ||
    !Array.isArray(p.sessions) ||
    p.sessions.length > 300 ||
    !Array.isArray(p.flightProfiles) ||
    p.flightProfiles.length > 30
  )
    fail('This is not a supported progress backup.');
  for (const s of p.sessions) {
    const quizScoreOk =
      s.mode !== 'quiz' || (Number.isInteger(s.score) && s.score >= 0 && s.score <= 5 && s.total === 5);
    if (
      !['inner', 'outer'].includes(s.route) ||
      !['quiz', 'guided'].includes(s.mode) ||
      !Number.isFinite(Date.parse(s.completedAt)) ||
      typeof s.profile !== 'string' ||
      !quizScoreOk
    )
      fail('Backup contains invalid session data.');
  }
  return {name: p.name, sessions: p.sessions, flightProfiles: p.flightProfiles};
}
