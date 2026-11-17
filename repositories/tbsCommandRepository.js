const pool = require("../config/db");

async function createCommandLog({
  tbsDeviceId,
  tbsDeviceName,
  channelId,
  mappingLabel,
  mid,
  mod,
  requestedBy,
}) {
  const result = await pool.query(
    `
    INSERT INTO tbs_command_log
      (tbs_device_id, tbs_device_name, channel_id, mapping_label, tbs_mid, tbs_mod, command, requested_by)
    VALUES ($1, $2, $3, $4, $5, $6, 'kill', $7)
    RETURNING id
    `,
    [
      tbsDeviceId,
      tbsDeviceName,
      channelId ?? null,
      mappingLabel ?? null,
      mid,
      mod,
      requestedBy,
    ],
  );
  return result.rows[0];
}

async function completeCommandLog(id, { status, resultSummary, errorSummary }) {
  const result = await pool.query(
    `
    UPDATE tbs_command_log
    SET status = $1,
        result_summary = $2,
        error_summary = $3,
        completed_at = NOW()
    WHERE id = $4
    `,
    [status, resultSummary ?? null, errorSummary ?? null, id],
  );
  if (result.rowCount !== 1) {
    throw new Error(`TBS command log entry not found: ${id}`);
  }
}

module.exports = {
  createCommandLog,
  completeCommandLog,
};
