const express = require("express");
const authenticatedToken = require("../middleware/authMiddleware");
const requireRoles = require("../middleware/requireRoles");
const {
  getAlertRecipients,
  addAlertRecipient,
  deleteAlertRecipient,
} = require("../repositories/alertRecipientRepository");

const router = express.Router();
const emailPattern = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

router.use(authenticatedToken, requireRoles("SUPER_ADMIN"));

router.get("/", async (req, res) => {
  try {
    res.json(await getAlertRecipients());
  } catch (error) {
    console.error("Failed to load alert recipients:", error);
    res.status(500).json({ error: "Failed to load alert recipients" });
  }
});

router.post("/", async (req, res) => {
  const email =
    typeof req.body?.email === "string"
      ? req.body.email.trim().toLowerCase()
      : "";

  if (email.length > 254 || !emailPattern.test(email)) {
    return res.status(400).json({ error: "Enter a valid email address" });
  }

  try {
    const recipient = await addAlertRecipient(email);
    if (!recipient) {
      return res.status(409).json({ error: "Email address is already listed" });
    }
    return res.status(201).json(recipient);
  } catch (error) {
    console.error("Failed to add alert recipient:", error);
    return res.status(500).json({ error: "Failed to add alert recipient" });
  }
});

router.delete("/:id", async (req, res) => {
  const id = Number(req.params.id);
  if (!Number.isInteger(id) || id < 1) {
    return res.status(400).json({ error: "Invalid recipient ID" });
  }

  try {
    const deleted = await deleteAlertRecipient(id);
    if (!deleted) {
      return res.status(404).json({ error: "Alert recipient not found" });
    }
    return res.json({ success: true });
  } catch (error) {
    console.error("Failed to remove alert recipient:", error);
    return res.status(500).json({ error: "Failed to remove alert recipient" });
  }
});

module.exports = router;
