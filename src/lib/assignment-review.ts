export const ASSIGNMENT_REVIEW_PREFIX = "[assignment-review]";

import {
  type AssignmentAttachment,
  embedAssignmentAttachmentMeta,
  extractAssignmentAttachmentMeta,
} from "@/lib/assignment-attachments";

export function buildAssignmentReviewReason(note: string, attachments: AssignmentAttachment[] = []) {
  const cleanNote = note.trim();
  const payload = embedAssignmentAttachmentMeta(cleanNote, attachments);
  return payload ? `${ASSIGNMENT_REVIEW_PREFIX}\n${payload}` : ASSIGNMENT_REVIEW_PREFIX;
}

export function extractAssignmentReviewReason(reason?: string | null) {
  return extractAssignmentReviewPayload(reason)?.note ?? null;
}

export function extractAssignmentReviewPayload(reason?: string | null) {
  if (!reason || !reason.startsWith(ASSIGNMENT_REVIEW_PREFIX)) {
    return null;
  }

  const payload = reason.slice(ASSIGNMENT_REVIEW_PREFIX.length).trim();
  const parsed = extractAssignmentAttachmentMeta(payload);

  return {
    note: parsed.text,
    attachments: parsed.attachments,
  };
}

export function isAssignmentReviewReason(reason?: string | null) {
  return Boolean(reason && reason.startsWith(ASSIGNMENT_REVIEW_PREFIX));
}
