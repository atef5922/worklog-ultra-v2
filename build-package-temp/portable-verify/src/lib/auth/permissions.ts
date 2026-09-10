import { UserRole } from "@prisma/client";

export const EXTRA_ACCESS_OPTIONS = [
  { key: "team_dashboard", label: "Team Dashboard" },
  { key: "work_monitor", label: "Work Monitor" },
  { key: "publish_notices", label: "Publish Notices" },
  { key: "manage_departments", label: "Manage Departments" },
] as const;

export const MANAGER_GRANTABLE_EXTRA_ACCESS: ExtraAccessKey[] = [
  "team_dashboard",
  "work_monitor",
  "publish_notices",
];

export type ExtraAccessKey = (typeof EXTRA_ACCESS_OPTIONS)[number]["key"];

type UserWithAccess = {
  role: UserRole;
  departmentId?: string | null;
  extraAccess?: string[] | null;
};

const EXTRA_ACCESS_SET = new Set<string>(EXTRA_ACCESS_OPTIONS.map((item) => item.key));

export function normalizeExtraAccess(values: unknown): ExtraAccessKey[] {
  if (!Array.isArray(values)) {
    return [];
  }

  return Array.from(
    new Set(
      values
        .filter((value): value is string => typeof value === "string" && EXTRA_ACCESS_SET.has(value))
        .map((value) => value as ExtraAccessKey),
    ),
  );
}

export function hasExtraAccess(user: UserWithAccess, key: ExtraAccessKey) {
  return normalizeExtraAccess(user.extraAccess).includes(key);
}

export function canAccessTeamDashboard(user: UserWithAccess) {
  return user.role === UserRole.hr || user.role === UserRole.manager || user.role === UserRole.admin || hasExtraAccess(user, "team_dashboard");
}

export function canAccessWorkMonitor(user: UserWithAccess) {
  return user.role === UserRole.manager || user.role === UserRole.admin || hasExtraAccess(user, "work_monitor");
}

export function canPublishNotices(user: UserWithAccess) {
  return user.role === UserRole.admin || user.role === UserRole.manager || user.role === UserRole.hr || hasExtraAccess(user, "publish_notices");
}

export function canManageDepartments(user: UserWithAccess) {
  return user.role === UserRole.admin || user.role === UserRole.manager || hasExtraAccess(user, "manage_departments");
}

export function shouldScopePrivilegedViewsToDepartment(user: UserWithAccess) {
  return user.role === UserRole.manager || user.role === UserRole.employee;
}
