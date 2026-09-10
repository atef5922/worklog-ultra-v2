import { ScreenshotUploadStatus } from "@prisma/client";
import { NextRequest } from "next/server";
import { z } from "zod";
import { apiError, apiSuccess } from "@/lib/api";
import { db } from "@/lib/db";
import { canViewScreenshotsOfUser, resolveScreenshotScope, screenshotScopeFilter } from "@/lib/screenshots/access";
import { getScreenshotApiUser } from "@/lib/screenshots/session";

export const runtime = "nodejs";

const PAGE_SIZE = 60;

const querySchema = z.object({
  userId: z.string().uuid().optional(),
  departmentId: z.string().uuid().optional(),
  from: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
  to: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
  cursor: z.string().uuid().optional(),
});

/**
 * Lists screenshot metadata the caller is allowed to see.
 *
 * The viewer's scope is always ANDed in as its own clause — a caller-supplied
 * `userId` narrows the result but can never widen it, which is what stops
 * `?userId=<someone-else>` from working. Only metadata is returned; bytes come
 * from the per-screenshot image route, each with its own authorisation check.
 */
export async function GET(request: NextRequest) {
  const viewer = await getScreenshotApiUser();

  if (!viewer) {
    return apiError("Authentication required.", 401);
  }

  const parsed = querySchema.safeParse(Object.fromEntries(request.nextUrl.searchParams));
  if (!parsed.success) {
    return apiError(parsed.error.issues[0]?.message ?? "Invalid filter.");
  }

  const scope = resolveScreenshotScope(viewer);

  // Validate a requested employee against the viewer's scope before querying,
  // so an unauthorised target is a clean 403 rather than a silently empty list.
  if (parsed.data.userId) {
    const target = await db.user.findUnique({
      where: { id: parsed.data.userId },
      select: { id: true, departmentId: true },
    });

    if (!target || !canViewScreenshotsOfUser(viewer, target)) {
      return apiError("You do not have access to this employee's screenshots.", 403);
    }
  }

  const capturedAt: { gte?: Date; lte?: Date } = {};
  if (parsed.data.from) {
    capturedAt.gte = new Date(`${parsed.data.from}T00:00:00.000Z`);
  }
  if (parsed.data.to) {
    capturedAt.lte = new Date(`${parsed.data.to}T23:59:59.999Z`);
  }

  // A `departmentId` filter only ever narrows an "all" (admin) scope. A
  // viewer already scoped to one department has that scope's own
  // `departmentId` clause as the most specific filter possible already, so
  // this is a no-op for them rather than a second `departmentId` key that
  // would silently overwrite — not narrow — the scope filter below.
  const departmentFilter = scope.kind === "all" && parsed.data.departmentId ? { departmentId: parsed.data.departmentId } : {};

  const screenshots = await db.screenshot.findMany({
    where: {
      // Scope first, and never spread anything caller-controlled over it.
      ...screenshotScopeFilter(scope),
      ...departmentFilter,
      ...(parsed.data.userId ? { userId: parsed.data.userId } : {}),
      ...(capturedAt.gte || capturedAt.lte ? { capturedAt } : {}),
      uploadStatus: ScreenshotUploadStatus.uploaded,
    },
    select: {
      id: true,
      userId: true,
      capturedAt: true,
      width: true,
      height: true,
      fileSize: true,
      attendanceRecordId: true,
      user: { select: { id: true, name: true } },
      device: { select: { id: true, hostname: true, platform: true } },
    },
    orderBy: [{ capturedAt: "desc" }, { id: "desc" }],
    take: PAGE_SIZE + 1,
    ...(parsed.data.cursor ? { cursor: { id: parsed.data.cursor }, skip: 1 } : {}),
  });

  const hasMore = screenshots.length > PAGE_SIZE;
  const page = hasMore ? screenshots.slice(0, PAGE_SIZE) : screenshots;

  return apiSuccess({
    screenshots: page.map((shot) => ({
      id: shot.id,
      userId: shot.userId,
      employeeName: shot.user.name,
      capturedAt: shot.capturedAt.toISOString(),
      width: shot.width,
      height: shot.height,
      fileSize: shot.fileSize,
      workSessionId: shot.attendanceRecordId,
      device: shot.device ? { id: shot.device.id, label: shot.device.hostname ?? shot.device.platform } : null,
      imageUrl: `/api/dashboard/screenshots/${shot.id}/image`,
    })),
    nextCursor: hasMore ? page.at(-1)?.id ?? null : null,
  });
}
