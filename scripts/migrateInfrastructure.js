const fs = require("node:fs/promises");
const path = require("node:path");
const pool = require("../config/db");

async function migrateInfrastructure() {
  try {
    const migrationPath = path.join(
      __dirname,
      "..",
      "migrations",
      "20261112_infrastructure_monitoring.sql",
    );
    const migration = await fs.readFile(migrationPath, "utf8");
    await pool.query(migration);
    console.log("Infrastructure monitoring migration completed.");
  } catch (error) {
    console.error("Infrastructure monitoring migration failed:", error);
    process.exitCode = 1;
  } finally {
    await pool.end();
  }
}

migrateInfrastructure();
