require("dotenv").config();
const fs = require("node:fs");
const path = require("node:path");
const { Pool } = require("pg");

const caCert = process.env.CERTIFICATE_CA
  ? process.env.CERTIFICATE_CA.replace(/\\n/g, "\n")
  : fs.readFileSync(path.join(__dirname, "ca.pem"), "utf-8");

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: {
    rejectUnauthorized: true,
    ca: caCert,
  },
  connectionTimeoutMillis: 5000,
  idleTimeoutMillis: 10000,
  max: 10,
});

pool.on("error", (err, client) => {
  if (err.code === "ECONNRESET") {
    console.log(
      "⚠️ Network connection dropped (VPN toggle detected). Clearing dead DB clients.",
    );
  } else {
    console.error("Unexpected error on idle client", err);
  }
});

module.exports = pool;
