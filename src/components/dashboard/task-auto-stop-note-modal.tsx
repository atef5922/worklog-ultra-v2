"use client";

import * as Dialog from "@radix-ui/react-dialog";
import { Clock3, X } from "lucide-react";
import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { formatDateTimeInDhaka } from "@/lib/utils";

type TaskAutoStopNoteModalProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSave: (note: string) => Promise<void>;
  saving?: boolean;
  taskTitle: string;
  initialNote?: string;
  stoppedAt?: string;
};

export function TaskAutoStopNoteModal({
  open,
  onOpenChange,
  onSave,
  saving = false,
  taskTitle,
  initialNote = "",
  stoppedAt = "",
}: TaskAutoStopNoteModalProps) {
  const [note, setNote] = useState(initialNote);

  useEffect(() => {
    if (!open) {
      return;
    }

    setNote(initialNote);
  }, [initialNote, open, taskTitle]);

  const stoppedAtLabel = stoppedAt ? formatDateTimeInDhaka(stoppedAt) : "";

  return (
    <Dialog.Root onOpenChange={onOpenChange} open={open}>
      <Dialog.Portal>
        <Dialog.Overlay className="fixed inset-0 z-40 bg-slate-950/70 backdrop-blur-sm" />
        <Dialog.Content className="fixed left-1/2 top-1/2 z-50 w-[min(540px,92vw)] -translate-x-1/2 -translate-y-1/2 rounded-[28px] border border-[var(--panel-border)] bg-[var(--panel)] shadow-2xl outline-none">
          <div className="flex items-start justify-between gap-4 border-b border-[var(--panel-border)] px-6 py-5">
            <div>
              <Dialog.Title className="text-xl font-semibold text-[var(--foreground)]">Session Auto-Stopped</Dialog.Title>
              <p className="mt-1 text-sm text-[var(--muted-foreground)]">{taskTitle}</p>
            </div>
            <Dialog.Close asChild>
              <Button disabled={saving} size="icon" type="button" variant="ghost">
                <X className="h-4 w-4" />
              </Button>
            </Dialog.Close>
          </div>

          <div className="space-y-4 px-6 py-6">
            <div className="rounded-2xl border border-[#dbe4ff] bg-[#f6f9ff] p-4 text-sm text-slate-700">
              <div className="flex items-center gap-2 font-semibold text-[#3148d8]">
                <Clock3 className="h-4 w-4" />
                Auto stop time saved
              </div>
              <p className="mt-2 text-sm text-slate-600">
                End time has already been recorded{stoppedAtLabel ? ` at ${stoppedAtLabel}` : ""}. You can add a note now if you want.
              </p>
            </div>

            <div>
              <Label htmlFor="auto-stop-note">Optional note</Label>
              <Textarea
                id="auto-stop-note"
                onChange={(event) => setNote(event.target.value)}
                placeholder="Add a quick note about what happened before the session auto-stopped..."
                rows={5}
                value={note}
              />
            </div>
          </div>

          <div className="flex justify-end gap-3 border-t border-[var(--panel-border)] px-6 py-5">
            <Dialog.Close asChild>
              <Button disabled={saving} type="button" variant="outline">
                Skip for now
              </Button>
            </Dialog.Close>
            <Button
              className="button-force-white"
              disabled={saving || !note.trim()}
              onClick={() => onSave(note.trim())}
              type="button"
            >
              {saving ? "Saving..." : "Save Note"}
            </Button>
          </div>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}
