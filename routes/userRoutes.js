const express = require("express");
const bcrypt = require("bcrypt");

const {
  getAllUsers,
  createUser,
  updateUserPassword,
  updateUserRole,
  updateUserEnabled,
  deleteUser,
} = require("../repositories/userRepository");
const authenticatedToken = require("../middleware/authMiddleware");
const requireRoles = require("../middleware/requireRoles");

const router = express.Router();
const validRoles = new Set(["SUPER_ADMIN", "ADMIN", "USER"]);
const minimumPasswordLength = 8;

router.use(authenticatedToken, requireRoles("SUPER_ADMIN"));

function parseUserId(value) {
  const id = Number(value);
  return Number.isInteger(id) && id > 0 ? id : null;
}

function handleError(res, error) {
  if (error.code === "23505") {
    return res.status(409).json({ error: "Username already exists" });
  }

  if (error.status) {
    return res.status(error.status).json({ error: error.message });
  }

  console.error("User management failed:", error);
  return res.status(500).json({ error: "User management request failed" });
}

router.get("/", async (req, res) => {
  try {
    res.json(await getAllUsers());
  } catch (error) {
    handleError(res, error);
  }
});

router.post("/", async (req, res) => {
  const username = req.body?.username?.trim();
  const { password, role = "USER" } = req.body || {};

  if (!username || username.length > 100) {
    return res.status(400).json({
      error: "Username is required and must be at most 100 characters",
    });
  }
  if (
    typeof password !== "string" ||
    password.length < minimumPasswordLength ||
    Buffer.byteLength(password, "utf8") > 72
  ) {
    return res.status(400).json({
      error: "Password must be at least 8 characters and no more than 72 bytes",
    });
  }
  if (!validRoles.has(role)) {
    return res.status(400).json({ error: "Invalid user role" });
  }

  try {
    const passwordHash = await bcrypt.hash(password, 10);
    const user = await createUser({ username, passwordHash, role });
    res.status(201).json(user);
  } catch (error) {
    handleError(res, error);
  }
});

router.patch("/:id/role", async (req, res) => {
  const id = parseUserId(req.params.id);
  const { role } = req.body || {};
  if (!id) return res.status(400).json({ error: "Invalid user ID" });
  if (!validRoles.has(role)) {
    return res.status(400).json({ error: "Invalid user role" });
  }

  try {
    const user = await updateUserRole(id, role);
    if (!user) return res.status(404).json({ error: "User not found" });
    res.json(user);
  } catch (error) {
    handleError(res, error);
  }
});

router.patch("/:id/password", async (req, res) => {
  const id = parseUserId(req.params.id);
  const { password } = req.body || {};
  if (!id) return res.status(400).json({ error: "Invalid user ID" });
  if (
    typeof password !== "string" ||
    password.length < minimumPasswordLength ||
    Buffer.byteLength(password, "utf8") > 72
  ) {
    return res.status(400).json({
      error: "Password must be at least 8 characters and no more than 72 bytes",
    });
  }

  try {
    const passwordHash = await bcrypt.hash(password, 10);
    const updated = await updateUserPassword(id, passwordHash);
    if (!updated) return res.status(404).json({ error: "User not found" });
    res.json({ success: true });
  } catch (error) {
    handleError(res, error);
  }
});

router.patch("/:id/enabled", async (req, res) => {
  const id = parseUserId(req.params.id);
  const { enabled } = req.body || {};
  if (!id) return res.status(400).json({ error: "Invalid user ID" });
  if (typeof enabled !== "boolean") {
    return res.status(400).json({ error: "enabled must be a boolean" });
  }
  if (Number(req.user.id) === id && !enabled) {
    return res.status(400).json({ error: "You cannot disable your own account" });
  }

  try {
    const user = await updateUserEnabled(id, enabled);
    if (!user) return res.status(404).json({ error: "User not found" });
    res.json(user);
  } catch (error) {
    handleError(res, error);
  }
});

router.delete("/:id", async (req, res) => {
  const id = parseUserId(req.params.id);
  if (!id) return res.status(400).json({ error: "Invalid user ID" });
  if (Number(req.user.id) === id) {
    return res.status(400).json({ error: "You cannot delete your own account" });
  }

  try {
    const deleted = await deleteUser(id);
    if (!deleted) return res.status(404).json({ error: "User not found" });
    res.json({ success: true });
  } catch (error) {
    handleError(res, error);
  }
});

module.exports = router;
