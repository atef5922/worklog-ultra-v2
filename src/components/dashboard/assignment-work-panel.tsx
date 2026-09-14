"use client";

import { useCallback, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { DashboardTaskTimerAction, type TaskTimerSnapshot } from "./dashboard-task-timer-action";
import { TaskCompleteModal, type TaskCompletionPayload } from "./task-complete-modal";
import { TaskReopenModal } from "./task-reopen-modal";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { completePersonalTask, reopenPersonalTask, requestTaskJson, savePersonalTimer, timerAtSave, type ConfirmedTaskUpdate } from "@/lib/task-workflow-client";
import { toDateOnly } from "@/lib/utils";

type AssignmentWorkTask = {
  id: string; taskTitle: string; planDate: Date | string;
  updates: Array<{ status: "pending" | "in_progress" | "done"; note: string | null; trackedMinutes: number;
    actualStart?: Date | string | null; actualEnd?: Date | string | null; reportDate?: Date | string; updatedAt?: Date | string }>;
};
const iso = (value?: Date | string | null) => value ? new Date(value).toISOString() : null;

export function AssignmentWorkPanel({ task, attendanceRunning, initialNote, onSubmitted }: {
  task: AssignmentWorkTask; attendanceRunning: boolean; initialNote: string; onSubmitted: () => void;
}) {
  const router = useRouter();
  const reportDate = toDateOnly();
  const last = task.updates[0];
  const sameDay = last && toDateOnly(last.reportDate ?? last.actualStart ?? task.planDate) === reportDate;
  const [confirmed, setConfirmed] = useState<ConfirmedTaskUpdate>(() => ({
    reportDate, status: last?.status ?? "pending", note: last?.note ?? null,
    trackedMinutes: sameDay || last?.status === "done" ? last.trackedMinutes : 0,
    actualStart: sameDay || last?.status === "done" ? iso(last.actualStart) : null,
    actualEnd: sameDay || last?.status === "done" ? iso(last.actualEnd) : null,
  }));
  const [note, setNote] = useState(initialNote);
  const [files, setFiles] = useState<File[]>([]);
  const [busy, setBusy] = useState(false);
  const [timerSaving, setTimerSaving] = useState(false);
  const [completeOpen, setCompleteOpen] = useState(false);
  const [reopenOpen, setReopenOpen] = useState(false);
  const busyRef = useRef(false);
  const snapshotRef = useRef<TaskTimerSnapshot>({ status: confirmed.status,
    trackedMinutes: String(confirmed.trackedMinutes), trackedSeconds: String(confirmed.trackedMinutes * 60),
    actualStart: confirmed.actualStart ?? "", actualEnd: confirmed.actualEnd ?? "", runningStartedAt: "" });
  const onSnapshot = useCallback((snapshot: TaskTimerSnapshot) => { snapshotRef.current = snapshot; }, []);
  const eligible = toDateOnly(task.planDate) <= reportDate;

  async function run(action: () => Promise<void>) {
    if (busyRef.current || timerSaving) return;
    busyRef.current = true;
    setBusy(true);
    try { await action(); }
    catch (error) { toast.error(error instanceof Error ? error.message : "The task update failed. Please try again."); }
    finally { busyRef.current = false; setBusy(false); }
  }

  async function complete(payload: TaskCompletionPayload) {
    await run(async () => {
      const result = await completePersonalTask(task.id, payload.completionNote, snapshotRef.current);
      setConfirmed(result.update);
      snapshotRef.current = { ...result.snapshot, trackedSeconds: result.snapshot.trackedSeconds ?? "0" };
      setCompleteOpen(false);
      window.dispatchEvent(new CustomEvent("worklog:task-monitor-stop", { detail: { source: `task:${task.id}` } }));
      toast.success(result.message);
      router.refresh();
    });
  }

  async function reopen(reason: string) {
    await run(async () => {
      const result = await reopenPersonalTask(task.id, reason);
      setConfirmed(result.update);
      snapshotRef.current = { ...result.snapshot, trackedSeconds: result.snapshot.trackedSeconds ?? "0" };
      setReopenOpen(false);
      toast.success(result.message);
      router.refresh();
    });
  }

  async function saveWork(submit: boolean) {
    if (submit && !note.trim()) { toast.error("Add a short submission note first."); return; }
    await run(async () => {
      // Saving a progress note does not pause the timer or rewrite completed evidence.
      if (confirmed.status !== "done") {
        await savePersonalTimer(task.id, reportDate, timerAtSave(snapshotRef.current), note);
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
      onSnapshotChange={onSnapshot} onSavingChange={setTimerSaving} onDoneClick={() => setCompleteOpen(true)}
      afterDoneSlot={confirmed.status === "done" ? <Button disabled={busy} onClick={() => setReopenOpen(true)} type="button" variant="outline">Reopen</Button> : null}/>
    {!eligible && <p className="text-sm text-[var(--muted-foreground)]">This task is planned for a future workday.</p>}
    <label className="block text-sm" htmlFor={`submission-note-${task.id}`}>Submission note</label>
    <Textarea id={`submission-note-${task.id}`} rows={4} maxLength={10000} value={note} disabled={busy} onChange={event => setNote(event.target.value)} placeholder="Progress, blockers or supporting information for the reviewer"/>
    <label className="block text-sm" htmlFor={`submission-files-${task.id}`}>Supporting files (optional)</label>
    <input id={`submission-files-${task.id}`} type="file" multiple disabled={busy} onChange={event => setFiles(Array.from(event.target.files ?? []))}/>
    <div className="flex flex-wrap justify-end gap-2">
      {confirmed.status !== "done" && <Button disabled={busy || timerSaving || !eligible} onClick={() => void saveWork(false)} type="button" variant="outline">Save Work</Button>}
      <Button disabled={busy || timerSaving || !eligible} onClick={() => void saveWork(true)} type="button">{busy ? "Saving..." : "Submit for Review"}</Button>
    </div>
    <p className="text-xs text-[var(--muted-foreground)]">Submitting notes or files does not mark a task Done. Completion and review are separate actions.</p>
    <TaskCompleteModal open={completeOpen} onOpenChange={setCompleteOpen} taskTitle={task.taskTitle} saving={busy} onSave={complete}/>
    <TaskReopenModal open={reopenOpen} onOpenChange={setReopenOpen} taskTitle={task.taskTitle} completionNote={confirmed.note} actualEnd={confirmed.actualEnd} trackedMinutes={confirmed.trackedMinutes} saving={busy} onSave={reopen}/>
  </section>;
}
