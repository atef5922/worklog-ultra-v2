import Image from "next/image";
import Link from "next/link";
import { Check, CheckCircle2, CircleAlert, ClipboardList, Clock3, Play, PlayCircle, TimerReset } from "lucide-react";
import { DashboardProgressCard } from "@/components/dashboard/dashboard-progress-card";
import { DashboardRecurringQuickAdd } from "@/components/dashboard/dashboard-recurring-quick-add";
import { DashboardTaskNotifier } from "@/components/dashboard/dashboard-task-notifier";
import { DashboardTaskTimerAction } from "@/components/dashboard/dashboard-task-timer-action";
import { DashboardWorkdayTimer } from "@/components/dashboard/dashboard-workday-timer";
import { DashboardWorkspaceModal } from "@/components/dashboard/dashboard-workspace-modal";
import { AssignmentReviewControls } from "@/components/dashboard/assignment-review-controls";
import { TaskManageControls } from "@/components/dashboard/task-manage-controls";
import { requireUser } from "@/lib/auth/server";
import { extractAssignmentReviewReason } from "@/lib/assignment-review";
import { isMovedToHistory, stripHistoryMeta } from "@/lib/task-history-shared";
import { isRecurringTaskDescription, stripRecurringTaskMeta } from "@/lib/recurring-task-templates";
import { extractContinuationMeta, stripContinuationMeta } from "@/lib/task-continuation";
import { canUserEditReportDate, getAssignableUsers, getCurrentUserAttendanceSnapshot, getDashboardData, getDepartments, getPlanSuggestions, getPlanWithReports } from "@/lib/worklog";
import { formatDateTimeInDhaka, toDateOnly } from "@/lib/utils";

export const dynamic = "force-dynamic";

type DashboardTask = Awaited<ReturnType<typeof getDashboardData>>["tasks"][number];

const statCardStyles = [
  {
    icon: ClipboardList,
    iconWrap: "bg-[#eef2ff] text-[#3148d8]",
    card: "bg-white",
    border: "border-[#d8e2ff]",
    shadow: "shadow-[0_22px_42px_rgba(79,94,247,0.14)]",
    accent: "bg-[#4f5ef7]",
    label: "Planned flow",
    art: "/vectors/Planned%20Tasks.png",
  },
  {
    icon: CheckCircle2,
    iconWrap: "bg-[#e8fbf4] text-[#0f8f68]",
    card: "bg-white",
    border: "border-[#d5f7e9]",
    shadow: "shadow-[0_22px_42px_rgba(16,185,129,0.14)]",
    accent: "bg-[#17b26a]",
    label: "Completed",
    art: "/vectors/Completed%20Tasks.png",
  },
  {
    icon: PlayCircle,
    iconWrap: "bg-[#fff5e6] text-[#dc7f07]",
    card: "bg-white",
    border: "border-[#ffe0ab]",
    shadow: "shadow-[0_22px_42px_rgba(245,158,11,0.14)]",
    accent: "bg-[#f59e0b]",
    label: "Running now",
    art: "/vectors/In%20Progress%20Tasks.png",
  },
  {
    icon: TimerReset,
    iconWrap: "bg-[#fff0f4] text-[#d91c4a]",
    card: "bg-white",
    border: "border-[#ffd0da]",
    shadow: "shadow-[0_22px_42px_rgba(244,63,94,0.14)]",
    accent: "bg-[#f43f5e]",
    label: "Need action",
    art: "/vectors/Pending%20Tasks.png",
  },
  {
    icon: Clock3,
    iconWrap: "bg-[#f3eeff] text-[#7041e6]",
    card: "bg-white",
    border: "border-[#e1d6ff]",
    shadow: "shadow-[0_22px_42px_rgba(139,92,246,0.14)]",
    accent: "bg-[#8b5cf6]",
    label: "Work time",
    art: "/vectors/Actual%20Work%20Time.png",
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
    return "border border-rose-300 bg-gradient-to-r from-rose-500 via-pink-500 to-red-500 text-white shadow-[0_10px_22px_rgba(244,63,94,0.24)]";
  }

  if (priority === "normal") {
    return "border border-amber-300 bg-gradient-to-r from-amber-400 via-orange-400 to-yellow-500 text-slate-950 shadow-[0_10px_22px_rgba(245,158,11,0.22)]";
  }

  return "border border-emerald-300 bg-gradient-to-r from-emerald-500 via-teal-500 to-green-500 text-white shadow-[0_10px_22px_rgba(16,185,129,0.22)]";
}

function formatPriority(priority: string) {
  if (priority === "critical") return "High";
  if (priority === "normal") return "Medium";
  return priority.charAt(0).toUpperCase() + priority.slice(1);
}

function priorityRank(priority: string) {
  if (priority === "critical") return 0;
  if (priority === "high") return 1;
  if (priority === "normal") return 2;
  return 3;
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

function getContinuationSummary(task: DashboardTask) {
  const continuationMeta = extractContinuationMeta(task.taskDescription);

  if (!continuationMeta) {
    return null;
  }

  const totalDays = Math.max(
    continuationMeta.daysActive || 0,
    continuationMeta.dailyLogs?.length || 0,
    1,
  );
  const totalTrackedMinutes = (continuationMeta.dailyLogs ?? []).reduce((sum, entry) => sum + entry.trackedMinutes, 0);
  const lastWorkedDate =
    continuationMeta.dailyLogs && continuationMeta.dailyLogs.length
      ? continuationMeta.dailyLogs[continuationMeta.dailyLogs.length - 1]?.date
      : continuationMeta.sourceDate;

  return {
    totalDays,
    totalTrackedMinutes,
    lastWorkedDate,
  };
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

function getTaskNote(task: DashboardTask) {
  const latestUpdateNote = task.updates[0]?.note?.trim() ?? "";
  if (latestUpdateNote) {
    return latestUpdateNote;
  }

  const continuationNote = extractContinuationMeta(task.taskDescription)?.note?.trim() ?? "";
  if (continuationNote) {
    return continuationNote;
  }

  return stripHistoryMeta(stripRecurringTaskMeta(stripContinuationMeta(task.taskDescription))).trim();
}

function getMotivationalMessage(input: {
  name: string;
  role: "employee" | "hr" | "manager" | "admin";
  plannedTasks: number;
  completedTasks: number;
  pendingTasks: number;
  trackedMinutes: number;
}) {
  function buildHash(value: string) {
    return value.split("").reduce((sum, char, index) => sum + char.charCodeAt(0) * (index + 17), 0);
  }

  const dayKey = toDateOnly();
  const seed = `${input.name}-${input.role}-${dayKey}-${input.plannedTasks}-${input.completedTasks}-${input.pendingTasks}-${input.trackedMinutes}`;

  if (input.role === "manager" || input.role === "admin") {
    return {
      message: `Hello ${input.name}, hope your day goes well today.`,
    };
  }

  if (input.role === "hr") {
    const hrPool = [
      `Hello ${input.name}, hope your day goes smoothly today.`,
      `Hello ${input.name}, wishing you a calm and productive day.`,
      `Hello ${input.name}, hope today moves well for you.`,
      `Hello ${input.name}, wishing you a good day ahead.`,
    ];

    return {
      message: hrPool[buildHash(seed) % hrPool.length],
    };
  }

  const employeePool = [
    `Hello ${input.name}, your next good step can make today count.`,
    `Hello ${input.name}, stay steady today and your work will speak for you.`,
    `Hello ${input.name}, one focused effort today can change the whole day.`,
    `Hello ${input.name}, keep moving today, your progress is building.`,
    `Hello ${input.name}, today is a good day to finish something meaningful.`,
    `Hello ${input.name}, your consistency today can put you ahead.`,
    `Hello ${input.name}, keep your pace today and good results will follow.`,
    `Hello ${input.name}, one smart move today can set the tone for everything else.`,
    `Hello ${input.name}, keep your head clear today and the work will flow better.`,
    `Hello ${input.name}, your effort today can become tomorrow's advantage.`,
    `Hello ${input.name}, small wins today can build a very strong day.`,
    `Hello ${input.name}, stay locked in today, you are capable of more than enough.`,
  ];

  return {
    message: employeePool[buildHash(seed) % employeePool.length],
  };
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
  const activeTasks = [...data.tasks]
    .filter((task) => task.updates[0]?.status !== "done" && !isMovedToHistory(task.taskDescription))
    .sort((left, right) => priorityRank(left.priority) - priorityRank(right.priority) || left.taskTitle.localeCompare(right.taskTitle));
  const stickyCompletedTasks = data.tasks
    .filter((task) => {
      if (task.updates[0]?.status !== "done") {
        return false;
      }

      if (isMovedToHistory(task.taskDescription)) {
        return false;
      }

      return Boolean(extractContinuationMeta(task.taskDescription) || isRecurringTaskDescription(task.taskDescription));
    })
    .sort((left, right) => priorityRank(left.priority) - priorityRank(right.priority) || left.taskTitle.localeCompare(right.taskTitle));
  const topTasks = [...activeTasks, ...stickyCompletedTasks].slice(0, 6);
  const urgentTasks = activeTasks.filter((task) => ["high", "critical"].includes(task.priority)).slice(0, 3);
  const attendanceStatusLabel =
    attendance?.checkInAt && !attendance?.checkOutAt
      ? "You are checked in"
      : attendance?.checkInAt && attendance?.checkOutAt
        ? "Attendance completed"
        : "No attendance logged yet";
  const motivation = getMotivationalMessage({
    name: user.name,
    role: user.role,
    plannedTasks,
    completedTasks,
    pendingTasks,
    trackedMinutes: workedMinutes,
  });

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
      <section className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
        <div>
          <h1 className="max-w-4xl text-lg font-semibold leading-tight text-[var(--foreground)] md:text-xl">
            {motivation.message}
          </h1>
          <p className="mt-1.5 text-sm font-medium text-[var(--muted-foreground)]">{formatDashboardDate(today)}</p>
        </div>
        <div className="flex w-full flex-wrap gap-3 md:w-auto md:justify-end xl:flex-nowrap">
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
          <div className="shrink-0">
            <DashboardWorkdayTimer
              currentUserId={user.id}
              initialAttendance={
                attendance
                  ? {
                      status: attendance.status,
                      note: attendance.note ?? "",
                      breakMinutes: attendance.breakMinutes ?? 0,
                      checkInAt: attendance.checkInAt?.toISOString() ?? null,
                      checkOutAt: attendance.checkOutAt?.toISOString() ?? null,
                    }
                  : null
              }
              mode="button"
            />
          </div>
        </div>
      </section>

      <section className="grid gap-4 md:grid-cols-2 xl:grid-cols-5">
        {statCards.map((item, index) => {
          const style = statCardStyles[index % statCardStyles.length];
          const Icon = style.icon;

          return (
            <Link
              className={`group relative overflow-hidden rounded-[22px] border p-4 transition hover:-translate-y-0.5 ${style.card} ${style.border} ${style.shadow}`}
              href={item.href}
              key={item.title}
            >
              <div className={`absolute inset-x-0 top-0 h-1.5 ${style.accent}`} />
              <div className="pointer-events-none absolute inset-y-1 right-0 w-[54%]">
                <Image
                  alt={item.title}
                  className="object-contain object-right-center"
                  fill
                  sizes="(max-width: 1280px) 190px, 250px"
                  src={style.art}
                />
              </div>
              <div className="relative flex items-center justify-between gap-3">
                <div className={`relative flex h-14 w-14 shrink-0 items-center justify-center rounded-[20px] shadow-sm ${style.iconWrap}`}>
                  <Icon className="relative h-6 w-6" />
                </div>
                <span className="rounded-full bg-slate-100 px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.16em] text-slate-600">
                  {style.label}
                </span>
              </div>
              <div className="relative mt-4">
                <p className="text-[1.7rem] font-bold leading-none text-slate-900">{item.value}</p>
                <p className="mt-1.5 max-w-[44%] text-sm font-semibold text-slate-700">{item.title}</p>
              </div>
              <div className="relative mt-5 flex items-center justify-between gap-3 border-t border-slate-200 pt-3">
                <div className="flex items-center gap-1.5">
                  <span className={`h-2.5 w-2.5 rounded-full ${style.accent}`} />
                  <span className="h-2.5 w-8 rounded-full bg-slate-300" />
                  <span className="h-2.5 w-14 rounded-full bg-slate-200" />
                </div>
                <div className="text-sm font-semibold text-slate-600 transition group-hover:text-slate-900">
                  {item.linkLabel}
                </div>
              </div>
            </Link>
          );
        })}
      </section>

      <section className="grid items-start gap-4 xl:grid-cols-[minmax(0,1.82fr)_360px]">
        <div className="space-y-4">
          <DashboardRecurringQuickAdd
            allowOtherDepartment={user.role === "admin"}
            currentUserDepartmentId={user.departmentId || departments[0]?.id || ""}
            currentUserId={user.id}
            departments={departments}
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
                    <th className="px-4 py-4 font-semibold">Planned Time</th>
                    <th className="px-4 py-4 font-semibold">Status</th>
                    <th className="px-4 py-4 font-semibold">Action</th>
                  </tr>
                </thead>
                <tbody>
                  {topTasks.length ? (
                    topTasks.map((task) => {
                      const status = getTaskStatus(task);
                      const continuationMeta = extractContinuationMeta(task.taskDescription);
                      const continuationSummary = getContinuationSummary(task);
                      const taskNote = getTaskNote(task);

                      return (
                        <tr className="border-t border-[var(--panel-border)] align-top" key={task.id}>
                          <td className="px-5 py-4">
                            <p className="text-sm font-semibold text-[var(--foreground)]">{task.taskTitle}</p>
                            {continuationMeta ? (
                              <div className="mt-2 space-y-2">
                                <div className="flex flex-wrap gap-2">
                                  <span className="rounded-full bg-violet-50 px-2.5 py-1 text-[10px] font-semibold uppercase tracking-[0.16em] text-violet-700">
                                    Continued Task
                                  </span>
                                  <span className="rounded-full bg-sky-50 px-2.5 py-1 text-[10px] font-semibold uppercase tracking-[0.16em] text-sky-700">
                                    Day {continuationMeta.daysActive || 1}
                                  </span>
                                  <span className="text-xs font-medium text-[var(--muted-foreground)]">
                                    From {continuationMeta.sourceDate}
                                  </span>
                                </div>
                                {continuationSummary ? (
                                  <div className="flex flex-wrap gap-2 text-xs font-medium text-slate-600">
                                    <span className="rounded-full bg-slate-100 px-2.5 py-1">
                                      Total Days: {continuationSummary.totalDays}
                                    </span>
                                    <span className="rounded-full bg-slate-100 px-2.5 py-1">
                                      Total Time: {formatDurationFromMinutes(continuationSummary.totalTrackedMinutes)}
                                    </span>
                                    {continuationSummary.lastWorkedDate ? (
                                      <span className="rounded-full bg-slate-100 px-2.5 py-1">
                                        Last Worked: {continuationSummary.lastWorkedDate}
                                      </span>
                                    ) : null}
                                  </div>
                                ) : null}
                              </div>
                            ) : null}
                            <p className="mt-1 text-sm text-[var(--muted-foreground)]">{task.user.department?.name ?? "General"}</p>
                            {taskNote ? (
                              <p className="mt-3 max-w-[720px] text-sm leading-6 text-slate-600">
                                <span className="font-semibold text-slate-700">Note:</span>{" "}
                                {taskNote}
                              </p>
                            ) : null}
                          </td>
                          <td className="px-4 py-4">
                            <span
                              className={`inline-flex min-w-[86px] items-center justify-center rounded-full px-3.5 py-1.5 text-xs font-bold uppercase tracking-[0.14em] ${getPriorityTone(task.priority)}`}
                            >
                              {formatPriority(task.priority)}
                            </span>
                          </td>
                          <td className="px-4 py-4 text-sm font-medium text-[var(--foreground)]">{formatPlannedTime(task)}</td>
                          <td className="px-4 py-4">
                            <span className={`inline-flex rounded-full px-3 py-1 text-xs font-semibold ${status.chip}`}>
                              {status.label}
                            </span>
                          </td>
                          <td className="px-4 py-4">
                            <div className="space-y-2">
                              <DashboardTaskTimerAction
                                canEdit={editAccess.allowed}
                                initialActualEnd={task.updates[0]?.actualEnd ?? null}
                                initialActualStart={task.updates[0]?.actualStart ?? null}
                                initialStatus={task.updates[0]?.status ?? "pending"}
                                initialTrackedMinutes={task.updates[0]?.trackedMinutes ?? 0}
                                reportDate={toDateOnly(task.planDate)}
                                taskId={task.id}
                              />
                              {task.assignedBy && task.userId === user.id ? (
                                <AssignmentReviewControls
                                  latestReview={
                                    task.editRequests[0]
                                      ? {
                                          id: task.editRequests[0].id,
                                          status: task.editRequests[0].status,
                                          submitNote: extractAssignmentReviewReason(task.editRequests[0].reason) ?? "",
                                          reviewNote: task.editRequests[0].reviewNote,
                                          createdAt: task.editRequests[0].createdAt,
                                          reviewedAt: task.editRequests[0].reviewedAt,
                                          requestedById: task.editRequests[0].requestedById,
                                          reviewerId: task.editRequests[0].reviewerId,
                                        }
                                      : null
                                  }
                                  mode="assignee"
                                  taskId={task.id}
                                  taskTitle={task.taskTitle}
                                />
                              ) : null}
                              <TaskManageControls
                                compact
                                task={{
                                  id: task.id,
                                  taskTitle: task.taskTitle,
                                  taskDescription: task.taskDescription,
                                  priority: task.priority as "low" | "normal" | "high" | "critical",
                                }}
                              />
                            </div>
                          </td>
                        </tr>
                      );
                    })
                  ) : (
                    <tr>
                      <td className="px-5 py-8 text-sm text-[var(--muted-foreground)]" colSpan={5}>
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
