const { execFile } = require("child_process");

function parseFrontmostNameFromLsappinfo(output) {
  const text = (output || "").toString();

  // Common patterns:
  // name="Safari"
  // "name"="Safari"
  let m = text.match(/(?:^|\s)name="([^"]+)"/m);
  if (m && m[1]) return m[1].trim();

  m = text.match(/"name"="([^"]+)"/m);
  if (m && m[1]) return m[1].trim();

  // Some macOS versions show display name like:
  // "LSDisplayName"="Safari"
  m = text.match(/LSDisplayName"="?([^"\n]+)"?/m);
  if (m && m[1]) return m[1].trim();

  return null;
}

function getFrontmostAppViaLsappinfo() {
  return new Promise((resolve) => {
    execFile("/usr/bin/lsappinfo", ["front"], (err, stdout) => {
      if (err) return resolve(null);
      const name = parseFrontmostNameFromLsappinfo(stdout);
      resolve(name || null);
    });
  });
}

function getFrontmostAppViaAppleScript() {
  return new Promise((resolve) => {
    const script = `
      tell application "System Events"
        set frontApp to name of first application process whose frontmost is true
        return frontApp
      end tell
    `;

    execFile("osascript", ["-e", script], (err, stdout) => {
      if (err) return resolve(null);
      const name = (stdout || "").toString().trim();
      resolve(name || null);
    });
  });
}

/**
 * PRODUCTION-SAFE ACTIVE APP:
 * 1) Try lsappinfo front (no Accessibility/Automation needed)
 * 2) Fallback to AppleScript if lsappinfo fails
 * 3) Never return POXERO/Electron as the active app
 */
async function getActiveAppMacOS() {
  let name = await getFrontmostAppViaLsappinfo();

  if (!name) {
    name = await getFrontmostAppViaAppleScript();
  }

  if (!name) return null;

  // Never treat ourselves as the active app
  if (name === "POXERO" || name === "Electron") return null;

  return name;
}

module.exports = { getActiveAppMacOS };
