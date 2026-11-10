const fs = require("node:fs/promises");
const path = require("node:path");
const pool = require("../config/db");

async function migrateAlertEmailRecipients() {
  try {
    const migrationPath = path.join(
      __dirname,
      "..",
      "migrations",
      "20261110_alert_email_recipients.sql",
    );
    const migration = await fs.readFile(migrationPath, "utf8");
    await pool.query(migration);

    const recipients = [...new Set(
      (process.env.ALERT_EMAIL || "")
        .split(",")
        .map((email) => email.trim().toLowerCase())
        .filter(Boolean),
    )];

    for (const email of recipients) {
      await pool.query(
        `
        INSERT INTO alert_email_recipients (email)
        VALUES ($1)
        ON CONFLICT ((lower(email))) DO NOTHING
        `,
        [email],
      );
    }

    console.log(
      `Alert recipient migration completed; processed ${recipients.length} configured recipient(s).`,
    );
  } catch (error) {
    console.error("Alert recipient migration failed:", error);
    process.exitCode = 1;
  } finally {
    await pool.end();
  }
}

migrateAlertEmailRecipients();
