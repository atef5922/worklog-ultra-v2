import Link from "next/link";
import { CalendarCheck2, Check, CheckCircle2, ClipboardList, Clock3, PlayCircle, TimerReset } from "lucide-react";
import { PanelHeader } from "@/components/dashboard/panel-header";
import { DashboardKpiCards, type DashboardKpiCard } from "@/components/dashboard/dashboard-kpi-cards";
import { DashboardTaskNotifier } from "@/components/dashboard/dashboard-task-notifier";
import { DashboardTimeSummary } from "@/components/dashboard/dashboard-time-summary";
import { DashboardWorkdayTimer } from "@/components/dashboard/dashboard-workday-timer";
import { DashboardWorkPlanSection } from "@/components/dashboard/dashboard-work-plan-table";
import { DashboardWorkspaceModal } from "@/components/dashboard/dashboard-workspace-modal";
import { requireUser } from "@/lib/auth/server";
import { extractAssignmentReviewReason } from "@/lib/assignment-review";
import {
  countDashboardTaskStats,
  filterTodaysWorkPlanTasks,
  getTaskDaySeed,
  getTaskStatusForDashboard,
  getTaskUpdateForDate,
} from "@/lib/dashboard-work-plan-filter";
import { taskPriorityRank } from "@/lib/task-priority";
import { canUserEditReportDate, getAssignableUsers, getCurrentUserAttendanceSnapshot, getDashboardData, getDepartments, getPlanSuggestions, getPlanWithReports } from "@/lib/worklog";
import { formatDateTimeInDhaka, isTenderDepartmentName, toDateOnly } from "@/lib/utils";

export const dynamic = "force-dynamic";

const statCardStyles = [
  {
    icon: ClipboardList,
    iconWrap: "bg-[#eef2ff] text-[#3148d8]",
    card: "bg-white",
    border: "border-[#d8e2ff]",
    accent: "bg-[#4f5ef7]",
    label: "Planned flow",
    art: "/vectors/Planned%20Tasks.png",
  },
  {
    icon: CheckCircle2,
    iconWrap: "bg-[#e8fbf4] text-[#0f8f68]",
    card: "bg-white",
    border: "border-[#d5f7e9]",
    accent: "bg-[#17b26a]",
    label: "Completed",
    art: "/vectors/Completed%20Tasks.png",
  },
  {
    icon: PlayCircle,
    iconWrap: "bg-[#fff5e6] text-[#dc7f07]",
    card: "bg-white",
    border: "border-[#ffe0ab]",
    accent: "bg-[#f59e0b]",
    label: "Running now",
    art: "/vectors/In%20Progress%20Tasks.png",
  },
  {
    icon: TimerReset,
    iconWrap: "bg-[#fff0f4] text-[#d91c4a]",
    card: "bg-white",
    border: "border-[#ffd0da]",
    accent: "bg-[#f43f5e]",
    label: "Need action",
    art: "/vectors/Pending%20Tasks.png",
  },
  {
    icon: Clock3,
    iconWrap: "bg-[#f3eeff] text-[#7041e6]",
    card: "bg-white",
    border: "border-[#e1d6ff]",
    accent: "bg-[#8b5cf6]",
    label: "Work time",
    art: "/vectors/Actual%20Work%20Time.png",
  },
];

function formatHoursAndMinutes(hoursLabel: string) {
  const numericHours = Number(hoursLabel.replace("h", ""));

  if (!Number.isFinite(numericHours) || numericHours <= 0) {
    return "0h 00m";
  }

  const hours = Math.floor(numericHours);
  const minutes = Math.round((numericHours - hours) * 60);
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
    (reportTasks ?? []).map((task) => task.id),
  );

  const today = new Date();
  const activeTasks = filterTodaysWorkPlanTasks(data.tasks).sort(
    (left, right) =>
      taskPriorityRank(left.priority) - taskPriorityRank(right.priority) || left.taskTitle.localeCompare(right.taskTitle),
  );
  const dashboardStats = countDashboardTaskStats(data.tasks);
  const completedTasks = dashboardStats.completedTasks;
  const inProgressTasks = dashboardStats.inProgressTasks;
  const pendingTasks = dashboardStats.pendingTasks;
  const plannedTasks = dashboardStats.plannedTasks;
  const workedMinutes = activeTasks.reduce(
    (sum, task) => sum + getTaskDaySeed(task, reportDate).trackedMinutes,
    0,
  );
  const attendanceActive = Boolean(attendance?.workSessions.some((session) => !session.endedAt));
  const attendanceOnBreak = Boolean(attendance?.breakSessions.some((session) => !session.endedAt));
  const attendanceStatusLabel = attendanceOnBreak
    ? "Currently on break"
    : attendanceActive
      ? "You are checked in"
      : attendance?.checkInAt
        ? "Checked out - check in again anytime"
        : "No attendance logged yet";
  const motivation = getMotivationalMessage({
    name: user.name,
    role: user.role,
    plannedTasks,
    completedTasks,
    pendingTasks,
    trackedMinutes: workedMinutes,
  });
  const isTenderDepartment = isTenderDepartmentName(user.department?.name);
  const isEmployeeDashboard = user.role === "employee";
  const taskPercentage = (count: number) =>
    plannedTasks ? Math.round((count / plannedTasks) * 100) : 0;

  const statCards = [
    {
      key: "planned" as const,
      title: "Planned Tasks",
      value: plannedTasks,
      href: "/dashboard/plan",
    },
    {
      key: "completed" as const,
      title: "Completed Tasks",
      value: completedTasks,
      percentage: taskPercentage(completedTasks),
      href: "/dashboard/report",
    },
    {
      key: "inProgress" as const,
      title: "In Progress Tasks",
      value: inProgressTasks,
      percentage: taskPercentage(inProgressTasks),
      href: "/dashboard/report",
    },
    {
      key: "pending" as const,
      title: "Pending Tasks",
      value: pendingTasks,
      percentage: taskPercentage(pendingTasks),
      href: "/dashboard/report",
    },
    ...(!isEmployeeDashboard
      ? [
        {
          key: "workTime" as const,
          title: "Actual Work Time",
          value: formatHoursAndMinutes(data.kpis.worklogHours),
          href: "/dashboard/history",
        },
      ]
      : []),
  ];

  // Icon elements, not icon components, cross the server/client boundary here:
  // a component reference is a function and Next.js can't serialize functions
  // as Client Component props, but an already-rendered element is plain data.
  const kpiCards: DashboardKpiCard[] = statCards.map((item, index) => {
    const style = statCardStyles[index % statCardStyles.length];
    const Icon = style.icon;

    return {
      key: item.key,
      title: item.title,
      value: item.value,
      href: item.href,
      icon: <Icon className="h-4 w-4" />,
      art: style.art,
      iconWrap: style.iconWrap,
      card: style.card,
      border: style.border,
      accent: style.accent,
      percentage: item.percentage,
    };
  });

  // Shared by the work plan section and the KPI cards' detail lists, so a task
  // opened from either place reads the exact same fields.
  const workPlanTasks = (data.tasks ?? []).map((task) => ({
    id: task.id,
    taskTitle: task.taskTitle,
    taskDescription: task.taskDescription,
    priority: task.priority,
    planDate: toDateOnly(task.planDate),
    assignedBy: task.assignedBy,
    userId: task.userId,
    departmentName: task.user.department?.name ?? "General",
    createdAt: task.createdAt.toISOString(),
    updates: (task.updates ?? []).map((update) => ({
      status: update.status,
      note: update.note,
      trackedMinutes: update.trackedMinutes,
      actualStart: update.actualStart?.toISOString() ?? null,
      actualEnd: update.actualEnd?.toISOString() ?? null,
      reportDate: toDateOnly(update.reportDate),
      updatedAt: update.updatedAt.toISOString(),
    })),
    latestReview: task.editRequests[0]
      ? {
          id: task.editRequests[0].id,
          status: task.editRequests[0].status as "pending" | "approved" | "rejected",
          submitNote: extractAssignmentReviewReason(task.editRequests[0].reason) ?? "",
          reviewNote: task.editRequests[0].reviewNote ?? null,
          createdAt: task.editRequests[0].createdAt.toISOString(),
          reviewedAt: task.editRequests[0].reviewedAt?.toISOString() ?? null,
          requestedById: task.editRequests[0].requestedById,
          reviewerId: task.editRequests[0].reviewerId ?? null,
        }
      : null,
  }));

  return (
    <div
      className="flex flex-col gap-2 min-[900px]:min-h-0 min-[900px]:flex-1 min-[900px]:overflow-hidden"
      data-fit-viewport
    >
      {/* Today's plan only. getDashboardData returns every task with
          planDate <= today, so the raw list still carries days-old and archived
          tasks — reading it is what put "You have 5 tasks to remember today" on
          screen above an empty work plan. Status comes from today's report row
          too, so a task left running last week no longer reports itself as
          running this morning. */}
      <DashboardTaskNotifier
        tasks={activeTasks.map((task) => {
          const todaysUpdate = getTaskUpdateForDate(task);

          return {
            id: task.id,
            title: task.taskTitle,
            status: getTaskStatusForDashboard(task) as "done" | "in_progress" | "pending",
            trackedMinutes: todaysUpdate?.trackedMinutes ?? 0,
            actualEnd: todaysUpdate?.actualEnd?.toISOString() ?? null,
            taskDescription: task.taskDescription,
          };
        })}
      />
      <section className="flex shrink-0 flex-col gap-2 sm:flex-row sm:items-center sm:justify-between sm:gap-4" data-page-section>
        <div className="flex min-w-0 items-center gap-2.5 sm:flex-1">
          {/* Colour emoji rather than a line icon: it reads instantly at this
              size and carries the greeting's tone on its own. */}
          <span aria-hidden className="dashboard-greeting-wave shrink-0 text-[1.15rem] leading-none">
            👋
          </span>
          <h1
            className="min-w-0 text-[0.95rem] font-semibold leading-tight text-[var(--foreground)] max-sm:line-clamp-2 sm:truncate sm:text-[1.02rem]"
            title={motivation.message}
          >
            {motivation.message}
          </h1>
        </div>
        <div className="flex w-full shrink-0 flex-nowrap items-center gap-2 sm:w-auto sm:justify-end sm:gap-3">
          <DashboardWorkspaceModal
            canEditReport={editAccess.allowed}
            currentUserId={user.id}
            departments={departments}
            initialTasks={[]}
            isTenderDepartment={isTenderDepartment}
            assignableUsers={assignableUsers}
            reportDate={reportDate}
            reportTasks={(reportTasks ?? []).map((task) => ({
              id: task.id,
              taskTitle: task.taskTitle,
              updates: (task.updates ?? []).map((update) => ({
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
            suggestions={suggestions ?? []}
            userDepartmentId={user.departmentId}
          />
          <div className="shrink-0">
            <DashboardWorkdayTimer
              currentUserId={user.id}
              initialAttendance={
                attendance
                  ? {
                      status: attendance.status,
                      attendanceDate: toDateOnly(attendance.attendanceDate),
                      note: attendance.note ?? "",
                      breakMinutes: attendance.breakMinutes ?? 0,
                      checkInAt: attendance.checkInAt?.toISOString() ?? null,
                      checkOutAt: attendance.checkOutAt?.toISOString() ?? null,
                      legacyBreakMinutes: attendance.legacyBreakMinutes,
                      active: attendanceActive,
                      onBreak: attendanceOnBreak,
                      currentSessionStartedAt:
                        attendance.workSessions.find((session) => !session.endedAt)?.startedAt.toISOString() ?? null,
                      currentBreakStartedAt:
                        attendance.breakSessions.find((session) => !session.endedAt)?.startedAt.toISOString() ?? null,
                      workSessions: attendance.workSessions.map((session) => ({
                        id: session.id,
                        startedAt: session.startedAt.toISOString(),
                        endedAt: session.endedAt?.toISOString() ?? null,
                        endReason: session.endReason,
                      })),
                      breakSessions: attendance.breakSessions.map((session) => ({
                        id: session.id,
                        startedAt: session.startedAt.toISOString(),
                        endedAt: session.endedAt?.toISOString() ?? null,
                        endReason: session.endReason,
                      })),
                    }
                  : null
              }
              mode="button"
            />
          </div>
        </div>
      </section>

      <DashboardKpiCards
        cards={kpiCards}
        currentUserId={user.id}
        progress={{
          planned: plannedTasks,
          completed: completedTasks,
          inProgress: inProgressTasks,
          pending: pendingTasks,
        }}
        tasks={workPlanTasks}
        trailingCard={
          isEmployeeDashboard ? (
            <Link
              className="group relative flex min-h-[4rem] min-w-0 items-center gap-2 overflow-hidden rounded-[0.875rem] border border-[#d5f7e9] bg-white p-2 text-left transition hover:-translate-y-0.5 sm:rounded-[1rem]"
              data-dashboard-card
              href="/dashboard/attendance"
              title="Attendance - View details"
            >
              <div className="absolute inset-x-0 top-0 h-1 bg-[#17b26a]" />
              <span className="relative flex h-7 w-7 shrink-0 items-center justify-center rounded-[0.625rem] bg-[#e8fbf4] text-[#0f8f68]">
                <CalendarCheck2 className="h-4 w-4" />
              </span>
              <div className="relative min-w-0 flex-1 pt-0.5">
                <p className="truncate text-[0.62rem] font-bold leading-none text-slate-700">Attendance</p>
                <div className="mt-1 grid grid-cols-2 gap-1">
                  <div className="min-w-0">
                    <p className="text-[0.5rem] font-bold uppercase leading-none tracking-[0.1em] text-slate-400">In</p>
                    <p className="mt-0.5 truncate text-[0.68rem] font-bold leading-none tabular-nums text-slate-900">
                      {formatTimeOnly(attendance?.checkInAt)}
                    </p>
                  </div>
                  <div className="min-w-0 border-l border-slate-200 pl-1.5">
                    <p className="text-[0.5rem] font-bold uppercase leading-none tracking-[0.1em] text-slate-400">Out</p>
                    <p className="mt-0.5 truncate text-[0.68rem] font-bold leading-none tabular-nums text-slate-900">
                      {formatTimeOnly(attendance?.checkOutAt)}
                    </p>
                  </div>
                </div>
                <p className="mt-1 truncate text-[0.54rem] font-semibold leading-none text-emerald-600">
                  {attendanceStatusLabel}
                </p>
              </div>
            </Link>
          ) : null
        }
      />

      <section
        className={
          isEmployeeDashboard
            ? "flex min-h-0 min-w-0 flex-1"
            : "grid min-h-0 gap-2 min-[900px]:flex-1 min-[900px]:grid-cols-[minmax(0,1fr)_15.5rem] lg:grid-cols-[minmax(0,1fr)_18.125rem]"
        }
        data-page-section
      >
        {/* Left column: the work plan owns the whole column and splits into
            today's open tasks and the completed ones; each half scrolls inside
            itself, so the page never grows past one screen. */}
        <div className="flex min-h-0 min-w-0 flex-1 flex-col gap-2">
          <DashboardWorkPlanSection
            attendanceRunning={attendanceActive}
            canEdit={editAccess.allowed}
            currentUserId={user.id}
            formattedDate={formatDashboardDate(today)}
            tasks={workPlanTasks}
          />
        </div>

        {/* Right column: three fixed-size widgets sized to fit the single screen,
            so this must NOT be a scroll container. It used to be `overflow-y-auto`
            as a safety net, and that net was the tall scrollbar down the right
            edge — an element only ever paints a scrollbar when it is itself
            `auto`/`scroll`, so the fix is to stop being one. */}
        {/* justify-between so the column ends flush with the left one. These three
            are fixed-height, so on a screen taller than the reference the surplus
            used to pile up under Attendance and leave it hanging short of the
            cards beside it; spreading the gaps puts that surplus between the
            panels instead. On a tight screen there is no surplus and this is a
            no-op, so the reference layout is unchanged. */}
        {!isEmployeeDashboard ? (
          <div className="flex min-h-0 min-w-0 flex-col gap-2 min-[900px]:justify-between min-[900px]:overflow-hidden">
            <DashboardTimeSummary
              plannedTasks={plannedTasks}
              tasks={(data.tasks ?? []).map((task) => ({
                id: task.id,
                trackedMinutes: getTaskDaySeed(task, reportDate).trackedMinutes,
              }))}
              attendance={attendance ? {
                attendanceDate: toDateOnly(attendance.attendanceDate),
                status: attendance.status,
                note: attendance.note ?? "",
                checkInAt: attendance.checkInAt?.toISOString() ?? null,
                checkOutAt: attendance.checkOutAt?.toISOString() ?? null,
                breakMinutes: attendance.breakMinutes ?? 0,
                legacyBreakMinutes: attendance.legacyBreakMinutes,
                active: attendanceActive,
                onBreak: attendanceOnBreak,
                currentSessionStartedAt:
                  attendance.workSessions.find((session) => !session.endedAt)?.startedAt.toISOString() ?? null,
                currentBreakStartedAt:
                  attendance.breakSessions.find((session) => !session.endedAt)?.startedAt.toISOString() ?? null,
                workSessions: attendance.workSessions.map((session) => ({
                  id: session.id,
                  startedAt: session.startedAt.toISOString(),
                  endedAt: session.endedAt?.toISOString() ?? null,
                  endReason: session.endReason,
                })),
                breakSessions: attendance.breakSessions.map((session) => ({
                  id: session.id,
                  startedAt: session.startedAt.toISOString(),
                  endedAt: session.endedAt?.toISOString() ?? null,
                  endReason: session.endReason,
                })),
              } : null}
            />

            <div
              className="dashboard-accent accent-emerald flex shrink-0 flex-col rounded-[1.25rem] border border-[var(--panel-border)] bg-[var(--panel)] p-2.5"
              data-dashboard-panel
            >
            <PanelHeader icon={CalendarCheck2} title="Attendance" tone="bg-emerald-500/10 text-emerald-500" />
            {/* In and Out side by side: two stacked rows cost ~30px that the
                single-screen layout cannot spare. */}
            <div className="mt-2 overflow-hidden rounded-[0.875rem] border border-[var(--panel-border)]">
              <div className="grid grid-cols-2 divide-x divide-[var(--panel-border)]">
                <div className="flex items-center gap-1.5 px-2 py-1.5">
                  <span className="inline-flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-emerald-500 text-white">
                    <Check className="h-3 w-3" />
                  </span>
                  <div className="min-w-0">
                    <p className="truncate text-[0.56rem] font-bold uppercase leading-none tracking-[0.12em] text-[var(--muted-foreground)]">
                      In
                    </p>
                    <p className="mt-0.5 truncate text-[0.78rem] font-bold leading-none tabular-nums text-[var(--foreground)]">
                      {formatTimeOnly(attendance?.checkInAt)}
                    </p>
                  </div>
                </div>
                <div className="flex items-center gap-1.5 px-2 py-1.5">
                  <span className="inline-flex h-5 w-5 shrink-0 items-center justify-center rounded-full border border-[var(--panel-border)] bg-[var(--panel-alt)] text-[var(--muted-foreground)]">
                    <Clock3 className="h-3 w-3" />
                  </span>
                  <div className="min-w-0">
                    <p className="truncate text-[0.56rem] font-bold uppercase leading-none tracking-[0.12em] text-[var(--muted-foreground)]">
                      Out
                    </p>
                    <p className="mt-0.5 truncate text-[0.78rem] font-bold leading-none tabular-nums text-[var(--foreground)]">
                      {formatTimeOnly(attendance?.checkOutAt)}
                    </p>
                  </div>
                </div>
              </div>
              <div className="border-t border-[var(--panel-border)] bg-emerald-500/10 px-2 py-0.5 text-center text-[0.62rem] font-semibold text-emerald-600">
                {attendanceStatusLabel}
              </div>
            </div>
            </div>
          </div>
        ) : null}
      </section>
    </div>
  );
}
