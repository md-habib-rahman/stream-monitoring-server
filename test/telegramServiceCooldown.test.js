const test = require("node:test");
const assert = require("node:assert/strict");
const axios = require("axios");
const { sendTelegram } = require("../alerts/telegramService");

test("sends each HLS Telegram alert without a cooldown", async () => {
  const originalToken = process.env.TELEGRAM_BOT_TOKEN;
  const originalChatId = process.env.TELEGRAM_CHAT_ID;
  const originalPost = axios.post;
  const calls = [];
  process.env.TELEGRAM_BOT_TOKEN = "test-token";
  process.env.TELEGRAM_CHAT_ID = "test-chat";
  axios.post = async (...args) => {
    calls.push(args);
    return { data: { ok: true } };
  };
  try {
    assert.equal(await sendTelegram("first status"), true);
    assert.equal(await sendTelegram("status immediately after"), true);
    assert.equal(calls.length, 2);
  } finally {
    axios.post = originalPost;
    if (originalToken === undefined) delete process.env.TELEGRAM_BOT_TOKEN;
    else process.env.TELEGRAM_BOT_TOKEN = originalToken;
    if (originalChatId === undefined) delete process.env.TELEGRAM_CHAT_ID;
    else process.env.TELEGRAM_CHAT_ID = originalChatId;
  }
});
