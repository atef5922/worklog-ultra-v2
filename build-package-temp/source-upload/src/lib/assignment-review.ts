export const ASSIGNMENT_REVIEW_PREFIX = "[assignment-review]";

export function buildAssignmentReviewReason(note: string) {
  const cleanNote = note.trim();
  return cleanNote ? `${ASSIGNMENT_REVIEW_PREFIX}\n${cleanNote}` : ASSIGNMENT_REVIEW_PREFIX;
}

export function extractAssignmentReviewReason(reason?: string | null) {
  if (!reason || !reason.startsWith(ASSIGNMENT_REVIEW_PREFIX)) {
    return null;
  }

  return reason.slice(ASSIGNMENT_REVIEW_PREFIX.length).trim();
}

export function isAssignmentReviewReason(reason?: string | null) {
  return Boolean(reason && reason.startsWith(ASSIGNMENT_REVIEW_PREFIX));
}
