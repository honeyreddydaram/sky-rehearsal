# Delivery order

Prioritize Firebase and Google Cloud services for all remaining milestones. See
[cloud direction](google-cloud.md). Implement and validate one milestone per change before advancing. Prefer small,
readable functions and existing tested logic over new abstractions.

1. **Production foundation:** React/TypeScript shell, domain folders, locally bundled Cesium, FastAPI/PostgreSQL foundation, reproducible checks and build. Existing engine JavaScript migrates incrementally with its features.
2. **Circuit flight engine:** reviewed airport/runway circuit data drives simulation; keep legacy geometry secondary. Resolve missing coordinates before representing the circuit as real.
3. **Recorded-flight twin:** GPX/CSV import, normalized timed tracks, ideal/recorded/rehearsed comparison and replay.
4. **Accounts and cloud data:** Firebase Authentication, server-enforced roles, Firestore persistence and Cloud Storage flight tracks.
5. **Training engine:** guided/practice/landmark/decision/quiz/exam modes and progressive assistance.
6. **Scoring and debrief:** deterministic metrics, replayable mistakes and competency feedback.
7. **AI instructor:** structured observations, progressive coaching, explanations; never AI physics or scores.
8. **Weather, aircraft and radio:** sourced weather, reviewed aircraft profiles and communication practice.
9. **Instructor platform:** assignments, student review and instructor-approved scenarios.
10. **Launch:** airport packages, Firebase Hosting / Google Cloud Run deployment, tenant isolation, operations, mobile support and measured private beta.

Each milestone needs behavior tests, clear run instructions, and an explicit account
of unverified aviation data or external-service limitations. A scaffold is not the
completed feature it prepares for.
