import { ReminderKind, TaskStatus, UserRole } from "@prisma/client";
import { endOfDay, startOfDay, subDays } from "date-fns";
import { extractAssignmentReviewReason, isAssignmentReviewReason } from "@/lib/assignment-review";
import { db } from "@/lib/db";
import {
  calculateDailyRate,
  calculateHourlyRate,
  calculateMinutesBetween,
  calculateOvertimeMinutes,
  calculateRegularMinutes,
  calculateWeeklyRate,
  calculateWorkValue,
  formatHours,
  toDateOnly,
} from "@/lib/utils";

const DEPARTMENT_TASK_TEMPLATES: Array<{
  matches: string[];
  suggestions: Array<{ title: string; description: string; priority: "low" | "normal" | "high" | "critical" }>;
}> = [
  {
    matches: ["it", "technology"],
    suggestions: [
      { title: "Review support tickets and unblock critical issues", description: "Check new IT requests, resolve blockers, and escalate urgent cases.", priority: "high" },
      { title: "Deploy and verify application updates", description: "Review pending changes, push approved updates, and monitor health after release.", priority: "high" },
      { title: "Audit infrastructure and backup status", description: "Confirm backups, server alerts, and security checks are green for the day.", priority: "normal" },
    ],
  },
  {
    matches: ["sales"],
    suggestions: [
      { title: "Follow up with active leads and proposals", description: "Contact warm prospects, update deal notes, and move pending proposals forward.", priority: "high" },
      { title: "Prepare sales pipeline status update", description: "Summarize conversions, pending deals, and revenue focus points for leadership.", priority: "normal" },
      { title: "Review client meeting outcomes", description: "Capture commitments, next actions, and ownership from recent client calls.", priority: "normal" },
    ],
  },
  {
    matches: ["hr"],
    suggestions: [
      { title: "Review attendance, leave, and employee requests", description: "Check daily people operations queue and resolve pending workforce actions.", priority: "high" },
      { title: "Publish HR updates and policy reminders", description: "Share important internal updates and confirm department visibility.", priority: "normal" },
      { title: "Screen hiring pipeline and shortlist candidates", description: "Review new applicants, shortlist matches, and schedule next steps.", priority: "normal" },
    ],
  },
  {
    matches: ["purchase", "procurement"],
    suggestions: [
      { title: "Verify vendor quotations and approvals", description: "Review open purchase requests, vendor responses, and approval blockers.", priority: "high" },
      { title: "Track pending purchase orders", description: "Follow up on timelines, delivery commitments, and purchasing exceptions.", priority: "normal" },
      { title: "Update procurement summary for management", description: "Prepare a concise summary of current purchasing status and risks.", priority: "normal" },
    ],
  },
  {
    matches: ["accounts", "finance"],
    suggestions: [
      { title: "Reconcile transactions and ledger updates", description: "Verify entries, close pending mismatches, and confirm daily financial accuracy.", priority: "high" },
      { title: "Review payable and receivable priorities", description: "Track due payments, incoming collections, and financial action points.", priority: "normal" },
      { title: "Prepare finance status note for leadership", description: "Summarize key balances, exceptions, and urgent items for the day.", priority: "normal" },
    ],
  },
  {
    matches: ["operations"],
    suggestions: [
      { title: "Review daily operations queue and blockers", description: "Check running workstreams, pending tasks, and process exceptions.", priority: "high" },
      { title: "Coordinate cross-team action items", description: "Follow up with departments and keep operational commitments on track.", priority: "normal" },
      { title: "Update operations dashboard and deadlines", description: "Confirm delivery progress, deadlines, and execution risks.", priority: "normal" },
    ],
  },
];

export async function getDepartments() {
  return db.department.findMany({ orderBy: { name: "asc" } });
}

export async function getAssignableUsers() {
  const users = await db.user.findMany({
    where: { isActive: true },
    include: { department: true },
    orderBy: [{ department: { name: "asc" } }, { name: "asc" }],
  });

  return users.map((user) => ({
    id: user.id,
    name: user.name,
    role: user.role,
    designation: user.designation,
    departmentId: user.departmentId,
    departmentName: user.department?.name ?? "No department",
  }));
}

export async function getAssignmentsData(userId: string) {
  const today = toDateOnly();

  const [assignedByMe, assignedToMe] = await Promise.all([
    db.dailyTask.findMany({
      where: {
        assignedBy: userId,
        planDate: {
          gte: startOfDay(new Date(today)),
          lte: endOfDay(new Date(today)),
        },
      },
      include: {
        department: true,
        user: {
          include: {
            department: true,
          },
        },
        assigner: true,
        editRequests: {
          where: {
            reason: {
              startsWith: "[assignment-review]",
            },
          },
          orderBy: { createdAt: "desc" },
          take: 1,
        },
        updates: {
          orderBy: { updatedAt: "desc" },
        },
      },
      orderBy: { createdAt: "desc" },
    }),
    db.dailyTask.findMany({
      where: {
        userId,
        assignedBy: {
          not: null,
        },
        planDate: {
          gte: startOfDay(new Date(today)),
          lte: endOfDay(new Date(today)),
        },
      },
      include: {
        department: true,
        user: {
          include: {
            department: true,
          },
        },
        assigner: {
          include: {
            department: true,
          },
        },
        editRequests: {
          where: {
            reason: {
              startsWith: "[assignment-review]",
            },
          },
          orderBy: { createdAt: "desc" },
          take: 1,
        },
        updates: {
          orderBy: { updatedAt: "desc" },
        },
      },
      orderBy: { createdAt: "desc" },
    }),
  ]);

  const serializeAssignmentTask = (task: (typeof assignedByMe)[number]) => ({
    id: task.id,
    planDate: task.planDate,
    taskTitle: task.taskTitle,
    taskDescription: task.taskDescription,
    priority: task.priority,
    department: {
      name: task.department.name,
    },
    user: {
      name: task.user.name,
      department: task.user.department
        ? {
            name: task.user.department.name,
          }
        : null,
    },
    assigner: task.assigner
      ? {
          name: task.assigner.name,
          department: "department" in task.assigner && task.assigner.department
            ? {
                name: task.assigner.department.name,
              }
            : null,
        }
      : null,
    updates: task.updates.map((update) => ({
      status: update.status,
      note: update.note,
      trackedMinutes: update.trackedMinutes,
      actualStart: update.actualStart,
      actualEnd: update.actualEnd,
      updatedAt: update.updatedAt,
    })),
    latestReview: task.editRequests[0]
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
      : null,
  });

  return {
    assignedByMe: assignedByMe.map(serializeAssignmentTask),
    assignedToMe: assignedToMe.map(serializeAssignmentTask),
  };
}

export async function getAssignmentNotificationCount(userId: string) {
  const notifications = await getAssignmentNotifications(userId);
  return notifications.length;
}

export async function getAssignmentNotifications(userId: string) {
  const today = toDateOnly();

  const tasks = await db.dailyTask.findMany({
    where: {
      assignedBy: userId,
      planDate: {
        gte: startOfDay(new Date(today)),
        lte: endOfDay(new Date(today)),
      },
    },
    include: {
      user: {
        include: {
          department: true,
        },
      },
      editRequests: {
        where: {
          reason: {
            startsWith: "[assignment-review]",
          },
        },
        orderBy: { createdAt: "desc" },
        take: 1,
      },
      updates: {
        where: {
          OR: [{ status: TaskStatus.done }, { note: { not: null } }],
        },
        orderBy: { updatedAt: "desc" },
      },
    },
    orderBy: { createdAt: "desc" },
  });

  return tasks
    .filter((task) => task.updates.length > 0 || task.editRequests.length > 0)
    .map((task) => ({
      taskId: task.id,
      taskTitle: task.taskTitle,
      assigneeName: task.user.name,
      assigneeDepartmentName: task.user.department?.name ?? task.user.departmentId ?? "No department",
      status: task.updates[0]?.status ?? TaskStatus.pending,
      note:
        task.editRequests[0] && isAssignmentReviewReason(task.editRequests[0].reason)
          ? extractAssignmentReviewReason(task.editRequests[0].reason) ?? task.updates[0]?.note ?? ""
          : task.updates[0]?.note ?? "",
      trackedMinutes: task.updates[0]?.trackedMinutes ?? 0,
      updatedAt:
        task.editRequests[0]?.createdAt?.toISOString() ??
        task.updates[0]?.updatedAt?.toISOString() ??
        new Date().toISOString(),
    }));
}

export async function getRequestNotificationCount(user: {
  id: string;
  role: UserRole;
  departmentId?: string | null;
}) {
  return 0;
}

export async function getRequestNotifications(user: {
  id: string;
  role: UserRole;
  departmentId?: string | null;
}) {
  return [];
}

export async function getDashboardData(userId: string, role: UserRole, departmentId?: string | null) {
  const today = new Date();
  const dayStart = startOfDay(today);
  const dayEnd = endOfDay(today);

  const taskWhere =
    role === UserRole.employee
      ? { userId, planDate: { gte: dayStart, lte: dayEnd } }
      : role === UserRole.manager && departmentId
        ? { departmentId, planDate: { gte: dayStart, lte: dayEnd } }
        : { planDate: { gte: dayStart, lte: dayEnd } };

  const [tasks, activeStaff, performanceUsers] = await Promise.all([
    db.dailyTask.findMany({
      where: taskWhere,
      include: {
        user: { include: { department: true } },
        editRequests: {
          where: {
            reason: {
              startsWith: "[assignment-review]",
            },
          },
          orderBy: { createdAt: "desc" },
          take: 1,
        },
        updates: true,
      },
      orderBy: { createdAt: "desc" },
    }),
    db.user.count({
      where:
        role === UserRole.admin
          ? {
              isActive: true,
              role: {
                in: [UserRole.employee, UserRole.hr, UserRole.manager],
              },
            }
          : departmentId
            ? {
                isActive: true,
                departmentId,
                role: {
                  in: [UserRole.employee, UserRole.hr, UserRole.manager],
                },
              }
            : {
                isActive: true,
        id: userId,
      },
    }),
    role === UserRole.employee
      ? Promise.resolve([])
      : db.user.findMany({
          where:
            role === UserRole.admin
              ? {
                  isActive: true,
                  role: {
                    in: [UserRole.employee, UserRole.hr, UserRole.manager],
                  },
                }
              : departmentId
                ? {
                    isActive: true,
                    departmentId,
                    role: {
                      in: [UserRole.employee, UserRole.hr, UserRole.manager],
                    },
                  }
                : {
                    isActive: true,
                    role: {
                      in: [UserRole.employee, UserRole.hr, UserRole.manager],
                    },
                  },
          include: {
            department: true,
          },
          orderBy: [{ name: "asc" }],
        }),
  ]);

  const reportsSubmitted = tasks.filter((task) => task.updates.some((item) => toDateOnly(item.reportDate) === toDateOnly(today))).length;
  const trackedMinutes = tasks.reduce((sum, task) => {
    const todayUpdates = task.updates.filter((item) => toDateOnly(item.reportDate) === toDateOnly(today));
    return sum + todayUpdates.reduce((inner, update) => inner + update.trackedMinutes, 0);
  }, 0);
  const pendingItems = tasks.filter(
    (task) =>
      task.updates.find((update) => toDateOnly(update.reportDate) === toDateOnly(today))?.status !== TaskStatus.done,
  ).length;

  const recentTrend = await Promise.all(
    Array.from({ length: 7 }).map(async (_, index) => {
      const date = subDays(today, 6 - index);
      const count = await db.dailyTask.count({
        where: {
          ...(role === UserRole.employee ? { userId } : {}),
          ...(role === UserRole.manager && departmentId ? { departmentId } : {}),
          planDate: { gte: startOfDay(date), lte: endOfDay(date) },
        },
      });

      return { date: toDateOnly(date), count };
    }),
  );

  const performanceMembers =
    role === UserRole.employee
      ? []
      : performanceUsers.map((member) => {
          const memberTasks = tasks.filter((task) => task.userId === member.id);
          const completedTasks = memberTasks.filter((task) => task.updates[0]?.status === TaskStatus.done);
          const inProgressTasks = memberTasks.filter((task) => task.updates[0]?.status === TaskStatus.in_progress);
          const missedTasks = memberTasks.filter((task) => {
            const latest = task.updates[0];
            return !latest || latest.status === TaskStatus.pending;
          });
          const trackedMinutes = memberTasks.reduce((sum, task) => sum + (task.updates[0]?.trackedMinutes ?? 0), 0);
          const completionRate = memberTasks.length ? completedTasks.length / memberTasks.length : 0;
          const momentumRate = memberTasks.length ? inProgressTasks.length / memberTasks.length : 0;
          const score = Math.round(completionRate * 70 + momentumRate * 15 + Math.min(trackedMinutes / 12, 15));

          return {
            id: member.id,
            name: member.name,
            role: member.role,
            departmentId: member.departmentId ?? "no-department",
            departmentName: member.department?.name ?? "No department",
            avatarUrl: member.avatarUrl ?? null,
            score,
            completionRate,
            trackedMinutes,
            completedCount: completedTasks.length,
            plannedCount: memberTasks.length,
            missedCount: missedTasks.length,
            goodTasks: completedTasks.slice(0, 3).map((task) => task.taskTitle),
            missedTasks: missedTasks.slice(0, 3).map((task) => task.taskTitle),
          };
        });

  const sortedPerformanceMembers = [...performanceMembers].sort((a, b) => {
    if (b.score !== a.score) return b.score - a.score;
    if (b.completedCount !== a.completedCount) return b.completedCount - a.completedCount;
    return b.trackedMinutes - a.trackedMinutes;
  });

  const averageScore =
    sortedPerformanceMembers.length > 0
      ? sortedPerformanceMembers.reduce((sum, member) => sum + member.score, 0) / sortedPerformanceMembers.length
      : 0;

  const topPerformer = sortedPerformanceMembers[0] ?? null;
  const steadyPerformer =
    sortedPerformanceMembers.length > 1
      ? [...sortedPerformanceMembers]
          .slice(1)
          .sort((a, b) => Math.abs(a.score - averageScore) - Math.abs(b.score - averageScore))[0] ?? null
      : null;

  return {
    kpis: {
      activeStaff,
      tasksPlanned: tasks.length,
      reportsSubmitted,
      worklogHours: formatHours(trackedMinutes),
      pendingItems,
    },
    tasks,
    recentTrend,
    performanceSpotlights: {
      topPerformer,
      steadyPerformer,
      members: sortedPerformanceMembers,
    },
  };
}

export async function getPlanWithReports(userId: string, date = new Date()) {
  const day = toDateOnly(date);
  return db.dailyTask.findMany({
    where: {
      userId,
      planDate: new Date(day),
    },
    include: {
      updates: true,
      department: true,
    },
    orderBy: { createdAt: "asc" },
  });
}

export async function canUserEditReportDate(
  user: { id: string; role: UserRole },
  planDate: Date,
  taskIds: string[],
) {
  return {
    allowed: true,
    mode: user.role === UserRole.manager || user.role === UserRole.admin ? ("direct" as const) : ("today" as const),
  };
}

export async function getPlanSuggestions(userId: string, departmentId?: string | null) {
  const [department, recentTasks] = await Promise.all([
    departmentId
      ? db.department.findUnique({
          where: { id: departmentId },
        })
      : Promise.resolve(null),
    db.dailyTask.findMany({
      where: { userId },
      include: { department: true, updates: true },
      orderBy: [{ planDate: "desc" }, { createdAt: "desc" }],
      take: 90,
    }),
  ]);

  const departmentName = department?.name.toLowerCase() ?? "";
  const departmentTemplates =
    DEPARTMENT_TASK_TEMPLATES.find((entry) => entry.matches.some((match) => departmentName.includes(match)))?.suggestions ?? [];
  const currentWeekday = new Date().getDay();

  const candidateTasks = recentTasks.filter((task) => !departmentId || task.departmentId === departmentId);
  const scoredHistory = Array.from(
    candidateTasks.reduce((map, task, index) => {
      const key = task.taskTitle.trim().toLowerCase();
      const existing = map.get(key) ?? {
        title: task.taskTitle,
        description: task.taskDescription ?? "Predicted from your work pattern and completion history.",
        priority: (["low", "normal", "high", "critical"].includes(task.priority) ? task.priority : "normal") as "low" | "normal" | "high" | "critical",
        score: 0,
        count: 0,
        completedCount: 0,
        latestIndex: index,
        sameWeekdayCount: 0,
      };

      const latestStatus = task.updates[0]?.status;
      const recencyBoost = Math.max(0, 12 - index);
      const completionBoost = latestStatus === TaskStatus.done ? 10 : latestStatus === TaskStatus.in_progress ? 5 : 2;
      const weekdayBoost = new Date(task.planDate).getDay() === currentWeekday ? 6 : 0;

      existing.count += 1;
      existing.completedCount += latestStatus === TaskStatus.done ? 1 : 0;
      existing.sameWeekdayCount += weekdayBoost ? 1 : 0;
      existing.latestIndex = Math.min(existing.latestIndex, index);
      existing.score += recencyBoost + completionBoost + weekdayBoost + (task.departmentId === departmentId ? 4 : 0);

      map.set(key, existing);
      return map;
    }, new Map<string, {
      title: string;
      description: string;
      priority: "low" | "normal" | "high" | "critical";
      score: number;
      count: number;
      completedCount: number;
      latestIndex: number;
      sameWeekdayCount: number;
    }>()).values(),
  )
    .map((item) => ({
      title: item.title,
      description:
        item.description ||
        `Predicted from ${item.completedCount || item.count} earlier worklogs in ${department?.name ?? "this department"}.`,
      priority: item.priority,
      source:
        item.sameWeekdayCount > 0
          ? `Pattern repeat · same weekday ${item.sameWeekdayCount}x`
          : `History repeat · used ${item.count}x`,
      score: item.score + item.count * 3 + item.completedCount * 4,
    }))
    .sort((a, b) => b.score - a.score)
    .slice(0, 4);

  const templateSuggestions = departmentTemplates.map((task, index) => ({
    title: task.title,
    description: `${task.description} Suggested from ${department?.name ?? "department"} workflow baseline.`,
    priority: task.priority,
    source: `Department intelligence ${index + 1}`,
    score: 10 - index,
  }));

  return [...scoredHistory, ...templateSuggestions]
    .filter(
      (item, index, array) =>
        array.findIndex((candidate) => candidate.title.trim().toLowerCase() === item.title.trim().toLowerCase()) === index,
    )
    .sort((a, b) => b.score - a.score)
    .slice(0, 6)
    .map((item) => ({
      title: item.title,
      description: item.description,
      priority: item.priority,
      source: item.source,
    }));
}

export async function getHistoryData(userId: string, from?: string, to?: string) {
  const start = from ? new Date(from) : subDays(new Date(), 7);
  const end = to ? new Date(to) : new Date();

  const [tasks, editRequests] = await Promise.all([
    db.dailyTask.findMany({
      where: {
        userId,
        planDate: {
          gte: startOfDay(start),
          lte: endOfDay(end),
        },
      },
      include: {
        department: true,
        updates: true,
      },
      orderBy: [{ planDate: "desc" }, { createdAt: "desc" }],
    }),
    db.reportEditRequest.findMany({
      where: {
        requestedById: userId,
      },
      orderBy: { createdAt: "desc" },
    }),
  ]);

  return tasks.map((task) => {
    const isToday = toDateOnly(task.planDate) === toDateOnly();

    return {
      ...task,
      latestRequest: null,
      isToday,
      canEmployeeEdit: true,
      canRequestEdit: false,
    };
  });
}

export async function getPendingReportEditRequests(reviewer: {
  id: string;
  role: UserRole;
  departmentId?: string | null;
}) {
  return [];
}

export async function getTeamData(role: UserRole, departmentId?: string | null) {
  const today = toDateOnly();
  const sharedWhere = role === UserRole.manager && departmentId ? { departmentId } : {};
  const visibleRoles =
    role === UserRole.admin
      ? [UserRole.employee, UserRole.hr, UserRole.manager, UserRole.admin]
      : [UserRole.employee, UserRole.hr, UserRole.manager];

  const [users, tasks] = await Promise.all([
    db.user.findMany({
      where: {
        ...sharedWhere,
        role: {
          in: visibleRoles,
        },
      },
      include: {
        department: true,
      },
      orderBy: [{ department: { name: "asc" } }, { name: "asc" }],
    }),
    db.dailyTask.findMany({
      where: {
        ...sharedWhere,
        planDate: new Date(today),
      },
      include: {
        department: true,
        user: true,
        updates: true,
      },
      orderBy: [{ department: { name: "asc" } }, { createdAt: "desc" }],
    }),
  ]);

  return users.map((user) => {
    const memberTasks = tasks.filter((task) => task.userId === user.id);
    const monthlySalary = user.monthlySalary ? Number(user.monthlySalary) : 0;
    const expectedDailyHours = user.expectedDailyHours ? Number(user.expectedDailyHours) : 8;
    const hourlyRate = calculateHourlyRate(monthlySalary, expectedDailyHours);
    const dailyRate = calculateDailyRate(monthlySalary);
    const weeklyRate = calculateWeeklyRate(monthlySalary);
    const trackedMinutes = memberTasks.reduce((sum, task) => sum + (task.updates[0]?.trackedMinutes ?? 0), 0);
    const completedTasks = memberTasks.filter((task) => task.updates[0]?.status === TaskStatus.done).length;
    const firstStart = memberTasks
      .map((task) => task.updates[0]?.actualStart ?? null)
      .filter((value): value is Date => Boolean(value))
      .sort((a, b) => a.getTime() - b.getTime())[0] ?? null;
    const lastEnd = memberTasks
      .map((task) => task.updates[0]?.actualEnd ?? null)
      .filter((value): value is Date => Boolean(value))
      .sort((a, b) => b.getTime() - a.getTime())[0] ?? null;
    const overtimeMinutes = calculateOvertimeMinutes(trackedMinutes, expectedDailyHours);
    const regularMinutes = calculateRegularMinutes(trackedMinutes, expectedDailyHours);
    const workValue = calculateWorkValue(trackedMinutes, monthlySalary, expectedDailyHours);

    return {
      id: user.id,
      name: user.name,
      role: user.role,
      isActive: user.isActive,
      avatarUrl: user.avatarUrl ?? null,
      departmentName: user.department?.name ?? "No department",
      tasksPlanned: memberTasks.length,
      completedTasks,
      trackedMinutes,
      overtimeMinutes,
      regularMinutes,
      workValue,
      hourlyRate,
      dailyRate,
      weeklyRate,
      monthlySalary,
      expectedDailyHours,
      firstStart,
      lastEnd,
    };
  });
}

export async function getAdminOverview() {
  const [users, departments, reports, plans] = await Promise.all([
    db.user.findMany({ include: { department: true }, orderBy: [{ isActive: "desc" }, { createdAt: "desc" }] }),
    db.department.findMany({ orderBy: { name: "asc" } }),
    db.dailyTaskUpdate.findMany({
      include: {
        dailyTask: { include: { user: true, department: true } },
      },
      orderBy: { createdAt: "desc" },
      take: 25,
    }),
    db.dailyTask.findMany({
      include: { user: true, department: true, updates: true },
      orderBy: { createdAt: "desc" },
      take: 25,
    }),
  ]);

  const usersWithComp = users.map((user) => ({
    ...user,
    dailyRate: calculateDailyRate(user.monthlySalary ? Number(user.monthlySalary) : 0),
    weeklyRate: calculateWeeklyRate(user.monthlySalary ? Number(user.monthlySalary) : 0),
    hourlyRate: calculateHourlyRate(
      user.monthlySalary ? Number(user.monthlySalary) : 0,
      user.expectedDailyHours ? Number(user.expectedDailyHours) : 8,
    ),
  }));

  const reportsWithValue = reports.map((report) => ({
    ...report,
    dailyRate: calculateDailyRate(report.dailyTask.user.monthlySalary ? Number(report.dailyTask.user.monthlySalary) : 0),
    weeklyRate: calculateWeeklyRate(report.dailyTask.user.monthlySalary ? Number(report.dailyTask.user.monthlySalary) : 0),
    hourlyRate: calculateHourlyRate(
      report.dailyTask.user.monthlySalary ? Number(report.dailyTask.user.monthlySalary) : 0,
      report.dailyTask.user.expectedDailyHours ? Number(report.dailyTask.user.expectedDailyHours) : 8,
    ),
    overtimeMinutes: calculateOvertimeMinutes(
      report.trackedMinutes,
      report.dailyTask.user.expectedDailyHours ? Number(report.dailyTask.user.expectedDailyHours) : 8,
    ),
    workValue: calculateWorkValue(
      report.trackedMinutes,
      report.dailyTask.user.monthlySalary ? Number(report.dailyTask.user.monthlySalary) : 0,
      report.dailyTask.user.expectedDailyHours ? Number(report.dailyTask.user.expectedDailyHours) : 8,
    ),
  }));

  const totalTrackedMinutes = reports.reduce((sum, report) => sum + report.trackedMinutes, 0);
  const totalWorkValue = reportsWithValue.reduce((sum, report) => sum + report.workValue, 0);
  const activeUsersWithComp = usersWithComp.filter((user) => user.isActive);
  const totalWeeklyPayroll = activeUsersWithComp.reduce((sum, user) => sum + user.weeklyRate, 0);
  const totalDailyPayroll = activeUsersWithComp.reduce((sum, user) => sum + user.dailyRate, 0);
  const latestReportSummaries = Array.from(
    reportsWithValue.reduce((map, report) => {
      const key = report.dailyTask.userId;
      const existing = map.get(key) ?? {
        userId: report.dailyTask.userId,
        name: report.dailyTask.user.name,
        role: report.dailyTask.user.role,
        avatarUrl: report.dailyTask.user.avatarUrl,
        departmentName: report.dailyTask.department.name,
        totalReports: 0,
        totalTrackedMinutes: 0,
        totalWorkValue: 0,
        latestStart: null as Date | null,
        latestEnd: null as Date | null,
        latestTaskTitle: report.dailyTask.taskTitle,
        hourlyRate: report.hourlyRate,
        dailyRate: report.dailyRate,
        weeklyRate: report.weeklyRate,
      };

      existing.totalReports += 1;
      existing.totalTrackedMinutes += report.trackedMinutes;
      existing.totalWorkValue += report.workValue;
      existing.latestTaskTitle = report.dailyTask.taskTitle;
      existing.latestStart =
        !existing.latestStart || (report.actualStart && report.actualStart > existing.latestStart)
          ? (report.actualStart ?? existing.latestStart)
          : existing.latestStart;
      existing.latestEnd =
        !existing.latestEnd || (report.actualEnd && report.actualEnd > existing.latestEnd)
          ? (report.actualEnd ?? existing.latestEnd)
          : existing.latestEnd;

      map.set(key, existing);
      return map;
    }, new Map<string, {
      userId: string;
      name: string;
      role: UserRole;
      avatarUrl: string | null;
      departmentName: string;
      totalReports: number;
      totalTrackedMinutes: number;
      totalWorkValue: number;
      latestStart: Date | null;
      latestEnd: Date | null;
      latestTaskTitle: string;
      hourlyRate: number;
      dailyRate: number;
      weeklyRate: number;
    }>()),
  )
    .map(([, value]) => value)
    .sort((a, b) => b.totalTrackedMinutes - a.totalTrackedMinutes || b.totalReports - a.totalReports)
    .slice(0, 6);

  return {
    users: usersWithComp,
    departments,
    reports: reportsWithValue,
    latestReportSummaries,
    plans,
    metrics: {
      totalTrackedMinutes,
      totalWorkValue,
      totalWeeklyPayroll,
      totalDailyPayroll,
    },
  };
}

export async function getUnreadMessageCount(userId: string) {
  return db.workspaceMessage.count({
    where: {
      recipientId: userId,
      readAt: null,
    },
  });
}

export async function getActiveNoticesForUser(user: {
  id: string;
  departmentId?: string | null;
}) {
  return db.hrNotice.findMany({
    where: {
      isActive: true,
      publishedAt: { not: null },
      OR: [{ targetDepartmentId: null }, { targetDepartmentId: user.departmentId ?? undefined }],
      dismissals: {
        none: {
          userId: user.id,
        },
      },
    },
    include: {
      author: true,
      targetDepartment: true,
    },
    orderBy: [{ publishedAt: "desc" }, { createdAt: "desc" }],
    take: 12,
  });
}

export async function getNoticeNotificationCount(user: {
  id: string;
  departmentId?: string | null;
}) {
  return db.hrNotice.count({
    where: {
      isActive: true,
      publishedAt: { not: null },
      OR: [{ targetDepartmentId: null }, { targetDepartmentId: user.departmentId ?? undefined }],
      dismissals: {
        none: {
          userId: user.id,
        },
      },
    },
  });
}

export async function getApprovalNotificationCount(user: {
  id: string;
  role: UserRole;
  departmentId?: string | null;
}) {
  if (user.role !== UserRole.manager) {
    return 0;
  }

  return db.reportEditRequest.count({
    where: {
      status: "pending",
      dailyTask: user.departmentId ? { departmentId: user.departmentId } : undefined,
    },
  });
}

export async function getWorkspaceMessages(userId: string) {
  await db.workspaceMessage.updateMany({
    where: {
      recipientId: userId,
      readAt: null,
    },
    data: {
      readAt: new Date(),
    },
  });

  const [contacts, inbox] = await Promise.all([
    db.user.findMany({
      where: { id: { not: userId }, isActive: true },
      select: {
        id: true,
        name: true,
        role: true,
        department: {
          select: {
            name: true,
          },
        },
      },
      orderBy: [{ role: "asc" }, { name: "asc" }],
    }),
    db.workspaceMessage.findMany({
      where: {
        OR: [{ senderId: userId }, { recipientId: userId }],
      },
      select: {
        id: true,
        subject: true,
        body: true,
        readAt: true,
        createdAt: true,
        senderId: true,
        recipientId: true,
        sender: {
          select: {
            name: true,
            role: true,
          },
        },
        recipient: {
          select: {
            name: true,
            role: true,
          },
        },
        attachments: {
          select: {
            id: true,
            fileName: true,
            fileUrl: true,
            fileType: true,
            fileSize: true,
          },
        },
      },
      orderBy: { createdAt: "desc" },
      take: 40,
    }),
  ]);

  const unreadCount = inbox.filter((message) => message.recipientId === userId && !message.readAt).length;

  return { contacts, inbox, unreadCount };
}

export async function getWorkspaceDirectoryData(viewer: {
  role: UserRole;
  departmentId?: string | null;
}) {
  const today = toDateOnly();
  const departmentScope =
    viewer.role === UserRole.manager && viewer.departmentId
      ? {
          departmentId: viewer.departmentId,
        }
      : {};

  const users = await db.user.findMany({
    where: {
      isActive: true,
      ...departmentScope,
    },
    include: {
      department: true,
      taskOwner: {
        where: {
          planDate: new Date(today),
        },
        include: {
          updates: true,
        },
        orderBy: { createdAt: "asc" },
      },
    },
    orderBy: [{ department: { name: "asc" } }, { role: "asc" }, { name: "asc" }],
  });

  const departments = Array.from(
    new Map(
      users.map((user) => [
        user.departmentId ?? "no-department",
        {
          id: user.departmentId ?? "no-department",
          name: user.department?.name ?? "No department",
        },
      ]),
    ).values(),
  );

  return {
    departments,
    users: users.map((user) => {
      const todaysPlans = user.taskOwner.map((task) => {
        const latestUpdate = task.updates[0] ?? null;

        return {
          id: task.id,
          title: task.taskTitle,
          description: task.taskDescription,
          priority: task.priority,
          status: latestUpdate?.status ?? "planned",
          completionPercent: latestUpdate?.completionPercent ?? 0,
          trackedMinutes: latestUpdate?.trackedMinutes ?? 0,
          actualStart: latestUpdate?.actualStart ?? null,
          actualEnd: latestUpdate?.actualEnd ?? null,
          note: latestUpdate?.note ?? null,
        };
      });

      return {
        id: user.id,
        name: user.name,
        role: user.role,
        designation: user.designation,
        avatarUrl: user.avatarUrl,
        departmentId: user.departmentId ?? "no-department",
        departmentName: user.department?.name ?? "No department",
        taskCount: todaysPlans.length,
        completedTaskCount: todaysPlans.filter((task) => task.status === "done").length,
        totalTrackedMinutes: todaysPlans.reduce((sum, task) => sum + task.trackedMinutes, 0),
        todaysPlans,
      };
    }),
  };
}

export async function getAttendanceData(user: {
  id: string;
  role: UserRole;
  departmentId?: string | null;
}) {
  const today = toDateOnly();
  type AttendanceRuntimeRecord = {
    id: string;
    userId: string;
    status: "present" | "late" | "half_day" | "absent" | "remote";
    checkInAt: Date | null;
    checkOutAt: Date | null;
    breakMinutes: number;
    workingMinutes: number;
    note: string | null;
  };

  const attendanceModel = (db as unknown as {
    attendanceRecord?: {
      findMany: (args: Record<string, unknown>) => Promise<AttendanceRuntimeRecord[]>;
    };
  }).attendanceRecord;
  const attendanceWhere =
    user.role === UserRole.manager && user.departmentId
      ? { departmentId: user.departmentId }
      : user.role === UserRole.employee
        ? { id: user.id }
        : undefined;

  const users = await db.user.findMany({
    where: {
      isActive: true,
      ...(attendanceWhere ?? {}),
    },
    include: {
      department: true,
    },
    orderBy: [{ name: "asc" }],
  });

  const records: AttendanceRuntimeRecord[] = attendanceModel
    ? await attendanceModel.findMany({
        where: {
          attendanceDate: new Date(today),
          user: attendanceWhere,
        },
        include: {
          user: {
            include: {
              department: true,
            },
          },
        },
        orderBy: [{ checkInAt: "asc" }],
      })
    : [];

  const recordMap = new Map(records.map((record) => [record.userId, record]));

  return users.map((member) => {
    const record = recordMap.get(member.id) ?? null;
    const workingMinutes = record?.workingMinutes ?? calculateMinutesBetween(record?.checkInAt, record?.checkOutAt) - (record?.breakMinutes ?? 0);

    return {
      userId: member.id,
      name: member.name,
      email: member.email,
      role: member.role,
      avatarUrl: member.avatarUrl,
      departmentName: member.department?.name ?? "No department",
      attendance: record
        ? {
            id: record.id,
            status: record.status,
            checkInAt: record.checkInAt,
            checkOutAt: record.checkOutAt,
            breakMinutes: record.breakMinutes,
            workingMinutes: Math.max(0, workingMinutes),
            note: record.note,
          }
        : null,
    };
  });
}

export async function getCurrentUserAttendanceSnapshot(userId: string) {
  const today = toDateOnly();
  type AttendanceRuntimeRecord = {
    id: string;
    userId: string;
    status: "present" | "late" | "half_day" | "absent" | "remote";
    checkInAt: Date | null;
    checkOutAt: Date | null;
    breakMinutes: number;
    workingMinutes: number;
    note: string | null;
  };

  const attendanceModel = (db as unknown as {
    attendanceRecord?: {
      findUnique: (args: Record<string, unknown>) => Promise<AttendanceRuntimeRecord | null>;
    };
  }).attendanceRecord;

  if (!attendanceModel) {
    return null;
  }

  return attendanceModel.findUnique({
    where: {
      userId_attendanceDate: {
        userId,
        attendanceDate: new Date(today),
      },
    },
  });
}

export async function getReminderCandidates(reminderDate = new Date()) {
  const day = toDateOnly(reminderDate);
  const users = await db.user.findMany({
    where: {
      isActive: true,
      role: {
        in: [UserRole.employee, UserRole.hr, UserRole.manager],
      },
    },
    include: {
      attendanceRecords: {
        where: { attendanceDate: new Date(day) },
      },
      taskOwner: {
        where: { planDate: new Date(day) },
        include: { updates: true },
      },
      reminderDispatches: {
        where: { reminderDate: new Date(day) },
      },
    },
  });

  return users.map((user) => {
    const hasAttendance = user.attendanceRecords.length > 0;
    const hasPlan = user.taskOwner.length > 0;
    const hasReport = user.taskOwner.some((task) => task.updates.some((update) => toDateOnly(update.reportDate) === day));
    const sentKinds = new Set(user.reminderDispatches.map((dispatch) => dispatch.kind));

    return {
      user,
      hasAttendance,
      hasPlan,
      hasReport,
      canSendAttendance: !hasAttendance && !sentKinds.has(ReminderKind.attendance_morning),
      canSendPlan: !hasPlan && !sentKinds.has(ReminderKind.plan_morning),
      canSendReport: hasPlan && !hasReport && !sentKinds.has(ReminderKind.report_evening),
      day,
    };
  });
}

export async function markReminderSent(userId: string, reminderDate: string, kind: ReminderKind) {
  await db.reminderDispatch.upsert({
    where: {
      userId_reminderDate_kind: {
        userId,
        reminderDate: new Date(reminderDate),
        kind,
      },
    },
    update: {
      sentAt: new Date(),
    },
    create: {
      userId,
      reminderDate: new Date(reminderDate),
      kind,
    },
  });
}
