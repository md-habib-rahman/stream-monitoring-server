const express = require("express");
const channelRepository = require("../repositories/channelRepository");
const authenticatedToken = require("../middleware/authMiddleware");
const requireRoles = require("../middleware/requireRoles");
const { SUPPORTED_MODS } = require("../services/tbs/dvbstatParser");

const SUPPORTED_TBS_MODS = new Set(SUPPORTED_MODS);

function hasTbsMappings(body) {
  return Object.prototype.hasOwnProperty.call(body || {}, "tbs_mappings");
}

function parseTbsMappings(value) {
  if (!Array.isArray(value)) {
    return { error: "tbs_mappings must be an array" };
  }
  const labels = new Set();
  const combinations = new Set();
  const mappings = [];

  for (const mapping of value) {
    if (!mapping || typeof mapping !== "object" || Array.isArray(mapping)) {
      return { error: "Each TBS mapping must be an object" };
    }
    const label = typeof mapping.label === "string" ? mapping.label.trim() : "";
    const deviceId = mapping.tbs_device_id;
    const mid =
      typeof mapping.tbs_mid === "string" ? mapping.tbs_mid.trim() : "";
    const mod = mapping.tbs_mod ?? "cdn";
    if (!label || label.length > 120) {
      return { error: "Each TBS mapping requires a label under 121 characters" };
    }
    if (
      typeof deviceId !== "string" ||
      !/^[a-zA-Z0-9][a-zA-Z0-9_-]{0,63}$/.test(deviceId) ||
      !mid ||
      mid.length > 128 ||
      /[\u0000-\u001f\u007f]/.test(mid) ||
      !SUPPORTED_TBS_MODS.has(mod)
    ) {
      return {
        error: "Each mapping requires a valid TBS device, stream mid, and module",
      };
    }

    const normalizedLabel = label.toLowerCase();
    const combination = `${deviceId}\0${mod}\0${mid}`;
    if (labels.has(normalizedLabel)) {
      return { error: "TBS mapping labels must be unique within a channel" };
    }
    if (combinations.has(combination)) {
      return { error: "A TBS stream cannot be mapped more than once to a channel" };
    }
    labels.add(normalizedLabel);
    combinations.add(combination);
    mappings.push({
      label,
      tbs_device_id: deviceId,
      tbs_mid: mid,
      tbs_mod: mod,
    });
  }
  return { value: mappings };
}

function createStreamRouter({
  repository = channelRepository,
  authenticate = authenticatedToken,
} = {}) {
  const router = express.Router();
  router.use(authenticate);

  router.post("/", requireRoles("ADMIN", "SUPER_ADMIN"), async (req, res) => {
    if (hasTbsMappings(req.body) && req.user.role !== "SUPER_ADMIN") {
      return res.status(403).json({
        error: "Only SUPER_ADMIN can configure TBS channel mappings",
      });
    }

    const mapping = parseTbsMappings(req.body?.tbs_mappings ?? []);
    if (mapping.error) return res.status(400).json({ error: mapping.error });

    try {
      const channel = await repository.createChannel({
        ...req.body,
        tbs_mappings: mapping.value,
      });
      return res.status(201).json(channel);
    } catch (error) {
      return res.status(error.code === "23503" ? 400 : 500).json({
        error:
          error.code === "23503"
            ? "TBS device does not exist"
            : error.message,
      });
    }
  });

  router.get("/", async (req, res) => {
    try {
      return res.status(200).json(await repository.getAllChannels());
    } catch (error) {
      return res.status(500).json({ error: error.message });
    }
  });

  router.put("/:id", requireRoles("ADMIN", "SUPER_ADMIN"), async (req, res) => {
    const mappingProvided = hasTbsMappings(req.body);
    if (mappingProvided && req.user.role !== "SUPER_ADMIN") {
      return res.status(403).json({
        error: "Only SUPER_ADMIN can configure TBS channel mappings",
      });
    }

    const mapping = mappingProvided
      ? parseTbsMappings(req.body.tbs_mappings)
      : { value: undefined };
    if (mapping.error) return res.status(400).json({ error: mapping.error });

    try {
      const channel = await repository.updateChannel(
        req.params.id,
        { ...req.body, tbs_mappings: mapping.value },
        mappingProvided,
      );
      if (!channel) return res.status(404).json({ error: "Channel not found" });
      return res.json(channel);
    } catch (error) {
      return res.status(error.code === "23503" ? 400 : 500).json({
        error:
          error.code === "23503"
            ? "TBS device does not exist"
            : error.message,
      });
    }
  });

  router.patch(
    "/:id/enabled",
    requireRoles("ADMIN", "SUPER_ADMIN"),
    async (req, res) => {
      if (typeof req.body?.enabled !== "boolean") {
        return res.status(400).json({ error: "enabled must be a boolean" });
      }

      try {
        const channel = await repository.setChannelEnabled(
          req.params.id,
          req.body.enabled,
        );
        if (!channel) return res.status(404).json({ error: "Channel not found" });
        return res.json(channel);
      } catch (error) {
        return res.status(500).json({ error: error.message });
      }
    },
  );

  router.delete(
    "/:id",
    requireRoles("ADMIN", "SUPER_ADMIN"),
    async (req, res) => {
      try {
        await repository.deleteChannel(req.params.id);
        return res.json({ success: true });
      } catch (error) {
        return res.status(500).json({ error: error.message });
      }
    },
  );

  return router;
}

const router = createStreamRouter();
router.createStreamRouter = createStreamRouter;

module.exports = router;
