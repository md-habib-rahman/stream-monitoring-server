async function mapWithConcurrency(items, concurrency, callback) {
  if (!Number.isInteger(concurrency) || concurrency < 1) {
    throw new Error("Concurrency must be a positive integer");
  }

  let nextIndex = 0;
  const failures = [];
  const workers = Array.from(
    { length: Math.min(concurrency, items.length) },
    async () => {
      while (nextIndex < items.length) {
        const index = nextIndex++;
        try {
          await callback(items[index]);
        } catch (error) {
          failures.push(error);
        }
      }
    },
  );
  await Promise.all(workers);
  if (failures.length > 0) {
    throw new AggregateError(failures, "One or more checks failed to run");
  }
}

module.exports = {
  mapWithConcurrency,
};
