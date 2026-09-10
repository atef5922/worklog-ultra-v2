"use strict";

/**
 * ScreenshotMonitoringManager — the single owner of screenshot capture for
 * this desktop install.
 *
 * This intentionally lives in the Electron main process, not a renderer
 * component: a React effect tied to page lifecycle cannot survive a reload,
 * cannot run while the window is being recreated, and gives every mounted
 * component a chance to start a second competing timer. Everything here is
 * a module-level singleton — `create()` is called once from main.cjs — so
 * there is structurally only one scheduler for the whole app.
 *
 * States: STOPPED -> ACTIVE -> PAUSED -> ACTIVE -> STOPPED. A `generation`
 * counter is bumped on every start()/stop()/resume() so an in-flight capture
 * that was still running when the session ended can detect it was orphaned
 * and discard itself instead of filing a screenshot against the wrong (or a
 * since-ended) session.
 *
 * The desktop agent never decides on its own that monitoring should run —
 * `reconcile()` polls the backend's attendance status and is the only path
 * that can *start* monitoring from a STOPPED state. Explicit start()/stop()
 * calls from the renderer (button clicks) exist purely for immediate UI
 * responsiveness after the backend has already confirmed the change.
 */

const { app, net, session: electronSession, desktopCapturer, nativeImage, screen, powerMonitor } = require("electron");
const crypto = require("node:crypto");
const fs = require("node:fs");
const fsp = require("node:fs/promises");
const os = require("node:os");
const path = require("node:path");

const CAPTURE_INTERVAL_MS = Math.max(30_000, Number(process.env.WORKLOG_SCREENSHOT_INTERVAL_MS) || 5 * 60 * 1000);
const RECONCILE_INTERVAL_MS = 60 * 1000;
const MAX_FAST_RETRY = 6;
const FAST_BACKOFF_MS = [15_000, 30_000, 60_000, 120_000, 300_000, 600_000];
const SLOW_RETRY_MS = 60 * 60 * 1000;
const MAX_LOCAL_AGE_MS = 14 * 24 * 60 * 60 * 1000;
const MAX_CAPTURE_WIDTH = 1920;
const JPEG_QUALITY = 70;

function backoffFor(retryCount) {
  if (retryCount <= FAST_BACKOFF_MS.length) return FAST_BACKOFF_MS[retryCount - 1];
  return SLOW_RETRY_MS;
}

function safeUserSegment(value) {
  return String(value || "unknown").replace(/[^a-zA-Z0-9-]/g, "-").slice(0, 80) || "unknown";
}

function delay(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * Manual multipart/form-data encoding.
 *
 * `net.request` is Chromium's URLRequest wrapper, not `fetch` — it has no
 * built-in FormData support, so the body is built by hand rather than
 * pulling in a dependency for something this small.
 */
function buildMultipart(fields, file) {
  const boundary = `----worklog${crypto.randomBytes(16).toString("hex")}`;
  const parts = [];
  for (const [name, value] of Object.entries(fields)) {
    parts.push(Buffer.from(`--${boundary}\r\nContent-Disposition: form-data; name="${name}"\r\n\r\n${value}\r\n`, "utf8"));
  }
  parts.push(
    Buffer.from(
      `--${boundary}\r\nContent-Disposition: form-data; name="${file.field}"; filename="${file.filename}"\r\nContent-Type: ${file.contentType}\r\n\r\n`,
      "utf8",
    ),
  );
  parts.push(file.data);
  parts.push(Buffer.from(`\r\n--${boundary}--\r\n`, "utf8"));
  return { boundary, body: Buffer.concat(parts) };
}

function createScreenshotMonitor({ appUrl, storageRoot, log, onStatusChange }) {
  const logger = log || (() => {});
  const notify = onStatusChange || (() => {});

  let state = "STOPPED";
  let currentSession = null; // { userId, label }
  let generation = 0;
  let nextCaptureAt = null;
  let timer = null;
  let reconcileTimer = null;
  let capturing = false;
  let uploading = false;
  let deviceKey = null;
  /** @type {Array<{id:string,userId:string,localPath:string,capturedAt:string,captureMode:string,status:string,retryCount:number,lastError:string|null,nextAttemptAt:number,createdAt:number}>} */
  let queue = [];

  function queueDir() {
    return path.join(storageRoot, ".screenshot-queue");
  }
  function manifestPath() {
    return path.join(queueDir(), "manifest.json");
  }
  function userFileDir(userId) {
    return path.join(queueDir(), safeUserSegment(userId));
  }

  async function persistQueue() {
    await fsp.mkdir(queueDir(), { recursive: true });
    const tmp = `${manifestPath()}.tmp`;
    await fsp.writeFile(tmp, JSON.stringify(queue, null, 2), "utf8");
    await fsp.rename(tmp, manifestPath()).catch(async () => {
      await fsp.copyFile(tmp, manifestPath());
      await fsp.unlink(tmp).catch(() => {});
    });
  }

  async function restoreQueue() {
    const raw = await fsp.readFile(manifestPath(), "utf8").catch(() => "[]");
    try {
      const parsed = JSON.parse(raw);
      queue = Array.isArray(parsed) ? parsed : [];
    } catch {
      queue = [];
    }
    // Drop entries whose file vanished (e.g. manual cleanup, disk issue) so
    // the queue never gets stuck retrying something that cannot succeed.
    const survivors = [];
    for (const item of queue) {
      const stat = await fsp.stat(item.localPath).catch(() => null);
      if (stat?.isFile()) survivors.push(item);
    }
    queue = survivors;
  }

  function getOrCreateDeviceKey() {
    if (deviceKey) return deviceKey;
    const file = path.join(app.getPath("userData"), "device-id.txt");
    try {
      deviceKey = fs.readFileSync(file, "utf8").trim();
      if (deviceKey) return deviceKey;
    } catch {
      // fall through to create one
    }
    deviceKey = crypto.randomUUID();
    try {
      fs.mkdirSync(path.dirname(file), { recursive: true });
      fs.writeFileSync(file, deviceKey, "utf8");
    } catch {
      // Non-fatal — worst case a new key is minted next launch too.
    }
    return deviceKey;
  }

  function performRequest({ method, url, headers = {}, body }) {
    return new Promise((resolve, reject) => {
      let request;
      try {
        request = net.request({ method, url, session: electronSession.defaultSession, useSessionCookies: true });
      } catch (error) {
        reject(error);
        return;
      }
      for (const [key, value] of Object.entries(headers)) request.setHeader(key, value);
      request.on("response", (response) => {
        const chunks = [];
        response.on("data", (chunk) => chunks.push(chunk));
        response.on("end", () => {
          const text = Buffer.concat(chunks).toString("utf8");
          let json = null;
          try {
            json = text ? JSON.parse(text) : null;
          } catch {
            json = null;
          }
          resolve({ statusCode: response.statusCode, json });
        });
        response.on("error", reject);
      });
      request.on("error", reject);
      if (body) request.write(body);
      request.end();
    });
  }

  async function checkAttendanceStatus() {
    return performRequest({ method: "GET", url: `${appUrl}/api/dashboard/attendance` });
  }

  async function sendHeartbeat() {
    const payload = JSON.stringify({
      deviceKey: getOrCreateDeviceKey(),
      platform: process.platform,
      hostname: os.hostname(),
      appVersion: app.getVersion(),
    });
    return performRequest({
      method: "POST",
      url: `${appUrl}/api/dashboard/screenshots/heartbeat`,
      headers: { "Content-Type": "application/json" },
      body: Buffer.from(payload, "utf8"),
    }).catch((error) => {
      logger(`heartbeat_failed ${error.message}`);
      return null;
    });
  }

  async function uploadItem(item) {
    const buffer = await fsp.readFile(item.localPath);
    const metadata = JSON.stringify({
      clientCaptureId: item.id,
      capturedAt: item.capturedAt,
      deviceKey: getOrCreateDeviceKey(),
      platform: process.platform,
      hostname: os.hostname(),
      appVersion: app.getVersion(),
      captureMode: item.captureMode,
    });
    const { boundary, body } = buildMultipart(
      { metadata },
      { field: "screenshot", filename: `${item.id}.jpg`, contentType: "image/jpeg", data: buffer },
    );
    // No explicit Content-Length: Electron's net.request computes it from
    // the written body and throws net::ERR_INVALID_ARGUMENT if a caller
    // sets it manually — this is what silently failed every upload before,
    // since the capture itself succeeded and only this request rejected.
    return performRequest({
      method: "POST",
      url: `${appUrl}/api/dashboard/screenshots/upload`,
      headers: { "Content-Type": `multipart/form-data; boundary=${boundary}` },
      body,
    });
  }

  async function flushQueue(onlyUserId) {
    if (uploading) return;
    uploading = true;
    try {
      const now = Date.now();
      const candidates = queue.filter(
        (item) =>
          (item.status === "PENDING" || item.status === "FAILED") &&
          (!onlyUserId || item.userId === onlyUserId) &&
          item.nextAttemptAt <= now,
      );

      for (const item of candidates) {
        item.status = "UPLOADING";
        try {
          const { statusCode, json } = await uploadItem(item);
          if (statusCode >= 200 && statusCode < 300) {
            await fsp.unlink(item.localPath).catch(() => {});
            queue = queue.filter((q) => q.id !== item.id);
            logger(`upload_success id=${item.id} duplicate=${Boolean(json?.duplicate)}`);
          } else if (statusCode === 401) {
            // No longer this user's authenticated session — stop for this
            // round rather than burning retries; a future reconcile() will
            // resume once someone is logged in again. Never let a queued
            // capture upload under a different account's session.
            item.status = "PENDING";
            logger(`upload_deferred id=${item.id} reason=unauthenticated`);
            break;
          } else {
            item.retryCount += 1;
            item.status = item.retryCount >= MAX_FAST_RETRY ? "FAILED" : "PENDING";
            item.lastError = json?.message || `HTTP ${statusCode}`;
            item.nextAttemptAt = Date.now() + backoffFor(item.retryCount);
            logger(`upload_failed id=${item.id} status=${statusCode} retry=${item.retryCount}`);
          }
        } catch (error) {
          item.retryCount += 1;
          item.status = item.retryCount >= MAX_FAST_RETRY ? "FAILED" : "PENDING";
          item.lastError = String(error?.message || error);
          item.nextAttemptAt = Date.now() + backoffFor(item.retryCount);
          logger(`retry_scheduled id=${item.id} retry=${item.retryCount} error=${item.lastError}`);
        }
        await persistQueue();
      }
    } finally {
      uploading = false;
    }
  }

  async function pruneStaleQueueEntries() {
    // Age alone, regardless of status: a PENDING item can be this old
    // because it belongs to a user who no longer uses this device (account
    // switch) rather than because uploads are failing, and that case would
    // never turn FAILED to be caught by a status-only filter.
    const cutoff = Date.now() - MAX_LOCAL_AGE_MS;
    const stale = queue.filter((item) => item.createdAt < cutoff);
    if (!stale.length) return;
    for (const item of stale) {
      await fsp.unlink(item.localPath).catch(() => {});
      logger(`queue_dropped id=${item.id} reason=max-local-age`);
    }
    queue = queue.filter((item) => !stale.includes(item));
    await persistQueue();
  }

  function clearTimer() {
    if (timer) {
      clearTimeout(timer);
      timer = null;
    }
  }

  function scheduleNext() {
    clearTimer();
    if (state !== "ACTIVE" || nextCaptureAt === null) return;
    const delayMs = Math.max(0, nextCaptureAt - Date.now());
    timer = setTimeout(onTick, delayMs);
  }

  async function grabPrimaryDisplay() {
    const primary = screen.getPrimaryDisplay();
    const targetSize = {
      width: Math.round(primary.size.width * primary.scaleFactor),
      height: Math.round(primary.size.height * primary.scaleFactor),
    };
    const sources = await desktopCapturer.getSources({ types: ["screen"], thumbnailSize: targetSize });
    const source = sources.find((item) => String(item.display_id) === String(primary.id)) || sources[0];
    if (!source || source.thumbnail.isEmpty()) {
      throw new Error("No screen source available.");
    }
    return source.thumbnail;
  }

  async function captureOnce() {
    let attempt = 0;
    // One same-tick retry for transient failures (e.g. display just resumed
    // from sleep); anything beyond that waits for the next scheduled tick
    // rather than looping.
    while (attempt < 2) {
      try {
        return await grabPrimaryDisplay();
      } catch (error) {
        attempt += 1;
        if (attempt >= 2) throw error;
        await delay(2000);
      }
    }
    throw new Error("unreachable");
  }

  async function onTick() {
    if (state !== "ACTIVE" || capturing) return;
    capturing = true;
    const sessionAtStart = currentSession;
    const generationAtStart = generation;
    logger("capture_start");

    try {
      const thumbnail = await captureOnce();

      // The session may have ended or paused while the OS call above was
      // in flight (Case 1: stop clicked the instant the timer fired). Check
      // before writing anything to disk so an orphaned capture never gets
      // filed under a since-ended session.
      if (state !== "ACTIVE" || generation !== generationAtStart || !sessionAtStart) {
        logger("capture_discarded reason=session-changed-mid-capture");
        return;
      }

      const resized = thumbnail.resize({ width: Math.min(thumbnail.getSize().width, MAX_CAPTURE_WIDTH) });
      const jpeg = resized.toJPEG(JPEG_QUALITY);
      const capturedAt = new Date();
      const id = crypto.randomUUID();
      const dir = userFileDir(sessionAtStart.userId);
      await fsp.mkdir(dir, { recursive: true });
      const localPath = path.join(dir, `${id}.jpg`);
      await fsp.writeFile(localPath, jpeg);

      queue.push({
        id,
        userId: sessionAtStart.userId,
        localPath,
        capturedAt: capturedAt.toISOString(),
        captureMode: "primary_display",
        status: "PENDING",
        retryCount: 0,
        lastError: null,
        nextAttemptAt: 0,
        createdAt: Date.now(),
      });
      await persistQueue();
      logger(`capture_success id=${id}`);
      void flushQueue(sessionAtStart.userId);
    } catch (error) {
      logger(`capture_failed error=${String(error?.message || error)}`);
    } finally {
      capturing = false;
      if (state === "ACTIVE" && generation === generationAtStart) {
        // Anchored increment (not Date.now() + INTERVAL) so a capture that
        // took a little longer than usual does not drift the whole
        // schedule. But if this tick fired much later than planned for any
        // reason (system stall, not just sleep — sleep is also handled
        // explicitly in the powerMonitor "resume" handler below), anchoring
        // alone would leave nextCaptureAt in the past and fire again
        // immediately; collapse to a fresh interval instead of bursting.
        const anchored = (nextCaptureAt ?? Date.now()) + CAPTURE_INTERVAL_MS;
        nextCaptureAt = anchored > Date.now() ? anchored : Date.now() + CAPTURE_INTERVAL_MS;
        scheduleNext();
      }
    }
  }

  function start(session) {
    if (state === "ACTIVE" && currentSession?.userId === session.userId) {
      return getStatus(); // Case 3: duplicate start requests are a no-op.
    }
    currentSession = { userId: session.userId, label: session.label || "Attendance" };
    state = "ACTIVE";
    generation += 1;
    // First capture lands one full interval after start, matching "09:00
    // start -> 09:05 first shot", not an immediate capture at click time.
    nextCaptureAt = Date.now() + CAPTURE_INTERVAL_MS;
    scheduleNext();
    logger(`monitoring_start user=${session.userId}`);
    const status = getStatus();
    notify(status);
    return status;
  }

  function stop() {
    if (state === "STOPPED") return getStatus();
    const endedUserId = currentSession?.userId;
    state = "STOPPED";
    generation += 1;
    clearTimer();
    nextCaptureAt = null;
    currentSession = null;
    logger(`monitoring_stop user=${endedUserId}`);
    if (endedUserId) void flushQueue(endedUserId);
    const status = getStatus();
    notify(status);
    return status;
  }

  function pause() {
    if (state !== "ACTIVE") return getStatus();
    state = "PAUSED";
    clearTimer();
    logger(`monitoring_pause user=${currentSession?.userId}`);
    const status = getStatus();
    notify(status);
    return status;
  }

  function resume() {
    if (state !== "PAUSED") return getStatus();
    state = "ACTIVE";
    generation += 1;
    nextCaptureAt = Date.now() + CAPTURE_INTERVAL_MS;
    scheduleNext();
    logger(`monitoring_resume user=${currentSession?.userId}`);
    const status = getStatus();
    notify(status);
    return status;
  }

  async function reconcile() {
    let result;
    try {
      result = await checkAttendanceStatus();
    } catch (error) {
      // Network failure must never stop monitoring on its own — an employee
      // offline for an hour is still working. Only an authoritative "not
      // active" response from the backend ends a session.
      logger(`reconcile_offline error=${String(error?.message || error)}`);
      return;
    }

    if (result.statusCode === 401) {
      if (state !== "STOPPED") stop();
      return;
    }

    if (result.statusCode !== 200 || !result.json) {
      logger(`reconcile_unexpected status=${result.statusCode}`);
      return;
    }

    const { userId, active } = result.json;
    if (active && state === "STOPPED") {
      start({ userId, label: "Attendance" });
      logger(`session_restored user=${userId}`);
    } else if (!active && state !== "STOPPED") {
      stop();
    }
    // If PAUSED, leave it alone — a break is local-only state the backend
    // does not know about, and reconcile must never force it back ACTIVE.

    void flushQueue(userId);
    void sendHeartbeat();
    void pruneStaleQueueEntries();
  }

  function getStatus() {
    return {
      state,
      running: state !== "STOPPED",
      paused: state === "PAUSED",
      userId: currentSession?.userId ?? null,
      label: currentSession?.label ?? null,
      pending: queue.filter((item) => item.status !== "UPLOADED").length,
      intervalMinutes: CAPTURE_INTERVAL_MS / 60000,
      nextCaptureAt,
    };
  }

  async function init() {
    await restoreQueue();
    await pruneStaleQueueEntries();
    powerMonitor.on("suspend", () => logger("sleep_detected"));
    powerMonitor.on("resume", () => {
      logger("wake_detected");
      if (state === "ACTIVE" && nextCaptureAt !== null) {
        const now = Date.now();
        if (nextCaptureAt <= now) {
          // Do not fire once per missed interval — collapse the entire
          // backlog into a single resync so waking after a 2-hour sleep
          // produces the next capture 5 minutes from now, not a flood.
          nextCaptureAt = now + CAPTURE_INTERVAL_MS;
        }
        scheduleNext();
      }
      void reconcile();
    });
    await reconcile();
    reconcileTimer = setInterval(() => void reconcile(), RECONCILE_INTERVAL_MS);
  }

  function shutdown() {
    clearTimer();
    if (reconcileTimer) clearInterval(reconcileTimer);
    state = "STOPPED";
    // Queue is persisted after every mutation already, so there is nothing
    // to flush synchronously here — never block app exit on a network call.
  }

  return {
    init,
    shutdown,
    start,
    stop,
    pause,
    resume,
    reconcile,
    getStatus,
    flushQueue: () => flushQueue(currentSession?.userId),
  };
}

module.exports = { createScreenshotMonitor };
