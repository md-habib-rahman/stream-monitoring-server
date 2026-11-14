function advanceState(currentState, result, thresholds, checkedAt = new Date()) {
  const state = currentState || {
    state: "UNKNOWN",
    consecutiveFailures: 0,
    consecutiveSuccesses: 0,
    stateChangedAt: null,
  };
  const failureThreshold = thresholds.failureThreshold;
  const successThreshold = thresholds.successThreshold;
  const previousState = state.state;
  let nextState = previousState;
  let consecutiveFailures = state.consecutiveFailures;
  let consecutiveSuccesses = state.consecutiveSuccesses;

  if (result.succeeded) {
    consecutiveSuccesses += 1;
    consecutiveFailures = 0;
    if (
      (previousState === "UNKNOWN" || previousState === "DOWN") &&
      consecutiveSuccesses >= successThreshold
    ) {
      nextState = "UP";
    }
  } else {
    consecutiveFailures += 1;
    consecutiveSuccesses = 0;
    if (
      (previousState === "UNKNOWN" || previousState === "UP") &&
      consecutiveFailures >= failureThreshold
    ) {
      nextState = "DOWN";
    }
  }

  const changed = nextState !== previousState;
  return {
    state: nextState,
    consecutiveFailures,
    consecutiveSuccesses,
    lastCheckedAt: checkedAt,
    stateChangedAt: changed ? checkedAt : state.stateChangedAt,
    latencyMs: result.latencyMs ?? null,
    lastError: result.succeeded
      ? nextState === "DOWN"
        ? state.lastError
        : null
      : result.error || "Check failed",
    transition: changed
      ? { previousState, currentState: nextState, changedAt: checkedAt }
      : null,
  };
}

module.exports = {
  advanceState,
};
