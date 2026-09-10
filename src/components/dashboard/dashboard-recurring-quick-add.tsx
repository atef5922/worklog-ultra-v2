"use client";

import * as Dialog from "@radix-ui/react-dialog";
import { ChevronLeft, ChevronRight, Repeat2, X } from "lucide-react";
import { useRouter } from "next/navigation";
import { useEffect, useMemo, useState } from "react";
import { toast } from "sonner";
import {
  clearRecurringTemplates,
  OTHER_DEPARTMENT_ID,
  describeRecurringTemplate,
  embedRecurringTaskDescription,
  isRecurringTemplateActiveNow,
  isRecurringTemplateDueToday,
  readRecurringTemplates,
  RecurringTemplate,
} from "@/lib/recurring-task-templates";
import { Button } from "@/components/ui/button";
import { PanelHeader } from "@/components/dashboard/panel-header";
import { RecurringTasksCenter } from "@/components/dashboard/recurring-tasks-center";
import {
  DASHBOARD_TASKS_CREATED_EVENT,
  DASHBOARD_TASKS_REMOVED_EVENT,
  dispatchDashboardTasksCreated,
  scheduleDashboardTaskAutostart,
} from "@/lib/dashboard-live-events";

type Department = { id: string; name: string };

export function DashboardRecurringQuickAdd({
  currentUserId,
  currentUserDepartmentId,
  isTenderDepartment = false,
  existingTaskTitles,
  departments,
  allowOtherDepartment,
}: {
  currentUserId: string;
  currentUserDepartmentId?: string | null;
  isTenderDepartment?: boolean;
  existingTaskTitles: string[];
  departments: Department[];
  allowOtherDepartment?: boolean;
}) {
  const router = useRouter();
  const [templates, setTemplates] = useState<RecurringTemplate[]>([]);
  const [page, setPage] = useState(0);
  const [addingTemplateId, setAddingTemplateId] = useState<string | null>(null);
  const [manageOpen, setManageOpen] = useState(false);
  const [clearing, setClearing] = useState(false);
  const [addedTaskTitles, setAddedTaskTitles] = useState<string[]>(existingTaskTitles);
  const pageSize = 4;
  const loadTemplates = useMemo(
    () => () => {
      const allTemplates = readRecurringTemplates(currentUserId).filter((template) => isRecurringTemplateActiveNow(template));
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
    [currentUserId],
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

  useEffect(() => {
    setAddedTaskTitles(existingTaskTitles);
  }, [existingTaskTitles]);

  useEffect(() => {
    function handleTasksCreated(event: Event) {
      const detail = (event as CustomEvent<{ tasks?: Array<{ taskTitle: string }> }>).detail;
      const createdTasks = detail?.tasks ?? [];
      if (!createdTasks.length) {
        return;
      }

      setAddedTaskTitles((current) => [
        ...current,
        ...createdTasks.map((task) => task.taskTitle),
      ]);
    }

    function handleTasksRemoved(event: Event) {
      const detail = (event as CustomEvent<{ tasks?: Array<{ taskTitle: string }> }>).detail;
      const removedTitles = new Set(
        (detail?.tasks ?? []).map((task) => task.taskTitle.trim().toLowerCase()).filter(Boolean),
      );

      if (!removedTitles.size) {
        return;
      }

      setAddedTaskTitles((current) =>
        current.filter((title) => !removedTitles.has(title.trim().toLowerCase())),
      );
    }

    window.addEventListener(DASHBOARD_TASKS_CREATED_EVENT, handleTasksCreated);
    window.addEventListener(DASHBOARD_TASKS_REMOVED_EVENT, handleTasksRemoved);

    return () => {
      window.removeEventListener(DASHBOARD_TASKS_CREATED_EVENT, handleTasksCreated);
      window.removeEventListener(DASHBOARD_TASKS_REMOVED_EVENT, handleTasksRemoved);
    };
  }, []);

  const totalPages = Math.max(1, Math.ceil(templates.length / pageSize));
  const existingTaskTitleSet = useMemo(
    () => new Set(addedTaskTitles.map((title) => title.trim().toLowerCase()).filter(Boolean)),
    [addedTaskTitles],
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
            taskDescription: embedRecurringTaskDescription(template.taskDescription),
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
    const createdOwnTask = ((result.tasks ?? []) as Array<{ id: string; userId: string; planDate: string }>)
      .find((task) => task.userId === currentUserId);
    if (isTenderDepartment && createdOwnTask) {
      scheduleDashboardTaskAutostart(createdOwnTask.id, createdOwnTask.planDate);
    }
    dispatchDashboardTasksCreated(
      ((result.tasks ?? []) as Array<{
        id: string;
        userId: string;
        taskTitle: string;
        taskDescription?: string | null;
        priority: string;
        planDate: string;
        assignedBy?: string | null;
        department?: { name?: string | null } | null;
      }>)
        .filter((task) => task.userId === currentUserId && !task.assignedBy)
        .map((task) => ({
          id: task.id,
          taskTitle: task.taskTitle,
          taskDescription: task.taskDescription ?? "",
          priority: task.priority,
          planDate: task.planDate,
          userId: task.userId,
          assignedBy: task.assignedBy ?? null,
          departmentName: task.department?.name ?? "General",
        })),
    );
    router.refresh();
  }

  function handleClearTemplates() {
    if (!templates.length || clearing) {
      return;
    }

    const confirmed = window.confirm("Clear all saved recurring jobs? This will remove every recurring setup you saved.");
    if (!confirmed) {
      return;
    }

    setClearing(true);
    clearRecurringTemplates(currentUserId);
    setPage(0);
    setClearing(false);
    toast.success("All recurring jobs cleared.");
  }

  return (
    <div
      className="dashboard-accent accent-teal flex h-full min-h-0 flex-col rounded-[1.25rem] border border-[var(--panel-border)] bg-[var(--panel)] p-2.5"
      data-dashboard-panel
    >
      <PanelHeader
        icon={Repeat2}
        title="Recurring"
        tone="bg-teal-500/10 text-teal-500"
        action={
        <div className="flex flex-wrap items-center gap-2.5">
          <button
            className="shrink-0 text-xs font-semibold text-rose-500 transition hover:text-rose-600 disabled:cursor-not-allowed disabled:opacity-40 sm:text-sm"
            disabled={!templates.length || clearing}
            onClick={handleClearTemplates}
            type="button"
          >
            {clearing ? "Clearing..." : "Clear"}
          </button>
          <Dialog.Root onOpenChange={setManageOpen} open={manageOpen}>
            <Dialog.Trigger asChild>
              <button className="shrink-0 text-xs font-semibold text-[#4f5ef7] hover:text-[#3f4ede] sm:text-sm" type="button">
                Manage
              </button>
            </Dialog.Trigger>
            <Dialog.Portal>
              <Dialog.Overlay className="fixed inset-0 z-40 bg-[rgba(3,8,18,0.62)] backdrop-blur-sm" />
              <Dialog.Content className="fixed left-1/2 top-1/2 z-50 flex max-h-[90vh] w-[min(1080px,calc(100vw-24px))] -translate-x-1/2 -translate-y-1/2 flex-col overflow-hidden rounded-[1.875rem] border border-[var(--panel-border)] bg-[var(--panel)] shadow-[0_36px_90px_rgba(15,23,42,0.28)] outline-none">
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
                <div className="dashboard-scroll-area px-5 py-5">
                  <RecurringTasksCenter
                    allowOtherDepartment={allowOtherDepartment}
                    currentUserId={currentUserId}
                    departments={departments}
                    onSaved={() => setManageOpen(false)}
                    userDepartmentId={currentUserDepartmentId}
                  />
                </div>
              </Dialog.Content>
            </Dialog.Portal>
          </Dialog.Root>
        </div>
        }
      />
      <div className="dashboard-scroll-area mt-2 min-h-0 flex-1 space-y-2 pr-0.5">
        {templates.length ? (
          visibleTemplates.map((template, index) => {
            const alreadyAdded = existingTaskTitleSet.has(template.taskTitle.trim().toLowerCase());

            return (
              <div
                key={template.id}
                className="flex flex-col gap-3 border-b border-[var(--panel-border)] py-2.5 last:border-b-0 last:pb-0 first:pt-0 sm:flex-row sm:items-center sm:justify-between"
              >
                <div className="min-w-0 flex-1">
                  <p className="line-clamp-1 break-words text-[0.92rem] font-semibold text-[var(--foreground)] sm:text-sm">
                    {page * pageSize + index + 1}. {template.taskTitle}
                  </p>
                  <div className="mt-1 flex flex-wrap items-center gap-2">
                    <span className="rounded-full bg-amber-50 px-2 py-0.5 text-[0.625rem] font-semibold uppercase tracking-[0.16em] text-amber-700 dark:bg-amber-400/10 dark:text-amber-200">
                      {template.priority}
                    </span>
                    <span className="rounded-full bg-blue-50 px-2 py-0.5 text-[0.625rem] font-semibold text-blue-700 dark:bg-blue-400/10 dark:text-blue-200">
                      {template.departmentId === OTHER_DEPARTMENT_ID ? "Other" : "Department"}
                    </span>
                    <span className="text-[0.625rem] font-medium text-[var(--muted-foreground)] sm:text-[0.6875rem]">
                      {describeRecurringTemplate(template)}
                    </span>
                    <span
                      className={`rounded-full px-2 py-0.5 text-[0.625rem] font-semibold ${
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
                  className="button-force-white h-8 shrink-0 rounded-xl bg-[#4f5ef7] px-3.5 text-xs hover:bg-[#4453eb] sm:px-4 sm:text-sm"
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
          <div className="flex h-full flex-col items-center justify-center gap-1 rounded-xl border border-dashed border-[var(--panel-border)] bg-[var(--panel-muted)] px-2.5 py-2 text-center">
            <span className="inline-flex h-6 w-6 items-center justify-center rounded-full bg-teal-500/10 text-teal-500">
              <Repeat2 className="h-3.5 w-3.5" />
            </span>
            <p className="text-[0.72rem] leading-4 text-[var(--muted-foreground)]">
              Save repeat work once with <span className="font-semibold text-[var(--foreground)]">Manage</span>.
            </p>
          </div>
        )}
      </div>
      {templates.length > pageSize ? (
        <div className="mt-2 flex shrink-0 items-center justify-between border-t border-[var(--panel-border)] pt-2">
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
