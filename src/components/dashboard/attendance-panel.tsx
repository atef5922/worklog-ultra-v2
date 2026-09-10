"use client";

import { CalendarCheck2, Clock3, LogIn, LogOut, MailCheck, TimerReset, Users } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { toast } from "sonner";
import { extractAttendanceOvertimeMeta } from "@/lib/attendance-overtime";
import { Button } from "@/components/ui/button";
import { clearStoredWorkdayTimer } from "@/components/dashboard/dashboard-workday-timer";
import { PageHeader } from "@/components/dashboard/page-header";
import { PanelHeader } from "@/components/dashboard/panel-header";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { cn, formatMinutes, toDateOnly, toDateTimeInputValue } from "@/lib/utils";

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
    breakMinutes: number;
    workingMinutes: number;
    note: string | null;
  } | null;
};

type AttendanceStatusValue = "present" | "late" | "half_day" | "absent" | "remote";

function formatAttendanceDateTime(value: Date | string = new Date()) {
  const date = new Date(value);

  if (Number.isNaN(date.getTime())) {
    return "";
  }

  return new Intl.DateTimeFormat("en-US", {
    timeZone: "Asia/Dhaka",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hour12: true,
  }).format(date);
}

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

function normalizeAttendanceDateTime(value: string) {
  const trimmed = value.trim();

  if (!trimmed) {
    return "";
  }

  if (/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/.test(trimmed)) {
    return `${trimmed}:00+06:00`;
  }

  if (/^\d{4}-\d{2}-\d{2}\s\d{2}:\d{2}$/.test(trimmed)) {
    return `${trimmed.replace(" ", "T")}:00+06:00`;
  }

  const match = trimmed.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})(?:,\s*|\s+)(\d{1,2}):(\d{2})\s*(AM|PM)$/i);
  if (!match) {
    return null;
  }

  const [, monthText, dayText, yearText, hourText, minuteText, meridiem] = match;
  const month = Number(monthText);
  const day = Number(dayText);
  const year = Number(yearText);
  const minute = Number(minuteText);
  let hour = Number(hourText);

  if (
    !Number.isFinite(month) ||
    !Number.isFinite(day) ||
    !Number.isFinite(year) ||
    !Number.isFinite(hour) ||
    !Number.isFinite(minute) ||
    month < 1 ||
    month > 12 ||
    day < 1 ||
    day > 31 ||
    hour < 1 ||
    hour > 12 ||
    minute < 0 ||
    minute > 59
  ) {
    return null;
  }

  const upperMeridiem = meridiem.toUpperCase();
  if (upperMeridiem === "PM" && hour !== 12) {
    hour += 12;
  }
  if (upperMeridiem === "AM" && hour === 12) {
    hour = 0;
  }

  return `${yearText}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}T${String(hour).padStart(2, "0")}:${String(minute).padStart(2, "0")}:00+06:00`;
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
  const [checkInAt, setCheckInAt] = useState(me?.attendance?.checkInAt ? formatAttendanceDateTime(me.attendance.checkInAt) : "");
  const [checkOutAt, setCheckOutAt] = useState(me?.attendance?.checkOutAt ? formatAttendanceDateTime(me.attendance.checkOutAt) : "");
  const [breakMinutes, setBreakMinutes] = useState(String(me?.attendance?.breakMinutes ?? 0));
  const [note, setNote] = useState(attendanceMeta.text);
  const [saving, setSaving] = useState(false);
  const [triggering, setTriggering] = useState(false);
  const [overtimeMinutes, setOvertimeMinutes] = useState(attendanceMeta.overtimeMinutes);
  const [autoClosedAt, setAutoClosedAt] = useState(attendanceMeta.autoClosedAt);
  const alreadyCheckedIn = Boolean(me?.attendance?.checkInAt) && !me?.attendance?.checkOutAt;

  async function saveAttendance(next: {
    nextStatus?: AttendanceStatusValue;
    nextCheckIn?: string;
    nextCheckOut?: string;
  } = {}) {
    const normalizedCheckIn = normalizeAttendanceDateTime(next.nextCheckIn ?? checkInAt);
    const normalizedCheckOut = normalizeAttendanceDateTime(next.nextCheckOut ?? checkOutAt);

    if ((next.nextCheckIn ?? checkInAt) && normalizedCheckIn === null) {
      toast.error("Check In time format is invalid. Use MM/DD/YYYY HH:MM AM or choose Today.");
      return;
    }

    if ((next.nextCheckOut ?? checkOutAt) && normalizedCheckOut === null) {
      toast.error("Check Out time format is invalid. Use MM/DD/YYYY HH:MM AM or choose Today.");
      return;
    }

    setSaving(true);
    const response = await fetch("/api/dashboard/attendance", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        attendanceDate: toDateOnly(),
        status: next.nextStatus ?? status,
        note,
        checkInAt: normalizedCheckIn ?? "",
        checkOutAt: normalizedCheckOut ?? "",
        breakMinutes,
      }),
    });

    const raw = await response.text();
    const result = raw ? JSON.parse(raw) : { message: "Attendance update failed." };
    setSaving(false);

    if (!response.ok) {
      toast.error(result.message);
      return;
    }

    const savedRecord = result.record as
      | {
          status?: AttendanceStatusValue;
          note?: string | null;
          checkInAt?: string | null;
          checkOutAt?: string | null;
          breakMinutes?: number;
        }
      | undefined;
    const savedMeta = extractAttendanceOvertimeMeta(savedRecord?.note);

    setStatus(savedRecord?.status ?? next.nextStatus ?? status);
    setCheckInAt(savedRecord?.checkInAt ? formatAttendanceDateTime(savedRecord.checkInAt) : "");
    setCheckOutAt(savedRecord?.checkOutAt ? formatAttendanceDateTime(savedRecord.checkOutAt) : "");
    setBreakMinutes(String(savedRecord?.breakMinutes ?? breakMinutes));
    setNote(savedMeta.text);
    setOvertimeMinutes(savedMeta.overtimeMinutes);
    setAutoClosedAt(savedMeta.autoClosedAt);
    clearStoredWorkdayTimer(toDateOnly(), currentUserId);
    toast.success(result.message);
    router.refresh();
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
        icon={CalendarCheck2}
        subtitle="Log today's check in, check out, and break time."
        title="Attendance"
      />

      {/* An employee never sees the team roster, so without this the page had no
          flexible panel at all and anything past the fold was simply clipped.
          For a manager the roster below is the flexible one, so this stays put. */}
      <div
        className={cn(
          "dashboard-accent accent-emerald flex min-h-0 flex-col rounded-[1.25rem] border border-[var(--panel-border)] bg-[var(--panel)] p-2.5 shadow-[var(--shadow)]",
          userRole === "employee" ? "min-[900px]:flex-1" : "shrink-0",
        )}
        data-dashboard-panel
      >
        <PanelHeader icon={CalendarCheck2} title="Today's Attendance" tone="bg-emerald-500/10 text-emerald-500" />
        <div className="dashboard-scroll-area mt-2 min-h-0 flex-1 space-y-2 pr-0.5">
          <div className="grid gap-2 xl:grid-cols-[1fr_auto]">
            <div className="grid gap-2.5 md:grid-cols-2">
              <div>
                <Label>Status</Label>
                <Select value={status} onValueChange={(value) => setStatus(value as typeof status)}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
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
                <Label>Break Minutes</Label>
                <Input min="0" onChange={(event) => setBreakMinutes(event.target.value)} type="number" value={breakMinutes} />
              </div>
              <div>
                <Label>Check In</Label>
                <div className="flex gap-2">
                  <Input
                    className="flex-1"
                    onChange={(event) => setCheckInAt(event.target.value)}
                    placeholder="MM/DD/YYYY HH:MM AM"
                    type="text"
                    value={checkInAt}
                  />
                  <Button
                    className="button-force-white shrink-0 bg-[#4f5ef7] hover:bg-[#4453eb]"
                    onClick={() => setCheckInAt(formatAttendanceDateTime())}
                    type="button"
                  >
                    Today
                  </Button>
                </div>
              </div>
              <div>
                <Label>Check Out</Label>
                <div className="flex gap-2">
                  <Input
                    className="flex-1"
                    onChange={(event) => setCheckOutAt(event.target.value)}
                    placeholder="MM/DD/YYYY HH:MM AM"
                    type="text"
                    value={checkOutAt}
                  />
                  <Button
                    className="button-force-white shrink-0 bg-amber-500 hover:bg-amber-600"
                    onClick={() => setCheckOutAt(formatAttendanceDateTime())}
                    type="button"
                  >
                    Today
                  </Button>
                </div>
              </div>
            </div>
            <div className="flex flex-wrap gap-2 xl:flex-col">
              <Button
                className="button-force-white"
                disabled={saving || alreadyCheckedIn}
                onClick={() => saveAttendance({ nextStatus: "present", nextCheckIn: checkInAt.trim() || formatAttendanceDateTime() })}
                type="button"
              >
                <LogIn className="h-4 w-4" /> {alreadyCheckedIn ? "Checked In" : "Check In"}
              </Button>
              <Button
                className="button-force-white bg-slate-700 hover:bg-slate-800"
                disabled={saving}
                onClick={() => saveAttendance({ nextCheckOut: checkOutAt.trim() || formatAttendanceDateTime() })}
                type="button"
                variant="secondary"
              >
                <LogOut className="h-4 w-4" /> Check Out
              </Button>
              <Button
                className="button-force-white bg-slate-500 hover:bg-slate-600"
                disabled={saving}
                onClick={() => {
                  setCheckInAt("");
                  setCheckOutAt("");
                  setBreakMinutes("0");
                  setStatus("present");
                }}
                type="button"
                variant="ghost"
              >
                <TimerReset className="h-4 w-4" /> Reset Draft
              </Button>
            </div>
          </div>
          <div>
            <Label>Attendance Note</Label>
            <Textarea onChange={(event) => setNote(event.target.value)} placeholder="Optional attendance note for today." value={note} />
          </div>
          {overtimeMinutes > 0 || autoClosedAt ? (
            <div className="rounded-xl border border-amber-500/30 bg-amber-500/10 px-3 py-2.5 text-[0.8rem] text-amber-700">
              {overtimeMinutes > 0 ? <p>Overtime tracked: {overtimeMinutes} minute(s).</p> : null}
              {autoClosedAt ? <p className="mt-1">Main attendance record auto-closed at 7:30 PM.</p> : null}
            </div>
          ) : null}
          <Button
            className="button-force-white h-11 w-full rounded-xl bg-[linear-gradient(135deg,#059669_0%,#0d9488_55%,#14b8a6_100%)] text-sm shadow-[0_14px_30px_rgba(16,185,129,0.26)] transition hover:brightness-[1.06] disabled:brightness-100"
            disabled={saving}
            onClick={() => saveAttendance()}
            type="button"
          >
            {saving ? "Saving attendance..." : "Save Attendance"}
          </Button>
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
                    <p className="mt-0.5 text-[0.65rem] text-[var(--muted-foreground)]">today</p>
                  </div>
                </div>
                {teamAttendanceMeta.overtimeMinutes > 0 || teamAttendanceMeta.autoClosedAt ? (
                  <div className="mt-2 rounded-lg border border-amber-500/30 bg-amber-500/10 px-2.5 py-2 text-[0.72rem] text-amber-700">
                    {teamAttendanceMeta.overtimeMinutes > 0 ? <p>Overtime: {formatMinutes(teamAttendanceMeta.overtimeMinutes)}</p> : null}
                    {teamAttendanceMeta.autoClosedAt ? <p className="mt-0.5">Main record auto-closed at 7:30 PM.</p> : null}
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
