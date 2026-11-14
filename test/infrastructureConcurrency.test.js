const test = require("node:test");
const assert = require("node:assert/strict");
const { mapWithConcurrency } = require("../infrastructure/concurrency");

test("runs checks concurrently without exceeding the configured limit", async () => {
  let active = 0;
  let peak = 0;
  const completed = [];

  await mapWithConcurrency([1, 2, 3, 4, 5], 2, async (value) => {
    active += 1;
    peak = Math.max(peak, active);
    await new Promise((resolve) => setTimeout(resolve, 5));
    completed.push(value);
    active -= 1;
  });

  assert.equal(peak, 2);
  assert.deepEqual(completed.sort(), [1, 2, 3, 4, 5]);
});

test("finishes remaining checks before reporting a worker failure", async () => {
  const completed = [];

  await assert.rejects(
    mapWithConcurrency([1, 2, 3], 1, async (value) => {
      await new Promise((resolve) => setTimeout(resolve, 5));
      completed.push(value);
      if (value === 1) throw new Error("simulated failure");
    }),
    AggregateError,
  );

  assert.deepEqual(completed.sort(), [1, 2, 3]);
});
