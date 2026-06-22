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

async function getEvents(page = 1, limit = 50, filters = {}) {
  const offset = (page - 1) * limit;

  const conditions = [];
  const values = [];

  let idx = 1;

  if (filters.channelId) {
    conditions.push(`e.channel_id = $${idx++}`);
    values.push(filters.channelId);
  }

  if (filters.location) {
    conditions.push(`c.location = $${idx++}`);
    values.push(filters.location);
  }

  if (filters.broadcaster) {
    conditions.push(`c.broadcaster = $${idx++}`);
    values.push(filters.broadcaster);
  }

  if (filters.status) {
    conditions.push(`e.current_status = $${idx++}`);
    values.push(filters.status);
  }

  if (filters.from) {
    conditions.push(`e.created_at >= $${idx++}`);
    values.push(filters.from);
  }

  if (filters.to) {
    conditions.push(`e.created_at <= $${idx++}`);
    values.push(`${filters.to} 23:59:59`);
  }

  const whereClause =
    conditions.length > 0 ? `WHERE ${conditions.join(" AND ")}` : "";

  const query = `
    SELECT
      e.*,
      c.name AS channel_name,
      c.location,
      c.broadcaster
    FROM channel_events e
    JOIN channels c
      ON c.id = e.channel_id
    ${whereClause}
    ORDER BY e.created_at DESC
    LIMIT $${idx++}
    OFFSET $${idx++}
  `;

  const queryValues = [...values, limit, offset];

  const eventsResult = await pool.query(query, queryValues);

  const countQuery = `
    SELECT COUNT(*) AS total
    FROM channel_events e
    JOIN channels c
      ON c.id = e.channel_id
    ${whereClause}
  `;

  const countResult = await pool.query(countQuery, values);

  return {
    events: eventsResult.rows,
    total: Number(countResult.rows[0].total),
  };
}

module.exports = {
  createEvent,
  getEvents,
};
