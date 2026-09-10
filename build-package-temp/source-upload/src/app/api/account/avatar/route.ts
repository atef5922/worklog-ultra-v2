import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { NextRequest } from "next/server";
import { apiError, apiSuccess } from "@/lib/api";
import { requireUser } from "@/lib/auth/server";
import { db } from "@/lib/db";

export const runtime = "nodejs";

const ALLOWED_TYPES = new Set(["image/jpeg", "image/png", "image/webp", "image/gif"]);
const MAX_FILE_SIZE = 4 * 1024 * 1024;

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

  const extension = path.extname(file.name || "").toLowerCase() || `.${file.type.split("/")[1]}`;
  const uploadsDir = path.join(process.cwd(), "public", "uploads", "avatars");
  const fileName = `${user.id}-${Date.now()}${extension}`;
  const destination = path.join(uploadsDir, fileName);
  const buffer = Buffer.from(await file.arrayBuffer());

  await mkdir(uploadsDir, { recursive: true });
  await writeFile(destination, buffer);

  const avatarUrl = `/uploads/avatars/${fileName}`;
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

  if (process.env.NODE_ENV !== "production") {
    console.log("[avatar] saved file:", destination);
    console.log("[avatar] saved avatar URL:", avatarUrl);
  }

  return apiSuccess({
    message: "Profile photo uploaded successfully.",
    avatarUrl,
    user: updatedUser,
  });
}
