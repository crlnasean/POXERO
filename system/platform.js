function getPlatform() {
  if (process.platform === "darwin") return "macos";
  if (process.platform === "win32") return "windows";
  return "unsupported";
}

module.exports = {
  getPlatform
};
