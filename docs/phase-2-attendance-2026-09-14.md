# Phase 2: attendance validation and calculation

Date: 2026-09-14

## Business rules retained

- Office schedule is 10:00–19:00 Asia/Dhaka; scheduled duty is 540 minutes.
- Each In/Out creates an independent office session. Out does not permanently complete the day; In Again remains available.
- Explicit breaks share one 45-minute included allowance per attendance record, not per break or office entry. Excess break is deducted from Counted Work.
- Outside gaps between office sessions do not count as work. Active Work excludes all break time; Counted Work includes the allowed break.
- Overtime is active office time after 19:00, excluding explicit breaks and outside gaps. It is not the same as Counted Work exceeding nine hours.
- Attendance never auto-stops at 19:00 or midnight. An overnight open session remains attached to its original attendance date until Out. The next In starts today's record.

Example: In 10:00, lunch 14:00–14:45, Out 16:00, In 17:00, Out 19:00 produces Counted Work 8h, Active Work 7h15m, Included Break 45m and Outside Gap 1h. Staying until 20:00 produces Counted Work 9h, Active Work 8h15m and post-19:00 Overtime 1h.

## Changes

- Employee actions record the server's current timestamp, including seconds. The client no longer submits editable timestamps, status, note or owner. Legacy client timestamps are never used as recorded time; stale/future ones are rejected.
- Authentication failures return JSON 401 rather than a login-page redirect. Cross-origin writes, inactive accounts, privileged detail edits and device-shutdown writes are rejected.
- An employee row lock is acquired before reading attendance records, followed by a fresh record read under its row lock. This covers first In and different attendance dates, not only an already-existing day.
- Every action includes the revision of the snapshot the employee saw. Revision checks prevent stale/replayed Out or End Break from closing a later session. Conflicts do not automatically replay the request.
- Session identity and timestamps are included in revisions, so same-millisecond actions do not depend only on a record timestamp changing.
- In/Break transitions validate ordering, overlap, active-session eligibility and break containment. Out during a valid break closes both sessions with the same server timestamp.
- Employee actions cannot rewrite closed historical attendance. Authorized correction validation accepts a next-day break inside an overnight office session and rejects impossible calendar dates.
- Calculation intersects explicit breaks with office presence, merges overlapping intervals for safe reads, clips future intervals and computes exact durations before flooring displayed minutes. Counted seconds remain available for the live timer.
- A shared serializer supplies the Dashboard, header, API and Attendance page. The Attendance page shows an existing overnight active record instead of incorrectly showing a new empty day.
- Controls synchronize on initial load, focus, visibility, cross-tab notifications and periodic reads. Confirmed snapshots update the live Attendance page totals.
- Failed/malformed/redirected responses do not fabricate success. Lost-response recovery reads the actual server state. Request timeouts and in-flight guards prevent indefinitely stuck or duplicate client saves.
- Snapshot receipt samples client and server time together, avoiding a one-minute display dip immediately after Out.

## Verification

- `npm test -- --reporter=dot`: 252 tests passed across 21 files after the audit follow-up.
- `npm run typecheck`: passed.
- `npm run test:attendance:browser`: passed (real controls with synthetic transport: two tabs, overnight attendance, stale-account rejection, explicit recovery confirmation, failed-save draft retention and timestamp precision).
- `npm run test:attendance:postgres`: 10 real-PostgreSQL integration tests passed in a disposable local cluster.
- `npm run test:task-workflow:browser`: passed; Phase 1 Dashboard/Assignments/Add Task flows still work.
- Targeted attendance lint: no errors or warnings. The six pre-existing unused-variable warnings in `worklog.ts` were not part of this cleanup.
- `npm run build`: both a fresh-cache build and a subsequent cached build passed, including all 47 static pages.
- `git diff --check`: passed.

Browser checks use real React components with synthetic transport and isolated browser storage. Unit service tests use a serialized in-memory database double. The separate PostgreSQL runner exercises the actual API handlers and Prisma adapter against a fresh loopback-only cluster with synthetic users. It verifies concurrent first In, concurrent cross-date corrections, correction versus In, open-record recovery, scoped HR permission checks, UUID tie ordering, account-switch rejection, and transaction rollback when audit insertion fails. The temporary cluster is stopped and removed after the test. No real employee record was read, created, edited, deleted or backfilled by these tests.

The database tests emitted a pg client-query deprecation warning from the integration stack; all assertions passed. This is not a full-company load test or a staging deployment test.

The cached production build encountered the same internal error seen during Phase 1. The three production cache directories were preserved under `.next/cache/webpack/*.phase2-backup-20260914` and rebuilt. The audit follow-up preserved another occurrence under `*.phase2-safety-backup-20260914`. No dependency/configuration workaround disables production checks.

## Rollout and remaining scope

- No database migration or environment/dependency change is required. Deploy client and API together; stale browser tabs must refresh to obtain revision- and account-bound controls.
- Existing corrupt historical data is not silently repaired. Review/repair must be explicit; synthetic tests do not certify the contents of the live database.
- Isolated real-database concurrency tests passed. Staging acceptance, company-scale load testing, and review of existing production records remain necessary before company-wide rollout. No overall bug-free or production-readiness guarantee is implied.
- Durable server-side task timers, cross-device task recovery and task/attendance timing integration remain Phase 3. Management historical reporting/date-slice fixes remain in their agreed later phase.
- Desktop shutdown detection and screenshots were not changed. No commit, push or deployment is part of this implementation turn.

## Audit follow-up: four reproduced gaps fixed

- Account binding: personal attendance POST now requires expectedUserId to match the authenticated session before any transaction. The client verifies the returned account and attendance date. This is a precondition, never an editable owner field.
- Cross-date integrity: all correction and personal-action writers acquire the same employee row lock before the attendance record lock. Corrections reread scoped access and compare session-inclusive revisions after locking. Proposed work intervals cannot overlap any other attendance date; touching boundaries and zero-duration evidence do not occupy overlapping time. A new In also checks other records.
- Recovery: the authorized correction form now accepts stuck/open records. Reviewers must enter explicit end times, retain every original session ID, give a reason, and confirm closing open sessions. Employee self-service cannot invoke recovery; non-super-admin self-correction remains prohibited. Original values are saved atomically in the audit log, and the corrected aggregate/metadata uses the shared attendance serializer.
- Deterministic timing: equal timestamps and zero-duration evidence no longer make Out depend on UUID/database ordering. Correction fields preserve seconds and milliseconds instead of truncating all timestamps to minutes.
- Regression-first evidence: the initial new checks produced nine failures before implementation; those cases and additional boundary/authorization cases now pass. The four findings are addressed; this does not certify unrelated future phases or all live database contents.
