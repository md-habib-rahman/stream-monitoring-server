const test = require("node:test");
const assert = require("node:assert/strict");
const { createTelegramCooldown } = require("../alerts/telegramCooldown");

test("cooldown is isolated per channel and expires after one minute", () => {
  const cooldown = createTelegramCooldown(60000);
  cooldown.markSent("channel:1", 1000);

  assert.equal(cooldown.isCoolingDown("channel:1", 60999), true);
  assert.equal(cooldown.isCoolingDown("channel:2", 60999), false);
  assert.equal(cooldown.isCoolingDown("channel:1", 61000), false);
});

test("tracks in-flight sends separately from sent-message cooldown", () => {
  const cooldown = createTelegramCooldown();
  cooldown.markSending("channel:1");

  assert.equal(cooldown.isSending("channel:1"), true);
  assert.equal(cooldown.isCoolingDown("channel:1"), false);
  cooldown.clearSending("channel:1");
  assert.equal(cooldown.isSending("channel:1"), false);
});
