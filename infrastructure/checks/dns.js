const dns = require("node:dns/promises");

const RECORD_TYPES = new Set(["A", "AAAA", "CNAME", "MX", "NS", "TXT"]);

async function checkDns(target, config, timeoutMs) {
  const hostname = config.hostname || target.address;
  const recordType = String(config.recordType || "A").toUpperCase();
  if (!RECORD_TYPES.has(recordType)) {
    throw new Error("Unsupported DNS record type");
  }

  const startedAt = Date.now();
  let timeout;
  const records = await Promise.race([
    dns.resolve(hostname, recordType),
    new Promise((_, reject) => {
      timeout = setTimeout(
        () => reject(new Error("DNS check timed out")),
        timeoutMs,
      );
    }),
  ]).finally(() => clearTimeout(timeout));

  return {
    succeeded: records.length > 0,
    latencyMs: Date.now() - startedAt,
    observedValue: { hostname, recordType, records },
    error: records.length === 0 ? "No DNS records found" : undefined,
  };
}

module.exports = checkDns;
