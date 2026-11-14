const axios = require("axios");
const net = require("node:net");

async function checkHttp(target, config, timeoutMs) {
  const address =
    net.isIP(target.address) === 6 ? `[${target.address}]` : target.address;
  const url =
    config.url ||
    `${config.protocol || "http"}://${address}${config.path || "/"}`;
  const startedAt = Date.now();
  const response = await axios.get(url, {
    timeout: timeoutMs,
    maxRedirects: 3,
    validateStatus: () => true,
  });
  const expectedStatuses = config.expectedStatuses || null;
  const succeeded = expectedStatuses
    ? expectedStatuses.includes(response.status)
    : response.status >= 200 && response.status < 400;

  return {
    succeeded,
    latencyMs: Date.now() - startedAt,
    observedValue: { statusCode: response.status },
    error: succeeded ? undefined : `Unexpected HTTP status ${response.status}`,
  };
}

module.exports = checkHttp;
