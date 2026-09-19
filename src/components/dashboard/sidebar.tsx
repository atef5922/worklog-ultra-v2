"use client";

import * as Dialog from "@radix-ui/react-dialog";
import { AnimatePresence, motion } from "framer-motion";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { BellRing, BriefcaseBusiness, Building2, CalendarCheck2, ChevronDown, ChevronLeft, ChevronRight, ChevronsUpDown, CheckSquare2, ClipboardList, FileClock, FolderTree, LayoutDashboard, LogOut, Menu, Settings, Shield, Users, X } from "lucide-react";
import { useEffect, useRef, useState, type CSSProperties } from "react";
import { Button } from "@/components/ui/button";
import { getSidebarLayout } from "@/lib/sidebar-layout";
import { canOpenManagement, can, canViewAttendanceDetails, canViewAuditLogs, isSuperAdmin } from "@/lib/auth/policy";
import { cn } from "@/lib/utils";
import { NOTICES_READ_EVENT } from "@/lib/dashboard-live-events";
import type { DashboardSidebarUser } from "@/lib/contracts/user";

const primaryNavItems = [
  { href: "/dashboard", icon: LayoutDashboard, label: "Dashboard" },
  { href: "/dashboard/plan", icon: ClipboardList, label: "Today's Task" },
  { href: "/dashboard/report", icon: FileClock, label: "Report" },
  { href: "/dashboard/history", icon: BriefcaseBusiness, label: "History" },
  { href: "/dashboard/assignments", icon: CheckSquare2, label: "Assignments" },
  { href: "/dashboard/notices", icon: BellRing, label: "Notices" },
  { href: "/dashboard/team", icon: Users, label: "My Team" },
];

const managementNavItems = [
  { href: "/management", icon: LayoutDashboard, label: "Dashboard" },
  { href: "/management/attendance", icon: CalendarCheck2, label: "Attendance" },
  { href: "/management/reports", icon: FileClock, label: "Management Reports" },
  { href: "/admin/access-control", icon: Shield, label: "Access Control" },
  { href: "/management/audit", icon: ClipboardList, label: "Audit Log" },
  { href: "/admin/departments", icon: FolderTree, label: "Departments" },
];

function isManagementItemActive(pathname: string, href: string) {
  if (href === "/management") {
    return pathname === href || pathname.startsWith("/management/employees/");
  }

  return pathname === href || pathname.startsWith(`${href}/`);
}

// Shared by the height-fitted nav list and the pinned Settings row below it, so the
// two can never drift apart visually. `relative` anchors the unread dot once the
// collapsed rail takes away the row it used to sit at the end of.
const navLinkClass =
  "sidebar-force-white relative flex min-w-0 items-center gap-2.5 rounded-xl px-2.5 text-sm font-medium text-white transition-colors";
const navLinkActiveClass =
  "bg-[linear-gradient(90deg,rgba(118,132,245,0.18),rgba(118,132,245,0.07))] shadow-[inset_3px_0_0_#8d99f7,0_6px_16px_rgba(3,12,52,0.14)]";
const navLinkIdleClass = "bg-transparent hover:bg-white/[0.055]";
const managementMotion = { duration: 0.32, ease: [0.22, 1, 0.36, 1] as const };

const SIDEBAR_HOVER_EXPAND_DELAY_MS = 140;
const SIDEBAR_HOVER_COLLAPSE_DELAY_MS = 240;

function SidebarContent({
  user,
  pathname,
  mobile = false,
  showNestedNavigation = true,
  onNavigate,
}: {
  user: DashboardSidebarUser;
  pathname: string;
  mobile?: boolean;
  showNestedNavigation?: boolean;
  onNavigate?: () => void;
}) {
  const [noticeNotifications, setNoticeNotifications] = useState(user.noticeNotifications ?? 0);
  const navigationRegionRef = useRef<HTMLDivElement>(null);
  const [navigationHeight, setNavigationHeight] = useState(0);
  const [pageAnchor, setPageAnchor] = useState({ pathname: "", index: 0 });
  const visiblePrimaryItems = primaryNavItems.filter((item) => {
    if (item.href === "/dashboard/team") return user.role === "team_head" || isSuperAdmin(user);
    return true;
  });
  const visibleManagementItems = managementNavItems.filter((item) => {
    if (item.href === "/management/attendance") return canViewAttendanceDetails(user);
    if (item.href === "/management") return canOpenManagement(user);
    if (item.href === "/management/reports") return can(user, "reports.view");
    if (item.href === "/management/audit") return canViewAuditLogs(user);
    if (item.href === "/admin/access-control") return isSuperAdmin(user);
    if (item.href === "/admin/departments") return can(user, "departments.manage");
    return true;
  });
  const managementRouteActive = visibleManagementItems.some((item) => isManagementItemActive(pathname, item.href));
  const [managementOpen, setManagementOpen] = useState(false);
  const submenuVisible = managementOpen && showNestedNavigation;

  useEffect(() => {
    if (showNestedNavigation) return;
    const resetFrame = window.requestAnimationFrame(() => setManagementOpen(false));
    return () => window.cancelAnimationFrame(resetFrame);
  }, [showNestedNavigation]);

  const navigationEntries = [
    ...visiblePrimaryItems.map((item) => ({
      kind: "link" as const,
      item,
      nested: false,
      nestedIndex: -1,
      nestedCount: 0,
    })),
    ...(visibleManagementItems.length ? [{ kind: "management" as const }] : []),
    ...(submenuVisible
      ? visibleManagementItems.map((item, nestedIndex) => ({
          kind: "link" as const,
          item,
          nested: true,
          nestedIndex,
          nestedCount: visibleManagementItems.length,
        }))
      : []),
  ];
  const layout = getSidebarLayout({
    itemCount: navigationEntries.length,
    availableHeight: navigationHeight,
    preferredRowHeight: mobile ? 44 : 40,
    minimumRowHeight: mobile ? 44 : 30,
    pagerHeight: mobile ? 48 : 36,
  });
  const activeChildIndex = navigationEntries.findIndex(
    (entry) => entry.kind === "link" && entry.nested && isManagementItemActive(pathname, entry.item.href),
  );
  const activeParentIndex = navigationEntries.findIndex(
    (entry) => entry.kind === "management" && managementRouteActive,
  );
  const activeIndex = Math.max(
    0,
    activeChildIndex >= 0
      ? activeChildIndex
      : activeParentIndex >= 0
        ? activeParentIndex
        : navigationEntries.findIndex(
            (entry) => entry.kind === "link" && !entry.nested && entry.item.href === pathname,
          ),
  );
  const anchor = pageAnchor.pathname === pathname ? pageAnchor.index : activeIndex;
  const page = Math.min(layout.pageCount - 1, Math.floor(anchor / Math.max(1, layout.pageSize)));
  const pageItems = navigationEntries.slice(page * layout.pageSize, (page + 1) * layout.pageSize);

  useEffect(() => {
    const region = navigationRegionRef.current;
    if (!region) return;
    const measure = () => setNavigationHeight(region.clientHeight);
    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(region);
    return () => observer.disconnect();
  }, []);

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

  function prepareLogout() {
    onNavigate?.();
    void window.worklogDesktop?.stopTracking({ source: "attendance" }).catch(() => undefined);
  }

  const settingsLink = (
    <motion.div transition={{ duration: 0.16, ease: "easeOut" }} whileTap={{ scale: 0.99 }}>
      <Link
        className={cn(navLinkClass, pathname === "/dashboard/settings" ? navLinkActiveClass : navLinkIdleClass)}
        data-sidebar-row
        href="/dashboard/settings"
        onClick={() => {
          setManagementOpen(false);
          onNavigate?.();
        }}
        title="Settings"
      >
        <Settings className="h-5 w-5 shrink-0" />
        <span data-sidebar-label>Settings</span>
      </Link>
    </motion.div>
  );

  const navNode = (
    <div className="sidebar-content flex min-h-0 flex-1 flex-col" data-sidebar-mobile={mobile ? "true" : undefined}>
      <div
        className={cn(
          "flex shrink-0 items-center",
          // Desktop: full-bleed so the band's hairline runs edge to edge and joins
          // the header's; the inner padding still matches the nav rows exactly.
          mobile ? "hidden" : "dashboard-brandbar -mx-3 px-[1.375rem]",
        )}
        data-sidebar-brand={mobile ? undefined : ""}
      >
        {/* A fixed icon lane keeps the logo steady during width transitions. */}
        <div className="flex min-w-0 items-center gap-2">
          <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-xl bg-[#102b4f] text-[#35d39a]">
            <CheckSquare2 className="h-4 w-4" />
          </div>
          <p className="sidebar-force-white truncate text-[0.95rem] font-bold tracking-[-0.02em]" data-sidebar-label>
            WorkLog Ultra
          </p>
        </div>
      </div>
      <div className="sidebar-navigation-region" ref={navigationRegionRef}>
      <motion.nav
        aria-label="Main navigation"
        className="sidebar-navigation"
        layout
        style={{ "--sidebar-visible-rows": pageItems.length, "--sidebar-nav-row-height": `${layout.rowHeight}px` } as CSSProperties}
        transition={{ layout: managementMotion }}
      >
        <AnimatePresence initial={false} mode="popLayout">
        {pageItems.map((entry) => {
          if (entry.kind === "management") {
            return (
              <motion.div key="management-menu" layout="position" transition={{ layout: managementMotion }} whileTap={{ scale: 0.99 }}>
                <button
                  aria-expanded={submenuVisible}
                  className={cn(
                    navLinkClass,
                    "w-full text-left",
                    managementRouteActive ? navLinkActiveClass : navLinkIdleClass,
                  )}
                  data-sidebar-row
                  onClick={() => {
                    if (!showNestedNavigation) {
                      setManagementOpen(false);
                      return;
                    }
                    setManagementOpen((open) => !open);
                    setPageAnchor({ pathname, index: visiblePrimaryItems.length });
                  }}
                  title="Management"
                  type="button"
                >
                  <span className={cn("flex h-5 w-5 shrink-0 items-center justify-center rounded-md", managementRouteActive ? "bg-[#8190ff]/18" : "bg-transparent")}>
                    <Building2 className="h-4 w-4" />
                  </span>
                  <span data-sidebar-label>Management</span>
                  <span className="ml-auto transition-transform duration-300 ease-[cubic-bezier(0.22,1,0.36,1)]" data-sidebar-label style={{ transform: managementOpen ? "rotate(180deg)" : undefined }}>
                    <ChevronDown className="h-4 w-4" />
                  </span>
                </button>
              </motion.div>
            );
          }

          const { item, nested } = entry;
          const active = nested ? isManagementItemActive(pathname, item.href) : pathname === item.href;
          const Icon = item.icon;

          const linkNode = (
            <motion.div
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={nested ? { opacity: 0, scale: 0.985, y: -5 } : undefined}
              initial={nested ? { opacity: 0, scale: 0.985, y: -6 } : false}
              key={item.href}
              layout="position"
              transition={nested ? { ...managementMotion, layout: managementMotion } : { duration: 0.16, ease: "easeOut", layout: managementMotion }}
              whileTap={{ scale: 0.99 }}
            >
              <Link
                aria-current={active ? "page" : undefined}
                aria-label={nested ? `${item.label}, Management` : item.label}
                key={item.href}
                href={item.href}
                onClick={() => {
                  if (!nested) setManagementOpen(false);
                  onNavigate?.();
                }}
                className={cn(
                  navLinkClass,
                  nested && "gap-1.5 text-[0.72rem] font-semibold tracking-[-0.005em]",
                  nested
                    ? active
                      ? navLinkActiveClass
                      : navLinkIdleClass
                    : active
                      ? navLinkActiveClass
                      : navLinkIdleClass,
                )}
                data-sidebar-row
                data-sidebar-subitem={nested ? "" : undefined}
                // The label is the only thing naming an icon once the rail is
                // collapsed, so it has to survive as a tooltip.
                title={nested ? `Management: ${item.label}` : item.label}
              >
                {nested ? (
                  <>
                    <span aria-hidden="true" className="relative flex h-full w-2 shrink-0 items-center justify-center">
                      {entry.nestedIndex > 0 ? <span className="absolute bottom-1/2 left-1/2 top-[-3px] w-px -translate-x-1/2 bg-[#8290c7]/45" /> : null}
                      {entry.nestedIndex < entry.nestedCount - 1 ? <span className="absolute bottom-[-3px] left-1/2 top-1/2 w-px -translate-x-1/2 bg-[#8290c7]/45" /> : null}
                      <span className={cn("relative z-10 rounded-full", active ? "h-2 w-2 bg-[#a5afff] shadow-[0_0_0_3px_rgba(133,147,247,0.13)]" : "h-1.5 w-1.5 bg-[#8997c8]")} />
                    </span>
                    <span className={cn("flex h-5 w-5 shrink-0 items-center justify-center rounded-md", active ? "bg-[#8390f5]/24" : "bg-white/[0.065]")}>
                      <Icon className="h-3 w-3" />
                    </span>
                  </>
                ) : (
                  <Icon className="h-5 w-5 shrink-0" />
                )}
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
        </AnimatePresence>
      </motion.nav>
      {layout.pageCount > 1 ? (
        <div className="sidebar-navigation-pager">
          <button
            aria-label={`Show next navigation page, page ${page + 1} of ${layout.pageCount}`}
            className={cn(navLinkClass, "w-full hover:bg-white/12")}
            data-sidebar-row
            onClick={() => setPageAnchor({ pathname, index: ((page + 1) % layout.pageCount) * layout.pageSize })}
            title={`More menu options (${page + 1}/${layout.pageCount})`}
            type="button"
          >
            <ChevronsUpDown className="h-5 w-5 shrink-0" />
            <span data-sidebar-label>More ({page + 1}/{layout.pageCount})</span>
          </button>
        </div>
      ) : null}
      </div>
      <div className="sidebar-footer">
        {mobile ? <Dialog.Close asChild>{settingsLink}</Dialog.Close> : settingsLink}
        <form action="/api/auth/logout" method="post" onSubmit={prepareLogout}>
          <button
            className={cn(navLinkClass, "w-full text-left font-semibold hover:bg-white/10")}
            data-sidebar-row
            title="Log Out"
            type="submit"
          >
            <LogOut className="h-5 w-5 shrink-0" />
            <span data-sidebar-label>Log Out</span>
          </button>
        </form>
      </div>
    </div>
  );

  return navNode;
}

export function Sidebar({ user }: { user: DashboardSidebarUser }) {
  const pathname = usePathname();
  const collapseTimerRef = useRef<number | null>(null);
  const expandTimerRef = useRef<number | null>(null);
  const [showNestedNavigation, setShowNestedNavigation] = useState(false);

  // Every new app load starts from the collapsed state already rendered by the
  // root layout. Pinning is session-only; a reload intentionally resets it.
  useEffect(() => {
    document.documentElement.dataset.sidebarPinned = "false";
    document.documentElement.dataset.sidebarCollapsed = "true";
    document.documentElement.dataset.sidebarPeek = "false";

    const forceCollapse = () => {
      if (collapseTimerRef.current !== null) {
        window.clearTimeout(collapseTimerRef.current);
        collapseTimerRef.current = null;
      }
      if (expandTimerRef.current !== null) {
        window.clearTimeout(expandTimerRef.current);
        expandTimerRef.current = null;
      }
      document.documentElement.dataset.sidebarPinned = "false";
      document.documentElement.dataset.sidebarCollapsed = "true";
      document.documentElement.dataset.sidebarPeek = "false";
      setShowNestedNavigation(false);
    };
    const collapseWhenHidden = () => {
      if (document.hidden) forceCollapse();
    };

    window.addEventListener("blur", forceCollapse);
    document.addEventListener("visibilitychange", collapseWhenHidden);

    return () => {
      window.removeEventListener("blur", forceCollapse);
      document.removeEventListener("visibilitychange", collapseWhenHidden);
      if (collapseTimerRef.current !== null) {
        window.clearTimeout(collapseTimerRef.current);
      }
      if (expandTimerRef.current !== null) {
        window.clearTimeout(expandTimerRef.current);
      }
    };
  }, []);

  function isPinned() {
    return document.documentElement.dataset.sidebarPinned === "true";
  }

  function clearExpandTimer() {
    if (expandTimerRef.current !== null) {
      window.clearTimeout(expandTimerRef.current);
      expandTimerRef.current = null;
    }
  }

  function expandTemporarily() {
    clearExpandTimer();

    if (collapseTimerRef.current !== null) {
      window.clearTimeout(collapseTimerRef.current);
      collapseTimerRef.current = null;
    }

    if (!isPinned()) {
      document.documentElement.dataset.sidebarPeek = "true";
    }
    setShowNestedNavigation(true);
  }

  function scheduleTemporaryExpand() {
    if (collapseTimerRef.current !== null) {
      window.clearTimeout(collapseTimerRef.current);
      collapseTimerRef.current = null;
    }

    if (
      isPinned() ||
      document.documentElement.dataset.sidebarPeek === "true" ||
      expandTimerRef.current !== null
    ) {
      return;
    }

    expandTimerRef.current = window.setTimeout(() => {
      expandTimerRef.current = null;
      if (!isPinned()) {
        document.documentElement.dataset.sidebarPeek = "true";
        setShowNestedNavigation(true);
      }
    }, SIDEBAR_HOVER_EXPAND_DELAY_MS);
  }

  function collapseTemporarily() {
    clearExpandTimer();

    if (collapseTimerRef.current !== null) {
      window.clearTimeout(collapseTimerRef.current);
    }

    collapseTimerRef.current = window.setTimeout(() => {
      if (!isPinned()) {
        document.documentElement.dataset.sidebarPeek = "false";
        setShowNestedNavigation(false);
      }
      collapseTimerRef.current = null;
    }, SIDEBAR_HOVER_COLLAPSE_DELAY_MS);
  }

  function togglePinned() {
    clearExpandTimer();

    if (collapseTimerRef.current !== null) {
      window.clearTimeout(collapseTimerRef.current);
      collapseTimerRef.current = null;
    }

    const nextPinned = !isPinned();
    document.documentElement.dataset.sidebarPinned = String(nextPinned);
    document.documentElement.dataset.sidebarCollapsed = String(!nextPinned);
    document.documentElement.dataset.sidebarPeek = "false";
    setShowNestedNavigation(nextPinned);
  }

  return (
    /* Entrance is CSS (`.dashboard-sidebar` in globals.css) so the rail paints
       with the server HTML rather than appearing only once React hydrates. */
    <div className="dashboard-sidebar-shell sticky top-0 z-30 hidden h-dvh w-[var(--sidebar-width)] shrink-0 lg:block">
    <aside
      // z-30 because the toggle overhangs the rail onto the header's left edge,
      // and sticky positioning makes this element its own stacking context — so
      // the button can only clear the z-20 header if the rail itself does.
      className="dashboard-sidebar absolute inset-y-0 left-0 flex h-dvh w-[var(--sidebar-visual-width)] flex-col overflow-visible bg-[linear-gradient(160deg,#000080_0%,#001f66_55%,#020b31_100%)] px-3 pb-3"
      // Mouseover acts only as an intent sensor; the single leave boundary
      // keeps child-to-child movement stable and lets the toggle opt out of
      // automatic expansion while remaining independently clickable.
      onBlurCapture={(event) => {
        if (!event.currentTarget.contains(event.relatedTarget)) {
          collapseTemporarily();
        }
      }}
      onFocusCapture={expandTemporarily}
      onMouseOver={(event) => {
        if (!(event.target instanceof Element && event.target.closest("[data-sidebar-toggle]"))) {
          scheduleTemporaryExpand();
        }
      }}
      onMouseLeave={collapseTemporarily}
    >
      <SidebarContent pathname={pathname} showNestedNavigation={showNestedNavigation} user={user} />
      {/* Both arrows ship and CSS picks one so the first collapsed paint and
          later in-session toggles never disagree about the chevron direction. */}
      <button
        aria-label="Pin or collapse sidebar"
        className="dashboard-sidebar-toggle"
        data-sidebar-toggle
        onClick={togglePinned}
        title="Pin or collapse sidebar"
        type="button"
      >
        <ChevronLeft className="h-3.5 w-3.5" data-sidebar-toggle-icon="collapse" />
        <ChevronRight className="h-3.5 w-3.5" data-sidebar-toggle-icon="expand" />
      </button>
    </aside>
    </div>
  );
}

export function MobileSidebar({ user }: { user: DashboardSidebarUser }) {
  const pathname = usePathname();
  const [menuState, setMenuState] = useState({ pathname, open: false });
  const open = menuState.pathname === pathname && menuState.open;
  const setOpen = (nextOpen: boolean) => setMenuState({ pathname, open: nextOpen });

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
          <Dialog.Description className="sr-only">Navigate your workspace and permitted management pages.</Dialog.Description>
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
