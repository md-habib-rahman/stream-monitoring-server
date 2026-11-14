const net = require("node:net");
const tls = require("node:tls");

function checkTls(target, config, timeoutMs) {
  const port = Number(config.port || 443);
  if (!Number.isInteger(port) || port < 1 || port > 65535) {
    throw new Error("TLS check requires a valid port");
  }

  const host = config.host || target.address;
  const startedAt = Date.now();
  return new Promise((resolve) => {
    const socket = tls.connect({
      host,
      port,
      servername: net.isIP(host) ? undefined : host,
      rejectUnauthorized: false,
    });
    let settled = false;

    const finish = (result) => {
      if (settled) return;
      settled = true;
      clearTimeout(connectionTimeout);
      socket.destroy();
      resolve(result);
    };

    const connectionTimeout = setTimeout(
      () =>
        finish({
          succeeded: false,
          latencyMs: Date.now() - startedAt,
          error: "TLS check timed out",
        }),
      timeoutMs,
    );
    socket.once("secureConnect", () => {
      const certificate = socket.getPeerCertificate();
      const expiresAt = certificate.valid_to
        ? new Date(certificate.valid_to)
        : null;
      if (!expiresAt || Number.isNaN(expiresAt.getTime())) {
        finish({
          succeeded: false,
          latencyMs: Date.now() - startedAt,
          error: "TLS peer did not provide a valid certificate",
        });
        return;
      }

      const daysRemaining = Math.floor(
        (expiresAt.getTime() - Date.now()) / 86400000,
      );
      finish({
        succeeded: daysRemaining >= 0,
        latencyMs: Date.now() - startedAt,
        observedValue: {
          expiresAt: expiresAt.toISOString(),
          daysRemaining,
        },
        error: daysRemaining < 0 ? "TLS certificate has expired" : undefined,
      });
    });
    socket.once("error", (error) =>
      finish({
        succeeded: false,
        latencyMs: Date.now() - startedAt,
        error: error.code || "TLS connection failed",
      }),
    );
  });
}

module.exports = checkTls;
