"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useMemo, useState } from "react";
import { X } from "lucide-react";
import { toast } from "sonner";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TBody, TD, TH, THead, TR } from "@/components/ui/table";
import { Textarea } from "@/components/ui/textarea";
import { formatDateTimeInDhaka, toDateOnly } from "@/lib/utils";

type HistoryItem = {
  id: string;
  planDate: Date;
  taskTitle: string;
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
  dailyTask: { taskTitle: string; planDate: Date };
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

export function HistoryTable({
  history,
  role,
  pendingApprovals,
  mode = "history",
}: {
  history: HistoryItem[];
  role: "employee" | "hr" | "manager" | "admin";
  pendingApprovals: PendingRequest[];
  mode?: "history" | "requests";
}) {
  const router = useRouter();
  const [requestDrafts, setRequestDrafts] = useState<Record<string, RequestDraft>>({});
  const [reviewNotes, setReviewNotes] = useState<Record<string, string>>({});
  const [loadingId, setLoadingId] = useState<string | null>(null);
  const [selectedTask, setSelectedTask] = useState<HistoryItem | null>(null);

  const visibleHistory = useMemo(() => {
    if (mode === "history") {
      return history;
    }

    if (role === "manager" || role === "admin") {
      return [];
    }

    return history.filter((task) => {
      const latestStatus = task.updates[0]?.status;
      const needsBackdatedAttention = !task.updates.length || latestStatus !== "done";

      return Boolean(task.latestRequest) || (!task.isToday && needsBackdatedAttention);
    });
  }, [history, mode, role]);

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
    router.refresh();
  }

  function renderAction(task: HistoryItem) {
    const reportDate = toDateOnly(task.planDate);

    if (role === "manager" || role === "admin") {
      if (mode === "history") {
        return (
          <Button onClick={() => setSelectedTask(task)} size="sm" variant="secondary">
            Open Report
          </Button>
        );
      }

      return (
        <Link href={`/dashboard/report?date=${reportDate}`}>
          <Button size="sm" variant="secondary">
            Edit Any Time
          </Button>
        </Link>
      );
    }

    if (task.canEmployeeEdit && mode === "history") {
      return <Button onClick={() => setSelectedTask(task)} size="sm" variant="secondary">Open Report</Button>;
    }

    if (task.latestRequest?.status === "approved") {
      return (
        <div className="space-y-2">
          <Badge variant="success">approved by Team Head</Badge>
          <Button onClick={() => setSelectedTask(task)} size="sm" variant="secondary">
            Open Approved Report
          </Button>
          {task.latestRequest.reviewNote ? (
            <p className="text-xs text-[var(--muted-foreground)]">{task.latestRequest.reviewNote}</p>
          ) : null}
        </div>
      );
    }

    if (task.latestRequest?.status === "pending") {
      return (
        <div className="space-y-2">
          <Badge variant="purple">waiting for approval</Badge>
          <p className="text-xs whitespace-pre-line text-[var(--muted-foreground)]">{task.latestRequest.reason}</p>
        </div>
      );
    }

    if (task.latestRequest?.status === "rejected") {
      return (
        <div className="space-y-2">
          <Badge variant="warning">request rejected</Badge>
          <p className="text-xs whitespace-pre-line text-[var(--muted-foreground)]">{task.latestRequest.reason}</p>
          {task.latestRequest.reviewNote ? (
            <p className="text-xs text-amber-300">Team Head note: {task.latestRequest.reviewNote}</p>
          ) : null}
        </div>
      );
    }

    if (!task.canRequestEdit) {
      return <span className="text-xs text-[var(--muted-foreground)]">No request needed today</span>;
    }

    const draft = getDraft(task.id);

    return (
      <div className="space-y-2">
        <Select value={draft.desiredStatus} onValueChange={(value) => patchDraft(task.id, "desiredStatus", value)}>
          <SelectTrigger>
            <SelectValue placeholder="Status you want to set later" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="done">Final Done</SelectItem>
            <SelectItem value="in_progress">Still In Progress</SelectItem>
            <SelectItem value="pending">Keep Pending</SelectItem>
          </SelectContent>
        </Select>
        <Textarea
          placeholder="Why did you miss the report, and what do you need to edit tomorrow?"
          value={draft.reason}
          onChange={(event) => patchDraft(task.id, "reason", event.target.value)}
        />
        <div className="grid gap-2 md:grid-cols-2">
          <Input type="datetime-local" value={draft.startedAt} onChange={(event) => patchDraft(task.id, "startedAt", event.target.value)} />
          <Input type="datetime-local" value={draft.endedAt} onChange={(event) => patchDraft(task.id, "endedAt", event.target.value)} />
        </div>
        <Textarea
          placeholder="Add work summary, blocker, or anything your Team Head should check before approval."
          value={draft.summary}
          onChange={(event) => patchDraft(task.id, "summary", event.target.value)}
        />
        <Button disabled={loadingId === task.id} onClick={() => submitRequest(task.id)} size="sm" type="button" variant="outline">
          {loadingId === task.id ? "Sending..." : "Send Request To Team Head"}
        </Button>
      </div>
    );
  }

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
                      {task.latestRequest ? (
                        <Badge variant={requestVariant(task.latestRequest.status)}>request {task.latestRequest.status}</Badge>
                      ) : null}
                    </TD>
                    <TD>{task.department.name}</TD>
                    <TD>
                      <Badge variant={statusVariant(latestStatus)}>{latestStatus ?? "planned"}</Badge>
                    </TD>
                    <TD>{formatTimeCell(task.updates[0]?.actualStart)}</TD>
                    <TD>{formatTimeCell(task.updates[0]?.actualEnd)}</TD>
                    <TD>{task.updates[0]?.trackedMinutes ?? 0} min</TD>
                    <TD className="min-w-[340px]">{renderAction(task)}</TD>
                  </TR>
                );
              })}
            </TBody>
          </Table>
        </div>
      ) : null}

      {mode === "requests" && role === "employee" && !visibleHistory.length ? (
        <div className="rounded-2xl border border-[var(--panel-border)] bg-[var(--panel-muted)] p-4 text-sm text-[var(--muted-foreground)]">
          No missed tasks need approval right now. If you miss today’s report, it will appear here tomorrow so you can request edit permission from your Team Head.
        </div>
      ) : null}

      {mode === "requests" && role === "manager" && !pendingApprovals.length ? (
        <div className="rounded-2xl border border-[var(--panel-border)] bg-[var(--panel-muted)] p-4 text-sm text-[var(--muted-foreground)]">
          No employee request is waiting right now. When someone from your department misses a report and submits a reason, it will appear here for your approval.
        </div>
      ) : null}

      {role === "manager" && pendingApprovals.length ? (
        <div className="rounded-2xl border border-[var(--panel-border)] bg-[var(--panel-muted)] p-4">
          <div className="mb-4">
            <p className="text-lg font-semibold text-white">Pending edit approvals</p>
            <p className="text-sm text-[var(--muted-foreground)]">
              Review the employee reason, remembered time, and requested status change before approving manual backdated editing.
            </p>
          </div>
          <div className="space-y-3">
            {pendingApprovals.map((request) => (
              <div key={request.id} className="rounded-2xl border border-[var(--panel-border)] bg-[var(--panel)] p-4">
                <div className="space-y-3">
                  <div>
                    <p className="font-semibold text-white">{request.requestedBy.name}</p>
                    <p className="text-sm text-[var(--muted-foreground)]">
                      {request.requestedBy.department?.name ?? "No department"} - {request.dailyTask.taskTitle}
                    </p>
                    <p className="mt-2 whitespace-pre-line text-sm text-[var(--muted-foreground)]">
                      {toDateOnly(request.dailyTask.planDate)} - {request.reason}
                    </p>
                  </div>
                  <Textarea
                    placeholder="Optional note for the employee. Example: approved, update final time carefully."
                    value={reviewNotes[request.id] ?? ""}
                    onChange={(event) => setReviewNotes((current) => ({ ...current, [request.id]: event.target.value }))}
                  />
                  <div className="flex gap-2">
                    <Button disabled={loadingId === request.id} onClick={() => reviewRequest(request.id, "approved")} size="sm" type="button">
                      Approve
                    </Button>
                    <Button
                      disabled={loadingId === request.id}
                      onClick={() => reviewRequest(request.id, "rejected")}
                      size="sm"
                      type="button"
                      variant="outline"
                    >
                      Reject
                    </Button>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
      ) : null}

      {selectedTask ? (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/75 p-4 backdrop-blur-sm">
          <div className="w-full max-w-3xl rounded-3xl border border-[var(--panel-border)] bg-[var(--panel)] shadow-2xl">
            <div className="flex items-start justify-between gap-4 border-b border-[var(--panel-border)] px-6 py-5">
              <div>
                <p className="text-xs uppercase tracking-[0.24em] text-cyan-300">Report Preview</p>
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
              <div className="flex flex-wrap justify-end gap-3">
                {(role === "manager" || role === "admin" || selectedTask.canEmployeeEdit) ? (
                  <Link href={`/dashboard/report?date=${toDateOnly(selectedTask.planDate)}`}>
                    <Button size="sm" variant="secondary">
                      Open Full Editor
                    </Button>
                  </Link>
                ) : null}
                <Button onClick={() => setSelectedTask(null)} size="sm" type="button">
                  Close
                </Button>
              </div>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}
