const pool = require("../config/db");

const CHANNEL_SELECT = `
  SELECT c.*,
    COALESCE((
      SELECT json_agg(
        json_build_object(
          'id', m.id,
          'label', m.label,
          'tbs_device_id', m.tbs_device_id,
          'tbs_device_name', d.name,
          'tbs_mid', m.tbs_mid,
          'tbs_mod', m.tbs_mod
        )
        ORDER BY m.label, m.id
      )
      FROM channel_tbs_mappings m
      JOIN tbs_devices d ON d.id = m.tbs_device_id
      WHERE m.channel_id = c.id
    ), '[]'::json) AS tbs_mappings
  FROM channels c
`;

async function getChannelByIdWithClient(client, id) {
  const result = await client.query(
    `${CHANNEL_SELECT} WHERE c.id = $1`,
    [id],
  );
  return result.rows[0];
}

async function insertTbsMappings(client, channelId, mappings = []) {
  for (const mapping of mappings) {
    await client.query(
      `
      INSERT INTO channel_tbs_mappings
        (channel_id, label, tbs_device_id, tbs_mid, tbs_mod)
      VALUES ($1, $2, $3, $4, $5)
      `,
      [
        channelId,
        mapping.label,
        mapping.tbs_device_id,
        mapping.tbs_mid,
        mapping.tbs_mod,
      ],
    );
  }
}

async function getAllChannels() {
  const result = await pool.query(`${CHANNEL_SELECT} ORDER BY c.name`);
  return result.rows;
}

async function getEnabledChannels() {
  const result = await pool.query(
    `${CHANNEL_SELECT} WHERE c.enabled IS TRUE ORDER BY c.name`,
  );
  return result.rows;
}

async function getChannelById(id) {
  return getChannelByIdWithClient(pool, id);
}

async function getTbsMappingForChannel({
  channelId,
  deviceId,
  mid,
  mod,
  label,
}) {
  const result = await pool.query(
    `
    SELECT id, channel_id, label, tbs_device_id, tbs_mid, tbs_mod
    FROM channel_tbs_mappings
    WHERE channel_id = $1
      AND tbs_device_id = $2
      AND tbs_mid = $3
      AND tbs_mod = $4
      AND label = $5
    `,
    [channelId, deviceId, mid, mod, label],
  );
  return result.rows[0] || null;
}

async function createChannel(channel) {
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    const result = await client.query(
      `
      INSERT INTO channels (
        name, url, broadcaster, location, min_bitrate, logo_url, enabled,
        priority, category, owner_team, notes, preview_url
      )
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12)
      RETURNING id
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
        channel.preview_url,
      ],
    );
    const channelId = result.rows[0].id;
    await insertTbsMappings(client, channelId, channel.tbs_mappings);
    const savedChannel = await getChannelByIdWithClient(client, channelId);
    await client.query("COMMIT");
    return savedChannel;
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  } finally {
    client.release();
  }
}

async function updateChannel(id, channel, mappingsProvided = false) {
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    const result = await client.query(
      `
      UPDATE channels
      SET name = $1,
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
          preview_url = $12,
          updated_at = NOW()
      WHERE id = $13
      RETURNING id
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
        id,
      ],
    );

    if (result.rowCount === 0) {
      await client.query("ROLLBACK");
      return null;
    }

    if (mappingsProvided) {
      await client.query(
        "DELETE FROM channel_tbs_mappings WHERE channel_id = $1",
        [id],
      );
      await insertTbsMappings(client, id, channel.tbs_mappings);
    }

    const savedChannel = await getChannelByIdWithClient(client, id);
    await client.query("COMMIT");
    return savedChannel;
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  } finally {
    client.release();
  }
}

async function setChannelEnabled(id, enabled) {
  const result = await pool.query(
    `
    UPDATE channels
    SET enabled = $1, updated_at = NOW()
    WHERE id = $2
    RETURNING *
    `,
    [enabled, id],
  );
  if (!result.rows[0]) return undefined;
  return getChannelById(result.rows[0].id);
}

async function deleteChannel(id) {
  await pool.query("DELETE FROM channels WHERE id = $1", [id]);
}

module.exports = {
  getAllChannels,
  getEnabledChannels,
  getChannelById,
  getTbsMappingForChannel,
  createChannel,
  updateChannel,
  setChannelEnabled,
  deleteChannel,
};
