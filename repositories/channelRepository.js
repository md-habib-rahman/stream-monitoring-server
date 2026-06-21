const pool = require("../config/db");

async function getAllChannels() {
  const result = await pool.query(`
    SELECT *
    FROM channels
    ORDER BY name
  `);

  return result.rows;
}

async function getChannelById(id) {
  const result = await pool.query(
    `
    SELECT *
    FROM channels
    WHERE id = $1
    `,
    [id],
  );

  return result.rows[0];
}

async function createChannel(channel) {
  const result = await pool.query(
    `
    INSERT INTO channels
(
  name,
  url,
  
  broadcaster,
  location,
  min_bitrate,
  logo_url,
  enabled,
  priority,
  category,
  owner_team,
  notes,
   preview_url
)
    VALUES
(
  $1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12
)
    RETURNING *
    `,
    [
      channel.name,
      channel.url,
      channel.broadcaster,
      channel.location,
      channel.min_bitrate,
      channel.logo_url,
      channel.enabled ?? true,
      channel.priority ?? "normal",
      channel.category,
      channel.owner_team,
      channel.notes,
      channel.preview_url
    ],
  );

  return result.rows[0];
}

async function updateChannel(id, channel) {
  const result = await pool.query(
    `UPDATE channels
    SET
  name = $1,
  url = $2,
  broadcaster = $3,
  location = $4,
  min_bitrate = $5,
  logo_url = $6,
  enabled = $7,
  priority = $8,
  category = $9,
  owner_team = $10,
  notes = $11,
  preview_url=$12,
  updated_at = NOW()
WHERE id = $13
    RETURNING *
    `,
    [
      channel.name,
      channel.url,
      channel.broadcaster,
      channel.location,
      channel.min_bitrate,
      channel.logo_url,
      channel.enabled,
      channel.priority,
      channel.category,
      channel.owner_team,
      channel.notes,
      channel.preview_url,
      id
    ],
  );

  return result.rows[0];
}

async function deleteChannel(id) {
  await pool.query(
    `
    DELETE FROM channels
    WHERE id = $1
    `,
    [id],
  );
}

module.exports = {
  getAllChannels,
  getChannelById,
  createChannel,
  updateChannel,
  deleteChannel,
};
