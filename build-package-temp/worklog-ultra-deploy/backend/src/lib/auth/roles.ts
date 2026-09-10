export const APP_ROLES = ["employee", "hr", "manager", "admin"] as const;

export type AppRole = (typeof APP_ROLES)[number];

export const ROLE_RANK: Record<AppRole, number> = {
  employee: 0,
  hr: 1,
  manager: 2,
  admin: 3,
};

export function normalizeRole(value: string) {
  const lowered = value.toLowerCase();

  if (lowered === "team head" || lowered === "team_head") {
    return "manager";
  }

  if (lowered === "ceo" || lowered === "ceo/admin" || lowered === "ceo_admin") {
    return "admin";
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
  return role === "hr" || role === "manager" || role === "admin";
}

export function roleBadgeUpper(role: AppRole) {
  return role === "manager" ? "TEAM HEAD" : role.toUpperCase();
}

export function roleUiTitle(role: AppRole) {
  if (role === "manager") return "Team Head";
  if (role === "admin") return "CEO / Admin";
  return role === "hr" ? "HR" : "Employee";
}
