const express = require("express");
const authenticatedToken = require("../middleware/authMiddleware");
const requireRoles = require("../middleware/requireRoles");
const deviceRepository = require("../repositories/tbsDeviceRepository");
const commandRepository = require("../repositories/tbsCommandRepository");
const channelRepository = require("../repositories/channelRepository");
const { SUPPORTED_MODS } = require("../services/tbs/dvbstatParser");

const DEVICE_ID_PATTERN = /^[a-zA-Z0-9][a-zA-Z0-9_-]*$/;
const SUPPORTED_MOD_SET = new Set(SUPPORTED_MODS);

function isRecord(value) {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

function parseDevice(body = {}, partial = false) {
  if (!isRecord(body)) return { error: "Request body must be an object" };
  const device = {};

  if (!partial || body.id !== undefined) {
    if (
      typeof body.id !== "string" ||
      !DEVICE_ID_PATTERN.test(body.id) ||
      body.id.length > 64
    ) {
      return { error: "id must be a valid device identifier under 65 characters" };
    }
    device.id = body.id;
  }
  if (!partial || body.name !== undefined) {
    if (typeof body.name !== "string" || !body.name.trim() || body.name.length > 120) {
      return { error: "name is required and must be at most 120 characters" };
    }
    device.name = body.name.trim();
  }
  if (!partial || body.host !== undefined) {
    if (typeof body.host !== "string" || body.host.length > 2048) {
      return { error: "host must be a valid HTTP or HTTPS base URL" };
    }
    try {
      const url = new URL(body.host);
      if (
        !["http:", "https:"].includes(url.protocol) ||
        url.username ||
        url.password ||
        (url.pathname !== "/" && url.pathname !== "") ||
        url.search ||
        url.hash
      ) {
        return { error: "host must be a base HTTP or HTTPS URL without credentials, path, query, or fragment" };
      }
      device.host = url.origin;
    } catch {
      return { error: "host must be a valid HTTP or HTTPS base URL" };
    }
  }

  if (!partial || body.username !== undefined || body.password !== undefined) {
    if (
      typeof body.username !== "string" ||
      !body.username.trim() ||
      body.username.length > 256 ||
      typeof body.password !== "string" ||
      !body.password ||
      body.password.length > 1024
    ) {
      return { error: "username and password must both be provided" };
    }
    device.username = body.username;
    device.password = body.password;
  }
  if (body.isActive !== undefined || !partial) {
    if (body.isActive !== undefined && typeof body.isActive !== "boolean") {
      return { error: "isActive must be a boolean" };
    }
    device.is_active = body.isActive ?? true;
  }

  return { value: device };
}

function parseMods(value, defaultMods = ["cdn"]) {
  if (value === undefined) return { value: defaultMods };
  if (typeof value !== "string") return { error: "mods must be a comma-separated string" };
  const mods = value.split(",").map((mod) => mod.trim()).filter(Boolean);
  if (mods.length === 0 || mods.some((mod) => !SUPPORTED_MOD_SET.has(mod))) {
    return { error: "mods contains an unsupported stream module" };
  }
  return { value: [...new Set(mods)] };
}

function publicDevice(device) {
  return {
    id: device.id,
    name: device.name,
    host: device.host,
    isActive: device.is_active,
    createdAt: device.created_at,
    updatedAt: device.updated_at,
  };
}

function handleRepositoryError(error, res, operation) {
  if (error.code === "23505") {
    return res.status(409).json({ error: "A TBS device with that id already exists" });
  }
  if (["23503", "23514"].includes(error.code)) {
    return res.status(400).json({ error: "Invalid related or constrained value" });
  }
  console.error(`${operation} failed:`, error);
  return res.status(500).json({ error: `${operation} failed` });
}

function createTbsRouter({
  manager,
  devices = deviceRepository,
  commands = commandRepository,
  channels = channelRepository,
  authenticate = authenticatedToken,
  requireSuperAdmin = requireRoles("SUPER_ADMIN"),
}) {
  const router = express.Router();
  router.use(authenticate);

  router.get("/", requireSuperAdmin, async (req, res) => {
    try {
      const rows = await devices.listDevices();
      return res.json({
        ok: true,
        devices: rows.map(publicDevice),
      });
    } catch (error) {
      return handleRepositoryError(error, res, "Loading TBS devices");
    }
  });

  router.post("/devices", requireSuperAdmin, async (req, res) => {
    const parsed = parseDevice(req.body);
    if (parsed.error) return res.status(400).json({ error: parsed.error });

    try {
      const device = await devices.createDevice(parsed.value);
      await manager.loadFromDatabase();
      return res.status(201).json(publicDevice(device));
    } catch (error) {
      return handleRepositoryError(error, res, "Creating TBS device");
    }
  });

  router.patch("/devices/:tbsId", requireSuperAdmin, async (req, res) => {
    const parsed = parseDevice(req.body, true);
    if (parsed.error) return res.status(400).json({ error: parsed.error });

    try {
      const device = await devices.updateDevice(req.params.tbsId, parsed.value);
      if (!device) return res.status(404).json({ error: "TBS device not found" });
      await manager.loadFromDatabase();
      return res.json(publicDevice(device));
    } catch (error) {
      return handleRepositoryError(error, res, "Updating TBS device");
    }
  });

  router.delete("/devices/:tbsId", requireSuperAdmin, async (req, res) => {
    try {
      const deleted = await devices.deleteDevice(req.params.tbsId);
      if (!deleted) return res.status(404).json({ error: "TBS device not found" });
      await manager.loadFromDatabase();
      return res.json({ ok: true });
    } catch (error) {
      return handleRepositoryError(error, res, "Deleting TBS device");
    }
  });

  router.get("/:tbsId/streams", async (req, res) => {
    const parsedMods = parseMods(req.query.mods);
    if (parsedMods.error) return res.status(400).json({ error: parsedMods.error });

    try {
      const data = await manager.getClient(req.params.tbsId).getStreams(parsedMods.value);
      let streams = data.streams;
      if (req.query.status !== undefined) {
        if (typeof req.query.status !== "string") {
          return res.status(400).json({ error: "status must be a string" });
        }
        const status = req.query.status.toLowerCase();
        streams = streams.filter((stream) => stream.status === status);
      }
      if (req.query.search !== undefined) {
        if (typeof req.query.search !== "string") {
          return res.status(400).json({ error: "search must be a string" });
        }
        const search = req.query.search.toLowerCase();
        streams = streams.filter(
          (stream) =>
            stream.name.toLowerCase().includes(search) ||
            stream.mid.toLowerCase().includes(search),
        );
      }
      return res.json({
        ok: true,
        tbsId: data.tbsId,
        tbsName: data.tbsName,
        fetchedAt: data.fetchedAt,
        count: streams.length,
        streams,
        ...(data.diagnostics ? { diagnostics: data.diagnostics } : {}),
      });
    } catch (error) {
      return res.status(error.statusCode || 502).json({ error: error.message });
    }
  });

  router.get("/:tbsId/streams/:mid", async (req, res) => {
    const parsedMods = parseMods(req.query.mod, SUPPORTED_MODS);
    if (parsedMods.error) return res.status(400).json({ error: parsedMods.error });

    try {
      const client = manager.getClient(req.params.tbsId);
      const stream = await client.getStream(req.params.mid, parsedMods.value);
      return res.json({ ok: true, tbsId: client.id, stream });
    } catch (error) {
      return res.status(error.statusCode || 502).json({ error: error.message });
    }
  });

  router.post("/:tbsId/streams/:mid/restart", async (req, res) => {
    const mod = req.body?.mod ?? req.query.mod ?? "cdn";
    if (typeof mod !== "string" || !SUPPORTED_MOD_SET.has(mod)) {
      return res.status(400).json({ error: "Unsupported TBS stream module" });
    }

    let device;
    try {
      device = await devices.getDevice(req.params.tbsId);
    } catch (error) {
      return handleRepositoryError(error, res, "Loading TBS device");
    }
    if (!device) return res.status(404).json({ error: "TBS device not found" });

    let channelId = null;
    let mappingLabel = null;
    if (req.body?.channelId !== undefined) {
      channelId = Number(req.body.channelId);
      if (!Number.isSafeInteger(channelId) || channelId < 1) {
        return res.status(400).json({ error: "channelId must be a positive integer" });
      }
      if (
        typeof req.body.mappingLabel !== "string" ||
        !req.body.mappingLabel.trim()
      ) {
        return res.status(400).json({ error: "mappingLabel is required with channelId" });
      }
      try {
        const mapping = await channels.getTbsMappingForChannel({
          channelId,
          deviceId: req.params.tbsId,
          mid: req.params.mid,
          mod,
          label: req.body.mappingLabel.trim(),
        });
        if (!mapping) {
          return res.status(400).json({
            error: "Channel is not mapped to the requested TBS stream",
          });
        }
        mappingLabel = mapping.label;
      } catch (error) {
        return handleRepositoryError(error, res, "Validating TBS channel mapping");
      }
    }

    let logEntry;
    try {
      logEntry = await commands.createCommandLog({
        tbsDeviceId: device.id,
        tbsDeviceName: device.name,
        channelId,
        mappingLabel,
        mid: req.params.mid,
        mod,
        requestedBy: req.user.id,
      });
    } catch (error) {
      return handleRepositoryError(error, res, "Recording TBS restart request");
    }

    let result;
    try {
      const client = manager.getClient(req.params.tbsId);
      result = await client.restartStream(req.params.mid, mod);
    } catch (error) {
      try {
        await commands.completeCommandLog(logEntry.id, {
          status: "failed",
          errorSummary: String(error.message || "TBS restart failed").slice(0, 1000),
        });
      } catch (logError) {
        console.error("Failed to record TBS restart failure:", logError);
        return res.status(500).json({
          error: "Restart outcome could not be recorded; inspect the device and command log",
        });
      }
      console.error("TBS stream restart failed:", error.message || "Unknown error");
      return res.status(error.statusCode || 502).json({ error: error.message });
    }

    if (!result.ok) {
      try {
        await commands.completeCommandLog(logEntry.id, {
          status: "failed",
          resultSummary: result.status ? `status=${result.status}` : "device returned an error status",
          errorSummary: "TBS device rejected the restart command",
        });
      } catch (error) {
        return handleRepositoryError(error, res, "Recording TBS restart outcome");
      }
      return res.status(502).json({ error: "TBS device rejected the restart command" });
    }

    try {
      await commands.completeCommandLog(logEntry.id, {
        status: "succeeded",
        resultSummary: result.status ? `status=${result.status}` : "Restart command accepted",
      });
      return res.json(result);
    } catch (error) {
      return handleRepositoryError(error, res, "Recording TBS restart outcome");
    }
  });

  return router;
}

module.exports = {
  createTbsRouter,
};
