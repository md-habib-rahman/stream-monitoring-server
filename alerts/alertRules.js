function shouldSendAlert(previousStatus, currentStatus) {
  if (!previousStatus) return false;

  const transitions = [
    "UP->DOWN",
    "UP->FROZEN",
    "UP->DEGRADED",
    "DOWN->UP",
    "FROZEN->UP",
    "DEGRADED->UP",
  ];

  return transitions.includes(`${previousStatus}->${currentStatus}`);
}

module.exports = {
  shouldSendAlert,
};
