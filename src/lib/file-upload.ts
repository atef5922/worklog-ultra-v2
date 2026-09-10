import { randomUUID } from "node:crypto";
import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";

export const ALLOWED_WORKSPACE_ATTACHMENT_TYPES = new Set([
  "image/jpeg",
  "image/png",
  "image/webp",
  "application/pdf",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  "application/msword",
  "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  "application/vnd.ms-excel",
  "text/plain",
  "application/zip",
]);

export const MAX_WORKSPACE_ATTACHMENT_SIZE = 8 * 1024 * 1024;

export async function saveUploadedFiles(
  files: File[],
  folder: string,
) {
  const uploadsDir = path.join(process.cwd(), "public", "uploads", folder);
  const payload: Array<{
    fileName: string;
    fileUrl: string;
    fileType: string;
    fileSize: number;
  }> = [];

  for (const file of files) {
    if (!ALLOWED_WORKSPACE_ATTACHMENT_TYPES.has(file.type)) {
      throw new Error(`Attachment type not allowed: ${file.name}`);
    }

    if (file.size > MAX_WORKSPACE_ATTACHMENT_SIZE) {
      throw new Error(`Attachment too large: ${file.name}. Limit is 8MB.`);
    }

    const extension = path.extname(file.name || "").toLowerCase() || `.${file.type.split("/")[1] ?? "bin"}`;
    const fileName = `${randomUUID()}${extension}`;
    const destination = path.join(uploadsDir, fileName);
    const buffer = Buffer.from(await file.arrayBuffer());

    await mkdir(uploadsDir, { recursive: true });
    await writeFile(destination, buffer);

    payload.push({
      fileName: file.name,
      fileUrl: `/uploads/${folder}/${fileName}`,
      fileType: file.type,
      fileSize: file.size,
    });
  }

  return payload;
}
