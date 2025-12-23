const { exec } = require("child_process");

/**
 * Fixes an app by:
 * 1. Force terminating the app process
 * 2. Relaunching the app immediately
 */
async function fixApp(appName) {
  if (!appName) {
    return { message: "No app specified." };
  }

  try {
    // 1️⃣ Force kill the app (immediate)
    await execPromise(`pkill -9 -f "${appName}"`);

    // Small delay to let macOS clean up
    await sleep(300);

    // 2️⃣ Relaunch the app
    await execPromise(`open -a "${appName}"`);

    return {
      message: `Force restarted ${appName}.`
    };
  } catch (err) {
    return {
      message: `Could not restart ${appName}.`
    };
  }
}

/* ---------------- Helpers ---------------- */

function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

function execPromise(command) {
  return new Promise((resolve, reject) => {
    exec(command, (err) => {
      if (err) reject(err);
      else resolve();
    });
  });
}

module.exports = {
  fixApp
};
