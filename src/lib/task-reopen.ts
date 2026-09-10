/**
 * The marker that says a task came back from Complete into Today's Work Plan.
 *
 * Restoring a finished task only flips its update row back to in_progress or
 * pending, and that leaves the card indistinguishable from one that was never
 * finished at all — the same status, the same tracked minutes, no trace of the
 * round trip. Stamping the description is how the dashboard can tell the two
 * apart after a refresh, the same way [moved-to-history] and the follow-up and
 * continuation markers already carry their own state through the column.
 *
 * The marker is dropped again the moment the task is completed a second time:
 * it describes an open task that was reopened, not a permanent property of the
 * task.
 */
export const TASK_REOPEN_MARKER = "[reopened-from-complete]";

const REOPENED_AT_PREFIX = "Reopened at:";

export function isReopenedTask(description?: string | null) {
  return Boolean(description?.includes(TASK_REOPEN_MARKER));
}

export function stripReopenMeta(description?: string | null) {
  if (!description) {
    return "";
  }

  if (!description.includes(TASK_REOPEN_MARKER)) {
    return description.trim();
  }

  return description
    .split("\n")
    .filter((line) => {
      const trimmed = line.trim();
      return trimmed !== TASK_REOPEN_MARKER && !trimmed.startsWith(REOPENED_AT_PREFIX);
    })
    .join("\n")
    .trim();
}

export function embedReopenMeta(description?: string | null, reopenedAt: string | Date = new Date()) {
  const cleaned = stripReopenMeta(description);
  const stamp = reopenedAt instanceof Date ? reopenedAt.toISOString() : reopenedAt;

  return [cleaned, `${TASK_REOPEN_MARKER}\n${REOPENED_AT_PREFIX} ${stamp}`].filter(Boolean).join("\n\n").trim();
}

export function extractReopenMeta(description?: string | null) {
  if (!isReopenedTask(description)) {
    return null;
  }

  const stampLine = (description ?? "")
    .split("\n")
    .map((line) => line.trim())
    .find((line) => line.startsWith(REOPENED_AT_PREFIX));

  return {
    reopenedAt: stampLine?.slice(REOPENED_AT_PREFIX.length).trim() ?? "",
  };
}
