"use client";

import { useMemo, useState } from "react";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { formatDateTimeInDhaka, formatMinutes } from "@/lib/utils";

type MonitorDepartment = {
  id: string;
  name: string;
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

function roleLabel(role: string) {
  if (role === "manager") return "Team Head";
  if (role === "admin") return "CEO/Admin";
  if (role === "hr") return "HR";
  return "Employee";
}

export function DirectoryCenter({
  departments,
  users,
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

  const totalTasks = filteredUsers.reduce((sum, user) => sum + user.taskCount, 0);
  const totalDone = filteredUsers.reduce((sum, user) => sum + user.completedTaskCount, 0);
  const totalTrackedMinutes = filteredUsers.reduce((sum, user) => sum + user.totalTrackedMinutes, 0);

  return (
    <Card>
      <CardHeader className="gap-4">
        <div className="flex flex-col gap-2 lg:flex-row lg:items-end lg:justify-between">
          <div>
            <CardTitle>Work Monitor</CardTitle>
            <CardDescription>
              Review today&apos;s department plans, task progress, tracked time, and latest work notes with simple department and employee filters.
            </CardDescription>
          </div>
          <div className="grid gap-3 sm:grid-cols-2">
            <div className="min-w-[220px]">
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
                  {departments.map((department) => (
                    <SelectItem key={department.id} value={department.id}>
                      {department.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="min-w-[220px]">
              <p className="mb-1.5 text-xs font-semibold uppercase tracking-[0.18em] text-[var(--muted-foreground)]">Employee</p>
              <Select onValueChange={setSelectedUserId} value={selectedUserId}>
                <SelectTrigger>
                  <SelectValue placeholder="Select employee" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All employees</SelectItem>
                  {departmentScopedUsers.map((user) => (
                    <SelectItem key={user.id} value={user.id}>
                      {user.name} - {user.departmentName}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>
        </div>
        <div className="grid gap-3 md:grid-cols-3">
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
          <div className="space-y-4">
            {filteredUsers.map((user) => (
              <section key={user.id} className="overflow-hidden rounded-3xl border border-[var(--panel-border)] bg-[var(--panel-muted)]">
                <div className="p-5">
                <div className="flex items-start gap-4">
                  <Avatar className="h-14 w-14">
                    {user.avatarUrl ? <AvatarImage alt={user.name} src={user.avatarUrl} /> : null}
                    <AvatarFallback>{getInitials(user.name)}</AvatarFallback>
                  </Avatar>
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <p className="text-lg font-semibold text-[var(--foreground)]">{user.name}</p>
                      <Badge variant="secondary">{roleLabel(user.role)}</Badge>
                    </div>
                    <p className="mt-1 text-sm font-medium text-blue-600">{user.departmentName}</p>
                    <p className="text-sm text-[var(--muted-foreground)]">{user.designation ?? roleLabel(user.role)}</p>
                    <div className="mt-3 flex flex-wrap gap-2 text-xs text-[var(--muted-foreground)]">
                      <span className="rounded-full border border-[var(--panel-border)] bg-[var(--panel)] px-2.5 py-1">
                        {user.taskCount} task
                      </span>
                      <span className="rounded-full border border-[var(--panel-border)] bg-[var(--panel)] px-2.5 py-1">
                        {user.completedTaskCount} done
                      </span>
                      <span className="rounded-full border border-[var(--panel-border)] bg-[var(--panel)] px-2.5 py-1">
                        {formatMinutes(user.totalTrackedMinutes)}
                      </span>
                    </div>
                  </div>
                </div>
                </div>

                <div className="border-t border-[var(--panel-border)] bg-[var(--panel)]">
                  {user.todaysPlans.length ? (
                    <div className="overflow-x-auto">
                      <table className="min-w-full text-left">
                        <thead className="bg-[var(--panel-alt)]">
                          <tr className="text-xs uppercase tracking-[0.18em] text-[var(--muted-foreground)]">
                            <th className="px-5 py-3 font-semibold">#</th>
                            <th className="px-4 py-3 font-semibold">Task</th>
                            <th className="px-4 py-3 font-semibold">Priority</th>
                            <th className="px-4 py-3 font-semibold">Status</th>
                            <th className="px-4 py-3 font-semibold">Progress</th>
                            <th className="px-4 py-3 font-semibold">Tracked</th>
                            <th className="px-4 py-3 font-semibold">Started</th>
                            <th className="px-4 py-3 font-semibold">Ended</th>
                            <th className="px-4 py-3 font-semibold">Latest Note</th>
                          </tr>
                        </thead>
                        <tbody>
                          {user.todaysPlans.map((task, index) => (
                            <tr className="border-t border-[var(--panel-border)] align-top" key={task.id}>
                              <td className="px-5 py-4">
                                <span className="inline-flex h-7 w-7 items-center justify-center rounded-full bg-[#4f5ef7] text-xs font-semibold text-white">
                                  {index + 1}
                                </span>
                              </td>
                              <td className="px-4 py-4">
                                <p className="min-w-[220px] text-sm font-semibold text-[var(--foreground)]">{task.title}</p>
                                {task.description ? (
                                  <p className="mt-1 max-w-[320px] text-sm leading-6 text-[var(--muted-foreground)]">{task.description}</p>
                                ) : null}
                              </td>
                              <td className="px-4 py-4">
                                <span className={`inline-flex rounded-full border px-2.5 py-1 text-[11px] font-semibold uppercase tracking-[0.18em] ${priorityTone(task.priority)}`}>
                                  {task.priority}
                                </span>
                              </td>
                              <td className="px-4 py-4">
                                <span className={`inline-flex rounded-full border px-2.5 py-1 text-[11px] font-semibold uppercase tracking-[0.18em] ${statusTone(task.status)}`}>
                                  {task.status.replace("_", " ")}
                                </span>
                              </td>
                              <td className="px-4 py-4 text-sm font-medium text-[var(--foreground)]">{task.completionPercent}%</td>
                              <td className="px-4 py-4 text-sm font-medium text-[var(--foreground)]">{formatMinutes(task.trackedMinutes)}</td>
                              <td className="px-4 py-4 text-sm font-medium text-[var(--foreground)]">{formatDateTimeInDhaka(task.actualStart)}</td>
                              <td className="px-4 py-4 text-sm font-medium text-[var(--foreground)]">{formatDateTimeInDhaka(task.actualEnd)}</td>
                              <td className="px-4 py-4">
                                <p className="min-w-[220px] text-sm leading-6 text-[var(--foreground)]">
                                  {task.note || "No note"}
                                </p>
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  ) : (
                    <div className="px-5 py-5 text-sm text-[var(--muted-foreground)]">
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
