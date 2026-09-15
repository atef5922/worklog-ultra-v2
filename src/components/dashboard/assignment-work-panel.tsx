"use client";

import {useServerTaskTimer, useTaskTimerIdentity} from "./task-timer-provider";
import { useCallback, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { DashboardTaskTimerAction, type TaskTimerSnapshot } from "./dashboard-task-timer-action";
import { TaskCompleteModal, type TaskCompletionPayload } from "./task-complete-modal";
import { TaskReopenModal } from "./task-reopen-modal";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { captureTaskLifecycleSnapshot, type CapturedTaskTimerSnapshot, completePersonalTask, reopenPersonalTask, requestTaskJson, savePersonalTimer, type ConfirmedTaskUpdate } from "@/lib/task-workflow-client";
import { toDateOnly } from "@/lib/utils";

type AssignmentWorkTask = {
  id: string; taskTitle: string; planDate: Date | string;
  updates: Array<{ status: "pending" | "in_progress" | "done"; note: string | null; trackedMinutes: number;
    actualStart?: Date | string | null; actualEnd?: Date | string | null; reportDate?: Date | string; updatedAt?: Date | string }>;
};
type AssignmentLifecycleDialog = {title: string; snapshot: CapturedTaskTimerSnapshot; update: ConfirmedTaskUpdate};
const iso = (value?: Date | string | null) => value ? new Date(value).toISOString() : null;

export function AssignmentWorkPanel({ task, attendanceRunning, initialNote, onSubmitted }: {
  task: AssignmentWorkTask; attendanceRunning: boolean; initialNote: string; onSubmitted: () => void;
}) {
  const router = useRouter();
  const currentUserId=useTaskTimerIdentity();
  const reportDate = toDateOnly();
  const last = task.updates[0];
  const sameDay = last && toDateOnly(last.reportDate ?? last.actualStart ?? task.planDate) === reportDate;
  const {timer, error: timerError} = useServerTaskTimer(task.id, reportDate);
  // All controls consume the same confirmed state as the timer. Keep only the
  // submission draft local so cross-tab updates never discard notes or files.
  const confirmed: ConfirmedTaskUpdate = timer ? {
    reportDate: timer.reportDate, status: timer.status,
    note: timer.note === undefined ? last?.note ?? null : timer.note,
    trackedMinutes: Math.floor(timer.trackedMilliseconds / 60000),
    actualStart: timer.actualStart, actualEnd: timer.actualEnd,
  } : {
    reportDate, status: last?.status ?? "pending", note: last?.note ?? null,
    trackedMinutes: sameDay || last?.status === "done" ? last.trackedMinutes : 0,
    actualStart: sameDay || last?.status === "done" ? iso(last.actualStart) : null,
    actualEnd: sameDay || last?.status === "done" ? iso(last.actualEnd) : null,
  };
  const workflowReady = Boolean(timer) && !timerError;
  const [note, setNote] = useState(initialNote);
  const [files, setFiles] = useState<File[]>([]);
  const [busy, setBusy] = useState(false);
  const [timerSaving, setTimerSaving] = useState(false);
  const [completeDialog, setCompleteDialog] = useState<AssignmentLifecycleDialog | null>(null);
  const [reopenDialog, setReopenDialog] = useState<AssignmentLifecycleDialog | null>(null);
  const [completionError, setCompletionError] = useState<string | null>(null);
  const [reopenError, setReopenError] = useState<string | null>(null);
  const completeOpen = Boolean(completeDialog), reopenOpen = Boolean(reopenDialog);
  const busyRef = useRef(false);
  const snapshotRef = useRef<TaskTimerSnapshot>({ status: confirmed.status,
    trackedMinutes: String(confirmed.trackedMinutes), trackedSeconds: String(confirmed.trackedMinutes * 60),
    actualStart: confirmed.actualStart ?? "", actualEnd: confirmed.actualEnd ?? "", runningStartedAt: "" });
  const onSnapshot = useCallback((snapshot: TaskTimerSnapshot) => { snapshotRef.current = snapshot; }, []);
  const eligible = toDateOnly(task.planDate) <= reportDate;

  function openLifecycleDialog(action: "complete" | "reopen") {
    if (!workflowReady || busyRef.current || timerSaving) return;
    try {
      const snapshot = captureTaskLifecycleSnapshot(snapshotRef.current, currentUserId);
      const dialog = {title: task.taskTitle, snapshot, update: {...confirmed}};
      if (action === "complete") {setCompletionError(null); setCompleteDialog(dialog);}
      else {setReopenError(null); setReopenDialog(dialog);}
    } catch (error) {toast.error(error instanceof Error ? error.message : "Wait for the task timer to synchronize.");}
  }

  async function run(action: () => Promise<void>, onError?: (message: string) => void) {
    if (busyRef.current || timerSaving) return;
    if (!workflowReady) {
      const message = timerError ?? "Wait for the task timer to synchronize.";
      onError?.(message); toast.error(message);
      return;
    }
    busyRef.current = true;
    setBusy(true);
    try { await action(); }
    catch (error) { const message = error instanceof Error ? error.message : "The task update failed. Please try again."; onError?.(message); toast.error(message); }
    finally { busyRef.current = false; setBusy(false); }
  }

  async function complete(payload: TaskCompletionPayload) {
    if (!completeDialog) return;
    setCompletionError(null);
    await run(async () => {
      const result = await completePersonalTask(task.id, payload.completionNote, completeDialog.snapshot);
      snapshotRef.current = { ...result.snapshot, trackedSeconds: result.snapshot.trackedSeconds ?? "0" };
      setCompleteDialog(null);
      window.dispatchEvent(new CustomEvent("worklog:task-monitor-stop", { detail: { source: `task:${task.id}` } }));
      toast.success(result.message);
      router.refresh();
    }, setCompletionError);
  }

  async function reopen(reason: string) {
    if (!reopenDialog) return;
    setReopenError(null);
    await run(async () => {
      const result = await reopenPersonalTask(task.id, reason, reopenDialog.snapshot);
      snapshotRef.current = { ...result.snapshot, trackedSeconds: result.snapshot.trackedSeconds ?? "0" };
      setReopenDialog(null);
      toast.success(result.message);
      router.refresh();
    }, setReopenError);
  }

  async function saveWork(submit: boolean) {
    if (submit && !note.trim()) { toast.error("Add a short submission note first."); return; }
    await run(async () => {
      // Saving a progress note does not pause the timer or rewrite completed evidence.
      if (confirmed.status !== "done") {
        await savePersonalTimer(task.id, reportDate, snapshotRef.current, note);
      }
      if (submit) {
        const payload = new FormData();
        payload.append("action", "submit"); payload.append("note", note);
        files.forEach(file => payload.append("attachments", file));
        const result = await requestTaskJson(`/api/dashboard/assignments/${task.id}/review`, { method: "POST", body: payload });
        toast.success(result.message);
        setFiles([]);
        onSubmitted();
      } else toast.success("Work note saved. Timer state is unchanged.");
      router.refresh();
    });
  }

  return <section className="space-y-4 rounded-2xl border border-[var(--panel-border)] bg-[var(--panel-muted)] p-4" aria-label="Assignment task workflow">
    <div className="flex items-center justify-between gap-3"><h3 className="text-sm font-semibold">Task workflow</h3><span className="text-xs">{confirmed.status === "done" ? "Completed (100%)" : "Use Start / Pause, then Done when finished"}</span></div>
    <DashboardTaskTimerAction taskId={task.id} taskTitle={task.taskTitle} reportDate={reportDate}
      canEdit={eligible} workflowBusy={busy || completeOpen || reopenOpen} initialAttendanceRunning={attendanceRunning}
      initialStatus={confirmed.status} initialTrackedMinutes={confirmed.trackedMinutes}
      initialActualStart={confirmed.actualStart} initialActualEnd={confirmed.actualEnd}
      onSnapshotChange={onSnapshot} onSavingChange={setTimerSaving} onDoneClick={() => openLifecycleDialog("complete")}
      afterDoneSlot={confirmed.status === "done" ? <Button disabled={busy || timerSaving || !eligible || !workflowReady} onClick={() => openLifecycleDialog("reopen")} type="button" variant="outline">Reopen</Button> : null}/>
    {!eligible && <p className="text-sm text-[var(--muted-foreground)]">This task is planned for a future workday.</p>}
    {!workflowReady && eligible && <p role="status" className="text-sm text-[var(--muted-foreground)]">{timerError ?? "Syncing saved task state..."}</p>}
    <label className="block text-sm" htmlFor={`submission-note-${task.id}`}>Submission note</label>
    <Textarea id={`submission-note-${task.id}`} rows={4} maxLength={10000} value={note} disabled={busy} onChange={event => setNote(event.target.value)} placeholder="Progress, blockers or supporting information for the reviewer"/>
    <label className="block text-sm" htmlFor={`submission-files-${task.id}`}>Supporting files (optional)</label>
    <input id={`submission-files-${task.id}`} type="file" multiple disabled={busy} onChange={event => setFiles(Array.from(event.target.files ?? []))}/>
    <div className="flex flex-wrap justify-end gap-2">
      {confirmed.status !== "done" && <Button disabled={busy || timerSaving || !eligible || !workflowReady} onClick={() => void saveWork(false)} type="button" variant="outline">Save Work</Button>}
      <Button disabled={busy || timerSaving || !eligible || !workflowReady} onClick={() => void saveWork(true)} type="button">{busy ? "Saving..." : "Submit for Review"}</Button>
    </div>
    <p className="text-xs text-[var(--muted-foreground)]">Submitting notes or files does not mark a task Done. Completion and review are separate actions.</p>
    <TaskCompleteModal open={completeOpen} onOpenChange={open => {if (!open) setCompleteDialog(null);}} taskTitle={completeDialog?.title ?? ""} saving={busy} error={completionError} onSave={complete}/>
    <TaskReopenModal open={reopenOpen} onOpenChange={open => {if (!open) setReopenDialog(null);}} taskTitle={reopenDialog?.title ?? ""} completionNote={reopenDialog?.update.note} actualEnd={reopenDialog?.update.actualEnd} trackedMinutes={reopenDialog?.update.trackedMinutes ?? 0} saving={busy} error={reopenError} onSave={reopen}/>
  </section>;
}
