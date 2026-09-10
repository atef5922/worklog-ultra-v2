import { NextRequest } from "next/server";
import { UserRole } from "@prisma/client";
import { apiError, apiSuccess } from "@/lib/api";
import { embedAttendanceOvertimeMeta } from "@/lib/attendance-overtime";
import { getServerAuthContext, requireUser } from "@/lib/auth/server";
import { db } from "@/lib/db";
import { attendanceUpdateSchema } from "@/lib/validators/worklog";
import { calculateMinutesBetween, getDhakaCutoffIso, toDateOnly } from "@/lib/utils";

/**
 * Authoritative "is this employee's work session open right now" check.
 *
 * The desktop agent's screenshot monitor polls this instead of trusting its
 * own renderer state: it is what lets monitoring resume correctly after an
 * app restart, and what lets the agent self-heal if it ever misses the IPC
 * stop signal (crash, missed event) while attendance ended through the web
 * UI on another device. Uses `getServerAuthContext` rather than `requireUser`
 * because a background agent needs a 401 it can act on, not a redirect to an
 * HTML login page.
 */
export async function GET() {
  const { user } = await getServerAuthContext();

  if (!user) {
    return apiError("Authentication required.", 401);
  }

  const today = toDateOnly();
  const record = await db.attendanceRecord.findUnique({
    where: {
      userId_attendanceDate: {
        userId: user.id,
        attendanceDate: new Date(`${today}T00:00:00.000Z`),
      },
    },
    select: { checkInAt: true, checkOutAt: true, breakMinutes: true },
  });

  const active = Boolean(record?.checkInAt && !record.checkOutAt);

  return apiSuccess({
    userId: user.id,
    active,
    checkInAt: record?.checkInAt?.toISOString() ?? null,
    checkOutAt: record?.checkOutAt?.toISOString() ?? null,
  });
}

/**
 * An empty string is the client saying "clear this field"; an absent field means
 * "leave what is stored alone". Treating both as absent is what let a stale check
 * out survive: starting a new session sends checkOutAt: "", and the old value was
 * read back off the existing record, so the day stayed marked as completed with
 * yesterday's out time while the timer was visibly running.
 */
function resolveTimestamp(value: string | undefined, existing: Date | null) {
  if (value === undefined) {
    return existing;
  }

  if (value === "") {
    return null;
  }

  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime()) ? existing : parsed;
}

export async function POST(request: NextRequest) {
  const user = await requireUser();
  const attendanceModel = (db as unknown as {
    attendanceRecord?: {
      findUnique?: (args: Record<string, unknown>) => Promise<{
        id: string;
        userId: string;
        attendanceDate: Date;
        status: "present" | "late" | "half_day" | "absent" | "remote";
        note: string | null;
        checkInAt: Date | null;
        checkOutAt: Date | null;
        breakMinutes: number;
        workingMinutes: number;
      } | null>;
      upsert: (args: Record<string, unknown>) => Promise<unknown>;
    };
  }).attendanceRecord;
  const body = await request.json();
  const parsed = attendanceUpdateSchema.safeParse(body);

  if (!parsed.success) {
    return apiError(parsed.error.issues[0]?.message ?? "Invalid attendance payload.");
  }

  if (!attendanceModel) {
    return apiError("Attendance module is not ready yet. Restart the server once to load the latest attendance client.");
  }

  const targetDate = toDateOnly(parsed.data.attendanceDate);
  if (user.role === UserRole.employee && targetDate !== toDateOnly()) {
    return apiError("Employees can only update today's attendance.");
  }

  const existingRecord = attendanceModel.findUnique
    ? await attendanceModel.findUnique({
        where: {
          userId_attendanceDate: {
            userId: user.id,
            attendanceDate: new Date(targetDate),
          },
        },
      })
    : null;

  const finalCheckInAt = resolveTimestamp(parsed.data.checkInAt, existingRecord?.checkInAt ?? null);
  const finalActualCheckOutAt = resolveTimestamp(parsed.data.checkOutAt, existingRecord?.checkOutAt ?? null);

  if (finalCheckInAt && finalActualCheckOutAt && finalActualCheckOutAt.getTime() < finalCheckInAt.getTime()) {
    return apiError("Check Out time cannot be earlier than Check In time.");
  }

  const cutoffAt = new Date(getDhakaCutoffIso(targetDate, 19, 30));
  const now = new Date();
  const autoClosedAt =
    finalCheckInAt && !finalActualCheckOutAt && toDateOnly(now) === targetDate && now.getTime() >= cutoffAt.getTime()
      ? cutoffAt
      : null;
  const actualCheckOutForOvertime = finalActualCheckOutAt ?? autoClosedAt;
  const effectiveCheckOutAt =
    actualCheckOutForOvertime && actualCheckOutForOvertime.getTime() > cutoffAt.getTime()
      ? cutoffAt
      : actualCheckOutForOvertime;
  const workingMinutes = Math.max(0, calculateMinutesBetween(finalCheckInAt, effectiveCheckOutAt) - parsed.data.breakMinutes);
  const overtimeMinutes =
    finalCheckInAt && finalActualCheckOutAt && finalActualCheckOutAt.getTime() > cutoffAt.getTime()
      ? Math.max(
          0,
          calculateMinutesBetween(
            finalCheckInAt.getTime() > cutoffAt.getTime() ? finalCheckInAt : cutoffAt,
            finalActualCheckOutAt,
          ),
        )
      : 0;
  const finalNote = embedAttendanceOvertimeMeta(parsed.data.note || "", {
    overtimeMinutes,
    actualCheckOutAt:
      finalActualCheckOutAt && finalActualCheckOutAt.getTime() > cutoffAt.getTime()
        ? finalActualCheckOutAt.toISOString()
        : null,
    autoClosedAt: autoClosedAt?.toISOString() ?? null,
  });

  const record = await attendanceModel.upsert({
    where: {
      userId_attendanceDate: {
        userId: user.id,
        attendanceDate: new Date(targetDate),
      },
    },
    update: {
      status: parsed.data.status,
      note: finalNote || null,
      checkInAt: finalCheckInAt,
      checkOutAt: effectiveCheckOutAt,
      breakMinutes: parsed.data.breakMinutes,
      workingMinutes,
    },
    create: {
      userId: user.id,
      attendanceDate: new Date(targetDate),
      status: parsed.data.status,
      note: finalNote || null,
      checkInAt: finalCheckInAt,
      checkOutAt: effectiveCheckOutAt,
      breakMinutes: parsed.data.breakMinutes,
      workingMinutes,
    },
  });

  return apiSuccess({
    message: "Attendance updated successfully.",
    record,
  });
}
