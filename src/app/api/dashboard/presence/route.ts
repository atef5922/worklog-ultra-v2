import { NextResponse } from "next/server";
import { getServerAuthContext } from "@/lib/auth/server";
import { db } from "@/lib/db";
import { AccessError, checkDashboardActionOrigin, fail, freshActor } from "@/lib/management/server";
import { toDateOnly } from "@/lib/utils";

export async function POST(request: Request) {
  try {
    checkDashboardActionOrigin(request);
    const { user } = await getServerAuthContext();
    if (!user) throw new AccessError("Please sign in.", 401);

    const body = await request.json().catch(() => ({}));
    const action = body?.action ?? "heartbeat";
    if (!["heartbeat", "meeting_start", "meeting_end"].includes(action)) {
      throw new AccessError("Invalid presence action.", 400);
    }

    const presence = await db.$transaction(async (tx) => {
      await tx.$queryRaw`SELECT id::text FROM users WHERE id=${user.id}::uuid FOR UPDATE`;
      await freshActor(tx, user.id);
      const now = new Date();
      const current = await tx.employeePresence.findUnique({ where: { userId: user.id } });
      // Meeting presence is independent of attendance. An unfinished meeting
      // expires at the next Dhaka day so it cannot appear active indefinitely.
      const activeMeeting = current?.meetingStartedAt &&
        toDateOnly(current.meetingStartedAt) === toDateOnly(now)
        ? current.meetingStartedAt
        : null;
      const meetingStartedAt = action === "meeting_start"
        ? (activeMeeting ?? now)
        : action === "meeting_end"
          ? null
          : activeMeeting;
      const saved = await tx.employeePresence.upsert({
        where: { userId: user.id },
        create: { userId: user.id, lastSeenAt: now, meetingStartedAt },
        update: { lastSeenAt: now, meetingStartedAt },
      });
      return { lastSeenAt: saved.lastSeenAt, meetingStartedAt: saved.meetingStartedAt };
    });

    return NextResponse.json({ presence });
  } catch (error) {
    return fail(error);
  }
}
