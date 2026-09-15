# Server task timers and management date correctness

## Scope

This change implements the two requested follow-ups: durable server-authoritative task timing and management overnight/date-filter correctness. Desktop shutdown detection, screenshots, compensation, and new approval modules are not included.

## Timing contract

- Each task can run independently. Multiple simultaneous task timers are permitted; their sum is not used as attendance or capped to attendance hours.
- Start/Resume opens a server-timestamped running segment. Pause banks that segment in **milliseconds**; paused gaps are excluded. Display/report minutes are floored only when projected, not when banking segments.
- Refresh, route changes, tab closure and localStorage corruption do not stop or reconstruct server timers. Polling, focus/online refresh and cross-tab invalidation reload authorized server state.
- Attendance In and End Break permit manual task Resume. They never automatically resume all tasks. Out and Take Break pause all running tasks in the same database transaction as the attendance transition.
- Done closes the timer using server time and records 100% completion plus immutable completion evidence. Reopen requires a reason and preserves prior time/completion cycles. A zero-minute task may be completed without inventing a start time; positive saved time without start evidence is rejected for review.
- The **existing task midnight-pause policy remains unchanged**: a segment stops accruing at the next Asia/Dhaka midnight, even while the browser is closed. Reads project that cutoff; the next timer/lifecycle/attendance write durably settles it. Attendance itself does not stop at 7 PM or midnight. Overnight task continuation would be a separate business-rule change.
- Administrative attendance recovery stops current timers if it leaves no working attendance session. It does not retrospectively rewrite already-recorded task evidence to match corrected attendance times; the reviewer and correction remain audited.

## Integrity and concurrency

- `task_timer_states`: one state per task/report day, exact banked time, current running start, revision counter and last command identity. A partial unique index permits only one open day per task.
- Task writes lock the employee first, then the task. Attendance uses the same employee lock. Expected account, workday and server revision are rechecked inside the transaction.
- Duplicate acknowledgements are recoverable. Old Pause/Done commands cannot act on a later Resume/Reopen cycle. Clients do not resend an uncertain write with a newly fetched revision.
- Start/Pause events and durations are appended to `task_timeline_entries`. Notes do not control elapsed time or task status. Legacy report-based client-time writes are rejected.
- Current task minutes are projected consistently into work plans, assignment views, reports, management totals and read-only task details. Filtered-out work-plan rows remain subscribed so Active/Completed counts synchronize across tabs.

## Management attendance and dates

- Attendance totals belong to the original attendance workday and include the full overnight session. The same overnight hours are not charged again to the next workday.
- Live presence separately checks open attendance from any workday; a closed/missing record for today cannot hide yesterday's still-open session. Meeting heartbeat follows that same open-session lookup.
- Employee task details cannot read updates beyond the selected end date. History includes legacy completion evidence as well as immutable activity events, with returned events bounded to the selected dates.
- Invalid/reversed/excessive date ranges are rejected. Oversized detail queries fail explicitly rather than silently returning a partial total.

## Local migration and deployment

1. `node scripts/migrate-task-timer-schema.cjs` performs a rollback-only dry run and compares fingerprints of existing accounts, tasks, updates, attendance sessions and activity evidence.
2. `node scripts/migrate-task-timer-schema.cjs --apply` accepts loopback databases only, creates a custom-format backup under ignored `.local-backups/`, verifies its table-data listing, applies the additive SQL and rechecks fingerprints. No historical time is backfilled or guessed.
3. `npx prisma generate`; restart the web process so an old global Prisma client is not retained. Reload already-open browser pages for the new API contract.
4. For a remote deployment, review/apply `prisma/migrations/0011_server_task_timers/migration.sql` using the normal backup and maintenance procedure before serving this code. The local helper intentionally refuses remote databases. Avoid a mixed old/new frontend rollout.

Legacy cutover imports only **already saved** daily minutes/start/end evidence when a task is next acted on. Unsaved old browser timers are not trusted or silently added; old browser cache contents are not deleted. Review any such unsaved work before a production cutover, then explicitly Resume as appropriate.

The local database was backed up and migrated, and the verified workspace development server was restarted. No employee task/attendance actions were generated against real accounts during testing.

## Verification commands

- `npm test`
- `npx tsc --noEmit --pretty false`
- `node scripts/check-attendance-postgres.cjs` (disposable PostgreSQL only, including task timer races, rollback, missing-start and midnight behavior)
- `node scripts/check-task-workflow.cjs` (real React/browser components, synthetic transport)
- `node scripts/check-attendance.cjs`
- `node scripts/check-management.cjs`
- `node scripts/check-header-meeting.cjs`
- `npm run build`

The existing cached Webpack build failure also occurred during verification; generated caches were preserved under `.next/cache/webpack/*.timer-backup-*`, and a fresh-cache production build succeeded. This is not a claim that every unrelated project issue has been eliminated.

## Verified result (2026-09-14)

- 279 unit tests across 25 files passed.
- 23 isolated PostgreSQL tests passed; the disposable cluster and synthetic data were removed by the test runner.
- Task-workflow, attendance, management and header-meeting browser checks passed.
- TypeScript, Prisma schema validation and changed implementation-file lint checks passed.
- The final production build passed with all 48 static pages generated.
- The restarted local login page returned HTTP 200, with no development-server stderr output at the final check.
- Windows runtime logs now reside under ignored `node_modules/.cache/worklog-dev/`, outside the build cleanup directory, resolving the temporary log-file lock encountered during verification.
- No commit or push was performed in this implementation turn.

## Follow-up audit fixes (2026-09-14)

- Assignment controls now derive completion status, completion evidence and timing from the shared server timer store instead of a one-time local status copy. Cross-tab Done/Reopen and fresh mounts with stale props stay synchronized without replacing the local submission draft or selected files.
- Assignment writes are disabled while confirmed timer state is loading or synchronization has failed. A visible status message explains the unavailable state; normal focus/online/polling synchronization restores the controls.
- A zero-time Done displays its saved completion timestamp without inventing a start time. Completed start/end display no longer rejects server timestamps based on the viewer's `Date.now()`; invalid ranges, malformed evidence and report-day boundaries remain checked.
- The new unit and browser regressions first reproduced the original failures and then passed with the fixes. Browser coverage includes cross-tab review submission after completion/reopen, completion-note display, draft/file retention, fresh-mount stale props, sync-failure recovery, zero-time Done, and clocks behind/ahead.
- Final follow-up checks: **291 unit tests / 25 files**, **23 isolated PostgreSQL tests**, task-workflow/management/attendance browser suites, TypeScript, changed TypeScript-file ESLint and `git diff --check` all passed.
- This follow-up did not modify employee data or the database schema. No additional production build, commit or push was performed; the production build recorded above belongs to the preceding implementation verification.

## Stale lifecycle dialog fix (2026-09-14)

- Dashboard and Assignment Done/Reopen dialogs now capture an immutable server revision, account and report day when opened. Save and repeated Save use that opening context; Reopen no longer fetches a newer revision before writing.
- Recovery reads can update the background page but never replace an open dialog's target. The existing transactional server revision check rejects stale requests. Closing, reviewing the current task and explicitly opening a new dialog establishes a new target.
- Dialog title and completion evidence remain bound to the opened record, and failed saves retain the user's note/reason with an inline error. Reopen error content remains scrollable within small viewports.
- Permanent browser regression coverage first reproduced the old bug, then passed for both actions on both pages with live and delayed synchronization, repeated stale Save, retained drafts/evidence and an explicitly confirmed fresh action (8 cases). Two additional cases verify live seconds/polling do not invalidate normal Done or truncate server-tracked time.
- Final checks: **300 unit tests across 25 files**, **25 disposable PostgreSQL tests**, the expanded task-workflow browser suite, management browser suite, TypeScript and changed-file whitespace checks passed. PostgreSQL tests assert stale Done/Reopen cannot change the new cycle or append activity/timeline records.
- ESLint reported zero errors and the two existing modal effect-reset advisory warnings. No employee records, production schema, commit or push were changed in this follow-up; no additional production build was run.
