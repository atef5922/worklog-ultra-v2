export const FOLLOW_UP_MARKER = "[follow-up-reminder]";

function cleanLine(value?: string | null) {
  return (value ?? "").trim();
}

export function stripFollowUpMeta(description?: string | null) {
  if (!description) {
    return "";
  }

  const markerIndex = description.indexOf(FOLLOW_UP_MARKER);
  if (markerIndex === -1) {
    return description.trim();
  }

  return description.slice(0, markerIndex).trim();
}

export function buildFollowUpDescription(input: {
  originalDescription?: string | null;
  sourceTaskId: string;
  scheduledDate: string;
  scheduledTime: string;
  reminderNote?: string | null;
  completionStatus?: "done" | "partial";
}) {
  const baseDescription = stripFollowUpMeta(input.originalDescription);
  const summaryLines = [
    FOLLOW_UP_MARKER,
    `Source task: ${input.sourceTaskId}`,
    `Scheduled date: ${input.scheduledDate}`,
    `Scheduled time: ${input.scheduledTime}`,
    input.completionStatus === "partial" ? "Follow-up type: partial completion" : "Follow-up type: revisit",
    cleanLine(input.reminderNote) ? `Reminder note: ${cleanLine(input.reminderNote)}` : "",
  ].filter(Boolean);

  return [baseDescription, summaryLines.join("\n")].filter(Boolean).join("\n\n").trim();
}

export function extractFollowUpMeta(description?: string | null) {
  if (!description || !description.includes(FOLLOW_UP_MARKER)) {
    return null;
  }

  const lines = description
    .split("\n")
    .map((line) => line.trim())
    .filter(Boolean);

  const sourceLine = lines.find((line) => line.startsWith("Source task:"));
  const dateLine = lines.find((line) => line.startsWith("Scheduled date:"));
  const timeLine = lines.find((line) => line.startsWith("Scheduled time:"));
  const typeLine = lines.find((line) => line.startsWith("Follow-up type:"));
  const noteLine = lines.find((line) => line.startsWith("Reminder note:"));

  return {
    sourceTaskId: sourceLine?.replace("Source task:", "").trim() ?? "",
    scheduledDate: dateLine?.replace("Scheduled date:", "").trim() ?? "",
    scheduledTime: timeLine?.replace("Scheduled time:", "").trim() ?? "",
    followUpType: typeLine?.replace("Follow-up type:", "").trim() ?? "",
    reminderNote: noteLine?.replace("Reminder note:", "").trim() ?? "",
  };
}

export function isFollowUpTask(description?: string | null) {
  return Boolean(description?.includes(FOLLOW_UP_MARKER));
}

export function isFollowUpDueNow(meta: ReturnType<typeof extractFollowUpMeta>, now = new Date()) {
  if (!meta?.scheduledDate || !meta.scheduledTime) {
    return false;
  }

  const today = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Dhaka",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(now);

  if (meta.scheduledDate !== today) {
    return false;
  }

  const [hours, minutes] = meta.scheduledTime.split(":").map((part) => Number(part));
  if (!Number.isFinite(hours) || !Number.isFinite(minutes)) {
    return false;
  }

  const dhakaParts = new Intl.DateTimeFormat("en-BD", {
    timeZone: "Asia/Dhaka",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  }).formatToParts(now);

  const currentHour = Number(dhakaParts.find((part) => part.type === "hour")?.value ?? "0");
  const currentMinute = Number(dhakaParts.find((part) => part.type === "minute")?.value ?? "0");
  const currentTotal = currentHour * 60 + currentMinute;
  const scheduledTotal = hours * 60 + minutes;

  return currentTotal >= scheduledTotal;
}
