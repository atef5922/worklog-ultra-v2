"use client";

import Link from "next/link";
import { Bell, ChevronDown, ChevronLeft, Clock3, LogOut, Settings } from "lucide-react";
import { usePathname, useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { toast } from "sonner";
import { MobileSidebar } from "@/components/dashboard/sidebar";
import { ThemeToggle } from "@/components/theme/theme-toggle";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";

type AssignmentNotificationItem = {
  taskId: string;
  taskTitle: string;
  assigneeName: string;
  assigneeDepartmentName: string;
  status: "done" | "in_progress" | "pending";
  note: string;
  trackedMinutes: number;
  updatedAt: string;
};

type NoticeNotificationItem = {
  id: string;
  title: string;
  body: string;
  publishedAt: string | null;
  authorName: string;
  departmentName: string;
};

type NotificationDetail =
  | {
      kind: "notice";
      id: string;
      title: string;
      subtitle: string;
      body: string;
      timeLabel: string;
    }
  | {
      kind: "assignment";
      id: string;
      title: string;
      subtitle: string;
      body: string;
      timeLabel: string;
    };

function getAssignmentReadKey(item: AssignmentNotificationItem) {
  return `assignment-notification-read:${item.taskId}:${item.updatedAt}`;
}

function getNoticeReadKey(item: NoticeNotificationItem) {
  return `notice-read:${item.id}`;
}

export function DashboardHeader({
  user,
}: {
  user: {
    name: string;
    role: "employee" | "hr" | "manager" | "admin";
    roleTitle: string;
    designation: string | null;
    avatarUrl?: string | null;
    unreadMessages: number;
    pendingApprovals: number;
    assignmentNotifications: number;
    noticeNotifications: number;
  };
}) {
  const router = useRouter();
  const pathname = usePathname();
  const [unreadMessages, setUnreadMessages] = useState(user.unreadMessages);
  const [assignmentNotifications, setAssignmentNotifications] = useState(user.assignmentNotifications);
  const [assignmentItems, setAssignmentItems] = useState<AssignmentNotificationItem[]>([]);
  const [noticeNotifications, setNoticeNotifications] = useState(user.noticeNotifications);
  const [noticeItems, setNoticeItems] = useState<NoticeNotificationItem[]>([]);
  const [currentTime, setCurrentTime] = useState("");
  const [menuOpen, setMenuOpen] = useState(false);
  const [bellOpen, setBellOpen] = useState(false);
  const [notificationDetail, setNotificationDetail] = useState<NotificationDetail | null>(null);
  const previousUnreadRef = useRef(user.unreadMessages);
  const menuRef = useRef<HTMLDivElement | null>(null);
  const bellRef = useRef<HTMLDivElement | null>(null);
  const visibleUnreadMessages =
    pathname === "/dashboard/messages" ? 0 : unreadMessages + user.pendingApprovals + assignmentNotifications + noticeNotifications;

  useEffect(() => {
    function syncTime() {
      setCurrentTime(
        new Intl.DateTimeFormat("en-BD", {
          timeZone: "Asia/Dhaka",
          hour: "numeric",
          minute: "2-digit",
          hour12: true,
        }).format(new Date()),
      );
    }

    syncTime();
    const interval = window.setInterval(syncTime, 30000);
    return () => window.clearInterval(interval);
  }, []);

  useEffect(() => {
    let cancelled = false;

    async function pollUnread() {
      const response = await fetch("/api/messages/status", { cache: "no-store" });
      const raw = await response.text();
      const result = raw ? JSON.parse(raw) : { unreadCount: 0 };

      if (!response.ok || cancelled) {
        return;
      }

      const nextCount = pathname === "/dashboard/messages" ? 0 : Number(result.unreadCount ?? 0);
      previousUnreadRef.current = nextCount;
      setUnreadMessages(nextCount);
    }

    pollUnread().catch(() => null);
    const interval = window.setInterval(() => {
      pollUnread().catch(() => null);
    }, 15000);

    return () => {
      cancelled = true;
      window.clearInterval(interval);
    };
  }, [pathname]);

  useEffect(() => {
    let cancelled = false;

    async function pollAssignmentNotifications() {
      const response = await fetch("/api/dashboard/assignment-notifications", { cache: "no-store" });
      const raw = await response.text();
      const result = raw ? JSON.parse(raw) : { notifications: [] };

      if (!response.ok || cancelled) {
        return;
      }

      const notifications = Array.isArray(result.notifications) ? result.notifications : [];
      const unreadItems = notifications.filter((item: { taskId: string; updatedAt: string }) => {
        try {
          return window.localStorage.getItem(`assignment-notification-read:${item.taskId}:${item.updatedAt}`) !== "read";
        } catch {
          return true;
        }
      });

      setAssignmentItems(unreadItems);
      setAssignmentNotifications(pathname === "/dashboard/assignments" ? 0 : unreadItems.length);
    }

    pollAssignmentNotifications().catch(() => null);
    const interval = window.setInterval(() => {
      pollAssignmentNotifications().catch(() => null);
    }, 15000);

    return () => {
      cancelled = true;
      window.clearInterval(interval);
    };
  }, [pathname]);

  useEffect(() => {
    let cancelled = false;

    async function pollNoticeNotifications() {
      const response = await fetch("/api/dashboard/notices", { cache: "no-store" });
      const raw = await response.text();
      const result = raw ? JSON.parse(raw) : { notices: [] };

      if (!response.ok || cancelled) {
        return;
      }

      const notices = Array.isArray(result.notices) ? result.notices : [];
      const unreadItems = notices.filter((item: { id: string }) => {
        try {
          return window.localStorage.getItem(`notice-read:${item.id}`) !== "read";
        } catch {
          return true;
        }
      });

      setNoticeItems(unreadItems);
      setNoticeNotifications(unreadItems.length);
    }

    pollNoticeNotifications().catch(() => null);
    const interval = window.setInterval(() => {
      pollNoticeNotifications().catch(() => null);
    }, 15000);

    return () => {
      cancelled = true;
      window.clearInterval(interval);
    };
  }, []);

  useEffect(() => {
    function closeOnOutsideClick(event: MouseEvent) {
      if (!menuRef.current?.contains(event.target as Node)) {
        setMenuOpen(false);
      }

      if (!bellRef.current?.contains(event.target as Node)) {
        setBellOpen(false);
        setNotificationDetail(null);
      }
    }

    if (menuOpen || bellOpen) {
      window.addEventListener("mousedown", closeOnOutsideClick);
    }

    return () => window.removeEventListener("mousedown", closeOnOutsideClick);
  }, [bellOpen, menuOpen]);

  function markAssignmentAsRead(item: AssignmentNotificationItem) {
    try {
      window.localStorage.setItem(getAssignmentReadKey(item), "read");
      window.localStorage.setItem(`assignment-notification-seen:${item.taskId}:${item.updatedAt}`, "seen");
    } catch {
      // ignore storage errors
    }

    setAssignmentItems((current) => current.filter((entry) => getAssignmentReadKey(entry) !== getAssignmentReadKey(item)));
    setAssignmentNotifications((current) => Math.max(0, current - 1));
    setNotificationDetail({
      kind: "assignment",
      id: item.taskId,
      title: item.taskTitle,
      subtitle: `${item.assigneeName} · ${item.assigneeDepartmentName}`,
      body: item.note ? item.note : `Tracked time: ${Math.max(0, item.trackedMinutes)} minutes`,
      timeLabel: new Intl.DateTimeFormat("en-BD", {
        timeZone: "Asia/Dhaka",
        day: "numeric",
        month: "short",
        hour: "numeric",
        minute: "2-digit",
      }).format(new Date(item.updatedAt)),
    });
  }

  function markNoticeAsRead(item: NoticeNotificationItem) {
    try {
      window.localStorage.setItem(getNoticeReadKey(item), "read");
    } catch {
      // ignore storage errors
    }

    setNoticeItems((current) => current.filter((entry) => getNoticeReadKey(entry) !== getNoticeReadKey(item)));
    setNoticeNotifications((current) => Math.max(0, current - 1));
    setNotificationDetail({
      kind: "notice",
      id: item.id,
      title: item.title,
      subtitle: `${item.departmentName} · by ${item.authorName}`,
      body: item.body,
      timeLabel: item.publishedAt
        ? new Intl.DateTimeFormat("en-BD", {
            timeZone: "Asia/Dhaka",
            day: "numeric",
            month: "short",
            hour: "numeric",
            minute: "2-digit",
          }).format(new Date(item.publishedAt))
        : "Just now",
    });
  }

  async function logout() {
    const response = await fetch("/api/auth/logout", { method: "POST" });
    const result = await response.json();
    toast.success(result.message);
    router.push("/auth/login");
    router.refresh();
  }

  return (
    <header className="sticky top-0 z-20 flex items-center justify-between gap-4 border-b border-[var(--panel-border)] bg-[var(--panel)] px-4 py-4 xl:px-6">
      <MobileSidebar
        user={{
          name: user.name,
          role: user.role,
          designation: user.designation,
          avatarUrl: user.avatarUrl,
        }}
      />
      <div className="flex-1" />
      <div className="ml-auto flex items-center gap-5">
        <ThemeToggle className="hidden h-12 w-12 rounded-2xl border border-[var(--panel-border)] bg-[var(--panel)] text-[var(--foreground)] shadow-[0_10px_24px_rgba(148,163,184,0.14)] hover:bg-[var(--panel-alt)] md:inline-flex" />
        <div className="hidden items-center gap-2 text-sm font-semibold text-[var(--foreground)] md:flex">
          <Clock3 className="h-4 w-4 text-[var(--muted-foreground)]" />
          {currentTime}
        </div>
        <div className="relative" ref={bellRef}>
          <button
            className="relative inline-flex h-10 w-10 items-center justify-center text-[var(--muted-foreground)] transition-colors hover:text-[var(--foreground)]"
            onClick={() => {
              setBellOpen((current) => !current);
              setNotificationDetail(null);
            }}
            type="button"
          >
            <Bell className="h-5 w-5" />
            {visibleUnreadMessages > 0 ? (
              <span className="absolute right-0 top-0 inline-flex min-w-5 items-center justify-center rounded-full bg-[#ef4444] px-1.5 text-[10px] font-semibold text-white">
                {visibleUnreadMessages > 9 ? "9+" : visibleUnreadMessages}
              </span>
            ) : null}
          </button>
          {bellOpen ? (
            <div className="absolute right-0 top-[calc(100%+12px)] z-30 w-[360px] rounded-3xl border border-[var(--panel-border)] bg-[var(--panel)] p-3 shadow-[0_18px_40px_rgba(15,23,42,0.14)]">
              {notificationDetail ? (
                <div className="space-y-3">
                  <button
                    className="inline-flex items-center gap-2 text-sm font-semibold text-[#4f5ef7]"
                    onClick={() => setNotificationDetail(null)}
                    type="button"
                  >
                    <ChevronLeft className="h-4 w-4" />
                    Back
                  </button>
                  <div className="rounded-2xl border border-[var(--panel-border)] bg-[var(--panel-muted)] p-4">
                    <p className="text-base font-bold text-[var(--foreground)]">{notificationDetail.title}</p>
                    <p className="mt-1 text-xs font-semibold uppercase tracking-[0.18em] text-[#4f5ef7]">
                      {notificationDetail.subtitle}
                    </p>
                    <p className="mt-3 text-sm leading-6 text-[var(--foreground)]">{notificationDetail.body}</p>
                    <p className="mt-3 text-xs text-[var(--muted-foreground)]">{notificationDetail.timeLabel}</p>
                  </div>
                </div>
              ) : (
                <div className="space-y-3">
                  <div className="flex items-center justify-between">
                    <div>
                      <p className="text-sm font-bold text-[var(--foreground)]">Notifications</p>
                      <p className="text-xs text-[var(--muted-foreground)]">
                        {noticeItems.length + assignmentItems.length} unread update
                        {noticeItems.length + assignmentItems.length === 1 ? "" : "s"}
                      </p>
                    </div>
                    <Link className="text-xs font-semibold text-[#4f5ef7]" href="/dashboard/notices">
                      Manage notices
                    </Link>
                  </div>

                  {noticeItems.length ? (
                    <div className="space-y-2">
                      <p className="px-1 text-[11px] font-semibold uppercase tracking-[0.16em] text-[var(--muted-foreground)]">Notices</p>
                      {noticeItems.slice(0, 5).map((item) => (
                        <button
                          key={item.id}
                          className="w-full rounded-2xl border border-[var(--panel-border)] bg-[var(--panel-muted)] px-3 py-3 text-left transition hover:bg-[var(--panel-alt)]"
                          onClick={() => markNoticeAsRead(item)}
                          type="button"
                        >
                          <p className="truncate text-sm font-semibold text-[var(--foreground)]">{item.title}</p>
                          <p className="mt-1 line-clamp-2 text-xs leading-5 text-[var(--muted-foreground)]">{item.body}</p>
                        </button>
                      ))}
                    </div>
                  ) : null}

                  {assignmentItems.length ? (
                    <div className="space-y-2">
                      <p className="px-1 text-[11px] font-semibold uppercase tracking-[0.16em] text-[var(--muted-foreground)]">Assignments</p>
                      {assignmentItems.slice(0, 5).map((item) => (
                        <button
                          key={`${item.taskId}-${item.updatedAt}`}
                          className="w-full rounded-2xl border border-[var(--panel-border)] bg-[var(--panel-muted)] px-3 py-3 text-left transition hover:bg-[var(--panel-alt)]"
                          onClick={() => markAssignmentAsRead(item)}
                          type="button"
                        >
                          <p className="truncate text-sm font-semibold text-[var(--foreground)]">{item.taskTitle}</p>
                          <p className="mt-1 text-xs text-[var(--muted-foreground)]">
                            {item.assigneeName} · {item.status === "done" ? "Completed" : "Updated"}
                          </p>
                        </button>
                      ))}
                    </div>
                  ) : null}

                  {!noticeItems.length && !assignmentItems.length ? (
                    <div className="rounded-2xl border border-dashed border-[var(--panel-border)] bg-[var(--panel-muted)] px-4 py-5 text-center text-sm text-[var(--muted-foreground)]">
                      No unread notifications right now.
                    </div>
                  ) : null}
                </div>
              )}
            </div>
          ) : null}
        </div>
        <div className="relative" ref={menuRef}>
          <button
            className="flex items-center gap-3 rounded-2xl px-3 py-1.5 transition hover:bg-[var(--panel-alt)]"
            onClick={() => setMenuOpen((current) => !current)}
            type="button"
          >
            <Avatar>
              {user.avatarUrl ? <AvatarImage alt={user.name} src={user.avatarUrl} /> : null}
              <AvatarFallback>{user.name.slice(0, 1)}</AvatarFallback>
            </Avatar>
            <div className="hidden text-left sm:block">
              <p className="text-sm font-semibold text-[var(--foreground)]">{user.name}</p>
              <p className="text-xs text-[var(--muted-foreground)]">{user.designation ?? user.roleTitle}</p>
            </div>
            <ChevronDown className="h-4 w-4 text-[var(--muted-foreground)]" />
          </button>
          {menuOpen ? (
            <div className="absolute right-0 top-[calc(100%+10px)] z-20 min-w-[180px] rounded-2xl border border-[var(--panel-border)] bg-[var(--panel)] p-2 shadow-[0_18px_40px_rgba(15,23,42,0.12)]">
              <Link
                className="flex items-center gap-3 rounded-xl px-3 py-2.5 text-sm font-medium text-[var(--foreground)] transition hover:bg-[var(--panel-alt)]"
                href="/dashboard/settings"
                onClick={() => setMenuOpen(false)}
              >
                <Settings className="h-4 w-4" />
                Settings
              </Link>
              <button
                className="flex w-full items-center gap-3 rounded-xl px-3 py-2.5 text-left text-sm font-medium text-rose-600 transition hover:bg-rose-50"
                onClick={logout}
                type="button"
              >
                <LogOut className="h-4 w-4" />
                Logout
              </button>
            </div>
          ) : null}
        </div>
      </div>
    </header>
  );
}
