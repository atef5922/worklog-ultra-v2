import type { AppRole } from "@/lib/auth/roles";
import { roleUiTitle } from "@/lib/auth/roles";

export type DepartmentOption = {
  id: string;
  name: string;
};

export type ProfileSettingsUser = {
  name: string;
  email: string;
  role: AppRole;
  displayRole: string;
  designation: string | null;
  phone: string | null;
  location: string | null;
  avatarUrl: string | null;
  monthlySalary: number | null;
  expectedDailyHours: number | null;
  departmentId: string | null;
};

export type ProfileUpdatePayload = {
  name: string;
  designation: string;
  phone: string;
  location: string;
  avatarUrl: string;
  monthlySalary?: number;
  expectedDailyHours?: number;
  departmentId: string | null;
};

export type ProfileUpdateResponse = {
  message: string;
  user: {
    name: string;
    avatarUrl: string | null;
    designation: string | null;
    department: string | null;
  };
  avatarUrl: string | null;
};

export type SessionUserResponse = {
  id: string;
  email: string;
  name: string;
  role: AppRole;
  avatarUrl: string | null;
  department: string | null;
};

export type DashboardAttendanceSnapshot = {
  status: "present" | "late" | "half_day" | "absent" | "remote";
  note: string;
  breakMinutes: number;
  checkInAt: string | null;
  checkOutAt: string | null;
};

export type DashboardSidebarUser = {
  name: string;
  role: AppRole;
  designation: string | null;
  avatarUrl: string | null;
  extraAccess?: string[];
  assignmentNotifications?: number;
  noticeNotifications?: number;
};

export type DashboardHeaderUser = {
  name: string;
  role: AppRole;
  roleTitle: string;
  designation: string | null;
  avatarUrl: string | null;
  unreadMessages: number;
  requestNotifications: number;
  assignmentNotifications: number;
  noticeNotifications: number;
  attendanceSnapshot: DashboardAttendanceSnapshot | null;
};

type ProfileSettingsSource = {
  name: string;
  email: string;
  role: AppRole;
  designation: string | null;
  phone: string | null;
  location: string | null;
  avatarUrl: string | null;
  monthlySalary: number | string | { toString(): string } | null;
  expectedDailyHours: number | string | { toString(): string } | null;
  departmentId: string | null;
};

function toNullableNumber(value: ProfileSettingsSource["monthlySalary"]) {
  if (value === null || typeof value === "undefined") {
    return null;
  }

  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

export function toProfileSettingsUser(user: ProfileSettingsSource): ProfileSettingsUser {
  return {
    name: user.name,
    email: user.email,
    role: user.role,
    displayRole: roleUiTitle(user.role),
    designation: user.designation,
    phone: user.phone,
    location: user.location,
    avatarUrl: user.avatarUrl,
    monthlySalary: toNullableNumber(user.monthlySalary),
    expectedDailyHours: toNullableNumber(user.expectedDailyHours) ?? 8,
    departmentId: user.departmentId,
  };
}
