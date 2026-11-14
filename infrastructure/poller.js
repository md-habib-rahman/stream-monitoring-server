require("dotenv").config();

const pool = require("../config/db");
const repository = require("./repository");
const { runCheck } = require("./checkRunner");
const { mapWithConcurrency } = require("./concurrency");

function readPositiveInteger(name, defaultValue, maximum = Number.MAX_SAFE_INTEGER) {
  const value = Number(process.env[name] || defaultValue);
  if (!Number.isInteger(value) || value < 1 || value > maximum) {
    throw new Error(`${name} must be an integer between 1 and ${maximum}`);
  }
  return value;
}

async function checkItem(item, timeoutMs) {
  const result = await runCheck(
    item,
    { address: item.address },
    timeoutMs,
  );
  const checkedAt = new Date();
  try {
    const updatedState = await repository.recordCheck(item, result, checkedAt);
    if (updatedState.transition) {
      console.log(
        `[Infrastructure state] ${item.target_name} / ${item.name}: ${updatedState.transition.previousState} -> ${updatedState.transition.currentState}`,
      );
    }
  } catch (error) {
    console.error(
      `[Infrastructure result save failed] ${item.target_name} / ${item.name}:`,
      error,
    );
  }
}

async function startPoller() {
  const pollIntervalMs = readPositiveInteger(
    "INFRA_POLL_INTERVAL_MS",
    1000,
    60000,
  );
  const concurrency = readPositiveInteger("INFRA_MAX_CONCURRENCY", 8, 100);
  const timeoutMs = readPositiveInteger("INFRA_CHECK_TIMEOUT_MS", 5000, 60000);
  const retentionDays = readPositiveInteger(
    "INFRA_CHECK_RESULT_RETENTION_DAYS",
    7,
    3650,
  );
  let stopping = false;
  let lastPruneAt = 0;
  const stop = () => {
    stopping = true;
  };
  process.once("SIGINT", stop);
  process.once("SIGTERM", stop);

  console.log(
    `[Infrastructure poller] started; concurrency=${concurrency}, timeout=${timeoutMs}ms`,
  );

  try {
    while (!stopping) {
      const cycleStartedAt = Date.now();
      try {
        const items = await repository.getEnabledItems();
        const now = Date.now();
        const dueItems = items.filter((item) => {
          if (!item.last_checked_at) return true;
          return (
            now - new Date(item.last_checked_at).getTime() >=
            item.interval_seconds * 1000
          );
        });

        await mapWithConcurrency(dueItems, concurrency, (item) =>
          checkItem(item, timeoutMs),
        );

        if (now - lastPruneAt >= 86400000) {
          const removed = await repository.pruneCheckResults(retentionDays);
          lastPruneAt = Date.now();
          console.log(
            `[Infrastructure retention] pruned ${removed} result(s), retention=${retentionDays} days`,
          );
        }
      } catch (error) {
        console.error("[Infrastructure poller cycle failed]:", error);
      }

      const elapsed = Date.now() - cycleStartedAt;
      if (!stopping && elapsed < pollIntervalMs) {
        await new Promise((resolve) =>
          setTimeout(resolve, pollIntervalMs - elapsed),
        );
      }
    }
  } finally {
    process.removeListener("SIGINT", stop);
    process.removeListener("SIGTERM", stop);
    await pool.end();
    console.log("[Infrastructure poller] stopped");
  }
}

if (require.main === module) {
  startPoller().catch((error) => {
    console.error("[Infrastructure poller] failed to start:", error);
    process.exitCode = 1;
  });
}

module.exports = {
  startPoller,
};
