const express = require("express");
const bcrypt = require("bcrypt");
const jwt = require("jsonwebtoken");

const pool = require("../config/db");
const authenticatedToken = require("../middleware/authMiddleware");

const router = express.Router();

router.post("/login", async (req, res) => {
  try {
    const { username, password } = req.body || {};
    if (typeof username !== "string" || typeof password !== "string") {
      return res.status(400).json({ error: "Username and password are required" });
    }

    const result = await pool.query(
      `
      SELECT *
      FROM users
      WHERE username = $1
      `,
      [username],
    );

    const user = result.rows[0];

    if (!user || user.enabled === false) {
      return res.status(401).json({
        error: "Invalid credentials",
      });
    }

    const valid = await bcrypt.compare(password || "", user.password_hash);

    if (!valid) {
      return res.status(401).json({
        error: "Invalid credentials",
      });
    }

    const role = String(user.role || "USER").toUpperCase();
    const token = jwt.sign(
      {
        id: user.id,
        username: user.username,
        role,
        tokenVersion: user.token_version || 0,
      },
      process.env.JWT_SECRET,
      {
        expiresIn: "24h",
      },
    );

    res.json({
      token,
      user: {
        id: user.id,
        username: user.username,
        role,
      },
    });
  } catch (err) {
    console.error("Login failed:", err);
    res.status(500).json({
      error: "Unable to sign in",
    });
  }
});

router.get("/me", authenticatedToken, (req, res) => {
  res.json({
    id: req.user.id,
    username: req.user.username,
    role: req.user.role,
  });
});

module.exports = router;
