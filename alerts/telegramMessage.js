const STATUS_ICONS = {
  DOWN: "🔴",
  FROZEN: "🟠",
  DEGRADED: "🟡",
  UP: "🟢",
};

// Most severe first, recoveries last, variant-only changes after that.
const STATUS_ORDER = ["DOWN", "FROZEN", "DEGRADED", "UP"];

function escapeHtml(value) {
  return String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
}

function formatDuration(ms) {
  if (ms == null) return null;

  const totalMin = Math.floor(ms / 60000);
  if (totalMin < 1) return "less than 1 min";

  const hours = Math.floor(totalMin / 60);
  const mins = totalMin % 60;

  return hours > 0 ? `${hours}h ${mins}m` : `${mins}m`;
}

/**
 * transitions:    [{ id, name, location, previousStatus, currentStatus, previousDurationMs }]
 * variantChanges: [{ id, name, location, variant, previous, current }]
 */
function buildTelegramMessage(transitions = [], variantChanges = []) {
  const entries = new Map();

  for (const t of transitions) {
    entries.set(t.id, { ...t, variants: [] });
  }

  // Variant changes are shown under their stream; if the stream's overall
  // status did not change this cycle, they get their own block.
  for (const v of variantChanges) {
    if (!entries.has(v.id)) {
      entries.set(v.id, {
        id: v.id,
        name: v.name,
        location: v.location,
        currentStatus: null,
        variants: [],
      });
    }
    entries.get(v.id).variants.push(v);
  }

  const rank = (e) => {
    if (!e.currentStatus) return 99;
    const i = STATUS_ORDER.indexOf(e.currentStatus);
    return i === -1 ? STATUS_ORDER.length : i;
  };

  const sorted = [...entries.values()].sort((a, b) => rank(a) - rank(b));

  const blocks = sorted.map((e) => {
    const lines = [];

    if (e.currentStatus) {
      const icon = STATUS_ICONS[e.currentStatus] || "⚪";
      lines.push(
        `${icon} <b>${escapeHtml(e.name)}</b>: ${escapeHtml(e.previousStatus)} → ${escapeHtml(e.currentStatus)}`,
      );
    } else {
      lines.push(`🔹 <b>${escapeHtml(e.name)}</b>: variant change`);
    }

    if (e.location) lines.push(`📍 ${escapeHtml(e.location)}`);

    if (e.currentStatus === "UP") {
      const duration = formatDuration(e.previousDurationMs);
      if (duration) {
        lines.push(`⏱ was ${escapeHtml(e.previousStatus)} for ${duration}`);
      }
    }

    for (const v of e.variants) {
      lines.push(
        `   ↳ ${escapeHtml(v.variant)}: ${escapeHtml(v.previous)} → ${escapeHtml(v.current)}`,
      );
    }

    return lines.join("\n");
  });

  const header = `<b>HLS Monitor</b> · ${new Date().toLocaleString()}`;

  return [header, ...blocks].join("\n\n");
}

module.exports = {
  buildTelegramMessage,
};
