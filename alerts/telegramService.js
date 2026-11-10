require("dotenv").config();

const axios = require("axios");

// Telegram hard limit is 4096 characters; stay under it.
const MAX_LEN = 4000;

// Split on blank lines so a stream's block is never cut in half.
function splitMessage(text, max = MAX_LEN) {
  const chunks = [];
  let current = "";

  for (const block of text.split("\n\n")) {
    const safeBlock = block.length > max ? block.slice(0, max) : block;

    if (current && current.length + 2 + safeBlock.length > max) {
      chunks.push(current);
      current = safeBlock;
    } else {
      current = current ? `${current}\n\n${safeBlock}` : safeBlock;
    }
  }

  if (current) chunks.push(current);
  return chunks;
}

async function sendTelegram(text) {
  const token = process.env.TELEGRAM_BOT_TOKEN;
  const chatId = process.env.TELEGRAM_CHAT_ID;

  if (!token || !chatId) {
    console.error(
      "Telegram error: TELEGRAM_BOT_TOKEN or TELEGRAM_CHAT_ID missing",
    );
    return false;
  }

  let allSent = true;

  for (const chunk of splitMessage(text)) {
    try {
      await axios.post(
        `https://api.telegram.org/bot${token}/sendMessage`,
        {
          chat_id: chatId,
          text: chunk,
          parse_mode: "HTML",
          disable_web_page_preview: true,
        },
        { timeout: 10000 },
      );
    } catch (error) {
      allSent = false;

      const data = error.response?.data;
      const retryAfter = data?.parameters?.retry_after;

      // Log only the description, never the request URL (it contains the token).
      console.error(
        "Telegram error:",
        data?.description || error.message,
        retryAfter ? `(retry after ${retryAfter}s)` : "",
      );
    }
  }

  if (allSent) console.log("Telegram sent");
  return allSent;
}

module.exports = {
  sendTelegram,
  splitMessage,
};
