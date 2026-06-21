function shouldSendAlert(previousStatus, currentStatus) {
  if (!previousStatus) return false;

  const transitions = ["UP->DOWN", "UP->FROZEN", "DOWN->UP", "FROZEN->UP"];

  return transitions.includes(`${previousStatus}->${currentStatus}`);
}

module.exports = {
  shouldSendAlert,
};
