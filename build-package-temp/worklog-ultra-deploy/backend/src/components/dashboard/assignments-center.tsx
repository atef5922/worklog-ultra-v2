"use client";

import { CheckCircle2, ClipboardCheck, SendHorizonal } from "lucide-react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { useEffect, useMemo, useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";

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
  taskTitle: string;
  taskDescription: string | null;
  priority: string;
  department: { name: string };
  user: { name: string; department?: { name: string | null } | null };
  assigner?: { name: string | null } | null;
  updates: Array<{
    status: "done" | "in_progress" | "pending";
    note: string | null;
    trackedMinutes: number;
    updatedAt?: Date;
  }>;
};

function assignmentStatus(task: AssignmentTask) {
  const latest = task.updates[0];
  return latest?.status ?? "pending";
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

  const filteredUsers = useMemo(
    () => assignableUsers.filter((member) => !departmentId || member.departmentId === departmentId),
    [assignableUsers, departmentId],
  );

  useEffect(() => {
    if (typeof window === "undefined" || searchParams.get("from") !== "notification") {
      return;
    }

    assignedByMe.forEach((task) => {
      const updatedAt = task.updates[0]?.updatedAt;
      if (!updatedAt) {
        return;
      }

      window.localStorage.setItem(`assignment-notification-read:${task.id}:${new Date(updatedAt).toISOString()}`, "read");
      window.localStorage.setItem(`assignment-notification-seen:${task.id}:${new Date(updatedAt).toISOString()}`, "seen");
    });
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
              <p>When the assignee submits work with a note, you can review that note below.</p>
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
                    <span className="rounded-full bg-blue-500/15 px-2.5 py-1 text-xs font-semibold uppercase tracking-[0.18em] text-blue-300">
                      {assignmentStatus(task)}
                    </span>
                  </div>
                  <p className="mt-3 text-sm text-[var(--muted-foreground)]">{task.taskDescription || "No assignment note."}</p>
                  <div className="mt-3 rounded-2xl border border-[var(--panel-border)] bg-[var(--panel)] p-3 text-sm text-[var(--muted-foreground)]">
                    Review note:
                    <span className="ml-2 text-white">{task.updates[0]?.note || "No submission note yet."}</span>
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
                    <span className="rounded-full bg-emerald-500/15 px-2.5 py-1 text-xs font-semibold uppercase tracking-[0.18em] text-emerald-300">
                      {assignmentStatus(task)}
                    </span>
                  </div>
                  <p className="mt-3 text-sm text-[var(--muted-foreground)]">{task.taskDescription || "No assignment note."}</p>
                  <div className="mt-3 flex items-center justify-between gap-3 rounded-2xl border border-[var(--panel-border)] bg-[var(--panel)] p-3">
                    <div className="text-sm text-[var(--muted-foreground)]">
                      Submit note:
                      <span className="ml-2 text-white">{task.updates[0]?.note || "Add note from Evening Report / tracker when you submit."}</span>
                    </div>
                    <Link className="button-force-white inline-flex items-center gap-2 rounded-xl bg-[#4f5ef7] px-3 py-2 text-xs font-semibold" href="/dashboard/report">
                      <ClipboardCheck className="h-4 w-4" />
                      Submit
                    </Link>
                  </div>
                </div>
              ))
            ) : (
              <p className="text-sm text-[var(--muted-foreground)]">No task has been assigned to you today.</p>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
