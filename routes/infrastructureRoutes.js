const express = require("express");
const authenticatedToken = require("../middleware/authMiddleware");
const requireRoles = require("../middleware/requireRoles");
const repository = require("../infrastructure/repository");

const router = express.Router();
const TARGET_TYPES = new Set(["router", "switch", "server", "service", "other"]);
const CHECK_TYPES = new Set(["icmp", "tcp", "http", "dns", "tls"]);
const DNS_RECORD_TYPES = new Set(["A", "AAAA", "CNAME", "MX", "NS", "TXT"]);

router.use(authenticatedToken, requireRoles("SUPER_ADMIN"));

function isRecord(value) {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

function parseId(value) {
  const id = Number(value);
  return Number.isSafeInteger(id) && id > 0 ? id : null;
}

function parseTarget(body = {}, partial = false) {
  const target = {};
  const fields = ["name", "target_type", "address"];
  for (const field of fields) {
    if (partial && body[field] === undefined) continue;
    if (typeof body[field] !== "string" || !body[field].trim()) {
      return { error: `${field} is required` };
    }
    target[field] = body[field].trim();
  }

  if (
    target.name?.length > 160 ||
    target.address?.length > 253 ||
    (target.address && /\s/.test(target.address))
  ) {
    return { error: "Target name or address is invalid" };
  }
  if (target.target_type && !TARGET_TYPES.has(target.target_type)) {
    return { error: "Unsupported target type" };
  }

  const optionalLengths = { vendor: 100, group_name: 120 };
  for (const field of ["vendor", "group_name"]) {
    if (body[field] !== undefined) {
      if (body[field] !== null && typeof body[field] !== "string") {
        return { error: `${field} must be a string` };
      }
      target[field] = body[field]?.trim() || null;
      if (target[field]?.length > optionalLengths[field]) {
        return { error: `${field} is too long` };
      }
    } else if (!partial) {
      target[field] = null;
    }
  }

  if (body.parent_target_id !== undefined || !partial) {
    if (body.parent_target_id === null || body.parent_target_id === "") {
      target.parent_target_id = null;
    } else {
      target.parent_target_id = parseId(body.parent_target_id);
      if (!target.parent_target_id) {
        return { error: "parent_target_id must be a positive integer or null" };
      }
    }
  }

  if (body.enabled !== undefined || !partial) {
    if (body.enabled !== undefined && typeof body.enabled !== "boolean") {
      return { error: "enabled must be a boolean" };
    }
    target.enabled = body.enabled ?? true;
  }

  return { value: target };
}

function parseItem(body = {}) {
  if (typeof body.name !== "string" || !body.name.trim() || body.name.length > 160) {
    return { error: "Item name is required and must be at most 160 characters" };
  }
  if (!CHECK_TYPES.has(body.check_type)) {
    return { error: "Unsupported check_type" };
  }

  const intervalSeconds =
    body.interval_seconds ?? (body.check_type === "icmp" ? 30 : 60);
  const failureThreshold = body.failure_threshold ?? 3;
  const successThreshold = body.success_threshold ?? 2;
  const minimumInterval = body.check_type === "icmp" ? 20 : 10;
  const maximumInterval = body.check_type === "icmp" ? 30 : 86400;
  if (
    !Number.isInteger(intervalSeconds) ||
    intervalSeconds < minimumInterval ||
    intervalSeconds > maximumInterval
  ) {
    return {
      error:
        body.check_type === "icmp"
          ? "ICMP interval_seconds must be between 20 and 30"
          : "interval_seconds must be between 10 and 86400",
    };
  }
  if (!Number.isInteger(failureThreshold) || failureThreshold < 1 || failureThreshold > 20) {
    return { error: "failure_threshold must be between 1 and 20" };
  }
  if (!Number.isInteger(successThreshold) || successThreshold < 1 || successThreshold > 20) {
    return { error: "success_threshold must be between 1 and 20" };
  }

  const checkConfig = body.check_config ?? {};
  const thresholds = body.thresholds ?? {};
  if (!isRecord(checkConfig) || !isRecord(thresholds)) {
    return { error: "check_config and thresholds must be JSON objects" };
  }
  if (body.enabled !== undefined && typeof body.enabled !== "boolean") {
    return { error: "enabled must be a boolean" };
  }
  const port = checkConfig.port === undefined ? null : Number(checkConfig.port);
  if (["tcp", "tls"].includes(body.check_type) && (!Number.isInteger(port) || port < 1 || port > 65535)) {
    return { error: `${body.check_type} check requires a valid port` };
  }
  if (
    body.check_type === "dns" &&
    (!DNS_RECORD_TYPES.has(String(checkConfig.recordType || "A").toUpperCase()) ||
      (checkConfig.hostname !== undefined &&
        (typeof checkConfig.hostname !== "string" ||
          checkConfig.hostname.length > 253 ||
          /\s/.test(checkConfig.hostname))))
  ) {
    return { error: "DNS recordType or hostname is invalid" };
  }
  if (
    body.check_type === "http" &&
    checkConfig.protocol !== undefined &&
    !["http", "https"].includes(checkConfig.protocol)
  ) {
    return { error: "HTTP check protocol must be http or https" };
  }
  if (
    body.check_type === "http" &&
    checkConfig.expectedStatuses !== undefined &&
    (!Array.isArray(checkConfig.expectedStatuses) ||
      checkConfig.expectedStatuses.length === 0 ||
      checkConfig.expectedStatuses.some((status) => !Number.isInteger(status) || status < 100 || status > 599))
  ) {
    return { error: "expectedStatuses must contain HTTP status codes" };
  }
  if (checkConfig.url !== undefined) {
    if (typeof checkConfig.url !== "string" || checkConfig.url.length > 2048) {
      return { error: "HTTP check URL must be a URL string under 2048 characters" };
    }
    try {
      const url = new URL(checkConfig.url);
      if (!["http:", "https:"].includes(url.protocol) || url.username || url.password) {
        return { error: "HTTP check URL must use HTTP or HTTPS without credentials" };
      }
    } catch {
      return { error: "HTTP check URL must be a valid URL" };
    }
  }

  return {
    value: {
      name: body.name.trim(),
      check_type: body.check_type,
      check_config: checkConfig,
      interval_seconds: intervalSeconds,
      failure_threshold: failureThreshold,
      success_threshold: successThreshold,
      thresholds,
      enabled: body.enabled ?? true,
    },
  };
}

function handleRepositoryError(error, res, operation) {
  if (["23505", "23503", "23514"].includes(error.code)) {
    return res.status(error.code === "23505" ? 409 : 400).json({
      error: error.code === "23505" ? "A conflicting record already exists" : "Invalid related or constrained value",
    });
  }
  console.error(`${operation} failed:`, error);
  return res.status(500).json({ error: `${operation} failed` });
}

router.get("/targets", async (req, res) => {
  try {
    res.json(await repository.listTargets());
  } catch (error) {
    handleRepositoryError(error, res, "Loading infrastructure targets");
  }
});

router.get("/targets/:id", async (req, res) => {
  const id = parseId(req.params.id);
  if (!id) return res.status(400).json({ error: "Invalid target ID" });

  try {
    const target = await repository.getTargetDetails(id);
    if (!target) return res.status(404).json({ error: "Target not found" });
    return res.json(target);
  } catch (error) {
    return handleRepositoryError(error, res, "Loading infrastructure target");
  }
});

router.post(
  "/targets",
  requireRoles("ADMIN", "SUPER_ADMIN"),
  async (req, res) => {
    const body = req.body || {};
    const parsedTarget = parseTarget(body);
    if (parsedTarget.error) return res.status(400).json({ error: parsedTarget.error });
    const parsedItem = parseItem(body.item || {});
    if (parsedItem.error) return res.status(400).json({ error: parsedItem.error });

    try {
      const target = await repository.createTarget(parsedTarget.value, parsedItem.value);
      return res.status(201).json(target);
    } catch (error) {
      return handleRepositoryError(error, res, "Creating infrastructure target");
    }
  },
);

router.patch(
  "/targets/:id",
  requireRoles("ADMIN", "SUPER_ADMIN"),
  async (req, res) => {
    const id = parseId(req.params.id);
    if (!id) return res.status(400).json({ error: "Invalid target ID" });
    const parsed = parseTarget(req.body);
    if (parsed.error) return res.status(400).json({ error: parsed.error });
    if (parsed.value.parent_target_id === id) {
      return res.status(400).json({ error: "A target cannot be its own parent" });
    }

    try {
      if (
        await repository.wouldCreateParentCycle(
          id,
          parsed.value.parent_target_id,
        )
      ) {
        return res.status(400).json({ error: "Parent relationship would create a cycle" });
      }
      const target = await repository.updateTarget(id, parsed.value);
      if (!target) return res.status(404).json({ error: "Target not found" });
      return res.json(target);
    } catch (error) {
      return handleRepositoryError(error, res, "Updating infrastructure target");
    }
  },
);

router.delete(
  "/targets/:id",
  requireRoles("ADMIN", "SUPER_ADMIN"),
  async (req, res) => {
    const id = parseId(req.params.id);
    if (!id) return res.status(400).json({ error: "Invalid target ID" });
    try {
      const deleted = await repository.deleteTarget(id);
      if (!deleted) return res.status(404).json({ error: "Target not found" });
      return res.json({ success: true });
    } catch (error) {
      return handleRepositoryError(error, res, "Deleting infrastructure target");
    }
  },
);

router.post(
  "/targets/:id/items",
  requireRoles("ADMIN", "SUPER_ADMIN"),
  async (req, res) => {
    const targetId = parseId(req.params.id);
    if (!targetId) return res.status(400).json({ error: "Invalid target ID" });
    const parsed = parseItem(req.body);
    if (parsed.error) return res.status(400).json({ error: parsed.error });
    try {
      const item = await repository.createItem(targetId, parsed.value);
      return res.status(201).json(item);
    } catch (error) {
      return handleRepositoryError(error, res, "Creating monitored item");
    }
  },
);

router.patch(
  "/items/:id",
  requireRoles("ADMIN", "SUPER_ADMIN"),
  async (req, res) => {
    const id = parseId(req.params.id);
    if (!id) return res.status(400).json({ error: "Invalid item ID" });
    const parsed = parseItem(req.body);
    if (parsed.error) return res.status(400).json({ error: parsed.error });
    try {
      const item = await repository.updateItem(id, parsed.value);
      if (!item) return res.status(404).json({ error: "Monitored item not found" });
      return res.json(item);
    } catch (error) {
      return handleRepositoryError(error, res, "Updating monitored item");
    }
  },
);

router.delete(
  "/items/:id",
  requireRoles("ADMIN", "SUPER_ADMIN"),
  async (req, res) => {
    const id = parseId(req.params.id);
    if (!id) return res.status(400).json({ error: "Invalid item ID" });
    try {
      const deleted = await repository.deleteItem(id);
      if (!deleted) return res.status(404).json({ error: "Monitored item not found" });
      return res.json({ success: true });
    } catch (error) {
      return handleRepositoryError(error, res, "Deleting monitored item");
    }
  },
);

module.exports = router;
