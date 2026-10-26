# Deterministic debrief (M6)

Completed eligible rehearsals receive a debrief. Imported recordings can be compared
using **Compare flight with current route**. The debrief shows mean/maximum errors,
available comparison scores, knowledge-recall breakdowns, above-tolerance differences,
and short replay windows. Reports can be exported as JSON. Reports attached to completed
sessions and saved flights are retained in Firebase and shown after a fresh sign-in.

## Measurements and teaching tolerances

| Comparison             | Method                                                                                        | Default tolerance |
| ---------------------- | --------------------------------------------------------------------------------------------- | ----------------- |
| Track deviation        | Distance to the reference at known simulation progress; nearest segment for an imported track | 185.2 m / 0.1 NM  |
| True heading           | Smallest angular difference from the wind-corrected reference heading                         | 15°               |
| Altitude               | Absolute difference after converting both tracks to ellipsoid heights                         | 150 ft            |
| True airspeed          | Measured TAS versus the selected reference TAS schedule                                       | 10 kt             |
| Turn / phase timing    | Explicit phase-transition times relative to a takeoff-aligned start                           | 15 s              |
| Ground-track direction | Derived GPS direction versus reference track; separate from nose heading                      | 15°               |

These are demonstration teaching criteria, not aircraft limits or an approved
assessment standard. Profile and geometry provenance must be reviewed before using
them for training decisions. Criteria version 1 is stored with every report.

For each available measurement, errors are time-weighted with trapezoidal integration.
Irregular GPS sampling therefore does not give densely sampled moments extra credit.
Mean and maximum errors retain physical units. The comparison score is:

`round(100 × max(0, 1 − mean_error / (2 × tolerance)))`

Zero error gives 100; a mean error at tolerance gives 50; twice tolerance gives zero.
Within-tolerance percentage uses the same time weighting. Phase timing instead
weights each matched transition equally. Gaps over 30 seconds contribute neither
interpolated measurements nor time weight; excluded duration is reported explicitly.
If every interval is a gap (as in the minute-spaced GPX replay demo), no flight metric
is available. Replaying a sparse recording does not make it suitable for assessment.

## Available data versus missing data

- GPX-derived direction is **ground track**, not nose heading. The debrief never
  substitutes it for true heading. A separate ground-track direction comparison is
  shown when available.
- CSV `speed_kt` is ground speed. Optional `tas_kt` supplies true airspeed; it must be
  measured/sourced, not copied from ground speed to make a score appear.
- Heading comparison additionally needs a known wind scenario. Simulation has one;
  imported recordings currently have no confirmed wind data, so their physical
  heading/wind-correction metric remains unavailable.
- Optional CSV `phase` tags may contain `takeoff`, `upwind`, `crosswind`, `downwind`,
  `base`, `final`, `landing`. All reference transitions must be present and the
  first sample must be tagged takeoff before turn/phase timing is scored. No bank
  manoeuvre is inferred from a noisy GPS heading. Times are quantized to actual
  recording/reference sample boundaries; they are not sub-sample detections.
- For untagged recordings, leg names are nearest-reference associations. They are
  not independent evidence that the pilot flew that procedure. Shared runway
  segments are ambiguous without phase tags. Recorded taxi time and unrelated
  flight portions must not be treated as an aligned circuit automatically.
- The selected altitude reference and geoid offset are assumptions supplied at
  import. The GPX altitude datum is not guessed. The debrief compares common
  ellipsoid heights; the recorded replay readout retains the chosen source datum.
- Rehearsal aircraft follow profiles and turns automatically. Their altitude/TAS
  comparison scores describe generated trajectories, not a trainee's manual flying.

An overall flight score is produced by the engine only for an independently
recorded, complete, takeoff-to-landing trace against a verified reference, with no
excluded gaps, at least 90% reference-progress span, and at least 95% measured-time
coverage for every required flight metric plus all phase transitions. It is the
unweighted mean of the five primary component scores. Ground-track direction and
knowledge-recall results are not double-counted into it.

**Current airport geometry and demo profiles are unverified.** The application
therefore shows exploratory component comparisons and explicitly leaves overall
flight scores unavailable. It does not manufacture a proficiency grade from an
illustrative route or missing sensors. Unit tests exercise verified synthetic inputs
to verify the complete score calculation without pretending the current data is approved.

## Recall and wind correction

Knowledge scores come only from recorded answers, grouped by landmark recognition,
circuit sequence, heading recall, procedure decisions and wind-correction recall.
Each percentage includes its answer count. Unasked categories remain absent, rather
than becoming zeros. An overall recall percentage is separate from flight metrics.
In a known simulation wind scenario, the physical heading target includes computed
wind correction; a wind-recall answer does not establish physical wind-correction skill.

## Replay and persistence

The debrief retains the worst difference per reference phase/metric, capped at 20
entries. Each gives actual/reference values, magnitude, time, and a deterministic
improvement suggestion. Replay starts up to five seconds before the event and stops
up to five seconds after it. The map shows ideal/actual paths and a red deviation
connector where a position pair is available, in Cesium and the diagram fallback.
Completed exam debrief replay may reveal route aids; it cannot create another scored
attempt. A fresh attempt resets the review state and restores training assistance policy.

Session reports are immutable alongside their completed session IDs. A saved flight
can include its current comparison report in private track metadata. History and
reloaded reports show the saved metrics without silently recomputing them against
a changed route/profile. Their replay controls are disabled until a fresh comparison
is run with the current recording/reference. Changing route/profile/wind clears an
active recorded comparison. Clearing/signing out also clears its visible report.

The report contains criteria, reference label, computed metrics and selected events;
it is not a copy of the full time series/reference dataset. Reproduction requires
retaining the source flight and the same reference/profile/wind inputs. Backup/import
validation accepts versioned reports and rejects malformed scores. Legacy records
without reports still load. Larger backups are supported up to 10 MB.

Reports are deterministically computed in the browser and remain client-submitted,
not server-attested/proctored grades. Firebase Rules enforce ownership, immutable
session writes and bounded report metadata; they do not certify aircraft performance.
No AI generates flight metrics or teaching-score arithmetic. Real-service Rules
publication still requires the user's configured Firebase project.

## Validation

`npm test` covers perfect and degraded traces, heading wraparound, absent sensors,
phase delays, recording gaps, partial coverage, sample-rate independence, recall,
report validation and backup compatibility. Browser tests exercise recorded difference
replay, deviation overlays, completed rehearsal reports, replay without duplicate
session logging, and history. The Firebase suite verifies private report persistence
and recovery across fresh browser contexts, plus report-version rejection.
