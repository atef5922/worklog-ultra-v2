# Management dashboard implementation - 13 September 2026

## Implemented

1. Five-role compatibility and personal workspaces: Super Admin, Moderator, Admin/HR, Team Head and Employee. Management access is an individual gate with explicit permissions and scopes, not a role-wide entitlement. Fresh server-side authorization is used for management actions; account/role safeguards preserve the last active Super Admin.
2. Reference-inspired management dashboard: employee/department/date/status/priority/search filters, seven KPI cards, attention indicators, paginated task table, employee and department completion summaries, weekly task states, live team state and attendance summary. Table, KPI and export calculations share one data service.
3. Task planning: optional Project, Client, Deadline, Estimated Minutes and checklist/subtasks. Use **Plan** beside a personal task or in the management table. Assigned employees can check existing items but cannot rewrite assigned planning. Management changes require a reason and an optimistic version check.
4. Completion: Done is 100%; incomplete checklists block Done; a fully checked checklist still requires explicit Done. Completion retries do not create another cycle. Reopen requires a reason and preserves completion evidence, including legacy completion data before changing a current-day record.
5. History is read-only with date filtering and Details. Details show daily records, completion/reopen evidence, planning/checklist and the event timeline. Recorded task/continuation deletion is blocked. Report/timer writes cannot undo completion.
6. PDF and Excel downloads are available. Personal PDF/Excel rows use the same report summary as the personal report page. Management dashboard exports preserve the applied filters and permission boundary. PDF rendering uses separate Latin and Bengali font runs.
7. Employee-profile changes, assignment creation, department/notice actions and attendance corrections are permission-checked, with audit records where applicable. Profile editing cannot alter roles, access grants or departments.
8. Local schema migrations are additive and backup-first. Desktop packaging includes migrations 0009 and 0010 and verifies a database backup before these upgrades.

## Definitions and intentional exclusions

- A task is overdue only when unfinished and past its deadline. Urgent means due within the next 24 hours. Historical dashboard deadline calculations are evaluated at the selected period end, not a future wall-clock date.
- Progress is completed checklist items / all checklist items. No checklist means no fabricated percentage. Completed tasks display 100%.
- Dashboard **Saved time** means recorded task minutes. It is not attendance duration and is not an assertion that a person was continuously active at their computer. Multiple task timers remain independent.
- Live work state is derived from recorded attendance, task and manual meeting events. Available does not mean idle. The browser sends a heartbeat every 30 seconds; a heartbeat older than 120 seconds is shown as stale/last seen. The dashboard refreshes every 20 seconds while visible.
- Connection loss does not stop or deduct attendance. Native device-idle detection and guaranteed PC-shutdown detection are not part of this change.
- Present in period means an employee has at least one recorded office session in the selected period. Late is a subset of checked-in employees. A missing record is not automatically labelled absence or leave.
- Weekly status chart uses the employee/department scope and seven dates ending at the selected To date. Status/priority/search filters apply to the task table and task summaries; the chart explicitly states this distinction.
- Salary/compensation, new screenshot features, and the four new approval modules (Leave, Timesheet, Expense Claim, Project Access) remain excluded. Existing assignment review records are preserved.
- Existing task titles, project names and checklists are current metadata in historical-period summaries. Immutable completion/timeline snapshots provide evidence where recorded; older unrecorded changes are not invented.

## Validation

- TypeScript checks and production build passed on Next.js 16.3.5.
- 140 automated tests cover role/scope boundaries, completion/reopen, planning versions, report write guards, attendance calculations, login/session behavior, dashboard totals and exports.
- Headless browser tests use synthetic records and a separate profile, not the user's real login. Management tests cover 1600x900, 1365x768 and 390x844, pagination, sorting, export links, live-list expansion and empty state. Sidebar tests cover desktop/mobile, short-height navigation, hover/collapse, toggle exclusion and role-aware menus.
- Read-only PostgreSQL smoke tests passed for management dashboard, report and employee-detail query shapes and a disabled management gate. No test login sessions or employee records were created by that check.
- PDF sample pages were rendered and inspected; English labels, Bengali text and numeric values are readable. Excel formula-like task text remains text, not an executable spreadsheet formula.
- Existing account, attendance and task evidence was fingerprint-checked before and after the additive local migration.

## Release cautions

- Next.js was updated from 16.2.4 to 16.3.5 after verifying the Windows-hosted server advisory: https://github.com/advisories/GHSA-p293-qw3h-jr36 . The local dev server was restarted to load the patched version.
- Compatible dependency fixes were applied without `--force`. The final audit still reported 9 findings (1 low, 4 moderate, 4 high), but no critical finding. Prisma/tooling and ExcelJS dependency advisories need separate review; the audit's suggested breaking downgrades were not applied.
- Real-user acceptance tests across all five roles, multi-device/offline timing scenarios and packaged desktop upgrade/shutdown behavior must be verified in staging before production rollout. Passing the tests above is not a guarantee of zero defects or a completed security certification.
- Existing task timing remains browser-originated with server-side bounds, ownership and transition checks. A fully server-authoritative, durable timer-session ledger is a separate hardening step before treating task minutes as tamper-proof evidence.
- Task/employee result limits fail explicitly instead of silently truncating dashboard calculations. Workspaces above 5,000 scoped employees or 20,000 scoped task records require paginated aggregation work.

## Commands

```text
npm run typecheck
npm test
npm run build
npm run test:sidebar:browser
npm run test:management:browser
node scripts/check-management-data.cjs
node scripts/migrate-dashboard-schema.cjs          # rollback-only dry run
node scripts/migrate-dashboard-schema.cjs --apply  # verified backup, then commit
```

No production deployment or git commit was performed as part of this request.
