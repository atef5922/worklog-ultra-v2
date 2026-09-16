import Link from "next/link";
import { redirect } from "next/navigation";
import { Activity, CalendarDays, CircleCheck, Clock3, Timer, TriangleAlert, Users } from "lucide-react";
import { requireUser } from "@/lib/auth/server";
import { can, canViewAttendanceDetails, isSuperAdmin } from "@/lib/auth/policy";
import { attendanceOverview, ATTENDANCE_ATTENTION, ATTENDANCE_ROW_STATUSES } from "@/lib/management/attendance-overview";
import { formatDateTimeInDhaka, formatMinutes } from "@/lib/utils";
import { AttendanceAutoFilters } from "@/components/management/attendance-auto-filters";
import { AttendanceDetailsButton } from "@/components/management/attendance-details-button";
import styles from "./attendance-table.module.css";

const inputClass = "h-8 min-w-0 w-full rounded-lg border border-[var(--panel-border)] bg-[var(--panel)] px-2 text-xs text-[var(--foreground)]";
const labelClass = "flex min-w-0 flex-col gap-1 text-[0.68rem] font-medium text-[var(--foreground)]";
const titles: Record<string, string> = {
  checked_in: "Checked in", on_break: "On break", checked_out: "Checked out",
  auto_out: "Auto Out", not_checked_in: "Not checked in", absent: "Absent",
  off_day: "Off day", leave: "Approved leave", worked_off_day: "Worked on off day",
  scheduled: "Upcoming",
  pending_auto_close: "Pending auto-close",
  late: "Late In", excess_break: "Excess break", overtime: "Overtime",
};
const time = (value: Date | null) => value ? formatDateTimeInDhaka(value) : "—";
const plain = (value: string) => value.replaceAll("_", " ").replace(/\b\w/g, character => character.toUpperCase());

export default async function ManagementAttendancePage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | undefined>>;
}) {
  const actor = await requireUser();
  if (!canViewAttendanceDetails(actor)) redirect("/dashboard");
  const input = await searchParams;
  const params = new URLSearchParams(Object.entries(input).filter((entry): entry is [string, string] => typeof entry[1] === "string"));
  let data: Awaited<ReturnType<typeof attendanceOverview>>;
  try {
    data = await attendanceOverview(actor, params);
  } catch (error) {
    return <section role="alert" className="rounded-xl border border-[var(--panel-border)] bg-[var(--panel)] p-5"><h1 className="text-xl font-bold">Attendance unavailable</h1><p className="mt-2">{error instanceof Error ? error.message : "Could not load attendance."}</p><Link className="mt-3 inline-block text-indigo-600" href="/management/attendance">Reset filters</Link></section>;
  }
  const query = new URLSearchParams(params);
  query.set("from", data.from);
  query.set("to", data.to);
  query.delete("page");
  const reportQuery = new URLSearchParams(query);
  reportQuery.delete("status");
  reportQuery.delete("attention");
  const detailedReportQuery = new URLSearchParams(reportQuery);
  detailedReportQuery.set("detail", "1");
  const pageUrl = (page: number) => {
    const next = new URLSearchParams(query);
    next.set("page", String(page));
    return `/management/attendance?${next}`;
  };
  const canExport = can(actor, "reports.export");

  const kpis = [
    { label: "Employee-days", value: data.total, icon: Users, tone: "text-indigo-600 bg-indigo-50" },
    { label: "Recorded", value: data.totals.recorded, icon: CircleCheck, tone: "text-emerald-600 bg-emerald-50" },
    { label: "Working now", value: data.totals.checkedIn, icon: Activity, tone: "text-sky-600 bg-sky-50" },
    { label: "Absent", value: data.totals.absent, icon: TriangleAlert, tone: "text-rose-600 bg-rose-50" },
    { label: "Off-day work", value: data.totals.offDayWork, icon: CalendarDays, tone: "text-violet-600 bg-violet-50" },
    { label: "Counted work", value: formatMinutes(data.totals.countedMinutes), icon: Clock3, tone: "text-blue-600 bg-blue-50" },
    { label: "Overtime", value: formatMinutes(data.totals.overtimeMinutes), icon: Timer, tone: "text-amber-600 bg-amber-50" },
  ];

  return <div className="flex min-h-0 min-w-0 flex-col gap-2 min-[900px]:h-full min-[900px]:overflow-hidden" data-fit-viewport>
    <header className="flex shrink-0 flex-wrap items-center justify-between gap-2">
      <div><h1 className="text-lg font-bold">Management Attendance</h1><p className="text-[0.68rem] text-[var(--muted-foreground)]">{isSuperAdmin(actor) ? "Full company" : "Your permitted employees"} · Asia/Dhaka · Friday is the default off day.</p></div>
      <div className="flex items-center gap-2 text-xs">
        <a className="px-2 py-1.5 font-medium text-indigo-600 hover:underline" href="/management/attendance">Reset filters</a>
        {canExport && <details className="relative z-20">
          <summary className="cursor-pointer rounded-lg border border-[var(--panel-border)] bg-[var(--panel)] px-2.5 py-1.5 font-medium">Export report</summary>
          <div className="absolute right-0 top-full mt-1 flex w-48 flex-col rounded-lg border border-[var(--panel-border)] bg-[var(--panel)] p-1 shadow-lg">
            <a className="rounded px-2 py-1.5 hover:bg-slate-100" href={`/api/management/attendance/export?${reportQuery}&format=xlsx`}>Summary Excel</a>
            <a className="rounded px-2 py-1.5 hover:bg-slate-100" href={`/api/management/attendance/export?${reportQuery}&format=pdf`}>Summary PDF</a>
            <a className="rounded px-2 py-1.5 hover:bg-slate-100" href={`/api/management/attendance/export?${detailedReportQuery}&format=xlsx`}>Summary + day-wise Excel</a>
            <a className="rounded px-2 py-1.5 hover:bg-slate-100" href={`/api/management/attendance/export?${detailedReportQuery}&format=pdf`}>Summary + day-wise PDF</a>
          </div>
        </details>}
      </div>
    </header>
    <AttendanceAutoFilters>
      <label className={labelClass}>From<input className={inputClass} type="date" name="from" defaultValue={data.from} required /></label>
      <label className={labelClass}>To<input className={inputClass} type="date" name="to" defaultValue={data.to} required /></label>
      <label className={labelClass}>Department<select className={inputClass} name="departmentId" defaultValue={input.departmentId ?? ""}><option value="">All permitted</option>{data.departments.map(item => <option key={item.id} value={item.id}>{item.name}</option>)}</select></label>
      <label className={labelClass}>Team<select className={inputClass} name="teamId" defaultValue={input.teamId ?? ""}><option value="">All permitted</option>{data.teams.map(item => <option key={item.id} value={item.id}>{item.name}</option>)}</select></label>
      <label className={labelClass}>Employee<select className={inputClass} name="userId" defaultValue={input.userId ?? ""}><option value="">All permitted</option>{data.people.map(item => <option key={item.id} value={item.id}>{item.name}</option>)}</select></label>
      <label className={labelClass}>Search employee<input className={inputClass} name="q" defaultValue={input.q ?? ""} maxLength={100} placeholder="Name or email" /></label>
      <label className={labelClass}>Status<select className={inputClass} name="status" defaultValue={input.status ?? ""}><option value="">All statuses</option>{ATTENDANCE_ROW_STATUSES.map(item => <option key={item} value={item}>{titles[item]}</option>)}</select></label>
      <label className={labelClass}>Needs attention<select className={inputClass} name="attention" defaultValue={input.attention ?? ""}><option value="">All</option>{ATTENDANCE_ATTENTION.map(item => <option key={item} value={item}>{titles[item]}</option>)}</select></label>
    </AttendanceAutoFilters>
    <div className="min-w-0 shrink-0 overflow-x-auto">
      <div className="grid min-w-[950px] grid-cols-7 gap-2">
        {kpis.map(({ label, value, icon: Icon, tone }) => <div key={label} className="flex min-w-0 items-center gap-2 rounded-xl border border-[var(--panel-border)] bg-[var(--panel)] px-2.5 py-2 shadow-[0_2px_8px_rgba(15,23,42,0.04)]">
          <span className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-lg ${tone}`}><Icon aria-hidden="true" size={17} /></span>
          <div className="min-w-0"><p className="truncate text-[0.63rem] font-medium text-[var(--muted-foreground)]">{label}</p><strong className="block truncate text-sm leading-5">{value}</strong></div>
        </div>)}
      </div>
    </div>
    <section className="flex min-h-0 min-w-0 flex-1 flex-col rounded-xl border border-[var(--panel-border)] bg-[var(--panel)] p-2.5">
      <div className="mb-2 flex shrink-0 items-center justify-between"><h2 className="text-sm font-semibold">Daily records <span className="text-xs font-normal text-[var(--muted-foreground)]">({data.total})</span></h2><span className="text-[0.68rem] text-[var(--muted-foreground)]">Times in Asia/Dhaka</span></div>
      <div className="min-h-0 min-w-0 flex-1 overflow-auto overscroll-contain max-[899px]:max-h-[55vh]"><table aria-label="Daily attendance records" className={`${styles.table} w-full min-w-[1050px] text-left text-xs`}>
        <thead><tr>{["Date", "Employee", "Department / Team", "Status", "First In", "Last Out", "Counted", "Break", "Outside", "Overtime", "Details"].map(label => <th className="whitespace-nowrap px-2 py-1.5" key={label} scope="col">{label}</th>)}</tr></thead>
        <tbody>{data.pageRows.map(row => <tr key={`${row.date}:${row.employeeId}`} className="align-top">
          <td className="whitespace-nowrap px-2 py-1.5">{row.date}<small className="block text-[var(--muted-foreground)]">{row.dayKind !== "workday" ? row.dayKind === "off" ? "Off day" : "Leave" : "Workday"}</small></td>
          <td className="px-2 py-1.5"><Link className="font-semibold text-indigo-600" href={`/management/employees/${row.employeeId}?tab=attendance&from=${data.from}&to=${data.to}`}>{row.employeeName}</Link></td>
          <td className="px-2 py-1.5">{row.department}<small className="block text-[var(--muted-foreground)]">{row.team}</small></td>
          <td className="px-2 py-1.5"><strong>{titles[row.status]}</strong>{row.flags.length ? <small className="block text-amber-600">{row.flags.map(flag => titles[flag]).join(" · ")}</small> : null}</td>
          <td className="whitespace-nowrap px-2 py-1.5">{time(row.firstIn)}</td><td className="whitespace-nowrap px-2 py-1.5">{time(row.lastOut)}</td>
          <td className="px-2 py-1.5">{formatMinutes(row.countedMinutes)}</td><td className="px-2 py-1.5">{formatMinutes(row.breakMinutes)}</td><td className="px-2 py-1.5">{formatMinutes(row.outsideMinutes)}</td><td className="px-2 py-1.5">{formatMinutes(row.overtimeMinutes)}</td>
          <td className="px-1 py-1"><AttendanceDetailsButton details={{
            date: row.date, employee: row.employeeName, department: row.department, team: row.team,
            dayType: plain(row.dayKind), status: titles[row.status], flags: row.flags.map(flag => titles[flag]),
            reason: row.dayReason, firstIn: time(row.firstIn), lastOut: time(row.lastOut),
            counted: formatMinutes(row.countedMinutes), active: formatMinutes(row.activeMinutes),
            breakTime: formatMinutes(row.breakMinutes), outside: formatMinutes(row.outsideMinutes),
            overtime: formatMinutes(row.overtimeMinutes), offDayWork: formatMinutes(row.offDayWorkMinutes),
            workSessions: row.workSessions.map(session => ({ id: session.id, start: time(session.startedAt), end: time(session.endedAt), reason: session.endReason ? plain(session.endReason) : null })),
            breakSessions: row.breakSessions.map(session => ({ id: session.id, start: time(session.startedAt), end: time(session.endedAt), reason: session.endReason ? plain(session.endReason) : null })),
          }} /></td>
        </tr>)}</tbody>
      </table>{!data.pageRows.length && <p className="p-6 text-center text-sm text-[var(--muted-foreground)]">No employee-days match these filters.</p>}</div>
      <div className="mt-2 flex shrink-0 items-center justify-between text-xs"><span>Page {data.page} of {data.pageCount}</span><div className="flex gap-2">{data.page > 1 && <Link className="rounded-lg border border-[var(--panel-border)] px-2 py-1" href={pageUrl(data.page - 1)}>Previous</Link>}{data.page < data.pageCount && <Link className="rounded-lg border border-[var(--panel-border)] px-2 py-1" href={pageUrl(data.page + 1)}>Next</Link>}</div></div>
    </section>
  </div>;
}
