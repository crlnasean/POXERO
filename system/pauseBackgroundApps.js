const { exec } = require("child_process");

// Track when apps were last seen as foreground
const lastForegroundSeen = new Map();

// App must be inactive for this long to be eligible (ms)
const BACKGROUND_GRACE_MS = 3000;

// Mark an app as foreground NOW
function markAppAsForeground(appName) {
  if (!appName) return;
  lastForegroundSeen.set(appName, Date.now());
}

// Get running user-facing apps
function getRunningApps() {
  return new Promise((resolve) => {
    const script = `
      tell application "System Events"
        set appList to name of every application process whose background only is false
        return appList
      end tell
    `;
    exec(`osascript -e '${script}'`, (err, stdout) => {
      if (err) return resolve([]);
      const raw = stdout.toString().trim();
      if (!raw) return resolve([]);
      resolve(
        raw.split(",").map(a => a.trim()).filter(Boolean)
      );
    });
  });
}

// Pause an app safely
function pauseApp(appName) {
  return new Promise((resolve) => {
    exec(`pkill -STOP -f "${appName}"`, () => resolve());
  });
}

// Resume a paused app
function resumeOnePausedApp(pid) {
  return new Promise((resolve) => {
    if (!pid) return resolve();
    try {
      process.kill(pid, "SIGCONT");
    } catch {}
    resolve();
  });
}

// Get PID for app name
function getPidForApp(appName) {
  return new Promise((resolve) => {
    exec(`pgrep -ix "${appName}"`, (err, stdout) => {
      if (err) return resolve(null);
      const pid = parseInt(stdout.toString().split("\n")[0], 10);
      resolve(Number.isFinite(pid) ? pid : null);
    });
  });
}

async function pauseBackgroundApps(currentActiveApp) {
  const now = Date.now();

  // Mark current app as foreground immediately
  markAppAsForeground(currentActiveApp);

  const runningApps = await getRunningApps();
  const eligible = [];

  for (const app of runningApps) {
    if (
      !app ||
      app === "POXERO" ||
      app === "Electron" ||
      app === currentActiveApp
    ) {
      continue;
    }

    const lastSeen = lastForegroundSeen.get(app) || 0;
    const inactiveFor = now - lastSeen;

    if (inactiveFor >= BACKGROUND_GRACE_MS) {
      eligible.push(app);
    }
  }

  if (eligible.length === 0) {
    return {
      message: "No background apps were eligible to pause.",
      pausedApps: []
    };
  }

  const pausedApps = [];

  for (const app of eligible) {
    const pid = await getPidForApp(app);
    if (!pid) continue;

    await pauseApp(app);

    pausedApps.push({ name: app, pid });
  }

  if (pausedApps.length === 0) {
    return {
      message: "No background apps could be paused safely.",
      pausedApps: []
    };
  }

  return {
    message:
      pausedApps.length === 1
        ? `Paused background app: ${pausedApps[0].name}`
        : `Paused ${pausedApps.length} background apps.`,
    pausedApps
  };
}

module.exports = {
  pauseBackgroundApps,
  resumeOnePausedApp,
  markAppAsForeground
};
