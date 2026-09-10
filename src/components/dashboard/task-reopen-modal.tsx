"use client";

import * as Dialog from "@radix-ui/react-dialog";
import { Clock3, RotateCcw, X } from "lucide-react";
import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { formatTimeOnlyInDhaka } from "@/lib/utils";

function formatTrackedMinutes(totalMinutes: number) {
  const safeMinutes = Math.max(0, Math.round(totalMinutes));
  return `${Math.floor(safeMinutes / 60)}h ${String(
    safeMinutes % 60,
  ).padStart(2, "0")}m`;
}

export function TaskReopenModal({
  actualEnd,
  completionNote,
  onOpenChange,
  onSave,
  open,
  saving = false,
  taskTitle,
  trackedMinutes,
}: {
  actualEnd?: string | null;
  completionNote?: string | null;
  onOpenChange: (open: boolean) => void;
  onSave: (reason: string) => Promise<void>;
  open: boolean;
  saving?: boolean;
  taskTitle: string;
  trackedMinutes: number;
}) {
  const [reason, setReason] = useState("");
  const normalizedReason = reason.trim();
  const reasonIsValid =
    normalizedReason.length >= 10 && normalizedReason.length <= 500;

  useEffect(() => {
    if (open) setReason("");
  }, [open, taskTitle]);

  return (
    <Dialog.Root onOpenChange={onOpenChange} open={open}>
      <Dialog.Portal>
        <Dialog.Overlay className="fixed inset-0 z-40 bg-slate-950/70 backdrop-blur-sm" />
        <Dialog.Content className="fixed left-1/2 top-1/2 z-50 w-[min(500px,92vw)] -translate-x-1/2 -translate-y-1/2 overflow-hidden rounded-[24px] border border-slate-200 bg-white shadow-[0_28px_80px_rgba(15,23,42,0.28)] outline-none">
          <div className="flex items-start justify-between gap-4 border-b border-slate-200 px-6 py-5">
            <div className="min-w-0">
              <div className="flex items-center gap-2">
                <span className="inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-indigo-50 text-indigo-600">
                  <RotateCcw className="h-4 w-4" />
                </span>
                <div className="min-w-0">
                  <Dialog.Title className="text-lg font-bold text-slate-900">
                    Reopen Task
                  </Dialog.Title>
                  <Dialog.Description
                    className="truncate text-sm text-slate-500"
                    title={taskTitle}
                  >
                    {taskTitle}
                  </Dialog.Description>
                </div>
              </div>
            </div>
            <Dialog.Close asChild>
              <button
                aria-label="Close reopen task dialog"
                className="inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-lg border border-slate-200 text-slate-400 transition-colors hover:bg-slate-50 hover:text-slate-700"
                disabled={saving}
                type="button"
              >
                <X className="h-4 w-4" />
              </button>
            </Dialog.Close>
          </div>

          <div className="space-y-5 px-6 py-5">
            <div className="grid grid-cols-2 divide-x divide-slate-200 overflow-hidden rounded-xl border border-slate-200 bg-slate-50">
              <div className="px-4 py-3">
                <p className="text-[0.65rem] font-bold uppercase tracking-[0.1em] text-slate-500">
                  Completed at
                </p>
                <p className="mt-1 text-sm font-semibold text-slate-900">
                  {actualEnd ? formatTimeOnlyInDhaka(actualEnd) : "--:--"}
                </p>
              </div>
              <div className="px-4 py-3">
                <p className="text-[0.65rem] font-bold uppercase tracking-[0.1em] text-slate-500">
                  Time recorded
                </p>
                <p className="mt-1 inline-flex items-center gap-1.5 text-sm font-semibold text-slate-900">
                  <Clock3 className="h-3.5 w-3.5 text-indigo-500" />
                  {formatTrackedMinutes(trackedMinutes)}
                </p>
              </div>
            </div>

            {completionNote ? (
              <div className="rounded-xl border border-slate-200 bg-white px-4 py-3">
                <p className="text-[0.65rem] font-bold uppercase tracking-[0.1em] text-slate-500">
                  Previous completion note
                </p>
                <p className="mt-1.5 line-clamp-3 text-sm leading-5 text-slate-700">
                  {completionNote}
                </p>
              </div>
            ) : null}

            <div>
              <Label className="mb-2 block" htmlFor="reopen-reason">
                Why are you reopening this task?
              </Label>
              <Textarea
                autoFocus
                id="reopen-reason"
                maxLength={500}
                onChange={(event) => setReason(event.target.value)}
                placeholder="Describe what is incomplete or what needs correction..."
                rows={4}
                value={reason}
              />
              <div className="mt-1.5 flex items-center justify-between gap-3 text-xs">
                <p
                  className={
                    normalizedReason.length > 0 &&
                    normalizedReason.length < 10
                      ? "text-rose-600"
                      : "text-slate-500"
                  }
                >
                  Minimum 10 characters
                </p>
                <span className="tabular-nums text-slate-400">
                  {reason.length}/500
                </span>
              </div>
            </div>
          </div>

          <div className="flex justify-end gap-3 border-t border-slate-200 bg-slate-50/70 px-6 py-4">
            <Dialog.Close asChild>
              <Button disabled={saving} type="button" variant="outline">
                Cancel
              </Button>
            </Dialog.Close>
            <Button
              className="button-force-white"
              disabled={saving || !reasonIsValid}
              onClick={() => onSave(normalizedReason)}
              type="button"
            >
              <RotateCcw className={`h-4 w-4 ${saving ? "animate-spin" : ""}`} />
              {saving ? "Reopening..." : "Reopen Task"}
            </Button>
          </div>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}
