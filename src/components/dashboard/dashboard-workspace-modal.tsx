"use client";

import * as Dialog from "@radix-ui/react-dialog";
import { ClipboardList, Clock3, Plus, X } from "lucide-react";
import { useState } from "react";
import { PlanForm } from "@/components/dashboard/plan-form";
import { ReportForm } from "@/components/dashboard/report-form";
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
type ReportTask = {
  id: string;
  taskTitle: string;
  updates: Array<{
    status: "done" | "in_progress" | "pending";
    note: string | null;
    completionPercent: number;
    trackedMinutes: number;
    actualStart: Date | null;
    actualEnd: Date | null;
    difficultyLevel: string | null;
  }>;
};

export function DashboardWorkspaceModal({
  departments,
  initialTasks,
  suggestions,
  userDepartmentId,
  isTenderDepartment = false,
  role,
  reportTasks,
  reportDate,
  canEditReport,
  assignableUsers,
  currentUserId,
}: {
  departments: Department[];
  initialTasks: InitialTask[];
  suggestions: Suggestion[];
  userDepartmentId?: string | null;
  isTenderDepartment?: boolean;
  role: "employee" | "hr" | "manager" | "admin";
  reportTasks: ReportTask[];
  reportDate: string;
  canEditReport: boolean;
  assignableUsers: AssignableUser[];
  currentUserId: string;
}) {
  const [open, setOpen] = useState(false);
  const [activeTab, setActiveTab] = useState<"plan" | "tracker">("plan");
  const [planResetToken, setPlanResetToken] = useState(0);

  return (
    <Dialog.Root
      onOpenChange={(nextOpen) => {
        setOpen(nextOpen);
        if (nextOpen) {
          setActiveTab("plan");
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
        <Dialog.Content className="fixed left-1/2 top-1/2 z-50 max-h-[calc(100dvh-1.5rem)] w-[min(960px,calc(100vw-1.5rem))] -translate-x-1/2 -translate-y-1/2 overflow-y-auto rounded-[24px] border border-[var(--panel-border)] bg-[var(--panel)] shadow-[0_28px_70px_rgba(15,23,42,0.24)] outline-none [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
          <div className="flex items-center justify-between gap-4 border-b border-[var(--panel-border)] px-4 py-3">
            <div className="flex min-w-0 items-center gap-2.5">
              <span className="inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-[#4f5ef7]/10 text-[#4f5ef7]">
                <ClipboardList className="h-4 w-4" />
              </span>
              <div className="min-w-0">
                <Dialog.Title className="text-base font-bold text-[var(--foreground)]">
                  Today&apos;s Workspace
                </Dialog.Title>
                <p className="truncate text-xs text-[var(--muted-foreground)]">
                  Plan tasks or update today&apos;s tracked work from one place.
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

          <div className="flex items-center gap-2 border-b border-[var(--panel-border)] px-4 py-2">
            <button
              className={`inline-flex h-8 items-center gap-1.5 rounded-xl px-3 text-xs font-semibold transition ${
                activeTab === "plan"
                  ? "bg-[#4f5ef7] text-white shadow-[0_8px_18px_rgba(79,94,247,0.22)]"
                  : "bg-[var(--panel-alt)] text-[var(--muted-foreground)] hover:bg-[var(--panel-muted)]"
              }`}
              onClick={() => setActiveTab("plan")}
              type="button"
            >
              <ClipboardList className="h-3.5 w-3.5" />
              Work Plan
            </button>
            <button
              className={`inline-flex h-8 items-center gap-1.5 rounded-xl px-3 text-xs font-semibold transition ${
                activeTab === "tracker"
                  ? "bg-[#4f5ef7] text-white shadow-[0_8px_18px_rgba(79,94,247,0.22)]"
                  : "bg-[var(--panel-alt)] text-[var(--muted-foreground)] hover:bg-[var(--panel-muted)]"
              }`}
              onClick={() => setActiveTab("tracker")}
              type="button"
            >
              <Clock3 className="h-3.5 w-3.5" />
              Time Tracker
            </button>
          </div>

          <div className="px-4 py-3">
            {activeTab === "plan" ? (
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
            ) : (
              <div className="space-y-2">
                <div className="rounded-xl border border-[var(--panel-border)] bg-[var(--panel-muted)] px-3 py-2 text-xs text-[var(--muted-foreground)]">
                  Start, pause, stop, or finish today&apos;s tracked tasks here.
                </div>
                <ReportForm
                  canEdit={canEditReport}
                  currentUserId={currentUserId}
                  onSaved={() => setOpen(false)}
                  reportDate={reportDate}
                  tasks={reportTasks}
                />
              </div>
            )}
          </div>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}
