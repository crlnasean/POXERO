const { exec } = require("child_process");

/**
 * Reads macOS memory pressure using vm_stat.
 * Returns: "Low", "Medium", or "High"
 */
function getMemoryPressureMacOS() {
  return new Promise((resolve) => {
    exec("vm_stat", (err, stdout) => {
      if (err || !stdout) {
        return resolve("Unknown");
      }

      const text = stdout.toString();

      const pageSizeMatch = text.match(/page size of (\d+) bytes/);
      const pageSize = pageSizeMatch ? parseInt(pageSizeMatch[1], 10) : 4096;

      function getValue(key) {
        const match = text.match(new RegExp(`${key}:\\s+(\\d+)\\.`, "i"));
        return match ? parseInt(match[1], 10) * pageSize : 0;
      }

      const free = getValue("Pages free");
      const inactive = getValue("Pages inactive");
      const speculative = getValue("Pages speculative");
      const wired = getValue("Pages wired down");
      const compressed = getValue("Pages occupied by compressor");

      const available = free + inactive + speculative;
      const used = wired + compressed;

      const total = available + used;
      if (total === 0) return resolve("Unknown");

      const pressureRatio = used / total;

      if (pressureRatio < 0.60) return resolve("Low");
      if (pressureRatio < 0.80) return resolve("Medium");
      return resolve("High");
    });
  });
}

module.exports = {
  getMemoryPressureMacOS
};
