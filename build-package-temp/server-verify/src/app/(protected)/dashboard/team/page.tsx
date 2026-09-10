import { Fragment } from "react";
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
import { Table, TBody, TD, TH, THead, TR } from "@/components/ui/table";

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
  const tableColumnCount = 5 + (canViewComp ? 6 : 0);
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

  const departmentOptions = departments.map((department) => ({
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
            <p className="mt-2 text-2xl font-semibold text-white">{formatCurrency(totalDailyBaseline)}</p>
          </div>
          <div className="rounded-2xl border border-[var(--panel-border)] bg-[var(--panel-muted)] p-4">
            <p className="text-xs uppercase tracking-[0.22em] text-[var(--muted-foreground)]">Weekly Pay Baseline</p>
            <p className="mt-2 text-2xl font-semibold text-white">{formatCurrency(totalWeeklyBaseline)}</p>
          </div>
          <div className="rounded-2xl border border-[var(--panel-border)] bg-[var(--panel-muted)] p-4">
            <p className="text-xs uppercase tracking-[0.22em] text-[var(--muted-foreground)]">Today's Work Value</p>
            <p className="mt-2 text-2xl font-semibold text-white">{formatCurrency(totalTrackedValue)}</p>
          </div>
          <div className="rounded-2xl border border-[var(--panel-border)] bg-[var(--panel-muted)] p-4">
            <p className="text-xs uppercase tracking-[0.22em] text-[var(--muted-foreground)]">Tracked Time Today</p>
            <p className="mt-2 text-2xl font-semibold text-white">{formatMinutes(totalTrackedMinutes)}</p>
          </div>
        </div>

        <div className="space-y-4 lg:hidden">
          {sortedSummaries.map((employee) => (
            <div
              className="rounded-2xl border border-[var(--panel-border)] bg-[var(--panel)] p-4"
              key={`mobile-${employee.id}`}
            >
              <div className="flex items-start gap-3">
                <Avatar className="h-11 w-11 border-white/10">
                  {employee.avatarUrl ? <AvatarImage alt={employee.name} src={employee.avatarUrl} /> : null}
                  <AvatarFallback>{getInitials(employee.name)}</AvatarFallback>
                </Avatar>
                <div className="min-w-0 flex-1">
                  <p className="font-semibold leading-tight text-white">{employee.name}</p>
                  <div className="mt-1 flex flex-wrap items-center gap-2 text-xs">
                    <span className="text-[var(--muted-foreground)]">{employee.departmentName}</span>
                    <span className="text-[var(--muted-foreground)]">|</span>
                    <span className="text-[var(--muted-foreground)]">{roleUiTitle(employee.role)}</span>
                    <Badge variant={employee.isActive ? "success" : "secondary"}>
                      {employee.isActive ? "Active" : "Inactive"}
                    </Badge>
                  </div>
                  <p className="mt-1 text-xs text-[var(--muted-foreground)]">
                    {employee.completedTasks}/{employee.tasksPlanned} completed
                  </p>
                </div>
              </div>

              <div className="mt-4 grid grid-cols-2 gap-x-4 gap-y-3 text-sm">
                <div>
                  <p className="text-[11px] uppercase tracking-[0.18em] text-[var(--muted-foreground)]">Tasks</p>
                  <p className="mt-1 text-white">{employee.tasksPlanned} planned</p>
                  <Badge className="mt-2" variant={employee.completedTasks === employee.tasksPlanned ? "success" : "purple"}>
                    {employee.completedTasks} done
                  </Badge>
                </div>
                <div>
                  <p className="text-[11px] uppercase tracking-[0.18em] text-[var(--muted-foreground)]">Tracked</p>
                  <p className="mt-1 text-white">{formatMinutes(employee.trackedMinutes)}</p>
                </div>
                <div>
                  <p className="text-[11px] uppercase tracking-[0.18em] text-[var(--muted-foreground)]">Started</p>
                  <p className="mt-1 text-white">{formatDateTimeInDhaka(employee.firstStart)}</p>
                </div>
                <div>
                  <p className="text-[11px] uppercase tracking-[0.18em] text-[var(--muted-foreground)]">Ended</p>
                  <p className="mt-1 text-white">{formatDateTimeInDhaka(employee.lastEnd)}</p>
                </div>
                {canViewComp ? (
                  <>
                    <div>
                      <p className="text-[11px] uppercase tracking-[0.18em] text-[var(--muted-foreground)]">Hourly</p>
                      <p className="mt-1 text-white">{formatCurrency(employee.hourlyRate)}/hr</p>
                    </div>
                    <div>
                      <p className="text-[11px] uppercase tracking-[0.18em] text-[var(--muted-foreground)]">Daily</p>
                      <p className="mt-1 text-white">{formatCurrency(employee.dailyRate)}</p>
                    </div>
                    <div>
                      <p className="text-[11px] uppercase tracking-[0.18em] text-[var(--muted-foreground)]">Weekly</p>
                      <p className="mt-1 text-white">{formatCurrency(employee.weeklyRate)}</p>
                    </div>
                    <div>
                      <p className="text-[11px] uppercase tracking-[0.18em] text-[var(--muted-foreground)]">Monthly</p>
                      <p className="mt-1 text-white">{formatCurrency(employee.monthlySalary)}</p>
                    </div>
                    <div>
                      <p className="text-[11px] uppercase tracking-[0.18em] text-[var(--muted-foreground)]">Overtime</p>
                      <p className="mt-1 text-white">{formatHours(employee.overtimeMinutes)}</p>
                    </div>
                    <div>
                      <p className="text-[11px] uppercase tracking-[0.18em] text-[var(--muted-foreground)]">Value</p>
                      <p className="mt-1 font-semibold text-white">{formatCurrency(employee.workValue)}</p>
                    </div>
                  </>
                ) : null}
              </div>

              {canManageUsers ? (
                <div className="mt-4 space-y-3 border-t border-[var(--panel-border)] pt-4">
                  <div className="flex flex-wrap gap-2">
                    {employee.role === "manager" && user.role === "manager" ? null : (
                      <UserStatusToggle isActive={employee.isActive} userId={employee.id} userName={employee.name} />
                    )}
                  </div>
                  {user.role === "manager" && employee.role === "employee" ? (
                    <UserRoleDepartmentEditor
                      accessOptions={managerAccessOptions}
                      allowAccessEdit
                      allowRoleEdit={false}
                      compact
                      departments={departmentOptions}
                      initialDepartmentId={employee.departmentId}
                      initialExtraAccess={employee.extraAccess ?? []}
                      initialRole={employee.role}
                      userId={employee.id}
                      userName={employee.name}
                    />
                  ) : null}
                  {canManageComp && (user.role === "admin" || employee.role !== "admin") ? (
                    <CompensationEditor compact monthlySalary={employee.monthlySalary} userId={employee.id} userName={employee.name} />
                  ) : null}
                </div>
              ) : null}
            </div>
          ))}
        </div>

        <div className="hidden overflow-x-auto lg:block">
          <Table>
            <THead>
              <TR>
                <TH>Employee</TH>
                <TH>Tasks Today</TH>
                <TH>Started</TH>
                <TH>Ended</TH>
                <TH>Tracked Today</TH>
                {canViewComp ? <TH>Hourly Rate</TH> : null}
                {canViewComp ? <TH>Daily Salary</TH> : null}
                {canViewComp ? <TH>Weekly Salary</TH> : null}
                {canViewComp ? <TH>Monthly Salary</TH> : null}
                {canViewComp ? <TH>Overtime</TH> : null}
                {canViewComp ? <TH>Today's Work Value</TH> : null}
              </TR>
            </THead>
            <TBody>
              {sortedSummaries.map((employee) => (
                <Fragment key={employee.id}>
                  <TR className="align-top">
                    <TD>
                      <div className="flex items-center gap-3">
                        <Avatar className="h-11 w-11 border-white/10">
                          {employee.avatarUrl ? <AvatarImage alt={employee.name} src={employee.avatarUrl} /> : null}
                          <AvatarFallback>{getInitials(employee.name)}</AvatarFallback>
                        </Avatar>
                        <div>
                          <p className="font-semibold text-white">{employee.name}</p>
                          <div className="mt-1 flex flex-wrap items-center gap-2 text-xs">
                            <span className="text-[var(--muted-foreground)]">{employee.departmentName}</span>
                            <span className="text-[var(--muted-foreground)]">|</span>
                            <span className="text-[var(--muted-foreground)]">{roleUiTitle(employee.role)}</span>
                            <Badge variant={employee.isActive ? "success" : "secondary"}>
                              {employee.isActive ? "Active" : "Inactive"}
                            </Badge>
                          </div>
                          <p className="text-xs text-[var(--muted-foreground)]">
                            {employee.completedTasks}/{employee.tasksPlanned} completed
                          </p>
                        </div>
                      </div>
                    </TD>
                    <TD>
                      <div className="space-y-1">
                        <div className="text-white">{employee.tasksPlanned} planned</div>
                        <Badge variant={employee.completedTasks === employee.tasksPlanned ? "success" : "purple"}>
                          {employee.completedTasks} done
                        </Badge>
                      </div>
                    </TD>
                    <TD>{formatDateTimeInDhaka(employee.firstStart)}</TD>
                    <TD>{formatDateTimeInDhaka(employee.lastEnd)}</TD>
                    <TD>{formatMinutes(employee.trackedMinutes)}</TD>
                    {canViewComp ? <TD>{formatCurrency(employee.hourlyRate)}/hr</TD> : null}
                    {canViewComp ? <TD>{formatCurrency(employee.dailyRate)}</TD> : null}
                    {canViewComp ? <TD>{formatCurrency(employee.weeklyRate)}</TD> : null}
                    {canViewComp ? <TD>{formatCurrency(employee.monthlySalary)}</TD> : null}
                    {canViewComp ? <TD>{formatHours(employee.overtimeMinutes)}</TD> : null}
                    {canViewComp ? (
                      <TD>
                        <div className="space-y-1">
                          <div className="font-semibold text-white">{formatCurrency(employee.workValue)}</div>
                          <div className="text-xs text-[var(--muted-foreground)]">for {formatMinutes(employee.trackedMinutes)}</div>
                        </div>
                      </TD>
                    ) : null}
                  </TR>
                  {canManageUsers ? (
                    <TR className="border-b border-[var(--panel-border)]">
                      <TD className="pt-0" colSpan={tableColumnCount}>
                        <div className="ml-[56px] flex flex-wrap items-center gap-2 pb-4">
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
                      </TD>
                    </TR>
                  ) : null}
                </Fragment>
              ))}
            </TBody>
          </Table>
        </div>
      </CardContent>
    </Card>
  );
}
