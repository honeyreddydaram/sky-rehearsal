import {bearing, distance} from './core.mjs';

export function normalizeRecording(rows, {reference, geoidOffsetM} = {}) {
  if (!['MSL', 'ELLIPSOID'].includes(reference)) throw new Error('Choose an altitude reference.');
  if (reference === 'MSL' && !Number.isFinite(geoidOffsetM))
    throw new Error('MSL recordings need a geoid offset in metres.');
  if (rows.length < 2 || rows.length > 50000) throw new Error('Use 2–50,000 track points.');
  const points = rows.map((row, i) => {
    const timestamp = Date.parse(row.timestamp);
    const lon = Number(row.longitude),
      lat = Number(row.latitude),
      altitudeM = Number(row.altitude_m);
    if (!row.timestamp || !/(Z|[+-]\d{2}:\d{2})$/.test(row.timestamp) || !Number.isFinite(timestamp))
      throw new Error(`Point ${i + 1}: timestamp needs an explicit timezone.`);
    if (
      [row.longitude, row.latitude, row.altitude_m].some((v) => v == null || String(v).trim() === '') ||
      ![lon, lat, altitudeM].every(Number.isFinite) ||
      Math.abs(lon) > 180 ||
      Math.abs(lat) > 90 ||
      altitudeM < -500 ||
      altitudeM > 20000
    )
      throw new Error(`Point ${i + 1}: invalid coordinates or altitude.`);
    const optional = (key, min, max) => {
      if (row[key] === undefined || String(row[key]).trim() === '') return null;
      const value = Number(row[key]);
      if (!Number.isFinite(value) || value < min || value > max)
        throw new Error(`Point ${i + 1}: invalid ${key}.`);
      return value;
    };
    return {
      timestamp,
      position: [lon, lat],
      altitudeM,
      height: altitudeM + (reference === 'MSL' ? geoidOffsetM : 0),
      heading: optional('heading_true', 0, 360),
      speedKt: optional('speed_kt', 0, 1500),
      verticalSpeedFpm: optional('vertical_speed_fpm', -20000, 20000),
      tasKt: optional('tas_kt', 0, 1500),
      phase: row.phase?.trim() || null,
    };
  });
  if (
    points.some(
      (p) =>
        p.phase &&
        !['takeoff', 'upwind', 'crosswind', 'downwind', 'base', 'final', 'landing'].includes(p.phase),
    )
  )
    throw new Error('Unknown flight phase tag.');
  for (let i = 1; i < points.length; i++) {
    if (points[i].timestamp <= points[i - 1].timestamp)
      throw new Error(
        'Timestamps must increase strictly; duplicate times and merged GPX segments are unsupported.',
      );
  }
  points.forEach((point, i) => {
    const a = points[Math.max(0, i - 1)],
      b = points[i === 0 ? 1 : i];
    const seconds = (b.timestamp - a.timestamp) / 1000;
    point.headingDerived = point.heading === null;
    point.heading ??= bearing(a.position, b.position);
    point.speedKt ??= distance(a.position, b.position) / seconds / 0.514444;
    point.verticalSpeedFpm ??= ((b.altitudeM - a.altitudeM) / seconds) * 196.850394;
  });
  return {points, reference, duration: (points.at(-1).timestamp - points[0].timestamp) / 1000};
}

export function parseCsv(text) {
  // Numeric/time fields only: quoted fields are accepted, embedded commas aren't.
  const lines = text
    .replace(/^\uFEFF/, '')
    .trim()
    .split(/\r?\n/);
  const split = (line) => line.split(',').map((value) => value.trim().replace(/^"([^"\r\n]*)"$/, '$1'));
  const headers = split(lines.shift());
  const required = ['timestamp', 'latitude', 'longitude', 'altitude_m'];
  if (!required.every((key) => headers.includes(key)) || new Set(headers).size !== headers.length)
    throw new Error('CSV needs unique timestamp, latitude, longitude, altitude_m headers.');
  return lines.map((line) => {
    const values = split(line);
    if (values.length !== headers.length) throw new Error('CSV row has the wrong number of fields.');
    return Object.fromEntries(headers.map((key, i) => [key, values[i]]));
  });
}

export function parseGpx(text, Parser = globalThis.DOMParser) {
  if (/<!DOCTYPE/i.test(text)) throw new Error('GPX document types are unsupported.');
  const xml = new Parser().parseFromString(text, 'application/xml');
  if (xml.querySelector('parsererror') || xml.documentElement.localName !== 'gpx')
    throw new Error('Invalid GPX document.');
  const segments = [...xml.getElementsByTagNameNS('*', 'trkseg')];
  if (segments.length !== 1) throw new Error('Import one continuous GPX track segment at a time.');
  return [...segments[0].getElementsByTagNameNS('*', 'trkpt')].map((point) => ({
    latitude: point.getAttribute('lat'),
    longitude: point.getAttribute('lon'),
    altitude_m: point.getElementsByTagNameNS('*', 'ele')[0]?.textContent,
    timestamp: point.getElementsByTagNameNS('*', 'time')[0]?.textContent,
  }));
}

export function recordingAt(recording, seconds) {
  const points = recording.points;
  const timestamp = points[0].timestamp + Math.max(0, Math.min(recording.duration, seconds)) * 1000;
  // Binary search keeps scrubbing responsive for larger recordings.
  let lo = 0,
    hi = points.length - 1;
  while (hi - lo > 1) {
    const mid = (lo + hi) >> 1;
    if (points[mid].timestamp <= timestamp) lo = mid;
    else hi = mid;
  }
  const a = points[lo],
    b = points[hi],
    t = (timestamp - a.timestamp) / (b.timestamp - a.timestamp);
  const lerp = (x, y) => x + (y - x) * t;
  const lonDelta = ((b.position[0] - a.position[0] + 540) % 360) - 180;
  return {
    position: [((a.position[0] + lonDelta * t + 540) % 360) - 180, lerp(a.position[1], b.position[1])],
    height: lerp(a.height, b.height),
    altitudeM: lerp(a.altitudeM, b.altitudeM),
    heading: (a.heading + (((b.heading - a.heading + 540) % 360) - 180) * t + 360) % 360,
    speedKt: lerp(a.speedKt, b.speedKt),
    verticalSpeedFpm: lerp(a.verticalSpeedFpm, b.verticalSpeedFpm),
    timestamp,
    possible: true,
  };
}

export const replay = {sample: null, stop: null};
