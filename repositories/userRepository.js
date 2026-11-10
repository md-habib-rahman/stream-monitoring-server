const pool = require("../config/db");

async function getAllUsers() {
  const result = await pool.query(`
    SELECT id, username, role, enabled, created_at
    FROM users
    ORDER BY username
  `);

  return result.rows;
}

async function createUser({ username, passwordHash, role }) {
  const result = await pool.query(
    `
    INSERT INTO users (username, password_hash, role, enabled)
    VALUES ($1, $2, $3, TRUE)
    RETURNING id, username, role, enabled, created_at
    `,
    [username, passwordHash, role],
  );

  return result.rows[0];
}

async function updateUserPassword(id, passwordHash) {
  const result = await pool.query(
    `
    UPDATE users
    SET password_hash = $1, token_version = COALESCE(token_version, 0) + 1
    WHERE id = $2
    RETURNING id
    `,
    [passwordHash, id],
  );

  return result.rowCount > 0;
}

async function withSuperAdminLock(operation) {
  const client = await pool.connect();

  try {
    await client.query("BEGIN");
    await client.query("SELECT pg_advisory_xact_lock(8402001)");
    const result = await operation(client);
    await client.query("COMMIT");
    return result;
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  } finally {
    client.release();
  }
}

async function ensureAnotherSuperAdmin(client, userId) {
  const result = await client.query(
    `
    SELECT COUNT(*)::integer AS count
    FROM users
    WHERE role = 'SUPER_ADMIN' AND enabled IS TRUE AND id <> $1
    `,
    [userId],
  );

  if (result.rows[0].count === 0) {
    const error = new Error("At least one SUPER ADMIN account must remain active");
    error.status = 409;
    throw error;
  }
}

async function updateUserRole(id, role) {
  return withSuperAdminLock(async (client) => {
    const current = await client.query(
      "SELECT id, role FROM users WHERE id = $1",
      [id],
    );
    if (!current.rows[0]) return null;

    if (current.rows[0].role === "SUPER_ADMIN" && role !== "SUPER_ADMIN") {
      await ensureAnotherSuperAdmin(client, id);
    }

    const result = await client.query(
      `
      UPDATE users
      SET role = $1
      WHERE id = $2
      RETURNING id, username, role, enabled, created_at
      `,
      [role, id],
    );

    return result.rows[0];
  });
}

async function updateUserEnabled(id, enabled) {
  return withSuperAdminLock(async (client) => {
    const current = await client.query(
      "SELECT id, role, enabled FROM users WHERE id = $1",
      [id],
    );
    if (!current.rows[0]) return null;

    if (
      current.rows[0].role === "SUPER_ADMIN" &&
      current.rows[0].enabled !== false &&
      !enabled
    ) {
      await ensureAnotherSuperAdmin(client, id);
    }

    const result = await client.query(
      `
      UPDATE users
      SET enabled = $1
      WHERE id = $2
      RETURNING id, username, role, enabled, created_at
      `,
      [enabled, id],
    );

    return result.rows[0];
  });
}

async function deleteUser(id) {
  return withSuperAdminLock(async (client) => {
    const current = await client.query(
      "SELECT id, role FROM users WHERE id = $1",
      [id],
    );
    if (!current.rows[0]) return false;

    if (current.rows[0].role === "SUPER_ADMIN") {
      await ensureAnotherSuperAdmin(client, id);
    }

    await client.query("DELETE FROM users WHERE id = $1", [id]);
    return true;
  });
}

module.exports = {
  getAllUsers,
  createUser,
  updateUserPassword,
  updateUserRole,
  updateUserEnabled,
  deleteUser,
};
