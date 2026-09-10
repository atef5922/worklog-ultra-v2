"use client";

import { CheckCircle2, ClipboardCheck, SendHorizonal, TimerReset, X } from "lucide-react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { useEffect, useMemo, useState } from "react";
import { toast } from "sonner";
import { AssignmentReviewControls } from "@/components/dashboard/assignment-review-controls";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
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
  }>;
  latestReview: {
    id: string;
    status: "pending" | "approved" | "rejected";
    submitNote: string;
    reviewNote: string | null;
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
  departments,
  assignableUsers,
  assignedByMe,
  assignedToMe,
}: {
  currentUserId: string;
  departments: Department[];
  assignableUsers: AssignableUser[];
  assignedByMe: AssignmentTask[];
  assignedToMe: AssignmentTask[];
}) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [saving, setSaving] = useState(false);
  const [title, setTitle] = useState("");
  const [priority, setPriority] = useState("normal");
  const [departmentId, setDepartmentId] = useState(assignableUsers.find((item) => item.id === currentUserId)?.departmentId || departments[0]?.id || "");
  const [assigneeId, setAssigneeId] = useState(currentUserId);
  const [note, setNote] = useState("");
  const [selectedAssignment, setSelectedAssignment] = useState<SelectedAssignment | null>(null);

  const filteredUsers = useMemo(
    () => assignableUsers.filter((member) => !departmentId || member.departmentId === departmentId),
    [assignableUsers, departmentId],
  );

  useEffect(() => {
    if (typeof window === "undefined") {
      return;
    }

    const taskId = searchParams.get("taskId");
    const fromNotification = searchParams.get("from") === "notification";

    if (!taskId) {
      return;
    }

    const task = assignedByMe.find((item) => item.id === taskId);
    if (!task) {
      return;
    }

    setSelectedAssignment({ task, list: "assignedByMe" });

    if (fromNotification) {
      const updatedAt = task.updates[0]?.updatedAt;
      if (updatedAt) {
        window.localStorage.setItem(`assignment-notification-read:${task.id}:${new Date(updatedAt).toISOString()}`, "read");
        window.localStorage.setItem(`assignment-notification-seen:${task.id}:${new Date(updatedAt).toISOString()}`, "seen");
      }
    }
  }, [assignedByMe, searchParams]);

  async function assignTask() {
    if (!title.trim()) {
      toast.error("Task title is required.");
      return;
    }

    setSaving(true);
    const response = await fetch("/api/dashboard/plan", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        planDate: new Date().toISOString(),
        tasks: [
          {
            taskTitle: title,
            taskDescription: note,
            priority,
            departmentId,
            assigneeId,
          },
        ],
      }),
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
    router.refresh();
  }

  const selectedTask = selectedAssignment?.task ?? null;
  const latestUpdate = selectedTask?.updates[0] ?? null;

  return (
    <div className="space-y-5">
      <Card>
        <CardHeader>
          <CardTitle>Assign Task</CardTitle>
        </CardHeader>
        <CardContent className="grid gap-4 lg:grid-cols-[minmax(0,1.5fr)_320px]">
          <div className="space-y-4">
            <div className="grid gap-4 md:grid-cols-2">
              <div>
                <Label>From Department</Label>
                <Select value={departmentId} onValueChange={setDepartmentId}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {departments.map((department) => (
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
                    {filteredUsers.map((member) => (
                      <SelectItem key={member.id} value={member.id}>
                        {member.name} - {member.departmentName}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>
            <div className="grid gap-4 md:grid-cols-[minmax(0,1fr)_180px]">
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
                    {["low", "normal", "high", "critical"].map((item) => (
                      <SelectItem key={item} value={item}>
                        {item}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>
            <div>
              <Label>Assignment Note</Label>
              <Textarea onChange={(event) => setNote(event.target.value)} placeholder="Explain what support is needed, expected output, or deadline." value={note} />
            </div>
            <Button className="button-force-white bg-[#4f5ef7] hover:bg-[#4453eb]" disabled={saving} onClick={assignTask} type="button">
              <SendHorizonal className="h-4 w-4" />
              {saving ? "Assigning..." : "Assign Task"}
            </Button>
          </div>
          <div className="rounded-3xl border border-slate-200 bg-slate-50 p-4">
            <p className="text-sm font-semibold text-slate-900">How it works</p>
            <div className="mt-3 space-y-3 text-sm text-slate-600">
              <p>Use this page when your team needs help from another person or department.</p>
              <p>The assignment note becomes the original task brief.</p>
              <p>The assignee can open the task directly, submit work note, and track progress from the report screen.</p>
            </div>
          </div>
        </CardContent>
      </Card>

      <div className="grid gap-5 xl:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle>Assigned By Me</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            {assignedByMe.length ? (
              assignedByMe.map((task) => (
                <div key={task.id} className="rounded-2xl border border-[var(--panel-border)] bg-[var(--panel-muted)] p-4">
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <p className="font-semibold text-white">{task.taskTitle}</p>
                      <p className="text-sm text-[var(--muted-foreground)]">
                        To: {task.user.name} - {task.user.department?.name ?? task.department.name}
                      </p>
                    </div>
                    <Badge variant={statusVariant(assignmentStatus(task))}>{assignmentStatus(task)}</Badge>
                  </div>
                  <p className="mt-3 text-sm text-[var(--muted-foreground)]">{task.taskDescription || "No assignment note."}</p>
                  <div className="mt-3 flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-[var(--panel-border)] bg-[var(--panel)] p-3">
                    <div className="text-sm text-[var(--muted-foreground)]">
                      Latest note:
                      <span className="ml-2 text-white">{task.updates[0]?.note || "No submission note yet."}</span>
                    </div>
                    <div className="flex flex-wrap items-center gap-2">
                      <AssignmentReviewControls latestReview={task.latestReview} mode="assigner" taskId={task.id} taskTitle={task.taskTitle} />
                      <Button onClick={() => setSelectedAssignment({ task, list: "assignedByMe" })} size="sm" type="button" variant="secondary">
                        View Details
                      </Button>
                    </div>
                  </div>
                </div>
              ))
            ) : (
              <p className="text-sm text-[var(--muted-foreground)]">No assignment created by you today.</p>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Assigned To Me</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            {assignedToMe.length ? (
              assignedToMe.map((task) => (
                <div key={task.id} className="rounded-2xl border border-[var(--panel-border)] bg-[var(--panel-muted)] p-4">
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <p className="font-semibold text-white">{task.taskTitle}</p>
                      <p className="text-sm text-[var(--muted-foreground)]">
                        From: {task.assigner?.name ?? "Workspace"} - {task.department.name}
                      </p>
                    </div>
                    <Badge variant={statusVariant(assignmentStatus(task))}>{assignmentStatus(task)}</Badge>
                  </div>
                  <p className="mt-3 text-sm text-[var(--muted-foreground)]">{task.taskDescription || "No assignment note."}</p>
                  <div className="mt-3 flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-[var(--panel-border)] bg-[var(--panel)] p-3">
                    <div className="text-sm text-[var(--muted-foreground)]">
                      Submit note:
                      <span className="ml-2 text-white">{task.latestReview?.submitNote || task.updates[0]?.note || "Open this task and submit from dashboard or report."}</span>
                    </div>
                    <div className="flex flex-wrap items-center gap-2">
                      <AssignmentReviewControls latestReview={task.latestReview} mode="assignee" taskId={task.id} taskTitle={task.taskTitle} />
                      <Button onClick={() => setSelectedAssignment({ task, list: "assignedToMe" })} size="sm" type="button" variant="secondary">
                        Open Task
                      </Button>
                    </div>
                  </div>
                </div>
              ))
            ) : (
              <p className="text-sm text-[var(--muted-foreground)]">No task has been assigned to you today.</p>
            )}
          </CardContent>
        </Card>
      </div>

      {selectedTask ? (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/75 p-4 backdrop-blur-sm">
          <div className="max-h-[88vh] w-full max-w-2xl overflow-y-auto rounded-3xl border border-[var(--panel-border)] bg-[var(--panel)] shadow-2xl">
            <div className="flex items-start justify-between gap-4 border-b border-[var(--panel-border)] px-6 py-5">
              <div>
                <p className="text-xs uppercase tracking-[0.24em] text-cyan-300">
                  {selectedAssignment?.list === "assignedByMe" ? "Assigned By You" : "Assigned To You"}
                </p>
                <h3 className="mt-2 text-2xl font-semibold text-white">{selectedTask.taskTitle}</h3>
                <p className="mt-1 text-sm text-[var(--muted-foreground)]">
                  {selectedAssignment?.list === "assignedByMe"
                    ? `Assigned to ${selectedTask.user.name}`
                    : `Assigned by ${selectedTask.assigner?.name ?? "Workspace"}`}{" "}
                  - {selectedTask.department.name} - {toDateOnly(selectedTask.planDate)}
                </p>
              </div>
              <Button onClick={() => setSelectedAssignment(null)} size="icon" type="button" variant="ghost">
                <X className="h-5 w-5" />
              </Button>
            </div>

            <div className="space-y-5 px-6 py-6">
              <div className="flex flex-wrap gap-2">
                <Badge variant={priorityVariant(selectedTask.priority)}>{selectedTask.priority}</Badge>
                <Badge variant={statusVariant(assignmentStatus(selectedTask))}>{assignmentStatus(selectedTask)}</Badge>
              </div>

              <div className="space-y-3 text-sm">
                <div>
                  <p className="text-xs uppercase tracking-[0.18em] text-[var(--muted-foreground)]">Assignment Brief</p>
                  <p className="mt-1 whitespace-pre-line leading-6 text-white/90">
                    {selectedTask.taskDescription || "No extra assignment brief was added."}
                  </p>
                </div>
                <div className="grid gap-3 sm:grid-cols-2">
                  <div>
                    <p className="text-xs uppercase tracking-[0.18em] text-[var(--muted-foreground)]">Tracked</p>
                    <p className="mt-1 text-white">{latestUpdate?.trackedMinutes ?? 0} min</p>
                  </div>
                  <div>
                    <p className="text-xs uppercase tracking-[0.18em] text-[var(--muted-foreground)]">Last Update</p>
                    <p className="mt-1 text-white">{formatDateTimeInDhaka(latestUpdate?.updatedAt)}</p>
                  </div>
                  <div>
                    <p className="text-xs uppercase tracking-[0.18em] text-[var(--muted-foreground)]">Started</p>
                    <p className="mt-1 text-white">{formatDateTimeInDhaka(latestUpdate?.actualStart)}</p>
                  </div>
                  <div>
                    <p className="text-xs uppercase tracking-[0.18em] text-[var(--muted-foreground)]">Ended</p>
                    <p className="mt-1 text-white">{formatDateTimeInDhaka(latestUpdate?.actualEnd)}</p>
                  </div>
                </div>
              </div>

              <div className="space-y-1 text-sm">
                <p className="text-xs uppercase tracking-[0.18em] text-[var(--muted-foreground)]">Submission / Progress Note</p>
                <p className="whitespace-pre-line leading-6 text-white/90">{latestUpdate?.note || "No submission note yet."}</p>
              </div>

              {selectedTask.latestReview ? (
                <div className="space-y-1 text-sm">
                  <p className="text-xs uppercase tracking-[0.18em] text-[var(--muted-foreground)]">Assignment Review</p>
                  <div className="flex flex-wrap items-center gap-2">
                    <Badge variant={statusVariant(selectedTask.latestReview.status === "rejected" ? "pending" : selectedTask.latestReview.status === "approved" ? "done" : "in_progress")}>
                      {selectedTask.latestReview.status}
                    </Badge>
                  </div>
                  <p className="whitespace-pre-line leading-6 text-white/90">{selectedTask.latestReview.submitNote || "No submit note yet."}</p>
                  {selectedTask.latestReview.reviewNote ? (
                    <p className="whitespace-pre-line leading-6 text-white/70">Reviewer note: {selectedTask.latestReview.reviewNote}</p>
                  ) : null}
                </div>
              ) : null}

              <div className="flex flex-wrap justify-end gap-3">
                {selectedAssignment?.list === "assignedToMe" ? (
                  <AssignmentReviewControls latestReview={selectedTask.latestReview} mode="assignee" taskId={selectedTask.id} taskTitle={selectedTask.taskTitle} />
                ) : null}
                {selectedAssignment?.list === "assignedByMe" ? (
                  <AssignmentReviewControls latestReview={selectedTask.latestReview} mode="assigner" taskId={selectedTask.id} taskTitle={selectedTask.taskTitle} />
                ) : null}
                {selectedAssignment?.list === "assignedToMe" ? (
                  <Link href={`/dashboard/report?date=${toDateOnly(selectedTask.planDate)}&taskId=${selectedTask.id}`}>
                    <Button size="sm" type="button">
                      <ClipboardCheck className="h-4 w-4" />
                      Open Task Report
                    </Button>
                  </Link>
                ) : null}
                {selectedAssignment?.list === "assignedByMe" ? (
                  <Link href={`/dashboard/report?date=${toDateOnly(selectedTask.planDate)}&taskId=${selectedTask.id}`}>
                    <Button size="sm" type="button" variant="secondary">
                      <TimerReset className="h-4 w-4" />
                      View Exact Report
                    </Button>
                  </Link>
                ) : null}
                {assignmentStatus(selectedTask) === "done" ? (
                  <div className="inline-flex items-center gap-2 rounded-xl border border-emerald-500/30 bg-emerald-500/10 px-3 py-2 text-sm text-emerald-300">
                    <CheckCircle2 className="h-4 w-4" />
                    Submission complete
                  </div>
                ) : null}
                <Button onClick={() => setSelectedAssignment(null)} size="sm" type="button" variant="outline">
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
