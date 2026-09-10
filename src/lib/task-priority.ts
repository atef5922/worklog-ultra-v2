/**
 * One vocabulary for task priority.
 *
 * The same four stored values used to be labelled three different ways: raw and
 * lowercase (`critical`) in the add-task form, prose ("High Priority",
 * "Important") in the edit dialog, and a collapsed pair on the dashboard card,
 * where both `critical` and `high` rendered as "High". Picking a priority and
 * then reading a different word back on the card is what made a new task look
 * like it had lost the priority it was given, so every surface reads its label,
 * its option list and its sort order from here.
 */
export const TASK_PRIORITIES = ["critical", "high", "normal", "low"] as const;

export type TaskPriority = (typeof TASK_PRIORITIES)[number];

const TASK_PRIORITY_LABELS: Record<TaskPriority, string> = {
  critical: "Critical",
  high: "High",
  normal: "Medium",
  low: "Low",
};

/** Highest first, which is the order every picker lists them in. */
export const TASK_PRIORITY_OPTIONS = TASK_PRIORITIES.map((value) => ({
  value,
  label: TASK_PRIORITY_LABELS[value],
}));

export function isTaskPriority(value: unknown): value is TaskPriority {
  return typeof value === "string" && (TASK_PRIORITIES as readonly string[]).includes(value);
}

/** Anything unrecognised falls back to the column default instead of rendering a raw value. */
export function normalizeTaskPriority(value: unknown): TaskPriority {
  return isTaskPriority(value) ? value : "normal";
}

export function formatTaskPriority(value: unknown) {
  return TASK_PRIORITY_LABELS[normalizeTaskPriority(value)];
}

/** Sort key: 0 is the most urgent, so `left - right` puts Critical at the top. */
export function taskPriorityRank(value: unknown) {
  return TASK_PRIORITIES.indexOf(normalizeTaskPriority(value));
}
