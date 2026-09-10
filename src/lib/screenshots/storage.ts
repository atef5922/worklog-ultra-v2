import { createHash, randomUUID } from "node:crypto";
import { mkdir, readFile, rm, writeFile } from "node:fs/promises";
import path from "node:path";

/**
 * Where screenshot bytes live.
 *
 * Screenshots are the most sensitive thing this product stores, so the one
 * rule every implementation must keep is that nothing here is ever reachable
 * from a public URL. Callers get bytes back through an authorised route
 * handler; they never get a path they can hand to a browser.
 *
 * The interface exists so an S3/R2 driver can replace the disk driver without
 * touching a single call site. Only `resolveDriver` below needs to change.
 */
export type ScreenshotStorageDriver = {
  put(key: string, body: Buffer, contentType: string): Promise<void>;
  get(key: string): Promise<Buffer>;
  remove(key: string): Promise<void>;
};

/**
 * Root for screenshot bytes.
 *
 * Deliberately NOT `public/` — anything under that directory is served
 * statically by Next, which is exactly the "permanent public URL" the feature
 * must not have. Override with SCREENSHOT_STORAGE_DIR in deployments where the
 * app directory is not writable.
 */
function storageRoot() {
  return process.env.SCREENSHOT_STORAGE_DIR || path.join(process.cwd(), ".screenshot-storage");
}

/**
 * Rejects any key that would escape the storage root.
 *
 * Keys are built server side today, but this is the last line of defence
 * against a path-traversal bug elsewhere ever turning into arbitrary file
 * read/write, so it is enforced on every operation rather than trusted.
 */
function resolveKeyPath(key: string) {
  const root = storageRoot();
  const target = path.resolve(root, key);
  const relative = path.relative(root, target);

  if (!relative || relative.startsWith("..") || path.isAbsolute(relative)) {
    throw new Error("Invalid screenshot storage key.");
  }

  return target;
}

const diskDriver: ScreenshotStorageDriver = {
  async put(key, body) {
    const target = resolveKeyPath(key);
    await mkdir(path.dirname(target), { recursive: true });
    await writeFile(target, body);
  },
  async get(key) {
    return readFile(resolveKeyPath(key));
  },
  async remove(key) {
    await rm(resolveKeyPath(key), { force: true });
  },
};

function resolveDriver(): ScreenshotStorageDriver {
  return diskDriver;
}

export const screenshotStorage = resolveDriver();

/**
 * Builds the storage key for one capture.
 *
 * Every segment is server-controlled — the user id comes from the session and
 * the random suffix from `randomUUID`, so nothing the desktop agent sends can
 * influence where bytes land. Partitioning by user and day keeps the retention
 * sweep cheap and makes an on-disk tree a human can navigate during incidents.
 */
export function buildScreenshotStorageKey(userId: string, capturedAt: Date) {
  const day = capturedAt.toISOString().slice(0, 10);
  return path.posix.join(userId, day, `${capturedAt.getTime()}-${randomUUID()}.jpg`);
}

export function checksumOf(body: Buffer) {
  return createHash("sha256").update(body).digest("hex");
}
