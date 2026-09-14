import "server-only";
import type { Prisma } from "@prisma/client";
import { AccessError } from "@/lib/management/server";
import { toDateOnly } from "@/lib/utils";

type Interval = { startedAt: Date; endedAt: Date | null };

/** Call only while holding the employee's user-row lock. Open intervals extend indefinitely. */
export async function assertNoOtherAttendanceOverlap(
  tx: Prisma.TransactionClient, userId: string, recordId: string | null, proposed: Interval[],
) {
  // Empty, zero-duration evidence occupies no time; never invent a duration for it.
  const intervals = proposed.filter(s => s.endedAt === null || s.endedAt > s.startedAt);
  if (!intervals.length) return;
  const firstStart = new Date(Math.min(...intervals.map(s => s.startedAt.getTime())));
  const lastEnd = intervals.some(s => s.endedAt === null) ? null
    : new Date(Math.max(...intervals.map(s => s.endedAt!.getTime())));
  const others = await tx.attendanceWorkSession.findMany({
    where: {
      attendanceRecord: { userId, ...(recordId ? { id: { not: recordId } } : {}) },
      ...(lastEnd ? { startedAt: { lt: lastEnd } } : {}),
      OR: [{ endedAt: null }, { endedAt: { gt: firstStart } }],
    },
    select: { startedAt: true, endedAt: true, attendanceRecord: { select: { attendanceDate: true } } },
  });
  const conflict = others.find(other => {
    const end = other.endedAt?.getTime() ?? Infinity, start = other.startedAt.getTime();
    return end > start && intervals.some(s => start < (s.endedAt?.getTime() ?? Infinity) && end > s.startedAt.getTime());
  });
  if (conflict) throw new AccessError(
    `Office sessions overlap attendance on ${toDateOnly(conflict.attendanceRecord.attendanceDate)}. Correct that conflicting day first.`, 409,
  );
}
