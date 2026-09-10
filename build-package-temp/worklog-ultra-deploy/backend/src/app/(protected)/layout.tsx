import { AssignmentNotificationLive } from "@/components/dashboard/assignment-notification-live";
import { DashboardHeader } from "@/components/dashboard/header";
import { Sidebar } from "@/components/dashboard/sidebar";
import { WorkspaceNoticeLive } from "@/components/dashboard/workspace-notice-live";
import { requireUser } from "@/lib/auth/server";
import { roleUiTitle } from "@/lib/auth/roles";
import { getApprovalNotificationCount, getAssignmentNotificationCount, getNoticeNotificationCount, getUnreadMessageCount } from "@/lib/worklog";

export const dynamic = "force-dynamic";

export default async function ProtectedLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  const user = await requireUser();
  const [unreadMessages, pendingApprovals, assignmentNotifications, noticeNotifications] = await Promise.all([
    getUnreadMessageCount(user.id),
    getApprovalNotificationCount(user),
    getAssignmentNotificationCount(user.id),
    getNoticeNotificationCount({ id: user.id, departmentId: user.departmentId }),
  ]);

  return (
    <div className="h-screen overflow-hidden bg-[var(--background)] text-[var(--foreground)]">
      <div className="flex h-screen">
        <Sidebar
          user={{
            name: user.name,
            role: user.role,
            designation: user.designation,
            avatarUrl: user.avatarUrl,
          }}
        />
        <div className="flex h-screen min-w-0 flex-1 flex-col overflow-y-auto">
          <DashboardHeader
            user={{
              name: user.name,
              role: user.role,
              roleTitle: roleUiTitle(user.role),
              designation: user.designation,
              avatarUrl: user.avatarUrl,
              unreadMessages,
              pendingApprovals,
              assignmentNotifications,
              noticeNotifications,
            }}
          />
          <main className="flex-1 px-4 py-5 xl:px-6">
            <AssignmentNotificationLive />
            <WorkspaceNoticeLive />
            {children}
          </main>
        </div>
      </div>
    </div>
  );
}
