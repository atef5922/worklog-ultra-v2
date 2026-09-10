import { getDhakaCutoffIso, parseDhakaDateTime, toDateOnly } from "@/lib/utils";

function getTimeDiffInMinutes(start: Date, end: Date) {
  return Math.max(0, Math.floor((end.getTime() - start.getTime()) / 60000));
}

function isSameDhakaMinute(left?: Date | string | null, right?: Date | string | null) {
  const leftDate = parseDhakaDateTime(left);
  const rightDate = parseDhakaDateTime(right);

  if (!leftDate || !rightDate) {
    return false;
  }

  return Math.abs(leftDate.getTime() - rightDate.getTime()) < 60_000;
}

export function calculateTaskOvertimeMinutes(input: {
  planDate: Date | string;
  actualStart?: Date | string | null;
  actualEnd?: Date | string | null;
}) {
  const actualEnd = parseDhakaDateTime(input.actualEnd);

  if (!actualEnd) {
    return 0;
  }

  const cutoff = parseDhakaDateTime(getDhakaCutoffIso(toDateOnly(input.planDate), 19, 30));

  if (!cutoff || actualEnd <= cutoff) {
    return 0;
  }

  const actualStart = parseDhakaDateTime(input.actualStart);
  const overtimeStart = actualStart && actualStart > cutoff ? actualStart : cutoff;

  if (actualEnd <= overtimeStart) {
    return 0;
  }

  return getTimeDiffInMinutes(overtimeStart, actualEnd);
}

export function getTaskAutoStopLabel(input: {
  planDate: Date | string;
  status?: "done" | "in_progress" | "pending" | null;
  actualEnd?: Date | string | null;
}) {
  if (input.status === "done" || !input.actualEnd) {
    return null;
  }

  const day = toDateOnly(input.planDate);
  const regularCutoff = getDhakaCutoffIso(day, 19, 30);
  const overtimeCutoff = getDhakaCutoffIso(day, 22, 0);

  if (isSameDhakaMinute(input.actualEnd, regularCutoff)) {
    return "Auto-stopped at 7:30 PM";
  }

  if (isSameDhakaMinute(input.actualEnd, overtimeCutoff)) {
    return "Auto-stopped at 10:00 PM";
  }

  return null;
}
