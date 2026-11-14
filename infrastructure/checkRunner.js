const checkIcmp = require("./checks/icmp");
const checkTcp = require("./checks/tcp");
const checkHttp = require("./checks/http");
const checkDns = require("./checks/dns");
const checkTls = require("./checks/tls");

const CHECKS = {
  icmp: checkIcmp,
  tcp: checkTcp,
  http: checkHttp,
  dns: checkDns,
  tls: checkTls,
};

async function runCheck(item, target, timeoutMs = 5000) {
  const check = CHECKS[item.check_type];
  if (!check) {
    return {
      succeeded: false,
      latencyMs: 0,
      error: `Unsupported check type: ${item.check_type}`,
    };
  }

  const startedAt = Date.now();
  try {
    return await check(target, item.check_config || {}, timeoutMs);
  } catch (error) {
    return {
      succeeded: false,
      latencyMs: Date.now() - startedAt,
      error: error.code || error.message || "Check failed",
    };
  }
}

module.exports = {
  runCheck,
};
