const DIGITS = {
  zero: '0',
  oh: '0',
  one: '1',
  two: '2',
  three: '3',
  four: '4',
  fower: '4',
  five: '5',
  fife: '5',
  six: '6',
  seven: '7',
  eight: '8',
  ait: '8',
  nine: '9',
  niner: '9',
};
export function radioExercise(runway, phase, callSign) {
  if (!/^(0[1-9]|[12][0-9]|3[0-6])[LRC]?$/.test(runway))
    throw Error('Choose a circuit runway for radio practice.');
  const leg = ['downwind', 'base', 'final'].includes(phase) ? phase : 'downwind';
  const spokenRunway =
    runway.slice(0, 2).split('').join(' ') + ({L: ' left', R: ' right', C: ' centre'}[runway[2]] ?? '');
  return {
    runway,
    phase: leg,
    callSign,
    tower: `${callSign}, report ${leg} runway ${spokenRunway}.`,
    expected: `${callSign}, ${leg} runway ${spokenRunway}.`,
  };
}
export function checkReadback(transcript, exercise) {
  if (typeof transcript !== 'string' || transcript.length > 500)
    throw Error('Use a readback under 500 characters.');
  const normalized = transcript
    .toLowerCase()
    .replace(/down\s+wind/g, 'downwind')
    .replace(/\brun\s+way\b/g, 'runway')
    .replace(/[^a-z0-9 ]/g, ' ')
    .split(/\s+/)
    .filter(Boolean);
  const runwayTokens = normalized.map((word) => DIGITS[word] ?? word);
  const runwayMentions = runwayTokens.filter((word) => word === 'runway').length;
  const runwayIndex = runwayTokens.indexOf('runway');
  let runway =
    runwayIndex < 0
      ? ''
      : runwayTokens
          .slice(runwayIndex + 1, runwayIndex + 3)
          .filter((w) => /^\d+$/.test(w))
          .join('');
  if (runway.length === 1) runway = runway.padStart(2, '0');
  const suffixes = normalized
    .slice(runwayIndex + 1, runwayIndex + 4)
    .filter((word) => ['left', 'right', 'center', 'centre', 'l', 'r', 'c'].includes(word));
  if (suffixes.length)
    runway += {left: 'L', right: 'R', center: 'C', centre: 'C', l: 'L', r: 'R', c: 'C'}[suffixes[0]];
  const phases = ['downwind', 'base', 'final'].filter((phase) => normalized.includes(phase));
  const missing = [];
  if (
    !exercise.callSign
      .toLowerCase()
      .split(/\s+/)
      .every((word) => normalized.includes(word))
  )
    missing.push('call sign');
  if (phases.length !== 1 || phases[0] !== exercise.phase) missing.push('correct circuit leg');
  if (runwayMentions !== 1 || runway !== exercise.runway) missing.push('correct runway');
  if (normalized.some((word) => ['not', 'negative', 'unable'].includes(word)))
    missing.push('an unambiguous positive readback');
  return {passed: missing.length === 0, missing};
}
