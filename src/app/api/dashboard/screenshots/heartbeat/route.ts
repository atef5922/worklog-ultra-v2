import { NextRequest } from "next/server";
import { z } from "zod";
import { apiError, apiSuccess } from "@/lib/api";
import { db } from "@/lib/db";
import { getScreenshotApiUser } from "@/lib/screenshots/session";

export const runtime = "nodejs";

const heartbeatSchema = z.object({
  deviceKey: z.string().min(4).max(200),
  platform: z.string().min(1).max(60),
  hostname: z.string().max(200).optional(),
  appVersion: z.string().max(40).optional(),
});

/**
 * Cheap liveness ping from the desktop agent, independent of capture cadence.
 *
 * A device should read as "online" as soon as the agent starts, not only
 * after its first 5-minute screenshot — the upload route also touches
 * `lastSeenAt`, but that alone would leave a long gap right after monitoring
 * starts. Does not require an active attendance session: the agent should be
 * able to report itself online whenever it is running.
 */
export async function POST(request: NextRequest) {
  const user = await getScreenshotApiUser();

  if (!user) {
    return apiError("Authentication required.", 401);
  }

  const parsed = heartbeatSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) {
    return apiError(parsed.error.issues[0]?.message ?? "Invalid heartbeat payload.");
  }

  const device = await db.device.upsert({
    where: { userId_deviceKey: { userId: user.id, deviceKey: parsed.data.deviceKey } },
    create: {
      userId: user.id,
      deviceKey: parsed.data.deviceKey,
      platform: parsed.data.platform,
      hostname: parsed.data.hostname ?? null,
      appVersion: parsed.data.appVersion ?? null,
      lastSeenAt: new Date(),
    },
    update: {
      platform: parsed.data.platform,
      hostname: parsed.data.hostname ?? null,
      appVersion: parsed.data.appVersion ?? null,
      lastSeenAt: new Date(),
    },
    select: { id: true, lastSeenAt: true },
  });

  return apiSuccess({ deviceId: device.id, lastSeenAt: device.lastSeenAt?.toISOString() ?? null });
}
