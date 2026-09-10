"use client";

import * as Dialog from "@radix-ui/react-dialog";
import { CheckCircle2, ClipboardCheck, CornerDownLeft, X } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { toast } from "sonner";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";

type AssignmentReview = {
  id: string;
  status: "pending" | "approved" | "rejected";
  submitNote: string;
  reviewNote: string | null;
  createdAt: Date | string;
  reviewedAt: Date | string | null;
  requestedById: string;
  reviewerId: string | null;
} | null;

function parseResponse(raw: string) {
  try {
    return raw ? JSON.parse(raw) : { message: "Assignment review action failed." };
  } catch {
    return { message: "The server returned an unexpected response." };
  }
}

function reviewVariant(status?: "pending" | "approved" | "rejected" | null) {
  if (status === "approved") return "success";
  if (status === "rejected") return "warning";
  return "purple";
}

export function AssignmentReviewControls({
  taskId,
  taskTitle,
  mode,
  latestReview,
}: {
  taskId: string;
  taskTitle: string;
  mode: "assignee" | "assigner";
  latestReview: AssignmentReview;
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [submitNote, setSubmitNote] = useState(latestReview?.status === "rejected" ? latestReview.submitNote : "");
  const [reviewNote, setReviewNote] = useState(latestReview?.reviewNote ?? "");
  const [saving, setSaving] = useState(false);

  async function runAction(action: "submit" | "approve" | "reject", note: string) {
    setSaving(true);
    const response = await fetch(`/api/dashboard/assignments/${taskId}/review`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action, note }),
    });
    const raw = await response.text();
    const result = parseResponse(raw);
    setSaving(false);

    if (!response.ok) {
      toast.error(result.message);
      return;
    }

    toast.success(result.message);
    setOpen(false);
    router.refresh();
  }

  const assigneeLabel =
    latestReview?.status === "approved"
      ? "Approved"
      : latestReview?.status === "pending"
        ? "Waiting Approval"
        : latestReview?.status === "rejected"
          ? "Needs Update"
          : "Not Submitted";

  return (
    <div className="flex flex-wrap items-center gap-2">
      <Badge variant={reviewVariant(latestReview?.status ?? null)}>{assigneeLabel}</Badge>
      <Dialog.Root
        onOpenChange={(nextOpen) => {
          setOpen(nextOpen);
          if (nextOpen) {
            setSubmitNote(latestReview?.status === "rejected" ? latestReview.submitNote : "");
            setReviewNote(latestReview?.reviewNote ?? "");
          }
        }}
        open={open}
      >
        <Dialog.Trigger asChild>
          <Button className="h-8 rounded-full px-3 text-xs" size="sm" type="button" variant="outline">
            {mode === "assignee" ? (
              <>
                <ClipboardCheck className="h-3.5 w-3.5" />
                {latestReview?.status === "pending" ? "Update Submit" : "Submit"}
              </>
            ) : (
              <>
                <CheckCircle2 className="h-3.5 w-3.5" />
                Review
              </>
            )}
          </Button>
        </Dialog.Trigger>
        <Dialog.Portal>
          <Dialog.Overlay className="fixed inset-0 z-40 bg-slate-950/70 backdrop-blur-sm" />
          <Dialog.Content className="fixed left-1/2 top-1/2 z-50 w-[min(560px,92vw)] -translate-x-1/2 -translate-y-1/2 rounded-[28px] border border-[var(--panel-border)] bg-[var(--panel)] shadow-2xl outline-none">
            <div className="flex items-start justify-between gap-4 border-b border-[var(--panel-border)] px-6 py-5">
              <div>
                <Dialog.Title className="text-xl font-semibold text-[var(--foreground)]">
                  {mode === "assignee" ? "Submit assignment" : "Review assignment"}
                </Dialog.Title>
                <p className="mt-1 text-sm text-[var(--muted-foreground)]">{taskTitle}</p>
              </div>
              <Dialog.Close asChild>
                <Button size="icon" type="button" variant="ghost">
                  <X className="h-4 w-4" />
                </Button>
              </Dialog.Close>
            </div>
            <div className="space-y-4 px-6 py-6">
              {latestReview?.submitNote ? (
                <div className="rounded-2xl border border-[var(--panel-border)] bg-[var(--panel-muted)] p-4 text-sm">
                  <p className="text-xs font-semibold uppercase tracking-[0.16em] text-[var(--muted-foreground)]">Latest submit note</p>
                  <p className="mt-2 whitespace-pre-line text-[var(--foreground)]">{latestReview.submitNote}</p>
                </div>
              ) : null}

              {mode === "assignee" ? (
                <div>
                  <p className="mb-2 text-sm font-medium text-[var(--foreground)]">Submit note</p>
                  <Textarea
                    onChange={(event) => setSubmitNote(event.target.value)}
                    placeholder="Write what you completed, what remains, or any important update."
                    rows={5}
                    value={submitNote}
                  />
                  {latestReview?.reviewNote ? (
                    <div className="mt-3 rounded-2xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-800">
                      <p className="text-xs font-semibold uppercase tracking-[0.16em]">Reviewer note</p>
                      <p className="mt-2 whitespace-pre-line">{latestReview.reviewNote}</p>
                    </div>
                  ) : null}
                </div>
              ) : (
                <div>
                  <p className="mb-2 text-sm font-medium text-[var(--foreground)]">Approval note</p>
                  <Textarea
                    onChange={(event) => setReviewNote(event.target.value)}
                    placeholder="Write what was good, or what still needs to be fixed."
                    rows={5}
                    value={reviewNote}
                  />
                </div>
              )}
            </div>
            <div className="flex flex-wrap justify-end gap-3 border-t border-[var(--panel-border)] px-6 py-5">
              <Dialog.Close asChild>
                <Button type="button" variant="outline">
                  Close
                </Button>
              </Dialog.Close>
              {mode === "assignee" ? (
                <Button className="button-force-white" disabled={saving} onClick={() => runAction("submit", submitNote)} type="button">
                  {saving ? "Submitting..." : "Submit For Approval"}
                </Button>
              ) : (
                <>
                  <Button
                    className="button-force-white bg-amber-500 hover:bg-amber-600"
                    disabled={saving}
                    onClick={() => runAction("reject", reviewNote)}
                    type="button"
                  >
                    <CornerDownLeft className="h-4 w-4" />
                    {saving ? "Saving..." : "Ask Update"}
                  </Button>
                  <Button className="button-force-white bg-emerald-500 hover:bg-emerald-600" disabled={saving} onClick={() => runAction("approve", reviewNote)} type="button">
                    <CheckCircle2 className="h-4 w-4" />
                    {saving ? "Saving..." : "Approve"}
                  </Button>
                </>
              )}
            </div>
          </Dialog.Content>
        </Dialog.Portal>
      </Dialog.Root>
    </div>
  );
}
