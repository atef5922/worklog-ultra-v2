export const CONTINUATION_MARKER = "[continued-task]";

function cleanLine(value?: string | null) {
  return (value ?? "").trim();
}

export function stripContinuationMeta(description?: string | null) {
  if (!description) {
    return "";
  }

  const markerIndex = description.indexOf(CONTINUATION_MARKER);
  if (markerIndex === -1) {
    return description.trim();
  }

  return description.slice(0, markerIndex).trim();
}

type ContinuationDayLog = {
  date: string;
  progress: number;
  trackedMinutes: number;
  note: string;
};

function parsePositiveInteger(value: string) {
  const match = value.match(/\d+/);
  return match ? Number(match[0]) : 0;
}

function parseDailyLogLine(line: string): ContinuationDayLog | null {
  if (!line.startsWith("- ")) {
    return null;
  }

  const content = line.slice(2).trim();
  const parts = content.split("|").map((part) => part.trim());
  if (!parts[0]) {
    return null;
  }

  return {
    date: parts[0],
    progress: parsePositiveInteger(parts[1] ?? "0"),
    trackedMinutes: parsePositiveInteger(parts[2] ?? "0"),
    note: (parts[3] ?? "").replace(/^note\s*:\s*/i, "").trim(),
  };
}

export function buildContinuationDescription(input: {
  originalDescription?: string | null;
  sourceDate: string;
  completionPercent: number;
  trackedMinutes: number;
  note?: string | null;
}) {
  const baseDescription = stripContinuationMeta(input.originalDescription);
  const existingMeta = extractContinuationMeta(input.originalDescription);
  const dailyLogs = [...(existingMeta?.dailyLogs ?? [])];
  const nextLog: ContinuationDayLog = {
    date: input.sourceDate,
    progress: Math.max(0, Math.round(input.completionPercent)),
    trackedMinutes: Math.max(0, Math.round(input.trackedMinutes)),
    note: cleanLine(input.note),
  };
  const existingIndex = dailyLogs.findIndex((entry) => entry.date === input.sourceDate);

  if (existingIndex >= 0) {
    dailyLogs[existingIndex] = nextLog;
  } else {
    dailyLogs.push(nextLog);
  }

  dailyLogs.sort((left, right) => left.date.localeCompare(right.date));
  const totalTrackedMinutes = dailyLogs.reduce((sum, entry) => sum + entry.trackedMinutes, 0);
  const sourceStartDate = dailyLogs[0]?.date || existingMeta?.sourceDate || input.sourceDate;
  const summaryLines = [
    CONTINUATION_MARKER,
    `Continued from: ${sourceStartDate}`,
    `Days active: ${dailyLogs.length}`,
    `Progress reached: ${input.completionPercent}%`,
    `Time logged: ${totalTrackedMinutes} min`,
    "Daily log:",
    ...dailyLogs.map(
      (entry) =>
        `- ${entry.date} | ${entry.progress}% | ${entry.trackedMinutes} min${entry.note ? ` | note: ${entry.note}` : ""}`,
    ),
    cleanLine(input.note) ? `Last note: ${cleanLine(input.note)}` : "",
  ].filter(Boolean);

  return [baseDescription, summaryLines.join("\n")].filter(Boolean).join("\n\n").trim();
}

export function extractContinuationMeta(description?: string | null) {
  if (!description || !description.includes(CONTINUATION_MARKER)) {
    return null;
  }

  const lines = description
    .split("\n")
    .map((line) => line.trim())
    .filter(Boolean);

  const fromLine = lines.find((line) => line.startsWith("Continued from:"));
  const progressLine = lines.find((line) => line.startsWith("Progress reached:"));
  const timeLine = lines.find((line) => line.startsWith("Time logged:"));
  const daysLine = lines.find((line) => line.startsWith("Days active:"));
  const noteLine = lines.find((line) => line.startsWith("Last note:"));
  const dailyLogs = lines.map(parseDailyLogLine).filter((entry): entry is ContinuationDayLog => Boolean(entry));

  return {
    sourceDate: fromLine?.replace("Continued from:", "").trim() ?? "",
    daysActive: parsePositiveInteger(daysLine?.replace("Days active:", "").trim() ?? String(dailyLogs.length || 0)),
    progressLabel: progressLine?.replace("Progress reached:", "").trim() ?? "",
    timeLabel: timeLine?.replace("Time logged:", "").trim() ?? "",
    note: noteLine?.replace("Last note:", "").trim() ?? "",
    dailyLogs,
  };
}
