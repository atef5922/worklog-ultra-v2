"use client";

import { Clock3, LogIn, LogOut, TimerReset } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { toDateOnly, toDateTimeInputValue } from "@/lib/utils";

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
  items,
}: {
  userRole: "employee" | "hr" | "manager" | "admin";
  currentUserId: string;
  items: AttendanceItem[];
}) {
  const router = useRouter();
  const me = items.find((item) => item.userId === currentUserId);
  const [status, setStatus] = useState<AttendanceStatusValue>(me?.attendance?.status ?? "present");
  const [checkInAt, setCheckInAt] = useState(me?.attendance?.checkInAt ? formatAttendanceDateTime(me.attendance.checkInAt) : "");
  const [checkOutAt, setCheckOutAt] = useState(me?.attendance?.checkOutAt ? formatAttendanceDateTime(me.attendance.checkOutAt) : "");
  const [breakMinutes, setBreakMinutes] = useState(String(me?.attendance?.breakMinutes ?? 0));
  const [note, setNote] = useState(me?.attendance?.note ?? "");
  const [saving, setSaving] = useState(false);
  const [triggering, setTriggering] = useState(false);
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

    if (next.nextStatus) setStatus(next.nextStatus);
    if (next.nextCheckIn !== undefined) setCheckInAt(next.nextCheckIn);
    if (next.nextCheckOut !== undefined) setCheckOutAt(next.nextCheckOut);
    if (next.nextCheckIn === undefined && normalizedCheckIn) setCheckInAt(formatAttendanceDateTime(normalizedCheckIn));
    if (next.nextCheckOut === undefined && normalizedCheckOut) setCheckOutAt(formatAttendanceDateTime(normalizedCheckOut));
    toast.success(result.message);
    router.refresh();
  }

  return (
    <div className="space-y-5">
      <Card>
        <CardHeader>
          <CardTitle>Attendance</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid gap-4 xl:grid-cols-[1fr_auto]">
            <div className="grid gap-4 md:grid-cols-2">
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
                onClick={() => saveAttendance({ nextStatus: "present", nextCheckIn: formatAttendanceDateTime() })}
                type="button"
              >
                <LogIn className="h-4 w-4" /> {alreadyCheckedIn ? "Checked In" : "Check In"}
              </Button>
              <Button
                className="button-force-white bg-slate-700 hover:bg-slate-800"
                disabled={saving}
                onClick={() => saveAttendance({ nextCheckOut: formatAttendanceDateTime() })}
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
          <Button className="button-force-white w-full" disabled={saving} onClick={() => saveAttendance()} type="button">
            {saving ? "Saving attendance..." : "Save Attendance"}
          </Button>
        </CardContent>
      </Card>

      {userRole !== "employee" ? (
        <Card>
          <CardHeader>
            <CardTitle>Team Attendance Today</CardTitle>
          </CardHeader>
          <CardContent className="grid gap-3 xl:grid-cols-2">
            {items.map((item) => (
              <div key={item.userId} className="rounded-2xl border border-[var(--panel-border)] bg-[var(--panel-muted)] p-4">
                <div className="flex items-center justify-between gap-3">
                  <div>
                    <p className="font-semibold text-white">{item.name}</p>
                    <p className="text-sm text-[var(--muted-foreground)]">{item.departmentName}</p>
                  </div>
                  <span className="rounded-full bg-amber-100 px-2.5 py-1 text-xs font-medium uppercase tracking-[0.18em] text-amber-600">
                    {item.attendance?.status ?? "missing"}
                  </span>
                </div>
                <div className="mt-3 grid gap-2 text-sm text-[var(--muted-foreground)] md:grid-cols-3">
                  <div>
                    <p className="text-xs uppercase tracking-[0.18em]">In</p>
                    <p className="mt-1 text-white">{item.attendance?.checkInAt ? toDateTimeInputValue(item.attendance.checkInAt).replace("T", " ") : "Not set"}</p>
                  </div>
                  <div>
                    <p className="text-xs uppercase tracking-[0.18em]">Out</p>
                    <p className="mt-1 text-white">{item.attendance?.checkOutAt ? toDateTimeInputValue(item.attendance.checkOutAt).replace("T", " ") : "Not set"}</p>
                  </div>
                  <div>
                    <p className="text-xs uppercase tracking-[0.18em]">Worked</p>
                    <p className="mt-1 text-white">{item.attendance ? `${item.attendance.workingMinutes} min` : "0 min"}</p>
                  </div>
                </div>
              </div>
            ))}
          </CardContent>
        </Card>
      ) : null}

      <Card>
        <CardHeader>
          <CardTitle>Reminder Automation</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4 text-sm text-[var(--muted-foreground)]">
          This reminder tool can send attendance and work follow-up emails automatically. Run it manually from here when needed, or connect it with your scheduler in the background.
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
        </CardContent>
      </Card>
    </div>
  );
}
