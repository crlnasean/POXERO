const os = require("os");

async function getActiveApp() {
  if (os.platform() === "darwin") {
    const mac = require("./activeApp.macos");
    return await mac.getActiveAppMacOS();
  }

  return "Active app detection not available";
}

module.exports = {
  getActiveApp
};
