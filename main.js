const { app, BrowserWindow, globalShortcut, ipcMain, shell } = require("electron");
const path = require("path");

/* ================= PLATFORM ================= */
const IS_MAC = process.platform === "darwin";
const IS_WINDOWS = process.platform === "win32";

/* ================= MACOS MODULES ================= */
const { getActiveApp } = require("./system/activeApp");
const { fixApp } = require("./system/fixApp");

const {
  pauseBackgroundApps,
  resumeOnePausedApp,
  markAppAsForeground
} = require("./system/pauseBackgroundApps");

const {
  getPidForAppName,
  setNiceTo,
  startCaffeinate
} = require("./system/focusBoost");

const {
  getMemoryPressureMacOS
} = require("./system/memoryPressure.macos");

/* ================= WINDOW STATE ================= */
let mainWindow = null;
let sessionActiveApp = null;
let pausedApps = [];

let focusBoostEnabled = false;
let boostedAppName = null;
let boostedPid = null;
let boostedPrevNice = null;
let caffeinateProc = null;

let activePollInterval = null;
let memoryPollInterval = null;

/* ================= UTIL ================= */
function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

/* ================= WINDOW ================= */
function createWindow() {
  mainWindow = new BrowserWindow({
    width: 480,
    height: 600,
    resizable: false,
    fullscreenable: false,
    frame: false,
    alwaysOnTop: true,
    skipTaskbar: true,
    show: false,
    backgroundColor: "#000000",
    webPreferences: {
      nodeIntegration: true,
      contextIsolation: false
    }
  });

  mainWindow.loadFile(path.join(__dirname, "index.html"));

  mainWindow.on("hide", () => {
    stopActivePolling();
    stopMemoryPolling();
    sessionActiveApp = null;
  });
}

/* ================= ACTIVE APP POLLING ================= */
function startActivePolling() {
  stopActivePolling();

  activePollInterval = setInterval(async () => {
    if (!IS_MAC) return;

    const name = await getActiveApp();

    if (name && name !== "POXERO" && name !== "Electron") {
      if (sessionActiveApp !== name) {
        sessionActiveApp = name;
        markAppAsForeground(name);

        if (mainWindow) {
          mainWindow.webContents.send("active-app", sessionActiveApp);
        }

        await resumeIfNeededForActiveApp(name);
      }
    }
  }, 500);
}

function stopActivePolling() {
  if (activePollInterval) {
    clearInterval(activePollInterval);
    activePollInterval = null;
  }
}

async function captureInitialActiveApp() {
  if (!IS_MAC) {
    sessionActiveApp = "Windows App (coming soon)";
    return;
  }

  for (let i = 0; i < 20; i++) {
    const name = await getActiveApp();
    if (name && name !== "POXERO" && name !== "Electron") {
      sessionActiveApp = name;
      markAppAsForeground(name);
      return;
    }
    await sleep(100);
  }

  sessionActiveApp = "Unknown App";
}

/* ================= MEMORY PRESSURE ================= */
function startMemoryPolling() {
  stopMemoryPolling();

  memoryPollInterval = setInterval(async () => {
    if (!IS_MAC) return;

    const level = await getMemoryPressureMacOS();
    if (mainWindow) {
      mainWindow.webContents.send("memory-pressure", level);
    }
  }, 2000);
}

function stopMemoryPolling() {
  if (memoryPollInterval) {
    clearInterval(memoryPollInterval);
    memoryPollInterval = null;
  }
}

/* ================= HELPERS ================= */
function sendPausedUpdate() {
  if (!mainWindow) return;
  mainWindow.webContents.send("paused-update", pausedApps.map(a => a.name));
}

async function resumeIfNeededForActiveApp(activeName) {
  if (!pausedApps || pausedApps.length === 0) return;

  const index = pausedApps.findIndex(a => a.name === activeName);
  if (index === -1) return;

  const appToResume = pausedApps[index];
  await resumeOnePausedApp(appToResume.pid);

  pausedApps.splice(index, 1);
  sendPausedUpdate();

  if (mainWindow) {
    mainWindow.webContents.send(
      "status-message",
      `Resumed ${appToResume.name} because it became active.`
    );
  }
}

/* ================= IPC ================= */

ipcMain.handle("fix-app", async () => {
  if (!IS_MAC) {
    return { message: "Fix App is coming soon on Windows." };
  }

  if (!sessionActiveApp || sessionActiveApp === "Unknown App") {
    return { message: "No active app detected to fix." };
  }

  const result = await fixApp(sessionActiveApp);

  if (!result || !result.didRestart) {
    return {
      message: `${sessionActiveApp} appears to be responsive. Nothing needed fixing.`
    };
  }

  return { message: `${sessionActiveApp} was restarted.` };
});

ipcMain.handle("pause-background-apps", async () => {
  if (!IS_MAC) {
    return { message: "Pause Background Apps is coming soon on Windows." };
  }

  if (!sessionActiveApp || sessionActiveApp === "Unknown App") {
    return { message: "No active app detected to protect." };
  }

  const result = await pauseBackgroundApps(sessionActiveApp);
  pausedApps = result.pausedApps || [];
  sendPausedUpdate();

  if (pausedApps.length === 0) {
    return {
      message:
        "No background apps needed pausing. Everything is already calm."
    };
  }

  return {
    message: `Paused ${pausedApps.length} background app${pausedApps.length > 1 ? "s" : ""}.`
  };
});

ipcMain.handle("toggle-focus-boost", async () => {
  if (!IS_MAC) {
    return { message: "Focus Boost is coming soon on Windows." };
  }

  focusBoostEnabled = !focusBoostEnabled;

  if (!focusBoostEnabled) {
    if (caffeinateProc) {
      try { caffeinateProc.kill("SIGTERM"); } catch {}
    }
    caffeinateProc = null;

    if (boostedPid && Number.isFinite(boostedPrevNice)) {
      await setNiceTo(boostedPid, boostedPrevNice);
    }

    boostedAppName = null;
    boostedPid = null;
    boostedPrevNice = null;

    return { message: "Focus Boost turned off." };
  }

  if (!sessionActiveApp || sessionActiveApp === "Unknown App") {
    focusBoostEnabled = false;
    return { message: "No active app detected for Focus Boost." };
  }

  const pid = await getPidForAppName(sessionActiveApp);
  if (!pid) {
    focusBoostEnabled = false;
    return {
      message: `Could not apply Focus Boost to ${sessionActiveApp}.`
    };
  }

  const res = await setNiceTo(pid, -5);
  caffeinateProc = startCaffeinate(pid);

  boostedAppName = sessionActiveApp;
  boostedPid = pid;
  boostedPrevNice = res.previousNice;

  return { message: `Focus Boost active for ${sessionActiveApp}.` };
});

ipcMain.handle("open-link", async (_e, url) => {
  await shell.openExternal(url);
});

/* ================= APP LIFECYCLE ================= */

app.whenReady().then(() => {
  createWindow();

  globalShortcut.register("CommandOrControl+X", async () => {
    if (!mainWindow) return;

    if (mainWindow.isVisible()) {
      mainWindow.hide();
      return;
    }

    await captureInitialActiveApp();

    mainWindow.show();
    mainWindow.focus();

    if (mainWindow) {
      mainWindow.webContents.send("active-app", sessionActiveApp || "Unknown App");
    }

    startActivePolling();
    startMemoryPolling();
  });
});

app.on("will-quit", () => {
  stopActivePolling();
  stopMemoryPolling();
  globalShortcut.unregisterAll();
});
