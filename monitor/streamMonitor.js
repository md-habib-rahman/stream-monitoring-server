// streamMonitor.js
const checkHLS = require("./hlsChecker");
const { getAllChannels } = require("../repositories/channelRepository");
const { sendEmail } = require("../alerts/emailService");
const { generateStatusSummary } = require("../alerts/statusSummaryEmail");

const state = require("./monitorState");
const handlers = require("./streamHandlers");

async function monitorStreams() {
  try {
    const streams = await getAllChannels();
    const results = [];
    const statusAlerts = [];

    for (const stream of streams) {
      const result = await checkHLS(stream.url);

      // 1. Process Freeze Status
      result.status = handlers.evaluateFreezeStatus(stream.id, result, state);

      // 2. Process Variant Changes
      await handlers.evaluateVariants(stream, result, state);

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
    }

    state.streamStatus = results;
  } catch (error) {
    console.error("[Monitor Error]", error.message);
  }
}

function getStatus() {
  return state.streamStatus;
}

module.exports = {
  monitorStreams,
  getStatus,
};
