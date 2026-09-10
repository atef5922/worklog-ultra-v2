import { readFile, stat } from "node:fs/promises";
import path from "node:path";
import { NextRequest, NextResponse } from "next/server";
import { apiError } from "@/lib/api";

export const runtime = "nodejs";

const EXTENSION_MIME_TYPES: Record<string, string> = {
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".png": "image/png",
  ".webp": "image/webp",
  ".gif": "image/gif",
  ".pdf": "application/pdf",
  ".doc": "application/msword",
  ".docx": "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  ".xls": "application/vnd.ms-excel",
  ".xlsx": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  ".txt": "text/plain",
  ".zip": "application/zip",
};

const uploadsRoot = () => path.join(process.cwd(), "public", "uploads");

/**
 * Serves everything under `public/uploads` dynamically instead of letting
 * Next's own static file handling do it.
 *
 * Next's `output: "standalone"` server (what the desktop build runs)
 * resolves `/public/*` against a file list it builds once at process
 * startup — a file written to `public/uploads` *after* that process is
 * already running (an avatar upload, a message attachment) 404s until the
 * next restart, even though it is sitting right there on disk. A
 * `rewrites()` entry in next.config sends `/uploads/:path*` here instead,
 * so every request re-reads the filesystem itself and a fresh upload is
 * visible immediately, with no dependency on when the process last booted.
 */
export async function GET(_request: NextRequest, context: { params: Promise<{ path: string[] }> }) {
  const { path: segments } = await context.params;
  const root = uploadsRoot();
  const target = path.resolve(root, ...segments);
  const relative = path.relative(root, target);

  if (!relative || relative.startsWith("..") || path.isAbsolute(relative)) {
    return apiError("Not found.", 404);
  }

  const extension = path.extname(target).toLowerCase();
  const mimeType = EXTENSION_MIME_TYPES[extension];
  if (!mimeType) {
    return apiError("Not found.", 404);
  }

  const info = await stat(target).catch(() => null);
  if (!info?.isFile()) {
    return apiError("Not found.", 404);
  }

  const body = await readFile(target);
  return new NextResponse(new Uint8Array(body), {
    headers: {
      "Content-Type": mimeType,
      "Content-Length": String(body.byteLength),
      "Cache-Control": "public, max-age=3600",
    },
  });
}
