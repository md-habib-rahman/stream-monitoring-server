// streamMonitor.js
const checkHLS = require("./hlsChecker");
const { getEnabledChannels } = require("../repositories/channelRepository");
const { sendEmail } = require("../alerts/emailService");
const { generateStatusSummary } = require("../alerts/statusSummaryEmail");
const { sendTelegram } = require("../alerts/telegramService");
const { buildTelegramMessage } = require("../alerts/telegramMessage");

const state = require("./monitorState");
const handlers = require("./streamHandlers");

async function monitorStreams() {
  try {
    const streams = await getEnabledChannels();
    const monitoredChannelIds = new Set(
      streams.map((stream) => String(stream.id)),
    );
    const channelStateKeys = [
      "streamStates",
      "previousStatuses",
      "bitrateAlerts",
      "previousVariants",
      "degradedChannels",
      "downAlertCooldowns",
      "expectedVariants",
      "bitrateCooldowns",
      "statusSince",
    ];

    for (const key of channelStateKeys) {
      for (const channelId of Object.keys(state[key])) {
        if (!monitoredChannelIds.has(channelId)) {
          delete state[key][channelId];
        }
      }
    }

    const results = [];
    const statusAlerts = [];
    const transitions = [];
    const variantChanges = [];

    for (const stream of streams) {
      const result = await checkHLS(stream.url);

      // 1. Process Freeze Status
      result.status = handlers.evaluateFreezeStatus(stream.id, result, state);

      // 2. Process Variant Changes
      await handlers.evaluateVariants(stream, result, state, variantChanges);

      // 3. Final Status Calculation
      let finalStatus = result.status;

      if (result.status === "UP" && state.degradedChannels[stream.id]) {
        finalStatus = "DEGRADED";
      }

      // 4. Process Status Changes & DOWN Cooldowns
      const alert = await handlers.evaluateStatusChanges(
        stream,
        finalStatus,
        state,
        transitions,
      );

      if (alert) {
        statusAlerts.push(alert);
      }

      // 5. Process Bitrate Drops/Recoveries
      await handlers.evaluateBitrate(stream, result, state);

      console.log(
        stream.name,
        "result.status=",
        result.status,
        "degraded=",
        state.degradedChannels[stream.id],
      );

      const currentFreezeCount =
        state.streamStates[stream.id]?.freezeCount || 0;

      // 6. Push to final array
      results.push({
        ...stream,
        ...result,
        status: finalStatus,
        freezeCount: currentFreezeCount,
      });

      console.log(
        `${stream.name} | ${finalStatus} | ${result.lastSegment || "N/A"} | freezeCount=${currentFreezeCount}`,
      );
    }

    if (statusAlerts.length > 0) {
      await sendEmail(
        `[HLS ALERT] ${statusAlerts.length} Channel Status Change(s)`,
        generateStatusSummary(statusAlerts),
      );
      await sendTelegram(buildTelegramMessage(statusAlerts));
    }

    state.streamStatus = results;
    if (transitions.length > 0 || variantChanges.length > 0) {
      try {
        sendTelegram(buildTelegramMessage(transitions, variantChanges)).catch(
          () => {},
        );
      } catch (err) {
        console.error("Telegram build error:", err.message);
      }
    }
  } catch (error) {
    console.error("[Monitor Error]", error.message);
  }
}

function getStatus() {
  return state.streamStatus.map(
    ({
      id,
      name,
      url,
      preview_url,
      logo_url,
      broadcaster,
      location,
      min_bitrate,
      status,
      bitrate,
      bitrateStatus,
      segmentCount,
      lastSegment,
      variants,
      checkedAt,
      freezeCount,
      error,
    }) => ({
      id,
      name,
      url,
      preview_url,
      logo_url,
      broadcaster,
      location,
      min_bitrate,
      status,
      bitrate,
      bitrateStatus,
      segmentCount,
      lastSegment,
      variants,
      checkedAt,
      freezeCount,
      error,
    }),
  );
}

module.exports = {
  monitorStreams,
  getStatus,
};
