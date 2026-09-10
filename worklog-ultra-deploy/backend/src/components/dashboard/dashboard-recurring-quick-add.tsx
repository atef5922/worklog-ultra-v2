"use client";

import * as Dialog from "@radix-ui/react-dialog";
import { ChevronLeft, ChevronRight, X } from "lucide-react";
import { useRouter } from "next/navigation";
import { useEffect, useMemo, useState } from "react";
import { toast } from "sonner";
import {
  OTHER_DEPARTMENT_ID,
  describeRecurringTemplate,
  isRecurringTemplateActiveNow,
  isRecurringTemplateDueToday,
  readRecurringTemplates,
  RecurringTemplate,
} from "@/lib/recurring-task-templates";
import { Button } from "@/components/ui/button";
import { RecurringTasksCenter } from "@/components/dashboard/recurring-tasks-center";

type Department = { id: string; name: string };

export function DashboardRecurringQuickAdd({
  currentUserId,
  currentUserDepartmentId,
  existingTaskTitles,
  departments,
  allowOtherDepartment,
}: {
  currentUserId: string;
  currentUserDepartmentId?: string | null;
  existingTaskTitles: string[];
  departments: Department[];
  allowOtherDepartment?: boolean;
}) {
  const router = useRouter();
  const [templates, setTemplates] = useState<RecurringTemplate[]>([]);
  const [page, setPage] = useState(0);
  const [addingTemplateId, setAddingTemplateId] = useState<string | null>(null);
  const [manageOpen, setManageOpen] = useState(false);
  const pageSize = 4;
  const loadTemplates = useMemo(
    () => () => {
      const allTemplates = readRecurringTemplates().filter((template) => isRecurringTemplateActiveNow(template));
      const sorted = [...allTemplates].sort((left, right) => {
        const leftDue = isRecurringTemplateDueToday(left) ? 1 : 0;
        const rightDue = isRecurringTemplateDueToday(right) ? 1 : 0;

        if (leftDue !== rightDue) {
          return rightDue - leftDue;
        }

        return left.taskTitle.localeCompare(right.taskTitle);
      });

      setTemplates(sorted);
    },
    [],
  );

  useEffect(() => {
    loadTemplates();
    window.addEventListener("worklog-recurring-templates-updated", loadTemplates);

    return () => {
      window.removeEventListener("worklog-recurring-templates-updated", loadTemplates);
    };
  }, [loadTemplates]);

  useEffect(() => {
    if (!manageOpen) {
      loadTemplates();
    }
  }, [loadTemplates, manageOpen]);

  const totalPages = Math.max(1, Math.ceil(templates.length / pageSize));
  const existingTaskTitleSet = useMemo(
    () => new Set(existingTaskTitles.map((title) => title.trim().toLowerCase()).filter(Boolean)),
    [existingTaskTitles],
  );
  const visibleTemplates = useMemo(
    () => templates.slice(page * pageSize, page * pageSize + pageSize),
    [page, templates],
  );

  useEffect(() => {
    if (page > totalPages - 1) {
      setPage(Math.max(0, totalPages - 1));
    }
  }, [page, totalPages]);

  async function addToPlan(template: RecurringTemplate) {
    setAddingTemplateId(template.id);

    const departmentId =
      template.departmentId === OTHER_DEPARTMENT_ID ? currentUserDepartmentId || "" : template.departmentId;

    const response = await fetch("/api/dashboard/plan", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        planDate: new Date().toISOString(),
        tasks: [
          {
            taskTitle: template.taskTitle,
            taskDescription: template.taskDescription,
            priority: template.priority,
            departmentId,
            assigneeId: currentUserId,
          },
        ],
      }),
    });

    const raw = await response.text();
    const result = raw ? JSON.parse(raw) : { message: "Recurring task add failed." };
    setAddingTemplateId(null);

    if (!response.ok) {
      toast.error(result.message ?? "Recurring task add failed.");
      return;
    }

    toast.success(`${template.taskTitle} added to today's work plan.`);
    router.refresh();
  }

  return (
    <div className="rounded-[24px] bg-[var(--panel)] p-4 shadow-[var(--shadow)]">
      <div className="flex items-center justify-between gap-3">
        <h3 className="text-[1.05rem] font-bold leading-tight text-[var(--foreground)]">Today&apos;s Recurring Suggestions</h3>
        <Dialog.Root onOpenChange={setManageOpen} open={manageOpen}>
          <Dialog.Trigger asChild>
            <button className="shrink-0 text-sm font-semibold text-[#4f5ef7] hover:text-[#3f4ede]" type="button">
              Manage
            </button>
          </Dialog.Trigger>
          <Dialog.Portal>
            <Dialog.Overlay className="fixed inset-0 z-40 bg-[rgba(3,8,18,0.62)] backdrop-blur-sm" />
            <Dialog.Content className="fixed left-1/2 top-1/2 z-50 flex max-h-[90vh] w-[min(1080px,calc(100vw-24px))] -translate-x-1/2 -translate-y-1/2 flex-col overflow-hidden rounded-[30px] border border-[var(--panel-border)] bg-[var(--panel)] shadow-[0_36px_90px_rgba(15,23,42,0.28)] outline-none">
              <div className="flex items-center justify-between gap-3 border-b border-[var(--panel-border)] px-5 py-4">
                <div>
                  <Dialog.Title className="text-lg font-bold text-[var(--foreground)]">Recurring Work Setup</Dialog.Title>
                  <Dialog.Description className="mt-1 text-sm text-[var(--muted-foreground)]">
                    Save repeat work here and add it to today&apos;s plan without leaving the dashboard.
                  </Dialog.Description>
                </div>
                <Dialog.Close asChild>
                  <button
                    aria-label="Close recurring work popup"
                    className="inline-flex h-11 w-11 items-center justify-center rounded-2xl border border-[var(--panel-border)] bg-[var(--panel-alt)] text-[var(--foreground)] transition hover:bg-[var(--panel-muted)]"
                    type="button"
                  >
                    <X className="h-5 w-5" />
                  </button>
                </Dialog.Close>
              </div>
              <div className="overflow-y-auto px-5 py-5">
                <RecurringTasksCenter
                  allowOtherDepartment={allowOtherDepartment}
                  currentUserId={currentUserId}
                  departments={departments}
                  userDepartmentId={currentUserDepartmentId}
                />
              </div>
            </Dialog.Content>
          </Dialog.Portal>
        </Dialog.Root>
      </div>
      <div className="mt-3 space-y-2">
        {templates.length ? (
          visibleTemplates.map((template, index) => {
            const alreadyAdded = existingTaskTitleSet.has(template.taskTitle.trim().toLowerCase());

            return (
              <div
                key={template.id}
                className="flex items-center justify-between gap-3 border-b border-[var(--panel-border)] py-2.5 last:border-b-0 last:pb-0 first:pt-0"
              >
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-semibold text-[var(--foreground)]">
                    {page * pageSize + index + 1}. {template.taskTitle}
                  </p>
                  <div className="mt-1 flex items-center gap-2">
                    <span className="rounded-full bg-amber-50 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-[0.16em] text-amber-700 dark:bg-amber-400/10 dark:text-amber-200">
                      {template.priority}
                    </span>
                    <span className="rounded-full bg-blue-50 px-2 py-0.5 text-[10px] font-semibold text-blue-700 dark:bg-blue-400/10 dark:text-blue-200">
                      {template.departmentId === OTHER_DEPARTMENT_ID ? "Other" : "Department"}
                    </span>
                    <span className="text-[11px] font-medium text-[var(--muted-foreground)]">
                      {describeRecurringTemplate(template)}
                    </span>
                    <span
                      className={`rounded-full px-2 py-0.5 text-[10px] font-semibold ${
                        isRecurringTemplateDueToday(template)
                          ? "bg-emerald-50 text-emerald-700 dark:bg-emerald-400/10 dark:text-emerald-200"
                          : "bg-slate-100 text-slate-600 dark:bg-slate-700 dark:text-slate-200"
                      }`}
                    >
                      {isRecurringTemplateDueToday(template) ? "Today" : "Upcoming"}
                    </span>
                  </div>
                </div>
                <Button
                  className="button-force-white h-8 shrink-0 rounded-xl bg-[#4f5ef7] px-4 text-sm hover:bg-[#4453eb]"
                  disabled={alreadyAdded || addingTemplateId === template.id}
                  onClick={() => addToPlan(template)}
                  type="button"
                >
                  {alreadyAdded ? "Added" : addingTemplateId === template.id ? "Adding..." : "Add"}
                </Button>
              </div>
            );
          })
        ) : (
          <div className="rounded-2xl border border-dashed border-[var(--panel-border)] bg-[var(--panel-muted)] px-4 py-4 text-sm text-[var(--muted-foreground)]">
            No recurring task has been saved yet. Use <span className="font-semibold text-[var(--foreground)]">Manage</span> to save your regular work once.
          </div>
        )}
      </div>
      {templates.length > pageSize ? (
        <div className="mt-3 flex items-center justify-between border-t border-[var(--panel-border)] pt-3">
          <p className="text-xs font-medium text-[var(--muted-foreground)]">
            Page {page + 1} of {totalPages}
          </p>
          <div className="flex items-center gap-2">
            <button
              className="inline-flex h-8 w-8 items-center justify-center rounded-full border border-[var(--panel-border)] text-[var(--muted-foreground)] transition hover:bg-[var(--panel-alt)] disabled:cursor-not-allowed disabled:opacity-40"
              disabled={page === 0}
              onClick={() => setPage((current) => Math.max(0, current - 1))}
              type="button"
            >
              <ChevronLeft className="h-4 w-4" />
            </button>
            <button
              className="inline-flex h-8 w-8 items-center justify-center rounded-full border border-[var(--panel-border)] text-[var(--muted-foreground)] transition hover:bg-[var(--panel-alt)] disabled:cursor-not-allowed disabled:opacity-40"
              disabled={page >= totalPages - 1}
              onClick={() => setPage((current) => Math.min(totalPages - 1, current + 1))}
              type="button"
            >
              <ChevronRight className="h-4 w-4" />
            </button>
          </div>
        </div>
      ) : null}
    </div>
  );
}
