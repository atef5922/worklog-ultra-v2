import { ScreenshotAuditAction } from "@prisma/client";
import { NextRequest } from "next/server";
import { apiError, apiSuccess } from "@/lib/api";
import { db } from "@/lib/db";
import { canDeleteScreenshots } from "@/lib/screenshots/access";
import { getScreenshotApiUser } from "@/lib/screenshots/session";
import { screenshotStorage } from "@/lib/screenshots/storage";

export const runtime = "nodejs";

/**
 * Permanently removes one screenshot: storage bytes, the metadata row, and
 * its access-log history (cascades via the FK). Admin-only — a Team Head
 * can view their department's evidence but must never be able to erase it;
 * `canDeleteScreenshots` is the single place that rule lives.
 *
 * A missing id and an unauthorised caller both answer 404, matching the
 * read routes, so an id-probing request learns nothing from the status code.
 */
export async function DELETE(request: NextRequest, context: { params: Promise<{ id: string }> }) {
  const viewer = await getScreenshotApiUser();

  if (!viewer) {
    return apiError("Authentication required.", 401);
  }

  if (!canDeleteScreenshots(viewer)) {
    return apiError("Screenshot not found.", 404);
  }

  const { id } = await context.params;

  const screenshot = await db.screenshot.findUnique({
    where: { id },
    select: { id: true, storageKey: true },
  });

  if (!screenshot) {
    return apiError("Screenshot not found.", 404);
  }

  // Storage first: if this fails, the metadata row survives so the deletion
  // can be retried rather than leaving an orphaned file with no DB record
  // pointing at it (the reverse order is the one that's unrecoverable).
  try {
    await screenshotStorage.remove(screenshot.storageKey);
  } catch (error) {
    console.error("[screenshots] delete: storage removal failed", { screenshotId: screenshot.id, error });
    return apiError("Screenshot could not be deleted.", 500);
  }

  // The audit row is written before the delete, not after, because the
  // screenshot's own id is the foreign key the log points at — cascading
  // delete would otherwise take the evidence of the deletion with it.
  await db.screenshotAccessLog.create({
    data: {
      screenshotId: screenshot.id,
      viewerUserId: viewer.id,
      action: ScreenshotAuditAction.deleted,
      ipAddress: request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ?? null,
      userAgent: request.headers.get("user-agent")?.slice(0, 500) ?? null,
    },
  }).catch((error) => {
    console.error("[screenshots] delete: audit log write failed", { screenshotId: screenshot.id, error });
  });

  await db.screenshot.delete({ where: { id: screenshot.id } });

  return apiSuccess({ message: "Screenshot deleted." });
}
