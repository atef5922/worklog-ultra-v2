import { UserRole } from "@prisma/client";

export function getRoleAccessCode(role: UserRole) {
  if (role === UserRole.hr) return process.env.AUTH_SIGNUP_HR_CODE;
  if (role === UserRole.manager) return process.env.AUTH_SIGNUP_MANAGER_CODE;
  if (role === UserRole.admin) return process.env.AUTH_SIGNUP_ADMIN_CODE;
  return undefined;
}

export function roleNeedsDepartment(role: UserRole) {
  return role !== UserRole.admin;
}

export function roleNeedsAccessCode(role: UserRole) {
  return role !== UserRole.employee;
}
