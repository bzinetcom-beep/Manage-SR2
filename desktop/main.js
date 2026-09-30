"use strict";
/**
 * SRMS Desktop — Electron main process
 * -----------------------------------------------------------------------------
 * Single-click launcher: provisions the database, boots the Next.js server,
 * waits for the health endpoint and then shows the application in a native
 * window. The user never sees a terminal and never types a command.
 */

const path = require("path");
const { app, BrowserWindow, shell, dialog, ipcMain, Menu, Tray, nativeImage } = require("electron");

const { Logger, logsDir, userDataDir, loadConfig, saveConfig } = require("./lib/core");
const { provisionDatabase } = require("./lib/database");
const { startServer } = require("./lib/server");

const log = new Logger("srms-desktop");

let splash = null;
let mainWindow = null;
let tray = null;
let db = null;
let server = null;
let shuttingDown = false;

const APP_TITLE = "سامانه مدیریت منابع سرباز — SRMS";

// Only one running copy: a second double-click focuses the existing window.
if (!app.requestSingleInstanceLock()) {
  app.quit();
  process.exit(0);
}

app.on("second-instance", () => {
  const win = mainWindow || splash;
  if (win) {
    if (win.isMinimized()) win.restore();
    win.show();
    win.focus();
  }
});

// ---------------------------------------------------------------------------
// Windows
// ---------------------------------------------------------------------------

function createSplash() {
  splash = new BrowserWindow({
    width: 460,
    height: 340,
    frame: false,
    transparent: true,
    resizable: false,
    center: true,
    show: false,
    alwaysOnTop: true,
    skipTaskbar: false,
    title: APP_TITLE,
    icon: iconPath(),
    webPreferences: {
      preload: path.join(__dirname, "preload.js"),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: false,
    },
  });
  splash.loadFile(path.join(__dirname, "splash.html"));
  splash.once("ready-to-show", () => splash.show());
  return splash;
}

function iconPath() {
  return path.join(__dirname, "build", "icon.png");
}

function progress(percent, message) {
  log.info(`[${percent}%] ${message}`);
  if (splash && !splash.isDestroyed()) {
    splash.webContents.send("boot:progress", { percent, message });
  }
}

function reportError(error) {
  const message =
    (error && error.message ? error.message : String(error)) +
    `\n\nگزارش کامل: ${path.join(logsDir(), "srms-desktop.log")}`;
  log.error(error);
  if (splash && !splash.isDestroyed()) {
    splash.setAlwaysOnTop(false);
    splash.setSize(520, 470);
    splash.center();
    splash.webContents.send("boot:error", { message });
  } else {
    dialog.showErrorBox("خطا در اجرای برنامه", message);
  }
}

function createMainWindow(url) {
  const bounds = loadConfig().windowBounds || {};
  mainWindow = new BrowserWindow({
    width: bounds.width || 1440,
    height: bounds.height || 900,
    x: bounds.x,
    y: bounds.y,
    minWidth: 1024,
    minHeight: 640,
    show: false,
    title: APP_TITLE,
    backgroundColor: "#0b1a33",
    icon: iconPath(),
    autoHideMenuBar: true,
    webPreferences: {
      contextIsolation: true,
      nodeIntegration: false,
      spellcheck: false,
      // The renderer only ever talks to our own loopback server.
      webSecurity: true,
    },
  });

  if (bounds.maximized) mainWindow.maximize();
  mainWindow.loadURL(url);

  mainWindow.once("ready-to-show", () => {
    mainWindow.show();
    mainWindow.focus();
    if (splash && !splash.isDestroyed()) splash.destroy();
    splash = null;
  });

  // External links open in the real browser, never inside the app shell.
  mainWindow.webContents.setWindowOpenHandler(({ url: target }) => {
    if (target.startsWith(url)) return { action: "allow" };
    shell.openExternal(target);
    return { action: "deny" };
  });

  mainWindow.on("close", () => {
    try {
      const b = mainWindow.getNormalBounds();
      saveConfig({ windowBounds: { ...b, maximized: mainWindow.isMaximized() } });
    } catch {
      /* ignore */
    }
  });

  mainWindow.on("closed", () => {
    mainWindow = null;
  });

  buildMenu(url);
  createTray(url);
  return mainWindow;
}

function buildMenu(url) {
  const template = [
    {
      label: "برنامه",
      submenu: [
        { label: "بارگذاری مجدد", accelerator: "F5", click: () => mainWindow && mainWindow.reload() },
        { label: "باز کردن در مرورگر", click: () => shell.openExternal(url) },
        { type: "separator" },
        { label: "پوشه گزارش‌ها", click: () => shell.openPath(logsDir()) },
        { label: "پوشه داده‌ها", click: () => shell.openPath(userDataDir()) },
        { type: "separator" },
        { role: "quit", label: "خروج" },
      ],
    },
    {
      label: "نمایش",
      submenu: [
        { role: "zoomIn", label: "بزرگ‌نمایی" },
        { role: "zoomOut", label: "کوچک‌نمایی" },
        { role: "resetZoom", label: "اندازه عادی" },
        { role: "togglefullscreen", label: "تمام‌صفحه" },
        { type: "separator" },
        { role: "toggleDevTools", label: "ابزار توسعه‌دهنده", accelerator: "F12" },
      ],
    },
    {
      label: "ویرایش",
      submenu: [
        { role: "undo", label: "واگرد" },
        { role: "redo", label: "ازنو" },
        { type: "separator" },
        { role: "cut", label: "برش" },
        { role: "copy", label: "کپی" },
        { role: "paste", label: "چسباندن" },
        { role: "selectAll", label: "انتخاب همه" },
      ],
    },
    {
      label: "راهنما",
      submenu: [
        {
          label: "درباره",
          click: () =>
            dialog.showMessageBox({
              type: "info",
              title: "درباره",
              message: APP_TITLE,
              detail:
                `نسخه: ${app.getVersion()}\n` +
                `آدرس محلی: ${url}\n` +
                `پایگاه‌داده: ${db ? db.kind : "-"}\n` +
                `پوشه داده‌ها: ${userDataDir()}`,
              buttons: ["بستن"],
            }),
        },
      ],
    },
  ];
  Menu.setApplicationMenu(Menu.buildFromTemplate(template));
}

function createTray(url) {
  try {
    const img = nativeImage.createFromPath(iconPath()).resize({ width: 16, height: 16 });
    tray = new Tray(img);
    tray.setToolTip(APP_TITLE);
    tray.setContextMenu(
      Menu.buildFromTemplate([
        { label: "نمایش برنامه", click: () => mainWindow && (mainWindow.show(), mainWindow.focus()) },
        { label: "باز کردن در مرورگر", click: () => shell.openExternal(url) },
        { type: "separator" },
        { label: "خروج", click: () => app.quit() },
      ]),
    );
    tray.on("double-click", () => mainWindow && (mainWindow.show(), mainWindow.focus()));
  } catch (e) {
    log.warn("tray unavailable", e);
  }
}

// ---------------------------------------------------------------------------
// Boot sequence
// ---------------------------------------------------------------------------

async function boot() {
  progress(5, "بررسی محیط اجرا…");

  progress(20, "آماده‌سازی پایگاه‌داده…");
  db = await provisionDatabase((m) => progress(35, m));
  log.info("database strategy =", db.kind);

  progress(55, "راه‌اندازی موتور برنامه…");
  server = await startServer({
    databaseUrl: db.url,
    log: (m) => progress(70, m),
    onOutput: (chunk) => log.info("[server]", chunk.trimEnd()),
  });

  progress(92, "آماده‌سازی رابط کاربری…");
  createMainWindow(server.origin);
  progress(100, "آماده است");
  log.info("ready at", server.origin);
}

async function bootSafely() {
  try {
    await boot();
  } catch (e) {
    reportError(e);
    await teardown({ quit: false });
  }
}

async function teardown({ quit = true } = {}) {
  if (shuttingDown) return;
  shuttingDown = true;
  log.info("shutting down…");
  try {
    if (server) await server.stop();
  } catch (e) {
    log.warn("server stop", e);
  }
  try {
    if (db) await db.stop();
  } catch (e) {
    log.warn("db stop", e);
  }
  server = null;
  db = null;
  shuttingDown = false;
  if (quit) app.exit(0);
}

// ---------------------------------------------------------------------------
// IPC from the splash screen
// ---------------------------------------------------------------------------

ipcMain.handle("boot:retry", async () => {
  await teardown({ quit: false });
  if (splash && !splash.isDestroyed()) {
    splash.setSize(460, 340);
    splash.center();
    splash.reload();
  }
  setTimeout(bootSafely, 400);
});
ipcMain.handle("boot:openLogs", () => shell.openPath(logsDir()));
ipcMain.handle("boot:quit", () => app.quit());

// ---------------------------------------------------------------------------
// Lifecycle
// ---------------------------------------------------------------------------

app.whenReady().then(() => {
  if (process.platform === "win32") app.setAppUserModelId("ir.srms.desktop");
  createSplash();
  setTimeout(bootSafely, 250); // let the splash paint first
});

app.on("window-all-closed", () => {
  teardown({ quit: true });
});

app.on("before-quit", (e) => {
  if (server || db) {
    e.preventDefault();
    teardown({ quit: true });
  }
});

process.on("uncaughtException", (e) => {
  log.error("uncaughtException", e);
  reportError(e);
});
process.on("unhandledRejection", (e) => log.error("unhandledRejection", e));
