const pool = require("../config/db");
const {
  decryptCredentials,
  encryptCredentials,
} = require("../services/tbs/credentials");

const PUBLIC_COLUMNS = `
  id, name, host, is_active, created_at, updated_at
`;

async function listDevices() {
  const result = await pool.query(`
    SELECT ${PUBLIC_COLUMNS}
    FROM tbs_devices
    ORDER BY name, id
  `);
  return result.rows;
}

async function getDevice(id) {
  const result = await pool.query(
    `
    SELECT ${PUBLIC_COLUMNS}
    FROM tbs_devices
    WHERE id = $1
    `,
    [id],
  );
  return result.rows[0] || null;
}

async function listActiveDevicesWithCredentials() {
  const result = await pool.query(`
    SELECT id, name, host, credentials_ciphertext
    FROM tbs_devices
    WHERE is_active IS TRUE
    ORDER BY name, id
  `);

  return result.rows.map(({ credentials_ciphertext, ...device }) => ({
    ...device,
    ...decryptCredentials(credentials_ciphertext),
  }));
}

async function createDevice(device) {
  const credentialsCiphertext = encryptCredentials({
    username: device.username,
    password: device.password,
  });
  const result = await pool.query(
    `
    INSERT INTO tbs_devices
      (id, name, host, credentials_ciphertext, is_active)
    VALUES ($1, $2, $3, $4, $5)
    RETURNING ${PUBLIC_COLUMNS}
    `,
    [
      device.id,
      device.name,
      device.host,
      credentialsCiphertext,
      device.is_active,
    ],
  );
  return result.rows[0];
}

async function updateDevice(id, device) {
  const hasUsername = device.username !== undefined;
  const hasPassword = device.password !== undefined;
  if (hasUsername !== hasPassword) {
    throw new Error("TBS username and password must be updated together");
  }

  const result = await pool.query(
    `
    UPDATE tbs_devices
    SET name = COALESCE($1, name),
        host = COALESCE($2, host),
        credentials_ciphertext = COALESCE($3, credentials_ciphertext),
        is_active = COALESCE($4, is_active),
        updated_at = NOW()
    WHERE id = $5
    RETURNING ${PUBLIC_COLUMNS}
    `,
    [
      device.name ?? null,
      device.host ?? null,
      !hasUsername
        ? null
        : encryptCredentials({
            username: device.username,
            password: device.password,
          }),
      device.is_active ?? null,
      id,
    ],
  );
  return result.rows[0] || null;
}

async function deleteDevice(id) {
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    const device = await client.query(
      "SELECT id FROM tbs_devices WHERE id = $1 FOR UPDATE",
      [id],
    );
    if (device.rowCount === 0) {
      await client.query("ROLLBACK");
      return false;
    }

    await client.query(
      `
      DELETE FROM channel_tbs_mappings
      WHERE tbs_device_id = $1
      `,
      [id],
    );
    await client.query("DELETE FROM tbs_devices WHERE id = $1", [id]);
    await client.query("COMMIT");
    return true;
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  } finally {
    client.release();
  }
}

module.exports = {
  listDevices,
  getDevice,
  listActiveDevicesWithCredentials,
  createDevice,
  updateDevice,
  deleteDevice,
};
