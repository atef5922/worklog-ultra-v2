"use client";

import { formatDateInDhaka } from "@/lib/utils";
import {
  CheckCircle2,
  CheckSquare2,
  CornerDownLeft,
  Inbox,
  Paperclip,
  Send,
  SendHorizonal,
  TimerReset,
  UserRoundPlus,
  X,
} from "lucide-react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { useEffect, useId, useMemo, useState } from "react";
import { toast } from "sonner";
import { AssignmentReviewControls } from "@/components/dashboard/assignment-review-controls";
import { PageHeader } from "@/components/dashboard/page-header";
import { PanelHeader } from "@/components/dashboard/panel-header";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { extractAssignmentAttachmentMeta } from "@/lib/assignment-attachments";
import { formatTaskPriority, TASK_PRIORITY_OPTIONS } from "@/lib/task-priority";
import { AssignmentWorkPanel } from "./assignment-work-panel";
import { formatDateTimeInDhaka, toDateOnly } from "@/lib/utils";

type Department = { id: string; name: string };
type AssignableUser = {
  id: string;
  name: string;
  role: string;
  designation: string | null;
  departmentId: string | null;
  departmentName: string;
};

type AssignmentTask = {
  id: string;
  planDate: Date;
  createdAt: Date;
  taskTitle: string;
  taskDescription: string | null;
  priority: string;
  department: { name: string };
  user: { name: string; department?: { name: string | null } | null };
  assigner?: { name: string | null; department?: { name: string | null } | null } | null;
  updates: Array<{
    status: "done" | "in_progress" | "pending";
    note: string | null;
    trackedMinutes: number;
    actualStart?: Date | null;
    actualEnd?: Date | null;
    updatedAt?: Date;
    reportDate?: Date;
  }>;
  latestReview: {
    id: string;
    status: "pending" | "approved" | "rejected";
    submitNote: string;
    submitAttachments?: Array<{
      fileName: string;
      fileUrl: string;
      fileType: string;
      fileSize: number;
    }>;
    reviewNote: string | null;
    reviewAttachments?: Array<{
      fileName: string;
      fileUrl: string;
      fileType: string;
      fileSize: number;
    }>;
    createdAt: Date;
    reviewedAt: Date | null;
    requestedById: string;
    reviewerId: string | null;
  } | null;
};

type SelectedAssignment =
  | { task: AssignmentTask; list: "assignedByMe" }
  | { task: AssignmentTask; list: "assignedToMe" };

function assignmentStatus(task: AssignmentTask) {
  return task.updates[0]?.status ?? "pending";
}

function priorityVariant(priority: string) {
  if (priority === "critical") return "warning";
  if (priority === "high") return "purple";
  if (priority === "low") return "secondary";
  return "default";
}

function statusVariant(status: "done" | "in_progress" | "pending") {
  if (status === "done") return "success";
  if (status === "in_progress") return "purple";
  return "warning";
}

export function AssignmentsCenter({
  currentUserId,
  attendanceRunning,
  departments = [],
  assignableUsers = [],
  assignedByMe = [],
  assignedToMe = [],
}: {
  currentUserId: string;
  attendanceRunning: boolean;
  departments: Department[];
  assignableUsers: AssignableUser[];
  assignedByMe: AssignmentTask[];
  assignedToMe: AssignmentTask[];
}) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const assignmentFileInputId = useId();
  const [saving, setSaving] = useState(false);
  const [title, setTitle] = useState("");
  const [priority, setPriority] = useState("normal");
  const [departmentId, setDepartmentId] = useState(assignableUsers.find((item) => item.id === currentUserId)?.departmentId || departments[0]?.id || "");
  const [assigneeId, setAssigneeId] = useState(currentUserId);
  const [note, setNote] = useState("");
  const [assignmentFiles, setAssignmentFiles] = useState<File[]>([]);
  const [selectedAssignment, setSelectedAssignment] = useState<SelectedAssignment | null>(null);
  const [reviewNote, setReviewNote] = useState("");
  const [reviewSaving, setReviewSaving] = useState(false);

  const filteredUsers = useMemo(
    () => assignableUsers.filter((member) => !departmentId || member.departmentId === departmentId),
    [assignableUsers, departmentId],
  );

  function closeSelectedAssignment() {
    setSelectedAssignment(null);

    const taskId = searchParams.get("taskId");
    const from = searchParams.get("from");

    if (!taskId && !from) {
      return;
    }

    const params = new URLSearchParams(searchParams.toString());
    params.delete("taskId");
    params.delete("from");
    const nextQuery = params.toString();
    router.replace(nextQuery ? `/dashboard/assignments?${nextQuery}` : "/dashboard/assignments", { scroll: false });
  }


  useEffect(() => {
    if (typeof window === "undefined") {
      return;
    }

    const taskId = searchParams.get("taskId");
    const fromNotification = searchParams.get("from") === "notification";

    if (!taskId) {
      return;
    }

    const taskFromAssignedByMe = assignedByMe.find((item) => item.id === taskId);
    const taskFromAssignedToMe = assignedToMe.find((item) => item.id === taskId);
    const task = taskFromAssignedByMe ?? taskFromAssignedToMe;

    if (!task) {
      return;
    }

    setSelectedAssignment({ task, list: taskFromAssignedByMe ? "assignedByMe" : "assignedToMe" });

    if (fromNotification) {
      const updatedAt = task.updates[0]?.updatedAt ?? task.createdAt;
      window.localStorage.setItem(`assignment-notification-read:${task.id}:${new Date(updatedAt).toISOString()}`, "read");
      window.localStorage.setItem(`assignment-notification-seen:${task.id}:${new Date(updatedAt).toISOString()}`, "seen");
    }
  }, [assignedByMe, assignedToMe, searchParams]);


  async function assignTask() {
    if (!title.trim()) {
      toast.error("Task title is required.");
      return;
    }

    setSaving(true);
    const payload = new FormData();
    payload.append("taskTitle", title);
    payload.append("priority", priority);
    payload.append("departmentId", departmentId);
    payload.append("assigneeId", assigneeId);
    payload.append("note", note);
    assignmentFiles.forEach((file) => payload.append("attachments", file));
    const response = await fetch("/api/dashboard/assignments", {
      method: "POST",
      body: payload,
    });
    const raw = await response.text();
    const result = raw ? JSON.parse(raw) : { message: "Task assignment failed." };
    setSaving(false);

    if (!response.ok) {
      toast.error(result.message);
      return;
    }

    toast.success("Task assigned successfully.");
    setTitle("");
    setPriority("normal");
    setNote("");
    setAssignmentFiles([]);
    router.refresh();
  }

  const selectedTask = (selectedAssignment?.list === "assignedToMe"
    ? assignedToMe.find(task => task.id === selectedAssignment.task.id)
    : assignedByMe.find(task => task.id === selectedAssignment?.task.id)) ?? selectedAssignment?.task ?? null;
  const latestUpdate = selectedTask?.updates[0] ?? null;
  const selectedReview = selectedTask?.latestReview ?? null;
  const canDirectReview = selectedAssignment?.list === "assignedByMe" && selectedReview?.status === "pending";
  const assignmentBrief = extractAssignmentAttachmentMeta(selectedTask?.taskDescription);

  async function runSelectedAssignmentReview(action: "approve" | "reject") {
    if (!selectedTask) {
      return;
    }

    setReviewSaving(true);
    const response = await fetch(`/api/dashboard/assignments/${selectedTask.id}/review`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action, note: reviewNote }),
    });
    const raw = await response.text();
    const result = raw ? JSON.parse(raw) : { message: "Assignment review action failed." };
    setReviewSaving(false);

    if (!response.ok) {
      toast.error(result.message);
      return;
    }

    toast.success(result.message);
    setReviewNote("");
    closeSelectedAssignment();
    router.refresh();
  }


  return (
    /* One screen: the page never scrolls and the title stays fixed; the assign
       form and both task lists scroll inside their own area. The dialogs further
       down stay outside it — they are fixed-position overlays and have their own
       scrolling. */
    <div
      className="flex flex-col gap-2 min-[900px]:min-h-0 min-[900px]:flex-1 min-[900px]:overflow-hidden"
      data-fit-viewport
    >
      {/* No subtitle: the panels below say what the page does, and the line was
          costing a row of height the rosters needed. */}
      <PageHeader icon={CheckSquare2} title="Assignments" />

      {/* This card takes the leftover height now, and the note box grows into it,
          so the space lands somewhere useful instead of becoming a void. */}
      <div
        className="dashboard-accent accent-indigo flex min-h-0 flex-col rounded-[1.25rem] border border-[var(--panel-border)] bg-[var(--panel)] p-3 shadow-[var(--shadow)] min-[900px]:flex-1"
        data-dashboard-panel
      >
        <PanelHeader icon={UserRoundPlus} title="Assign Task" />
        <div className="mt-2 grid min-h-0 flex-1 gap-2.5 [&_[role=combobox]>span]:truncate [&_[role=combobox]]:h-10 [&_[role=combobox]]:overflow-hidden [&_input]:h-10 [&_label]:mb-1.5 [&_label]:text-[0.76rem] lg:grid-cols-[minmax(0,1fr)_15rem]">
          <div className="flex min-h-0 flex-col gap-2.5">
            {/* All four short fields on one row instead of two. */}
            <div className="grid gap-2 sm:grid-cols-2 xl:grid-cols-4">
              <div>
                <Label>From Department</Label>
                <Select value={departmentId} onValueChange={setDepartmentId}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {(departments ?? []).map((department) => (
                      <SelectItem key={department.id} value={department.id}>
                        {department.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label>Assign To</Label>
                <Select value={assigneeId} onValueChange={setAssigneeId}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {(filteredUsers ?? []).map((member) => (
                      <SelectItem key={member.id} value={member.id}>
                        {member.name} - {member.departmentName}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label>Task Title</Label>
                <Input onChange={(event) => setTitle(event.target.value)} placeholder="Cross-team task title" value={title} />
              </div>
              <div>
                <Label>Priority</Label>
                <Select value={priority} onValueChange={setPriority}>
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
            {/* Note beside the file picker rather than stacked above it. */}
            <div className="grid min-h-0 flex-1 gap-2.5 md:grid-cols-2">
            <div className="flex min-h-0 flex-col">
              <Label>Assignment Note</Label>
              <Textarea
                className="min-h-[4rem] flex-1"
                onChange={(event) => setNote(event.target.value)}
                placeholder="Explain what support is needed, expected output, or deadline."
                value={note}
              />
            </div>
            <div>
              <Label>Attach Files</Label>
              <input
                className="hidden"
                id={assignmentFileInputId}
                multiple
                onChange={(event) => setAssignmentFiles(Array.from(event.target.files ?? []))}
                type="file"
              />
              <label
                className="mt-1 flex cursor-pointer items-center justify-between rounded-xl border border-[var(--panel-border)] bg-[var(--panel-muted)] px-2.5 py-1.5 text-[0.78rem] text-[var(--foreground)]"
                htmlFor={assignmentFileInputId}
              >
                <span className="inline-flex items-center gap-1.5 rounded-lg bg-[#4f5ef7] px-2.5 py-1 text-[0.7rem] font-semibold text-[var(--foreground)]">
                  <Paperclip className="h-3.5 w-3.5" />
                  Choose Files
                </span>
                <span className="ml-3 truncate text-right text-[var(--muted-foreground)]">
                  {assignmentFiles.length
                    ? assignmentFiles.length === 1
                      ? assignmentFiles[0]?.name
                      : `${assignmentFiles.length} files selected`
                    : "Optional files for assignee"}
                </span>
              </label>
              {assignmentFiles.length ? (
                <div className="mt-1.5 flex flex-wrap gap-1.5 text-[0.7rem] text-[var(--muted-foreground)]">
                  {assignmentFiles.map((file) => (
                    <span
                      key={`${file.name}-${file.size}`}
                      className="rounded-full border border-[var(--panel-border)] bg-[var(--panel)] px-2.5 py-1"
                    >
                      {file.name}
                    </span>
                  ))}
                </div>
              ) : null}
            </div>
            </div>
            <Button className="button-force-white h-9 bg-[#4f5ef7] hover:bg-[#4453eb]" disabled={saving} onClick={assignTask} type="button">
              <SendHorizonal className="h-3.5 w-3.5" />
              {saving ? "Assigning..." : "Assign Task"}
            </Button>
          </div>
          <div className="rounded-xl border border-slate-200 bg-slate-50 p-2.5">
            <p className="text-[0.8rem] font-semibold text-slate-900">How it works</p>
            <div className="mt-1.5 space-y-1 text-[0.72rem] leading-4 text-slate-600">
              <p>Use this page when your team needs help from another person or department.</p>
              <p>The assignment note becomes the original task brief.</p>
              <p>The assignee can work, track time, attach files, and submit directly from the assignment popup.</p>
            </div>
          </div>
        </div>
      </div>

      {/* Content height, capped. Stretching this row was what left the big void
          under the empty states — the cards now end where their content ends,
          and only a long list turns the cap into a scroll. */}
      <div className="grid min-h-0 shrink-0 gap-2 min-[900px]:max-h-[13rem] xl:grid-cols-2">
        <div
          className="dashboard-accent accent-sky flex min-h-0 flex-col rounded-[1.25rem] border border-[var(--panel-border)] bg-[var(--panel)] p-2.5 shadow-[var(--shadow)]"
          data-dashboard-panel
        >
          <PanelHeader
            action={
              <span className="font-mono text-[0.68rem] font-semibold tabular-nums text-[var(--muted-foreground)]">
                {assignedByMe.length}
              </span>
            }
            icon={Send}
            title="Assigned By Me"
            tone="bg-sky-500/10 text-sky-500"
          />
          <div className="dashboard-scroll-area mt-1.5 flex min-h-0 flex-1 flex-col gap-1.5 pr-0.5">
            {assignedByMe.length ? (
              (assignedByMe ?? []).map((task) => (
                <div key={task.id} className="rounded-xl border border-[var(--panel-border)] bg-[var(--panel-muted)] p-2">
                  <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0">
                      <p className="truncate text-[0.82rem] font-semibold text-[var(--foreground)]">{task.taskTitle}</p>
                      <p className="truncate text-[0.7rem] text-[var(--muted-foreground)]">
                        To: {task.user.name} - {task.user.department?.name ?? task.department.name}
                      </p>
                    </div>
                    <Badge variant={statusVariant(assignmentStatus(task))}>{assignmentStatus(task)}</Badge>
                  </div>
                  <p className="mt-1 line-clamp-2 text-[0.72rem] leading-4 text-[var(--muted-foreground)]">{extractAssignmentAttachmentMeta(task.taskDescription).text || "No assignment note."}</p>
                  <div className="mt-1.5 flex flex-wrap items-center justify-between gap-1.5 rounded-lg border border-[var(--panel-border)] bg-[var(--panel)] p-1.5">
                    <div className="min-w-0 flex-1 truncate text-[0.72rem] text-[var(--muted-foreground)]">
                      Latest note:
                      <span className="ml-2 font-medium text-[var(--foreground)]">{task.updates[0]?.note || "No submission note yet."}</span>
                    </div>
                    <div className="flex flex-wrap items-center gap-2">
                      <AssignmentReviewControls latestReview={task.latestReview} mode="assigner" taskId={task.id} taskTitle={task.taskTitle} />
                      <Button
                        onClick={() => {
                          setSelectedAssignment({ task, list: "assignedByMe" });
                          setReviewNote(task.latestReview?.reviewNote ?? "");
                        }}
                        size="sm"
                        type="button"
                        variant="secondary"
                      >
                        View Details
                      </Button>
                    </div>
                  </div>
                </div>
              ))
            ) : (
              <div className="flex flex-col items-center justify-center gap-1 rounded-xl border border-dashed border-[var(--panel-border)] bg-[var(--panel-muted)] px-3 py-2.5 text-center">
                <span className="inline-flex h-8 w-8 items-center justify-center rounded-full bg-sky-500/10 text-sky-500">
                  <Send className="h-4 w-4" />
                </span>
                <p className="text-[0.8rem] font-medium text-[var(--muted-foreground)]">No assignment created by you today.</p>
              </div>
            )}
          </div>
        </div>

        <div
          className="dashboard-accent accent-teal flex min-h-0 flex-col rounded-[1.25rem] border border-[var(--panel-border)] bg-[var(--panel)] p-2.5 shadow-[var(--shadow)]"
          data-dashboard-panel
        >
          <PanelHeader
            action={
              <span className="font-mono text-[0.68rem] font-semibold tabular-nums text-[var(--muted-foreground)]">
                {assignedToMe.length}
              </span>
            }
            icon={Inbox}
            title="Assigned To Me"
            tone="bg-teal-500/10 text-teal-500"
          />
          <div className="dashboard-scroll-area mt-1.5 flex min-h-0 flex-1 flex-col gap-1.5 pr-0.5">
            {assignedToMe.length ? (
              (assignedToMe ?? []).map((task) => (
                <div key={task.id} className="rounded-xl border border-[var(--panel-border)] bg-[var(--panel-muted)] p-2">
                  <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0">
                      <p className="truncate text-[0.82rem] font-semibold text-[var(--foreground)]">{task.taskTitle}</p>
                      <p className="truncate text-[0.7rem] text-[var(--muted-foreground)]">
                        From: {task.assigner?.name ?? "Workspace"} - {task.department.name}
                      </p>
                    </div>
                    <Badge variant={statusVariant(assignmentStatus(task))}>{assignmentStatus(task)}</Badge>
                  </div>
                  <p className="mt-1 line-clamp-2 text-[0.72rem] leading-4 text-[var(--muted-foreground)]">{extractAssignmentAttachmentMeta(task.taskDescription).text || "No assignment note."}</p>
                  <div className="mt-1.5 flex flex-wrap items-center justify-between gap-1.5 rounded-lg border border-[var(--panel-border)] bg-[var(--panel)] p-1.5">
                    <div className="min-w-0 flex-1 truncate text-[0.72rem] text-[var(--muted-foreground)]">
                      Submit note:
                      <span className="ml-2 font-medium text-[var(--foreground)]">{task.latestReview?.submitNote || task.updates[0]?.note || "Open submit popup and send your update from here."}</span>
                    </div>
                    <div className="flex flex-wrap items-center gap-2">
                      <Button
                        onClick={() => {
                          setSelectedAssignment({ task, list: "assignedToMe" });
                          setReviewNote("");
                        }}
                        size="sm"
                        type="button"
                        variant="secondary"
                      >
                        Submit
                      </Button>
                    </div>
                  </div>
                </div>
              ))
            ) : (
              <div className="flex flex-col items-center justify-center gap-1 rounded-xl border border-dashed border-[var(--panel-border)] bg-[var(--panel-muted)] px-3 py-2.5 text-center">
                <span className="inline-flex h-8 w-8 items-center justify-center rounded-full bg-teal-500/10 text-teal-500">
                  <Inbox className="h-4 w-4" />
                </span>
                <p className="text-[0.8rem] font-medium text-[var(--muted-foreground)]">No task has been assigned to you today.</p>
              </div>
            )}
          </div>
        </div>
      </div>

      {selectedTask ? (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/75 p-4 backdrop-blur-sm">
          <div className="max-h-[88vh] w-full max-w-2xl overflow-y-auto rounded-3xl border border-[var(--panel-border)] bg-[var(--panel)] shadow-2xl">
            <div className="flex items-start justify-between gap-4 border-b border-[var(--panel-border)] px-6 py-5">
              <div>
                <p className="text-[0.65rem] font-bold uppercase tracking-[0.2em] text-[#4f5ef7]">
                  {selectedAssignment?.list === "assignedByMe" ? "Assigned By You" : "Assigned To You"}
                </p>
                <h3 className="mt-2 text-2xl font-semibold text-[var(--foreground)]">{selectedTask.taskTitle}</h3>
                <p className="mt-1 text-sm text-[var(--muted-foreground)]">
                  {selectedAssignment?.list === "assignedByMe"
                    ? `Assigned to ${selectedTask.user.name}`
                    : `Assigned by ${selectedTask.assigner?.name ?? "Workspace"}`}{" "}
                  - {selectedTask.department.name} - {formatDateInDhaka(selectedTask.planDate)}
                </p>
              </div>
              <Button onClick={closeSelectedAssignment} size="icon" type="button" variant="ghost">
                <X className="h-5 w-5" />
              </Button>
            </div>

            <div className="space-y-5 px-6 py-6">
              <div className="flex flex-wrap gap-2">
                <Badge variant={priorityVariant(selectedTask.priority)}>{formatTaskPriority(selectedTask.priority)}</Badge>
                <Badge variant={statusVariant(assignmentStatus(selectedTask))}>{assignmentStatus(selectedTask)}</Badge>
              </div>

              <div className="space-y-3 text-sm">
                <div>
                  <p className="text-xs uppercase tracking-[0.18em] text-[var(--muted-foreground)]">Assignment Brief</p>
                  <p className="mt-1 whitespace-pre-line leading-6 text-[var(--foreground)]">
                    {assignmentBrief.text || "No extra assignment brief was added."}
                  </p>
                  {assignmentBrief.attachments.length ? (
                    <div className="mt-3 flex flex-wrap gap-2">
                      {assignmentBrief.attachments.map((attachment) => (
                        <a
                          key={attachment.fileUrl}
                          className="inline-flex items-center gap-2 rounded-full border border-[var(--panel-border)] bg-[var(--panel-muted)] px-3 py-1 text-xs text-[var(--foreground)]"
                          href={attachment.fileUrl}
                          rel="noreferrer"
                          target="_blank"
                        >
                          <Paperclip className="h-3.5 w-3.5" />
                          {attachment.fileName}
                        </a>
                      ))}
                    </div>
                  ) : null}
                </div>
                <div className="grid gap-3 sm:grid-cols-2">
                  <div>
                    <p className="text-xs uppercase tracking-[0.18em] text-[var(--muted-foreground)]">Tracked</p>
                    <p className="mt-1 font-medium text-[var(--foreground)]">{latestUpdate?.trackedMinutes ?? 0} min</p>
                  </div>
                  <div>
                    <p className="text-xs uppercase tracking-[0.18em] text-[var(--muted-foreground)]">Last Update</p>
                    <p className="mt-1 font-medium text-[var(--foreground)]">{formatDateTimeInDhaka(latestUpdate?.updatedAt)}</p>
                  </div>
                  <div>
                    <p className="text-xs uppercase tracking-[0.18em] text-[var(--muted-foreground)]">Started</p>
                    <p className="mt-1 font-medium text-[var(--foreground)]">{formatDateTimeInDhaka(latestUpdate?.actualStart)}</p>
                  </div>
                  <div>
                    <p className="text-xs uppercase tracking-[0.18em] text-[var(--muted-foreground)]">Ended</p>
                    <p className="mt-1 font-medium text-[var(--foreground)]">{formatDateTimeInDhaka(latestUpdate?.actualEnd)}</p>
                  </div>
                </div>
              </div>

              <div className="space-y-1 text-sm">
                <p className="text-xs uppercase tracking-[0.18em] text-[var(--muted-foreground)]">Submission / Progress Note</p>
                <p className="whitespace-pre-line leading-6 text-[var(--foreground)]">{latestUpdate?.note || "No submission note yet."}</p>
              </div>

              {selectedTask.latestReview ? (
                <div className="space-y-1 text-sm">
                  <p className="text-xs uppercase tracking-[0.18em] text-[var(--muted-foreground)]">Assignment Review</p>
                  <div className="flex flex-wrap items-center gap-2">
                    <Badge variant={statusVariant(selectedTask.latestReview.status === "rejected" ? "pending" : selectedTask.latestReview.status === "approved" ? "done" : "in_progress")}>
                      {selectedTask.latestReview.status}
                    </Badge>
                  </div>
                  <p className="whitespace-pre-line leading-6 text-[var(--foreground)]">{selectedTask.latestReview.submitNote || "No submit note yet."}</p>
                  {selectedTask.latestReview.submitAttachments?.length ? (
                    <div className="flex flex-wrap gap-2">
                      {selectedTask.latestReview.submitAttachments.map((attachment) => (
                        <a
                          key={attachment.fileUrl}
                          className="inline-flex items-center gap-2 rounded-full border border-[var(--panel-border)] bg-[var(--panel-muted)] px-3 py-1 text-xs text-[var(--foreground)]"
                          href={attachment.fileUrl}
                          rel="noreferrer"
                          target="_blank"
                        >
                          <Paperclip className="h-3.5 w-3.5" />
                          {attachment.fileName}
                        </a>
                      ))}
                    </div>
                  ) : null}
                  {selectedTask.latestReview.reviewNote || selectedTask.latestReview.reviewAttachments?.length ? (
                    <div className="space-y-2">
                      {selectedTask.latestReview.reviewNote ? (
                        <p className="whitespace-pre-line leading-6 text-[var(--muted-foreground)]">Reviewer note: {selectedTask.latestReview.reviewNote}</p>
                      ) : null}
                      {selectedTask.latestReview.reviewAttachments?.length ? (
                        <div className="flex flex-wrap gap-2">
                          {selectedTask.latestReview.reviewAttachments.map((attachment) => (
                            <a
                              key={attachment.fileUrl}
                              className="inline-flex items-center gap-2 rounded-full border border-[var(--panel-border)] bg-[var(--panel-muted)] px-3 py-1 text-xs text-[var(--foreground)]"
                              href={attachment.fileUrl}
                              rel="noreferrer"
                              target="_blank"
                            >
                              <Paperclip className="h-3.5 w-3.5" />
                              {attachment.fileName}
                            </a>
                          ))}
                        </div>
                      ) : null}
                    </div>
                  ) : null}
                </div>
              ) : null}

              {selectedAssignment?.list === "assignedToMe" ? (
                <AssignmentWorkPanel key={selectedTask.id} task={selectedTask} attendanceRunning={attendanceRunning}
                  initialNote={selectedTask.latestReview?.submitNote || selectedTask.updates[0]?.note || ""}
                  onSubmitted={closeSelectedAssignment}/>
              ) : null}

              {selectedAssignment?.list === "assignedByMe" ? (
                <div className="rounded-2xl border border-[var(--panel-border)] bg-[var(--panel-muted)] p-4">
                  <p className="text-xs uppercase tracking-[0.18em] text-[var(--muted-foreground)]">Quick Review</p>
                  {canDirectReview ? (
                    <>
                      <p className="mt-2 text-sm text-[var(--muted-foreground)]">
                        Approve or ask for update directly from this assignment window.
                      </p>
                      <Textarea
                        className="mt-3"
                        onChange={(event) => setReviewNote(event.target.value)}
                        placeholder="Write what was good, or what still needs to be fixed."
                        rows={4}
                        value={reviewNote}
                      />
                    </>
                  ) : (
                    <p className="mt-2 text-sm text-[var(--muted-foreground)]">
                      Assignee has not submitted this assignment for approval yet. Once they submit from their task report, approve or ask update from here.
                    </p>
                  )}
                </div>
              ) : null}

              <div className="flex flex-wrap justify-end gap-3">
                {selectedAssignment?.list === "assignedByMe" ? (
                  <Link href={`/dashboard/report?date=${toDateOnly(selectedTask.planDate)}&taskId=${selectedTask.id}`}>
                    <Button size="sm" type="button" variant="secondary">
                      <TimerReset className="h-4 w-4" />
                      View Exact Report
                    </Button>
                  </Link>
                ) : null}
                {selectedAssignment?.list === "assignedByMe" ? (
                  <Button
                    className="button-force-white bg-amber-500 hover:bg-amber-600"
                    disabled={!canDirectReview || reviewSaving}
                    onClick={() => runSelectedAssignmentReview("reject")}
                    size="sm"
                    type="button"
                  >
                    <CornerDownLeft className="h-4 w-4" />
                    {reviewSaving ? "Saving..." : "Ask Update"}
                  </Button>
                ) : null}
                {selectedAssignment?.list === "assignedByMe" ? (
                  <Button
                    className="button-force-white bg-emerald-500 hover:bg-emerald-600"
                    disabled={!canDirectReview || reviewSaving}
                    onClick={() => runSelectedAssignmentReview("approve")}
                    size="sm"
                    type="button"
                  >
                    <CheckCircle2 className="h-4 w-4" />
                    {reviewSaving ? "Saving..." : "Approve"}
                  </Button>
                ) : null}
                {assignmentStatus(selectedTask) === "done" ? (
                  <div className="inline-flex items-center gap-2 rounded-xl border border-emerald-500/30 bg-emerald-500/10 px-3 py-2 text-sm text-emerald-300">
                    <CheckCircle2 className="h-4 w-4" />
                    Task completed
                  </div>
                ) : null}
                <Button onClick={closeSelectedAssignment} size="sm" type="button" variant="outline">
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
