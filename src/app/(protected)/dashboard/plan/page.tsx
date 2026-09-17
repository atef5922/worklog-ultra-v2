import { formatDateInDhaka } from "@/lib/utils";
import { ClipboardList } from "lucide-react";
import { DashboardWorkspaceModal } from "@/components/dashboard/dashboard-workspace-modal";
import { DashboardWorkPlanSection } from "@/components/dashboard/dashboard-work-plan-table";
import { PageHeader } from "@/components/dashboard/page-header";
import { requireEmployee } from "@/lib/auth/server";
import { canUserEditReportDate, getAssignableUsers, getCurrentUserAttendanceSnapshot, getDepartments, getPlanSuggestions, getPlanWithReports } from "@/lib/worklog";
import { isTenderDepartmentName, toDateOnly } from "@/lib/utils";

export const dynamic = "force-dynamic";

function formatDashboardDate(value: Date) {
  const weekday = new Intl.DateTimeFormat("en-GB", { timeZone: "Asia/Dhaka", weekday: "long" }).format(value);
  return `${weekday}, ${formatDateInDhaka(value)}`;
}

export default async function PlanPage() {
  const user = await requireEmployee();
  const today = new Date();
  const [tasks, attendance, departments, suggestions, assignableUsers] = await Promise.all([
    getPlanWithReports(user.id, today, { includeAssigned: true, includeCarryOver: true }),
    getCurrentUserAttendanceSnapshot(user.id),
    getDepartments(),
    getPlanSuggestions(user.id, user.departmentId),
    getAssignableUsers(),
  ]);
  const editAccess = await canUserEditReportDate(
    { id: user.id, role: user.role },
    today,
    tasks.map((task) => task.id),
  );
  const attendanceRunning = Boolean(attendance?.workSessions.some((session) => !session.endedAt));
  const isTenderDepartment = isTenderDepartmentName(user.department?.name);
  const workPlanTasks = tasks.map((task) => ({
    id: task.id,
    taskTitle: task.taskTitle,
    taskDescription: task.taskDescription,
    priority: task.priority,
    planDate: toDateOnly(task.planDate),
    assignedBy: task.assignedBy,
    userId: task.userId,
    departmentName: task.department?.name ?? "General",
    createdAt: task.createdAt.toISOString(),
    updates: task.updates.map((update) => ({
      status: update.status,
      note: update.note,
      trackedMinutes: update.trackedMinutes,
      actualStart: update.actualStart?.toISOString() ?? null,
      actualEnd: update.actualEnd?.toISOString() ?? null,
      reportDate: toDateOnly(update.reportDate),
      updatedAt: update.updatedAt.toISOString(),
    })),
    latestReview: task.latestReview
      ? {
          id: task.latestReview.id,
          status: task.latestReview.status,
          submitNote: task.latestReview.submitNote,
          reviewNote: task.latestReview.reviewNote,
          createdAt: task.latestReview.createdAt.toISOString(),
          reviewedAt: task.latestReview.reviewedAt?.toISOString() ?? null,
          requestedById: task.latestReview.requestedById,
          reviewerId: task.latestReview.reviewerId,
        }
      : null,
  }));

  return (
    /* One screen. `fitViewport` tells PlanForm to fill the leftover height and
       keep only its task list scrollable — the modal renders the same form
       without it, where the content must flow at its natural height. */
    <div
      className="flex flex-col gap-2 min-[900px]:min-h-0 min-[900px]:flex-1 min-[900px]:overflow-hidden"
      data-fit-viewport
    >
      <PageHeader
        action={
          <DashboardWorkspaceModal
            assignableUsers={assignableUsers}
            currentUserId={user.id}
            departments={departments}
            initialTasks={[]}
            isTenderDepartment={isTenderDepartment}
            role={user.role}
            suggestions={suggestions}
            userDepartmentId={user.departmentId}
          />
        }
        icon={ClipboardList}
        subtitle="View and manage every task scheduled for today."
        title="Today's Task"
      />
      <DashboardWorkPlanSection
        attendanceRunning={attendanceRunning}
        canEdit={editAccess.allowed}
        currentUserId={user.id}
        formattedDate={formatDashboardDate(today)}
        managementView
        tasks={workPlanTasks}
      />
    </div>
  );
}
