"use client";

import * as Dialog from "@radix-ui/react-dialog";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { BellRing, BriefcaseBusiness, CalendarCheck2, CheckSquare2, ClipboardList, FileClock, FolderTree, LayoutDashboard, LogOut, Menu, Shield, UserRoundSearch, Users, X } from "lucide-react";
import { toast } from "sonner";
import { roleUiTitle } from "@/lib/auth/roles";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

const navItems = [
  { href: "/dashboard", icon: LayoutDashboard, label: "Dashboard" },
  { href: "/dashboard/plan", icon: ClipboardList, label: "Morning Plan" },
  { href: "/dashboard/report", icon: FileClock, label: "Evening Report" },
  { href: "/dashboard/attendance", icon: CalendarCheck2, label: "Attendance" },
  { href: "/dashboard/history", icon: BriefcaseBusiness, label: "History" },
  { href: "/dashboard/assignments", icon: CheckSquare2, label: "Assignments" },
  { href: "/dashboard/notices", icon: BellRing, label: "Notices" },
  { href: "/dashboard/directory", icon: UserRoundSearch, label: "Work Monitor" },
  { href: "/dashboard/team", icon: Users, label: "Team" },
  { href: "/admin", icon: Shield, label: "Admin" },
  { href: "/admin/departments", icon: FolderTree, label: "Departments" },
];

type SidebarUser = {
  name: string;
  role: "employee" | "hr" | "manager" | "admin";
  designation: string | null;
  avatarUrl?: string | null;
};

function SidebarContent({
  user,
  pathname,
  mobile = false,
}: {
  user: SidebarUser;
  pathname: string;
  mobile?: boolean;
}) {
  const router = useRouter();

  async function logout() {
    const response = await fetch("/api/auth/logout", { method: "POST" });
    const result = await response.json();
    toast.success(result.message);
    router.push("/auth/login");
    router.refresh();
  }

  const navNode = (
    <>
      <div className="px-2 py-3">
        <div className="flex items-center gap-3">
          <div className="flex h-11 w-11 items-center justify-center rounded-2xl bg-[#102b4f] text-[#35d39a]">
            <CheckSquare2 className="h-6 w-6" />
          </div>
          <p className="sidebar-force-white text-lg font-bold tracking-[-0.02em]">WorkLog Ultra</p>
        </div>
      </div>
      <nav className="mt-6 space-y-1">
        {navItems.map((item) => {
          const active = pathname === item.href;
          const Icon = item.icon;
          const hiddenForEmployee =
            ["/admin", "/admin/departments"].includes(item.href) && !["manager", "admin"].includes(user.role);
          const hiddenForTeam = item.href === "/dashboard/team" && user.role === "employee";
          const hiddenWorkMonitor = item.href === "/dashboard/directory" && !["manager", "admin"].includes(user.role);
          const hiddenForAdminWorkerFlow = false;
          const hiddenRequestInboxForAdmin = false;

          if (hiddenForEmployee || hiddenForTeam || hiddenWorkMonitor || hiddenForAdminWorkerFlow || hiddenRequestInboxForAdmin) return null;

          const linkNode = (
            <Link
              key={item.href}
              href={item.href}
              className={cn(
                "flex items-center gap-3 rounded-xl px-3 py-3 text-sm font-medium text-white/90 transition-colors",
                active
                  ? "bg-[linear-gradient(135deg,#5667ff_0%,#4a59ea_100%)] text-white shadow-[0_14px_24px_rgba(86,103,255,0.26)]"
                  : "hover:bg-white/5",
              )}
            >
              <Icon className="h-5 w-5" />
              {item.label}
            </Link>
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
      <div className={cn("mt-auto", mobile && "mb-6")}>
        <p className="px-3 pb-2 text-sm font-medium text-white/70">{user.designation ?? roleUiTitle(user.role)}</p>
        <button
          className="sidebar-force-white flex w-full items-center gap-3 rounded-xl px-3 py-3 text-left text-sm font-semibold transition hover:bg-white/10"
          onClick={logout}
          type="button"
        >
          <LogOut className="h-5 w-5" />
          <span>Log Out</span>
        </button>
      </div>
    </>
  );

  return navNode;
}

export function Sidebar({ user }: { user: SidebarUser }) {
  const pathname = usePathname();

  return (
    <aside className="sticky top-0 hidden h-screen w-[250px] shrink-0 bg-[linear-gradient(180deg,#091427_0%,#0d1a2f_100%)] p-4 lg:flex lg:flex-col">
      <SidebarContent pathname={pathname} user={user} />
    </aside>
  );
}

export function MobileSidebar({ user }: { user: SidebarUser }) {
  const pathname = usePathname();

  return (
    <Dialog.Root>
      <Dialog.Trigger asChild>
        <Button
          aria-label="Open navigation menu"
          className="h-11 w-11 rounded-2xl bg-white text-slate-700 hover:bg-slate-50 lg:hidden"
          size="icon"
          variant="ghost"
        >
          <Menu className="h-5 w-5" />
        </Button>
      </Dialog.Trigger>
      <Dialog.Portal>
        <Dialog.Overlay className="fixed inset-0 z-40 bg-[rgba(3,8,18,0.72)] backdrop-blur-sm lg:hidden" />
        <Dialog.Content className="fixed inset-y-0 left-0 z-50 flex w-[88vw] max-w-[320px] flex-col overflow-y-auto bg-[linear-gradient(180deg,#091427_0%,#0d1a2f_100%)] p-4 shadow-[0_30px_90px_rgba(3,8,18,0.45)] outline-none lg:hidden">
          <div className="mb-4 flex items-center justify-between">
            <Dialog.Title className="text-sm font-semibold uppercase tracking-[0.24em] text-white">
              WorkLog Ultra
            </Dialog.Title>
            <Dialog.Close asChild>
              <Button aria-label="Close navigation menu" className="h-11 w-11 rounded-2xl text-white" size="icon" variant="ghost">
                <X className="h-5 w-5" />
              </Button>
            </Dialog.Close>
          </div>
          <SidebarContent mobile pathname={pathname} user={user} />
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}
