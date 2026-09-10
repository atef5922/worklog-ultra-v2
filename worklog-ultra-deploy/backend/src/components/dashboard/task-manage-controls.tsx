"use client";

import * as Dialog from "@radix-ui/react-dialog";
import { Pencil, Trash2, X } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";

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
}: {
  task: {
    id: string;
    taskTitle: string;
    taskDescription?: string | null;
    priority: "low" | "normal" | "high" | "critical";
  };
  compact?: boolean;
}) {
  const router = useRouter();
  const [editOpen, setEditOpen] = useState(false);
  const [deleteOpen, setDeleteOpen] = useState(false);
  const [title, setTitle] = useState(task.taskTitle);
  const [description, setDescription] = useState(task.taskDescription ?? "");
  const [priority, setPriority] = useState(task.priority);
  const [saving, setSaving] = useState(false);
  const [deleting, setDeleting] = useState(false);

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
        taskDescription: description.trim(),
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
    setDeleteOpen(false);
    router.refresh();
  }

  return (
    <div className={`flex flex-wrap items-center gap-2 ${compact ? "" : "mt-2"}`}>
      <Dialog.Root
        onOpenChange={(open) => {
          setEditOpen(open);
          if (open) {
            setTitle(task.taskTitle);
            setDescription(task.taskDescription ?? "");
            setPriority(task.priority);
          }
        }}
        open={editOpen}
      >
        <Dialog.Trigger asChild>
          <Button className="h-8 rounded-full px-3 text-xs" size="sm" variant="outline">
            <Pencil className="h-3.5 w-3.5" />
            Edit
          </Button>
        </Dialog.Trigger>
        <Dialog.Portal>
          <Dialog.Overlay className="fixed inset-0 z-40 bg-slate-950/70 backdrop-blur-sm" />
          <Dialog.Content className="fixed left-1/2 top-1/2 z-50 w-[min(560px,92vw)] -translate-x-1/2 -translate-y-1/2 rounded-[28px] border border-[var(--panel-border)] bg-[var(--panel)] shadow-2xl outline-none">
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
                    <SelectItem value="critical">High Priority</SelectItem>
                    <SelectItem value="high">Important</SelectItem>
                    <SelectItem value="normal">Medium</SelectItem>
                    <SelectItem value="low">Low</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label>Task Note</Label>
                <Textarea onChange={(event) => setDescription(event.target.value)} rows={5} value={description} />
              </div>
            </div>
            <div className="flex justify-end gap-3 border-t border-[var(--panel-border)] px-6 py-5">
              <Dialog.Close asChild>
                <Button type="button" variant="outline">
                  Cancel
                </Button>
              </Dialog.Close>
              <Button className="button-force-white" disabled={saving} onClick={saveTask} type="button">
                {saving ? "Saving..." : "Save Changes"}
              </Button>
            </div>
          </Dialog.Content>
        </Dialog.Portal>
      </Dialog.Root>

      <Dialog.Root onOpenChange={setDeleteOpen} open={deleteOpen}>
        <Dialog.Trigger asChild>
          <Button className="h-8 rounded-full px-3 text-xs text-rose-600 hover:bg-rose-50" size="sm" variant="outline">
            <Trash2 className="h-3.5 w-3.5" />
            Delete
          </Button>
        </Dialog.Trigger>
        <Dialog.Portal>
          <Dialog.Overlay className="fixed inset-0 z-40 bg-slate-950/70 backdrop-blur-sm" />
          <Dialog.Content className="fixed left-1/2 top-1/2 z-50 w-[min(440px,92vw)] -translate-x-1/2 -translate-y-1/2 rounded-[28px] border border-[var(--panel-border)] bg-[var(--panel)] shadow-2xl outline-none">
            <div className="space-y-4 px-6 py-6">
              <Dialog.Title className="text-xl font-semibold text-[var(--foreground)]">Delete task</Dialog.Title>
              <p className="text-sm text-[var(--muted-foreground)]">
                This will remove the task and its report update history for this item.
              </p>
            </div>
            <div className="flex justify-end gap-3 border-t border-[var(--panel-border)] px-6 py-5">
              <Dialog.Close asChild>
                <Button type="button" variant="outline">
                  Cancel
                </Button>
              </Dialog.Close>
              <Button className="button-force-white bg-rose-500 hover:bg-rose-600" disabled={deleting} onClick={deleteTask} type="button">
                {deleting ? "Deleting..." : "Delete Task"}
              </Button>
            </div>
          </Dialog.Content>
        </Dialog.Portal>
      </Dialog.Root>
    </div>
  );
}
