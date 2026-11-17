const test = require("node:test");
const assert = require("node:assert/strict");
const express = require("express");
const channelRoutes = require("../routes/streamRoutes");

async function withRouter(role, repository, run) {
  const app = express();
  app.use(express.json());
  app.use(
    "/api/channels",
    channelRoutes.createStreamRouter({
      repository,
      authenticate(req, res, next) {
        req.user = { id: 8, role };
        next();
      },
    }),
  );
  const server = await new Promise((resolve) => {
    const listener = app.listen(0, "127.0.0.1", () => resolve(listener));
  });
  try {
    await run(`http://127.0.0.1:${server.address().port}/api/channels`);
  } finally {
    await new Promise((resolve, reject) =>
      server.close((error) => (error ? reject(error) : resolve())),
    );
  }
}

test("only SUPER_ADMIN can modify channel TBS mappings", async () => {
  let updateArguments;
  const repository = {
    async updateChannel(...args) {
      updateArguments = args;
      return { id: args[0], ...args[1] };
    },
  };
  const channel = {
    name: "News",
    url: "https://stream.example.test/live.m3u8",
    tbs_mappings: [
      {
        label: "Main 720p",
        tbs_device_id: "tbs-01",
        tbs_mid: "17",
        tbs_mod: "cdn",
      },
    ],
  };

  await withRouter("ADMIN", repository, async (baseUrl) => {
    const denied = await fetch(`${baseUrl}/1`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(channel),
    });
    assert.equal(denied.status, 403);
    assert.equal(updateArguments, undefined);
  });

  await withRouter("SUPER_ADMIN", repository, async (baseUrl) => {
    const allowed = await fetch(`${baseUrl}/1`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(channel),
    });
    assert.equal(allowed.status, 200);
    assert.equal(updateArguments[2], true);
    assert.equal(updateArguments[1].tbs_mappings.length, 1);
    assert.equal(updateArguments[1].tbs_mappings[0].label, "Main 720p");
  });

  test("rejects duplicate rendition labels and duplicate TBS streams", async () => {
    const repository = {
      async createChannel() {
        throw new Error("Invalid duplicate mappings reached the repository");
      },
    };
    const baseMapping = {
      label: "720p",
      tbs_device_id: "tbs-01",
      tbs_mid: "17",
      tbs_mod: "cdn",
    };

    await withRouter("SUPER_ADMIN", repository, async (baseUrl) => {
      for (const mappings of [
        [baseMapping, { ...baseMapping, tbs_mid: "18", label: "720P" }],
        [baseMapping, { ...baseMapping, label: "Backup" }],
      ]) {
        const response = await fetch(baseUrl, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            name: "News",
            url: "https://stream.example.test/live.m3u8",
            tbs_mappings: mappings,
          }),
        });
        assert.equal(response.status, 400);
      }
    });
  });
});

test("ordinary channel edits preserve existing TBS mappings", async () => {
  let updateArguments;
  const repository = {
    async updateChannel(...args) {
      updateArguments = args;
      return { id: args[0] };
    },
  };

  await withRouter("ADMIN", repository, async (baseUrl) => {
    const response = await fetch(`${baseUrl}/2`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        name: "Renamed",
        url: "https://stream.example.test/live.m3u8",
      }),
    });
    assert.equal(response.status, 200);
    assert.equal(updateArguments[2], false);
  });
});
