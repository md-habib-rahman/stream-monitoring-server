const test = require("node:test");
const assert = require("node:assert/strict");
const http = require("node:http");
const net = require("node:net");
const { runCheck } = require("../infrastructure/checkRunner");

test("HTTP check reaches a local test service and reports its status", async (t) => {
  const server = http.createServer((request, response) => {
    response.statusCode = request.url === "/down" ? 503 : 200;
    response.end("test");
  });
  await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
  t.after(() => new Promise((resolve) => server.close(resolve)));
  const { port } = server.address();
  const target = { address: "127.0.0.1" };

  const healthy = await runCheck(
    {
      check_type: "http",
      check_config: { url: `http://127.0.0.1:${port}/` },
    },
    target,
  );
  const unhealthy = await runCheck(
    {
      check_type: "http",
      check_config: { url: `http://127.0.0.1:${port}/down` },
    },
    target,
  );

  assert.equal(healthy.succeeded, true);
  assert.equal(healthy.observedValue.statusCode, 200);
  assert.equal(unhealthy.succeeded, false);
  assert.equal(unhealthy.observedValue.statusCode, 503);
});

test("TCP check reports open and closed local ports", async (t) => {
  const server = net.createServer();
  await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
  const openPort = server.address().port;
  t.after(() => new Promise((resolve) => server.close(resolve)));
  const unusedServer = net.createServer();
  await new Promise((resolve) => unusedServer.listen(0, "127.0.0.1", resolve));
  const closedPort = unusedServer.address().port;
  await new Promise((resolve) => unusedServer.close(resolve));

  const openResult = await runCheck(
    { check_type: "tcp", check_config: { port: openPort } },
    { address: "127.0.0.1" },
  );
  const closedResult = await runCheck(
    { check_type: "tcp", check_config: { port: closedPort } },
    { address: "127.0.0.1" },
  );

  assert.equal(openResult.succeeded, true);
  assert.equal(closedResult.succeeded, false);
});
