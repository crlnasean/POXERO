const { execFile, spawn } = require("child_process");

function run(cmd, args) {
  return new Promise((resolve) => {
    execFile(cmd, args, (error, stdout, stderr) => {
      resolve({
        ok: !error,
        stdout: stdout ? stdout.toString() : "",
        stderr: stderr ? stderr.toString() : ""
      });
    });
  });
}

async function getPidForAppNameMacOS(appName) {
  if (!appName) return null;

  const script = `
    tell application "System Events"
      try
        set p to first application process whose name is "${appName}"
        return unix id of p
      on error
        return ""
      end try
    end tell
  `;

  const res = await run("osascript", ["-e", script]);
  if (!res.ok) return null;

  const pid = Number(res.stdout.trim());
  if (!Number.isFinite(pid)) return null;
  return pid;
}

async function getNiceMacOS(pid) {
  const res = await run("ps", ["-o", "nice=", "-p", String(pid)]);
  if (!res.ok) return null;

  const nice = Number(res.stdout.trim());
  if (!Number.isFinite(nice)) return null;
  return nice;
}

/**
 * On macOS, renice typically adjusts by an increment (delta).
 * We compute the delta we need to reach the target nice value.
 */
async function setNiceToMacOS(pid, targetNice) {
  const currentNice = await getNiceMacOS(pid);
  if (!Number.isFinite(currentNice)) {
    return { ok: false, previousNice: null, message: "Could not read current priority." };
  }

  const delta = targetNice - currentNice;
  if (delta === 0) {
    return { ok: true, previousNice: currentNice, message: "Priority already set." };
  }

  const res = await run("renice", ["-n", String(delta), "-p", String(pid)]);
  if (!res.ok) {
    return {
      ok: false,
      previousNice: currentNice,
      message: "macOS blocked changing priority (renice)."
    };
  }

  return { ok: true, previousNice: currentNice, message: "Priority changed." };
}

function startCaffeinateForPid(pid) {
  // Prevent App Nap / sleep for the target app while it runs
  // caffeinate exits when the watched pid exits, or when we kill caffeinate.
  const child = spawn("caffeinate", ["-w", String(pid)], {
    stdio: "ignore"
  });
  return child;
}

module.exports = {
  getPidForAppNameMacOS,
  setNiceToMacOS,
  startCaffeinateForPid
};
