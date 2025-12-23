const { execFile } = require("child_process");

const BLOCKLIST = new Set([
  "Finder",
  "Dock",
  "SystemUIServer",
  "WindowServer",
  "ControlCenter",
  "NotificationCenter",
  "Electron",
  "POXERO"
]);

function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

function listAppsOnce() {
  return new Promise(resolve => {
    const script = `
      tell application "System Events"
        set out to ""
        repeat with p in (application processes where background only is false)
          set out to out & name of p & "||" & unix id of p & linefeed
        end repeat
        return out
      end tell
    `;

    execFile("osascript", ["-e", script], (err, stdout) => {
      if (err) return resolve([]);

      const apps = stdout
        .toString()
        .split("\n")
        .filter(Boolean)
        .map(line => {
          const [name, pid] = line.split("||");
          return { name, pid: Number(pid) };
        })
        .filter(a => a.name && Number.isFinite(a.pid));

      resolve(apps);
    });
  });
}

function pause(pid) {
  try {
    process.kill(pid, "SIGSTOP");
    return true;
  } catch {
    return false;
  }
}

function resume(pid) {
  try {
    process.kill(pid, "SIGCONT");
    return true;
  } catch {
    return false;
  }
}

/**
 * FINAL LOCKED BEHAVIOR
 *
 * - Take multiple fast samples (~1s)
 * - Union all seen apps
 * - Pause safe background apps
 * - Silent auto-retry once if macOS isn’t ready
 * - One click always works
 */
async function pauseBackgroundAppsMacOS(protectedAppName) {
  async function scanAndPause() {
    const seen = new Map();

    for (let i = 0; i < 7; i++) {
      await sleep(150);
      const apps = await listAppsOnce();
      for (const app of apps) {
        seen.set(`${app.name}||${app.pid}`, app);
      }
    }

    const candidates = Array.from(seen.values()).filter(app => {
      if (BLOCKLIST.has(app.name)) return false;
      if (app.name === protectedAppName) return false;
      return true;
    });

    const pausedApps = [];

    for (const app of candidates) {
      if (pause(app.pid)) {
        pausedApps.push({ name: app.name, pid: app.pid });
      }
    }

    return pausedApps;
  }

  let pausedApps = await scanAndPause();

  if (pausedApps.length === 0) {
    await sleep(500);
    pausedApps = await scanAndPause();
  }

  if (pausedApps.length === 0) {
    return {
      pausedApps: [],
      message: "No background apps were eligible to pause."
    };
  }

  return {
    pausedApps,
    message: `Paused: ${pausedApps.map(a => a.name).join(", ")}`
  };
}

async function resumeAllMacOS(apps) {
  if (!apps || apps.length === 0) {
    return { message: "No paused apps to resume." };
  }

  const resumed = [];

  for (const app of apps) {
    if (resume(app.pid)) resumed.push(app.name);
  }

  return {
    message:
      resumed.length === 0
        ? "Paused apps could not be resumed."
        : `Resumed: ${resumed.join(", ")}`
  };
}

module.exports = {
  pauseBackgroundAppsMacOS,
  resumeAllMacOS,
  resumeOneMacOS: resume
};
