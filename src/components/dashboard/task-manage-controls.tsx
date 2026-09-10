"use client";

import * as Dialog from "@radix-ui/react-dialog";
import { Archive, CheckSquare, Pencil, RotateCcw, Trash2, X } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState, type ReactNode } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { dispatchDashboardTasksRemoved } from "@/lib/dashboard-live-events";
import { embedHistoryMeta, isMovedToHistory, stripHistoryMeta } from "@/lib/task-history-shared";
import { embedRecurringTaskDescription, isRecurringTaskDescription, stripRecurringTaskMeta } from "@/lib/recurring-task-templates";
import { TASK_PRIORITY_OPTIONS } from "@/lib/task-priority";
import { stripReopenMeta } from "@/lib/task-reopen";
import { toDateOnly } from "@/lib/utils";

const AUTO_PREDICTION_TEXT = /^Predicted from your work pattern and completion history\.?\s*/i;

function parseResponse(raw: string) {
  try {
    return raw ? JSON.parse(raw) : { message: "Task update failed." };
  } catch {
    return { message: "The server returned an unexpected response." };
  }
}

export function TaskManageControls({
  task,
  compact = false,
  hideDoneAction = false,
  showInlineDelete = false,
  showArchiveAction = false,
  showRestoreAction = false,
  timerPanel,
  onMovedToHistory,
  onRestoredToWorkPlan,
}: {
  task: {
    id: string;
    taskTitle: string;
    taskDescription?: string | null;
    priority: "low" | "normal" | "high" | "critical";
  };
  compact?: boolean;
  hideDoneAction?: boolean;
  showInlineDelete?: boolean;
  showArchiveAction?: boolean;
  /** A quick icon button that sends a completed task back to today's open work plan. */
  showRestoreAction?: boolean;
  timerPanel?: ReactNode;
  onMovedToHistory?: (taskId: string) => void;
  onRestoredToWorkPlan?: (taskId: string) => void;
}) {
  const router = useRouter();
  const [editOpen, setEditOpen] = useState(false);
  const [deleteOpen, setDeleteOpen] = useState(false);
  const [doneOpen, setDoneOpen] = useState(false);
  const [title, setTitle] = useState(task.taskTitle);
  const [description, setDescription] = useState(task.taskDescription ?? "");
  const [priority, setPriority] = useState(task.priority);
  const [saving, setSaving] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [markingDone, setMarkingDone] = useState(false);
  const [movingToHistory, setMovingToHistory] = useState(false);
  const [restoring, setRestoring] = useState(false);
  const isRecurringTask = isRecurringTaskDescription(task.taskDescription);
  const isAlreadyMovedToHistory = isMovedToHistory(task.taskDescription);
  // Soft fills, not solid colour — the same light-tint/dark-text convention
  // the chips use, so the row recedes into the card instead of shouting. Edit
  // and the two icon-only utilities (Archive, Restore) share one neutral
  // slate tone since none of them is a task "state"; Delete keeps its own
  // tone because it is the one irreversible action in the row.
  const editButtonClass =
    "task-btn-neutral h-6 shrink-0 rounded-md border px-1.5 text-[0.5rem] font-semibold transition-colors duration-200 min-[420px]:px-2 min-[420px]:text-[0.5625rem]";
  const markDoneButtonClass =
    "task-btn-primary h-6 shrink-0 rounded-md border px-1.5 text-[0.5rem] font-semibold transition-colors duration-200 disabled:opacity-55 min-[420px]:px-2 min-[420px]:text-[0.5625rem]";
  const quickMoveButtonClass =
    "task-btn-neutral h-6 w-6 shrink-0 rounded-md border p-1 transition-colors duration-200 disabled:opacity-55";
  const restoreButtonClass =
    "task-btn-neutral h-6 w-6 shrink-0 rounded-md border p-1 transition-colors duration-200 disabled:opacity-55";
  const deleteButtonClass =
    "task-btn-danger h-6 shrink-0 rounded-md border px-1.5 text-[0.5rem] font-semibold transition-colors duration-200 min-[420px]:px-2 min-[420px]:text-[0.5625rem]";

  function toEditableDescription(value?: string | null) {
    return stripHistoryMeta(stripRecurringTaskMeta(stripReopenMeta(value)))
      .replace(AUTO_PREDICTION_TEXT, "")
      .trim();
  }

  async function saveTask() {
    if (!title.trim()) {
      toast.error("Task title is required.");
      return;
    }

    setSaving(true);
    const response = await fetch(`/api/dashboard/tasks/${task.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        taskTitle: title.trim(),
        taskDescription:
          isAlreadyMovedToHistory
            ? embedHistoryMeta(
                isRecurringTask ? embedRecurringTaskDescription(description.trim()) : description.trim(),
              )
            : isRecurringTask
              ? embedRecurringTaskDescription(description.trim())
              : description.trim(),
        priority,
      }),
    });
    const raw = await response.text();
    const result = parseResponse(raw);
    setSaving(false);

    if (!response.ok) {
      toast.error(result.message);
      return;
    }

    toast.success(result.message);
    setEditOpen(false);
    router.refresh();
  }

  async function moveTaskToHistory(options?: { skipDialogClose?: boolean; silent?: boolean }) {
    const setBusy = options?.skipDialogClose ? setMovingToHistory : setMarkingDone;
    setBusy(true);
    const response = await fetch(`/api/dashboard/tasks/${task.id}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action: "move_to_history", reportDate: toDateOnly() }),
    });
    const raw = await response.text();
    const result = parseResponse(raw);
    setBusy(false);

    if (!response.ok) {
      toast.error(result.message);
      return;
    }

    if (!options?.silent) {
      toast.success(result.message);
    }

    dispatchDashboardTasksRemoved([{ id: task.id, taskTitle: task.taskTitle }]);

    if (!options?.skipDialogClose) {
      setDoneOpen(false);
    }

    onMovedToHistory?.(task.id);
    router.refresh();
  }

  async function markTaskDone() {
    await moveTaskToHistory();
  }

  async function restoreToWorkPlan() {
    setRestoring(true);
    const response = await fetch(`/api/dashboard/tasks/${task.id}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action: "restore_to_dashboard" }),
    });
    const raw = await response.text();
    const result = parseResponse(raw);
    setRestoring(false);

    if (!response.ok) {
      toast.error(result.message);
      return;
    }

    toast.success(result.message ?? "Task moved back to the work plan.");
    onRestoredToWorkPlan?.(task.id);
    router.refresh();
  }

  async function deleteTask() {
    setDeleting(true);
    const response = await fetch(`/api/dashboard/tasks/${task.id}`, {
      method: "DELETE",
    });
    const raw = await response.text();
    const result = parseResponse(raw);
    setDeleting(false);

    if (!response.ok) {
      toast.error(result.message);
      return;
    }

    toast.success(result.message);
    dispatchDashboardTasksRemoved([{ id: task.id, taskTitle: task.taskTitle }]);
    setEditOpen(false);
    router.refresh();
  }

  return (
    <div className={`flex items-center gap-1 ${compact ? "shrink-0 flex-nowrap" : "mt-2 w-full flex-wrap gap-1.5"}`}>
      <Dialog.Root
        onOpenChange={(open) => {
          setEditOpen(open);
          if (open) {
            setTitle(task.taskTitle);
            setDescription(toEditableDescription(task.taskDescription));
            setPriority(task.priority);
          }
        }}
        open={editOpen}
      >
        <Dialog.Trigger asChild>
          <Button className={editButtonClass} size="sm" type="button" variant="ghost">
            <Pencil className="h-3.5 w-3.5" />
            Edit
          </Button>
        </Dialog.Trigger>
        <Dialog.Portal>
          <Dialog.Overlay className="fixed inset-0 z-40 bg-slate-950/70 backdrop-blur-sm" />
          <Dialog.Content className="fixed left-1/2 top-1/2 z-50 w-[min(560px,92vw)] -translate-x-1/2 -translate-y-1/2 rounded-[1.75rem] border border-[var(--panel-border)] bg-[var(--panel)] shadow-2xl outline-none">
            <div className="flex items-start justify-between gap-4 border-b border-[var(--panel-border)] px-6 py-5">
              <div>
                <Dialog.Title className="text-xl font-semibold text-[var(--foreground)]">Edit task</Dialog.Title>
                <p className="mt-1 text-sm text-[var(--muted-foreground)]">Update title, note, or priority anytime.</p>
              </div>
              <Dialog.Close asChild>
                <Button size="icon" type="button" variant="ghost">
                  <X className="h-4 w-4" />
                </Button>
              </Dialog.Close>
            </div>
            <div className="space-y-4 px-6 py-6">
              <div>
                <Label>Task Title</Label>
                <Input onChange={(event) => setTitle(event.target.value)} value={title} />
              </div>
              <div>
                <Label>Priority</Label>
                <Select onValueChange={(value) => setPriority(value as typeof priority)} value={priority}>
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
              <div>
                <Label>Task Note</Label>
                <Textarea onChange={(event) => setDescription(event.target.value)} rows={5} value={description} />
              </div>
              {timerPanel ? (
                <div className="rounded-2xl border border-[var(--panel-border)] bg-[var(--panel-muted)] p-4">
                  <p className="mb-3 text-xs font-semibold uppercase tracking-[0.18em] text-[var(--muted-foreground)]">Live Timer</p>
                  {timerPanel}
                </div>
              ) : null}
            </div>
            <div className="flex items-center justify-between gap-3 border-t border-[var(--panel-border)] px-6 py-5">
              <Button
                className="text-rose-600 hover:bg-rose-50 hover:text-rose-700"
                disabled={deleting || saving}
                onClick={deleteTask}
                type="button"
                variant="outline"
              >
                {deleting ? "Deleting..." : "Delete Task"}
              </Button>
              <div className="flex items-center gap-3">
              <Dialog.Close asChild>
                <Button type="button" variant="outline">
                  Cancel
                </Button>
              </Dialog.Close>
              <Button className="button-force-white" disabled={saving} onClick={saveTask} type="button">
                {saving ? "Saving..." : "Save Changes"}
              </Button>
              </div>
            </div>
          </Dialog.Content>
        </Dialog.Portal>
      </Dialog.Root>

      {showInlineDelete ? (
        <Dialog.Root onOpenChange={setDeleteOpen} open={deleteOpen}>
          <Dialog.Trigger asChild>
            <Button
              className={deleteButtonClass}
              size="sm"
              type="button"
              variant="ghost"
            >
              <Trash2 className="h-3.5 w-3.5" />
              Delete
            </Button>
          </Dialog.Trigger>
          <Dialog.Portal>
            <Dialog.Overlay className="fixed inset-0 z-40 bg-slate-950/70 backdrop-blur-sm" />
            <Dialog.Content className="fixed left-1/2 top-1/2 z-50 w-[min(440px,92vw)] -translate-x-1/2 -translate-y-1/2 rounded-[1.75rem] border border-[var(--panel-border)] bg-[var(--panel)] shadow-2xl outline-none">
              <div className="space-y-4 px-6 py-6">
                <Dialog.Title className="text-xl font-semibold text-[var(--foreground)]">Delete task</Dialog.Title>
                <p className="text-sm text-[var(--muted-foreground)]">
                  This will permanently remove this task from your records.
                </p>
              </div>
              <div className="flex justify-end gap-3 border-t border-[var(--panel-border)] px-6 py-5">
                <Dialog.Close asChild>
                  <Button type="button" variant="outline">
                    Cancel
                  </Button>
                </Dialog.Close>
                <Button
                  className="button-force-white bg-rose-600 hover:bg-rose-700"
                  disabled={deleting}
                  onClick={async () => {
                    await deleteTask();
                    setDeleteOpen(false);
                  }}
                  type="button"
                >
                  {deleting ? "Deleting..." : "Delete"}
                </Button>
              </div>
            </Dialog.Content>
          </Dialog.Portal>
        </Dialog.Root>
      ) : null}

      {showArchiveAction && compact && !isAlreadyMovedToHistory ? (
        <Button
          aria-label="Move task to history"
          className={quickMoveButtonClass}
          disabled={movingToHistory || saving || deleting}
          onClick={() => void moveTaskToHistory({ skipDialogClose: true })}
          size="icon"
          title="Move this task to history"
          type="button"
          variant="ghost"
        >
          <Archive className="h-3.5 w-3.5" />
        </Button>
      ) : null}

      {showRestoreAction && compact ? (
        <Button
          aria-label="Move task back to today's work plan"
          className={restoreButtonClass}
          disabled={restoring}
          onClick={() => void restoreToWorkPlan()}
          size="icon"
          title="Move this task back to today's work plan"
          type="button"
          variant="ghost"
        >
          <RotateCcw className="h-3.5 w-3.5" />
        </Button>
      ) : null}

      {!hideDoneAction ? (
        <Dialog.Root onOpenChange={setDoneOpen} open={doneOpen}>
          <Dialog.Trigger asChild>
            <Button
              className={markDoneButtonClass}
              disabled={isAlreadyMovedToHistory}
              size="sm"
              variant="ghost"
              type="button"
            >
              <CheckSquare className="h-3.5 w-3.5" />
              {isAlreadyMovedToHistory ? "Done" : "Mark Done"}
            </Button>
          </Dialog.Trigger>
          <Dialog.Portal>
            <Dialog.Overlay className="fixed inset-0 z-40 bg-slate-950/70 backdrop-blur-sm" />
            <Dialog.Content className="fixed left-1/2 top-1/2 z-50 w-[min(440px,92vw)] -translate-x-1/2 -translate-y-1/2 rounded-[1.75rem] border border-[var(--panel-border)] bg-[var(--panel)] shadow-2xl outline-none">
              <div className="space-y-4 px-6 py-6">
                <Dialog.Title className="text-xl font-semibold text-[var(--foreground)]">Move task to history</Dialog.Title>
                <p className="text-sm text-[var(--muted-foreground)]">
                  This will mark the task as finished and remove it from the dashboard. All records and tracked history will stay saved.
                </p>
              </div>
              <div className="flex justify-end gap-3 border-t border-[var(--panel-border)] px-6 py-5">
                <Dialog.Close asChild>
                  <Button type="button" variant="outline">
                    Cancel
                  </Button>
                </Dialog.Close>
                <Button className="button-force-white bg-emerald-600 hover:bg-emerald-700" disabled={markingDone} onClick={markTaskDone} type="button">
                  {markingDone ? "Saving..." : "Mark As Done"}
                </Button>
              </div>
            </Dialog.Content>
          </Dialog.Portal>
        </Dialog.Root>
      ) : null}
    </div>
  );
}
