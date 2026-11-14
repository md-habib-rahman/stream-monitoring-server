const pool = require("../config/db");
const { advanceState } = require("./stateEngine");

const TARGET_COLUMNS = `
  t.id, t.name, t.target_type, t.address, t.vendor, t.group_name,
  t.parent_target_id, t.enabled, t.created_at, t.updated_at
`;

async function listTargets() {
  const result = await pool.query(`
    SELECT
      ${TARGET_COLUMNS},
      COALESCE(
        json_agg(
          json_build_object(
            'id', i.id,
            'name', i.name,
            'check_type', i.check_type,
            'check_config', i.check_config,
            'interval_seconds', i.interval_seconds,
            'failure_threshold', i.failure_threshold,
            'success_threshold', i.success_threshold,
            'thresholds', i.thresholds,
            'enabled', i.enabled,
            'state', COALESCE(s.state, 'UNKNOWN'),
            'consecutive_failures', COALESCE(s.consecutive_failures, 0),
            'consecutive_successes', COALESCE(s.consecutive_successes, 0),
            'last_checked_at', s.last_checked_at,
            'state_changed_at', s.state_changed_at,
            'latency_ms', s.latency_ms,
            'last_error', s.last_error
          ) ORDER BY i.name
        ) FILTER (WHERE i.id IS NOT NULL),
        '[]'::json
      ) AS monitored_items
    FROM infra_targets t
    LEFT JOIN infra_monitored_items i ON i.target_id = t.id
    LEFT JOIN infra_current_state s ON s.item_id = i.id
    GROUP BY t.id
    ORDER BY t.name
  `);

  return result.rows;
}

async function getTargetDetails(id) {
  const targetResult = await pool.query(
    `
    SELECT ${TARGET_COLUMNS}
    FROM infra_targets t
    WHERE t.id = $1
    `,
    [id],
  );
  const target = targetResult.rows[0];
  if (!target) return null;

  const itemsResult = await pool.query(
    `
    SELECT
      i.id, i.target_id, i.name, i.check_type, i.check_config,
      i.interval_seconds, i.failure_threshold, i.success_threshold,
      i.thresholds, i.enabled, i.created_at, i.updated_at,
      COALESCE(s.state, 'UNKNOWN') AS state,
      COALESCE(s.consecutive_failures, 0) AS consecutive_failures,
      COALESCE(s.consecutive_successes, 0) AS consecutive_successes,
      s.last_checked_at, s.state_changed_at, s.latency_ms, s.last_error
    FROM infra_monitored_items i
    LEFT JOIN infra_current_state s ON s.item_id = i.id
    WHERE i.target_id = $1
    ORDER BY i.name
    `,
    [id],
  );
  const historyResult = await pool.query(
    `
    SELECT
      r.item_id,
      date_trunc('hour', r.checked_at) AS bucket_at,
      COUNT(*)::integer AS checks,
      COUNT(*) FILTER (WHERE r.succeeded)::integer AS successes,
      COUNT(*) FILTER (WHERE NOT r.succeeded)::integer AS failures,
      ROUND(AVG(r.latency_ms))::integer AS average_latency_ms
    FROM infra_check_results r
    JOIN infra_monitored_items i ON i.id = r.item_id
    WHERE i.target_id = $1
      AND r.checked_at >= NOW() - INTERVAL '24 hours'
    GROUP BY r.item_id, date_trunc('hour', r.checked_at)
    ORDER BY bucket_at DESC, r.item_id
    LIMIT 2000
    `,
    [id],
  );
  const recentResults = await pool.query(
    `
    SELECT r.id, r.item_id, r.checked_at, r.succeeded, r.latency_ms,
           r.observed_value, r.error
    FROM infra_check_results r
    JOIN infra_monitored_items i ON i.id = r.item_id
    WHERE i.target_id = $1
    ORDER BY r.checked_at DESC
    LIMIT 100
    `,
    [id],
  );

  return {
    ...target,
    monitored_items: itemsResult.rows,
    history: historyResult.rows,
    recent_results: recentResults.rows,
  };
}

async function createTarget(target, item) {
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    const result = await client.query(
      `
      INSERT INTO infra_targets
        (name, target_type, address, vendor, group_name, parent_target_id, enabled)
      VALUES ($1, $2, $3, $4, $5, $6, $7)
      RETURNING id, name, target_type, address, vendor, group_name,
                parent_target_id, enabled, created_at, updated_at
      `,
      [
        target.name,
        target.target_type,
        target.address,
        target.vendor,
        target.group_name,
        target.parent_target_id,
        target.enabled,
      ],
    );
    const createdTarget = result.rows[0];
    if (item) await insertItem(client, createdTarget.id, item);
    await client.query("COMMIT");
    return createdTarget;
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  } finally {
    client.release();
  }
}

async function updateTarget(id, target) {
  const result = await pool.query(
    `
    UPDATE infra_targets
    SET name = $1, target_type = $2, address = $3, vendor = $4,
        group_name = $5, parent_target_id = $6, enabled = $7,
        updated_at = NOW()
    WHERE id = $8
    RETURNING id, name, target_type, address, vendor, group_name,
              parent_target_id, enabled, created_at, updated_at
    `,
    [
      target.name,
      target.target_type,
      target.address,
      target.vendor,
      target.group_name,
      target.parent_target_id,
      target.enabled,
      id,
    ],
  );
  return result.rows[0] || null;
}

async function wouldCreateParentCycle(id, parentTargetId) {
  if (parentTargetId == null) return false;
  const result = await pool.query(
    `
    WITH RECURSIVE descendants(id) AS (
      SELECT id
      FROM infra_targets
      WHERE parent_target_id = $1
      UNION
      SELECT target.id
      FROM infra_targets target
      JOIN descendants child ON target.parent_target_id = child.id
    )
    SELECT EXISTS (
      SELECT 1 FROM descendants WHERE id = $2
    ) AS creates_cycle
    `,
    [id, parentTargetId],
  );
  return result.rows[0].creates_cycle;
}

async function deleteTarget(id) {
  const result = await pool.query(
    "DELETE FROM infra_targets WHERE id = $1 RETURNING id",
    [id],
  );
  return Boolean(result.rowCount);
}

async function insertItem(client, targetId, item) {
  const result = await client.query(
    `
    INSERT INTO infra_monitored_items
      (target_id, name, check_type, check_config, interval_seconds,
       failure_threshold, success_threshold, thresholds, enabled)
    VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
    RETURNING *
    `,
    [
      targetId,
      item.name,
      item.check_type,
      item.check_config,
      item.interval_seconds,
      item.failure_threshold,
      item.success_threshold,
      item.thresholds,
      item.enabled,
    ],
  );
  await client.query(
    "INSERT INTO infra_current_state (item_id) VALUES ($1)",
    [result.rows[0].id],
  );
  return result.rows[0];
}

async function createItem(targetId, item) {
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    const result = await insertItem(client, targetId, item);
    await client.query("COMMIT");
    return result;
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  } finally {
    client.release();
  }
}

async function updateItem(id, item) {
  const result = await pool.query(
    `
    UPDATE infra_monitored_items
    SET name = $1, check_type = $2, check_config = $3,
        interval_seconds = $4, failure_threshold = $5,
        success_threshold = $6, thresholds = $7, enabled = $8,
        updated_at = NOW()
    WHERE id = $9
    RETURNING *
    `,
    [
      item.name,
      item.check_type,
      item.check_config,
      item.interval_seconds,
      item.failure_threshold,
      item.success_threshold,
      item.thresholds,
      item.enabled,
      id,
    ],
  );
  return result.rows[0] || null;
}

async function deleteItem(id) {
  const result = await pool.query(
    "DELETE FROM infra_monitored_items WHERE id = $1 RETURNING id",
    [id],
  );
  return Boolean(result.rowCount);
}

async function getEnabledItems() {
  const result = await pool.query(`
    SELECT
      i.id, i.target_id, i.name, i.check_type, i.check_config,
      i.interval_seconds, i.failure_threshold, i.success_threshold,
      i.thresholds, s.last_checked_at,
      t.name AS target_name, t.address, t.enabled AS target_enabled
    FROM infra_monitored_items i
    JOIN infra_targets t ON t.id = i.target_id
    LEFT JOIN infra_current_state s ON s.item_id = i.id
    WHERE i.enabled IS TRUE AND t.enabled IS TRUE
    ORDER BY i.id
  `);
  return result.rows;
}

async function recordCheck(item, result, checkedAt = new Date()) {
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    await client.query(
      "INSERT INTO infra_current_state (item_id) VALUES ($1) ON CONFLICT (item_id) DO NOTHING",
      [item.id],
    );
    const currentResult = await client.query(
      "SELECT * FROM infra_current_state WHERE item_id = $1 FOR UPDATE",
      [item.id],
    );
    const row = currentResult.rows[0];
    const next = advanceState(
      {
        state: row.state,
        consecutiveFailures: row.consecutive_failures,
        consecutiveSuccesses: row.consecutive_successes,
        stateChangedAt: row.state_changed_at,
      },
      result,
      {
        failureThreshold: item.failure_threshold,
        successThreshold: item.success_threshold,
      },
      checkedAt,
    );

    await client.query(
      `
      INSERT INTO infra_check_results
        (item_id, checked_at, succeeded, latency_ms, observed_value, error)
      VALUES ($1, $2, $3, $4, $5, $6)
      `,
      [
        item.id,
        checkedAt,
        result.succeeded,
        result.latencyMs,
        result.observedValue || {},
        result.error || null,
      ],
    );
    await client.query(
      `
      UPDATE infra_current_state
      SET state = $1, consecutive_failures = $2,
          consecutive_successes = $3, last_checked_at = $4,
          state_changed_at = $5, latency_ms = $6, last_error = $7
      WHERE item_id = $8
      `,
      [
        next.state,
        next.consecutiveFailures,
        next.consecutiveSuccesses,
        next.lastCheckedAt,
        next.stateChangedAt,
        next.latencyMs,
        next.lastError,
        item.id,
      ],
    );
    await client.query("COMMIT");
    return next;
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  } finally {
    client.release();
  }
}

async function pruneCheckResults(retentionDays) {
  const result = await pool.query(
    `
    DELETE FROM infra_check_results
    WHERE checked_at < NOW() - ($1::integer * INTERVAL '1 day')
    `,
    [retentionDays],
  );
  return result.rowCount;
}

module.exports = {
  listTargets,
  getTargetDetails,
  createTarget,
  updateTarget,
  wouldCreateParentCycle,
  deleteTarget,
  createItem,
  updateItem,
  deleteItem,
  getEnabledItems,
  recordCheck,
  pruneCheckResults,
};
