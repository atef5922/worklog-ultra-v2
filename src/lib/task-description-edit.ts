import { CONTINUATION_MARKER } from "@/lib/task-continuation";
import { FOLLOW_UP_MARKER } from "@/lib/task-follow-up";
import { HISTORY_DONE_MARKER } from "@/lib/task-history-shared";
import { RECURRING_TASK_MARKER } from "@/lib/recurring-task-templates";
import { getReadableTaskDescription } from "@/lib/report-summary";
import { TASK_REOPEN_MARKER } from "@/lib/task-reopen";

const TASK_METADATA_MARKERS = [
  CONTINUATION_MARKER,
  FOLLOW_UP_MARKER,
  RECURRING_TASK_MARKER,
  HISTORY_DONE_MARKER,
  TASK_REOPEN_MARKER,
] as const;

/**
 * Replaces only the human-authored portion of a task description.
 *
 * Workflow state is currently embedded after one of the known marker lines.
 * Inline editing must keep that suffix byte-for-byte or a harmless description
 * edit could silently disable carry-over, recurrence, follow-up, history or
 * reopen behavior.
 */
export function replaceReadableTaskDescription(
  existingRawDescription: string | null | undefined,
  nextDescription: string | null | undefined,
) {
  const existingRaw = existingRawDescription ?? "";
  const markerIndexes = TASK_METADATA_MARKERS
    .map((marker) => existingRaw.indexOf(marker))
    .filter((index) => index >= 0);
  const firstMarkerIndex = markerIndexes.length ? Math.min(...markerIndexes) : -1;
  const metadataSuffix =
    firstMarkerIndex >= 0 ? existingRaw.slice(firstMarkerIndex).trim() : "";
  const readableDescription = getReadableTaskDescription(nextDescription);

  return [readableDescription, metadataSuffix].filter(Boolean).join("\n\n").trim();
}
