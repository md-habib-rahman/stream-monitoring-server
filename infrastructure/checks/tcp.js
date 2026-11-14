const net = require("node:net");

function checkTcp(target, config, timeoutMs) {
  const port = Number(config.port);
  if (!Number.isInteger(port) || port < 1 || port > 65535) {
    throw new Error("TCP check requires a valid port");
  }

  const startedAt = Date.now();
  return new Promise((resolve) => {
    const socket = net.createConnection({
      host: config.host || target.address,
      port,
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
          error: "TCP check timed out",
        }),
      timeoutMs,
    );
    socket.once("connect", () => {
      finish({
        succeeded: true,
        latencyMs: Date.now() - startedAt,
        observedValue: { port, reachable: true },
      });
    });
    socket.once("error", (error) =>
      finish({
        succeeded: false,
        latencyMs: Date.now() - startedAt,
        error: error.code || "TCP connection failed",
      }),
    );
  });
}

module.exports = checkTcp;
