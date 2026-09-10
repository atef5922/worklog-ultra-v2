import { ScreenshotAuditAction } from "@prisma/client";
import { NextRequest, NextResponse } from "next/server";
import { apiError } from "@/lib/api";
import { db } from "@/lib/db";
import { canViewScreenshot } from "@/lib/screenshots/access";
import { getScreenshotApiUser } from "@/lib/screenshots/session";
import { screenshotStorage } from "@/lib/screenshots/storage";

export const runtime = "nodejs";

/**
 * Streams one screenshot's bytes to an authorised viewer.
 *
 * This route is the *only* way image data leaves the server: bytes live outside
 * `public/`, so there is no URL that serves a screenshot without passing this
 * authorisation check first. That is what replaces the "short-lived signed URL"
 * step — with no public object store in this deployment, an authenticated route
 * is the equivalent guarantee, and it additionally lets every read be audited.
 *
 * Both "does not exist" and "not allowed" answer 404 so a caller probing ids
 * cannot use the status code to discover which screenshots exist.
 */
export async function GET(request: NextRequest, context: { params: Promise<{ id: string }> }) {
  const viewer = await getScreenshotApiUser();

  if (!viewer) {
    return apiError("Authentication required.", 401);
  }

  const { id } = await context.params;

  const screenshot = await db.screenshot.findUnique({
    where: { id },
    select: { id: true, userId: true, departmentId: true, storageKey: true, mimeType: true },
  });

  if (!screenshot || !canViewScreenshot(viewer, screenshot)) {
    return apiError("Screenshot not found.", 404);
  }

  let body: Buffer;
  try {
    body = await screenshotStorage.get(screenshot.storageKey);
  } catch {
    return apiError("Screenshot image is no longer available.", 404);
  }

  // Audited after authorisation passes, so the log records real accesses only.
  // Never allowed to fail the read — an audit write problem must not deny a
  // legitimate viewer, but it is logged for follow-up.
  try {
    await db.screenshotAccessLog.create({
      data: {
        screenshotId: screenshot.id,
        viewerUserId: viewer.id,
        action: ScreenshotAuditAction.viewed,
        ipAddress: request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ?? null,
        userAgent: request.headers.get("user-agent")?.slice(0, 500) ?? null,
      },
    });
  } catch (error) {
    console.error("[screenshots] audit log write failed", { screenshotId: screenshot.id, error });
  }

  return new NextResponse(new Uint8Array(body), {
    headers: {
      "Content-Type": screenshot.mimeType,
      "Content-Length": String(body.byteLength),
      // Monitoring data must not sit in shared caches or CDN edges.
      "Cache-Control": "private, no-store",
      "Content-Disposition": "inline",
      "X-Content-Type-Options": "nosniff",
    },
  });
}
