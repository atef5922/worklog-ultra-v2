import { mkdir, unlink, writeFile } from "node:fs/promises";
import path from "node:path";
import { NextRequest } from "next/server";
import { apiError, apiSuccess } from "@/lib/api";
import { requireUser } from "@/lib/auth/server";
import { db } from "@/lib/db";

export const runtime = "nodejs";

const ALLOWED_TYPES = new Set(["image/jpeg", "image/png", "image/webp", "image/gif"]);
const ALLOWED_TYPES_TO_EXTENSION: Record<string, string> = {
  "image/jpeg": ".jpg",
  "image/png": ".png",
  "image/webp": ".webp",
  "image/gif": ".gif",
};
const MAX_FILE_SIZE = 4 * 1024 * 1024;

/**
 * Deletes the avatar file a user is replacing. Without this every upload leaves
 * the previous image on disk forever. Anything that does not resolve to a plain
 * file directly inside the avatars directory is left untouched.
 */
async function removeReplacedAvatarFile(previousAvatarUrl: string | null, uploadsDir: string) {
  if (!previousAvatarUrl) {
    return;
  }

  const [pathnameOnly] = previousAvatarUrl.split("?");

  if (!pathnameOnly?.startsWith("/uploads/avatars/")) {
    return;
  }

  const fileName = path.basename(pathnameOnly);
  const target = path.join(uploadsDir, fileName);

  if (path.relative(uploadsDir, target) !== fileName) {
    return;
  }

  await unlink(target).catch(() => undefined);
}

function resolveAvatarExtension(file: File) {
  const providedExtension = path.extname(file.name || "").toLowerCase();
  if (providedExtension && providedExtension !== ".") {
    return providedExtension;
  }

  return ALLOWED_TYPES_TO_EXTENSION[file.type];
}

export async function POST(request: NextRequest) {
  const user = await requireUser();

  const formData = await request.formData();
  const file = formData.get("avatar");

  if (!(file instanceof File)) {
    return apiError("Choose a profile photo first.");
  }

  if (!ALLOWED_TYPES.has(file.type)) {
    return apiError("Only JPG, PNG, WEBP, or GIF images are allowed.");
  }

  if (file.size > MAX_FILE_SIZE) {
    return apiError("Profile photo must be 4MB or smaller.");
  }

  const extension = resolveAvatarExtension(file);
  if (!extension || extension.length > 8) {
    return apiError("Invalid profile photo file extension.");
  }

  const avatarTimestamp = Date.now();
  const uploadsDir = path.join(process.cwd(), "public", "uploads", "avatars");
  const fileName = `${user.id}-${avatarTimestamp}${extension}`;
  const destination = path.join(uploadsDir, fileName);
  const buffer = Buffer.from(await file.arrayBuffer());

  await mkdir(uploadsDir, { recursive: true });
  await writeFile(destination, buffer);

  const avatarUrl = `/uploads/avatars/${fileName}?v=${avatarTimestamp}`;
  const updatedUser = await db.user.update({
    where: { id: user.id },
    data: { avatarUrl },
    select: {
      id: true,
      name: true,
      email: true,
      role: true,
      avatarUrl: true,
      designation: true,
      phone: true,
      location: true,
      departmentId: true,
    },
  });

  // Only after the new URL is committed, so a failed write never orphans a user.
  await removeReplacedAvatarFile(user.avatarUrl, uploadsDir);

  if (process.env.NODE_ENV !== "production") {
    console.log("[avatar] saved file:", destination);
    console.log("[avatar] saved avatar URL:", avatarUrl);
  }

  return apiSuccess({
    message: "Profile photo uploaded successfully.",
    avatarUrl,
    user: {
      ...updatedUser,
      avatarUrl,
    },
  });
}
