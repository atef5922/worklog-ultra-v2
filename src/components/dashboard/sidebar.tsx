"use client";

import * as Dialog from "@radix-ui/react-dialog";
import { motion } from "framer-motion";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { BellRing, BriefcaseBusiness, Camera, CalendarCheck2, ChevronLeft, ChevronRight, CheckSquare2, ClipboardList, FileClock, FolderTree, LayoutDashboard, LogOut, Menu, Settings, Shield, UserRoundSearch, Users, X } from "lucide-react";
import { useEffect, useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { NOTICES_READ_EVENT } from "@/lib/dashboard-live-events";
import type { DashboardSidebarUser } from "@/lib/contracts/user";

const navItems = [
  { href: "/dashboard", icon: LayoutDashboard, label: "Dashboard" },
  { href: "/dashboard/plan", icon: ClipboardList, label: "Today's Task" },
  { href: "/dashboard/report", icon: FileClock, label: "Report" },
  { href: "/dashboard/attendance", icon: CalendarCheck2, label: "Attendance" },
  { href: "/dashboard/history", icon: BriefcaseBusiness, label: "History" },
  { href: "/dashboard/assignments", icon: CheckSquare2, label: "Assignments" },
  { href: "/dashboard/notices", icon: BellRing, label: "Notices" },
  { href: "/dashboard/directory", icon: UserRoundSearch, label: "Work Monitor" },
  { href: "/dashboard/screenshots", icon: Camera, label: "Screenshots" },
  { href: "/dashboard/team", icon: Users, label: "Team" },
  { href: "/admin", icon: Shield, label: "Admin" },
  { href: "/admin/departments", icon: FolderTree, label: "Departments" },
];

// Shared by the scrolling nav list and the pinned Settings row below it, so the
// two can never drift apart visually. `relative` anchors the unread dot once the
// collapsed rail takes away the row it used to sit at the end of.
const navLinkClass =
  "sidebar-force-white relative flex items-center gap-2.5 rounded-xl px-2.5 py-2.5 text-sm font-medium text-white transition-colors";
const navLinkActiveClass =
  "bg-[linear-gradient(135deg,#5667ff_0%,#4a59ea_100%)] text-[#f8fbff] shadow-[0_14px_24px_rgba(86,103,255,0.26)] sidebar-force-white";
const navLinkIdleClass = "hover:bg-white/12";

const SIDEBAR_COLLAPSED_KEY = "worklog-sidebar-collapsed";

function SidebarContent({
  user,
  pathname,
  mobile = false,
  onNavigate,
}: {
  user: DashboardSidebarUser;
  pathname: string;
  mobile?: boolean;
  onNavigate?: () => void;
}) {
  const router = useRouter();
  const [noticeNotifications, setNoticeNotifications] = useState(user.noticeNotifications ?? 0);

  // Independent of the header's own poll — the two are siblings under the
  // layout, not parent/child, so each keeps its own short-interval refresh
  // rather than the sidebar waiting on a full page load to learn a new
  // notice arrived.
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
      const unreadCount = notices.filter((item: { id: string }) => {
        try {
          return window.localStorage.getItem(`notice-read:${item.id}`) !== "read";
        } catch {
          return true;
        }
      }).length;

      setNoticeNotifications(unreadCount);
    }

    pollNoticeNotifications().catch(() => null);
    const interval = window.setInterval(() => {
      pollNoticeNotifications().catch(() => null);
    }, 15000);

    // The Notices page marks everything it shows as read the moment it
    // mounts, then fires this so the dot clears immediately instead of
    // sitting lit for up to 15s while the user is already looking at it.
    function handleNoticesRead() {
      pollNoticeNotifications().catch(() => null);
    }

    window.addEventListener(NOTICES_READ_EVENT, handleNoticesRead);

    return () => {
      cancelled = true;
      window.clearInterval(interval);
      window.removeEventListener(NOTICES_READ_EVENT, handleNoticesRead);
    };
  }, []);

  async function logout() {
    onNavigate?.();
    const response = await fetch("/api/auth/logout", { method: "POST" });
    const result = await response.json();
    toast.success(result.message);
    router.push("/auth/login");
    router.refresh();
  }

  const settingsLink = (
    <motion.div transition={{ duration: 0.18, ease: "easeOut" }} whileHover={{ x: 4 }} whileTap={{ scale: 0.99 }}>
      <Link
        className={cn(navLinkClass, pathname === "/dashboard/settings" ? navLinkActiveClass : navLinkIdleClass)}
        data-sidebar-row
        href="/dashboard/settings"
        onClick={() => onNavigate?.()}
        title="Settings"
      >
        <Settings className="h-5 w-5 shrink-0" />
        <span data-sidebar-label>Settings</span>
      </Link>
    </motion.div>
  );

  const navNode = (
    <div className="flex min-h-0 flex-1 flex-col">
      <div
        className={cn(
          "flex shrink-0 items-center",
          // Desktop: full-bleed so the band's hairline runs edge to edge and joins
          // the header's; the inner padding still matches the nav rows exactly.
          mobile ? "px-2.5 py-2" : "dashboard-brandbar -mx-3 px-[1.375rem]",
        )}
        data-sidebar-brand={mobile ? undefined : ""}
      >
        {/* h-8 and gap-2, not h-9 and gap-2.5: the 175px rail leaves 99.4px for
            the name here, and "WorkLog Ultra" measures 90px at 0.95rem. truncate
            stays as the safety net if Manrope ever falls back to a wider face. */}
        <div className="flex min-w-0 items-center gap-2">
          <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-xl bg-[#102b4f] text-[#35d39a]">
            <CheckSquare2 className="h-4 w-4" />
          </div>
          <p className="sidebar-force-white truncate text-[0.95rem] font-bold tracking-[-0.02em]" data-sidebar-label>
            WorkLog Ultra
          </p>
        </div>
      </div>
      <nav
        // pr leaves room for the 4px hover slide, and dashboard-scroll-area pins
        // overflow-x so a wider label can never turn this into a horizontal bar.
        className="dashboard-scroll-area mt-4 min-h-0 flex-1 space-y-0.5 pr-1.5"
      >
        {navItems.map((item) => {
          const active = pathname === item.href;
          const Icon = item.icon;
          const hiddenForEmployee =
            item.href === "/admin" && !["manager", "admin"].includes(user.role);
          const hiddenDepartments =
            item.href === "/admin/departments" &&
            !["manager", "admin"].includes(user.role) &&
            !user.extraAccess?.includes("manage_departments");
          const hiddenForTeam = item.href === "/dashboard/team" && user.role === "employee" && !user.extraAccess?.includes("team_dashboard");
          const hiddenWorkMonitor =
            item.href === "/dashboard/directory" &&
            !["manager", "admin"].includes(user.role) &&
            !user.extraAccess?.includes("work_monitor");
          const hiddenScreenshots = item.href === "/dashboard/screenshots" && !["manager", "admin"].includes(user.role);
          const hiddenForAdminWorkerFlow = false;
          const hiddenRequestInboxForAdmin = false;

          if (hiddenForEmployee || hiddenDepartments || hiddenForTeam || hiddenWorkMonitor || hiddenScreenshots || hiddenForAdminWorkerFlow || hiddenRequestInboxForAdmin) return null;

          const linkNode = (
            <motion.div
              key={item.href}
              transition={{ duration: 0.18, ease: "easeOut" }}
              whileHover={{ x: 4 }}
              whileTap={{ scale: 0.99 }}
            >
              <Link
                key={item.href}
                href={item.href}
                onClick={() => onNavigate?.()}
                className={cn(navLinkClass, active ? navLinkActiveClass : navLinkIdleClass)}
                data-sidebar-row
                // The label is the only thing naming an icon once the rail is
                // collapsed, so it has to survive as a tooltip.
                title={item.label}
              >
                <Icon className="h-5 w-5 shrink-0" />
                <span data-sidebar-label>{item.label}</span>
                {item.href === "/dashboard/assignments" && (user.assignmentNotifications ?? 0) > 0 ? (
                  <span className="ml-auto inline-flex h-2.5 w-2.5 shrink-0 rounded-full bg-[#ff4d6d]" data-sidebar-badge />
                ) : null}
                {item.href === "/dashboard/notices" && noticeNotifications > 0 ? (
                  <span className="ml-auto inline-flex h-2.5 w-2.5 shrink-0 rounded-full bg-[#ff4d6d]" data-sidebar-badge />
                ) : null}
              </Link>
            </motion.div>
          );

          if (mobile) {
            return (
              <Dialog.Close asChild key={item.href}>
                {linkNode}
              </Dialog.Close>
            );
          }

          return linkNode;
        })}
      </nav>
      <div className={cn("mt-auto shrink-0 space-y-0.5 pt-2", mobile && "mb-4")}>
        {mobile ? <Dialog.Close asChild>{settingsLink}</Dialog.Close> : settingsLink}
        <button
          className="sidebar-force-white relative flex w-full items-center gap-2.5 rounded-xl px-2.5 py-2.5 text-left text-sm font-semibold transition hover:bg-white/10"
          data-sidebar-row
          onClick={logout}
          title="Log Out"
          type="button"
        >
          <LogOut className="h-5 w-5 shrink-0" />
          <span data-sidebar-label>Log Out</span>
        </button>
      </div>
    </div>
  );

  return navNode;
}

export function Sidebar({ user }: { user: DashboardSidebarUser }) {
  const pathname = usePathname();

  // The width, the labels and the toggle's own arrow are all driven off this one
  // attribute rather than off React state, the same way the theme is. The server
  // and the first client render therefore ship identical sidebar markup, so the
  // stored preference can be restored without a hydration mismatch — and there
  // is no second copy of the state in React to fall out of step with the DOM.
  useEffect(() => {
    document.documentElement.dataset.sidebarCollapsed = String(
      window.localStorage.getItem(SIDEBAR_COLLAPSED_KEY) === "true",
    );
  }, []);

  function toggleCollapsed() {
    const next = document.documentElement.dataset.sidebarCollapsed !== "true";
    document.documentElement.dataset.sidebarCollapsed = String(next);
    window.localStorage.setItem(SIDEBAR_COLLAPSED_KEY, String(next));
  }

  return (
    /* Entrance is CSS (`.dashboard-sidebar` in globals.css) so the rail paints
       with the server HTML rather than appearing only once React hydrates. */
    <aside
      // z-30 because the toggle overhangs the rail onto the header's left edge,
      // and sticky positioning makes this element its own stacking context — so
      // the button can only clear the z-20 header if the rail itself does.
      className="dashboard-sidebar sticky top-0 z-30 hidden h-screen w-[var(--sidebar-width)] shrink-0 bg-[linear-gradient(160deg,#000080_0%,#001f66_55%,#020b31_100%)] px-3 pb-3 transition-[width] duration-200 ease-out lg:flex lg:flex-col"
    >
      <SidebarContent pathname={pathname} user={user} />
      {/* Both arrows ship and CSS picks one, so the collapsed rail can be
          restored from localStorage without the server and the client
          disagreeing about which way the chevron points. */}
      <button
        aria-label="Toggle sidebar"
        className="dashboard-sidebar-toggle"
        onClick={toggleCollapsed}
        title="Toggle sidebar"
        type="button"
      >
        <ChevronLeft className="h-3.5 w-3.5" data-sidebar-toggle-icon="collapse" />
        <ChevronRight className="h-3.5 w-3.5" data-sidebar-toggle-icon="expand" />
      </button>
    </aside>
  );
}

export function MobileSidebar({ user }: { user: DashboardSidebarUser }) {
  const pathname = usePathname();
  const [open, setOpen] = useState(false);

  useEffect(() => {
    setOpen(false);
  }, [pathname]);

  return (
    <Dialog.Root onOpenChange={setOpen} open={open}>
      <Dialog.Trigger asChild>
        <Button
          aria-label="Open navigation menu"
          className="h-11 w-11 rounded-2xl bg-white text-slate-700 hover:bg-slate-50 min-[900px]:h-10 min-[900px]:w-10 lg:hidden"
          size="icon"
          variant="ghost"
        >
          <Menu className="h-5 w-5" />
        </Button>
      </Dialog.Trigger>
      <Dialog.Portal>
        <Dialog.Overlay className="fixed inset-0 z-40 bg-[rgba(3,8,18,0.72)] backdrop-blur-sm lg:hidden" />
        <Dialog.Content className="fixed inset-y-0 left-0 z-50 flex w-[85vw] max-w-[18.75rem] flex-col bg-[linear-gradient(160deg,#000080_0%,#001f66_55%,#020b31_100%)] p-3.5 shadow-[0_30px_90px_rgba(3,8,18,0.45)] outline-none lg:hidden">
          <div className="mb-3 flex shrink-0 items-center justify-between">
            <Dialog.Title className="text-sm font-semibold uppercase tracking-[0.24em] text-white">
              WorkLog Ultra
            </Dialog.Title>
            <Dialog.Close asChild>
              <Button
                aria-label="Close navigation menu"
                className="h-11 w-11 rounded-2xl border border-white/35 bg-white/8 !text-white hover:bg-white/14 hover:!text-white"
                size="icon"
                variant="ghost"
              >
                <X className="h-5 w-5 !text-white" />
              </Button>
            </Dialog.Close>
          </div>
          <SidebarContent mobile onNavigate={() => setOpen(false)} pathname={pathname} user={user} />
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}
