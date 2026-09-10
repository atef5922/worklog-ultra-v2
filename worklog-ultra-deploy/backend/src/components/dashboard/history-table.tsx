"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { X } from "lucide-react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TBody, TD, TH, THead, TR } from "@/components/ui/table";
import { TaskManageControls } from "@/components/dashboard/task-manage-controls";
import { getTaskTimerStorageKey } from "@/lib/task-timer-storage";
import { extractContinuationMeta } from "@/lib/task-continuation";
import { Textarea } from "@/components/ui/textarea";
import { formatDateTimeInDhaka, toDateOnly } from "@/lib/utils";

type HistoryItem = {
  id: string;
  planDate: Date;
  taskTitle: string;
  taskDescription?: string | null;
  department: { name: string };
  updates: Array<{
    status: "done" | "in_progress" | "pending";
    trackedMinutes: number;
    actualStart: Date | null;
    actualEnd: Date | null;
    note?: string | null;
    completionPercent?: number;
    difficultyLevel?: string | null;
  }>;
  latestRequest: {
    id: string;
    status: "pending" | "approved" | "rejected";
    reason: string;
    reviewNote?: string | null;
  } | null;
  isToday: boolean;
  canEmployeeEdit: boolean;
  canRequestEdit: boolean;
};

type PendingRequest = {
  id: string;
  reason: string;
  reviewNote?: string | null;
  createdAt: Date;
  requestedBy: { name: string; department: { name: string } | null };
  dailyTask: {
    id: string;
    taskTitle: string;
    taskDescription?: string | null;
    planDate: Date;
    department?: { name: string } | null;
  };
};

type RequestDraft = {
  reason: string;
  startedAt: string;
  endedAt: string;
  summary: string;
  desiredStatus: "done" | "in_progress" | "pending";
};

function statusVariant(status?: "done" | "in_progress" | "pending") {
  if (status === "done") return "success";
  if (status === "pending") return "warning";
  return "purple";
}

function requestVariant(status?: "pending" | "approved" | "rejected") {
  if (status === "approved") return "success";
  if (status === "rejected") return "warning";
  return "purple";
}

function formatTimeCell(value?: Date | null) {
  return formatDateTimeInDhaka(value);
}

function getReasonSections(reason: string) {
  return reason
    .split("\n")
    .map((line) => line.trim())
    .filter(Boolean)
    .map((line) => {
      const separatorIndex = line.indexOf(":");
      if (separatorIndex === -1) {
        return { label: "Details", value: line };
      }

      return {
        label: line.slice(0, separatorIndex).trim(),
        value: line.slice(separatorIndex + 1).trim(),
      };
    });
}

function parseActionResponse(raw: string) {
  try {
    return raw ? JSON.parse(raw) : { message: "Action failed." };
  } catch {
    return { message: "The server returned an unexpected response." };
  }
}

export function HistoryTable({
  history,
  role,
  pendingApprovals,
  mode = "history",
  initialTaskId,
  initialRequestId,
}: {
  history: HistoryItem[];
  role: "employee" | "hr" | "manager" | "admin";
  pendingApprovals: PendingRequest[];
  mode?: "history" | "requests";
  initialTaskId?: string;
  initialRequestId?: string;
}) {
  const router = useRouter();
  const [requestDrafts, setRequestDrafts] = useState<Record<string, RequestDraft>>({});
  const [reviewNotes, setReviewNotes] = useState<Record<string, string>>({});
  const [loadingId, setLoadingId] = useState<string | null>(null);
  const [selectedTask, setSelectedTask] = useState<HistoryItem | null>(null);
  const [selectedRequest, setSelectedRequest] = useState<PendingRequest | null>(null);

  const visibleHistory = useMemo(() => {
    return history;
  }, [history, mode, role]);

  useEffect(() => {
    if (initialRequestId) {
      const matchingRequest = pendingApprovals.find((request) => request.id === initialRequestId);
      if (matchingRequest) {
        setSelectedRequest(matchingRequest);
        return;
      }
    }

    if (initialTaskId) {
      const matchingTask = history.find((task) => task.id === initialTaskId);
      if (matchingTask) {
        setSelectedTask(matchingTask);
      }
    }
  }, [history, initialRequestId, initialTaskId, pendingApprovals]);

  function getDraft(taskId: string): RequestDraft {
    return (
      requestDrafts[taskId] ?? {
        reason: "",
        startedAt: "",
        endedAt: "",
        summary: "",
        desiredStatus: "done",
      }
    );
  }

  function patchDraft(taskId: string, key: keyof RequestDraft, value: string) {
    setRequestDrafts((current) => ({
      ...current,
      [taskId]: {
        ...getDraft(taskId),
        [key]: value as RequestDraft[keyof RequestDraft],
      },
    }));
  }

  async function submitRequest(taskId: string) {
    const draft = getDraft(taskId);
    const reason = draft.reason.trim();

    if (!reason) {
      toast.error("Explain clearly why you missed the report and what you need to edit.");
      return;
    }

    const formattedReason = [
      `Reason: ${reason}`,
      `Requested Status Change: ${draft.desiredStatus}`,
      draft.startedAt ? `Remembered Start Time: ${draft.startedAt}` : null,
      draft.endedAt ? `Remembered End Time: ${draft.endedAt}` : null,
      draft.summary.trim() ? `Work Summary: ${draft.summary.trim()}` : null,
    ]
      .filter(Boolean)
      .join("\n");

    setLoadingId(taskId);
    const response = await fetch("/api/dashboard/report-edit-requests", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ dailyTaskId: taskId, reason: formattedReason }),
    });
    const result = await response.json();
    setLoadingId(null);

    if (!response.ok) {
      toast.error(result.message);
      return;
    }

    toast.success(result.message);
    setRequestDrafts((current) => ({
      ...current,
      [taskId]: {
        reason: "",
        startedAt: "",
        endedAt: "",
        summary: "",
        desiredStatus: "done",
      },
    }));
    setSelectedTask(null);
    router.refresh();
  }

  async function reviewRequest(requestId: string, decision: "approved" | "rejected") {
    setLoadingId(requestId);
    const response = await fetch(`/api/dashboard/report-edit-requests/${requestId}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        decision,
        reviewNote: reviewNotes[requestId] ?? "",
      }),
    });
    const result = await response.json();
    setLoadingId(null);

    if (!response.ok) {
      toast.error(result.message);
      return;
    }

    toast.success(result.message);
    setReviewNotes((current) => ({ ...current, [requestId]: "" }));
    setSelectedRequest(null);
    router.refresh();
  }

  async function restoreTaskToDashboard(task: HistoryItem, options?: { autoStart?: boolean }) {
    setLoadingId(task.id);
    const response = await fetch(`/api/dashboard/tasks/${task.id}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action: "restore_to_dashboard" }),
    });
    const raw = await response.text();
    const result = parseActionResponse(raw) as { message?: string; taskId?: string; reportDate?: string };
    setLoadingId(null);

    if (!response.ok) {
      toast.error(result.message ?? "Task could not be restored.");
      return;
    }

    if (typeof window !== "undefined" && result.taskId && result.reportDate) {
      window.localStorage.removeItem(getTaskTimerStorageKey(result.reportDate, result.taskId));
      if (options?.autoStart) {
        window.sessionStorage.setItem(
          "dashboard-task-autostart",
          JSON.stringify({
            taskId: result.taskId,
            reportDate: result.reportDate,
            timestamp: Date.now(),
          }),
        );
      }
    }

    toast.success(options?.autoStart ? "Task moved to dashboard and ready to resume." : result.message ?? "Task returned to dashboard.");
    setSelectedTask(null);
    router.push("/dashboard");
    router.refresh();
  }

  function renderAction(task: HistoryItem) {
    const reportDate = toDateOnly(task.planDate);

    return (
      <div className="flex flex-wrap gap-2">
        <Button onClick={() => setSelectedTask(task)} size="sm" variant="secondary">
          View Details
        </Button>
        <Link href={`/dashboard/report?date=${reportDate}&taskId=${task.id}`}>
          <Button size="sm" variant="outline">
            Open Editor
          </Button>
        </Link>
        <Button disabled={loadingId === task.id} onClick={() => restoreTaskToDashboard(task, { autoStart: true })} size="sm" variant="outline">
          Return To Dashboard
        </Button>
        <TaskManageControls
          compact
          task={{
            id: task.id,
            taskTitle: task.taskTitle,
            taskDescription: task.taskDescription,
            priority: (task as { priority?: "low" | "normal" | "high" | "critical" }).priority ?? "normal",
          }}
        />
      </div>
    );
  }

  const selectedTaskDraft = selectedTask ? getDraft(selectedTask.id) : null;
  const selectedTaskReasonSections = selectedTask?.latestRequest ? getReasonSections(selectedTask.latestRequest.reason) : [];
  const selectedRequestReasonSections = selectedRequest ? getReasonSections(selectedRequest.reason) : [];

  return (
    <div className="space-y-5">
      {!(mode === "requests" && role === "manager") ? (
        <div className="overflow-x-auto">
          <Table>
            <THead>
              <TR>
                <TH>Date</TH>
                <TH>Task</TH>
                <TH>Department</TH>
                <TH>Status</TH>
                <TH>Started</TH>
                <TH>Ended</TH>
                <TH>Tracked</TH>
                <TH>Action</TH>
              </TR>
            </THead>
            <TBody>
              {visibleHistory.map((task) => {
                const latestStatus = task.updates[0]?.status;

                return (
                  <TR key={task.id} className="align-top">
                    <TD>{toDateOnly(task.planDate)}</TD>
                    <TD className="space-y-2">
                      <div>{task.taskTitle}</div>
                      {extractContinuationMeta(task.taskDescription) ? (
                        <div className="flex flex-wrap items-center gap-2">
                          <Badge variant="purple">Continued</Badge>
                          <span className="text-xs text-[var(--muted-foreground)]">
                            From {extractContinuationMeta(task.taskDescription)?.sourceDate}
                          </span>
                        </div>
                      ) : null}
                    </TD>
                    <TD>{task.department.name}</TD>
                    <TD>
                      <Badge variant={statusVariant(latestStatus)}>{latestStatus ?? "planned"}</Badge>
                    </TD>
                    <TD>{formatTimeCell(task.updates[0]?.actualStart)}</TD>
                    <TD>{formatTimeCell(task.updates[0]?.actualEnd)}</TD>
                    <TD>{task.updates[0]?.trackedMinutes ?? 0} min</TD>
                    <TD className="min-w-[220px]">{renderAction(task)}</TD>
                  </TR>
                );
              })}
            </TBody>
          </Table>
        </div>
      ) : null}

      {selectedTask ? (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/75 p-4 backdrop-blur-sm">
          <div className="w-full max-w-3xl rounded-3xl border border-[var(--panel-border)] bg-[var(--panel)] shadow-2xl">
            <div className="flex items-start justify-between gap-4 border-b border-[var(--panel-border)] px-6 py-5">
              <div>
                <p className="text-xs uppercase tracking-[0.24em] text-cyan-300">
                  {mode === "requests" ? "Request Details" : "Report Preview"}
                </p>
                <h3 className="mt-2 text-2xl font-semibold text-white">{selectedTask.taskTitle}</h3>
                <p className="mt-1 text-sm text-[var(--muted-foreground)]">
                  {selectedTask.department.name} - {toDateOnly(selectedTask.planDate)}
                </p>
              </div>
              <Button onClick={() => setSelectedTask(null)} size="icon" type="button" variant="ghost">
                <X className="h-5 w-5" />
              </Button>
            </div>
            <div className="space-y-5 px-6 py-6">
              <div className="grid gap-4 md:grid-cols-4">
                <div className="rounded-2xl border border-[var(--panel-border)] bg-[var(--panel-muted)] p-4">
                  <p className="text-xs uppercase tracking-[0.18em] text-[var(--muted-foreground)]">Status</p>
                  <div className="mt-2">
                    <Badge variant={statusVariant(selectedTask.updates[0]?.status)}>
                      {selectedTask.updates[0]?.status ?? "planned"}
                    </Badge>
                  </div>
                </div>
                <div className="rounded-2xl border border-[var(--panel-border)] bg-[var(--panel-muted)] p-4">
                  <p className="text-xs uppercase tracking-[0.18em] text-[var(--muted-foreground)]">Tracked</p>
                  <p className="mt-2 text-lg font-semibold text-white">{selectedTask.updates[0]?.trackedMinutes ?? 0} min</p>
                </div>
                <div className="rounded-2xl border border-[var(--panel-border)] bg-[var(--panel-muted)] p-4">
                  <p className="text-xs uppercase tracking-[0.18em] text-[var(--muted-foreground)]">Started</p>
                  <p className="mt-2 text-sm text-white">{formatTimeCell(selectedTask.updates[0]?.actualStart)}</p>
                </div>
                <div className="rounded-2xl border border-[var(--panel-border)] bg-[var(--panel-muted)] p-4">
                  <p className="text-xs uppercase tracking-[0.18em] text-[var(--muted-foreground)]">Ended</p>
                  <p className="mt-2 text-sm text-white">{formatTimeCell(selectedTask.updates[0]?.actualEnd)}</p>
                </div>
              </div>

              <div className="grid gap-4 md:grid-cols-2">
                <div className="rounded-2xl border border-[var(--panel-border)] bg-[var(--panel-muted)] p-4">
                  <p className="text-xs uppercase tracking-[0.18em] text-[var(--muted-foreground)]">Completion</p>
                  <p className="mt-2 text-lg font-semibold text-white">{selectedTask.updates[0]?.completionPercent ?? 0}%</p>
                </div>
                <div className="rounded-2xl border border-[var(--panel-border)] bg-[var(--panel-muted)] p-4">
                  <p className="text-xs uppercase tracking-[0.18em] text-[var(--muted-foreground)]">Difficulty</p>
                  <p className="mt-2 text-lg font-semibold text-white">{selectedTask.updates[0]?.difficultyLevel || "Not set"}</p>
                </div>
              </div>

              <div className="rounded-2xl border border-[var(--panel-border)] bg-[var(--panel-muted)] p-4">
                <p className="text-xs uppercase tracking-[0.18em] text-[var(--muted-foreground)]">Work Note</p>
                <p className="mt-2 whitespace-pre-line text-sm leading-6 text-white/90">
                  {selectedTask.updates[0]?.note || "No extra note added for this report."}
                </p>
              </div>

              {extractContinuationMeta(selectedTask.taskDescription) ? (
                <div className="rounded-2xl border border-violet-400/30 bg-violet-500/10 p-4">
                  <p className="text-xs uppercase tracking-[0.18em] text-violet-200">Continuation</p>
                  <div className="mt-2 space-y-2 text-sm text-white/90">
                    <p>From: {extractContinuationMeta(selectedTask.taskDescription)?.sourceDate || "Previous day"}</p>
                    <p>Days Active: {extractContinuationMeta(selectedTask.taskDescription)?.daysActive || 1}</p>
                    <p>Progress: {extractContinuationMeta(selectedTask.taskDescription)?.progressLabel || "Not set"}</p>
                    <p>Time Logged: {extractContinuationMeta(selectedTask.taskDescription)?.timeLabel || "Not set"}</p>
                    {extractContinuationMeta(selectedTask.taskDescription)?.note ? (
                      <p className="whitespace-pre-line">Last Note: {extractContinuationMeta(selectedTask.taskDescription)?.note}</p>
                    ) : null}
                    {extractContinuationMeta(selectedTask.taskDescription)?.dailyLogs?.length ? (
                      <div className="rounded-2xl border border-violet-300/20 bg-slate-950/20 p-3">
                        <p className="text-xs uppercase tracking-[0.18em] text-violet-100">Daily Work Log</p>
                        <div className="mt-2 space-y-2">
                          {extractContinuationMeta(selectedTask.taskDescription)?.dailyLogs.map((entry) => (
                            <div className="flex flex-wrap items-center gap-2 text-xs text-white/85" key={`${selectedTask.id}-${entry.date}`}>
                              <span className="rounded-full bg-white/10 px-2 py-1">{entry.date}</span>
                              <span>{entry.progress}% done</span>
                              <span>{entry.trackedMinutes} min</span>
                              {entry.note ? <span className="text-white/70">Note: {entry.note}</span> : null}
                            </div>
                          ))}
                        </div>
                      </div>
                    ) : null}
                  </div>
                </div>
              ) : null}

              <div className="flex flex-wrap justify-end gap-3">
                <Button disabled={loadingId === selectedTask.id} onClick={() => restoreTaskToDashboard(selectedTask, { autoStart: true })} size="sm" variant="outline">
                  Resume On Dashboard
                </Button>
                <TaskManageControls
                  task={{
                    id: selectedTask.id,
                    taskTitle: selectedTask.taskTitle,
                    taskDescription: selectedTask.taskDescription,
                    priority: (selectedTask as { priority?: "low" | "normal" | "high" | "critical" }).priority ?? "normal",
                  }}
                />
                <Link href={`/dashboard/report?date=${toDateOnly(selectedTask.planDate)}&taskId=${selectedTask.id}`}>
                  <Button size="sm" variant="secondary">
                    Open Full Editor
                  </Button>
                </Link>
                <Button onClick={() => setSelectedTask(null)} size="sm" type="button">
                  Close
                </Button>
              </div>
            </div>
          </div>
        </div>
      ) : null}

      {selectedRequest ? (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/75 p-4 backdrop-blur-sm">
          <div className="w-full max-w-3xl rounded-3xl border border-[var(--panel-border)] bg-[var(--panel)] shadow-2xl">
            <div className="flex items-start justify-between gap-4 border-b border-[var(--panel-border)] px-6 py-5">
              <div>
                <p className="text-xs uppercase tracking-[0.24em] text-cyan-300">Pending Approval</p>
                <h3 className="mt-2 text-2xl font-semibold text-white">{selectedRequest.dailyTask.taskTitle}</h3>
                <p className="mt-1 text-sm text-[var(--muted-foreground)]">
                  {selectedRequest.requestedBy.name} - {selectedRequest.requestedBy.department?.name ?? "No department"} - {toDateOnly(selectedRequest.dailyTask.planDate)}
                </p>
              </div>
              <Button onClick={() => setSelectedRequest(null)} size="icon" type="button" variant="ghost">
                <X className="h-5 w-5" />
              </Button>
            </div>
            <div className="space-y-5 px-6 py-6">
              <div className="rounded-2xl border border-[var(--panel-border)] bg-[var(--panel-muted)] p-4">
                <p className="text-xs uppercase tracking-[0.18em] text-[var(--muted-foreground)]">Employee Request</p>
                <div className="mt-3 space-y-3">
                  {selectedRequestReasonSections.map((section, index) => (
                    <div key={`${section.label}-${index}`}>
                      <p className="text-xs uppercase tracking-[0.18em] text-[var(--muted-foreground)]">{section.label}</p>
                      <p className="mt-1 whitespace-pre-line text-sm text-white/90">{section.value}</p>
                    </div>
                  ))}
                </div>
              </div>
              <Textarea
                placeholder="Optional note for the employee. Example: approved, update final time carefully."
                value={reviewNotes[selectedRequest.id] ?? ""}
                onChange={(event) => setReviewNotes((current) => ({ ...current, [selectedRequest.id]: event.target.value }))}
              />
              <div className="flex flex-wrap justify-end gap-2">
                <Button
                  disabled={loadingId === selectedRequest.id}
                  onClick={() => reviewRequest(selectedRequest.id, "approved")}
                  size="sm"
                  type="button"
                >
                  Approve
                </Button>
                <Button
                  disabled={loadingId === selectedRequest.id}
                  onClick={() => reviewRequest(selectedRequest.id, "rejected")}
                  size="sm"
                  type="button"
                  variant="outline"
                >
                  Reject
                </Button>
              </div>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}
