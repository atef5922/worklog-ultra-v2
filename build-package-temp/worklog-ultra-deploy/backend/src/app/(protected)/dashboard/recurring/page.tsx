import { RecurringTasksCenter } from "@/components/dashboard/recurring-tasks-center";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { requireUser } from "@/lib/auth/server";
import { getDepartments } from "@/lib/worklog";

export const dynamic = "force-dynamic";

export default async function RecurringPage() {
  const user = await requireUser();
  const departments = await getDepartments();

  return (
    <div className="space-y-5">
      <Card>
        <CardHeader>
          <CardTitle>Recurring Work Library</CardTitle>
        </CardHeader>
        <CardContent>
          <p className="text-sm text-[var(--muted-foreground)]">
            Set which regular work should appear daily, weekly, or monthly. Only the tasks scheduled for today will show on dashboard for one-click add.
          </p>
        </CardContent>
      </Card>

      <RecurringTasksCenter
        allowOtherDepartment={user.role === "admin"}
        currentUserId={user.id}
        departments={departments}
        userDepartmentId={user.departmentId}
      />
    </div>
  );
}
