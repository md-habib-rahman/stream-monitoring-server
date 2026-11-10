const pool = require("../config/db");

async function getAlertRecipients() {
  const result = await pool.query(`
    SELECT id, email, created_at
    FROM alert_email_recipients
    ORDER BY email
  `);

  return result.rows;
}

async function addAlertRecipient(email) {
  const result = await pool.query(
    `
    INSERT INTO alert_email_recipients (email)
    VALUES ($1)
    ON CONFLICT ((lower(email))) DO NOTHING
    RETURNING id, email, created_at
    `,
    [email],
  );

  return result.rows[0] || null;
}

async function deleteAlertRecipient(id) {
  const result = await pool.query(
    `
    DELETE FROM alert_email_recipients
    WHERE id = $1
    RETURNING id
    `,
    [id],
  );

  return result.rowCount > 0;
}

module.exports = {
  getAlertRecipients,
  addAlertRecipient,
  deleteAlertRecipient,
};
