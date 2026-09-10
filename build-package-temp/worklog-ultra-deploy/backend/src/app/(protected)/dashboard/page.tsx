import Link from "next/link";
import { Check, CheckCircle2, CircleAlert, ClipboardList, Clock3, Play, PlayCircle, TimerReset } from "lucide-react";
import { DashboardProgressCard } from "@/components/dashboard/dashboard-progress-card";
import { DashboardRecurringQuickAdd } from "@/components/dashboard/dashboard-recurring-quick-add";
import { DashboardTaskNotifier } from "@/components/dashboard/dashboard-task-notifier";
import { DashboardTaskTimerAction } from "@/components/dashboard/dashboard-task-timer-action";
import { DashboardWorkspaceModal } from "@/components/dashboard/dashboard-workspace-modal";
import { requireUser } from "@/lib/auth/server";
import { canUserEditReportDate, getAssignableUsers, getCurrentUserAttendanceSnapshot, getDashboardData, getDepartments, getPlanSuggestions, getPlanWithReports } from "@/lib/worklog";
import { formatDateTimeInDhaka, getGreetingInDhaka, toDateOnly } from "@/lib/utils";

export const dynamic = "force-dynamic";

type DashboardTask = Awaited<ReturnType<typeof getDashboardData>>["tasks"][number];

const statCardStyles = [
  {
    icon: ClipboardList,
    iconWrap: "bg-blue-50 text-blue-600",
  },
  {
    icon: CheckCircle2,
    iconWrap: "bg-emerald-50 text-emerald-600",
  },
  {
    icon: PlayCircle,
    iconWrap: "bg-amber-50 text-amber-600",
  },
  {
    icon: TimerReset,
    iconWrap: "bg-rose-50 text-rose-500",
  },
];

const notices = [
  "Submit your morning plan before the first work block starts.",
  "Complete your evening report before day close.",
  "Keep high-priority tasks updated so progress stays visible.",
];

function getTaskStatus(task: DashboardTask) {
  const latest = task.updates[0];

  if (!latest) {
    return {
      label: "Pending",
      chip: "bg-amber-50 text-amber-700",
      actionTone: "bg-[#19a46b]",
      actionIcon: Play,
    };
  }

  if (latest.status === "done") {
    return {
      label: "Completed",
      chip: "bg-emerald-50 text-emerald-700",
      actionTone: "bg-[#17a36b]",
      actionIcon: Check,
    };
  }

  if (latest.status === "in_progress") {
    return {
      label: "In Progress",
      chip: "bg-blue-50 text-blue-700",
      actionTone: "bg-[#2767db]",
      actionIcon: Play,
    };
  }

  return {
    label: "Pending",
    chip: "bg-amber-50 text-amber-700",
    actionTone: "bg-[#19a46b]",
    actionIcon: Play,
  };
}

function getPriorityTone(priority: string) {
  if (priority === "high" || priority === "critical") {
    return "bg-rose-50 text-rose-700";
  }

  if (priority === "normal") {
    return "bg-amber-50 text-amber-700";
  }

  return "bg-emerald-50 text-emerald-700";
}

function formatPriority(priority: string) {
  if (priority === "critical") return "High";
  if (priority === "normal") return "Medium";
  return priority.charAt(0).toUpperCase() + priority.slice(1);
}

function formatHoursAndMinutes(hoursLabel: string) {
  const numericHours = Number(hoursLabel.replace("h", ""));

  if (!Number.isFinite(numericHours) || numericHours <= 0) {
    return "0h 00m";
  }

  const hours = Math.floor(numericHours);
  const minutes = Math.round((numericHours - hours) * 60);
  return `${hours}h ${String(minutes).padStart(2, "0")}m`;
}

function formatDurationFromMinutes(totalMinutes: number) {
  const safeMinutes = Math.max(0, totalMinutes);
  const hours = Math.floor(safeMinutes / 60);
  const minutes = safeMinutes % 60;
  return `${hours}h ${String(minutes).padStart(2, "0")}m`;
}

function formatDashboardDate(value: Date) {
  return new Intl.DateTimeFormat("en-BD", {
    timeZone: "Asia/Dhaka",
    weekday: "long",
    day: "numeric",
    month: "long",
    year: "numeric",
  }).format(value);
}

function formatTimeOnly(value?: Date | null) {
  if (!value) return "--:-- --";
  return formatDateTimeInDhaka(value).split(", ").pop() ?? "--:-- --";
}

function formatEstimatedTime(task: DashboardTask) {
  const trackedMinutes = task.updates[0]?.trackedMinutes ?? 0;
  if (trackedMinutes > 0) {
    return formatDurationFromMinutes(trackedMinutes);
  }
  return "30m";
}

function formatPlannedTime(task: DashboardTask) {
  const start = task.updates[0]?.actualStart;
  const end = task.updates[0]?.actualEnd;

  if (start && end) {
    return `${formatTimeOnly(start)} - ${formatTimeOnly(end)}`;
  }

  if (start) {
    return `${formatTimeOnly(start)} - --:-- --`;
  }

  return "--:-- --";
}

export default async function DashboardPage() {
  const user = await requireUser();
  const reportDate = toDateOnly();

  const [data, attendance, departments, reportTasks, suggestions, assignableUsers] = await Promise.all([
    getDashboardData(user.id, user.role, user.departmentId),
    getCurrentUserAttendanceSnapshot(user.id),
    getDepartments(),
    getPlanWithReports(user.id),
    getPlanSuggestions(user.id, user.departmentId),
    getAssignableUsers(),
  ]);

  const editAccess = await canUserEditReportDate(
    { id: user.id, role: user.role },
    new Date(reportDate),
    reportTasks.map((task) => task.id),
  );

  const today = new Date();
  const completedTasks = data.tasks.filter((task) => task.updates[0]?.status === "done").length;
  const inProgressTasks = data.tasks.filter((task) => task.updates[0]?.status === "in_progress").length;
  const pendingTasks = Math.max(0, data.kpis.pendingItems - inProgressTasks);
  const plannedTasks = data.kpis.tasksPlanned;
  const workedMinutes = data.tasks.reduce((sum, task) => sum + (task.updates[0]?.trackedMinutes ?? 0), 0);
  const targetMinutes = Math.max(plannedTasks * 60, 8 * 60);
  const remainingMinutes = Math.max(targetMinutes - workedMinutes, 0);
  const activeTasks = data.tasks.filter((task) => task.updates[0]?.status !== "done");
  const topTasks = activeTasks.slice(0, 6);
  const urgentTasks = activeTasks.filter((task) => ["high", "critical"].includes(task.priority)).slice(0, 3);
  const attendanceStatusLabel =
    attendance?.checkInAt && !attendance?.checkOutAt
      ? "You are checked in"
      : attendance?.checkInAt && attendance?.checkOutAt
        ? "Attendance completed"
        : "No attendance logged yet";

  const statCards = [
    {
      title: "Planned Tasks",
      value: plannedTasks,
      linkLabel: "View all",
      href: "/dashboard/plan",
    },
    {
      title: "Completed Tasks",
      value: completedTasks,
      linkLabel: "View all",
      href: "/dashboard/report",
    },
    {
      title: "In Progress Tasks",
      value: inProgressTasks,
      linkLabel: "View all",
      href: "/dashboard/report",
    },
    {
      title: "Pending Tasks",
      value: pendingTasks,
      linkLabel: "View all",
      href: "/dashboard/report",
    },
    {
      title: "Actual Work Time",
      value: formatHoursAndMinutes(data.kpis.worklogHours),
      linkLabel: "View details",
      href: "/dashboard/history",
    },
  ];

  return (
    <div className="space-y-4">
      <DashboardTaskNotifier
        tasks={data.tasks.map((task) => ({
          id: task.id,
          title: task.taskTitle,
          status: task.updates[0]?.status ?? "pending",
          trackedMinutes: task.updates[0]?.trackedMinutes ?? 0,
          actualEnd: task.updates[0]?.actualEnd?.toISOString() ?? null,
        }))}
      />
      <section className="flex flex-col gap-3 md:flex-row md:items-start md:justify-between">
        <div>
          <h1 className="text-[2rem] font-bold tracking-[-0.03em] text-[var(--foreground)]">
            {getGreetingInDhaka()}, {user.name}
          </h1>
          <p className="mt-1 text-sm text-[var(--muted-foreground)]">{formatDashboardDate(today)}</p>
        </div>
        <div className="flex flex-wrap gap-3">
          <DashboardWorkspaceModal
            canEditReport={editAccess.allowed}
            currentUserId={user.id}
            departments={departments}
            initialTasks={[]}
            assignableUsers={assignableUsers}
            reportDate={reportDate}
            reportTasks={reportTasks.map((task) => ({
              id: task.id,
              taskTitle: task.taskTitle,
              updates: task.updates.map((update) => ({
                status: update.status,
                note: update.note,
                completionPercent: update.completionPercent,
                trackedMinutes: update.trackedMinutes,
                actualStart: update.actualStart,
                actualEnd: update.actualEnd,
                difficultyLevel: update.difficultyLevel,
              })),
            }))}
            role={user.role}
            suggestions={suggestions}
            userDepartmentId={user.departmentId}
          />
          <Link
            className="inline-flex items-center gap-2 rounded-2xl border border-[var(--panel-border)] bg-[var(--panel)] px-5 py-3 text-sm font-semibold text-[var(--foreground)] transition hover:bg-[var(--panel-alt)]"
            href="/dashboard/report"
          >
            Update Daily Report
          </Link>
        </div>
      </section>

      <section className="grid gap-4 md:grid-cols-2 xl:grid-cols-5">
        {statCards.map((item, index) => {
          const style = statCardStyles[index % statCardStyles.length];
          const Icon = style.icon;

          return (
            <Link
              className="rounded-[22px] border border-[var(--panel-border)] bg-[var(--panel)] p-4 shadow-[var(--shadow)] transition hover:-translate-y-0.5 hover:shadow-[0_18px_38px_rgba(148,163,184,0.16)]"
              href={item.href}
              key={item.title}
            >
              <div className="flex items-center gap-3">
                <div className={`flex h-12 w-12 items-center justify-center rounded-2xl ${style.iconWrap}`}>
                  <Icon className="h-6 w-6" />
                </div>
                <div>
                  <p className="text-[1.65rem] font-bold leading-none text-[var(--foreground)]">{item.value}</p>
                  <p className="mt-1 text-sm font-medium text-[var(--muted-foreground)]">{item.title}</p>
                </div>
              </div>
              <div className="mt-4 border-t border-[var(--panel-border)] pt-3 text-sm font-medium text-[var(--muted-foreground)]">{item.linkLabel}</div>
            </Link>
          );
        })}
      </section>

      <section className="grid items-start gap-4 xl:grid-cols-[minmax(0,1.82fr)_360px]">
        <div className="space-y-4">
          <DashboardRecurringQuickAdd
            currentUserDepartmentId={user.departmentId || departments[0]?.id || ""}
            currentUserId={user.id}
            existingTaskTitles={activeTasks.map((task) => task.taskTitle)}
          />

          <div className="overflow-hidden rounded-[28px] border border-[var(--panel-border)] bg-[var(--panel)] shadow-[var(--shadow)]">
            <div className="flex flex-col gap-2 border-b border-[var(--panel-border)] px-5 py-5 sm:flex-row sm:items-center sm:justify-between">
              <div>
                <h2 className="text-xl font-bold text-[var(--foreground)]">Today&apos;s Work Plan</h2>
              </div>
              <p className="text-sm font-medium text-[var(--muted-foreground)]">{formatDashboardDate(today)}</p>
            </div>

            <div className="overflow-x-auto">
              <table className="min-w-full text-left">
                <thead className="bg-[var(--panel-alt)]">
                  <tr className="text-sm text-[var(--muted-foreground)]">
                    <th className="px-5 py-4 font-semibold">Task Name</th>
                    <th className="px-4 py-4 font-semibold">Priority</th>
                    <th className="px-4 py-4 font-semibold">Estimated Time</th>
                    <th className="px-4 py-4 font-semibold">Planned Time</th>
                    <th className="px-4 py-4 font-semibold">Status</th>
                    <th className="px-4 py-4 font-semibold">Action</th>
                  </tr>
                </thead>
                <tbody>
                  {topTasks.length ? (
                    topTasks.map((task) => {
                      const status = getTaskStatus(task);
                      const ActionIcon = status.actionIcon;

                      return (
                        <tr className="border-t border-[var(--panel-border)] align-top" key={task.id}>
                          <td className="px-5 py-4">
                            <p className="text-sm font-semibold text-[var(--foreground)]">{task.taskTitle}</p>
                            <p className="mt-1 text-sm text-[var(--muted-foreground)]">{task.user.department?.name ?? "General"}</p>
                          </td>
                          <td className="px-4 py-4">
                            <span className={`inline-flex rounded-full px-3 py-1 text-xs font-semibold ${getPriorityTone(task.priority)}`}>
                              {formatPriority(task.priority)}
                            </span>
                          </td>
                          <td className="px-4 py-4 text-sm font-medium text-[var(--foreground)]">{formatEstimatedTime(task)}</td>
                          <td className="px-4 py-4 text-sm font-medium text-[var(--foreground)]">{formatPlannedTime(task)}</td>
                          <td className="px-4 py-4">
                            <span className={`inline-flex rounded-full px-3 py-1 text-xs font-semibold ${status.chip}`}>
                              {status.label}
                            </span>
                          </td>
                          <td className="px-4 py-4">
                            <DashboardTaskTimerAction
                              canEdit={editAccess.allowed}
                              initialActualEnd={task.updates[0]?.actualEnd ?? null}
                              initialActualStart={task.updates[0]?.actualStart ?? null}
                              initialStatus={task.updates[0]?.status ?? "pending"}
                              initialTrackedMinutes={task.updates[0]?.trackedMinutes ?? 0}
                              reportDate={reportDate}
                              taskId={task.id}
                            />
                          </td>
                        </tr>
                      );
                    })
                  ) : (
                    <tr>
                      <td className="px-5 py-8 text-sm text-[var(--muted-foreground)]" colSpan={6}>
                        No tasks added yet for today. Start by creating today&apos;s work plan.
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>

            <div className="border-t border-[var(--panel-border)] px-5 py-4 text-center">
              <Link className="text-sm font-semibold text-[#4f5ef7] hover:text-[#3f4ede]" href="/dashboard/plan">
                View All Tasks
              </Link>
            </div>
          </div>

          <div className="grid gap-4 xl:grid-cols-2">
            <div className="rounded-[26px] border border-[var(--panel-border)] bg-[var(--panel)] p-5 shadow-[var(--shadow)]">
              <div className="flex items-center gap-2">
                <CircleAlert className="h-5 w-5 text-rose-500" />
                <h3 className="text-xl font-bold text-[var(--foreground)]">High Priority Tasks</h3>
              </div>
              <div className="mt-5 space-y-4">
                {urgentTasks.length ? (
                  urgentTasks.map((task) => (
                    <div className="flex items-start justify-between gap-4" key={task.id}>
                      <div>
                        <p className="text-sm font-semibold text-[var(--foreground)]">{task.taskTitle}</p>
                        <p className="mt-1 text-sm text-[var(--muted-foreground)]">{task.user.department?.name ?? "General"}</p>
                      </div>
                      <span className="text-sm font-medium text-rose-500">High</span>
                    </div>
                  ))
                ) : (
                  <p className="text-sm text-[var(--muted-foreground)]">No high-priority tasks right now.</p>
                )}
              </div>
            </div>

            <div className="rounded-[26px] border border-[var(--panel-border)] bg-[var(--panel)] p-5 shadow-[var(--shadow)]">
              <div className="flex items-center justify-between gap-3">
                <h3 className="text-xl font-bold text-[var(--foreground)]">Recent Notices</h3>
                <Link className="text-sm font-semibold text-[#4f5ef7] hover:text-[#3f4ede]" href="/dashboard/help">
                  View all
                </Link>
              </div>
              <div className="mt-5 space-y-4">
                {notices.map((notice, index) => (
                  <div className="flex items-start justify-between gap-4 border-b border-[var(--panel-border)] pb-3 last:border-b-0 last:pb-0" key={notice}>
                    <p className="text-sm font-medium text-[var(--foreground)]">{notice}</p>
                    <span className="shrink-0 text-xs font-medium text-[var(--muted-foreground)]">0{index + 1}</span>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>

        <div className="space-y-4">
          <DashboardProgressCard
            completedTasks={completedTasks}
            inProgressTasks={inProgressTasks}
            pendingTasks={pendingTasks}
            plannedTasks={plannedTasks}
          />

          <div className="rounded-[24px] border border-[var(--panel-border)] bg-[var(--panel)] p-4 shadow-[var(--shadow)]">
            <h3 className="text-[1.05rem] font-bold text-[var(--foreground)]">Time Summary</h3>
            <div className="mt-4 space-y-3">
              {[
                { label: "Planned Work Time", value: formatDurationFromMinutes(targetMinutes) },
                { label: "Actual Work Time", value: formatHoursAndMinutes(data.kpis.worklogHours) },
                { label: "Break Time", value: "30m" },
                { label: "Remaining Time", value: formatDurationFromMinutes(remainingMinutes) },
              ].map((item) => (
                <div className="flex items-center justify-between gap-4 border-b border-[var(--panel-border)] pb-2.5 last:border-b-0 last:pb-0" key={item.label}>
                  <span className="text-[13px] font-medium text-[var(--muted-foreground)]">{item.label}</span>
                  <span className={`text-[13px] font-bold whitespace-nowrap ${item.label === "Remaining Time" ? "text-rose-500" : "text-[var(--foreground)]"}`}>
                    {item.value}
                  </span>
                </div>
              ))}
            </div>
          </div>

          <div className="rounded-[24px] border border-[var(--panel-border)] bg-[var(--panel)] p-4 shadow-[var(--shadow)]">
            <h3 className="text-[1.05rem] font-bold text-[var(--foreground)]">Attendance</h3>
            <div className="mt-3 overflow-hidden rounded-[20px] border border-[var(--panel-border)]">
              <div className="grid grid-cols-2 divide-x divide-[var(--panel-border)]">
                <div className="px-4 py-3.5">
                  <p className="text-[13px] text-[var(--muted-foreground)]">Check In</p>
                  <div className="mt-2 flex items-center gap-2">
                    <span className="inline-flex h-7 w-7 items-center justify-center rounded-full bg-emerald-500 text-white">
                      <Check className="h-4 w-4" />
                    </span>
                    <p className="text-[1.55rem] font-bold tracking-[-0.03em] text-[var(--foreground)]">{formatTimeOnly(attendance?.checkInAt)}</p>
                  </div>
                </div>
                <div className="px-4 py-3.5">
                  <p className="text-[13px] text-[var(--muted-foreground)]">Check Out</p>
                  <div className="mt-2 flex items-center gap-2">
                    <span className="inline-flex h-7 w-7 items-center justify-center rounded-full border border-[var(--panel-border)] bg-[var(--panel-alt)] text-[var(--muted-foreground)]">
                      <Clock3 className="h-4 w-4" />
                    </span>
                    <p className="text-[1.55rem] font-bold tracking-[-0.03em] text-[var(--foreground)]">{formatTimeOnly(attendance?.checkOutAt)}</p>
                  </div>
                </div>
              </div>
              <div className="bg-emerald-50 px-4 py-2.5 text-center text-sm font-semibold text-emerald-700">{attendanceStatusLabel}</div>
            </div>
          </div>
        </div>
      </section>
    </div>
  );
}
