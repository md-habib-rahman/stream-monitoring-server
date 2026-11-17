const test = require("node:test");
const assert = require("node:assert/strict");
const TbsClient = require("../services/tbs/TbsClient");

const streamXml = `
<root><cdn><dvs name="17"><sta>
  <dnm>News HD</dnm><lock>true</lock><sync>true</sync>
  <fps>25</fps><obr>2400000</obr><dur>120</dur>
  <dis>2</dis><err>1</err><cycc>0</cycc><iaddr>udp://source</iaddr>
</sta></dvs></cdn></root>`;

test("authenticates through the portal handshake and parses telemetry", async () => {
  const calls = [];
  let portalReads = 0;
  const httpClient = {
    async get(url, options) {
      calls.push({ method: "GET", url, options });
      if (url.endsWith("/portal/")) {
        portalReads += 1;
        if (portalReads === 1) {
          return {
            headers: { "set-cookie": ["sid=initial; Path=/"] },
            data: '<a href="/portal/?signin=1">Sign in</a>',
            status: 200,
          };
        }
        if (portalReads === 2) {
          return { data: "<html>Authenticated</html>", status: 200 };
        }
      }
      if (url.includes("signin=1")) {
        return {
          data: '<form action="/portal/?signin=1"></form>',
          status: 200,
        };
      }
      if (url.includes("app=dvbstat")) {
        return { data: streamXml, status: 200 };
      }
      throw new Error(`Unexpected GET ${url}`);
    },
    async post(url, body, options) {
      calls.push({ method: "POST", url, body, options });
      return {
        headers: { "set-cookie": ["sid=authenticated; Path=/"] },
        status: 200,
      };
    },
  };
  const client = new TbsClient(
    {
      id: "tbs-01",
      name: "Primary",
      host: "http://192.0.2.10/",
      username: "operator",
      password: "secret",
    },
    { httpClient, commandDelayMs: 0 },
  );

  const data = await client.getStreams(["cdn"]);
  assert.equal(data.tbsName, "Primary");
  assert.equal(data.count, 1);
  assert.deepEqual(data.streams[0], {
    mid: "17",
    mod: "cdn",
    name: "News HD",
    source: "udp://source",
    status: "online",
    lock: "true",
    sync: true,
    fps: 25,
    bitrateBps: 2400000,
    uptimeSec: 120,
    discontinuities: 2,
    errors: 1,
    loopCount: 0,
  });
  assert.equal(client.sessionCookie, "sid=authenticated");
  assert.equal(calls.filter((call) => call.method === "POST").length, 1);
  assert.equal(calls.at(-1).options.headers.Cookie, "sid=authenticated");
});

test("restart is serialized and always sends only the kill command", async () => {
  let requestedUrl;
  const client = new TbsClient(
    {
      id: "tbs-01",
      host: "https://tbs.example.test",
      username: "operator",
      password: "secret",
    },
    {
      commandDelayMs: 0,
      httpClient: {
        async get(url) {
          requestedUrl = url;
          return { data: "<status>ok</status>", status: 200 };
        },
      },
    },
  );
  client.sessionCookie = "sid=ready";

  const result = await client.restartStream("news&hd", "cdn");
  assert.equal(result.ok, true);
  assert.equal(result.cmd, "kill");
  assert.match(requestedUrl, /cmd=kill/);
  assert.match(requestedUrl, /mid=news%26hd/);
  assert.throws(() => client.restartStream("17", "unsupported"), {
    statusCode: 400,
  });
});
