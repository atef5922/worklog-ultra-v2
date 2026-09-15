import { serializeAttendanceRecord } from "@/lib/attendance-record";
import { TaskTimerProvider } from "@/components/dashboard/task-timer-provider";
import { DashboardHeader } from "@/components/dashboard/header";
import { Sidebar } from "@/components/dashboard/sidebar";
import { TaskScreenshotMonitor } from "@/components/dashboard/task-screenshot-monitor";
import { DashboardMotionShell } from "@/components/motion/dashboard-motion-shell";
import { requireUser } from "@/lib/auth/server";
import { AccessRefresh } from "@/components/management/access-refresh";
import { roleUiTitle } from "@/lib/auth/roles";
import type { DashboardHeaderUser, DashboardSidebarUser } from "@/lib/contracts/user";
import {
  getAssignmentNotificationCount,
  getIncomingAssignmentNotificationCount,
  getCurrentUserAttendanceSnapshot,
  getNoticeNotificationCount,
  getRequestNotificationCount,
  getUnreadMessageCount,
} from "@/lib/worklog";

export const dynamic = "force-dynamic";

export default async function ProtectedLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  const user = await requireUser();
  const [unreadMessages, requestNotifications, assignmentNotifications, incomingAssignmentNotifications, noticeNotifications, attendanceSnapshot] = await Promise.all([
    getUnreadMessageCount(user.id),
    getRequestNotificationCount(user),
    getAssignmentNotificationCount(user.id),
    getIncomingAssignmentNotificationCount(user.id),
    getNoticeNotificationCount({ id: user.id, departmentId: user.departmentId }),
    getCurrentUserAttendanceSnapshot(user.id),
  ]);
  const sidebarUser: DashboardSidebarUser = {
    id: user.id,
    managementEnabled: user.managementEnabled,
    permissions: user.permissions,
    name: user.name,
    role: user.role,
    designation: user.designation,
    avatarUrl: user.avatarUrl,
    extraAccess: user.extraAccess,
    assignmentNotifications: incomingAssignmentNotifications,
    noticeNotifications,
  };
  const headerUser: DashboardHeaderUser = {
    sidebarUser,
    name: user.name,
    role: user.role,
    roleTitle: roleUiTitle(user.role),
    designation: user.designation,
    avatarUrl: user.avatarUrl,
    unreadMessages,
    requestNotifications,
    assignmentNotifications,
    noticeNotifications,
    attendanceSnapshot: attendanceSnapshot ? serializeAttendanceRecord(attendanceSnapshot) : null,
  };

  return (
    <div className="min-h-dvh overflow-hidden bg-[var(--background)] text-[var(--foreground)] md:h-screen">
      <div className="flex min-h-dvh md:h-screen">
        <Sidebar user={sidebarUser} />
        {/* dashboard-scroll lets globals.css switch this scroller off for a page
            that opts into `data-fit-viewport`, so the entrance animation cannot
            flash a scrollbar on a layout that is meant to fit exactly. */}
        <div className="dashboard-scroll flex min-h-dvh min-w-0 flex-1 flex-col overflow-x-hidden overflow-y-auto md:h-screen">
          <DashboardHeader user={headerUser} />
          <main className="flex min-h-0 flex-1 flex-col px-3 py-4 sm:px-4 sm:py-5 xl:px-6 2xl:px-7">
            <TaskTimerProvider key={user.id} userId={user.id}>
            <AccessRefresh version={user.accessVersion} />
            <DashboardMotionShell>{children}</DashboardMotionShell>
            <TaskScreenshotMonitor currentUserId={user.id} />
            </TaskTimerProvider>
          </main>
        </div>
      </div>
    </div>
  );
}
