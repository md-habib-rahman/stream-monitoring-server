const checkHLS = require("./hlsChecker");

const { getAllChannels } = require("../repositories/channelRepository");

const { sendEmail } = require("../alerts/emailService");

const { shouldSendAlert } = require("../alerts/alertRules");

const { generateAlertEmail } = require("../alerts/templates");

const { generateStatusSummary } = require("../alerts/statusSummaryEmail");

const { createEvent } = require("../repositories/eventRepository");

let streamStatus = [];

// Store runtime state for each stream
const streamStates = {};

const previousStatuses = {};

const bitrateAlerts = {};

async function monitorStreams() {
  try {
    const streams = await getAllChannels();

    const results = [];
    const statusAlerts = [];

    for (const stream of streams) {
      const result = await checkHLS(stream.url);

      // Initialize state for new stream
      if (!streamStates[stream.id]) {
        streamStates[stream.id] = {
          lastSegment: result.lastSegment,
          freezeCount: 0,
        };
      }

      const state = streamStates[stream.id];

      if (result.status === "UP") {
        // Compare current segment with previous
        if (result.lastSegment === state.lastSegment) {
          state.freezeCount++;
        } else {
          state.freezeCount = 0;
          state.lastSegment = result.lastSegment;
        }

        // Mark as frozen after 3 consecutive checks
        if (state.freezeCount >= 3) {
          result.status = "FROZEN";
        }
      } else {
        // Stream is DOWN
        state.freezeCount = 0;
      }

      const currentStatus = result.status;

      const previousStatus = previousStatuses[stream.id];

      if (previousStatus && previousStatus !== currentStatus) {
        await createEvent({
          channel_id: stream.id,

          event_type: "STATUS_CHANGE",

          previous_status: previousStatus,

          current_status: currentStatus,

          bitrate: result.bitrate || null,

          message: `${stream.name}: ${previousStatus} → ${currentStatus}`,
        });
      }

      if (shouldSendAlert(previousStatus, currentStatus)) {
        console.log(
          `[ALERT] ${stream.name}: ${previousStatus} -> ${currentStatus}`,
        );

        statusAlerts.push({
          name: stream.name,
          location: stream.location,
          previousStatus,
          currentStatus,
        });
      }

      previousStatuses[stream.id] = currentStatus;

      if (result.status === "UP" && result.bitrate !== undefined) {
        const threshold = stream.minBitrate;

        const isLow = result.bitrate < threshold;

        if (isLow && !bitrateAlerts[stream.id]) {
          await createEvent({
            channel_id: stream.id,

            event_type: "BITRATE_LOW",

            previous_status: "OK",

            current_status: "LOW",

            bitrate: result.bitrate,

            message: `Bitrate below threshold`,
          });

          await sendEmail(
            `[BITRATE ALERT] ${stream.name}`,

            `
            <h2>
            Low Bitrate Detected
            </h2>

            <p>
            Channel:
            ${stream.name}
            </p>

            <p>
            Current:
            ${result.bitrate}
            Kbps
            </p>

            <p>
            Threshold:
            ${threshold}
            Kbps
            </p>
            `,
          );

          bitrateAlerts[stream.id] = true;
        }

        if (!isLow && bitrateAlerts[stream.id]) {
          await createEvent({
            channel_id: stream.id,

            event_type: "BITRATE_RECOVERED",

            previous_status: "LOW",

            current_status: "OK",

            bitrate: result.bitrate,

            message: `Bitrate restored`,
          });

          await sendEmail(
            `[BITRATE RECOVERED] ${stream.name}`,

            `
            <h2>
            Bitrate Restored
            </h2>

            <p>
            Channel:
            ${stream.name}
            </p>

            <p>
            Current:
            ${result.bitrate}
            Kbps
            </p>
            `,
          );

          bitrateAlerts[stream.id] = false;
        }

        result.bitrateStatus = isLow ? "LOW" : "OK";
      }

      results.push({
        ...stream,
        ...result,
        freezeCount: state.freezeCount,
      });

      console.log(
        `${stream.name} | ${result.status} | ${result.lastSegment || "N/A"} | freezeCount=${state.freezeCount}`,
      );
    }

    if (statusAlerts.length > 0) {
      await sendEmail(
        `[HLS ALERT] ${statusAlerts.length} Channel Status Change(s)`,
        generateStatusSummary(statusAlerts),
      );
    }

    streamStatus = results;
  } catch (error) {
    console.error("[Monitor Error]", error.message);
  }
}

function getStatus() {
  return streamStatus;
}

module.exports = {
  monitorStreams,
  getStatus,
};
