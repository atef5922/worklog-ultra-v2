"use client";

import * as Dialog from "@radix-ui/react-dialog";
import { ClipboardList, Plus, X } from "lucide-react";
import { useState } from "react";
import { PlanForm } from "@/components/dashboard/plan-form";
import { Button } from "@/components/ui/button";

type Department = { id: string; name: string };
type AssignableUser = {
  id: string;
  name: string;
  role: string;
  designation: string | null;
  departmentId: string | null;
  departmentName: string;
};
type Suggestion = {
  title: string;
  description: string;
  priority: "low" | "normal" | "high" | "critical";
  source: string;
};
type InitialTask = {
  taskTitle: string;
  taskDescription: string;
  priority: string;
  departmentId: string;
  assigneeId: string;
};
export function DashboardWorkspaceModal({
  departments,
  initialTasks,
  suggestions,
  userDepartmentId,
  isTenderDepartment = false,
  role,
  assignableUsers,
  currentUserId,
}: {
  departments: Department[];
  initialTasks: InitialTask[];
  suggestions: Suggestion[];
  userDepartmentId?: string | null;
  isTenderDepartment?: boolean;
  role: "employee" | "admin" | "team_head" | "moderator" | "super_admin";
  assignableUsers: AssignableUser[];
  currentUserId: string;
}) {
  const [open, setOpen] = useState(false);
  const [planResetToken, setPlanResetToken] = useState(0);

  return (
    <Dialog.Root
      onOpenChange={(nextOpen) => {
        setOpen(nextOpen);
        if (nextOpen) {
          setPlanResetToken((current) => current + 1);
        }
      }}
      open={open}
    >
      <Dialog.Trigger asChild>
        <Button
          className="button-force-white inline-flex h-9 items-center gap-1.5 whitespace-nowrap rounded-xl bg-[#4f5ef7] px-3 text-[0.8rem] font-semibold text-white shadow-[0_10px_22px_rgba(79,94,247,0.24)] transition hover:bg-[#4453eb] sm:px-3.5"
          type="button"
        >
          <Plus className="h-4 w-4" />
          Add Task
        </Button>
      </Dialog.Trigger>
      <Dialog.Portal>
        <Dialog.Overlay className="fixed inset-0 z-40 bg-[rgba(15,23,42,0.38)] backdrop-blur-sm" />
        <Dialog.Content className="fixed left-1/2 top-1/2 z-50 max-h-[calc(100dvh-1.5rem)] w-[min(760px,calc(100vw-2rem))] -translate-x-1/2 -translate-y-1/2 overflow-y-auto rounded-[24px] border border-[var(--panel-border)] bg-[var(--panel)] shadow-[0_28px_70px_rgba(15,23,42,0.24)] outline-none [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
          <div className="flex items-center justify-between gap-4 border-b border-[var(--panel-border)] px-5 py-3.5">
            <div className="flex min-w-0 items-center gap-2.5">
              <span className="inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-[#4f5ef7]/10 text-[#4f5ef7]">
                <ClipboardList className="h-4 w-4" />
              </span>
              <div className="min-w-0">
                <Dialog.Title className="text-base font-bold text-[var(--foreground)]">
                  Add Today&apos;s Task
                </Dialog.Title>
                <p className="truncate text-xs text-[var(--muted-foreground)]">
                  Create a task for yourself or assign one to a teammate.
                </p>
              </div>
            </div>
            <Dialog.Close asChild>
              <button
                aria-label="Close add task popup"
                className="inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-xl border border-[var(--panel-border)] bg-[var(--panel)] text-[var(--muted-foreground)] transition hover:bg-[var(--panel-alt)] hover:text-[var(--foreground)]"
                type="button"
              >
                <X className="h-4 w-4" />
              </button>
            </Dialog.Close>
          </div>

          <div className="px-5 py-4">
              <PlanForm
                key={planResetToken}
                assignableUsers={assignableUsers}
                clearDraftOnMount
                compact
                currentUserId={currentUserId}
                departments={departments}
                initialTasks={initialTasks}
                isTenderDepartment={isTenderDepartment}
                onSaved={() => setOpen(false)}
                role={role}
                suggestions={suggestions}
                userDepartmentId={userDepartmentId}
              />

          </div>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}
