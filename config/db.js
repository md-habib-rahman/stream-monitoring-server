require("dotenv").config();
const { Pool } = require("pg");

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,

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
