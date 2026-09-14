"use client";

import { useEffect, useState } from "react";
import { ATTENDANCE_UPDATED_EVENT, type AttendanceEnvelope } from "@/lib/attendance-client";
import { calculateSegmentedAttendanceMetrics } from "@/lib/attendance-policy";
import type { DashboardAttendanceSnapshot } from "@/lib/contracts/user";
import { CalendarCheck2 } from "lucide-react";
import { extractAttendanceOvertimeMeta } from "@/lib/attendance-overtime";
import { DashboardWorkdayTimer } from "@/components/dashboard/dashboard-workday-timer";
import { PageHeader } from "@/components/dashboard/page-header";
import { PanelHeader } from "@/components/dashboard/panel-header";
import { formatMinutes, toDateOnly } from "@/lib/utils";

type AttendanceItem = {
  userId: string;
  name: string;
  email: string;
  role: string;
  avatarUrl?: string | null;
  departmentName: string;
  attendance: {
    id: string;
    attendanceDate: Date;
    revision: string;
    status: "present" | "late" | "half_day" | "absent" | "remote";
    checkInAt: Date | null;
    checkOutAt: Date | null;
    active: boolean;
    onBreak: boolean;
    currentSessionStartedAt: Date | null;
    currentBreakStartedAt: Date | null;
    breakMinutes: number;
    presenceMinutes: number;
    activeMinutes: number;
    outsideMinutes: number;
    includedBreakMinutes: number;
    excessBreakMinutes: number;
    overtimeMinutes: number;
    workingMinutes: number;
    legacyBreakMinutes: number;
    note: string | null;
    workSessions: Array<{ id: string; startedAt: Date; endedAt: Date | null; endReason: string | null }>;
    breakSessions: Array<{ id: string; startedAt: Date; endedAt: Date | null; endReason: string | null }>;
  } | null;
};

export function AttendancePanel({
  currentUserId,
  items = [],
}: {
  userRole: "employee" | "admin" | "team_head" | "super_admin" | "moderator";
  currentUserId: string;
  items: AttendanceItem[];
}) {
  const me = items.find((item) => item.userId === currentUserId);
  const attendanceMeta = extractAttendanceOvertimeMeta(me?.attendance?.note);
  const timerSnapshot = me?.attendance
    ? {
        attendanceDate: toDateOnly(me.attendance.attendanceDate),
        revision: me.attendance.revision,
        status: me.attendance.status,
        note: attendanceMeta.text,
        breakMinutes: me.attendance.breakMinutes,
        legacyBreakMinutes: me.attendance.legacyBreakMinutes,
        checkInAt: me.attendance.checkInAt?.toISOString() ?? null,
        checkOutAt: me.attendance.checkOutAt?.toISOString() ?? null,
        active: me.attendance.active,
        onBreak: me.attendance.onBreak,
        currentSessionStartedAt: me.attendance.currentSessionStartedAt?.toISOString() ?? null,
        currentBreakStartedAt: me.attendance.currentBreakStartedAt?.toISOString() ?? null,
        workSessions: me.attendance.workSessions.map((session) => ({
          id: session.id,
          startedAt: session.startedAt.toISOString(),
          endedAt: session.endedAt?.toISOString() ?? null,
          endReason: session.endReason,
        })),
        breakSessions: me.attendance.breakSessions.map((session) => ({
          id: session.id,
          startedAt: session.startedAt.toISOString(),
          endedAt: session.endedAt?.toISOString() ?? null,
          endReason: session.endReason,
        })),
      }
    : null;

  const [live, setLive] = useState<{ snapshot: DashboardAttendanceSnapshot | null; clockOffset: number } | null>(null);
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const update = (event: Event) => {
      const detail = (event as CustomEvent<{ userId: string; envelope: AttendanceEnvelope }>).detail;
      if (detail?.userId === currentUserId) {
        const receivedAt = Date.now();
        setNow(receivedAt);
        setLive({ snapshot: detail.envelope.snapshot, clockOffset: new Date(detail.envelope.serverNow).getTime() - receivedAt });
      }
    };
    const interval = window.setInterval(() => setNow(Date.now()), 1000);
    window.addEventListener(ATTENDANCE_UPDATED_EVENT, update);
    return () => { window.clearInterval(interval); window.removeEventListener(ATTENDANCE_UPDATED_EVENT, update); };
  }, [currentUserId]);
  const current = live ? live.snapshot : timerSnapshot;
  const metrics = calculateSegmentedAttendanceMetrics({
    attendanceDate: current?.attendanceDate ?? toDateOnly(), workSessions: current?.workSessions ?? [],
    breakSessions: current?.breakSessions ?? [], legacyBreakMinutes: current?.legacyBreakMinutes ?? 0,
    now: new Date(now + (live?.clockOffset ?? 0)),
  });
  const note = extractAttendanceOvertimeMeta(current?.note).text;

  return (
    /* One screen: the page never scrolls and the title stays fixed; the panels
       below scroll inside their own area, which is what keeps a long team list
       from pushing the layout past the viewport. */
    <div
      className="flex flex-col gap-2 min-[900px]:min-h-0 min-[900px]:flex-1 min-[900px]:overflow-hidden"
      data-fit-viewport
    >
      <PageHeader
        action={
          <DashboardWorkdayTimer
            currentUserId={currentUserId}
            initialAttendance={timerSnapshot}
            mode="button"
          />
        }
        icon={CalendarCheck2}
        subtitle="Use In when you enter, Out when you leave, and Take Break for lunch or rest."
        title="Attendance"
      />

      <div
        className="dashboard-accent accent-emerald flex min-h-0 flex-1 flex-col rounded-[1.25rem] border border-[var(--panel-border)] bg-[var(--panel)] p-2.5 shadow-[var(--shadow)]"
        data-dashboard-panel
      >
        <PanelHeader icon={CalendarCheck2} title={current?.active && current.attendanceDate !== toDateOnly(new Date(now + (live?.clockOffset ?? 0))) ? "Active Attendance" : "Today's Attendance"} tone="bg-emerald-500/10 text-emerald-500" />
        <div className="dashboard-scroll-area mt-2 min-h-0 flex-1 space-y-3 pr-0.5">
          <div className="grid gap-2 sm:grid-cols-2 xl:grid-cols-5">
            {[
              ["Counted Work", formatMinutes(metrics.workingMinutes)],
              ["Active Work", formatMinutes(metrics.activeMinutes)],
              ["Included Break", formatMinutes(metrics.includedBreakMinutes)],
              ["Outside Gap", formatMinutes(metrics.outsideMinutes)],
              ["Overtime", formatMinutes(metrics.overtimeMinutes)],
            ].map(([label, value]) => (
              <div className="rounded-xl border border-[var(--panel-border)] bg-[var(--panel-muted)] px-3 py-2.5" key={label}>
                <p className="text-[0.6rem] font-bold uppercase tracking-[0.14em] text-[var(--muted-foreground)]">{label}</p>
                <p className="mt-1 font-mono text-base font-bold tabular-nums text-[var(--foreground)]">{value}</p>
              </div>
            ))}
          </div>
          <div className="rounded-xl border border-[var(--panel-border)] p-3 text-sm">
            <p>Status: {current?.status?.replace('_', ' ') ?? 'Not checked in'}</p>
            {note ? <p className="mt-1 text-[var(--muted-foreground)]">{note}</p> : null}
            <p className="mt-2 text-xs text-[var(--muted-foreground)]">Attendance is recorded from your In, Out and Break sessions. Corrections require authorized management review.</p>
          </div>
          {(metrics.excessBreakMinutes) > 0 ? (
            <div className="rounded-xl border border-amber-500/30 bg-amber-500/10 px-3 py-2 text-[0.78rem] text-amber-700">
              Excess break deducted: {formatMinutes(metrics.excessBreakMinutes)}.
            </div>
          ) : null}
        </div>
      </div>
    </div>
  );
}
