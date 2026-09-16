import type { Prisma } from "@prisma/client";

export const ATTENDANCE_DETAILS_PERMISSION = "attendance.details.view" as const;
export const PERMISSIONS = [
  "employees.view", "employees.update", "employees.status.manage",
  "tasks.view", "tasks.assign", "tasks.update", "tasks.reopen",
  ATTENDANCE_DETAILS_PERMISSION, "attendance.view", "attendance.correct", "history.view", "reports.view", "reports.export",
  "departments.view", "departments.manage", "notices.publish", "notices.manage", "audit_logs.view",
] as const;
export type Permission = typeof PERMISSIONS[number];
export const READ_PERMISSIONS: Permission[] = ["employees.view", "tasks.view", "attendance.view", "history.view", "reports.view", "departments.view"];
export const SCOPE_TYPES = ["all_company", "departments", "teams", "employees", "own_team", "self"] as const;
export type AccessActor = {
  id: string; role: string; isActive?: boolean; departmentId?: string | null; teamId?: string | null;
  managementEnabled?: boolean; accessVersion?: number;
  ledTeams?: { id: string }[];
  permissions?: { permissionKey: string; isGranted: boolean }[];
  accessScopes?: { scopeType: string; departmentId?: string | null; teamId?: string | null; employeeId?: string | null }[];
};
export function isSuperAdmin(actor: Pick<AccessActor, "role" | "isActive">) {
  return actor.role === "super_admin" && actor.isActive !== false;
}
export function canOpenManagement(actor: AccessActor) {
  return actor.isActive !== false && (isSuperAdmin(actor) ||
    (["moderator", "admin", "team_head"].includes(actor.role) && actor.managementEnabled === true));
}
export function can(actor: AccessActor, permission: Permission) {
  if (!canOpenManagement(actor)) return false;
  if (isSuperAdmin(actor)) return true;
  return actor.permissions?.some(p => p.permissionKey === permission && p.isGranted) === true;
}
export function canReceiveAuditPermission(role: string) {
  return ["super_admin", "moderator", "admin"].includes(role);
}
export function canViewAuditLogs(actor: AccessActor) {
  return isSuperAdmin(actor) || (canReceiveAuditPermission(actor.role) && can(actor, "audit_logs.view"));
}
export function canViewAttendanceDetails(actor: AccessActor) {
  return can(actor, "employees.view") && can(actor, "attendance.view");
}
// Applied inside every management query, including aggregates and exports.
export function employeeScope(actor: AccessActor, permission: Permission): Prisma.UserWhereInput {
  if (!can(actor, permission)) return { id: { in: [] } };
  if (isSuperAdmin(actor)) return {};
  const scopes = actor.accessScopes ?? [];
  if (scopes.some(s => s.scopeType === "all_company")) return {};
  const OR: Prisma.UserWhereInput[] = [];
  for (const scope of scopes) {
    if (scope.scopeType === "self") OR.push({ id: actor.id });
    if (scope.scopeType === "employees" && scope.employeeId) OR.push({ id: scope.employeeId });
    if (scope.scopeType === "departments" && scope.departmentId) OR.push({ departmentId: scope.departmentId });
    if (scope.scopeType === "teams" && scope.teamId) OR.push({ teamId: scope.teamId });
    if (scope.scopeType === "own_team") {
      const ids = [...new Set([...(actor.ledTeams ?? []).map(t => t.id), ...(actor.teamId ? [actor.teamId] : [])])];
      if (ids.length) OR.push({ teamId: { in: ids } });
    }
  }
  return OR.length ? { OR } : { id: { in: [] } };
}
export function personalOrScopedTasks(actor: AccessActor, permission: Permission | readonly Permission[]): Prisma.DailyTaskWhereInput {
  const scopes = (Array.isArray(permission) ? permission : [permission]).map(item => employeeScope(actor, item));
  // Prisma treats an empty object inside an OR branch as a non-match. Return the
  // unrestricted predicate directly when any requested permission is company-wide.
  if (scopes.some(scope => Object.keys(scope).length === 0)) return {};
  return { OR: [{ userId: actor.id }, ...scopes.map(scope => ({ user: scope }))] };
}
// Personal workflow endpoints always act on the signed-in employee's own work.
// Management edits/reopens use their separately audited, scoped endpoints.
export function personalTaskScope(actor: Pick<AccessActor, 'id'>): Prisma.DailyTaskWhereInput {
  return { userId: actor.id };
}
export function departmentScope(actor: AccessActor, permission: Permission): Prisma.DepartmentWhereInput {
  if (!can(actor, permission)) return { id: { in: [] } };
  if (isSuperAdmin(actor) || actor.accessScopes?.some(s => s.scopeType === 'all_company')) return {};
  return { id: { in: actor.accessScopes?.filter(s => s.scopeType === 'departments').flatMap(s => s.departmentId ? [s.departmentId] : []) ?? [] } };
}
export function ownTeamScope(actor: AccessActor): Prisma.UserWhereInput {
  if (isSuperAdmin(actor)) return {};
  if (actor.role !== "team_head" || actor.isActive === false) return { id: { in: [] } };
  const ids = actor.ledTeams?.map(t => t.id) ?? [];
  return { teamId: { in: ids } };
}
export function assigneeScope(actor: AccessActor): Prisma.UserWhereInput {
  const scope = employeeScope(actor, "tasks.assign");
  return Object.keys(scope).length === 0 ? {} : { OR: [{ id: actor.id }, scope] };
}
export function canChangeProtectedAccount(actor: AccessActor, target: {id: string; role: string}, nextRole: string, nextActive: boolean, activeSuperAdmins: number) {
  if (!isSuperAdmin(actor)) return false;
  if (target.id === actor.id && (nextRole !== "super_admin" || !nextActive)) return false;
  return !(target.role === "super_admin" && (nextRole !== "super_admin" || !nextActive) && activeSuperAdmins <= 1);
}
