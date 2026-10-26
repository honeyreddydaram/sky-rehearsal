# Training modes (M5)

Choose a route/runway, mode, and difficulty before starting. Changing the route,
runway, wind, profile, mode, or difficulty starts a fresh attempt. Training uses the
existing illustrative geometry and unverified reference notes. It does not silently
promote the supplied private GPX flight into a standard circuit.

| Mode                 | Behavior                                                                                        |
| -------------------- | ----------------------------------------------------------------------------------------------- |
| Guided               | Automatic checkpoint cues, with assistance limited by difficulty                                |
| Practice             | Uninterrupted rehearsal and hints on request; full attempts are logged                          |
| Landmark recognition | Five questions about the current leg's reference landmarks and supplied left/right associations |
| Decision training    | Five questions about the next leg/action or the configured wind scenario                        |
| Quiz                 | Five route-sequence and true-track questions                                                    |
| Exam                 | Five mixed questions; answers are recorded without revealing correctness until the final review |
| Free explore         | Free scrubbing and checkpoint jumps; no scored/logged attempt                                   |

Question construction is deterministic for a given checkpoint and scenario. Only
the order of answer buttons is shuffled. Landmark questions use circuit checkpoint
records, never a fabricated identification. An unlocated landmark is explicitly
labelled as unconfirmed. Legacy routes use their reconstructed area/checkpoint
names. These are reference-recall exercises, not image-recognition grading or
instructor-verified operational procedures. Decision questions do not invent POH
settings or ATC clearances. Wind decisions refer to the existing training model.

## Progressive assistance

| Difficulty   | Labels    | Route lines | Checkpoint markers/list | Phase/target hints | On-demand hints                 |
| ------------ | --------- | ----------- | ----------------------- | ------------------ | ------------------------------- |
| Beginner     | Available | Visible     | Visible                 | Visible            | General prompt, then source cue |
| Intermediate | Available | Visible     | Hidden                  | Hidden             | General prompt, then source cue |
| Advanced     | Hidden    | Hidden      | Hidden                  | Hidden             | General recall prompt only      |
| Examiner     | Hidden    | Hidden      | Hidden                  | Hidden             | Disabled                        |

Exam overrides every difficulty: map aids, reference-panel answers, hints, timeline
skipping and immediate answer feedback are disabled. All five checkpoint questions
must be answered in order; partial/end/skip attempts are not saved as completed
assessments. Camera controls and measured telemetry remain available. Difficulty
controls training assistance, not aircraft physics or weather severity.

The policy applies to Cesium entities and the SVG fallback. Settings cannot re-enable
labels when the training policy disallows them. Reduced assistance also removes the
nearest-landmark identification helper. Imported recording overlays obey route-aid
visibility. Runway geometry itself stays visible for orientation.

Hints are available beside the route and inside training question dialogs. Hint
levels progress independently for each checkpoint, while the total number requested
is retained for the attempt. Changing a setting resets hint and answer state.

## Results and persistence

Assessed modes pause before each checkpoint. Recognition, decision and quiz modes
provide immediate feedback after an answer; exams show a neutral confirmation and
reveal the expected answers only in the completed results review. Practice and
guided modes log completed sessions without a question score.

A session records mode, difficulty, hint count, and its five answers with basic
correct-answer totals. Firebase Rules and backup/import validation accept the new
modes while retaining support for old guided/quiz records without difficulty fields
(defaulting to Beginner for display/import). Session IDs remain immutable in the
cloud. History displays mode/difficulty/hint use; best recall score spans modes and
levels and is not a proficiency rating. Imported legacy backup records retain their
score/mode, but do not invent answer detail that was not present.

This is a self-study recall exam. Answers are available in the client application,
and scores are client-submitted. M6 adds flight metrics and detailed debriefing;
this milestone does not claim heading/altitude/turn-performance scoring or a
certified/external-proctored assessment.

## Validation

`npm test` exercises the question/assistance engine, source gaps, wind decisions,
and backup compatibility. Browser tests exercise all five exam gates, deferred
feedback, final review/persistence, recognition/decision flows, and reset behavior.
They verify assistance removal/restoration in the diagram fallback; the existing
Cesium tests continue to exercise live map/camera interactions. Firebase Rules tests
check that new assessment modes/difficulty metadata can be saved and invalid levels
are denied. `npm run test:firebase` retains the cross-browser progress/file round trip.

The browser suites start their own Vite servers on 4173/4174; stop an earlier preview
or development server on those ports before running them.
