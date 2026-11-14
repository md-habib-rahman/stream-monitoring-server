const { execFile } = require("node:child_process");
const { promisify } = require("node:util");

const execFileAsync = promisify(execFile);

async function checkIcmp(target, config, timeoutMs) {
  const isWindows = process.platform === "win32";
  const args = isWindows
    ? ["-n", "1", "-w", String(timeoutMs), target.address]
    : ["-n", "-c", "1", "-W", String(Math.ceil(timeoutMs / 1000)), target.address];
  const startedAt = Date.now();

  try {
    const { stdout } = await execFileAsync("ping", args, {
      timeout: timeoutMs,
      windowsHide: true,
      maxBuffer: 64 * 1024,
    });
    const match = stdout.match(/time[=<]\s*([\d.]+)\s*ms/i);
    const latencyMs = match ? Number(match[1]) : Date.now() - startedAt;
    return {
      succeeded: true,
      latencyMs,
      observedValue: { latencyMs },
    };
  } catch (error) {
    return {
      succeeded: false,
      latencyMs: Date.now() - startedAt,
      error: error.killed ? "ICMP check timed out" : "ICMP host is unreachable",
    };
  }
}

module.exports = checkIcmp;
