// quiz.js
// The "quiz flight" question flow: builds a multiple-choice question for a waypoint,
// scores the pilot's answer, and hands control back to playback.js to resume or end
// the attempt. playback.js calls into here via an injected handler (setQuizHandler in
// playback.js) rather than an import, so the two files don't import each other.

import {questionFor, assistance} from './engine.mjs';
import {state, waypoints, planBearing, stateAt} from '../flight/state.js';
import {$, all, text, toast, showDialog} from '../ui/ui.js';
import {reset, resumeAfterCheckpoint, requestHint} from '../flight/playback.js';

export function beginQuestion(index) {
  state.pending = index;
  state.playing = false;
  const w = waypoints()[index];
  const course = planBearing(Math.min(1, w.p + 0.045));
  const question = questionFor({
    mode: state.mode,
    index,
    waypoints: waypoints(),
    course,
    windSpeed: state.windSpeed,
    windPossible: stateAt(w.p).possible,
  });
  const {correct} = question;
  let choices = question.choices;
  choices = choices
    .map((value) => ({value, key: Math.random()}))
    .sort((a, b) => a.key - b.key)
    .map((x) => x.value);

  text('question-number', `CHECKPOINT ${index + 1} OF 5`);
  text('question', question.prompt);
  $('answers').replaceChildren();
  text('feedback', '');
  text('question-hint-text', '');
  $('question-hint').disabled = !assistance(state.mode, state.difficulty).hints;
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
        type: question.type,
        skill: question.skill,
      });
      all('#answers button').forEach((btn) => {
        btn.disabled = true;
        btn.classList.toggle(
          'correct',
          assistance(state.mode, state.difficulty).feedback && btn.textContent === correct,
        );
        btn.classList.toggle(
          'incorrect',
          assistance(state.mode, state.difficulty).feedback && btn === b && !right,
        );
      });
      text(
        'feedback',
        state.mode === 'exam'
          ? 'Answer recorded. Feedback is available after completion.'
          : right
            ? 'Correct. ' + question.explanation
            : 'The answer is ' + correct + '. ' + question.explanation,
      );
      $('continue-quiz').disabled = false;
      $('question-hint').disabled = true;
    };
    $('answers').append(b);
  });
  showDialog('quiz-dialog');
}

export function wireQuizDialog() {
  $('question-hint').onclick = requestHint;
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
