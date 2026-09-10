import { AppCloseTimerStop } from "@/components/dashboard/app-close-timer-stop";
import { AssignmentNotificationLive } from "@/components/dashboard/assignment-notification-live";
import { DashboardHeader } from "@/components/dashboard/header";
import { Sidebar } from "@/components/dashboard/sidebar";
import { TaskTimerAutoCloser } from "@/components/dashboard/task-timer-auto-closer";
import { TaskScreenshotMonitor } from "@/components/dashboard/task-screenshot-monitor";
import { WorkspaceNoticeLive } from "@/components/dashboard/workspace-notice-live";
import { DashboardMotionShell } from "@/components/motion/dashboard-motion-shell";
import { requireUser } from "@/lib/auth/server";
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
    name: user.name,
    role: user.role,
    designation: user.designation,
    avatarUrl: user.avatarUrl,
    extraAccess: user.extraAccess,
    assignmentNotifications: incomingAssignmentNotifications,
    noticeNotifications,
  };
  const headerUser: DashboardHeaderUser = {
    name: user.name,
    role: user.role,
    roleTitle: roleUiTitle(user.role),
    designation: user.designation,
    avatarUrl: user.avatarUrl,
    unreadMessages,
    requestNotifications,
    assignmentNotifications,
    noticeNotifications,
    attendanceSnapshot: attendanceSnapshot
      ? {
          status: attendanceSnapshot.status,
          note: attendanceSnapshot.note ?? "",
          breakMinutes: attendanceSnapshot.breakMinutes ?? 0,
          checkInAt: attendanceSnapshot.checkInAt?.toISOString() ?? null,
          checkOutAt: attendanceSnapshot.checkOutAt?.toISOString() ?? null,
        }
      : null,
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
            <AppCloseTimerStop />
            <AssignmentNotificationLive />
            <TaskTimerAutoCloser />
            <WorkspaceNoticeLive />
            <DashboardMotionShell>{children}</DashboardMotionShell>
            <TaskScreenshotMonitor currentUserId={user.id} />
          </main>
        </div>
      </div>
    </div>
  );
}
