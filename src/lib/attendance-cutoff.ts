import "server-only";

import { Prisma } from "@prisma/client";
import { db } from "@/lib/db";
import {
  ATTENDANCE_AUTO_CUTOFF_END_REASON,
  ATTENDANCE_AUTO_CUTOFF_HOUR,
  ATTENDANCE_AUTO_CUTOFF_MINUTE,
} from "@/lib/attendance-policy";
import { attendanceInclude, syncAttendanceSummary } from "@/lib/attendance-record";
import { audit } from "@/lib/management/server";
import { pauseUserTaskTimers } from "@/lib/task-timer-service";
import { getDhakaCutoffIso, toDateOnly } from "@/lib/utils";

const AUTO_CUTOFF_AUDIT_REASON =
  "Automatically closed an open attendance session at the 7:30 PM Asia/Dhaka safety cutoff.";
const BATCH_SIZE = 500;

export function attendanceAutoCutoffAt(attendanceDate: Date | string) {
  return new Date(
    getDhakaCutoffIso(
      toDateOnly(attendanceDate),
      ATTENDANCE_AUTO_CUTOFF_HOUR,
      ATTENDANCE_AUTO_CUTOFF_MINUTE,
    ),
  );
}

type AutoCloseResult = {
  closedRecords: number;
  skippedRecords: number;
};

/** Close one employee safely under the same row lock used by manual actions. */
export async function autoCloseAttendanceForUser(
  userId: string,
  now = new Date(),
): Promise<AutoCloseResult> {
  const candidate = await db.attendanceRecord.findFirst({
    where: { userId, workSessions: { some: { endedAt: null } } },
    orderBy: { attendanceDate: "asc" },
    select: {
      attendanceDate: true,
      workSessions: { where: { endedAt: null }, select: { startedAt: true } },
    },
  });
  if (!candidate) return { closedRecords: 0, skippedRecords: 0 };

  const candidateCutoff = attendanceAutoCutoffAt(candidate.attendanceDate);
  if (
    now < candidateCutoff ||
    !candidate.workSessions.some((session) => session.startedAt <= candidateCutoff)
  ) {
    return { closedRecords: 0, skippedRecords: 0 };
  }

  return db.$transaction(
    async (tx) => {
      await tx.$queryRaw`SELECT id::text FROM users WHERE id=${userId}::uuid FOR UPDATE`;
      const records = await tx.attendanceRecord.findMany({
        where: { userId, workSessions: { some: { endedAt: null } } },
        orderBy: [{ attendanceDate: "asc" }, { id: "asc" }],
        include: attendanceInclude,
      });

      const eligible = records.flatMap((record) => {
        const cutoff = attendanceAutoCutoffAt(record.attendanceDate);
        const openWork = record.workSessions.filter((session) => !session.endedAt);
        const openBreaks = record.breakSessions.filter((session) => !session.endedAt);
        const valid =
          cutoff <= now &&
          openWork.length === 1 &&
          openBreaks.length <= 1 &&
          openWork[0].startedAt <= cutoff &&
          (!openBreaks[0] || openBreaks[0].startedAt <= cutoff);
        return valid ? [{ record, cutoff, openWork: openWork[0], openBreak: openBreaks[0] }] : [];
      });

      if (!eligible.length) {
        return { closedRecords: 0, skippedRecords: records.length };
      }

      // Stop task timers at the boundary, not when delayed reconciliation runs.
      const taskCutoff = new Date(Math.max(...eligible.map((entry) => entry.cutoff.getTime())));
      await pauseUserTaskTimers(tx, userId, taskCutoff, ATTENDANCE_AUTO_CUTOFF_END_REASON, userId);

      for (const { record, cutoff, openWork, openBreak } of eligible) {
        if (openBreak) {
          await tx.attendanceBreakSession.update({
            where: { id: openBreak.id },
            data: { endedAt: cutoff, endReason: ATTENDANCE_AUTO_CUTOFF_END_REASON },
          });
        }
        await tx.attendanceWorkSession.update({
          where: { id: openWork.id },
          data: { endedAt: cutoff, endReason: ATTENDANCE_AUTO_CUTOFF_END_REASON },
        });
        const updated = await syncAttendanceSummary(tx, record.id, now);
        await audit(
          tx,
          userId,
          userId,
          "attendance.auto_cutoff",
          record,
          updated,
          AUTO_CUTOFF_AUDIT_REASON,
        );
      }

      return {
        closedRecords: eligible.length,
        skippedRecords: records.length - eligible.length,
      };
    },
    { isolationLevel: Prisma.TransactionIsolationLevel.ReadCommitted, timeout: 20_000 },
  );
}

/** Process a bounded batch so a regular cron can safely catch up after downtime. */
export async function autoCloseAllAttendance(now = new Date()) {
  const users = await db.attendanceRecord.findMany({
    where: { workSessions: { some: { endedAt: null } } },
    select: { userId: true },
    distinct: ["userId"],
    orderBy: { userId: "asc" },
    take: BATCH_SIZE,
  });
  let closedRecords = 0;
  let skippedRecords = 0;

  for (const { userId } of users) {
    try {
      const result = await autoCloseAttendanceForUser(userId, now);
      closedRecords += result.closedRecords;
      skippedRecords += result.skippedRecords;
    } catch (error) {
      skippedRecords += 1;
      console.error("[attendance-auto-cutoff] employee reconciliation failed", { userId, error });
    }
  }

  return { processedUsers: users.length, closedRecords, skippedRecords, batchSize: BATCH_SIZE };
}
