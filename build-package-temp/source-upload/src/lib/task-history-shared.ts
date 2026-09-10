export const HISTORY_DONE_MARKER = "[moved-to-history]";

export function isMovedToHistory(description?: string | null) {
  return Boolean(description?.includes(HISTORY_DONE_MARKER));
}

export function stripHistoryMeta(description?: string | null) {
  if (!description) {
    return "";
  }

  return description.replace(HISTORY_DONE_MARKER, "").trim();
}

export function embedHistoryMeta(description?: string | null) {
  const cleaned = stripHistoryMeta(description);
  return [cleaned, HISTORY_DONE_MARKER].filter(Boolean).join("\n\n").trim();
}
