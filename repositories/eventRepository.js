const pool = require("../config/db");

async function createEvent(event) {
  const result = await pool.query(
    `
    INSERT INTO channel_events
    (
      channel_id,
      event_type,
      previous_status,
      current_status,
      bitrate,
      message
    )
    VALUES
    (
      $1,$2,$3,$4,$5,$6
    )
    RETURNING *
    `,
    [
      event.channel_id,
      event.event_type,
      event.previous_status,
      event.current_status,
      event.bitrate,
      event.message,
    ],
  );

  return result.rows[0];
}

async function getEvents(limit = 200) {
  const result = await pool.query(
    `
    SELECT
      e.*,
      c.name AS channel_name
    FROM channel_events e
    JOIN channels c
      ON c.id = e.channel_id
    ORDER BY e.created_at DESC
    LIMIT $1
    `,
    [limit],
  );

  return result.rows;
}

module.exports = {
  createEvent,
  getEvents,
};
