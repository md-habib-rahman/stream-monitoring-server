// streamHandlers.js
const { createEvent } = require("../repositories/eventRepository");
const { sendEmail } = require("../alerts/emailService");
const {
  generateLowBitrateEmail,
  generateBitrateRestoredEmail,
} = require("../template/bitrateTemplates");

const DOWN_ALERT_COOLDOWN_MS = 5 * 60 * 1000; // 5 minutes

// 1. Freeze Logic
function evaluateFreezeStatus(streamId, result, state) {
  if (!state.streamStates[streamId]) {
    state.streamStates[streamId] = {
      lastSegment: result.lastSegment,
      freezeCount: 0,
    };
  }

  const streamState = state.streamStates[streamId];

  if (result.status === "UP") {
    if (result.lastSegment === streamState.lastSegment) {
      streamState.freezeCount++;
    } else {
      streamState.freezeCount = 0;
      streamState.lastSegment = result.lastSegment;
    }
    if (streamState.freezeCount >= 3) return "FROZEN";
  } else {
    streamState.freezeCount = 0;
  }
  return result.status;
}

// 2. Variant Logic
async function evaluateVariants(stream, result, state, variantChanges = []) {
  const currentVariants = result.variants?.map((v) => v.name) || [];

  const previousVariants = state.previousVariants[stream.id] || [];

  // Learn expected variants once
  if (!state.expectedVariants[stream.id]) {
    state.expectedVariants[stream.id] = [...currentVariants];

    console.log(
      `[EXPECTED VARIANTS] ${stream.name}`,
      state.expectedVariants[stream.id],
    );
  }

  const expectedVariants = state.expectedVariants[stream.id];
  const notify = result.status !== "DOWN";

  let isDegraded = false;

  console.log(
    stream.name,
    "EXPECTED:",
    expectedVariants,
    "PREVIOUS:",
    previousVariants,
    "CURRENT:",
    currentVariants,
  );

  // -------------------------
  // Degraded detection
  // -------------------------
  for (const variant of expectedVariants) {
    if (!currentVariants.includes(variant)) {
      isDegraded = true;
    }
  }

  // -------------------------
  // Variant DOWN events
  // -------------------------
  for (const variant of previousVariants) {
    if (!currentVariants.includes(variant)) {
      await createEvent({
        channel_id: stream.id,
        event_type: "VARIANT_STATUS_CHANGE",
        previous_status: "UP",
        current_status: "DOWN",
        message: `${stream.name} - ${variant}: UP → DOWN`,
      });
      if (notify)
        variantChanges.push({
          id: stream.id,
          name: stream.name,
          location: stream.location,
          variant,
          previous: "UP",
          current: "DOWN",
        });

      console.log(`[VARIANT DOWN] ${stream.name} - ${variant}`);
    }
  }

  // -------------------------
  // Variant UP events
  // -------------------------
  for (const variant of currentVariants) {
    if (!previousVariants.includes(variant) && previousVariants.length > 0) {
      await createEvent({
        channel_id: stream.id,
        event_type: "VARIANT_STATUS_CHANGE",
        previous_status: "DOWN",
        current_status: "UP",
        message: `${stream.name} - ${variant}: DOWN → UP`,
      });

      if (notify)
        variantChanges.push({
          id: stream.id,
          name: stream.name,
          location: stream.location,
          variant,
          previous: "DOWN",
          current: "UP",
        });

      console.log(`[VARIANT UP] ${stream.name} - ${variant}`);
    }
  }

  state.degradedChannels[stream.id] = isDegraded;

  state.previousVariants[stream.id] = [...currentVariants];
}

// 3. Status Alerts & Cooldowns
async function evaluateStatusChanges(
  stream,
  currentStatus,
  state,
  transitions = [],
) {
  const previousStatus = state.previousStatuses[stream.id];
  let alertToPush = null;

  if (previousStatus && previousStatus !== currentStatus) {
    const since = state.statusSince[stream.id];
    transitions.push({
      id: stream.id,
      name: stream.name,
      location: stream.location,
      previousStatus,
      currentStatus,
      previousDurationMs: since ? Date.now() - since : null,
    });
    await createEvent({
      channel_id: stream.id,
      event_type: "STATUS_CHANGE",
      previous_status: previousStatus,
      current_status: currentStatus,
      message: `${stream.name}: ${previousStatus} → ${currentStatus}`,
    });
  }

  // Went Down
  if (
    previousStatus === "UP" &&
    (currentStatus === "DOWN" ||
      currentStatus === "FROZEN" ||
      currentStatus === "DEGRADED")
  ) {
    state.downAlertCooldowns[stream.id] = {
      startedAt: Date.now(),
      sent: false,
      stream,
    };
  }

  // Recovered
  if (
    (previousStatus === "DOWN" ||
      previousStatus === "FROZEN" ||
      previousStatus === "DEGRADED") &&
    currentStatus === "UP"
  ) {
    const cooldown = state.downAlertCooldowns[stream.id];
    if (cooldown?.sent) {
      alertToPush = {
        name: stream.name,
        location: stream.location,
        previousStatus,
        currentStatus,
      };
    }
    delete state.downAlertCooldowns[stream.id];
  }

  state.previousStatuses[stream.id] = currentStatus;

  // Process Cooldown for DOWN alerts
  const cooldown = state.downAlertCooldowns[stream.id];
  if (
    cooldown &&
    !cooldown.sent &&
    (currentStatus === "DOWN" ||
      currentStatus === "FROZEN" ||
      currentStatus === "DEGRADED")
  ) {
    if (Date.now() - cooldown.startedAt >= DOWN_ALERT_COOLDOWN_MS) {
      console.log(`[DOWN ALERT] ${stream.name} has been down for 5 minutes`);

      alertToPush = {
        name: stream.name,
        location: stream.location,
        previousStatus: "UP",
        currentStatus,
      };
      cooldown.sent = true;
    }
  }

  return alertToPush;
}

// 4. Bitrate Logic
async function evaluateBitrate(stream, result, state) {
  //   console.log(state);
  //   console.log(
  //     `[BITRATE DEBUG] ${stream.name}`,
  //     "bitrate=",
  //     result.bitrate,
  //     "threshold=",
  //     stream?.min_bitrate,
  //     "status=",
  //     result.status,
  //     "alertState=",
  //     state.bitrateAlerts[stream.id],
  //   );

  if (result.status !== "UP" || result.bitrate === undefined) return;

  const threshold = stream.min_bitrate;
  const isLow = result.bitrate < threshold;

  console.log(
    `[BITRATE DEBUG] ${stream.name}`,
    "bitrate=",
    result.bitrate,
    typeof result.bitrate,
    "threshold=",
    threshold,
    typeof threshold,
  );

  if (isLow && !state.bitrateAlerts[stream.id]) {
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
      generateLowBitrateEmail(stream.name, result.bitrate, threshold),
    );
    state.bitrateAlerts[stream.id] = true;
  }

  if (isLow && !state.bitrateAlerts[stream.id]) {
    await createEvent({
      channel_id: stream.id,
      event_type: "BITRATE_LOW",
      previous_status: "OK",
      current_status: "LOW",
      bitrate,
      message: `Bitrate below threshold`,
    });

    state.bitrateCooldowns[stream.id] = {
      startedAt: Date.now(),
      sent: false,
      stream,
      bitrate,
      threshold,
    };

    state.bitrateAlerts[stream.id] = true;
  }

  const cooldown = state.bitrateCooldowns[stream.id];

  if (cooldown && !cooldown.sent && isLow) {
    const elapsed = Date.now() - cooldown.startedAt;

    if (elapsed >= DOWN_ALERT_COOLDOWN_MS) {
      console.log(`[LOW BITRATE ALERT] ${stream.name}`);

      await sendEmail(
        `[BITRATE ALERT] ${stream.name}`,
        generateLowBitrateEmail(stream.name, bitrate, threshold),
      );

      cooldown.sent = true;
    }
  }

  result.bitrateStatus = isLow ? "LOW" : "OK";
}

module.exports = {
  evaluateFreezeStatus,
  evaluateVariants,
  evaluateStatusChanges,
  evaluateBitrate,
};
