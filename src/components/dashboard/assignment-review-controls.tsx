"use client";

import * as Dialog from "@radix-ui/react-dialog";
import { CheckCircle2, ClipboardCheck, CornerDownLeft, Paperclip, X } from "lucide-react";
import { useRouter } from "next/navigation";
import { useId, useState } from "react";
import { toast } from "sonner";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";

type AssignmentReview = {
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
  const fileInputId = useId();
  const [open, setOpen] = useState(false);
  const [submitNote, setSubmitNote] = useState(latestReview?.status === "rejected" ? latestReview.submitNote : "");
  const [reviewNote, setReviewNote] = useState(latestReview?.reviewNote ?? "");
  const [attachments, setAttachments] = useState<File[]>([]);
  const [saving, setSaving] = useState(false);
  const hasPendingSubmission = latestReview?.status === "pending";

  async function runAction(action: "submit" | "approve" | "reject", note: string) {
    setSaving(true);
    const payload = new FormData();
    payload.append("action", action);
    payload.append("note", note);
    attachments.forEach((file) => payload.append("attachments", file));
    const response = await fetch(`/api/dashboard/assignments/${taskId}/review`, {
      method: "POST",
      body: payload,
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
    setAttachments([]);
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
            setAttachments([]);
          }
        }}
        open={open}
      >
        <Dialog.Trigger asChild>
          <Button className="h-8 rounded-full px-3 text-xs" disabled={mode === "assigner" && !hasPendingSubmission} size="sm" type="button" variant="outline">
            {mode === "assignee" ? (
              <>
                <ClipboardCheck className="h-3.5 w-3.5" />
                {latestReview?.status === "pending" ? "Update Submit" : "Submit"}
              </>
            ) : (
              <>
                <CheckCircle2 className="h-3.5 w-3.5" />
                {hasPendingSubmission ? "Review" : "Waiting Submit"}
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
                  {latestReview.submitAttachments?.length ? (
                    <div className="mt-3 flex flex-wrap gap-2">
                      {latestReview.submitAttachments.map((attachment) => (
                        <a
                          key={attachment.fileUrl}
                          className="inline-flex items-center gap-2 rounded-full border border-[var(--panel-border)] bg-[var(--panel)] px-3 py-1 text-xs text-[var(--foreground)] hover:border-cyan-400/50"
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

              {mode === "assignee" ? (
                <div>
                  <p className="mb-2 text-sm font-medium text-[var(--foreground)]">Submit note</p>
                  <Textarea
                    onChange={(event) => setSubmitNote(event.target.value)}
                    placeholder="Write what you completed, what remains, or any important update."
                    rows={5}
                    value={submitNote}
                  />
                  {latestReview?.reviewNote || latestReview?.reviewAttachments?.length ? (
                    <div className="mt-3 rounded-2xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-800">
                      <p className="text-xs font-semibold uppercase tracking-[0.16em]">Reviewer note</p>
                      {latestReview.reviewNote ? <p className="mt-2 whitespace-pre-line">{latestReview.reviewNote}</p> : null}
                      {latestReview.reviewAttachments?.length ? (
                        <div className="mt-3 flex flex-wrap gap-2">
                          {latestReview.reviewAttachments.map((attachment) => (
                            <a
                              key={attachment.fileUrl}
                              className="inline-flex items-center gap-2 rounded-full border border-amber-300 bg-white px-3 py-1 text-xs text-amber-900"
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
              ) : (
                <div>
                  <p className="mb-2 text-sm font-medium text-[var(--foreground)]">Approval note</p>
                  {!hasPendingSubmission ? (
                    <div className="mb-3 rounded-2xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-800">
                      Assignee has not submitted this assignment for approval yet.
                    </div>
                  ) : null}
                  <Textarea
                    disabled={!hasPendingSubmission}
                    onChange={(event) => setReviewNote(event.target.value)}
                    placeholder="Write what was good, or what still needs to be fixed."
                    rows={5}
                    value={reviewNote}
                  />
                </div>
              )}
              <div>
                <p className="mb-2 text-sm font-medium text-[var(--foreground)]">Attachments</p>
                <input
                  className="hidden"
                  id={fileInputId}
                  multiple
                  onChange={(event) => setAttachments(Array.from(event.target.files ?? []))}
                  type="file"
                />
                <label
                  className="flex cursor-pointer items-center justify-between rounded-2xl border border-[var(--panel-border)] bg-[var(--panel-muted)] px-4 py-3 text-sm text-[var(--foreground)]"
                  htmlFor={fileInputId}
                >
                  <span className="inline-flex items-center gap-2 rounded-xl bg-[#4f5ef7] px-3 py-2 text-xs font-semibold text-white">
                    <Paperclip className="h-3.5 w-3.5" />
                    Choose Files
                  </span>
                  <span className="ml-3 truncate text-right text-[var(--muted-foreground)]">
                    {attachments.length
                      ? attachments.length === 1
                        ? attachments[0]?.name
                        : `${attachments.length} files selected`
                      : "Optional supporting files"}
                  </span>
                </label>
                {attachments.length ? (
                  <div className="mt-3 flex flex-wrap gap-2 text-xs text-[var(--muted-foreground)]">
                    {attachments.map((file) => (
                      <span
                        key={`${file.name}-${file.size}`}
                        className="rounded-full border border-[var(--panel-border)] bg-[var(--panel-muted)] px-2.5 py-1"
                      >
                        {file.name}
                      </span>
                    ))}
                  </div>
                ) : null}
              </div>
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
                    disabled={saving || !hasPendingSubmission}
                    onClick={() => runAction("reject", reviewNote)}
                    type="button"
                  >
                    <CornerDownLeft className="h-4 w-4" />
                    {saving ? "Saving..." : "Ask Update"}
                  </Button>
                  <Button className="button-force-white bg-emerald-500 hover:bg-emerald-600" disabled={saving || !hasPendingSubmission} onClick={() => runAction("approve", reviewNote)} type="button">
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
