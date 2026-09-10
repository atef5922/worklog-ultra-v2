"use client";

import { ChevronDown, ChevronUp, ListChecks, Sparkles, Trash2, WandSparkles } from "lucide-react";
import { usePathname, useRouter } from "next/navigation";
import { useEffect, useMemo, useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { PanelHeader } from "@/components/dashboard/panel-header";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { dispatchDashboardTasksCreated, scheduleDashboardTaskAutostart } from "@/lib/dashboard-live-events";
import { OTHER_DEPARTMENT_ID } from "@/lib/recurring-task-templates";
import { CONTINUATION_MARKER } from "@/lib/task-continuation";
import { formatTaskPriority, TASK_PRIORITY_OPTIONS, type TaskPriority } from "@/lib/task-priority";
import { cn, createId, toDateOnly } from "@/lib/utils";

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
  priority: TaskPriority;
  source: string;
};
type Task = {
  id?: string;
  clientId: string;
  taskTitle: string;
  taskDescription: string;
  priority: string;
  departmentId: string;
  assigneeId: string;
};

type DraftSnapshot = {
  tasks: Task[];
};

function normalizeTaskTitle(value: string) {
  return value.trim().toLowerCase();
}

function makeTask(defaultDepartmentId: string, defaultAssigneeId: string) {
  return {
    clientId: createId(),
    taskTitle: "",
    taskDescription: "",
    priority: "normal",
    departmentId: defaultDepartmentId,
    assigneeId: defaultAssigneeId,
  };
}

function makeBlankTaskLike(task: Task, fallbackDepartmentId: string, fallbackAssigneeId: string) {
  return makeTask(task.departmentId || fallbackDepartmentId, task.assigneeId || fallbackAssigneeId);
}

function stripAutoDescriptionText(description?: string | null) {
  const visibleDescription = (() => {
    if (!description) {
      return "";
    }

    const markerIndex = description.indexOf(CONTINUATION_MARKER);
    return markerIndex === -1 ? description : description.slice(0, markerIndex);
  })();

  return visibleDescription
    .replace(/^Predicted from your work pattern and completion history\.?\s*/i, "")
    .replace(/^\s+/, "");
}

function mergeDescriptionWithContinuationMeta(originalDescription: string, nextDescription: string) {
  const markerIndex = originalDescription.indexOf(CONTINUATION_MARKER);

  if (markerIndex === -1) {
    return nextDescription;
  }

  const continuationMeta = originalDescription.slice(markerIndex).trim();
  return [nextDescription, continuationMeta].filter((value) => value.length > 0).join("\n\n");
}

export function PlanForm({
  departments = [],
  initialTasks = [],
  suggestions = [],
  userDepartmentId,
  isTenderDepartment = false,
  role,
  assignableUsers = [],
  currentUserId,
  clearDraftOnMount = false,
  fitViewport = false,
  onSaved,
}: {
  departments: Department[];
  initialTasks: Omit<Task, "clientId">[];
  suggestions: Suggestion[];
  userDepartmentId?: string | null;
  isTenderDepartment?: boolean;
  role: "employee" | "hr" | "manager" | "admin";
  assignableUsers: AssignableUser[];
  currentUserId: string;
  clearDraftOnMount?: boolean;
  /**
   * Fill the parent's leftover height and keep only the task list scrollable.
   * Off in the Add Task modal, where the form must flow at its natural height
   * inside the modal's own scroller.
   */
  fitViewport?: boolean;
  onSaved?: () => void;
}) {
  const router = useRouter();
  const pathname = usePathname();
  const fallbackDepartmentId = userDepartmentId || departments[0]?.id || "";
  const fallbackAssigneeId = currentUserId;
  const validInitialTaskIds = useMemo(
    () => new Set((initialTasks ?? []).map((task) => task.id).filter(Boolean)),
    [initialTasks],
  );
  const planDraftStorageKey = useMemo(() => `worklog-plan-draft:${currentUserId}:${toDateOnly()}`, [currentUserId]);
  const serverTasks = useMemo(
    () =>
      (initialTasks ?? []).length
        ? (initialTasks ?? []).map((task) => ({
            clientId: createId(),
            ...task,
          }))
        : [makeTask(fallbackDepartmentId, fallbackAssigneeId)],
    [fallbackAssigneeId, fallbackDepartmentId, initialTasks],
  );
  const [tasks, setTasks] = useState<Task[]>(() => serverTasks);
  const [loading, setLoading] = useState(false);
  const [lastSuggestedTitle, setLastSuggestedTitle] = useState<string | null>(null);
  const [showSuggestions, setShowSuggestions] = useState(false);

  const activeDepartmentId = useMemo(
    () => tasks[0]?.departmentId || fallbackDepartmentId,
    [fallbackDepartmentId, tasks],
  );
  const activeDepartmentName =
    departments.find((department) => department.id === activeDepartmentId)?.name ?? "your department";
  const allowOtherDepartment = role === "admin";

  useEffect(() => {
    if (!clearDraftOnMount || typeof window === "undefined") {
      return;
    }

    window.localStorage.removeItem(planDraftStorageKey);
    setTasks([makeTask(fallbackDepartmentId, fallbackAssigneeId)]);
  }, [clearDraftOnMount, fallbackAssigneeId, fallbackDepartmentId, planDraftStorageKey]);

  useEffect(() => {
    if (typeof window === "undefined" || clearDraftOnMount) {
      return;
    }

    const raw = window.localStorage.getItem(planDraftStorageKey);
    if (!raw) {
      return;
    }

    try {
      const parsed = JSON.parse(raw) as DraftSnapshot;
      const validDraftTasks = (parsed.tasks ?? []).filter((task) => !task.id || validInitialTaskIds.has(task.id));

      if (!validDraftTasks.length) {
        return;
      }

      setTasks(validDraftTasks);
    } catch {
      window.localStorage.removeItem(planDraftStorageKey);
      setTasks(serverTasks);
    }
  }, [clearDraftOnMount, planDraftStorageKey, serverTasks, validInitialTaskIds]);

  useEffect(() => {
    if (typeof window === "undefined") {
      return;
    }

    window.localStorage.setItem(
      planDraftStorageKey,
      JSON.stringify({
        tasks,
      } satisfies DraftSnapshot),
    );
  }, [planDraftStorageKey, tasks]);

  function updateTask(index: number, key: keyof Task, value: string) {
    setTasks((current) =>
      current.map((task, taskIndex) => (taskIndex === index ? { ...task, [key]: value } : task)),
    );
  }

  function firstBlankTaskIndex(source: Task[]) {
    return source.findIndex(
      (task) => !task.taskTitle.trim() && !task.taskDescription.trim() && task.priority === "normal",
    );
  }

  function addBlankTask() {
    setTasks((current) => [
      makeTask(current[0]?.departmentId || fallbackDepartmentId, current[0]?.assigneeId || fallbackAssigneeId),
      ...current,
    ]);
  }

  function removeTask(index: number) {
    setTasks((current) => current.filter((_, taskIndex) => taskIndex !== index));
  }

  function removeTaskFromDraft(task: Task) {
    setTasks((current) => {
      const filtered = current.filter(
        (item) => item.clientId !== task.clientId && (!task.id || item.id !== task.id),
      );

      return filtered.length ? filtered : [makeBlankTaskLike(task, fallbackDepartmentId, fallbackAssigneeId)];
    });
  }

  function addSuggestedTask(suggestion: Suggestion) {
    const normalizedSuggestionTitle = normalizeTaskTitle(suggestion.title);

    if (tasks.some((task) => normalizeTaskTitle(task.taskTitle) === normalizedSuggestionTitle)) {
      toast.error("This task is already in today's plan.");
      return;
    }

    setTasks((current) => {
      const blankIndex = firstBlankTaskIndex(current);

      if (blankIndex !== -1) {
        return current.map((task, index) =>
          index === blankIndex
            ? {
                ...task,
                taskTitle: suggestion.title,
                taskDescription: suggestion.description,
                priority: suggestion.priority,
              }
            : task,
        );
      }

      return [
        {
          clientId: createId(),
          taskTitle: suggestion.title,
          taskDescription: suggestion.description,
          priority: suggestion.priority,
          departmentId: current[0]?.departmentId || fallbackDepartmentId,
          assigneeId: current[0]?.assigneeId || fallbackAssigneeId,
        },
        ...current,
      ];
    });
    setLastSuggestedTitle(suggestion.title);
    toast.success(`Suggestion loaded for edit: ${suggestion.title}`);
  }

  async function save() {
    const normalizedTitles = tasks.map((task) => normalizeTaskTitle(task.taskTitle)).filter(Boolean);
    if (normalizedTitles.length !== new Set(normalizedTitles).size) {
      toast.error("Same task was added more than once. Remove the duplicate task first.");
      return;
    }

    const tasksToCreate = tasks.filter((task) => !task.id);

    if (!tasksToCreate.length) {
      toast.success("These tasks are already in today's plan.");
      return;
    }

    setLoading(true);

    const response = await fetch("/api/dashboard/plan", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        planDate: new Date().toISOString(),
        tasks: tasksToCreate.map((task) => ({
          taskTitle: task.taskTitle,
          taskDescription: task.taskDescription,
          priority: task.priority,
          departmentId: task.departmentId,
          assigneeId: task.assigneeId,
        })),
      }),
    });
    const result = await response.json();
    setLoading(false);

    if (!response.ok) {
      toast.error(result.message);
      return;
    }

    toast.success(result.message);
    const createdOwnTasks = ((result.tasks ?? []) as Array<{
      id: string;
      userId: string;
      taskTitle: string;
      taskDescription?: string | null;
      priority: string;
      planDate: string;
      assignedBy?: string | null;
      department?: { name?: string | null } | null;
    }>).filter((task) => task.userId === currentUserId && !task.assignedBy);
    if (isTenderDepartment && createdOwnTasks[0]) {
      scheduleDashboardTaskAutostart(createdOwnTasks[0].id, createdOwnTasks[0].planDate);
    }
    dispatchDashboardTasksCreated(
      createdOwnTasks.map((task) => ({
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
    tasksToCreate.forEach((task) => removeTaskFromDraft(task));
    setTasks([makeTask(fallbackDepartmentId, fallbackAssigneeId)]);
    if (typeof window !== "undefined") {
      window.localStorage.removeItem(planDraftStorageKey);
    }
    if (isTenderDepartment && pathname !== "/dashboard") {
      router.push("/dashboard");
    }
    router.refresh();
    onSaved?.();
  }

  return (
    <div className={cn("flex flex-col gap-2", fitViewport && "min-[900px]:min-h-0 min-[900px]:flex-1")}>
      <div
        className={cn(
          "dashboard-accent accent-teal rounded-[1.25rem] border border-[var(--panel-border)] bg-[var(--panel)] p-2.5 shadow-[var(--shadow)]",
          // Capped, not shrink-0: expanded it holds six cards and was taking the
          // whole page, which squeezed the task list into a strip that scrolled
          // at a single task. Collapsed the cap never binds.
          fitViewport && "flex min-h-0 shrink-0 flex-col min-[900px]:max-h-[14rem]",
        )}
        data-dashboard-panel
      >
        <PanelHeader
          action={
            <Button
              className={cn("h-8 rounded-full px-3 text-xs", showSuggestions && "button-force-white bg-[#0d9488] hover:bg-[#0f766e]")}
              onClick={() => setShowSuggestions((current) => !current)}
              type="button"
              variant={showSuggestions ? "default" : "secondary"}
            >
              {showSuggestions ? <ChevronUp className="h-3.5 w-3.5" /> : <ChevronDown className="h-3.5 w-3.5" />}
              {showSuggestions ? "Hide" : "Suggest Work"}
            </Button>
          }
          icon={WandSparkles}
          title={`Suggestions for ${activeDepartmentName}`}
          tone="bg-teal-500/10 text-teal-500"
        />
        <p className="mt-1 shrink-0 text-[0.75rem] leading-4 text-[var(--muted-foreground)]">
          Smart ideas for your department. Open it whenever you want a quick starting point.
        </p>
        {showSuggestions ? (
          <div className={cn("mt-2", fitViewport && "dashboard-scroll-area min-h-0 flex-1 pr-0.5")}>
            <div className="grid gap-2 xl:grid-cols-2">
              {suggestions.length ? (
                (suggestions ?? []).map((suggestion) => (
                  <button
                    key={`${suggestion.source}-${suggestion.title}`}
                    className="group cursor-pointer rounded-xl border border-[var(--panel-border)] bg-[var(--panel-muted)] p-2.5 text-left transition-all hover:-translate-y-0.5 hover:border-teal-500/40 hover:bg-teal-500/5 hover:shadow-[0_10px_22px_rgba(20,184,166,0.14)]"
                    onClick={() => addSuggestedTask(suggestion)}
                    type="button"
                  >
                    <div className="flex items-start justify-between gap-2.5">
                      <div className="min-w-0">
                        <p className="line-clamp-2 break-words text-[0.82rem] font-semibold leading-snug text-[var(--foreground)]">
                          {suggestion.title}
                        </p>
                        <p className="mt-0.5 line-clamp-2 break-words text-[0.72rem] leading-5 text-[var(--muted-foreground)]">
                          {suggestion.description}
                        </p>
                      </div>
                      <Sparkles className="mt-0.5 h-3.5 w-3.5 shrink-0 text-teal-500 transition-transform group-hover:scale-110" />
                    </div>
                    <div className="mt-2 flex flex-wrap items-center justify-between gap-1.5 text-[0.65rem]">
                      <div className="flex flex-wrap items-center gap-1.5">
                        <span className="rounded-full bg-teal-500/10 px-2 py-0.5 font-bold uppercase tracking-[0.12em] text-teal-600">
                          {formatTaskPriority(suggestion.priority)}
                        </span>
                        {lastSuggestedTitle === suggestion.title ? (
                          <span className="rounded-full bg-emerald-500/10 px-2 py-0.5 font-semibold text-emerald-600">
                            Loaded for edit
                          </span>
                        ) : (
                          <span className="rounded-full bg-[var(--panel)] px-2 py-0.5 font-semibold text-[var(--muted-foreground)]">
                            Load to edit
                          </span>
                        )}
                      </div>
                      <span className="truncate font-medium text-[var(--muted-foreground)]">{suggestion.source}</span>
                    </div>
                  </button>
                ))
              ) : (
                <div className="flex flex-col items-center justify-center gap-1.5 rounded-xl border border-dashed border-[var(--panel-border)] bg-[var(--panel-muted)] px-3 py-5 text-center xl:col-span-2">
                  <span className="inline-flex h-8 w-8 items-center justify-center rounded-full bg-teal-500/10 text-teal-500">
                    <WandSparkles className="h-4 w-4" />
                  </span>
                  <p className="max-w-[38ch] text-[0.78rem] leading-5 text-[var(--muted-foreground)]">
                    No suggestions yet. Save a few daily plans and this panel starts predicting your department&apos;s regular work.
                  </p>
                </div>
              )}
            </div>
          </div>
        ) : null}
      </div>

      <div
        className={cn(
          "dashboard-accent accent-indigo rounded-[1.25rem] border border-[var(--panel-border)] bg-[var(--panel)] p-2.5 shadow-[var(--shadow)]",
          fitViewport && "flex min-h-0 flex-col min-[900px]:flex-1",
        )}
        data-dashboard-panel
      >
        <PanelHeader
          action={
            <Button
              className="button-force-white h-8 rounded-full bg-[#4f5ef7] px-3 text-xs shadow-[0_10px_22px_rgba(79,94,247,0.24)] hover:bg-[#4453eb]"
              onClick={addBlankTask}
              type="button"
              variant="default"
            >
              New Task
            </Button>
          }
          icon={ListChecks}
          title="Today's Task List"
        />
        <p className="mt-1 shrink-0 text-[0.75rem] leading-4 text-[var(--muted-foreground)]">
          Add today&apos;s tasks here first. After saving, start the timer from the dashboard.
        </p>
        <div
          className={cn(
            "mt-2 space-y-2",
            // The task list is the one part that grows without bound, so it is
            // the only thing allowed to scroll.
            fitViewport && "dashboard-scroll-area min-h-0 flex-1 pr-0.5",
          )}
        >
          {(tasks ?? []).map((task, index) => (
            <div
              key={task.clientId}
              className="rounded-xl border border-[var(--panel-border)] bg-[var(--panel-muted)] p-2.5 transition-colors hover:border-[#4f5ef7]/30"
            >
              <div className="mb-2 flex items-center justify-between gap-3">
                <div className="flex min-w-0 items-center gap-2">
                  <span className="inline-flex h-5 w-5 shrink-0 items-center justify-center rounded-md bg-[#4f5ef7]/10 font-mono text-[0.625rem] font-bold tabular-nums text-[#4f5ef7]">
                    {String(index + 1).padStart(2, "0")}
                  </span>
                  <p className="truncate text-[0.82rem] font-semibold text-[var(--foreground)]">
                    {task.taskTitle.trim() || `Task ${index + 1}`}
                  </p>
                </div>
                {tasks.length > 1 ? (
                  <Button
                    className="h-8 shrink-0 rounded-full px-2.5 text-[0.7rem] text-rose-600 hover:bg-rose-500/10 hover:text-rose-700"
                    onClick={() => removeTask(index)}
                    size="sm"
                    type="button"
                    variant="outline"
                  >
                    <Trash2 className="h-3.5 w-3.5" />
                    Remove
                  </Button>
                ) : null}
              </div>

              {/* Three across on a wide screen: title, department and priority
                  used to wrap onto two rows and cost every task card a row of
                  height it did not need. */}
              <div className="grid gap-2 sm:grid-cols-2 xl:grid-cols-3">
                <div>
                  <Label>Task Title</Label>
                  <Input
                    onChange={(event) => updateTask(index, "taskTitle", event.target.value)}
                    placeholder="Enter task title"
                    value={task.taskTitle}
                  />
                </div>
                <div>
                  <Label>Department</Label>
                  <Select value={task.departmentId} onValueChange={(value) => updateTask(index, "departmentId", value)}>
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {allowOtherDepartment ? <SelectItem value={OTHER_DEPARTMENT_ID}>Other</SelectItem> : null}
                      {(departments ?? []).map((department) => (
                        <SelectItem key={department.id} value={department.id}>
                          {department.name}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div>
                  <Label>Priority</Label>
                  <Select value={task.priority} onValueChange={(value) => updateTask(index, "priority", value)}>
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {TASK_PRIORITY_OPTIONS.map((option) => (
                        <SelectItem key={option.value} value={option.value}>
                          {option.label}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              </div>

              <div className="mt-2">
                <Label>Description</Label>
                <Textarea
                  onChange={(event) =>
                    updateTask(
                      index,
                      "taskDescription",
                      mergeDescriptionWithContinuationMeta(task.taskDescription, event.target.value),
                    )
                  }
                  placeholder="Add a short task description"
                  rows={2}
                  value={stripAutoDescriptionText(task.taskDescription)}
                />
              </div>
            </div>
          ))}
        </div>

        {/* Outside the scroller: Save must stay reachable no matter how many
            tasks have been added. */}
        <Button
          className={cn(
            "button-force-white mt-2 h-10 w-full rounded-xl bg-[linear-gradient(135deg,#4f5ef7_0%,#6d5df6_55%,#8b5cf6_100%)] text-sm shadow-[0_14px_30px_rgba(79,94,247,0.28)] transition hover:brightness-[1.06] disabled:brightness-100",
            fitViewport && "shrink-0",
          )}
          disabled={loading}
          onClick={save}
          type="button"
        >
          {loading ? "Saving tasks..." : `Save Today's Tasks (${tasks.length})`}
        </Button>
      </div>
    </div>
  );
}
