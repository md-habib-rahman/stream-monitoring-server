const fs = require("node:fs/promises");
const path = require("node:path");
const pool = require("../config/db");

async function migrateUserRoles() {
  try {
    const migrationPath = path.join(
      __dirname,
      "..",
      "migrations",
      "20261110_user_roles.sql",
    );
    const migration = await fs.readFile(migrationPath, "utf8");
    await pool.query(migration);
    console.log("User roles migration completed.");
  } catch (error) {
    console.error("User roles migration failed:", error);
    process.exitCode = 1;
  } finally {
    await pool.end();
  }
}

migrateUserRoles();
