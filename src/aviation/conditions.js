import {airport} from './airport.js';
import {state} from '../flight/state.js';
import {$, text, download} from '../ui/ui.js';
import {
  WEATHER,
  PHASES,
  parseMetar,
  usableWeather,
  validatePerformance,
  turnCharacteristics,
  trueAirspeed,
} from './conditions.mjs';

const profiles = new Map();
let observation = null;
export function manualWeather() {
  state.weather = {
    ...state.weather,
    source: 'Manual training scenario',
    observedAt: null,
    gustKt: null,
    windFrom: state.windFrom,
    windSpeed: state.windSpeed,
  };
  text(
    'weather-status',
    `Manual scenario · wind ${state.windFrom}°T / ${state.windSpeed} kt; QNH ${state.weather.qnh} hPa; ${state.weather.temperature}°C. Not a live observation.`,
  );
}

export function wireConditions(changed) {
  const apply = (weather) => {
    state.weather = structuredClone(weather);
    state.windFrom = weather.windFrom;
    state.windSpeed = weather.windSpeed;
    $('wind-from').value = weather.windFrom;
    $('wind-speed').value = weather.windSpeed;
    text('wind-from-value', `${Math.round(weather.windFrom)}°T`);
    text('wind-speed-value', `${weather.windSpeed.toFixed(1)} kt`);
    changed();
  };
  $('weather-scenario').onchange = () => {
    const weather = WEATHER[$('weather-scenario').value];
    apply({...weather, source: 'Training scenario'});
    text(
      'weather-status',
      `${weather.name} · QNH ${weather.qnh} hPa · ${weather.temperature}°C · visibility ${weather.visibilityM} m · ${weather.clouds}.`,
    );
  };
  const decode = (raw) => {
    observation = null;
    $('weather-apply').disabled = true;
    const result = parseMetar(raw);
    if (result.station !== 'VOHY') throw Error('Use a VOHY observation for this airport.');
    observation = result;
    text(
      'weather-status',
      `${result.station} · observed ${result.observedAt} · wind ${result.variable ? 'variable' : result.windFrom + '°T'} / ${result.windSpeed ?? 'unknown'} kt${result.gustKt ? ' gust ' + result.gustKt : ''} · QNH ${result.qnh ?? 'unknown'} hPa · ${result.temperature ?? 'unknown'}°C · visibility ${result.visibilityM ?? 'unknown'} m · ${result.clouds}.${result.stale ? ' STALE — cannot apply.' : ''}`,
    );
    try {
      usableWeather(result);
      $('weather-apply').disabled = false;
    } catch (error) {
      text('weather-status', $('weather-status').textContent + ' ' + error.message);
    }
  };
  $('weather-decode').onclick = () => {
    try {
      decode($('weather-metar').value);
    } catch (error) {
      text('weather-status', error.message);
    }
  };
  $('weather-load').onclick = async () => {
    $('weather-load').disabled = true;
    observation = null;
    $('weather-apply').disabled = true;
    const controller = new AbortController(),
      timer = setTimeout(() => controller.abort(), 10000);
    try {
      const response = await fetch('/api/weather/metar', {signal: controller.signal});
      if (!response.ok) throw Error('Live METAR unavailable. Paste a report or choose a training scenario.');
      const result = await response.json();
      $('weather-metar').value = result.raw;
      decode(result.raw);
    } catch (error) {
      text('weather-status', error.message);
    } finally {
      clearTimeout(timer);
      $('weather-load').disabled = false;
    }
  };
  $('weather-metar').oninput = () => {
    observation = null;
    $('weather-apply').disabled = true;
  };
  $('weather-apply').onclick = () => {
    try {
      const weather = usableWeather(observation);
      apply({...weather, source: 'METAR observation'});
      text(
        'weather-status',
        `Applied ${weather.station} observation ${weather.observedAt}; steady wind only${weather.gustKt ? '; gusts are briefing only' : ''}.`,
      );
    } catch (error) {
      text('weather-status', error.message);
    }
  };
  const selectPerformance = () => {
    const type = $('performance-type').value;
    state.performance = profiles.get(type) ?? null;
    if (!state.performance)
      text(
        'performance-status',
        `${type === 'none' ? 'Demo' : type.toUpperCase()}: no reviewed performance loaded. Demo speeds remain active.`,
      );
    else {
      const p = state.performance;
      const tas = trueAirspeed(p.phaseSpeedsKias.downwind, 2800, state.weather, airport.elevation.ft),
        turn = turnCharacteristics(tas, p.bankDeg);
      text(
        'performance-status',
        `${p.typeCode.toUpperCase()} · ${p.source}, ${p.reference} · reviewer: ${p.reviewedBy}. Downwind ${p.phaseSpeedsKias.downwind} KIAS; indicative 2800 ft turn radius ${turn.radiusM.toFixed(0)} m at ${p.bankDeg}° bank. Data is user-declared, not independently certified. Applies to demo circuits; imported TAS profiles take precedence. Route corners remain instantaneous.`,
      );
    }
    changed();
  };
  $('performance-type').onchange = selectPerformance;
  $('performance-template').onclick = () =>
    download('aircraft-performance-template.json', {
      version: 1,
      typeCode: $('performance-type').value === 'none' ? 'c152' : $('performance-type').value,
      source: '',
      reference: '',
      reviewedBy: '',
      bankDeg: null,
      phaseSpeedsKias: Object.fromEntries(PHASES.map((phase) => [phase, null])),
    });
  $('performance-file').onchange = async (event) => {
    try {
      const file = event.target.files[0];
      if (!file || file.size > 10000) throw Error('Choose an aircraft JSON file under 10 KB.');
      const profile = validatePerformance(JSON.parse(await file.text()));
      profiles.set(profile.typeCode, profile);
      $('performance-type').value = profile.typeCode;
      selectPerformance();
    } catch (error) {
      text('performance-status', error.message);
    }
    event.target.value = '';
  };
}

// The school launch callback owns the reset/rebuild; never trigger partial changes here.
export function applySchoolConditions(config) {
  state.performance = config.performance ? validatePerformance(config.performance) : null;
  if (state.performance) profiles.set(config.aircraft, state.performance);
  $('performance-type').value = config.aircraft === 'demo' ? 'none' : config.aircraft;
  state.weather = {
    ...WEATHER[config.weather],
    source: 'School assignment',
    windFrom: config.windFrom,
    windSpeed: config.windSpeed,
  };
  state.windFrom = config.windFrom;
  state.windSpeed = config.windSpeed;
  state.correctWind = true;
  $('weather-scenario').value = config.weather;
  $('wind-from').value = config.windFrom;
  $('wind-speed').value = config.windSpeed;
  $('compensate').checked = true;
  text('wind-from-value', `${config.windFrom}°T`);
  text('wind-speed-value', `${config.windSpeed} kt`);
  text(
    'weather-status',
    `School assignment · ${config.weather} · QNH ${state.weather.qnh} hPa · ${state.weather.temperature}°C · wind ${config.windFrom}°T / ${config.windSpeed} kt.`,
  );
  text(
    'performance-status',
    state.performance
      ? `${config.aircraft.toUpperCase()} · ${state.performance.source} · ${state.performance.reference} · reviewed by ${state.performance.reviewedBy}. User-declared review; simplified model.`
      : 'Assignment explicitly uses demo aircraft speeds.',
  );
}
