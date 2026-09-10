export const ATTENDANCE_OVERTIME_MARKER = "[attendance-overtime]";

export function stripAttendanceOvertimeMeta(note?: string | null) {
  if (!note) {
    return "";
  }

  const markerIndex = note.indexOf(ATTENDANCE_OVERTIME_MARKER);
  if (markerIndex === -1) {
    return note.trim();
  }

  return note.slice(0, markerIndex).trim();
}

export function embedAttendanceOvertimeMeta(
  note: string,
  input: {
    overtimeMinutes: number;
    actualCheckOutAt?: string | null;
    autoClosedAt?: string | null;
  },
) {
  const cleanNote = stripAttendanceOvertimeMeta(note);

  if (!input.overtimeMinutes && !input.actualCheckOutAt && !input.autoClosedAt) {
    return cleanNote;
  }

  const payload = {
    overtimeMinutes: Math.max(0, Math.round(input.overtimeMinutes || 0)),
    actualCheckOutAt: input.actualCheckOutAt || null,
    autoClosedAt: input.autoClosedAt || null,
  };

  return [cleanNote, ATTENDANCE_OVERTIME_MARKER, JSON.stringify(payload)].filter(Boolean).join("\n\n").trim();
}

export function extractAttendanceOvertimeMeta(note?: string | null) {
  const text = stripAttendanceOvertimeMeta(note);

  if (!note || !note.includes(ATTENDANCE_OVERTIME_MARKER)) {
    return {
      text,
      overtimeMinutes: 0,
      actualCheckOutAt: null as string | null,
      autoClosedAt: null as string | null,
    };
  }

  const markerIndex = note.indexOf(ATTENDANCE_OVERTIME_MARKER);
  const raw = note.slice(markerIndex + ATTENDANCE_OVERTIME_MARKER.length).trim();

  try {
    const parsed = JSON.parse(raw) as {
      overtimeMinutes?: number;
      actualCheckOutAt?: string | null;
      autoClosedAt?: string | null;
    };

    return {
      text,
      overtimeMinutes: Math.max(0, Math.round(parsed.overtimeMinutes || 0)),
      actualCheckOutAt: parsed.actualCheckOutAt || null,
      autoClosedAt: parsed.autoClosedAt || null,
    };
  } catch {
    return {
      text,
      overtimeMinutes: 0,
      actualCheckOutAt: null as string | null,
      autoClosedAt: null as string | null,
    };
  }
}
