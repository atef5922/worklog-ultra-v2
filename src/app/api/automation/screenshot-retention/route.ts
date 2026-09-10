import { NextRequest } from "next/server";
import { apiError, apiSuccess } from "@/lib/api";
import { getServerAuthContext } from "@/lib/auth/server";
import { db } from "@/lib/db";
import { screenshotStorage } from "@/lib/screenshots/storage";

export const runtime = "nodejs";

const DEFAULT_RETENTION_DAYS = 30;

function retentionDays() {
  const configured = Number(process.env.SCREENSHOT_RETENTION_DAYS);
  return Number.isFinite(configured) && configured > 0 ? configured : DEFAULT_RETENTION_DAYS;
}

/**
 * Deletes screenshot evidence past the retention window, from both object
 * storage and the database. Triggered externally (Task Scheduler / cron
 * hitting this URL) — same auth pattern as /api/automation/reminders,
 * because this process has no in-app scheduler of its own.
 *
 * Deletes storage bytes before the database row, not after: if the process
 * dies between the two, the worst case is an orphaned file that next run's
 * sweep still finds nothing pointing at (harmless, cleaned up by the age
 * filter next time storage is scanned — never a DB row whose image already
 * vanished while still being served as "available").
 */
export async function POST(request: NextRequest) {
  const authHeader = request.headers.get("x-worklog-cron-key");
  const cronKey = process.env.AUTH_SECRET;
  const context = await getServerAuthContext();
  const isPrivilegedUser = context.user?.role === "admin";
  const hasCronAccess = Boolean(cronKey && authHeader === cronKey);

  if (!isPrivilegedUser && !hasCronAccess) {
    return apiError("Unauthorized retention run.", 403);
  }

  const cutoff = new Date(Date.now() - retentionDays() * 24 * 60 * 60 * 1000);
  // Batched rather than one unbounded delete so a large backlog cannot turn
  // this into a single long-running transaction; a batch this size clears
  // in well under the run's own timeout, and a cron firing on any regular
  // schedule catches the rest on the next run.
  const BATCH_SIZE = 500;

  const [totalExpired, expired] = await Promise.all([
    db.screenshot.count({ where: { capturedAt: { lt: cutoff } } }),
    db.screenshot.findMany({
      where: { capturedAt: { lt: cutoff } },
      select: { id: true, storageKey: true },
      take: BATCH_SIZE,
    }),
  ]);

  let deleted = 0;
  let storageErrors = 0;

  for (const screenshot of expired) {
    try {
      await screenshotStorage.remove(screenshot.storageKey);
    } catch (error) {
      storageErrors += 1;
      console.error("[screenshot-retention] storage delete failed", { id: screenshot.id, error });
      continue;
    }

    await db.screenshot.delete({ where: { id: screenshot.id } });
    deleted += 1;
  }

  const remaining = totalExpired - deleted;
  return apiSuccess({
    message:
      remaining > 0
        ? `Retention sweep removed ${deleted} screenshot(s); ${remaining} more still past the ${retentionDays()}-day window, pending the next run.`
        : `Retention sweep removed ${deleted} screenshot(s) older than ${retentionDays()} day(s).`,
    deleted,
    storageErrors,
    remaining,
    retentionDays: retentionDays(),
  });
}
