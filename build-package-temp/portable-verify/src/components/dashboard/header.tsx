"use client";

import Link from "next/link";
import { Bell, ChevronDown, ChevronLeft, Clock3, HelpCircle, LogOut, MessageSquareMore, Settings } from "lucide-react";
import { usePathname, useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { toast } from "sonner";
import { MobileSidebar } from "@/components/dashboard/sidebar";
import { DashboardWorkdayTimer } from "@/components/dashboard/dashboard-workday-timer";
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

type RequestNotificationItem = {
  id: string;
  kind: "manager_review" | "employee_request";
  status: "pending" | "approved" | "rejected";
  reason: string;
  reviewNote: string | null;
  taskId: string;
  taskTitle: string;
  taskDate: string;
  departmentName: string;
  eventAt: string;
  employeeName?: string;
  employeeDepartmentName?: string;
  reviewerName?: string;
};

type NotificationDetail =
  | {
      kind: "notice";
      id: string;
      title: string;
      subtitle: string;
      body: string;
      timeLabel: string;
      actionHref?: string;
      actionLabel?: string;
    }
  | {
      kind: "assignment";
      id: string;
      title: string;
      subtitle: string;
      body: string;
      timeLabel: string;
      actionHref?: string;
      actionLabel?: string;
    }
  | {
      kind: "request";
      id: string;
      title: string;
      subtitle: string;
      body: string;
      timeLabel: string;
      actionHref: string;
      actionLabel: string;
    };

function getAssignmentReadKey(item: AssignmentNotificationItem) {
  return `assignment-notification-read:${item.taskId}:${item.updatedAt}`;
}

function getNoticeReadKey(item: NoticeNotificationItem) {
  return `notice-read:${item.id}`;
}

function getRequestReadKey(item: RequestNotificationItem) {
  return `request-notification-read:${item.id}:${item.eventAt}`;
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
    requestNotifications: number;
    assignmentNotifications: number;
    noticeNotifications: number;
    attendanceSnapshot: {
      status: "present" | "late" | "half_day" | "absent" | "remote";
      note: string;
      breakMinutes: number;
      checkInAt: string | null;
      checkOutAt: string | null;
    } | null;
  };
}) {
  const router = useRouter();
  const pathname = usePathname();
  const [unreadMessages, setUnreadMessages] = useState(user.unreadMessages);
  const [requestNotifications, setRequestNotifications] = useState(user.requestNotifications);
  const [requestItems, setRequestItems] = useState<RequestNotificationItem[]>([]);
  const [assignmentNotifications, setAssignmentNotifications] = useState(user.assignmentNotifications);
  const [assignmentItems, setAssignmentItems] = useState<AssignmentNotificationItem[]>([]);
  const [noticeNotifications, setNoticeNotifications] = useState(user.noticeNotifications);
  const [noticeItems, setNoticeItems] = useState<NoticeNotificationItem[]>([]);
  const [notificationsHydrated, setNotificationsHydrated] = useState(false);
  const [currentClock, setCurrentClock] = useState({
    time: "",
    seconds: "",
    label: "",
    date: "",
  });
  const [menuOpen, setMenuOpen] = useState(false);
  const [bellOpen, setBellOpen] = useState(false);
  const [notificationDetail, setNotificationDetail] = useState<NotificationDetail | null>(null);
  const menuRef = useRef<HTMLDivElement | null>(null);
  const bellRef = useRef<HTMLDivElement | null>(null);
  const visibleUnreadMessages =
    pathname === "/dashboard/messages" ? 0 : unreadMessages;
  const visibleBellNotifications = notificationsHydrated ? requestNotifications + assignmentNotifications + noticeNotifications : 0;

  useEffect(() => {
    function syncTime() {
      const now = new Date();
      const timeParts = new Intl.DateTimeFormat("en-BD", {
        timeZone: "Asia/Dhaka",
        hour: "numeric",
        minute: "2-digit",
        second: "2-digit",
        hour12: true,
      }).formatToParts(now);
      const hour = timeParts.find((part) => part.type === "hour")?.value ?? "";
      const minute = timeParts.find((part) => part.type === "minute")?.value ?? "00";
      const second = timeParts.find((part) => part.type === "second")?.value ?? "00";
      const dayPeriod = timeParts.find((part) => part.type === "dayPeriod")?.value ?? "";

      setCurrentClock({
        time: `${hour}:${minute}:${second}`,
        seconds: dayPeriod,
        label: new Intl.DateTimeFormat("en-BD", {
          timeZone: "Asia/Dhaka",
          weekday: "short",
        }).format(now),
        date: new Intl.DateTimeFormat("en-BD", {
          timeZone: "Asia/Dhaka",
          day: "numeric",
          month: "short",
          year: "numeric",
        }).format(now),
      });
    }

    syncTime();
    const interval = window.setInterval(syncTime, 1000);
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

    async function pollRequestNotifications() {
      const response = await fetch("/api/dashboard/request-notifications", { cache: "no-store" });
      const raw = await response.text();
      const result = raw ? JSON.parse(raw) : { notifications: [] };

      if (!response.ok || cancelled) {
        return;
      }

      const notifications = Array.isArray(result.notifications) ? result.notifications : [];
      const unreadItems = notifications.filter((item: RequestNotificationItem) => {
        try {
          return window.localStorage.getItem(getRequestReadKey(item)) !== "read";
        } catch {
          return true;
        }
      });

      setRequestItems(unreadItems);
      setRequestNotifications(pathname === "/dashboard/requests" ? 0 : unreadItems.length);
    }

    pollRequestNotifications().catch(() => null);
    const interval = window.setInterval(() => {
      pollRequestNotifications().catch(() => null);
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
    if (requestItems.length || assignmentItems.length || noticeItems.length) {
      setNotificationsHydrated(true);
      return;
    }

    if (requestNotifications === 0 && assignmentNotifications === 0 && noticeNotifications === 0) {
      setNotificationsHydrated(true);
    }
  }, [
    assignmentItems.length,
    assignmentNotifications,
    noticeItems.length,
    noticeNotifications,
    requestItems.length,
    requestNotifications,
  ]);

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
      actionHref: `/dashboard/assignments?from=notification&taskId=${item.taskId}`,
      actionLabel: "Open assignment",
    });
  }

  function markRequestAsRead(item: RequestNotificationItem) {
    try {
      window.localStorage.setItem(getRequestReadKey(item), "read");
    } catch {
      // ignore storage errors
    }

    setRequestItems((current) => current.filter((entry) => getRequestReadKey(entry) !== getRequestReadKey(item)));
    setRequestNotifications((current) => Math.max(0, current - 1));
    setNotificationDetail({
      kind: "request",
      id: item.id,
      title: item.taskTitle,
      subtitle:
        item.kind === "manager_review"
          ? `${item.employeeName ?? "Employee"} Â· ${item.employeeDepartmentName ?? item.departmentName}`
          : `${item.departmentName} Â· ${item.reviewerName ?? "Team Head"}`,
      body:
        item.kind === "manager_review"
          ? item.reason
          : item.status === "pending"
            ? `Your request is waiting for Team Head review.\n\n${item.reason}`
            : `${item.status === "approved" ? "Approved" : "Rejected"} by ${item.reviewerName ?? "Team Head"}.\n\n${
                item.reviewNote ? `Note: ${item.reviewNote}\n\n` : ""
              }${item.reason}`,
      timeLabel: new Intl.DateTimeFormat("en-BD", {
        timeZone: "Asia/Dhaka",
        day: "numeric",
        month: "short",
        hour: "numeric",
        minute: "2-digit",
      }).format(new Date(item.eventAt)),
      actionHref:
        item.kind === "manager_review"
          ? `/dashboard/requests?requestId=${item.id}`
          : `/dashboard/requests?taskId=${item.taskId}`,
      actionLabel: item.kind === "manager_review" ? "Review request" : "Open request details",
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
      actionHref: "/dashboard/notices",
      actionLabel: "Open notices",
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
    <header className="dashboard-topbar sticky top-0 z-20 flex items-center justify-between gap-4 px-4 py-4 xl:px-6">
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
        <div className="hidden items-center gap-2 text-[var(--foreground)] md:flex">
          <Clock3 className="h-4 w-4 text-[var(--muted-foreground)]" />
          <div className="flex items-center gap-2 font-mono tabular-nums">
            <span className="min-w-[148px] text-[1.55rem] font-extrabold leading-none tracking-[0.08em] text-[var(--foreground)]">
              {currentClock.time}
            </span>
            <span className="min-w-[28px] text-base font-bold leading-none tracking-[0.08em] text-[#4f5ef7]">
              {currentClock.seconds}
            </span>
            <div className="flex min-w-[146px] items-baseline gap-2">
              <span className="text-sm font-semibold uppercase leading-none tracking-[0.14em] text-[var(--muted-foreground)]">
                {currentClock.label}
              </span>
              <span className="text-xs font-semibold leading-none tracking-[0.08em] text-[var(--muted-foreground)]">
                {currentClock.date}
              </span>
            </div>
          </div>
        </div>
        <Link
          className="relative inline-flex h-10 w-10 items-center justify-center text-[var(--muted-foreground)] transition-colors hover:text-[var(--foreground)]"
          href="/dashboard/messages"
        >
          <MessageSquareMore className="h-5 w-5" />
          {visibleUnreadMessages > 0 ? (
            <span className="absolute right-0 top-0 inline-flex min-w-5 items-center justify-center rounded-full bg-[#4f5ef7] px-1.5 text-[10px] font-semibold text-white">
              {visibleUnreadMessages > 9 ? "9+" : visibleUnreadMessages}
            </span>
          ) : null}
        </Link>
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
            {visibleBellNotifications > 0 ? (
              <span className="absolute right-0 top-0 inline-flex min-w-5 items-center justify-center rounded-full bg-[#ef4444] px-1.5 text-[10px] font-semibold text-white">
                {visibleBellNotifications > 9 ? "9+" : visibleBellNotifications}
              </span>
            ) : null}
          </button>
          {bellOpen ? (
            <div className="dashboard-header-popover absolute right-0 top-[calc(100%+12px)] z-30 w-[360px] rounded-3xl border border-[var(--panel-border)] bg-[var(--panel)] p-3 shadow-[0_18px_40px_rgba(15,23,42,0.14)]">
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
                    <p className="mt-3 whitespace-pre-line text-sm leading-6 text-[var(--foreground)]">{notificationDetail.body}</p>
                    <p className="mt-3 text-xs text-[var(--muted-foreground)]">{notificationDetail.timeLabel}</p>
                    {notificationDetail.actionHref && notificationDetail.actionLabel ? (
                      <Link
                        className="mt-4 inline-flex rounded-xl bg-[#4f5ef7] px-3 py-2 text-sm font-semibold text-white"
                        href={notificationDetail.actionHref}
                        onClick={() => {
                          setBellOpen(false);
                          setNotificationDetail(null);
                        }}
                      >
                        {notificationDetail.actionLabel}
                      </Link>
                    ) : null}
                  </div>
                </div>
              ) : (
                <div className="space-y-3">
                  <div className="flex items-center justify-between">
                    <div>
                      <p className="text-sm font-bold text-[var(--foreground)]">Notifications</p>
                      <p className="text-xs text-[var(--muted-foreground)]">
                        {noticeItems.length + assignmentItems.length + requestItems.length} unread update
                        {noticeItems.length + assignmentItems.length + requestItems.length === 1 ? "" : "s"}
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

                  {requestItems.length ? (
                    <div className="space-y-2">
                      <p className="px-1 text-[11px] font-semibold uppercase tracking-[0.16em] text-[var(--muted-foreground)]">Requests</p>
                      {requestItems.slice(0, 5).map((item) => (
                        <button
                          key={`${item.id}-${item.eventAt}`}
                          className="w-full rounded-2xl border border-[var(--panel-border)] bg-[var(--panel-muted)] px-3 py-3 text-left transition hover:bg-[var(--panel-alt)]"
                          onClick={() => markRequestAsRead(item)}
                          type="button"
                        >
                          <p className="truncate text-sm font-semibold text-[var(--foreground)]">{item.taskTitle}</p>
                          <p className="mt-1 text-xs text-[var(--muted-foreground)]">
                            {item.kind === "manager_review"
                              ? `${item.employeeName ?? "Employee"} Â· needs approval`
                              : `Request ${item.status}`}
                          </p>
                        </button>
                      ))}
                    </div>
                  ) : null}

                  {!noticeItems.length && !assignmentItems.length && !requestItems.length ? (
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
            <div className="dashboard-header-popover absolute right-0 top-[calc(100%+10px)] z-20 min-w-[180px] rounded-2xl border border-[var(--panel-border)] bg-[var(--panel)] p-2 shadow-[0_18px_40px_rgba(15,23,42,0.12)]">
              <Link
                className="flex items-center gap-3 rounded-xl px-3 py-2.5 text-sm font-medium text-[var(--foreground)] transition hover:bg-[var(--panel-alt)]"
                href="/dashboard/help"
                onClick={() => setMenuOpen(false)}
              >
                <HelpCircle className="h-4 w-4" />
                Help
              </Link>
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
