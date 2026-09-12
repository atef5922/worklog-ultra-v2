import { Prisma } from "@prisma/client";
import { NextRequest } from "next/server";
import { z } from "zod";
import { apiError, apiSuccess } from "@/lib/api";
import { embedAttendanceOvertimeMeta } from "@/lib/attendance-overtime";
import { calculateSegmentedAttendanceMetrics } from "@/lib/attendance-policy";
import { getServerAuthContext, requireUser } from "@/lib/auth/server";
import { db } from "@/lib/db";
import { attendanceStatusSchema } from "@/lib/validators/worklog";
import { toDateOnly } from "@/lib/utils";

const attendanceActionSchema = z.object({
  action: z.enum(["check_in", "check_out", "break_start", "break_end", "update_details"]),
  attendanceDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
  occurredAt: z.string().datetime({ offset: true }).optional(),
  eventId: z.string().trim().min(8).max(200).optional(),
  status: attendanceStatusSchema.optional(),
  note: z.string().trim().max(1000).optional(),
  endReason: z.enum(["manual", "device_shutdown", "device_recovery"]).optional(),
});

const attendanceInclude = {
  workSessions: { orderBy: { startedAt: "asc" as const } },
  breakSessions: { orderBy: { startedAt: "asc" as const } },
} satisfies Prisma.AttendanceRecordInclude;

type AttendanceRecordWithSessions = Prisma.AttendanceRecordGetPayload<{
  include: typeof attendanceInclude;
}>;

function actionTime(value: string | undefined) {
  if (!value) return new Date();
  const parsed = new Date(value);
  if (!Number.isFinite(parsed.getTime())) return null;
  if (parsed.getTime() > Date.now() + 5 * 60_000) return null;
  return parsed;
}

function measureRecord(record: AttendanceRecordWithSessions, now = new Date()) {
  return calculateSegmentedAttendanceMetrics({
    attendanceDate: toDateOnly(record.attendanceDate),
    workSessions: record.workSessions.map((session) => ({
      startedAt: session.startedAt,
      endedAt: session.endedAt,
    })),
    breakSessions: record.breakSessions.map((session) => ({
      startedAt: session.startedAt,
      endedAt: session.endedAt,
    })),
    legacyBreakMinutes: record.legacyBreakMinutes,
    now,
  });
}

function serializeRecord(record: AttendanceRecordWithSessions, now = new Date()) {
  const metrics = measureRecord(record, now);
  const openSession = record.workSessions.find((session) => !session.endedAt) ?? null;
  const openBreak = record.breakSessions.find((session) => !session.endedAt) ?? null;

  return {
    id: record.id,
    attendanceDate: toDateOnly(record.attendanceDate),
    status: record.status,
    note: record.note,
    checkInAt: record.checkInAt?.toISOString() ?? null,
    checkOutAt: record.checkOutAt?.toISOString() ?? null,
    active: Boolean(openSession),
    onBreak: Boolean(openBreak),
    currentSessionStartedAt: openSession?.startedAt.toISOString() ?? null,
    currentBreakStartedAt: openBreak?.startedAt.toISOString() ?? null,
    legacyBreakMinutes: record.legacyBreakMinutes,
    workSessions: record.workSessions.map((session) => ({
      id: session.id,
      startedAt: session.startedAt.toISOString(),
      endedAt: session.endedAt?.toISOString() ?? null,
      endReason: session.endReason,
    })),
    breakSessions: record.breakSessions.map((session) => ({
      id: session.id,
      startedAt: session.startedAt.toISOString(),
      endedAt: session.endedAt?.toISOString() ?? null,
      endReason: session.endReason,
    })),
    ...metrics,
  };
}

async function syncAttendanceSummary(
  transaction: Prisma.TransactionClient,
  recordId: string,
  now: Date,
) {
  const record = await transaction.attendanceRecord.findUniqueOrThrow({
    where: { id: recordId },
    include: attendanceInclude,
  });
  const metrics = measureRecord(record, now);
  const firstCheckIn = record.workSessions[0]?.startedAt ?? null;
  const openSession = record.workSessions.find((session) => !session.endedAt) ?? null;
  const latestCompletedSession = [...record.workSessions]
    .reverse()
    .find((session) => Boolean(session.endedAt));
  const checkOutAt = openSession ? null : latestCompletedSession?.endedAt ?? null;
  const note = embedAttendanceOvertimeMeta(record.note ?? "", {
    overtimeMinutes: metrics.overtimeMinutes,
    actualCheckOutAt:
      checkOutAt && metrics.overtimeMinutes > 0 ? checkOutAt.toISOString() : null,
    autoClosedAt: null,
  });

  return transaction.attendanceRecord.update({
    where: { id: recordId },
    data: {
      checkInAt: firstCheckIn,
      checkOutAt,
      breakMinutes: metrics.breakMinutes,
      workingMinutes: metrics.workingMinutes,
      note: note || null,
    },
    include: attendanceInclude,
  });
}

async function recoverInterruptedSession(
  record: AttendanceRecordWithSessions,
  closedAt: Date,
) {
  return db.$transaction(async (transaction) => {
    const openSession = record.workSessions.find((session) => !session.endedAt);
    if (!openSession || closedAt < openSession.startedAt) return record;

    await transaction.attendanceBreakSession.updateMany({
      where: { attendanceRecordId: record.id, endedAt: null },
      data: { endedAt: closedAt, endReason: "device_recovery" },
    });
    await transaction.attendanceWorkSession.update({
      where: { id: openSession.id },
      data: { endedAt: closedAt, endReason: "device_recovery" },
    });
    return syncAttendanceSummary(transaction, record.id, closedAt);
  });
}

/** Desktop-authoritative active/break status, including crash recovery. */
export async function GET(request: NextRequest) {
  const { user } = await getServerAuthContext();
  if (!user) return apiError("Authentication required.", 401);

  const today = toDateOnly();
  let record = await db.attendanceRecord.findUnique({
    where: {
      userId_attendanceDate: {
        userId: user.id,
        attendanceDate: new Date(`${today}T00:00:00.000Z`),
      },
    },
    include: attendanceInclude,
  });

  const deviceKey = request.nextUrl.searchParams.get("deviceKey");
  const agentStartedAt = new Date(request.nextUrl.searchParams.get("agentStartedAt") ?? "");
  if (deviceKey && deviceKey.length <= 200 && Number.isFinite(agentStartedAt.getTime())) {
    const openRecord =
      record?.workSessions.some((session) => !session.endedAt)
        ? record
        : await db.attendanceRecord.findFirst({
            where: {
              userId: user.id,
              workSessions: { some: { endedAt: null } },
            },
            orderBy: { attendanceDate: "desc" },
            include: attendanceInclude,
          });
    const device = openRecord
      ? await db.device.findUnique({
          where: { userId_deviceKey: { userId: user.id, deviceKey } },
          select: { lastSeenAt: true },
        })
      : null;
    const lastSeenAt = device?.lastSeenAt ?? null;
    const openSession = openRecord?.workSessions.find((session) => !session.endedAt) ?? null;
    if (
      openRecord &&
      openSession &&
      lastSeenAt &&
      lastSeenAt >= openSession.startedAt &&
      lastSeenAt.getTime() + 5_000 < agentStartedAt.getTime()
    ) {
      const closedRecord = await recoverInterruptedSession(openRecord, lastSeenAt);
      if (record?.id === closedRecord.id) record = closedRecord;
    }
  }

  if (!record) {
    return apiSuccess({
      userId: user.id,
      active: false,
      onBreak: false,
      checkInAt: null,
      checkOutAt: null,
      snapshot: null,
    });
  }

  const snapshot = serializeRecord(record);
  return apiSuccess({
    userId: user.id,
    active: snapshot.active,
    onBreak: snapshot.onBreak,
    checkInAt: snapshot.checkInAt,
    checkOutAt: snapshot.checkOutAt,
    snapshot,
  });
}

export async function POST(request: NextRequest) {
  const user = await requireUser();
  const body = await request.json().catch(() => null);
  const parsed = attendanceActionSchema.safeParse(body);
  if (!parsed.success) {
    return apiError(parsed.error.issues[0]?.message ?? "Invalid attendance action.");
  }

  const attendanceDate = parsed.data.attendanceDate ?? toDateOnly();
  const occurredAt = actionTime(parsed.data.occurredAt);
  if (!occurredAt) return apiError("Attendance time is invalid.");

  if (parsed.data.action === "check_in" && attendanceDate !== toDateOnly(occurredAt)) {
    return apiError("Check In must be recorded for today.");
  }

  try {
    const result = await db.$transaction(async (transaction) => {
      let record = await transaction.attendanceRecord.findUnique({
        where: {
          userId_attendanceDate: {
            userId: user.id,
            attendanceDate: new Date(`${attendanceDate}T00:00:00.000Z`),
          },
        },
        include: attendanceInclude,
      });

      if (!record && parsed.data.action !== "check_in") {
        throw new Error("ATTENDANCE_NOT_STARTED");
      }

      if (!record) {
        record = await transaction.attendanceRecord.create({
          data: {
            userId: user.id,
            attendanceDate: new Date(`${attendanceDate}T00:00:00.000Z`),
            status: parsed.data.status ?? "present",
            note: parsed.data.note || null,
          },
          include: attendanceInclude,
        });
      }

      await transaction.$queryRaw<Array<{ id: string }>>`
        SELECT id::text AS id
        FROM attendance_records
        WHERE id = ${record.id}::uuid
        FOR UPDATE
      `;

      const existingEvent = parsed.data.eventId
        ? await transaction.attendanceWorkSession.findFirst({
            where: { attendanceRecordId: record.id, clientEventId: parsed.data.eventId },
          }) ?? await transaction.attendanceBreakSession.findFirst({
            where: { attendanceRecordId: record.id, clientEventId: parsed.data.eventId },
          })
        : null;
      if (existingEvent) {
        const synced = await syncAttendanceSummary(transaction, record.id, occurredAt);
        return { record: synced, message: "Attendance was already updated." };
      }

      const openWork = record.workSessions.find((session) => !session.endedAt) ?? null;
      const openBreak = record.breakSessions.find((session) => !session.endedAt) ?? null;
      let message = "Attendance updated successfully.";

      if (parsed.data.action === "check_in") {
        if (openWork) {
          message = "You are already checked in.";
        } else {
          await transaction.attendanceWorkSession.create({
            data: {
              attendanceRecordId: record.id,
              startedAt: occurredAt,
              clientEventId: parsed.data.eventId,
            },
          });
          message = record.workSessions.length ? "Checked in again." : "Checked in successfully.";
        }
      }

      if (parsed.data.action === "break_start") {
        if (!openWork) throw new Error("ATTENDANCE_NOT_ACTIVE");
        if (openBreak) {
          message = "Break is already running.";
        } else {
          await transaction.attendanceBreakSession.create({
            data: {
              attendanceRecordId: record.id,
              startedAt: occurredAt,
              clientEventId: parsed.data.eventId,
            },
          });
          message = "Break started.";
        }
      }

      if (parsed.data.action === "break_end") {
        if (!openWork) throw new Error("ATTENDANCE_NOT_ACTIVE");
        if (!openBreak) {
          message = "No active break was found.";
        } else {
          if (occurredAt < openBreak.startedAt) throw new Error("INVALID_ATTENDANCE_ORDER");
          await transaction.attendanceBreakSession.update({
            where: { id: openBreak.id },
            data: {
              endedAt: occurredAt,
              endReason: "manual",
              clientEventId: openBreak.clientEventId ?? parsed.data.eventId,
            },
          });
          message = "Break ended. Work resumed.";
        }
      }

      if (parsed.data.action === "check_out") {
        if (!openWork) {
          message = "You are already checked out.";
        } else {
          if (occurredAt < openWork.startedAt) throw new Error("INVALID_ATTENDANCE_ORDER");
          if (openBreak) {
            await transaction.attendanceBreakSession.update({
              where: { id: openBreak.id },
              data: {
                endedAt: occurredAt,
                endReason: parsed.data.endReason ?? "manual",
              },
            });
          }
          await transaction.attendanceWorkSession.update({
            where: { id: openWork.id },
            data: {
              endedAt: occurredAt,
              endReason: parsed.data.endReason ?? "manual",
              clientEventId: openWork.clientEventId ?? parsed.data.eventId,
            },
          });
          message = "Checked out successfully. You can check in again today.";
        }
      }

      if (parsed.data.action === "update_details") {
        await transaction.attendanceRecord.update({
          where: { id: record.id },
          data: {
            ...(parsed.data.status ? { status: parsed.data.status } : {}),
            ...(typeof parsed.data.note === "string" ? { note: parsed.data.note || null } : {}),
          },
        });
        message = "Attendance details updated.";
      }

      const synced = await syncAttendanceSummary(transaction, record.id, occurredAt);
      return { record: synced, message };
    }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable });

    return apiSuccess({
      message: result.message,
      record: serializeRecord(result.record, occurredAt),
      snapshot: serializeRecord(result.record, occurredAt),
    });
  } catch (error) {
    if (error instanceof Error) {
      if (error.message === "ATTENDANCE_NOT_STARTED") return apiError("Check In first.", 409);
      if (error.message === "ATTENDANCE_NOT_ACTIVE") return apiError("Check In before using this action.", 409);
      if (error.message === "INVALID_ATTENDANCE_ORDER") return apiError("Attendance events are out of order.", 409);
    }
    if (error instanceof Prisma.PrismaClientKnownRequestError && (error.code === "P2002" || error.code === "P2034")) {
      return apiError("Attendance changed at the same time. Please try once more.", 409);
    }
    console.error("Attendance update failed", error);
    return apiError("Attendance update failed.", 500);
  }
}
