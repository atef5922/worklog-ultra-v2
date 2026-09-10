"use client";

import { useMemo, useState } from "react";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { extractContinuationMeta, stripContinuationMeta } from "@/lib/task-continuation";
import { stripRecurringTaskMeta } from "@/lib/recurring-task-templates";
import { formatDateTimeInDhaka, formatMinutes, formatTimeOnlyInDhaka } from "@/lib/utils";

type MonitorDepartment = {
  id: string;
  name: string;
};

type MonitorAttendance = {
  status: "present" | "late" | "half_day" | "absent" | "remote";
  checkInAt: Date | string | null;
  checkOutAt: Date | string | null;
  breakMinutes: number;
  workingMinutes: number;
  note: string | null;
};

type MonitorTask = {
  id: string;
  title: string;
  description: string | null;
  priority: string;
  status: string;
  completionPercent: number;
  trackedMinutes: number;
  actualStart: Date | string | null;
  actualEnd: Date | string | null;
  note: string | null;
};

type MonitorUser = {
  id: string;
  name: string;
  role: string;
  designation: string | null;
  avatarUrl: string | null;
  departmentId: string;
  departmentName: string;
  taskCount: number;
  completedTaskCount: number;
  totalTrackedMinutes: number;
  attendance: MonitorAttendance | null;
  todaysPlans: MonitorTask[];
};

function getInitials(name: string) {
  return name
    .split(" ")
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase() ?? "")
    .join("");
}

function priorityTone(priority: string) {
  if (priority === "critical" || priority === "high") {
    return "border-amber-200 bg-amber-50 text-amber-700";
  }

  if (priority === "normal") {
    return "border-blue-200 bg-blue-50 text-blue-700";
  }

  return "border-slate-200 bg-slate-50 text-slate-600";
}

function statusTone(status: string) {
  if (status === "done") {
    return "border-emerald-200 bg-emerald-50 text-emerald-700";
  }

  if (status === "in_progress") {
    return "border-blue-200 bg-blue-50 text-blue-700";
  }

  if (status === "pending") {
    return "border-amber-200 bg-amber-50 text-amber-700";
  }

  return "border-slate-200 bg-slate-50 text-slate-600";
}

function attendanceTone(status?: string | null) {
  if (status === "present" || status === "remote") {
    return "border-emerald-200 bg-emerald-50 text-emerald-700";
  }

  if (status === "late" || status === "half_day") {
    return "border-amber-200 bg-amber-50 text-amber-700";
  }

  if (status === "absent") {
    return "border-rose-200 bg-rose-50 text-rose-700";
  }

  return "border-slate-200 bg-slate-50 text-slate-600";
}

function roleLabel(role: string) {
  if (role === "manager") return "Team Head";
  if (role === "admin") return "CEO/Admin";
  if (role === "hr") return "HR";
  return "Employee";
}

function getTaskBody(description: string | null) {
  return stripRecurringTaskMeta(stripContinuationMeta(description)).trim();
}

function getContinuationSummary(description: string | null) {
  const continuationMeta = extractContinuationMeta(description);

  if (!continuationMeta) {
    return null;
  }

  const totalTrackedMinutes = continuationMeta.dailyLogs.reduce((sum, entry) => sum + entry.trackedMinutes, 0);
  const lastWorked = continuationMeta.dailyLogs.length
    ? continuationMeta.dailyLogs[continuationMeta.dailyLogs.length - 1]?.date
    : continuationMeta.sourceDate;

  return {
    sourceDate: continuationMeta.sourceDate,
    totalDays: Math.max(continuationMeta.daysActive || 0, continuationMeta.dailyLogs.length, 1),
    totalTrackedMinutes,
    lastWorked,
    dailyLogs: continuationMeta.dailyLogs,
    lastNote: continuationMeta.note,
  };
}

export function DirectoryCenter({
  departments = [],
  users = [],
  canSwitchDepartment,
  initialDepartmentId,
  initialUserId,
}: {
  departments: MonitorDepartment[];
  users: MonitorUser[];
  canSwitchDepartment: boolean;
  initialDepartmentId?: string;
  initialUserId?: string;
}) {
  const [selectedDepartmentId, setSelectedDepartmentId] = useState<string>(
    initialDepartmentId ?? (canSwitchDepartment ? "all" : (departments[0]?.id ?? "all")),
  );
  const [selectedUserId, setSelectedUserId] = useState<string>(initialUserId ?? "all");

  const filteredUsers = useMemo(() => {
    const departmentFiltered =
      selectedDepartmentId === "all" ? users : users.filter((user) => user.departmentId === selectedDepartmentId);

    if (selectedUserId === "all") {
      return departmentFiltered;
    }

    return departmentFiltered.filter((user) => user.id === selectedUserId);
  }, [selectedDepartmentId, selectedUserId, users]);

  const departmentScopedUsers = useMemo(() => {
    if (selectedDepartmentId === "all") {
      return users;
    }

    return users.filter((user) => user.departmentId === selectedDepartmentId);
  }, [selectedDepartmentId, users]);

  const departmentCounts = useMemo(
    () =>
      new Map(
        departments.map((department) => [
          department.id,
          users.filter((user) => user.departmentId === department.id).length,
        ]),
      ),
    [departments, users],
  );

  const totalTasks = filteredUsers.reduce((sum, user) => sum + user.taskCount, 0);
  const totalDone = filteredUsers.reduce((sum, user) => sum + user.completedTaskCount, 0);
  const totalTrackedMinutes = filteredUsers.reduce((sum, user) => sum + user.totalTrackedMinutes, 0);

  return (
    <Card>
      <CardHeader className="gap-4">
        <div className="flex flex-col gap-3 xl:flex-row xl:items-end xl:justify-between">
          <div>
            <CardTitle>Work Monitor</CardTitle>
            <CardDescription>
              Review today&apos;s department plans, task progress, tracked time, attendance, and latest work notes with simple filters.
            </CardDescription>
          </div>
          <div className="grid gap-3 sm:grid-cols-2 xl:min-w-[420px]">
            <div className="min-w-0">
              <p className="mb-1.5 text-xs font-semibold uppercase tracking-[0.18em] text-[var(--muted-foreground)]">Department</p>
              <Select
                onValueChange={(value) => {
                  setSelectedDepartmentId(value);
                  setSelectedUserId("all");
                }}
                value={selectedDepartmentId}
              >
                <SelectTrigger>
                  <SelectValue placeholder="Select department" />
                </SelectTrigger>
                <SelectContent>
                  {canSwitchDepartment ? <SelectItem value="all">All departments</SelectItem> : null}
                  {(departments ?? []).map((department) => (
                    <SelectItem key={department.id} value={department.id}>
                      {department.name} ({departmentCounts.get(department.id) ?? 0})
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="min-w-0">
              <p className="mb-1.5 text-xs font-semibold uppercase tracking-[0.18em] text-[var(--muted-foreground)]">Employee</p>
              <Select onValueChange={setSelectedUserId} value={selectedUserId}>
                <SelectTrigger>
                  <SelectValue placeholder="Select employee" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All employees</SelectItem>
                  {(departmentScopedUsers ?? []).map((user) => (
                    <SelectItem key={user.id} value={user.id}>
                      {user.name} - {user.departmentName}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>
        </div>
        <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
          <div className="rounded-2xl border border-[var(--panel-border)] bg-[var(--panel-muted)] px-4 py-3">
            <p className="text-xs font-semibold uppercase tracking-[0.2em] text-[var(--muted-foreground)]">Visible employees</p>
            <p className="mt-2 text-2xl font-semibold text-[var(--foreground)]">{filteredUsers.length}</p>
          </div>
          <div className="rounded-2xl border border-[var(--panel-border)] bg-[var(--panel-muted)] px-4 py-3">
            <p className="text-xs font-semibold uppercase tracking-[0.2em] text-[var(--muted-foreground)]">Tasks today</p>
            <p className="mt-2 text-2xl font-semibold text-[var(--foreground)]">
              {totalDone}/{totalTasks}
            </p>
          </div>
          <div className="rounded-2xl border border-[var(--panel-border)] bg-[var(--panel-muted)] px-4 py-3">
            <p className="text-xs font-semibold uppercase tracking-[0.2em] text-[var(--muted-foreground)]">Tracked time</p>
            <p className="mt-2 text-2xl font-semibold text-[var(--foreground)]">{formatMinutes(totalTrackedMinutes)}</p>
          </div>
        </div>
      </CardHeader>
      <CardContent className="space-y-4">
        {filteredUsers.length ? (
          <div className="overflow-hidden rounded-[28px] border border-[var(--panel-border)] bg-[var(--panel-muted)]">
            {(filteredUsers ?? []).map((user) => (
              <section key={user.id} className="border-b border-[var(--panel-border)] px-4 py-4 last:border-b-0">
                <div className="flex flex-col gap-3 2xl:flex-row 2xl:items-start 2xl:justify-between">
                  <div className="min-w-0 flex-1">
                    <div className="flex items-start gap-4">
                      <Avatar className="h-12 w-12">
                        {user.avatarUrl ? <AvatarImage alt={user.name} src={user.avatarUrl} /> : null}
                        <AvatarFallback>{getInitials(user.name)}</AvatarFallback>
                      </Avatar>
                      <div className="min-w-0 flex-1">
                        <div className="flex flex-wrap items-center gap-2">
                          <p className="text-lg font-semibold text-[var(--foreground)]">{user.name}</p>
                          <Badge variant="secondary">{roleLabel(user.role)}</Badge>
                          {user.attendance ? (
                            <span
                              className={`inline-flex rounded-full border px-2.5 py-1 text-[11px] font-semibold uppercase tracking-[0.14em] ${attendanceTone(user.attendance.status)}`}
                            >
                              {user.attendance.status.replace("_", " ")}
                            </span>
                          ) : null}
                        </div>
                        <div className="mt-1 flex flex-wrap gap-x-4 gap-y-1 text-sm text-[var(--muted-foreground)]">
                          <span>{user.departmentName}</span>
                          <span>{user.designation ?? roleLabel(user.role)}</span>
                          <span>{user.taskCount} tasks</span>
                          <span>{user.completedTaskCount} done</span>
                          <span>{formatMinutes(user.totalTrackedMinutes)} tracked</span>
                          <span>
                            Attendance {user.attendance?.checkInAt ? formatTimeOnlyInDhaka(user.attendance.checkInAt) : "Not checked in"}
                            {" - "}
                            {user.attendance?.checkOutAt ? formatTimeOnlyInDhaka(user.attendance.checkOutAt) : "--"}
                          </span>
                        </div>
                        {user.attendance?.note ? (
                          <p className="mt-2 text-xs text-[var(--muted-foreground)]">Attendance note: {user.attendance.note}</p>
                        ) : null}
                      </div>
                    </div>
                  </div>

                  <div className="flex flex-wrap gap-2 text-xs text-[var(--muted-foreground)] 2xl:max-w-[34%] 2xl:justify-end">
                    <span className="rounded-full border border-[var(--panel-border)] bg-[var(--panel)] px-2.5 py-1">
                      Break {formatMinutes(user.attendance?.breakMinutes ?? 0)}
                    </span>
                    <span className="rounded-full border border-[var(--panel-border)] bg-[var(--panel)] px-2.5 py-1">
                      Work {formatMinutes(user.attendance?.workingMinutes ?? 0)}
                    </span>
                  </div>
                </div>

                <div className="mt-4 overflow-hidden rounded-2xl border border-[var(--panel-border)] bg-[var(--panel)]">
                  {user.todaysPlans.length ? (
                    <div className="divide-y divide-[var(--panel-border)]">
                      {(user.todaysPlans ?? []).map((task, index) => {
                        const continuationSummary = getContinuationSummary(task.description);

                        return (
                          <div className="px-4 py-3" key={task.id}>
                            <div className="flex flex-col gap-2">
                              <div className="flex flex-wrap items-center gap-2">
                                <span className="inline-flex h-6 w-6 items-center justify-center rounded-full bg-[#4f5ef7] text-[11px] font-semibold text-white">
                                  {index + 1}
                                </span>
                                <p className="text-sm font-semibold text-[var(--foreground)]">{task.title}</p>
                                <span className={`inline-flex rounded-full border px-2.5 py-1 text-[10px] font-semibold uppercase tracking-[0.18em] ${priorityTone(task.priority)}`}>
                                  {task.priority}
                                </span>
                                <span className={`inline-flex rounded-full border px-2.5 py-1 text-[10px] font-semibold uppercase tracking-[0.18em] ${statusTone(task.status)}`}>
                                  {task.status.replace("_", " ")}
                                </span>
                                {continuationSummary ? <Badge variant="purple">Continued</Badge> : null}
                              </div>

                              <div className="flex flex-wrap gap-x-4 gap-y-1 text-xs text-[var(--muted-foreground)]">
                                <span>Progress {task.completionPercent}%</span>
                                <span>Tracked {formatMinutes(task.trackedMinutes)}</span>
                                <span>Start {formatDateTimeInDhaka(task.actualStart)}</span>
                                <span>End {formatDateTimeInDhaka(task.actualEnd)}</span>
                                <span>Note {task.note || "No note"}</span>
                              </div>

                              {getTaskBody(task.description) ? (
                                <p className="text-sm leading-6 text-[var(--muted-foreground)]">{getTaskBody(task.description)}</p>
                              ) : null}

                              {continuationSummary ? (
                                <div className="flex flex-wrap gap-2 text-[11px] text-slate-600">
                                  <span className="rounded-full border border-violet-200 bg-violet-50 px-2.5 py-1">
                                    From {continuationSummary.sourceDate}
                                  </span>
                                  <span className="rounded-full border border-violet-200 bg-violet-50 px-2.5 py-1">
                                    {continuationSummary.totalDays} days
                                  </span>
                                  <span className="rounded-full border border-violet-200 bg-violet-50 px-2.5 py-1">
                                    Overall {formatMinutes(continuationSummary.totalTrackedMinutes)}
                                  </span>
                                </div>
                              ) : null}

                              {continuationSummary?.dailyLogs?.length ? (
                                <div className="rounded-2xl border border-violet-200 bg-violet-50/70 p-3">
                                  <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-violet-700">
                                    Daily Work Log
                                  </p>
                                  <div className="mt-2 grid gap-2 md:grid-cols-2 2xl:grid-cols-3">
                                    {continuationSummary.dailyLogs.map((entry) => (
                                      <div
                                        className="rounded-2xl border border-violet-200 bg-white px-3 py-2 text-xs text-slate-700"
                                        key={`${task.id}-${entry.date}`}
                                      >
                                        <p className="font-semibold text-violet-700">{entry.date}</p>
                                        <p className="mt-1">{entry.progress}% complete</p>
                                        <p>{formatMinutes(entry.trackedMinutes)}</p>
                                        <p className="mt-1 text-[var(--muted-foreground)]">{entry.note || "No note"}</p>
                                      </div>
                                    ))}
                                  </div>
                                  {continuationSummary.lastNote ? (
                                    <p className="mt-2 text-xs text-[var(--muted-foreground)]">
                                      Last note: {continuationSummary.lastNote}
                                    </p>
                                  ) : null}
                                </div>
                              ) : null}
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  ) : (
                    <div className="px-4 py-4 text-sm text-[var(--muted-foreground)]">
                      No morning plan added yet for today.
                    </div>
                  )}
                </div>
              </section>
            ))}
          </div>
        ) : (
          <div className="rounded-3xl border border-dashed border-[var(--panel-border)] bg-[var(--panel-muted)] px-5 py-8 text-center text-sm text-[var(--muted-foreground)]">
            No employee matched the current filter.
          </div>
        )}
      </CardContent>
    </Card>
  );
}
