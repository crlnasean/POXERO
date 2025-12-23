const os = require("os");

async function getPidForAppName(appName) {
  if (os.platform() === "darwin") {
    const mac = require("./focusBoost.macos");
    return await mac.getPidForAppNameMacOS(appName);
  }
  return null;
}

async function setNiceTo(pid, targetNice) {
  if (os.platform() === "darwin") {
    const mac = require("./focusBoost.macos");
    return await mac.setNiceToMacOS(pid, targetNice);
  }
  return { ok: false, previousNice: null, message: "Not supported on this platform yet." };
}

function startCaffeinate(pid) {
  if (os.platform() === "darwin") {
    const mac = require("./focusBoost.macos");
    return mac.startCaffeinateForPid(pid);
  }
  return null;
}

module.exports = {
  getPidForAppName,
  setNiceTo,
  startCaffeinate
};
