import { redirect } from "next/navigation";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { UserRoleDepartmentEditor } from "@/components/admin/user-role-department-editor";
import { UserStatusToggle } from "@/components/admin/user-status-toggle";
import { CompensationEditor } from "@/components/dashboard/compensation-editor";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  canAccessTeamDashboard,
  MANAGER_GRANTABLE_EXTRA_ACCESS,
  shouldScopePrivilegedViewsToDepartment,
} from "@/lib/auth/permissions";
import { requireUser } from "@/lib/auth/server";
import { roleUiTitle } from "@/lib/auth/roles";
import { getDepartments, getTeamData } from "@/lib/worklog";
import { formatCurrency, formatDateTimeInDhaka, formatHours, formatMinutes } from "@/lib/utils";

export const dynamic = "force-dynamic";

function getInitials(name: string) {
  return name
    .split(" ")
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase() ?? "")
    .join("");
}

export default async function TeamPage() {
  const user = await requireUser();

  if (!canAccessTeamDashboard(user)) {
    redirect("/dashboard");
  }

  const [employeeSummaries, departments] = await Promise.all([
    getTeamData(user.role, user.departmentId, shouldScopePrivilegedViewsToDepartment(user)),
    getDepartments(),
  ]);

  const canViewComp = user.role === "manager" || user.role === "admin";
  const canManageUsers = user.role === "manager" || user.role === "admin";
  const canManageComp = user.role === "manager" || user.role === "admin";
  const sortedSummaries = [...employeeSummaries].sort(
    (a, b) => b.workValue - a.workValue || b.trackedMinutes - a.trackedMinutes,
  );
  const managerAccessOptions = MANAGER_GRANTABLE_EXTRA_ACCESS.map((key) => ({
    key,
    label:
      key === "team_dashboard"
        ? "Team Dashboard"
        : key === "work_monitor"
          ? "Work Monitor"
          : "Publish Notices",
  }));

  const departmentOptions = (departments ?? []).map((department) => ({
    id: department.id,
    name: department.name,
  }));

  const totalDailyBaseline = sortedSummaries.reduce((sum, item) => sum + item.dailyRate, 0);
  const totalWeeklyBaseline = sortedSummaries.reduce((sum, item) => sum + item.weeklyRate, 0);
  const totalTrackedValue = sortedSummaries.reduce((sum, item) => sum + item.workValue, 0);
  const totalTrackedMinutes = sortedSummaries.reduce((sum, item) => sum + item.trackedMinutes, 0);

  return (
    <Card>
      <CardHeader>
        <CardTitle>Team Plans & Reports</CardTitle>
      </CardHeader>
      <CardContent className="space-y-5">
        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
          <div className="rounded-2xl border border-[var(--panel-border)] bg-[var(--panel-muted)] p-4">
            <p className="text-xs uppercase tracking-[0.22em] text-[var(--muted-foreground)]">Daily Pay Baseline</p>
            <p className="mt-2 text-2xl font-semibold text-[var(--foreground)]">{formatCurrency(totalDailyBaseline)}</p>
          </div>
          <div className="rounded-2xl border border-[var(--panel-border)] bg-[var(--panel-muted)] p-4">
            <p className="text-xs uppercase tracking-[0.22em] text-[var(--muted-foreground)]">Weekly Pay Baseline</p>
            <p className="mt-2 text-2xl font-semibold text-[var(--foreground)]">{formatCurrency(totalWeeklyBaseline)}</p>
          </div>
          <div className="rounded-2xl border border-[var(--panel-border)] bg-[var(--panel-muted)] p-4">
            <p className="text-xs uppercase tracking-[0.22em] text-[var(--muted-foreground)]">Today&apos;s Work Value</p>
            <p className="mt-2 text-2xl font-semibold text-[var(--foreground)]">{formatCurrency(totalTrackedValue)}</p>
          </div>
          <div className="rounded-2xl border border-[var(--panel-border)] bg-[var(--panel-muted)] p-4">
            <p className="text-xs uppercase tracking-[0.22em] text-[var(--muted-foreground)]">Tracked Time Today</p>
            <p className="mt-2 text-2xl font-semibold text-[var(--foreground)]">{formatMinutes(totalTrackedMinutes)}</p>
          </div>
        </div>

        <div className="overflow-hidden rounded-[28px] border border-[var(--panel-border)] bg-[var(--panel-muted)]">
          {(sortedSummaries ?? []).map((employee) => {
            const employeeAvatarUrl = employee.avatarUrl ?? "";

            return (
              <div
                className="border-b border-[var(--panel-border)] px-4 py-4 last:border-b-0"
                key={employee.id}
              >
                <div className="flex flex-col gap-4 xl:flex-row xl:items-start xl:justify-between">
                  <div className="min-w-0 flex-1">
                    <div className="flex items-start gap-3">
                      <Avatar className="h-11 w-11 border-white/10">
                        {employeeAvatarUrl ? <AvatarImage alt={employee.name} src={employeeAvatarUrl} /> : null}
                        <AvatarFallback>{getInitials(employee.name)}</AvatarFallback>
                      </Avatar>
                      <div className="min-w-0 flex-1">
                        <div className="flex flex-wrap items-center gap-2">
                          <p className="font-semibold leading-tight text-[var(--foreground)]">{employee.name}</p>
                          <Badge variant={employee.isActive ? "success" : "secondary"}>
                            {employee.isActive ? "Active" : "Inactive"}
                          </Badge>
                          <Badge>{roleUiTitle(employee.role)}</Badge>
                        </div>
                        <div className="mt-1 flex flex-wrap gap-x-4 gap-y-1 text-xs text-[var(--muted-foreground)]">
                          <span>{employee.departmentName}</span>
                          <span>{employee.tasksPlanned} planned</span>
                          <span>{employee.completedTasks} done</span>
                          <span>{formatMinutes(employee.trackedMinutes)} tracked</span>
                          <span>Started {formatDateTimeInDhaka(employee.firstStart)}</span>
                          <span>Ended {formatDateTimeInDhaka(employee.lastEnd)}</span>
                          {canViewComp ? <span>{formatCurrency(employee.workValue)} value</span> : null}
                        </div>
                        {canViewComp ? (
                          <div className="mt-2 flex flex-wrap gap-2 text-[11px] text-[var(--muted-foreground)]">
                            <span className="rounded-full border border-[var(--panel-border)] bg-[var(--panel)] px-2.5 py-1">
                              {formatCurrency(employee.hourlyRate)}/hr
                            </span>
                            <span className="rounded-full border border-[var(--panel-border)] bg-[var(--panel)] px-2.5 py-1">
                              {formatCurrency(employee.dailyRate)}/day
                            </span>
                            <span className="rounded-full border border-[var(--panel-border)] bg-[var(--panel)] px-2.5 py-1">
                              {formatCurrency(employee.weeklyRate)}/week
                            </span>
                            <span className="rounded-full border border-[var(--panel-border)] bg-[var(--panel)] px-2.5 py-1">
                              {formatCurrency(employee.monthlySalary)}/month
                            </span>
                            <span className="rounded-full border border-[var(--panel-border)] bg-[var(--panel)] px-2.5 py-1">
                              OT {formatHours(employee.overtimeMinutes)}
                            </span>
                          </div>
                        ) : null}
                      </div>
                    </div>
                  </div>

                  {canManageUsers ? (
                    <div className="flex flex-wrap items-center gap-2 xl:max-w-[36%] xl:justify-end">
                      {employee.role === "manager" && user.role === "manager" ? null : (
                        <UserStatusToggle isActive={employee.isActive} userId={employee.id} userName={employee.name} />
                      )}
                      {user.role === "manager" && employee.role === "employee" ? (
                        <UserRoleDepartmentEditor
                          accessOptions={managerAccessOptions}
                          allowAccessEdit
                          allowRoleEdit={false}
                          compact
                          layout="inline"
                          departments={departmentOptions}
                          initialDepartmentId={employee.departmentId}
                          initialExtraAccess={employee.extraAccess ?? []}
                          initialRole={employee.role}
                          userId={employee.id}
                          userName={employee.name}
                        />
                      ) : null}
                      {canManageComp && (user.role === "admin" || employee.role !== "admin") ? (
                        <CompensationEditor
                          compact
                          layout="inline"
                          monthlySalary={employee.monthlySalary}
                          userId={employee.id}
                          userName={employee.name}
                        />
                      ) : null}
                    </div>
                  ) : null}
                </div>
              </div>
            );
          })}
        </div>
      </CardContent>
    </Card>
  );
}
