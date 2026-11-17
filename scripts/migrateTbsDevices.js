const fs = require("node:fs/promises");
const path = require("node:path");
const pool = require("../config/db");

async function migrateTbsDevices() {
  try {
    const migrationDirectory = path.join(__dirname, "..", "migrations");
    for (const migrationName of [
      "20261116_tbs_devices_and_mapping.sql",
      "20261117_tbs_channel_mappings.sql",
    ]) {
      const migrationPath = path.join(migrationDirectory, migrationName);
      const migration = await fs.readFile(migrationPath, "utf8");
      await pool.query(migration);
      console.log(`${migrationName} completed.`);
    }
  } catch (error) {
    console.error("TBS devices and channel mapping migration failed:", error);
    process.exitCode = 1;
  } finally {
    await pool.end();
  }
}

migrateTbsDevices();
