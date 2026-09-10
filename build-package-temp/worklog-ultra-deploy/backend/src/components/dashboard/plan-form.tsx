"use client";

import Link from "next/link";
import { ChevronDown, ChevronUp, Pause, Play, Plus, RotateCcw, Sparkles, Square, Trash2, WandSparkles, X } from "lucide-react";
import { useRouter } from "next/navigation";
import { useEffect, useMemo, useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import {
  describeRecurringTemplate,
  isRecurringTemplateActiveNow,
  isRecurringTemplateDueToday,
  OTHER_DEPARTMENT_ID,
  readRecurringTemplates,
  RecurringTemplate,
} from "@/lib/recurring-task-templates";
import { readTaskTimerSnapshot, writeTaskTimerSnapshot } from "@/lib/task-timer-storage";
import { toDateOnly, toDateTimeInputValue } from "@/lib/utils";

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
type Task = { id?: string; clientId: string; taskTitle: string; taskDescription: string; priority: string; departmentId: string; assigneeId: string };
type TaskTimerState = {
  elapsedSeconds: number;
  runningSince: number | null;
  actualStart: string;
  actualEnd: string;
};

type DraftSnapshot = {
  tasks: Task[];
  timers: Record<string, TaskTimerState>;
};

const PLAN_DRAFT_STORAGE_KEY = `worklog-plan-draft:${toDateOnly()}`;

function makeTask(defaultDepartmentId: string, defaultAssigneeId: string) {
  return {
    clientId: crypto.randomUUID(),
    taskTitle: "",
    taskDescription: "",
    priority: "normal",
    departmentId: defaultDepartmentId,
    assigneeId: defaultAssigneeId,
  };
}

function formatElapsedDuration(totalSeconds: number) {
  const hours = Math.floor(totalSeconds / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  const seconds = totalSeconds % 60;

  return `${hours}h ${String(minutes).padStart(2, "0")}m ${String(seconds).padStart(2, "0")}s`;
}

function getTimerKey(task: Task) {
  return task.id ?? task.clientId;
}

function mirrorSharedPlanTimer(task: Task, timer: TaskTimerState) {
  if (!task.id) {
    return;
  }

  const liveTrackedSeconds =
    timer.elapsedSeconds +
    (timer.runningSince ? Math.max(0, Math.floor((Date.now() - timer.runningSince) / 1000)) : 0);

  writeTaskTimerSnapshot(toDateOnly(), task.id, {
    status: timer.actualEnd ? "done" : timer.actualStart ? "in_progress" : "pending",
    trackedMinutes: String(Math.floor(liveTrackedSeconds / 60)),
    actualStart: timer.actualStart,
    actualEnd: timer.actualEnd,
    runningStartedAt: timer.runningSince ? new Date(timer.runningSince).toISOString() : "",
  });
}

export function PlanForm({
  departments,
  initialTasks,
  suggestions,
  userDepartmentId,
  role,
  assignableUsers,
  currentUserId,
  clearDraftOnMount = false,
  onSaved,
}: {
  departments: Department[];
  initialTasks: Omit<Task, "clientId">[];
  suggestions: Suggestion[];
  userDepartmentId?: string | null;
  role: "employee" | "hr" | "manager" | "admin";
  assignableUsers: AssignableUser[];
  currentUserId: string;
  clearDraftOnMount?: boolean;
  onSaved?: () => void;
}) {
  const router = useRouter();
  const fallbackDepartmentId = userDepartmentId || departments[0]?.id || "";
  const fallbackAssigneeId = currentUserId;
  const validInitialTaskIds = new Set(initialTasks.map((task) => task.id).filter(Boolean));
  const [tasks, setTasks] = useState<Task[]>(() => {
    if (typeof window !== "undefined") {
      const raw = window.localStorage.getItem(PLAN_DRAFT_STORAGE_KEY);
      if (raw) {
        try {
          const parsed = JSON.parse(raw) as DraftSnapshot;
          const validDraftTasks = (parsed.tasks ?? []).filter((task) => !task.id || validInitialTaskIds.has(task.id));

          if (validDraftTasks.length) {
            return validDraftTasks;
          }
        } catch {
          window.localStorage.removeItem(PLAN_DRAFT_STORAGE_KEY);
        }
      }
    }

    return initialTasks.length
      ? initialTasks.map((task) => ({
          clientId: crypto.randomUUID(),
          ...task,
        }))
      : [makeTask(fallbackDepartmentId, fallbackAssigneeId)];
  });
  const [loading, setLoading] = useState(false);
  const [lastSuggestedTitle, setLastSuggestedTitle] = useState<string | null>(null);
  const [showSuggestions, setShowSuggestions] = useState(false);
  const [recurringSuggestions, setRecurringSuggestions] = useState<RecurringTemplate[]>([]);
  const [now, setNow] = useState(() => Date.now());
  const [timers, setTimers] = useState<Record<string, TaskTimerState>>(() => {
    if (typeof window === "undefined") {
      return {};
    }

    const raw = window.localStorage.getItem(PLAN_DRAFT_STORAGE_KEY);
    if (!raw) {
      return {};
    }

    try {
      const parsed = JSON.parse(raw) as DraftSnapshot;
      const validKeys = new Set(
        (parsed.tasks ?? [])
          .filter((task) => !task.id || validInitialTaskIds.has(task.id))
          .map((task) => getTimerKey(task)),
      );

      return Object.fromEntries(
        Object.entries(parsed.timers ?? {}).filter(([timerKey]) => validKeys.has(timerKey)),
      );
    } catch {
      return {};
    }
  });

  const activeDepartmentId = useMemo(
    () => tasks[0]?.departmentId || fallbackDepartmentId,
    [fallbackDepartmentId, tasks],
  );
  const activeDepartmentName = departments.find((department) => department.id === activeDepartmentId)?.name ?? "your department";
  const allowOtherDepartment = role === "admin";

  useEffect(() => {
    const interval = window.setInterval(() => setNow(Date.now()), 1000);
    return () => window.clearInterval(interval);
  }, []);

  useEffect(() => {
    const allTemplates = readRecurringTemplates().filter((template) => isRecurringTemplateActiveNow(template));
    const sorted = [...allTemplates].sort((left, right) => {
      const leftDue = isRecurringTemplateDueToday(left) ? 1 : 0;
      const rightDue = isRecurringTemplateDueToday(right) ? 1 : 0;

      if (leftDue !== rightDue) {
        return rightDue - leftDue;
      }

      return left.taskTitle.localeCompare(right.taskTitle);
    });

    setRecurringSuggestions(sorted);
  }, []);

  useEffect(() => {
    if (!clearDraftOnMount || typeof window === "undefined") {
      return;
    }

    window.localStorage.removeItem(PLAN_DRAFT_STORAGE_KEY);
    setTasks([makeTask(fallbackDepartmentId, fallbackAssigneeId)]);
    setTimers({});
  }, [clearDraftOnMount, fallbackAssigneeId, fallbackDepartmentId]);

  useEffect(() => {
    setTimers((current) => {
      const next = { ...current };

      for (const task of tasks) {
        const timerKey = getTimerKey(task);

        if (!task.id || next[timerKey]) {
          continue;
        }

        const sharedTimer = readTaskTimerSnapshot(toDateOnly(), task.id);
        if (!sharedTimer) {
          continue;
        }

        next[timerKey] = {
          elapsedSeconds: Number(sharedTimer.trackedMinutes || 0) * 60,
          runningSince:
            sharedTimer.runningStartedAt
              ? new Date(sharedTimer.runningStartedAt).getTime()
              : sharedTimer.status === "in_progress" && sharedTimer.actualStart && !sharedTimer.actualEnd
                ? new Date(sharedTimer.actualStart).getTime()
                : null,
          actualStart: sharedTimer.actualStart,
          actualEnd: sharedTimer.actualEnd,
        };
      }

      return next;
    });
  }, [tasks]);

  useEffect(() => {
    if (typeof window === "undefined") {
      return;
    }

    window.localStorage.setItem(
      PLAN_DRAFT_STORAGE_KEY,
      JSON.stringify({
        tasks,
        timers,
      } satisfies DraftSnapshot),
    );
  }, [tasks, timers]);

  function updateTask(index: number, key: keyof Task, value: string) {
    setTasks((current) =>
      current.map((task, taskIndex) => (taskIndex === index ? { ...task, [key]: value } : task)),
    );
  }

  function addBlankTask() {
    const nextTask = makeTask(tasks[0]?.departmentId || fallbackDepartmentId, tasks[0]?.assigneeId || fallbackAssigneeId);
    setTasks((current) => [...current, nextTask]);
  }

  function addSuggestedTask(suggestion: Suggestion) {
    setTasks((current) => [
      ...current,
      {
        clientId: crypto.randomUUID(),
        taskTitle: suggestion.title,
        taskDescription: suggestion.description,
        priority: suggestion.priority,
        departmentId: current[0]?.departmentId || fallbackDepartmentId,
        assigneeId: current[0]?.assigneeId || fallbackAssigneeId,
      },
    ]);
    setLastSuggestedTitle(suggestion.title);
    toast.success(`Added to editable plan form: ${suggestion.title}`);
  }

  function addRecurringTask(template: RecurringTemplate) {
    setTasks((current) => [
      ...current,
      {
        clientId: crypto.randomUUID(),
        taskTitle: template.taskTitle,
        taskDescription: template.taskDescription,
        priority: template.priority,
        departmentId: template.departmentId === OTHER_DEPARTMENT_ID ? fallbackDepartmentId : template.departmentId || fallbackDepartmentId,
        assigneeId: fallbackAssigneeId,
      },
    ]);
    toast.success(`Added recurring task: ${template.taskTitle}`);
  }

  function currentTrackedSeconds(task: Task) {
    const timer = timers[getTimerKey(task)];
    if (!timer) {
      return 0;
    }

    if (!timer.runningSince) {
      return timer.elapsedSeconds;
    }

    return timer.elapsedSeconds + Math.max(0, Math.floor((now - timer.runningSince) / 1000));
  }

  function startTimer(task: Task) {
    if (!task.taskTitle.trim()) {
      toast.error("Write the task title first, then start the timer.");
      return;
    }

    const timerKey = getTimerKey(task);
    const actualStart = timers[timerKey]?.actualStart || toDateTimeInputValue(new Date());

    setTimers((current) => {
      const nextTimer = {
        elapsedSeconds: current[timerKey]?.elapsedSeconds ?? 0,
        runningSince: Date.now(),
        actualStart,
        actualEnd: "",
      };

      mirrorSharedPlanTimer(task, nextTimer);

      return {
        ...current,
        [timerKey]: nextTimer,
      };
    });
  }

  function pauseTimer(task: Task) {
    const timerKey = getTimerKey(task);

    setTimers((current) => {
      const timer = current[timerKey];
      if (!timer?.runningSince) {
        return current;
      }

      const nextTimer = {
        elapsedSeconds: timer.elapsedSeconds + Math.max(0, Math.floor((Date.now() - timer.runningSince) / 1000)),
        runningSince: null,
        actualStart: timer.actualStart,
        actualEnd: timer.actualEnd,
      };

      mirrorSharedPlanTimer(task, nextTimer);

      return {
        ...current,
        [timerKey]: nextTimer,
      };
    });
  }

  function stopTimer(task: Task) {
    const timerKey = getTimerKey(task);

    setTimers((current) => {
      const timer = current[timerKey];
      const elapsedSeconds =
        (timer?.elapsedSeconds ?? 0) +
        (timer?.runningSince ? Math.max(0, Math.floor((Date.now() - timer.runningSince) / 1000)) : 0);

      const nextTimer = {
        elapsedSeconds,
        runningSince: null,
        actualStart: timer?.actualStart || toDateTimeInputValue(new Date()),
        actualEnd: toDateTimeInputValue(new Date()),
      };

      mirrorSharedPlanTimer(task, nextTimer);

      return {
        ...current,
        [timerKey]: nextTimer,
      };
    });
  }

  function resetTimer(task: Task) {
    const timerKey = getTimerKey(task);

    setTimers((current) => {
      const nextTimer = {
        elapsedSeconds: 0,
        runningSince: null,
        actualStart: "",
        actualEnd: "",
      };

      mirrorSharedPlanTimer(task, nextTimer);

      return {
        ...current,
        [timerKey]: nextTimer,
      };
    });
  }

  async function save() {
    setLoading(true);
    const taskSnapshot = tasks.map((task) => ({
      ...task,
      timer: timers[getTimerKey(task)] ?? {
        elapsedSeconds: 0,
        runningSince: null,
        actualStart: "",
        actualEnd: "",
      },
    }));

    const response = await fetch("/api/dashboard/plan", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        planDate: new Date().toISOString(),
        tasks: tasks.map((task) => ({
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
    const createdTasks = Array.isArray(result.tasks) ? result.tasks : [];

    if (createdTasks.length) {
      const reportUpdates = createdTasks
        .map((createdTask: { id: string }, index: number) => {
          const source = taskSnapshot[index];
          if (!source) {
            return null;
          }

          const timer = source.timer;
          const trackedSeconds =
            timer.elapsedSeconds +
            (timer.runningSince ? Math.max(0, Math.floor((Date.now() - timer.runningSince) / 1000)) : 0);
          const trackedMinutes = Math.floor(trackedSeconds / 60);
          const isRunning = Boolean(timer.runningSince);
          const hasTimerData = trackedMinutes > 0 || Boolean(timer.actualStart);

          writeTaskTimerSnapshot(toDateOnly(), createdTask.id, {
            status: isRunning ? "in_progress" : "pending",
            trackedMinutes: String(trackedMinutes),
            actualStart: timer.actualStart,
            actualEnd: timer.actualEnd,
            runningStartedAt: timer.runningSince ? new Date(timer.runningSince).toISOString() : "",
          });

          if (!hasTimerData) {
            return null;
          }

          return {
            dailyTaskId: createdTask.id,
            status: isRunning ? "in_progress" : "pending",
            note: "",
            completionPercent: 0,
            trackedMinutes,
            actualStart: timer.actualStart,
            actualEnd: timer.actualEnd,
            difficultyLevel: "",
          };
        })
        .filter(
          (
            item: {
              dailyTaskId: string;
              status: "done" | "in_progress" | "pending";
              note: string;
              completionPercent: number;
              trackedMinutes: number;
              actualStart: string;
              actualEnd: string;
              difficultyLevel: string;
            } | null,
          ): item is {
            dailyTaskId: string;
            status: "done" | "in_progress" | "pending";
            note: string;
            completionPercent: number;
            trackedMinutes: number;
            actualStart: string;
            actualEnd: string;
            difficultyLevel: string;
          } => Boolean(item),
        );

      if (reportUpdates.length) {
        await fetch("/api/dashboard/report", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            reportDate: toDateOnly(),
            updates: reportUpdates,
          }),
        });
      }
    }

    setTasks([makeTask(fallbackDepartmentId, fallbackAssigneeId)]);
    setTimers({});
    if (typeof window !== "undefined") {
      window.localStorage.removeItem(PLAN_DRAFT_STORAGE_KEY);
    }
    router.refresh();
    onSaved?.();
  }

  return (
    <div className="space-y-5">
      <Card>
        <CardHeader className="pb-4">
          <div className="flex flex-wrap items-start justify-between gap-4">
            <div>
              <CardTitle>Today&apos;s Recurring Suggestions</CardTitle>
              <p className="mt-2 text-sm text-[var(--muted-foreground)]">
                Tasks scheduled for today from your recurring setup. Click once to add them into today&apos;s plan.
              </p>
            </div>
            <Link className="text-sm font-semibold text-[#4f5ef7] hover:text-[#3f4ede]" href="/dashboard/recurring">
              Manage Recurring
            </Link>
          </div>
        </CardHeader>
        <CardContent>
          {recurringSuggestions.length ? (
            <div className="grid gap-3 xl:grid-cols-2">
              {recurringSuggestions.map((template, index) => (
                <div key={template.id} className="rounded-2xl border border-[var(--panel-border)] bg-[var(--panel-muted)] p-4">
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <p className="truncate text-sm font-semibold text-[var(--foreground)]">
                        {index + 1}. {template.taskTitle}
                      </p>
                      <p className="mt-1 text-sm text-[var(--muted-foreground)]">{template.taskDescription || "No extra description saved."}</p>
                      <div className="mt-2 flex flex-wrap gap-2 text-xs font-semibold">
                        <span className="rounded-full bg-blue-50 px-2.5 py-1 text-blue-700">{template.priority}</span>
                        <span className="rounded-full bg-amber-50 px-2.5 py-1 text-amber-700">
                          {template.departmentId === OTHER_DEPARTMENT_ID
                            ? "Other"
                            : departments.find((department) => department.id === template.departmentId)?.name ?? activeDepartmentName}
                        </span>
                        <span className="rounded-full bg-emerald-50 px-2.5 py-1 text-emerald-700">{describeRecurringTemplate(template)}</span>
                        <span
                          className={`rounded-full px-2.5 py-1 ${
                            isRecurringTemplateDueToday(template)
                              ? "bg-blue-50 text-blue-700"
                              : "bg-slate-100 text-slate-600"
                          }`}
                        >
                          {isRecurringTemplateDueToday(template) ? "Today" : "Upcoming"}
                        </span>
                      </div>
                    </div>
                    <Button className="button-force-white shrink-0 bg-[#4f5ef7] hover:bg-[#4453eb]" onClick={() => addRecurringTask(template)} type="button">
                      Add
                    </Button>
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <div className="rounded-2xl border border-dashed border-[var(--panel-border)] bg-[var(--panel-muted)] p-5 text-sm text-[var(--muted-foreground)]">
              No recurring task is scheduled to show today. You can set daily, weekly, or monthly recurrence from the recurring page.
            </div>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="pb-4">
          <div className="flex flex-wrap items-start justify-between gap-4">
            <div>
              <CardTitle className="flex items-center gap-2">
                <WandSparkles className="h-5 w-5 text-cyan-300" />
                Suggested Tasks For {activeDepartmentName}
              </CardTitle>
              <p className="mt-2 text-sm text-[var(--muted-foreground)]">
                Smart ideas for your department. Expand only when you want quick task suggestions.
              </p>
            </div>
            <Button
              className={showSuggestions ? "button-force-white bg-[#4f5ef7] hover:bg-[#4453eb]" : undefined}
              onClick={() => setShowSuggestions((current) => !current)}
              type="button"
              variant={showSuggestions ? "default" : "secondary"}
            >
              {showSuggestions ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
              {showSuggestions ? "Hide Suggestions" : "Suggest Work"}
            </Button>
          </div>
        </CardHeader>
        {showSuggestions ? (
          <CardContent>
            <div className="mb-4 flex justify-end">
              <Button
                aria-label="Collapse suggested tasks"
                className="h-10 w-10 rounded-xl"
                onClick={() => setShowSuggestions(false)}
                size="icon"
                type="button"
                variant="ghost"
              >
                <X className="h-4 w-4" />
              </Button>
            </div>
            <div className="grid gap-3 xl:grid-cols-2">
              {suggestions.length ? (
                suggestions.map((suggestion) => (
                  <button
                    key={`${suggestion.source}-${suggestion.title}`}
                    className="rounded-2xl border border-[var(--panel-border)] bg-[var(--panel-muted)] p-3 text-left transition-colors hover:border-cyan-400/40 hover:bg-[var(--panel)]"
                    onClick={() => addSuggestedTask(suggestion)}
                    type="button"
                  >
                    <div className="flex items-start justify-between gap-3">
                      <div>
                        <p className="font-semibold text-[var(--foreground)]">{suggestion.title}</p>
                        <p className="mt-1 text-sm leading-5 text-[var(--muted-foreground)]">{suggestion.description}</p>
                      </div>
                      <Sparkles className="mt-1 h-4 w-4 shrink-0 text-cyan-300" />
                    </div>
                    <div className="mt-3 flex flex-wrap items-center justify-between gap-2 text-xs">
                      <div className="flex flex-wrap items-center gap-2">
                        <span className="rounded-full bg-cyan-400/10 px-2.5 py-1 font-medium uppercase tracking-[0.18em] text-cyan-300">
                          {suggestion.priority}
                        </span>
                        {lastSuggestedTitle === suggestion.title ? (
                          <span className="rounded-full bg-emerald-400/10 px-2.5 py-1 font-medium text-emerald-300">
                            Added below
                          </span>
                        ) : (
                          <span className="rounded-full bg-[var(--panel)] px-2.5 py-1 font-medium text-[var(--muted-foreground)]">
                            Click to add
                          </span>
                        )}
                      </div>
                      <span className="text-[var(--muted-foreground)]">{suggestion.source}</span>
                    </div>
                  </button>
                ))
              ) : (
                <div className="rounded-2xl border border-dashed border-[var(--panel-border)] bg-[var(--panel-muted)] p-5 text-sm text-[var(--muted-foreground)]">
                  No smart suggestion found yet. Save a few daily plans and this panel will start predicting stronger quick tasks for your department.
                </div>
              )}
            </div>
          </CardContent>
        ) : null}
      </Card>

      <Card>
        <CardHeader className="flex-row items-center justify-between">
          <div>
            <CardTitle>Morning Work Plan</CardTitle>
            <p className="text-sm text-[var(--muted-foreground)]">
              Your department is auto-selected from account information, but you can still change it for any task.
            </p>
          </div>
          <Button className="button-force-white bg-[#4f5ef7] hover:bg-[#4453eb]" onClick={addBlankTask} type="button" variant="default">
            <Plus className="h-4 w-4" /> Add Task
          </Button>
        </CardHeader>
          <CardContent className="space-y-4">
            {tasks.map((task, index) => (
            <div key={task.clientId} className="rounded-2xl border border-[var(--panel-border)] bg-[var(--panel-muted)] p-4">
              {(() => {
                const hasTaskTitle = task.taskTitle.trim().length > 0;
                return (
                  <>
                <div className="grid gap-4 md:grid-cols-2">
                  <div>
                    <Label>Task Title</Label>
                  <Input
                    placeholder="Enter task title"
                    value={task.taskTitle}
                    onChange={(event) => updateTask(index, "taskTitle", event.target.value)}
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
                      {departments.map((department) => (
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
                      {["low", "normal", "high", "critical"].map((priority) => (
                        <SelectItem key={priority} value={priority}>
                          {priority}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                  <div className="flex flex-wrap items-end justify-end gap-2">
                    {timers[getTimerKey(task)]?.runningSince ? (
                      <Button
                        className="button-force-white bg-amber-500 hover:bg-amber-600"
                        disabled={!hasTaskTitle}
                        onClick={() => pauseTimer(task)}
                        type="button"
                        variant="default"
                    >
                      <Pause className="h-4 w-4" /> Pause
                    </Button>
                    ) : (
                      <Button
                        className="button-force-white bg-[#19a46b] hover:bg-[#15885a]"
                        disabled={!hasTaskTitle}
                        onClick={() => startTimer(task)}
                        type="button"
                        variant="default"
                    >
                      <Play className="h-4 w-4" /> Start
                    </Button>
                  )}
                  <Button
                    className="button-force-white bg-slate-500 hover:bg-slate-600"
                    onClick={() => resetTimer(task)}
                    type="button"
                    variant="default"
                  >
                    <RotateCcw className="h-4 w-4" /> Reset
                  </Button>
                  <Button
                    className="button-force-white bg-slate-900 hover:bg-slate-800"
                    disabled={!hasTaskTitle}
                      onClick={() => stopTimer(task)}
                      type="button"
                      variant="default"
                    >
                      <Square className="h-4 w-4" /> Stop
                  </Button>
                  <Button
                    className="button-force-white bg-rose-500 hover:bg-rose-600"
                    onClick={() => {
                        setTasks((current) => current.filter((_, taskIndex) => taskIndex !== index));
                        setTimers((current) => {
                          const next = { ...current };
                          delete next[getTimerKey(task)];
                          return next;
                        });
                    }}
                    type="button"
                    variant="default"
                  >
                    <Trash2 className="h-4 w-4" /> Remove
                  </Button>
                </div>
              </div>
              <div className="mt-4 rounded-2xl border border-[var(--panel-border)] bg-[var(--panel)] px-4 py-3 text-sm font-semibold text-[var(--foreground)]">
                Time Tracked: <span className="ml-2 text-[#315fe6]">{formatElapsedDuration(currentTrackedSeconds(task))}</span>
                  <span className="ml-4 text-[var(--muted-foreground)]">
                  {timers[getTimerKey(task)]?.actualStart
                    ? `Started ${new Date(timers[getTimerKey(task)].actualStart).toLocaleTimeString("en-BD", { hour: "numeric", minute: "2-digit" })}`
                    : "Not started yet"}
                  </span>
              </div>
                <div className="mt-4">
                  <Label>Description</Label>
                  <Textarea
                    placeholder="Add a short task description"
                    value={task.taskDescription}
                    onChange={(event) => updateTask(index, "taskDescription", event.target.value)}
                  />
                </div>
                  </>
                );
              })()}
              </div>
            ))}
          <Button className="button-force-white w-full" disabled={loading} onClick={save} type="button">
            {loading ? "Saving plan..." : "Add To Today's Plan"}
          </Button>
        </CardContent>
      </Card>
    </div>
  );
}
