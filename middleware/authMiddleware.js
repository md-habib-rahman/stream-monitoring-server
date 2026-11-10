const jwt = require("jsonwebtoken");
const pool = require("../config/db");

async function authenticateToken(req, res, next) {
  const authHeader = req.headers.authorization;

  if (!authHeader) {
    return res.status(401).json({
      message: "No token provided",
    });
  }

  const token = authHeader.split(" ")[1];

  if (!token) {
    return res.status(401).json({
      message: "Invalid token format",
    });
  }

  try {
    const decoded = jwt.verify(
      token,
      process.env.JWT_SECRET,
    );

    const result = await pool.query(
      `
      SELECT id, username, role, enabled, token_version
      FROM users
      WHERE id = $1
      `,
      [decoded.id],
    );
    const user = result.rows[0];

    if (!user || user.enabled === false) {
      return res.status(401).json({
        message: "Account is unavailable",
      });
    }
    if ((decoded.tokenVersion || 0) !== (user.token_version || 0)) {
      return res.status(401).json({
        message: "Session has been invalidated",
      });
    }

    req.user = {
      id: user.id,
      username: user.username,
      role: String(user.role || "USER").toUpperCase(),
    };

    next();
  } catch (err) {
    if (err.name !== "JsonWebTokenError" && err.name !== "TokenExpiredError") {
      console.error("Authentication lookup failed:", err);
      return res.status(500).json({
        message: "Authentication failed",
      });
    }

    return res.status(401).json({
      message: "Invalid or expired token",
    });
  }
}

module.exports = authenticateToken;