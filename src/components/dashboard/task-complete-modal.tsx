"use client";

import * as Dialog from "@radix-ui/react-dialog";
import { X } from "lucide-react";
import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";

export type TaskCompletionPayload = {
  completionStatus: "done" | "partial";
  completionNote: string;
  needFollowUp: boolean;
  followUpDate: string;
  followUpTime: string;
  followUpNote: string;
};

type TaskCompleteModalProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  taskTitle: string;
  saving?: boolean;
  onSave: (payload: TaskCompletionPayload) => Promise<void>;
};

export function TaskCompleteModal({
  open,
  onOpenChange,
  taskTitle,
  saving = false,
  onSave,
}: TaskCompleteModalProps) {
  const [completionNote, setCompletionNote] = useState("");

  useEffect(() => {
    if (!open) {
      return;
    }

    setCompletionNote("");
  }, [open, taskTitle]);

  async function handleSave() {
    await onSave({
      completionStatus: "done",
      completionNote: completionNote.trim(),
      needFollowUp: false,
      followUpDate: "",
      followUpTime: "",
      followUpNote: "",
    });
  }

  return (
    <Dialog.Root onOpenChange={onOpenChange} open={open}>
      <Dialog.Portal>
        <Dialog.Overlay className="fixed inset-0 z-40 bg-slate-950/70 backdrop-blur-sm" />
        <Dialog.Content className="fixed left-1/2 top-1/2 z-50 max-h-[90vh] w-[min(560px,92vw)] -translate-x-1/2 -translate-y-1/2 overflow-y-auto rounded-[28px] border border-[var(--panel-border)] bg-[var(--panel)] shadow-2xl outline-none">
          <div className="flex items-start justify-between gap-4 border-b border-[var(--panel-border)] px-6 py-5">
            <div>
              <Dialog.Title className="text-xl font-semibold text-[var(--foreground)]">Complete Task</Dialog.Title>
              <p className="mt-1 text-sm text-[var(--muted-foreground)]">{taskTitle}</p>
            </div>
            <Dialog.Close asChild>
              <Button disabled={saving} size="icon" type="button" variant="ghost">
                <X className="h-4 w-4" />
              </Button>
            </Dialog.Close>
          </div>

          <div className="space-y-5 px-6 py-6">
            <div>
              <Label className="mb-2 block">Task completion status</Label>
              <div className="rounded-2xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm font-semibold text-emerald-800">
                Done / Fully Completed
              </div>
            </div>

            <div>
              <Label htmlFor="completion-note">Completion note</Label>
              <Textarea
                id="completion-note"
                onChange={(event) => setCompletionNote(event.target.value)}
                placeholder="Add any notes about what was completed..."
                rows={4}
                value={completionNote}
              />
            </div>

          </div>

          <div className="flex justify-end gap-3 border-t border-[var(--panel-border)] px-6 py-5">
            <Dialog.Close asChild>
              <Button disabled={saving} type="button" variant="outline">
                Cancel
              </Button>
            </Dialog.Close>
            <Button
              className="button-force-white"
              disabled={saving}
              onClick={handleSave}
              type="button"
            >
              {saving ? "Saving..." : "Save"}
            </Button>
          </div>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}
