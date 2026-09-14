# Phase 1: unified personal task workflow

Date: 2026-09-14

## Implemented

- Add Task now contains task planning only. Removed the obsolete Time Tracker form and the unused duplicate work-plan component. No database records were deleted.
- Dashboard and Assignments share the same Start/Pause/Resume control and the same Done/Reopen request helpers.
- Removed the assignment editor's manual status, percentage, tracked-minute, start/end editing and reset path. Done remains 100%; Reopen requires a reason.
- Opening or cancelling Done does not pause the task. A confirmed successful completion stops its local timer; failed requests preserve the timer state and completion note.
- Start/Pause commit client state only after a valid successful server response. Redirected, empty, HTML and malformed JSON responses are not treated as successful saves.
- Done/Reopen responses now include the saved date, status, tracked minutes, timestamps and note. Both clients apply that confirmed state instead of inventing an end time or reopen state.
- Same-page overlapping requests for the same task are rejected while independent tasks may save concurrently.
- Live timer samples carry their sampling time so completing from a live sample does not count the current running segment twice.
- Assignment Save Work saves progress notes without pausing. Submit for Review does not implicitly complete the task. Completed submissions use the review endpoint without rewriting completion through the report endpoint. Existing automatic review creation on assigned-task completion is unchanged.
- Active-task ordering uses reactive start-time state, not render-time ref reads; ticking alone does not reorder tasks.
- Browser storage failure no longer converts a confirmed server completion into a reported save failure. Storage remains a cache, not a durable timer ledger.

## Verification

- `npm test -- --reporter=dot`: 159 tests passed across 17 files.
- `npm run typecheck`: passed.
- `npm run test:task-workflow:browser`: passed for Dashboard, Assignments and Add Task.
- Targeted ESLint: no errors; three effect/state warnings remain in existing modal/assignment initialization code. This is not a claim that repository-wide lint is warning-free.
- `npm run build`: passed, including TypeScript, all 47 static pages and final route generation.

During verification, the existing production Webpack cache caused an internal `WasmHash._updateWithBuffer` error. Its three cache directories were renamed to recoverable `.phase1-backup-20260914` directories under `.next/cache/webpack`; both a fresh-cache build and a subsequent cached build passed. No dependency or application configuration was changed to bypass build checks.

The browser suite renders the real React components with synthetic request responses in isolated browser contexts. It checks failed Start/Pause, Resume, Done cancellation, failed completion note retention, completion, failed/successful Reopen, read-only time fields, and review submission after completion. It does not log in as an employee or change real task/attendance data. It requires the local web server at `http://localhost:3000` for CSS and an installed Microsoft Edge browser.

Unit tests cover overlapping writes, independent tasks, live-sample timing, request failure/malformed-response handling, cache safety, and the lifecycle response contract. These checks do not replace later real-database concurrency tests.

## Explicitly deferred

- Attendance transition validation, backdated actions, break eligibility and attendance calculations (Phase 2).
- Authoritative server-side task timer sessions, cross-tab/device concurrency, sub-minute durability, offline recovery and the completion endpoint's missing-start-time validation gap (Phase 3).
- Overnight management totals/live status, date-filter correctness, historical fallback, reporting/access hardening and the remaining agreed phases.
- Desktop behavior, screenshot monitoring, dependency upgrades and database migrations.

Phase 1 is not an overall production-readiness sign-off. No commit, push or deployment is included in this change.
