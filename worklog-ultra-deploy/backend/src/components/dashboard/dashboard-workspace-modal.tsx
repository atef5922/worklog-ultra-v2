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
          className="button-force-white inline-flex items-center gap-2 whitespace-nowrap rounded-2xl bg-[#4f5ef7] px-5 py-3 text-sm font-semibold text-white shadow-[0_16px_35px_rgba(79,94,247,0.24)] transition hover:bg-[#4453eb]"
          type="button"
        >
          <Plus className="h-4 w-4" />
          Create Today&apos;s Work Plan
        </Button>
      </Dialog.Trigger>
      <Dialog.Portal>
        <Dialog.Overlay className="fixed inset-0 z-40 bg-[rgba(15,23,42,0.38)] backdrop-blur-sm" />
        <Dialog.Content className="fixed left-1/2 top-1/2 z-50 flex max-h-[90vh] w-[min(1180px,94vw)] -translate-x-1/2 -translate-y-1/2 flex-col overflow-hidden rounded-[30px] border border-[var(--panel-border)] bg-[var(--background)] shadow-[0_35px_80px_rgba(15,23,42,0.22)] outline-none">
          <div className="flex items-center justify-between border-b border-[var(--panel-border)] bg-[var(--panel)] px-5 py-4">
            <div>
              <Dialog.Title className="text-lg font-bold text-[var(--foreground)]">Today&apos;s Workspace</Dialog.Title>
              <p className="mt-1 text-sm text-[var(--muted-foreground)]">
                Add tasks, save today&apos;s plan, and start task time from one popup.
              </p>
            </div>
            <Dialog.Close asChild>
              <button
                aria-label="Close workspace popup"
                className="inline-flex h-10 w-10 items-center justify-center rounded-2xl border border-[var(--panel-border)] bg-[var(--panel)] text-[var(--muted-foreground)] transition hover:bg-[var(--panel-alt)] hover:text-[var(--foreground)]"
                type="button"
              >
                <X className="h-4 w-4" />
              </button>
            </Dialog.Close>
          </div>

          <div className="border-b border-[var(--panel-border)] bg-[var(--panel)] px-5 py-3">
            <div className="flex flex-wrap gap-3">
              <button
                className={`inline-flex items-center gap-2 rounded-2xl px-4 py-2.5 text-sm font-semibold transition ${
                  activeTab === "plan"
                    ? "bg-[#4f5ef7] text-white shadow-[0_12px_28px_rgba(79,94,247,0.24)]"
                    : "bg-[var(--panel-alt)] text-[var(--muted-foreground)] hover:bg-[var(--panel-muted)]"
                }`}
                onClick={() => setActiveTab("plan")}
                type="button"
              >
                <ClipboardList className="h-4 w-4" />
                Work Plan
              </button>
              <button
                className={`inline-flex items-center gap-2 rounded-2xl px-4 py-2.5 text-sm font-semibold transition ${
                  activeTab === "tracker"
                    ? "bg-[#4f5ef7] text-white shadow-[0_12px_28px_rgba(79,94,247,0.24)]"
                    : "bg-[var(--panel-alt)] text-[var(--muted-foreground)] hover:bg-[var(--panel-muted)]"
                }`}
                onClick={() => setActiveTab("tracker")}
                type="button"
              >
                <Clock3 className="h-4 w-4" />
                Time Tracker
              </button>
            </div>
          </div>

          <div className="min-h-0 flex-1 overflow-y-auto px-5 py-5">
            {activeTab === "plan" ? (
              <PlanForm
                key={planResetToken}
                assignableUsers={assignableUsers}
                clearDraftOnMount
                currentUserId={currentUserId}
                departments={departments}
                initialTasks={initialTasks}
                onSaved={() => setOpen(false)}
                role={role}
                suggestions={suggestions}
                userDepartmentId={userDepartmentId}
              />
            ) : (
              <div className="space-y-4">
                <div className="rounded-[24px] border border-[var(--panel-border)] bg-[var(--panel)] p-4 text-sm text-[var(--muted-foreground)]">
                  Use the built-in tracker below to start, pause, stop, or end tasks without leaving the dashboard.
                </div>
                <ReportForm
                  canEdit={canEditReport}
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
