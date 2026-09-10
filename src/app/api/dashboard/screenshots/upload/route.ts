import { ScreenshotCaptureMode, ScreenshotUploadStatus } from "@prisma/client";
import { NextRequest } from "next/server";
import sharp from "sharp";
import { z } from "zod";
import { apiError, apiSuccess } from "@/lib/api";
import { db } from "@/lib/db";
import { getScreenshotApiUser } from "@/lib/screenshots/session";
import { buildScreenshotStorageKey, checksumOf, screenshotStorage } from "@/lib/screenshots/storage";
import { toDateOnly } from "@/lib/utils";

export const runtime = "nodejs";

/** Beyond this the payload is not a screenshot; reject before reading it into memory. */
const MAX_UPLOAD_BYTES = 12 * 1024 * 1024;
const MAX_WIDTH = 1920;
const JPEG_QUALITY = 70;

const metadataSchema = z.object({
  /** Idempotency key minted by the agent before its first upload attempt. */
  clientCaptureId: z.string().min(8).max(120),
  capturedAt: z.string().datetime(),
  deviceKey: z.string().min(4).max(200),
  platform: z.string().min(1).max(60),
  hostname: z.string().max(200).optional(),
  appVersion: z.string().max(40).optional(),
  captureMode: z.nativeEnum(ScreenshotCaptureMode).default(ScreenshotCaptureMode.primary_display),
});

/**
 * Receives one captured screen from the desktop agent.
 *
 * Three things make this safe to retry, which matters because the agent's
 * offline queue will retry:
 *
 *  1. `clientCaptureId` is unique per user, so a duplicate POST updates the
 *     existing row instead of creating a second logical screenshot.
 *  2. Bytes are written to storage *before* the row is marked uploaded, so a
 *     crash between the two leaves a `pending` row we can retry — never a row
 *     that claims an image which does not exist.
 *  3. The owning user comes from the session cookie, never from the body, so a
 *     captured screen can never be filed under another employee.
 */
export async function POST(request: NextRequest) {
  const user = await getScreenshotApiUser();

  if (!user) {
    return apiError("Authentication required.", 401);
  }

  const formData = await request.formData();
  const file = formData.get("screenshot");
  const rawMetadata = formData.get("metadata");

  if (!(file instanceof File)) {
    return apiError("Screenshot image is required.");
  }

  if (file.size > MAX_UPLOAD_BYTES) {
    return apiError("Screenshot exceeds the maximum accepted size.", 413);
  }

  if (typeof rawMetadata !== "string") {
    return apiError("Screenshot metadata is required.");
  }

  let parsedJson: unknown;
  try {
    parsedJson = JSON.parse(rawMetadata);
  } catch {
    return apiError("Screenshot metadata is not valid JSON.");
  }

  const parsed = metadataSchema.safeParse(parsedJson);
  if (!parsed.success) {
    return apiError(parsed.error.issues[0]?.message ?? "Invalid screenshot metadata.");
  }

  const capturedAt = new Date(parsed.data.capturedAt);
  if (!Number.isFinite(capturedAt.getTime())) {
    return apiError("Invalid capture timestamp.");
  }

  // A capture claiming to be from the future is either a clock problem or a
  // forged payload; clamp rather than trust it, so ordering stays sane.
  const now = new Date();
  const effectiveCapturedAt = capturedAt > now ? now : capturedAt;

  const owner = await db.user.findUnique({
    where: { id: user.id },
    select: { id: true, departmentId: true },
  });

  if (!owner) {
    return apiError("Authentication required.", 401);
  }

  // Monitoring is only legitimate while a work session is open. Refusing here
  // (rather than only in the agent) is what makes "no screenshots after
  // attendance ends" enforceable, since the agent is client code we cannot trust.
  const attendance = await db.attendanceRecord.findUnique({
    where: {
      userId_attendanceDate: {
        userId: owner.id,
        attendanceDate: new Date(`${toDateOnly(effectiveCapturedAt)}T00:00:00.000Z`),
      },
    },
    select: { id: true, checkInAt: true, checkOutAt: true },
  });

  if (!attendance?.checkInAt) {
    return apiError("No active work session for this capture.", 409);
  }

  if (attendance.checkOutAt && effectiveCapturedAt > attendance.checkOutAt) {
    return apiError("Work session already ended for this capture.", 409);
  }

  const device = await db.device.upsert({
    where: { userId_deviceKey: { userId: owner.id, deviceKey: parsed.data.deviceKey } },
    create: {
      userId: owner.id,
      deviceKey: parsed.data.deviceKey,
      platform: parsed.data.platform,
      hostname: parsed.data.hostname ?? null,
      appVersion: parsed.data.appVersion ?? null,
      lastSeenAt: now,
    },
    update: {
      platform: parsed.data.platform,
      hostname: parsed.data.hostname ?? null,
      appVersion: parsed.data.appVersion ?? null,
      lastSeenAt: now,
    },
    select: { id: true },
  });

  // Re-encode rather than trusting the declared type: this both enforces
  // "it really is an image" and caps the stored size. `rotate()` applies EXIF
  // orientation before resize so nothing lands sideways.
  const incoming = Buffer.from(await file.arrayBuffer());
  let optimised: Buffer;
  let width = 0;
  let height = 0;

  try {
    const pipeline = sharp(incoming, { failOn: "error" })
      .rotate()
      .resize({ width: MAX_WIDTH, withoutEnlargement: true })
      .jpeg({ quality: JPEG_QUALITY, mozjpeg: true });

    const { data, info } = await pipeline.toBuffer({ resolveWithObject: true });
    optimised = data;
    width = info.width;
    height = info.height;
  } catch {
    return apiError("Screenshot image could not be processed.");
  }

  const storageKey = buildScreenshotStorageKey(owner.id, effectiveCapturedAt);

  // Claim the row first so a concurrent retry with the same clientCaptureId
  // collides on the unique index here instead of racing on the storage write.
  const record = await db.screenshot.upsert({
    where: {
      userId_clientCaptureId: { userId: owner.id, clientCaptureId: parsed.data.clientCaptureId },
    },
    create: {
      userId: owner.id,
      departmentId: owner.departmentId,
      attendanceRecordId: attendance.id,
      deviceId: device.id,
      storageKey,
      clientCaptureId: parsed.data.clientCaptureId,
      capturedAt: effectiveCapturedAt,
      captureMode: parsed.data.captureMode,
      uploadStatus: ScreenshotUploadStatus.pending,
      width,
      height,
      fileSize: optimised.byteLength,
      mimeType: "image/jpeg",
      checksum: checksumOf(optimised),
    },
    update: {},
    select: { id: true, storageKey: true, uploadStatus: true },
  });

  // Already finished on an earlier attempt — acknowledge without rewriting, so
  // a retry after a lost response is a no-op rather than a duplicate.
  if (record.uploadStatus === ScreenshotUploadStatus.uploaded) {
    return apiSuccess({ screenshotId: record.id, duplicate: true });
  }

  try {
    await screenshotStorage.put(record.storageKey, optimised, "image/jpeg");
  } catch {
    await db.screenshot.update({
      where: { id: record.id },
      data: { uploadStatus: ScreenshotUploadStatus.failed },
    });
    return apiError("Screenshot could not be stored.", 500);
  }

  await db.screenshot.update({
    where: { id: record.id },
    data: { uploadStatus: ScreenshotUploadStatus.uploaded, uploadedAt: new Date() },
  });

  return apiSuccess({ screenshotId: record.id, duplicate: false });
}
