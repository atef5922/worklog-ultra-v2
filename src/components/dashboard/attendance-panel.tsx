"use client";

import { CalendarCheck2, Clock3, MailCheck, Users } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { toast } from "sonner";
import { extractAttendanceOvertimeMeta } from "@/lib/attendance-overtime";
import { Button } from "@/components/ui/button";
import { DashboardWorkdayTimer } from "@/components/dashboard/dashboard-workday-timer";
import { PageHeader } from "@/components/dashboard/page-header";
import { PanelHeader } from "@/components/dashboard/panel-header";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { cn, formatMinutes, toDateOnly } from "@/lib/utils";
function attendanceStatusTone(status?: string | null) {
  if (status === "present" || status === "remote") return "bg-emerald-500/10 text-emerald-600";
  if (status === "late" || status === "half_day") return "bg-amber-500/10 text-amber-600";
  if (status === "absent") return "bg-rose-500/10 text-rose-600";
  return "bg-slate-500/10 text-slate-500";
}

type AttendanceItem = {
  userId: string;
  name: string;
  email: string;
  role: string;
  avatarUrl?: string | null;
  departmentName: string;
  attendance: {
    id: string;
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

type AttendanceStatusValue = "present" | "late" | "half_day" | "absent" | "remote";

function formatAttendanceDisplayParts(value?: Date | string | null) {
  if (!value) {
    return {
      date: "Not set",
      time: "--:--",
      meridiem: "",
    };
  }

  const date = new Date(value);

  if (Number.isNaN(date.getTime())) {
    return {
      date: "Not set",
      time: "--:--",
      meridiem: "",
    };
  }

  const dateLabel = new Intl.DateTimeFormat("en-BD", {
    timeZone: "Asia/Dhaka",
    year: "numeric",
    month: "short",
    day: "numeric",
  }).format(date);

  const timeParts = new Intl.DateTimeFormat("en-US", {
    timeZone: "Asia/Dhaka",
    hour: "2-digit",
    minute: "2-digit",
    hour12: true,
  }).formatToParts(date);

  const hour = timeParts.find((part) => part.type === "hour")?.value ?? "--";
  const minute = timeParts.find((part) => part.type === "minute")?.value ?? "--";
  const dayPeriod = timeParts.find((part) => part.type === "dayPeriod")?.value ?? "";

  return {
    date: dateLabel,
    time: `${hour}:${minute}`,
    meridiem: dayPeriod,
  };
}

export function AttendancePanel({
  userRole,
  currentUserId,
  items = [],
}: {
  userRole: "employee" | "hr" | "manager" | "admin";
  currentUserId: string;
  items: AttendanceItem[];
}) {
  const router = useRouter();
  const me = items.find((item) => item.userId === currentUserId);
  const attendanceMeta = extractAttendanceOvertimeMeta(me?.attendance?.note);
  const [status, setStatus] = useState<AttendanceStatusValue>(me?.attendance?.status ?? "present");
  const [note, setNote] = useState(attendanceMeta.text);
  const [saving, setSaving] = useState(false);
  const [triggering, setTriggering] = useState(false);
  const timerSnapshot = me?.attendance
    ? {
        attendanceDate: toDateOnly(),
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

  async function saveAttendanceDetails() {
    if (!me?.attendance) {
      toast.error("Check In first.");
      return;
    }
    setSaving(true);
    try {
      const response = await fetch("/api/dashboard/attendance", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "update_details",
          attendanceDate: toDateOnly(),
          status,
          note,
        }),
      });
      const raw = await response.text();
      const result = raw ? JSON.parse(raw) : null;
      if (!response.ok) {
        toast.error(result?.message ?? "Attendance update failed.");
        return;
      }
      toast.success(result.message);
      router.refresh();
    } catch {
      toast.error("Attendance could not reach the server.");
    } finally {
      setSaving(false);
    }
  }
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
        className={cn(
          "dashboard-accent accent-emerald flex min-h-0 flex-col rounded-[1.25rem] border border-[var(--panel-border)] bg-[var(--panel)] p-2.5 shadow-[var(--shadow)]",
          userRole === "employee" ? "min-[900px]:flex-1" : "shrink-0",
        )}
        data-dashboard-panel
      >
        <PanelHeader icon={CalendarCheck2} title="Today's Attendance" tone="bg-emerald-500/10 text-emerald-500" />
        <div className="dashboard-scroll-area mt-2 min-h-0 flex-1 space-y-3 pr-0.5">
          <div className="grid gap-2 sm:grid-cols-2 xl:grid-cols-5">
            {[
              ["Counted Work", formatMinutes(me?.attendance?.workingMinutes ?? 0)],
              ["Active Work", formatMinutes(me?.attendance?.activeMinutes ?? 0)],
              ["Included Break", formatMinutes(me?.attendance?.includedBreakMinutes ?? 0)],
              ["Outside Gap", formatMinutes(me?.attendance?.outsideMinutes ?? 0)],
              ["Overtime", formatMinutes(me?.attendance?.overtimeMinutes ?? 0)],
            ].map(([label, value]) => (
              <div className="rounded-xl border border-[var(--panel-border)] bg-[var(--panel-muted)] px-3 py-2.5" key={label}>
                <p className="text-[0.6rem] font-bold uppercase tracking-[0.14em] text-[var(--muted-foreground)]">{label}</p>
                <p className="mt-1 font-mono text-base font-bold tabular-nums text-[var(--foreground)]">{value}</p>
              </div>
            ))}
          </div>
          <div className="grid gap-3 md:grid-cols-[12rem_1fr_auto] md:items-end">
            <div>
              <Label>Status</Label>
              <Select value={status} onValueChange={(value) => setStatus(value as AttendanceStatusValue)}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="present">Present</SelectItem>
                  <SelectItem value="late">Late</SelectItem>
                  <SelectItem value="half_day">Half Day</SelectItem>
                  <SelectItem value="absent">Absent</SelectItem>
                  <SelectItem value="remote">Remote</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label>Attendance Note</Label>
              <Textarea onChange={(event) => setNote(event.target.value)} placeholder="Optional attendance note for today." value={note} />
            </div>
            <Button
              className="button-force-white h-10 bg-emerald-600 hover:bg-emerald-700"
              disabled={saving || !me?.attendance}
              onClick={saveAttendanceDetails}
              type="button"
            >
              {saving ? "Saving..." : "Save Details"}
            </Button>
          </div>
          {(me?.attendance?.excessBreakMinutes ?? 0) > 0 ? (
            <div className="rounded-xl border border-amber-500/30 bg-amber-500/10 px-3 py-2 text-[0.78rem] text-amber-700">
              Excess break deducted: {formatMinutes(me?.attendance?.excessBreakMinutes ?? 0)}.
            </div>
          ) : null}
        </div>
      </div>
      {/* The only unbounded thing on this page is the roster, so it is the one
          part that takes the leftover height and scrolls inside its own card
          rather than letting the page grow. */}
      {userRole !== "employee" ? (
        <div
          className="dashboard-accent accent-sky flex min-h-0 flex-col rounded-[1.25rem] border border-[var(--panel-border)] bg-[var(--panel)] p-2.5 shadow-[var(--shadow)] min-[900px]:flex-1"
          data-dashboard-panel
        >
          <PanelHeader
            action={
              <span className="font-mono text-[0.68rem] font-semibold tabular-nums text-[var(--muted-foreground)]">
                {(items ?? []).length} people
              </span>
            }
            icon={Users}
            title="Team Attendance Today"
            tone="bg-sky-500/10 text-sky-500"
          />
          <div className="dashboard-scroll-area mt-2 grid min-h-0 flex-1 content-start gap-2 pr-0.5 xl:grid-cols-2">
            {(items ?? []).map((item) => {
              const checkInDisplay = formatAttendanceDisplayParts(item.attendance?.checkInAt);
              const checkOutDisplay = formatAttendanceDisplayParts(item.attendance?.checkOutAt);
              const teamAttendanceMeta = extractAttendanceOvertimeMeta(item.attendance?.note);

              return (
              <div
                key={item.userId}
                className="rounded-xl border border-[var(--panel-border)] bg-[var(--panel-muted)] p-3 transition-colors hover:border-sky-500/30"
              >
                <div className="flex items-center justify-between gap-2.5">
                  <div className="min-w-0">
                    <p className="truncate text-[0.88rem] font-bold text-[var(--foreground)]">{item.name}</p>
                    <p className="truncate text-[0.72rem] text-[var(--muted-foreground)]">{item.departmentName}</p>
                  </div>
                  <span className={`shrink-0 rounded-full px-2 py-0.5 text-[0.65rem] font-bold uppercase tracking-[0.12em] ${attendanceStatusTone(item.attendance?.status)}`}>
                    {item.attendance?.status ?? "missing"}
                  </span>
                </div>
                <div className="mt-2.5 grid gap-2 md:grid-cols-3">
                  <div className="rounded-lg border border-[var(--panel-border)] bg-[var(--panel)] px-2.5 py-2">
                    <p className="text-[0.6rem] font-bold uppercase tracking-[0.16em] text-[var(--muted-foreground)]">In</p>
                    <div className="mt-1 flex items-baseline gap-1.5">
                      <p className="font-mono text-[0.95rem] font-bold leading-none tabular-nums text-[var(--foreground)]">
                        {checkInDisplay.time}
                      </p>
                      {checkInDisplay.meridiem ? (
                        <span className="text-[0.6rem] font-bold uppercase tracking-[0.12em] text-emerald-600">
                          {checkInDisplay.meridiem}
                        </span>
                      ) : null}
                    </div>
                    <p className="mt-0.5 truncate text-[0.65rem] text-[var(--muted-foreground)]">{checkInDisplay.date}</p>
                  </div>
                  <div className="rounded-lg border border-[var(--panel-border)] bg-[var(--panel)] px-2.5 py-2">
                    <p className="text-[0.6rem] font-bold uppercase tracking-[0.16em] text-[var(--muted-foreground)]">Out</p>
                    <div className="mt-1 flex items-baseline gap-1.5">
                      <p className="font-mono text-[0.95rem] font-bold leading-none tabular-nums text-[var(--foreground)]">
                        {checkOutDisplay.time}
                      </p>
                      {checkOutDisplay.meridiem ? (
                        <span className="text-[0.6rem] font-bold uppercase tracking-[0.12em] text-sky-600">
                          {checkOutDisplay.meridiem}
                        </span>
                      ) : null}
                    </div>
                    <p className="mt-0.5 truncate text-[0.65rem] text-[var(--muted-foreground)]">{checkOutDisplay.date}</p>
                  </div>
                  <div className="rounded-lg border border-[var(--panel-border)] bg-[var(--panel)] px-2.5 py-2">
                    <p className="text-[0.6rem] font-bold uppercase tracking-[0.16em] text-[var(--muted-foreground)]">Worked</p>
                    <p className="mt-1 font-mono text-[0.95rem] font-bold leading-none tabular-nums text-[var(--foreground)]">
                      {formatMinutes(item.attendance?.workingMinutes ?? 0)}
                    </p>
                    <p className="mt-0.5 text-[0.65rem] text-[var(--muted-foreground)]">
                      Presence {formatMinutes(item.attendance?.presenceMinutes ?? 0)} · Break {item.attendance?.breakMinutes ?? 0}m
                    </p>
                  </div>
                </div>
                {(item.attendance?.overtimeMinutes ?? teamAttendanceMeta.overtimeMinutes) > 0 ||
                (item.attendance?.excessBreakMinutes ?? 0) > 0 ? (
                  <div className="mt-2 rounded-lg border border-amber-500/30 bg-amber-500/10 px-2.5 py-2 text-[0.72rem] text-amber-700">
                    {(item.attendance?.overtimeMinutes ?? teamAttendanceMeta.overtimeMinutes) > 0 ? (
                      <p>Overtime after 7 PM: {formatMinutes(item.attendance?.overtimeMinutes ?? teamAttendanceMeta.overtimeMinutes)}</p>
                    ) : null}
                    {(item.attendance?.excessBreakMinutes ?? 0) > 0 ? (
                      <p className="mt-0.5">Excess break deducted: {item.attendance?.excessBreakMinutes}m</p>
                    ) : null}
                  </div>
                ) : null}
              </div>
            )})}
          </div>
        </div>
      ) : null}

      <div
        className="dashboard-accent accent-violet shrink-0 rounded-[1.25rem] border border-[var(--panel-border)] bg-[var(--panel)] p-2.5 shadow-[var(--shadow)]"
        data-dashboard-panel
      >
        <PanelHeader icon={MailCheck} title="Reminder Automation" tone="bg-violet-500/10 text-violet-500" />
        <div className="mt-2 space-y-2 text-[0.78rem] leading-5 text-[var(--muted-foreground)]">
          This tool sends attendance and work follow-up emails. Run it manually here, or wire it to your scheduler in the background.
          {userRole !== "employee" ? (
            <div>
              <Button
                className="button-force-white bg-[#4f5ef7] hover:bg-[#4453eb] disabled:bg-[#8fa2f7] disabled:opacity-100"
                disabled={triggering}
                onClick={async () => {
                  setTriggering(true);
                  const response = await fetch("/api/automation/reminders", { method: "POST" });
                  const raw = await response.text();
                  const result = raw ? JSON.parse(raw) : { message: "Reminder run failed." };
                  setTriggering(false);
                  if (!response.ok) {
                    toast.error(result.message);
                    return;
                  }
                  toast.success(result.message);
                }}
                type="button"
                variant="secondary"
              >
                <Clock3 className="h-4 w-4" /> {triggering ? "Sending reminders..." : "Run Reminder Emails"}
              </Button>
            </div>
          ) : null}
        </div>
      </div>
    </div>
  );
}
