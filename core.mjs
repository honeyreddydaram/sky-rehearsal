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

// Forward geodetic problem (the counterpart to bearing()/distance(), which solve the
// inverse problem): given a start point, a true bearing, and a distance, returns the
// destination [lon, lat]. Same spherical-Earth model (R = 6371000 m) as distance(), so
// the two stay consistent with each other. Used to draw the approximate runway line
// from the airport reference point — see validateAirportData()/data/airport-vohy.json.
export function destinationPoint(point, bearingDeg, distanceM) {
  const R = 6371000;
  const brng = rad(bearingDeg);
  const lat1 = rad(point[1]);
  const lon1 = rad(point[0]);
  const dByR = distanceM / R;
  const lat2 = Math.asin(Math.sin(lat1) * Math.cos(dByR) + Math.cos(lat1) * Math.sin(dByR) * Math.cos(brng));
  const lon2 =
    lon1 +
    Math.atan2(
      Math.sin(brng) * Math.sin(dByR) * Math.cos(lat1),
      Math.cos(dByR) - Math.sin(lat1) * Math.sin(lat2),
    );
  return [deg(lon2), deg(lat2)];
}

// Validates data/airport-vohy.json (verified reference data: ARP, runway, elevation,
// frequencies). Kept strict so a typo in the hand-authored JSON fails loudly rather
// than silently drawing a wrong airport diagram.
export function validateAirportData(d) {
  const fail = (m) => {
    throw Error(m);
  };
  if (!d || d.schemaVersion !== 1) fail('airport-vohy.json must declare schemaVersion 1.');
  if (typeof d.icao !== 'string' || !d.icao.trim()) fail('Airport data needs an icao code.');
  const arp = d.referencePoint;
  if (!arp || !Number.isFinite(arp.lat) || !Number.isFinite(arp.lon))
    fail('Airport data needs a referencePoint {lat, lon}.');
  if (!Array.isArray(d.runways) || !d.runways.length) fail('Airport data needs at least one runway.');
  for (const r of d.runways) {
    if (typeof r.id !== 'string' || !Number.isFinite(r.lengthM) || !Number.isFinite(r.nominalAlignment)) {
      fail('Each runway needs id, lengthM, and nominalAlignment.');
    }
    if (r.ends !== undefined) {
      for (const [endId, end] of Object.entries(r.ends)) {
        if (!Number.isFinite(end.lon) || !Number.isFinite(end.lat) || typeof end.source !== 'string') {
          fail(`Runway end "${endId}" needs lon, lat, and a source.`);
        }
      }
    }
  }
  return d;
}

// Computes the two approximate runway-end points for a runway record from
// data/airport-vohy.json. This is NOT a surveyed centerline: it assumes the airport
// reference point sits at the runway midpoint and projects half the published length
// each way along the nominal alignment. Good enough to draw a labeled "approximate"
// line on the map; not for anything that needs a real threshold coordinate.
export function approximateRunwayEnds(referencePoint, runway) {
  const arpLonLat = [referencePoint.lon, referencePoint.lat];
  const half = runway.lengthM / 2;
  const [lowId, highId] = runway.id.split('/'); // e.g. "09/27" -> "09", "27"
  const highBearing = wrap(runway.nominalAlignment); // the "high" end is in the alignment direction
  const lowBearing = wrap(runway.nominalAlignment + 180); // the "low" end is the reciprocal
  return {
    [lowId]: destinationPoint(arpLonLat, lowBearing, half),
    [highId]: destinationPoint(arpLonLat, highBearing, half),
  };
}

// Prefers real surveyed/OSM-sourced runway-end coordinates (runway.ends) when the
// airport data carries them, falling back to approximateRunwayEnds() when it
// doesn't. Keeps map.js from needing to know which case it's in.
export function resolveRunwayEnds(referencePoint, runway) {
  if (runway.ends) {
    const out = {};
    for (const [id, end] of Object.entries(runway.ends)) out[id] = [end.lon, end.lat];
    return out;
  }
  return approximateRunwayEnds(referencePoint, runway);
}

// Validates a circuit-pattern file (data/circuits/vohy-rwy27.json / vohy-rwy09.json).
// These describe a real traffic pattern as relayed by a trainee pilot, not an official
// chart — every checkpoint must carry a confidence/source note rather than a bare
// coordinate, so the data's provenance survives into the UI. coords is [lon, lat] or
// null (not yet located).
export function validateCircuitData(d) {
  const fail = (m) => {
    throw Error(m);
  };
  if (!d || d.schemaVersion !== 1) fail('Circuit data must declare schemaVersion 1.');
  if (typeof d.runway !== 'string') fail('Circuit data needs a runway id.');
  if (!['left-hand', 'right-hand'].includes(d.circuitDirection))
    fail('circuitDirection must be left-hand or right-hand.');
  if (!Array.isArray(d.legs) || !d.legs.length) fail('Circuit data needs at least one leg.');
  const legNames = ['upwind', 'crosswind', 'downwind', 'base', 'final'];
  for (const leg of d.legs) {
    if (!legNames.includes(leg.name)) fail(`Unknown leg name "${leg.name}".`);
    if (!Number.isFinite(leg.headingTrue)) fail(`Leg "${leg.name}" needs a headingTrue.`);
    if (!Array.isArray(leg.checkpoints)) fail(`Leg "${leg.name}" needs a checkpoints array.`);
    for (const c of leg.checkpoints) {
      if (typeof c.name !== 'string' || !c.name.trim())
        fail(`A checkpoint on "${leg.name}" is missing a name.`);
      if (
        c.coords !== null &&
        !(Array.isArray(c.coords) && c.coords.length === 2 && c.coords.every(Number.isFinite))
      ) {
        fail(`Checkpoint "${c.name}" needs coords as [lon, lat] or null.`);
      }
      if (c.coords !== null && typeof c.confidence !== 'string') {
        fail(`Checkpoint "${c.name}" has coords but no confidence note.`);
      }
    }
  }
  return d;
}

// Derives the reverse-runway circuit (e.g. RWY 09 from RWY 27): same ground track,
// flown in the opposite direction. Opposite runway means the pattern direction flips
// (left-hand becomes right-hand, because turning the same physical way relative to the
// ground reverses handedness once you're flying the other way down the runway), the
// leg sequence reverses, L/R side callouts swap, and each leg's heading is the
// reciprocal (headingTrue + 180). Leg names are reassigned by their new position in
// the standard upwind/crosswind/downwind/base/final sequence — that sequence is a
// universal definition, not runway-specific data, so e.g. the leg right after takeoff
// is always "upwind" regardless of what it was called in the source circuit. Any
// runway-specific free text (headingNote) is dropped rather than carried over stale.
// Pure and deterministic so it's unit-testable instead of hand-maintained — see
// scripts/generate-rwy09-circuit.mjs for how it's invoked.
const STANDARD_LEG_SEQUENCE = ['upwind', 'crosswind', 'downwind', 'base', 'final'];

export function reverseCircuit(source, {runway, side}) {
  const oppositeDirection = source.circuitDirection === 'left-hand' ? 'right-hand' : 'left-hand';
  const swapSide = (s) => (s === 'LEFT' ? 'RIGHT' : s === 'RIGHT' ? 'LEFT' : s);
  // A checkpoint flagged turnTo in the source marks a turn corner in THAT pattern's
  // geometry. After reversal the turn corners move to different checkpoints (whichever
  // one ends up last in each new leg) — carrying turnTo over would mislead a pilot
  // flying the derived runway into turning at the wrong point, so it's dropped and
  // replaced with a note instead of silently relocated.
  const remapCheckpoint = (c) => {
    const {turnTo, ...rest} = c;
    const note = turnTo
      ? `(This was a turn point in the RWY ${source.runway} pattern, not necessarily in this derived RWY ${runway} pattern.) ${c.note || ''}`.trim()
      : c.note;
    return {...rest, side: swapSide(c.side), note};
  };
  const legs = [...source.legs].reverse().map((leg, i) => ({
    ...leg,
    name: STANDARD_LEG_SEQUENCE[i] ?? leg.name,
    headingNote: undefined, // JSON.stringify drops undefined keys; avoids carrying a stale runway-specific note
    headingTrue: wrap(leg.headingTrue + 180),
    checkpoints: [...leg.checkpoints].reverse().map(remapCheckpoint),
  }));
  return {
    ...source,
    runway,
    circuitDirection: oppositeDirection,
    side,
    derived: true,
    derivedFrom: source.runway,
    needsConfirmation: true,
    legs,
  };
}

// Validates data/landmarks.json (named lakes/hills for the map's Landmarks layer).
export function validateLandmarksData(d) {
  const fail = (m) => {
    throw Error(m);
  };
  if (!d || d.schemaVersion !== 1) fail('landmarks.json must declare schemaVersion 1.');
  if (!Array.isArray(d.landmarks) || !d.landmarks.length)
    fail('landmarks.json needs a non-empty landmarks array.');
  for (const l of d.landmarks) {
    if (typeof l.name !== 'string' || !l.name.trim()) fail('Each landmark needs a name.');
    if (!Number.isFinite(l.lon) || !Number.isFinite(l.lat)) fail(`Landmark "${l.name}" needs lon/lat.`);
    if (typeof l.osmRef !== 'string' || typeof l.confidence !== 'string') {
      fail(`Landmark "${l.name}" needs an osmRef and a confidence note.`);
    }
  }
  return d;
}

// Pilots at this school refer to an aircraft by the NATO phonetic name of its
// registration's last letter (confirmed rule; only VT-TSB "Bravo" and VT-STC "Charlie"
// were individually confirmed). Deriving the others from the stated rule is applying a
// given definition, not guessing — see data/aircraft/fleet.json callSignSource.
const NATO_ALPHABET = {
  A: 'Alpha',
  B: 'Bravo',
  C: 'Charlie',
  D: 'Delta',
  E: 'Echo',
  F: 'Foxtrot',
  G: 'Golf',
  H: 'Hotel',
  I: 'India',
  J: 'Juliett',
  K: 'Kilo',
  L: 'Lima',
  M: 'Mike',
  N: 'November',
  O: 'Oscar',
  P: 'Papa',
  Q: 'Quebec',
  R: 'Romeo',
  S: 'Sierra',
  T: 'Tango',
  U: 'Uniform',
  V: 'Victor',
  W: 'Whiskey',
  X: 'Xray',
  Y: 'Yankee',
  Z: 'Zulu',
};
export function lastLetterCallSign(registration) {
  const letter = registration.trim().slice(-1).toUpperCase();
  return NATO_ALPHABET[letter] || null;
}

// Validates an aircraft type file (data/aircraft/*.json).
export function validateAircraftType(d) {
  const fail = (m) => {
    throw Error(m);
  };
  if (!d || d.schemaVersion !== 1) fail('Aircraft data must declare schemaVersion 1.');
  if (typeof d.typeCode !== 'string' || !d.typeCode.trim()) fail('Aircraft data needs a typeCode.');
  if (typeof d.usesCommonProfile !== 'boolean') fail('Aircraft data needs usesCommonProfile (boolean).');
  if (!d.profile || typeof d.profile !== 'object')
    fail('Aircraft data needs a profile object (can be empty).');
  if (!Array.isArray(d.registrations)) fail('Aircraft data needs a registrations array (can be empty).');
  return d;
}

// Finds the closest of a list of named points to a clicked lon/lat — used by the
// map's "click to identify" feature. candidates is [{name, lon, lat, ...}]; returns
// null if candidates is empty, otherwise {name, distanceM, ...rest of the candidate}.
export function nearestNamedPoint(point, candidates) {
  if (!candidates.length) return null;
  let best = null;
  let bestDistance = Infinity;
  for (const c of candidates) {
    const d = distance(point, [c.lon, c.lat]);
    if (d < bestDistance) {
      bestDistance = d;
      best = c;
    }
  }
  return {...best, distanceM: bestDistance};
}

// Merges a Cessna type file (c152/c172r/c172s.json) with the shared performance
// profile in cessna-common.json when the type opts in (usesCommonProfile: true).
// Fields present on the type file always win, so a type can override one value
// (e.g. a confirmed POH number) without duplicating the rest of the common profile.
export function resolveAircraftProfile(typeData, commonData) {
  if (!typeData.usesCommonProfile) return typeData;
  return {...typeData, profile: {...commonData.profile, ...(typeData.profile || {})}};
}
