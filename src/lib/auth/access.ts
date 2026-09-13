import { UserRole } from "@prisma/client";

export function getRoleAccessCode(role: UserRole) {
  // Public registration does not grant management roles.
  return undefined;
}

export function roleNeedsDepartment(role: UserRole) {
  return role !== UserRole.super_admin;
}

export function roleNeedsAccessCode(role: UserRole) {
  return role !== UserRole.employee;
}
