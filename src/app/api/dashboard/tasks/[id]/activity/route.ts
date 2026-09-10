import { UserRole } from "@prisma/client";
import { apiError, apiSuccess } from "@/lib/api";
import { requireUser } from "@/lib/auth/server";
import { db } from "@/lib/db";

function buildTaskVisibilityWhere(
  actor: Awaited<ReturnType<typeof requireUser>>,
) {
  if (actor.role === UserRole.employee) {
    return { userId: actor.id };
  }

  if (actor.role === UserRole.manager) {
    return actor.departmentId
      ? {
          OR: [
            { userId: actor.id },
            { departmentId: actor.departmentId },
          ],
        }
      : { userId: actor.id };
  }

  return {};
}

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const user = await requireUser();
  const { id } = await params;
  const task = await db.dailyTask.findFirst({
    where: {
      id,
      ...buildTaskVisibilityWhere(user),
    },
    select: { id: true },
  });

  if (!task) {
    return apiError("Task not found.", 404);
  }

  const events = await db.taskActivityEvent.findMany({
    where: { dailyTaskId: id },
    include: {
      actor: {
        select: { name: true },
      },
    },
    orderBy: [{ createdAt: "asc" }, { cycle: "asc" }],
  });

  return apiSuccess({
    events: events.map((event) => ({
      id: event.id,
      eventType: event.eventType,
      cycle: event.cycle,
      reason: event.reason,
      note: event.note,
      reportDate: event.reportDate.toISOString(),
      trackedMinutes: event.trackedMinutes,
      actualStart: event.actualStart?.toISOString() ?? null,
      actualEnd: event.actualEnd?.toISOString() ?? null,
      createdAt: event.createdAt.toISOString(),
      actorName: event.actor?.name ?? "System",
    })),
  });
}
