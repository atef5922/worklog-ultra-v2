const { app, BrowserWindow, dialog, ipcMain, safeStorage, shell } = require("electron");
const { spawn } = require("node:child_process");
const crypto = require("node:crypto");
const fs = require("node:fs");
const fsp = require("node:fs/promises");
const http = require("node:http");
const path = require("node:path");
const { createScreenshotMonitor } = require("./screenshot-monitor.cjs");

const APP_PORT = 3210;
const DATABASE_PORT = 55432;
const APP_URL = process.env.WORKLOG_APP_URL || (app.isPackaged ? `http://127.0.0.1:${APP_PORT}` : "http://localhost:3000");
const APP_ORIGIN = new URL(APP_URL).origin;

let mainWindow;
let splashWindow;
let nextProcess;
let screenshotMonitor;

function writeDesktopLog(message) {
  try {
    const directory = app.getPath("userData");
    fs.mkdirSync(directory, { recursive: true });
    fs.appendFileSync(path.join(directory, "desktop.log"), `${new Date().toISOString()} ${message}\n`, "utf8");
  } catch {
    // Logging must never prevent the application from opening.
  }
}

function isTrustedAppUrl(value) {
  try {
    return new URL(value).origin === APP_ORIGIN;
  } catch {
    return false;
  }
}

function openExternalHttpUrl(value) {
  try {
    const url = new URL(value);
    if (url.protocol === "https:" || url.protocol === "http:") void shell.openExternal(url.href);
  } catch {
    // Ignore malformed navigation targets.
  }
}

function getStorageRoot() {
  if (process.platform === "win32" && process.env.LOCALAPPDATA) {
    return path.join(process.env.LOCALAPPDATA, "WorkLog Ultra", "TaskMonitor");
  }
  return path.join(app.getPath("userData"), "TaskMonitor");
}

function isServerReady() {
  return new Promise((resolve) => {
    const request = http.get(APP_URL, (response) => {
      response.resume();
      resolve(true);
    });
    request.setTimeout(800, () => request.destroy());
    request.on("error", () => resolve(false));
  });
}

function runProcess(command, args, options = {}) {
  return new Promise((resolve, reject) => {
    const { capture = true, ...spawnOptions } = options;
    const child = spawn(command, args, {
      ...spawnOptions,
      windowsHide: true,
      stdio: capture ? ["ignore", "pipe", "pipe"] : "ignore",
    });
    let stdout = "";
    let stderr = "";
    child.stdout?.on("data", (chunk) => { stdout += chunk.toString(); });
    child.stderr?.on("data", (chunk) => { stderr += chunk.toString(); });
    child.once("error", reject);
    child.once("close", (code) => {
      if (code === 0) resolve({ stdout, stderr });
      else reject(new Error(`${path.basename(command)} failed (${code}): ${stderr || stdout}`));
    });
  });
}

function getPostgresPaths() {
  const root = path.join(process.resourcesPath, "postgres");
  return {
    bin: path.join(root, "bin"),
    data: path.join(app.getPath("userData"), "database"),
    initdb: path.join(root, "bin", "initdb.exe"),
    pgCtl: path.join(root, "bin", "pg_ctl.exe"),
    psql: path.join(root, "bin", "psql.exe"),
    createdb: path.join(root, "bin", "createdb.exe"),
    schema: path.join(process.resourcesPath, "database-schema.sql"),
  };
}

function getPostgresEnvironment(paths) {
  return {
    ...process.env,
    PATH: `${paths.bin};${process.env.PATH || ""}`,
    PGHOST: "127.0.0.1",
    PGPORT: String(DATABASE_PORT),
    PGUSER: "postgres",
  };
}

async function ensurePostgres() {
  if (!app.isPackaged) return;
  const paths = getPostgresPaths();
  const env = getPostgresEnvironment(paths);
  await fsp.mkdir(paths.data, { recursive: true });

  if (!fs.existsSync(path.join(paths.data, "PG_VERSION"))) {
    writeDesktopLog("initializing private PostgreSQL database");
    await runProcess(paths.initdb, ["-D", paths.data, "-U", "postgres", "-A", "trust", "--encoding=UTF8", "--no-locale"], { env });
  }

  const status = await runProcess(paths.pgCtl, ["status", "-D", paths.data], { env }).then(() => true).catch(() => false);
  if (!status) {
    await runProcess(paths.pgCtl, ["start", "-D", paths.data, "-l", path.join(paths.data, "postgres.log"), "-o", `-p ${DATABASE_PORT} -h 127.0.0.1`, "-w"], { env, capture: false });
  }

  const databaseExists = await runProcess(paths.psql, ["-d", "postgres", "-tAc", "SELECT 1 FROM pg_database WHERE datname='worklog_ultra'"], { env })
    .then(({ stdout }) => stdout.trim() === "1");
  if (!databaseExists) await runProcess(paths.createdb, ["worklog_ultra"], { env });

  const schemaMarker = path.join(paths.data, "worklog-schema-v1.ready");
  if (!fs.existsSync(schemaMarker)) {
    await runProcess(paths.psql, ["-d", "worklog_ultra", "-v", "ON_ERROR_STOP=1", "-f", paths.schema], { env });
    await fsp.writeFile(schemaMarker, new Date().toISOString(), "utf8");
  }

  await applyPendingSchemaPatches(paths, env);
  writeDesktopLog("private PostgreSQL database ready");
}

/**
 * `database-schema.sql` is a one-time snapshot bundled into the app; it goes
 * stale the moment the Prisma schema gains a migration after that snapshot
 * was taken; a marker-file guard like the one above (`worklog-schema-v1.ready`,
 * "have we ever run this") can't detect that drift and silently leaves an
 * existing install missing whatever came after — which is exactly what
 * happened to the screenshots/devices tables the first time this shipped.
 *
 * Each patch checks the database's *actual current state* instead of a
 * marker, which is what makes this self-healing: it applies exactly once,
 * on whichever install (fresh or upgraded) actually needs it, and is a
 * no-op forever after on a database that already has it — regardless of
 * app version. Add one entry here per migration shipped after the bundled
 * snapshot; each `check` should read false only when that migration's
 * effect is genuinely missing.
 */
const SCHEMA_PATCHES = [
  {
    label: "screenshot monitoring schema",
    check: "SELECT 1 FROM information_schema.tables WHERE table_name = 'screenshots'",
    file: "screenshot-monitoring-schema.sql",
  },
  {
    label: "screenshot log survives delete",
    check:
      "SELECT 1 FROM information_schema.columns WHERE table_name = 'screenshot_access_logs' AND column_name = 'screenshot_id' AND is_nullable = 'YES'",
    file: "screenshot-log-nullable-schema.sql",
  },
  {
    label: "task activity history",
    check:
      "SELECT 1 FROM information_schema.tables WHERE table_name = 'task_activity_events'",
    file: "task-activity-history-schema.sql",
  },
];

async function applyPendingSchemaPatches(paths, env) {
  for (const patch of SCHEMA_PATCHES) {
    const alreadyApplied = await runProcess(paths.psql, ["-d", "worklog_ultra", "-tAc", patch.check], { env })
      .then(({ stdout }) => stdout.trim() === "1")
      .catch(() => false);
    if (alreadyApplied) continue;

    writeDesktopLog(`applying schema patch: ${patch.label}`);
    await runProcess(paths.psql, ["-d", "worklog_ultra", "-v", "ON_ERROR_STOP=1", "-f", path.join(process.resourcesPath, patch.file)], { env });
    writeDesktopLog(`schema patch ready: ${patch.label}`);
  }
}

function getDesktopRuntimeRoot() {
  return path.join(app.getPath("userData"), `app-runtime-${app.getVersion()}`);
}

function hashFile(filePath) {
  return new Promise((resolve, reject) => {
    const hash = crypto.createHash("sha256");
    const stream = fs.createReadStream(filePath);
    stream.on("data", (chunk) => hash.update(chunk));
    stream.on("end", () => resolve(hash.digest("hex")));
    stream.on("error", reject);
  });
}

/**
 * Extraction is cached by the *content* of the bundled archive, not just the
 * app version. Two installs can legitimately share a version number during
 * iterative testing (or a hotfix rebuild that forgot to bump it) — keying
 * the cache on version alone left a stale extracted web app silently served
 * forever after such a rebuild, with the new Electron shell calling APIs
 * the old cached server didn't have. The hash marker makes that impossible:
 * any change to the bundled archive is a cache miss regardless of version.
 */
async function ensureDesktopRuntime() {
  if (!app.isPackaged) return;
  const runtimeRoot = getDesktopRuntimeRoot();
  const archivePath = path.join(process.resourcesPath, "app-runtime.7z");
  const hashMarkerPath = path.join(runtimeRoot, ".archive-hash");
  const bundledHash = await hashFile(archivePath);
  const cachedHash = await fsp.readFile(hashMarkerPath, "utf8").then((value) => value.trim()).catch(() => null);
  const runtimeFilesPresent =
    fs.existsSync(path.join(runtimeRoot, "server.js")) && fs.existsSync(path.join(runtimeRoot, "node_modules", "next"));

  if (runtimeFilesPresent && cachedHash === bundledHash) return;

  writeDesktopLog(`extracting latest UI runtime ${app.getVersion()} (${bundledHash.slice(0, 12)})`);
  await fsp.rm(runtimeRoot, { recursive: true, force: true });
  await fsp.mkdir(runtimeRoot, { recursive: true });
  await runProcess(
    path.join(process.resourcesPath, "7za.exe"),
    ["x", archivePath, `-o${runtimeRoot}`, "-y"],
  );
  if (!fs.existsSync(path.join(runtimeRoot, "server.js"))) throw new Error("Latest UI runtime extraction failed.");
  await fsp.writeFile(hashMarkerPath, bundledHash, "utf8");
  writeDesktopLog("latest UI runtime ready");
}

async function ensureDesktopUploads() {
  if (!app.isPackaged) return;
  const publicUploads = path.join(getDesktopRuntimeRoot(), "public", "uploads");
  const userUploads = path.join(app.getPath("userData"), "uploads");
  await fsp.mkdir(path.dirname(publicUploads), { recursive: true });
  await fsp.mkdir(userUploads, { recursive: true });
  const existing = await fsp.lstat(publicUploads).catch(() => null);
  if (existing?.isSymbolicLink()) return;
  if (existing) await fsp.rm(publicUploads, { recursive: true, force: true });
  await fsp.symlink(userUploads, publicUploads, "junction");
}

async function ensureNextServer() {
  if (await isServerReady()) return;
  if (app.isPackaged) {
    const serverFile = path.join(getDesktopRuntimeRoot(), "server.js");
    const serverLog = fs.openSync(path.join(app.getPath("userData"), "next-server.log"), "a");
    nextProcess = spawn(process.execPath, [serverFile], {
      cwd: path.dirname(serverFile),
      env: {
        ...process.env,
        ELECTRON_RUN_AS_NODE: "1",
        WORKLOG_DESKTOP: "1",
        HOSTNAME: "127.0.0.1",
        PORT: String(APP_PORT),
        DATABASE_URL: `postgresql://postgres@127.0.0.1:${DATABASE_PORT}/worklog_ultra`,
        APP_BASE_URL: APP_URL,
        AUTH_EMAIL_REDIRECT_TO: APP_URL,
      },
      windowsHide: true,
      stdio: ["ignore", serverLog, serverLog],
    });
  } else {
    const isWindows = process.platform === "win32";
    const command = isWindows ? process.env.ComSpec || "C:\\Windows\\System32\\cmd.exe" : "npm";
    const args = isWindows ? ["/d", "/s", "/c", "npm.cmd run dev"] : ["run", "dev"];
    nextProcess = spawn(command, args, {
      cwd: path.join(__dirname, ".."),
      env: { ...process.env, WORKLOG_DESKTOP: "1" },
      windowsHide: true,
      stdio: "ignore",
    });
  }

  for (let attempt = 0; attempt < 80; attempt += 1) {
    await new Promise((resolve) => setTimeout(resolve, 500));
    if (await isServerReady()) return;
  }
  throw new Error("WorkLog web server did not start.");
}

/**
 * Shown the instant Electron is ready, before Postgres/runtime bootstrap —
 * without it the app is a blank nothing for however long first-run setup
 * takes (tens of seconds), which is exactly what invites someone to
 * double-click the icon again, spawning a second bootstrap racing the first.
 */
function createSplashWindow() {
  splashWindow = new BrowserWindow({
    width: 360,
    height: 220,
    frame: false,
    resizable: false,
    movable: false,
    alwaysOnTop: true,
    skipTaskbar: true,
    backgroundColor: "#000080",
    webPreferences: { contextIsolation: true, nodeIntegration: false },
  });
  splashWindow.loadURL(
    "data:text/html;charset=utf-8," +
      encodeURIComponent(`<!doctype html><html><head><style>
        html,body{margin:0;height:100%;background:linear-gradient(160deg,#000080 0%,#001f66 55%,#020b31 100%);
          display:flex;align-items:center;justify-content:center;flex-direction:column;gap:14px;
          font-family:Segoe UI,Arial,sans-serif;color:#f8fbff;}
        .spinner{width:32px;height:32px;border-radius:50%;border:3px solid rgba(248,251,255,0.25);
          border-top-color:#35d39a;animation:spin 0.8s linear infinite;}
        @keyframes spin{to{transform:rotate(360deg);}}
        p{margin:0;font-size:13px;letter-spacing:0.02em;opacity:0.9;}
      </style></head><body>
        <div class="spinner"></div>
        <p>Starting WorkLog Ultra...</p>
      </body></html>`),
  );
}

function closeSplashWindow() {
  if (splashWindow && !splashWindow.isDestroyed()) splashWindow.close();
  splashWindow = null;
}

function createMainWindow() {
  mainWindow = new BrowserWindow({
    width: 1440,
    height: 920,
    minWidth: 1080,
    minHeight: 700,
    show: false,
    backgroundColor: "#eef3f9",
    autoHideMenuBar: true,
    webPreferences: {
      preload: path.join(__dirname, "preload.cjs"),
      contextIsolation: true,
      nodeIntegration: false,
    },
  });
  mainWindow.once("ready-to-show", () => {
    closeSplashWindow();
    mainWindow?.show();
  });
  mainWindow.webContents.setWindowOpenHandler(({ url }) => {
    if (isTrustedAppUrl(url)) return { action: "allow" };
    openExternalHttpUrl(url);
    return { action: "deny" };
  });
  mainWindow.webContents.on("will-navigate", (event, url) => {
    if (isTrustedAppUrl(url)) return;
    event.preventDefault();
    openExternalHttpUrl(url);
  });
  mainWindow.loadURL(APP_URL).catch((error) => {
    closeSplashWindow();
    dialog.showErrorBox(
      "WorkLog connection failed",
      `WorkLog server-এ সংযোগ করা যায়নি। Internet connection পরীক্ষা করে app আবার চালু করুন.\n\n${error.message}`,
    );
  });
}

function createScreenshotMonitorInstance() {
  return createScreenshotMonitor({
    appUrl: APP_URL,
    storageRoot: getStorageRoot(),
    log: (message) => writeDesktopLog(`[monitor] ${message}`),
    onStatusChange: (status) => mainWindow?.webContents.send("screenshot:status", status),
  });
}

/**
 * Monitoring is driven only by attendance. Task timers (`source: "task:*"`)
 * still fire the same renderer event for backwards compatibility with the
 * per-task UI, but must never start or stop the screenshot scheduler — the
 * backend only ever accepts uploads while a work session (attendance) is
 * open, so gating capture on anything narrower than that just produced
 * screenshots the server would reject.
 */
const IDLE_STATUS = { state: "STOPPED", running: false, paused: false, userId: null, label: null, pending: 0, intervalMinutes: 5, nextCaptureAt: null };

ipcMain.handle("screenshot:start", (_event, input = {}) => {
  if (!screenshotMonitor || String(input.source) !== "attendance") return screenshotMonitor?.getStatus() ?? IDLE_STATUS;
  return screenshotMonitor.start({ userId: String(input.userId || ""), label: String(input.label || "Attendance") });
});

ipcMain.handle("screenshot:stop", (_event, input = {}) => {
  if (!screenshotMonitor || String(input.source) !== "attendance") return screenshotMonitor?.getStatus() ?? IDLE_STATUS;
  return screenshotMonitor.stop();
});

ipcMain.handle("screenshot:pause", () => screenshotMonitor?.pause() ?? IDLE_STATUS);
ipcMain.handle("screenshot:resume", () => screenshotMonitor?.resume() ?? IDLE_STATUS);
ipcMain.handle("screenshot:status", () => screenshotMonitor?.getStatus() ?? IDLE_STATUS);

function getCredentialsFilePath() {
  return path.join(app.getPath("userData"), "remembered-credentials.json");
}

/**
 * "Remember me" persisting only the email (never the password) was the
 * actual bug: a bare Electron BrowserWindow has no built-in password-save
 * prompt — that UI is a Google Chrome feature, not part of Chromium/Electron
 * itself — so there was never any mechanism that could have remembered it.
 * `safeStorage` encrypts with the OS's own credential store (DPAPI on
 * Windows, Keychain on macOS), so the password is never written to disk in
 * plain text; only the login form (via preload) ever sees it decrypted.
 */
ipcMain.handle("credentials:save", (_event, input = {}) => {
  const email = String(input.email || "");
  const password = String(input.password || "");
  if (!email || !password || !safeStorage.isEncryptionAvailable()) return { ok: false };
  try {
    const encrypted = safeStorage.encryptString(password).toString("base64");
    fs.writeFileSync(getCredentialsFilePath(), JSON.stringify({ email, password: encrypted }), "utf8");
    return { ok: true };
  } catch (error) {
    writeDesktopLog(`credentials save failed: ${error instanceof Error ? error.message : String(error)}`);
    return { ok: false };
  }
});

ipcMain.handle("credentials:load", () => {
  try {
    const raw = fs.readFileSync(getCredentialsFilePath(), "utf8");
    const parsed = JSON.parse(raw);
    if (!parsed?.email || !parsed?.password || !safeStorage.isEncryptionAvailable()) return null;
    const password = safeStorage.decryptString(Buffer.from(parsed.password, "base64"));
    return { email: parsed.email, password };
  } catch {
    return null;
  }
});

ipcMain.handle("credentials:clear", () => {
  fs.rmSync(getCredentialsFilePath(), { force: true });
  return { ok: true };
});

const hasSingleInstanceLock = app.requestSingleInstanceLock();
writeDesktopLog(`startup packaged=${app.isPackaged} url=${APP_URL} singleInstance=${hasSingleInstanceLock}`);
if (!hasSingleInstanceLock) {
  app.quit();
} else {
  app.on("second-instance", () => {
    // A relaunch during the slow first-run bootstrap (Postgres init, web
    // runtime extraction) lands here before mainWindow exists — focusing the
    // splash instead of doing nothing is what tells the person their click
    // registered, so they stop clicking again.
    const target = mainWindow ?? splashWindow;
    if (!target) return;
    if (mainWindow?.isMinimized()) mainWindow.restore();
    target.show();
    target.focus();
  });

  app.whenReady().then(async () => {
    writeDesktopLog("electron ready");
    app.setAppUserModelId("com.worklog.ultra");
    createSplashWindow();
    await ensurePostgres();
    await ensureDesktopRuntime();
    await ensureDesktopUploads();
    await ensureNextServer();
    createMainWindow();
    screenshotMonitor = createScreenshotMonitorInstance();
    // Backend is authoritative: this is what restores monitoring after a
    // restart while attendance is still active, and what makes the agent
    // self-heal if it ever missed a stop signal — never trust renderer state
    // alone for whether capture should be running.
    await screenshotMonitor.init();
  }).catch((error) => {
    writeDesktopLog(`startup failed: ${error instanceof Error ? error.stack || error.message : String(error)}`);
    console.error("WorkLog Electron startup failed:", error);
    closeSplashWindow();
    dialog.showErrorBox("WorkLog startup failed", error instanceof Error ? error.stack || error.message : String(error));
    app.quit();
  });
}

app.on("window-all-closed", () => {
  if (process.platform !== "darwin") app.quit();
});

app.on("before-quit", () => {
  screenshotMonitor?.shutdown();
  if (nextProcess && !nextProcess.killed) nextProcess.kill();
  // Signal the renderer to stop any running timers before app closes
  if (mainWindow && !mainWindow.isDestroyed()) {
    mainWindow.webContents.send("app:quit");
  }
  if (app.isPackaged) {
    const paths = getPostgresPaths();
    const child = spawn(paths.pgCtl, ["stop", "-D", paths.data, "-m", "fast", "-w"], {
      env: getPostgresEnvironment(paths),
      windowsHide: true,
      detached: true,
      stdio: "ignore",
    });
    child.unref();
  }
});
