const test = require("node:test");
const assert = require("node:assert/strict");
const express = require("express");
const requireRoles = require("../middleware/requireRoles");
const { createTbsRouter } = require("../routes/tbsRoutes");

async function withServer(role, dependencies, run) {
  const app = express();
  app.use(express.json());
  app.use(
    "/api/tbs",
    createTbsRouter({
      ...dependencies,
      authenticate(req, res, next) {
        req.user = { id: 21, role };
        next();
      },
      requireSuperAdmin: requireRoles("SUPER_ADMIN"),
    }),
  );

  const server = await new Promise((resolve) => {
    const listener = app.listen(0, "127.0.0.1", () => resolve(listener));
  });
  try {
    await run(`http://127.0.0.1:${server.address().port}/api/tbs`);
  } finally {
    await new Promise((resolve, reject) =>
      server.close((error) => (error ? reject(error) : resolve())),
    );
  }
}

test("authenticated users can restart but cannot manage TBS devices", async () => {
  let restartCount = 0;
  const commandEntries = [];
  const manager = {
    getClient(id) {
      return {
        id,
        name: "Primary",
        async restartStream(mid, mod) {
          restartCount += 1;
          return { ok: true, tbsId: id, mid, mod, cmd: "kill" };
        },
      };
    },
  };
  const dependencies = {
    manager,
    devices: {
      async listDevices() {
        return [];
      },
      async getDevice(id) {
        return { id, name: "Primary", is_active: true };
      },
    },
    channels: {
      async getTbsMappingForChannel(mapping) {
        if (
          mapping.deviceId === "tbs-01" &&
          mapping.mid === "17" &&
          mapping.mod === "cdn" &&
          mapping.label === "Main 720p"
        ) {
          return { label: mapping.label };
        }
        return null;
      },
    },
    commands: {
      async createCommandLog(entry) {
        commandEntries.push(entry);
        return { id: commandEntries.length };
      },
      async completeCommandLog(id, result) {
        commandEntries[id - 1].result = result;
      },
    },
  };

  await withServer("USER", dependencies, async (baseUrl) => {
    const restartResponse = await fetch(
      `${baseUrl}/tbs-01/streams/17/restart`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          mod: "cdn",
          channelId: 21,
          mappingLabel: "Main 720p",
        }),
      },
    );
    assert.equal(restartResponse.status, 200);
    assert.equal((await restartResponse.json()).cmd, "kill");
    assert.equal(restartCount, 1);
    assert.equal(commandEntries[0].requestedBy, 21);
    assert.equal(commandEntries[0].channelId, 21);
    assert.equal(commandEntries[0].mappingLabel, "Main 720p");
    assert.equal(commandEntries[0].result.status, "succeeded");

    const createResponse = await fetch(`${baseUrl}/devices`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({}),
    });
    assert.equal(createResponse.status, 403);
  });
});

test("records an unsuccessful restart request for an inactive device", async () => {
  const commandEntries = [];
  const dependencies = {
    manager: {
      getClient() {
        const error = new Error("TBS device not found or inactive");
        error.statusCode = 404;
        throw error;
      },
    },
    devices: {
      async getDevice(id) {
        return { id, name: "Inactive", is_active: false };
      },
    },
    commands: {
      async createCommandLog(entry) {
        commandEntries.push(entry);
        return { id: 1 };
      },
      async completeCommandLog(id, result) {
        commandEntries[id - 1].result = result;
      },
    },
  };

  await withServer("USER", dependencies, async (baseUrl) => {
    const response = await fetch(`${baseUrl}/tbs-01/streams/17/restart`, {
      method: "POST",
    });
    assert.equal(response.status, 404);
    assert.equal(commandEntries.length, 1);
    assert.equal(commandEntries[0].result.status, "failed");
  });
});
