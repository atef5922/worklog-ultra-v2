export const APP_ROLES = ["employee", "team_head", "admin", "moderator", "super_admin"] as const;

export type AppRole = (typeof APP_ROLES)[number];

export const ROLE_RANK: Record<AppRole, number> = {
  employee: 0,
  team_head: 1,
  admin: 2,
  moderator: 3,
  super_admin: 4,
};

export function normalizeRole(value: string) {
  const lowered = value.toLowerCase();

  if (lowered === "team head" || lowered === "team_head") {
    return "team_head";
  }

  if (lowered === "ceo" || lowered === "ceo/admin" || lowered === "ceo_admin") {
    return "super_admin";
  }

  if (lowered in ROLE_RANK) {
    return lowered as AppRole;
  }

  throw new Error("Invalid role selection.");
}

export function routeByRole() {
  return "/dashboard";
}

export function canAccessTeamAnalytics(role: AppRole) {
  return role === "super_admin";
}

export function canAccessAttendancePage(role: AppRole) {
  return APP_ROLES.includes(role);
}

export function roleBadgeUpper(role: AppRole) {
  return role.replaceAll("_", " ").toUpperCase();
}

export function roleUiTitle(role: AppRole) {
  const labels: Record<AppRole, string> = { super_admin: "Super Admin", moderator: "Moderator", admin: "Admin / HR", team_head: "Team Head", employee: "Employee" };
  return labels[role];
}
