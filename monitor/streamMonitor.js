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

const downAlertCooldowns = {};

const DOWN_ALERT_COOLDOWN_MS = 5 * 60 * 1000; // 5 minutes

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

      // Channel went DOWN
      if (
        previousStatus === "UP" &&
        (currentStatus === "DOWN" || currentStatus === "FROZEN")
      ) {
        downAlertCooldowns[stream.id] = {
          startedAt: Date.now(),
          sent: false,
          stream,
        };
      }

      // Channel recovered
      if (
        (previousStatus === "DOWN" || previousStatus === "FROZEN") &&
        currentStatus === "UP"
      ) {
        const cooldown = downAlertCooldowns[stream.id];

        // Send recovery only if DOWN alert was already sent
        if (cooldown?.sent) {
          statusAlerts.push({
            name: stream.name,
            location: stream.location,
            previousStatus,
            currentStatus,
          });
        }

        delete downAlertCooldowns[stream.id];
      }

      previousStatuses[stream.id] = currentStatus;
	  
      const cooldown = downAlertCooldowns[stream.id];

      if (
        cooldown &&
        !cooldown.sent &&
        (currentStatus === "DOWN" || currentStatus === "FROZEN")
      ) {
        const elapsed = Date.now() - cooldown.startedAt;

        if (elapsed >= DOWN_ALERT_COOLDOWN_MS) {
          console.log(
            `[DOWN ALERT] ${stream.name} has been down for 5 minutes`,
          );

          statusAlerts.push({
            name: stream.name,
            location: stream.location,
            previousStatus: "UP",
            currentStatus,
          });

          cooldown.sent = true;
        }
      }

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

          // 1. LOW BITRATE ALERT TEMPLATE
          await sendEmail(
            `[BITRATE ALERT] ${stream.name}`,
            `
    <div style="font-family: 'Inter', 'Helvetica Neue', Helvetica, Arial, sans-serif; background-color: #f1f5f9; padding: 40px 10px;">
      <div style="max-width: 600px; margin: 0 auto; background-color: #ffffff; border-radius: 8px; box-shadow: 0 4px 10px rgba(0,0,0,0.05); overflow: hidden;">
        
        <div style="background-color: #0f172a; padding: 24px; text-align: center; border-bottom: 4px solid #f59e0b;">
          <h1 style="color: #ffffff; margin: 0; font-size: 20px; font-weight: 600; letter-spacing: 0.5px;">
            ⚠️ Low Bitrate Detected
          </h1>
        </div>

        <div style="padding: 32px 40px;">
          <p style="color: #333333; font-size: 15px; margin-top: 0; margin-bottom: 24px; line-height: 1.5;">
            The streaming bitrate for <strong>${stream.name}</strong> has dropped below the acceptable threshold.
          </p>

          <table width="100%" cellpadding="14" cellspacing="0" style="border-collapse: collapse; font-size: 14px; background-color: #f8fafc; border-radius: 6px; overflow: hidden; border: 1px solid #e2e8f0;">
            <tr style="border-bottom: 1px solid #e2e8f0;">
              <td style="color: #64748b; font-weight: 600; width: 40%;">Channel</td>
              <td style="color: #0f172a; font-weight: bold;">${stream.name}</td>
            </tr>
            <tr style="border-bottom: 1px solid #e2e8f0;">
              <td style="color: #64748b; font-weight: 600;">Current Bitrate</td>
              <td style="color: #f59e0b; font-weight: bold; font-size: 15px;">${result.bitrate} Kbps</td>
            </tr>
            <tr>
              <td style="color: #64748b; font-weight: 600;">Threshold Limit</td>
              <td style="color: #64748b;">${threshold} Kbps</td>
            </tr>
          </table>
        </div>

        <div style="background-color: #f8fafc; padding: 16px; text-align: center; border-top: 1px solid #e2e8f0; color: #64748b; font-size: 12px;">
          Automated alert generated by Stream Monitoring Server
        </div>
        
      </div>
    </div>
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

          // 2. BITRATE RESTORED TEMPLATE
          await sendEmail(
            `[BITRATE RECOVERED] ${stream.name}`,
            `
    <div style="font-family: 'Inter', 'Helvetica Neue', Helvetica, Arial, sans-serif; background-color: #f1f5f9; padding: 40px 10px;">
      <div style="max-width: 600px; margin: 0 auto; background-color: #ffffff; border-radius: 8px; box-shadow: 0 4px 10px rgba(0,0,0,0.05); overflow: hidden;">
        
        <div style="background-color: #0f172a; padding: 24px; text-align: center; border-bottom: 4px solid #10b981;">
          <h1 style="color: #ffffff; margin: 0; font-size: 20px; font-weight: 600; letter-spacing: 0.5px;">
            ✅ Bitrate Restored
          </h1>
        </div>

        <div style="padding: 32px 40px;">
          <p style="color: #333333; font-size: 15px; margin-top: 0; margin-bottom: 24px; line-height: 1.5;">
            The streaming bitrate for <strong>${stream.name}</strong> has stabilized and returned to normal levels.
          </p>

          <table width="100%" cellpadding="14" cellspacing="0" style="border-collapse: collapse; font-size: 14px; background-color: #f8fafc; border-radius: 6px; overflow: hidden; border: 1px solid #e2e8f0;">
            <tr style="border-bottom: 1px solid #e2e8f0;">
              <td style="color: #64748b; font-weight: 600; width: 40%;">Channel</td>
              <td style="color: #0f172a; font-weight: bold;">${stream.name}</td>
            </tr>
            <tr>
              <td style="color: #64748b; font-weight: 600;">Current Bitrate</td>
              <td style="color: #10b981; font-weight: bold; font-size: 15px;">${result.bitrate} Kbps</td>
            </tr>
          </table>
        </div>

        <div style="background-color: #f8fafc; padding: 16px; text-align: center; border-top: 1px solid #e2e8f0; color: #64748b; font-size: 12px;">
          Automated alert generated by Stream Monitoring Server
        </div>
        
      </div>
    </div>
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
