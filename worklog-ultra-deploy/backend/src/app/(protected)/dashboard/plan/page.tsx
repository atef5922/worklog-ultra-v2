import { PlanForm } from "@/components/dashboard/plan-form";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { requireEmployee } from "@/lib/auth/server";
import { getAssignableUsers, getDepartments, getPlanSuggestions, getPlanWithReports } from "@/lib/worklog";
import { toDateOnly } from "@/lib/utils";

export const dynamic = "force-dynamic";

export default async function PlanPage() {
  const user = await requireEmployee();
  const [departments, tasks, suggestions, assignableUsers] = await Promise.all([
    getDepartments(),
    getPlanWithReports(user.id),
    getPlanSuggestions(user.id, user.departmentId),
    getAssignableUsers(),
  ]);
  const todayKey = toDateOnly();
  const visibleTasks = tasks.filter(
    (task) => !task.updates.some((update) => toDateOnly(update.reportDate) === todayKey && update.status === "done"),
  );

  return (
    <div className="space-y-5">
      <Card>
        <CardHeader>
          <CardTitle>Plan Your Morning</CardTitle>
        </CardHeader>
        <CardContent>
          <p className="text-sm text-[var(--muted-foreground)]">
            Build today’s task list with department-aware entries and clear priorities.
          </p>
        </CardContent>
      </Card>
      <PlanForm
        assignableUsers={assignableUsers}
        currentUserId={user.id}
        departments={departments}
        initialTasks={visibleTasks.map((task) => ({
          assigneeId: task.userId,
          id: task.id,
          taskTitle: task.taskTitle,
          taskDescription: task.taskDescription ?? "",
          priority: task.priority,
          departmentId: task.departmentId,
        }))}
        suggestions={suggestions}
        userDepartmentId={user.departmentId}
        role={user.role}
      />
    </div>
  );
}
