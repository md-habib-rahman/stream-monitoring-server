const { advanceState } = require("./stateEngine");

const thresholds = { failureThreshold: 3, successThreshold: 2 };
const outcomes = [
  false,
  false,
  false,
  true,
  true,
];
let state;

for (const succeeded of outcomes) {
  state = advanceState(state, { succeeded }, thresholds);
  console.log(
    `${succeeded ? "success" : "failure"} -> ${state.state}` +
      (state.transition
        ? ` (${state.transition.previousState} -> ${state.transition.currentState})`
        : ""),
  );
}
