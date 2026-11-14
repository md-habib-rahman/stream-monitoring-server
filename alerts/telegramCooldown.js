function createTelegramCooldown(durationMs = 60000) {
  const lastSentAt = new Map();
  const sending = new Set();

  function isCoolingDown(key, now = Date.now()) {
    const sentAt = lastSentAt.get(key);
    if (sentAt === undefined) return false;
    if (now - sentAt >= durationMs) {
      lastSentAt.delete(key);
      return false;
    }
    return true;
  }

  return {
    isCoolingDown,
    isSending: (key) => sending.has(key),
    markSending: (key) => sending.add(key),
    clearSending: (key) => sending.delete(key),
    markSent: (key, now = Date.now()) => lastSentAt.set(key, now),
  };
}

module.exports = {
  createTelegramCooldown,
};
