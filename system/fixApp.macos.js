const { exec } = require("child_process");

/**
 * Attempts to safely quit and relaunch an app by name (macOS)
 */
async function fixAppMacOS(appName) {
  return new Promise((resolve) => {
    if (!appName || appName === "Unknown App") {
      resolve({ success: false, message: "No active app to fix." });
      return;
    }

    const script = `
      tell application "${appName}"
        try
          if it is running then
            quit
          end if
        end try
      end tell

      delay 1

      tell application "${appName}"
        activate
      end tell
    `;

    exec(`osascript -e '${script}'`, (error) => {
      if (error) {
        resolve({
          success: false,
          message: "POXERO needs permission to control apps."
        });
        return;
      }

      resolve({
        success: true,
        message: "App was restarted successfully."
      });
    });
  });
}

module.exports = {
  fixAppMacOS
};
