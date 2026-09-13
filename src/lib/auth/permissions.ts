import { can, canOpenManagement, isSuperAdmin, type AccessActor } from "@/lib/auth/policy";
export const EXTRA_ACCESS_OPTIONS = [
 { key: "team_dashboard", label: "Team Dashboard" }, { key: "work_monitor", label: "Work Monitor" },
 { key: "publish_notices", label: "Publish Notices" }, { key: "manage_departments", label: "Manage Departments" },
] as const;
export type ExtraAccessKey = typeof EXTRA_ACCESS_OPTIONS[number]["key"];
export const MANAGER_GRANTABLE_EXTRA_ACCESS: ExtraAccessKey[] = [];
type UserWithAccess = Partial<AccessActor> & { role: string; extraAccess?: string[] | null };
const actor=(u:UserWithAccess):AccessActor=>({...u,id:u.id??""});
export function normalizeExtraAccess(values: unknown): ExtraAccessKey[] {
 return Array.isArray(values)?values.filter((v):v is ExtraAccessKey=>EXTRA_ACCESS_OPTIONS.some(o=>o.key===v)):[];
}
// Retained for old components only. Legacy extraAccess cannot authorize requests.
export function hasExtraAccess(_user: UserWithAccess, _key: ExtraAccessKey) { return false; }
export function canAccessTeamDashboard(user:UserWithAccess){return user.role==="team_head"||isSuperAdmin(actor(user));}
export function canAccessWorkMonitor(user:UserWithAccess){return canOpenManagement(actor(user))&&can(actor(user),"employees.view");}
export function canAccessScreenshotGallery(user:UserWithAccess){return false;}
export function canPublishNotices(user:UserWithAccess){return can(actor(user),"notices.publish");}
export function canManageDepartments(user:UserWithAccess){return can(actor(user),"departments.manage");}
export function shouldScopePrivilegedViewsToDepartment(user:UserWithAccess){return !isSuperAdmin(actor(user));}
