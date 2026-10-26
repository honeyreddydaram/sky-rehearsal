import {headingText} from '../flight/core.mjs';

export const MODES = ['guided', 'practice', 'landmarks', 'decisions', 'quiz', 'exam', 'explore'];
export const DIFFICULTIES = ['beginner', 'intermediate', 'advanced', 'examiner'];
export const assessed = (mode) => ['landmarks', 'decisions', 'quiz', 'exam'].includes(mode);
export const modeLabel = (mode) =>
  ({
    guided: 'Guided',
    practice: 'Practice',
    landmarks: 'Landmark recognition',
    decisions: 'Decision training',
    quiz: 'Quiz',
    exam: 'Exam',
    explore: 'Free explore',
  })[mode] ?? mode;

export const modeDescription = (mode) =>
  ({
    guided: 'Automatic checkpoint cues, with help limited by difficulty.',
    practice: 'Uninterrupted rehearsal; request a hint when needed.',
    landmarks: 'Five questions about the reference landmarks for each leg.',
    decisions: 'Five next-action or training-wind questions.',
    quiz: 'Five route-sequence and true-track questions.',
    exam: 'Five mixed questions. No hints or immediate feedback; review after completion.',
    explore: 'Explore and scrub freely. This mode does not save scored attempts.',
  })[mode] ?? '';

export function assistance(mode, difficulty) {
  const level = DIFFICULTIES.includes(difficulty) ? DIFFICULTIES.indexOf(difficulty) : 3;
  const exam = mode === 'exam' || !MODES.includes(mode);
  return {
    labels: !exam && level <= 1,
    route: !exam && level <= 1,
    markers: !exam && level === 0,
    headingHints: !exam && level === 0,
    hints: !exam && level < 3,
    feedback: !exam,
    reference: !exam && !assessed(mode),
  };
}

export function trainingHint(waypoint, difficulty, count = 0) {
  if (difficulty === 'advanced' || count === 0)
    return 'Recall the circuit sequence, then relate the current leg to the reference landmarks. These notes are unverified.';
  return waypoint.cue;
}

export function questionFor({mode, index, waypoints, course, windSpeed = 0, windPossible = true}) {
  const w = waypoints[index];
  if (!w) throw new Error('Unknown training checkpoint');
  const type =
    mode === 'exam'
      ? ['landmark', 'heading', 'decision'][index % 3]
      : mode === 'landmarks'
        ? 'landmark'
        : mode === 'decisions'
          ? 'decision'
          : index % 2
            ? 'heading'
            : 'sequence';
  let prompt, correct, choices;
  if (type === 'heading') {
    prompt = `What true track does the upcoming ${w.name} leg follow in this illustrative route?`;
    correct = headingText(course);
    choices = [0, 90, 180, 270].map((offset) => headingText(course + offset));
  } else if (type === 'landmark') {
    const checkpoint = w.landmarks?.find((c) => c.coords) ?? w.landmarks?.[0];
    correct = checkpoint?.name ?? w.name;
    prompt = checkpoint
      ? `According to the unverified reference notes, which landmark belongs to ${w.name}${checkpoint.side ? ` on the ${checkpoint.side.toLowerCase()}` : ''}?${checkpoint.coords ? '' : ' Its location is not confirmed.'}`
      : 'Which reconstructed route area comes next?';
    choices = [correct, ...waypoints.flatMap((p) => p.landmarks?.map((c) => c.name) ?? [p.name])];
  } else if (type === 'decision') {
    if (windSpeed > 0 && index % 2 === 0) {
      prompt = windPossible
        ? 'The training wind causes drift off the planned track. Which model setting helps hold the track?'
        : 'The wind model says this track is not feasible at the current airspeed. What should you do in this rehearsal?';
      correct = windPossible ? 'Apply wind correction' : 'Pause and change the wind or airspeed scenario';
      choices = [
        correct,
        'Ignore the wind and continue',
        'Use magnetic heading as true heading',
        windPossible
          ? 'Disconnect terrain to remove wind drift'
          : 'Increase playback speed to overcome the wind',
      ];
    } else {
      const next = w.nextLeg ?? waypoints[index + 1]?.name;
      correct = next ? `Continue to ${next}` : 'Complete the rehearsal';
      prompt = `You have reached the turn point ending ${w.name}. What follows in this illustrative exercise?`;
      choices = [correct, ...waypoints.map((p) => `Continue to ${p.name}`), 'Complete the rehearsal'];
    }
  } else {
    prompt = w.landmarks
      ? 'Which circuit leg comes next?'
      : 'Which landmark or area comes next along this route?';
    correct = w.name;
    choices = [correct, ...waypoints.map((p) => p.name)];
  }
  choices = [...new Set(choices)].filter((value) => value !== correct).slice(0, 3);
  return {
    type,
    skill: type === 'decision' && windSpeed > 0 && index % 2 === 0 ? 'wind' : type,
    prompt,
    correct,
    choices: [correct, ...choices],
    explanation: w.cue,
  };
}
