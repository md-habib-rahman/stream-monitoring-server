const test = require("node:test");
const assert = require("node:assert/strict");
const TbsManager = require("../services/tbs/tbsManager");

test("loads active devices from the repository and keeps credentials private", async () => {
  const privateDevice = {
    id: "tbs-01",
    name: "Primary TBS",
    host: "https://tbs.example.test",
    username: "operator",
    password: "secret",
  };
  const manager = new TbsManager({
    deviceRepository: {
      async listActiveDevicesWithCredentials() {
        return [privateDevice];
      },
    },
    clientFactory(device) {
      return { deviceId: device.id, credentials: device };
    },
  });

  assert.deepEqual(await manager.loadFromDatabase(), [
    {
      id: "tbs-01",
      name: "Primary TBS",
      host: "https://tbs.example.test",
    },
  ]);
  assert.deepEqual(manager.getClient("tbs-01").credentials, privateDevice);
  assert.throws(() => manager.getClient("missing"), { statusCode: 404 });
  assert.equal(JSON.stringify(manager.listDevices()).includes("secret"), false);
});
