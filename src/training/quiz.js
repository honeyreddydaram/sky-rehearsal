// quiz.js
// The "quiz flight" question flow: builds a multiple-choice question for a waypoint,
// scores the pilot's answer, and hands control back to playback.js to resume or end
// the attempt. playback.js calls into here via an injected handler (setQuizHandler in
// playback.js) rather than an import, so the two files don't import each other.

import {headingText} from '../flight/core.mjs';
import {state, waypoints, planBearing} from '../flight/state.js';
import {$, all, text, toast, showDialog} from '../ui/ui.js';
import {reset, resumeAfterCheckpoint} from '../flight/playback.js';

export function beginQuestion(index) {
  state.pending = index;
  state.playing = false;
  const w = waypoints()[index];
  const isHeading = index % 2 === 1; // alternate question type by checkpoint
  const course = planBearing(Math.min(1, w.p + 0.045));
  const correct = isHeading ? headingText(course) : w.name;
  let choices = isHeading
    ? [correct, headingText(course + 90), headingText(course + 180), headingText(course + 270)]
    : [
        w.name,
        ...waypoints()
          .filter((_, j) => j !== index)
          .map((x) => x.name)
          .slice(0, 3),
      ];
  choices = choices
    .map((value) => ({value, key: Math.random()}))
    .sort((a, b) => a.key - b.key)
    .map((x) => x.value);

  text('question-number', `CHECKPOINT ${index + 1} OF 5`);
  text(
    'question',
    isHeading
      ? 'What true track does the next leg of this route follow?'
      : state.route.startsWith('circuit')
        ? 'Which circuit leg comes next?'
        : 'Which landmark or area comes next along this route?',
  );
  $('answers').replaceChildren();
  text('feedback', '');
  $('continue-quiz').disabled = true;

  choices.forEach((choice) => {
    const b = document.createElement('button');
    b.textContent = choice;
    b.onclick = () => {
      if (state.answers.some((a) => a.index === index)) return; // already answered
      const right = choice === correct;
      state.answers.push({
        index,
        question: $('question').textContent,
        selected: choice,
        correct,
        passed: right,
        waypoint: w.name,
      });
      all('#answers button').forEach((btn) => {
        btn.disabled = true;
        btn.classList.toggle('correct', btn.textContent === correct);
        btn.classList.toggle('incorrect', btn === b && !right);
      });
      text('feedback', right ? 'Correct. ' + w.cue : 'The answer is ' + correct + '. ' + w.cue);
      $('continue-quiz').disabled = false;
    };
    $('answers').append(b);
  });
  showDialog('quiz-dialog');
}

export function wireQuizDialog() {
  // The quiz dialog can't be dismissed with Escape — an attempt must be finished or
  // explicitly ended, so a half-answered checkpoint can't silently vanish.
  $('quiz-dialog').addEventListener('cancel', (e) => {
    e.preventDefault();
    toast('Answer and continue, or choose End attempt.');
  });

  $('continue-quiz').onclick = () => {
    const index = state.pending;
    if (index === null || !state.answers.some((a) => a.index === index)) return;
    $('quiz-dialog').close();
    resumeAfterCheckpoint(index);
  };

  $('end-quiz').onclick = () => {
    $('quiz-dialog').close();
    toast('Attempt ended. Incomplete attempts are not added to scores.');
    // reset() already clears pending/playing/eligible/started, so nothing else is
    // needed here before it runs.
    reset();
  };
}
