export const PHASES = ['takeoff', 'upwind', 'crosswind', 'downwind', 'base', 'final', 'landing'];
export const AIRCRAFT = ['c152', 'c172r', 'c172s', 'da42ng'];
export const WEATHER = {
  calm: {
    name: 'Calm / standard',
    windFrom: 270,
    windSpeed: 0,
    qnh: 1013.25,
    temperature: 15,
    visibilityM: 10000,
    clouds: 'Clear',
  },
  westerly: {
    name: 'Westerly training wind',
    windFrom: 270,
    windSpeed: 10,
    qnh: 1008,
    temperature: 30,
    visibilityM: 8000,
    clouds: 'SCT 3000 ft AGL',
  },
  crosswind: {
    name: 'Northerly crosswind exercise',
    windFrom: 360,
    windSpeed: 12,
    qnh: 1016,
    temperature: 25,
    visibilityM: 5000,
    clouds: 'BKN 2500 ft AGL',
  },
};

export function parseMetar(raw, now = new Date()) {
  if (typeof raw !== 'string' || raw.length > 1500) throw Error('Use a METAR under 1500 characters.');
  const tokens = raw.trim().toUpperCase().replace(/=$/, '').split(/\s+/);
  if (['METAR', 'SPECI'].includes(tokens[0])) tokens.shift();
  const station = tokens[0],
    stamp = tokens[1]?.match(/^(\d{2})(\d{2})(\d{2})Z$/);
  if (!/^[A-Z]{4}$/.test(station) || !stamp)
    throw Error('METAR needs an ICAO station and DDHHMMZ observation time.');
  const [, day, hour, minute] = stamp.map(Number);
  if (day < 1 || day > 31 || hour > 23 || minute > 59) throw Error('Invalid METAR observation time.');
  const dates = [-1, 0, 1]
    .map((offset) => new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() + offset, day, hour, minute)))
    .filter((date) => date.getUTCDate() === day)
    .sort((a, b) => Math.abs(a - now) - Math.abs(b - now));
  const observedAt = dates[0];
  if (!observedAt || observedAt - now > 600000) throw Error('METAR observation time is in the future.');
  // Ignore trend/forecast sections; never apply TEMPO/BECMG winds as observations.
  const end = tokens.findIndex((t) => ['TEMPO', 'BECMG', 'NOSIG', 'RMK'].includes(t));
  const body = end < 0 ? tokens.slice(2) : tokens.slice(2, end);
  const wind = body
    .find((t) => /^(\d{3}|VRB)\d{2,3}(G\d{2,3})?(KT|MPS)$/.test(t))
    ?.match(/^(\d{3}|VRB)(\d{2,3})(?:G(\d{2,3}))?(KT|MPS)$/);
  const q = body.find((t) => /^Q\d{4}$|^A\d{4}$/.test(t));
  const temp = body.find((t) => /^M?\d{2}\/(M?\d{2}|\/\/)$/.test(t));
  const convertTemp = (value) => (value.startsWith('M') ? -Number(value.slice(1)) : Number(value));
  const factor = wind?.[4] === 'MPS' ? 1.943844 : 1;
  const visibility = body.includes('CAVOK') ? 10000 : body.find((t) => /^\d{4}$/.test(t));
  const result = {
    name: `${station} METAR`,
    station,
    raw: raw.trim(),
    observedAt: observedAt.toISOString(),
    stale: now - observedAt > 7200000,
    windFrom: wind && wind[1] !== 'VRB' ? Number(wind[1]) : null,
    windSpeed: wind ? Number(wind[2]) * factor : null,
    gustKt: wind?.[3] ? Number(wind[3]) * factor : null,
    variable: wind?.[1] === 'VRB' || body.some((t) => /^\d{3}V\d{3}$/.test(t)),
    qnh: q ? (q[0] === 'Q' ? Number(q.slice(1)) : (Number(q.slice(1)) / 100) * 33.8638867) : null,
    temperature: temp ? convertTemp(temp.split('/')[0]) : null,
    visibilityM: visibility ? Number(visibility) : null,
    clouds: body.includes('CAVOK')
      ? 'CAVOK (visibility at least 10 km)'
      : body
          .filter((t) => /^(FEW|SCT|BKN|OVC|VV)\d{3}|^(NSC|NCD|CLR|SKC)$/.test(t))
          .join(' ')
          .slice(0, 300) || 'Not decoded',
  };
  if (
    (result.temperature !== null && (result.temperature < -60 || result.temperature > 60)) ||
    result.windFrom > 360 ||
    result.windSpeed > 150 ||
    (result.qnh !== null && (result.qnh < 850 || result.qnh > 1100))
  )
    throw Error('METAR values are outside supported bounds.');
  return result;
}

export function usableWeather(weather, now = new Date()) {
  if (!weather) throw Error('Decode a supported observation first.');
  if (
    weather.observedAt &&
    (now - new Date(weather.observedAt) > 7200000 || new Date(weather.observedAt) - now > 600000)
  )
    throw Error('METAR is stale or future-dated; choose a training scenario.');
  if (
    weather.variable ||
    weather.windFrom === null ||
    weather.windSpeed === null ||
    weather.qnh === null ||
    weather.temperature === null
  )
    throw Error('Variable wind or missing fields cannot drive this steady-weather model.');
  if (weather.windSpeed > 35 || weather.gustKt > 35)
    throw Error('Wind exceeds this rehearsal’s 35 kt model range.');
  return {...weather};
}

export function validatePerformance(data) {
  const text = (v, max) => typeof v === 'string' && v.trim().length > 0 && v.length <= max;
  if (
    !data ||
    data.version !== 1 ||
    !AIRCRAFT.includes(data.typeCode) ||
    !text(data.source, 200) ||
    !text(data.reference, 200) ||
    !text(data.reviewedBy, 100) ||
    !Number.isFinite(data.bankDeg) ||
    data.bankDeg < 5 ||
    data.bankDeg > 30 ||
    !PHASES.every(
      (phase) =>
        Number.isFinite(data.phaseSpeedsKias?.[phase]) &&
        data.phaseSpeedsKias[phase] >= 30 &&
        data.phaseSpeedsKias[phase] <= 200,
    )
  )
    throw Error(
      'Supply a supported type, POH source/revision/pages, reviewer, bank angle (5–30°) and all seven phase speeds (30–200 KIAS).',
    );
  return {
    version: 1,
    typeCode: data.typeCode,
    source: data.source.trim(),
    reference: data.reference.trim(),
    reviewedBy: data.reviewedBy.trim(),
    bankDeg: data.bankDeg,
    phaseSpeedsKias: Object.fromEntries(PHASES.map((phase) => [phase, data.phaseSpeedsKias[phase]])),
  };
}

// Low-speed dry-air density approximation; IAS≈EAS. Not an aircraft performance solver.
export function trueAirspeed(kias, altitudeFt, weather, fieldElevationFt = 0) {
  const pressure = weather.qnh * 100 * (1 - 2.25577e-5 * altitudeFt * 0.3048) ** 5.25588;
  const kelvin = weather.temperature + 273.15 - 0.0065 * (altitudeFt - fieldElevationFt) * 0.3048;
  return kias * Math.sqrt(1.225 / (pressure / (287.05 * kelvin)));
}
export function turnCharacteristics(tasKt, bankDeg) {
  const speed = tasKt * 0.514444,
    acceleration = 9.80665 * Math.tan((bankDeg * Math.PI) / 180);
  return {radiusM: (speed * speed) / acceleration, rateDegSecond: ((acceleration / speed) * 180) / Math.PI};
}

// Preserve the inputs used for a completed rehearsal without storing raw METAR text.
export function environmentSnapshot(weather, performance) {
  return {
    version: 1,
    weather: {
      source: String(weather.source).slice(0, 100),
      observedAt: weather.observedAt ?? null,
      qnh: weather.qnh,
      temperature: weather.temperature,
      visibilityM: weather.visibilityM,
      clouds: weather.clouds,
      gustKt: weather.gustKt ?? null,
    },
    aircraft: performance ? structuredClone(performance) : null,
  };
}
export function validEnvironment(data) {
  const range = (value, min, max) => Number.isFinite(value) && value >= min && value <= max;
  const w = data?.weather;
  if (
    data?.version !== 1 ||
    !w ||
    typeof w.source !== 'string' ||
    w.source.length > 100 ||
    !range(w.qnh, 850, 1100) ||
    !range(w.temperature, -60, 60) ||
    !(w.visibilityM === null || range(w.visibilityM, 0, 10000)) ||
    typeof w.clouds !== 'string' ||
    w.clouds.length > 300 ||
    !(w.gustKt === null || range(w.gustKt, 0, 150)) ||
    !(
      w.observedAt === null ||
      (typeof w.observedAt === 'string' &&
        w.observedAt.length <= 40 &&
        Number.isFinite(Date.parse(w.observedAt)))
    )
  )
    return false;
  try {
    return data.aircraft === null || Boolean(validatePerformance(data.aircraft));
  } catch {
    return false;
  }
}
