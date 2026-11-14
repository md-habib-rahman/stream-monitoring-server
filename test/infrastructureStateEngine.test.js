const test = require("node:test");
const assert = require("node:assert/strict");
const { advanceState } = require("../infrastructure/stateEngine");

const thresholds = { failureThreshold: 3, successThreshold: 2 };

test("requires three consecutive failures before going down", () => {
  let state;
  for (let index = 0; index < 2; index += 1) {
    state = advanceState(state, { succeeded: false }, thresholds);
    assert.equal(state.state, "UNKNOWN");
    assert.equal(state.transition, null);
  }

  state = advanceState(state, { succeeded: false }, thresholds);
  assert.equal(state.state, "DOWN");
  assert.equal(state.transition.currentState, "DOWN");
});

test("requires two consecutive successes before returning up", () => {
  const downState = {
    state: "DOWN",
    consecutiveFailures: 3,
    consecutiveSuccesses: 0,
  };
  const firstSuccess = advanceState(
    downState,
    { succeeded: true },
    thresholds,
  );
  assert.equal(firstSuccess.state, "DOWN");
  assert.equal(firstSuccess.transition, null);

  const secondSuccess = advanceState(
    firstSuccess,
    { succeeded: true },
    thresholds,
  );
  assert.equal(secondSuccess.state, "UP");
  assert.equal(secondSuccess.transition.currentState, "UP");
});

test("resets the opposite streak when check results alternate", () => {
  const firstFailure = advanceState(
    undefined,
    { succeeded: false },
    thresholds,
  );
  const success = advanceState(firstFailure, { succeeded: true }, thresholds);

  assert.equal(success.consecutiveFailures, 0);
  assert.equal(success.consecutiveSuccesses, 1);
  assert.equal(success.state, "UNKNOWN");
});
