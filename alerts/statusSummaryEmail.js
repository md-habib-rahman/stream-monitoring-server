function generateStatusSummary(alerts) {
  const down = alerts.filter((a) => a.currentStatus === "DOWN");

  const frozen = alerts.filter((a) => a.currentStatus === "FROZEN");

  const recovered = alerts.filter((a) => a.currentStatus === "UP");

  return `
  <h1>
  HLS Monitoring Alert Summary
  </h1>

  ${
    down.length > 0
      ? `
      <h2>
      DOWN Channels (${down.length})
      </h2>

      <ul>
      ${down.map((c) => `<li>${c.name} (${c.location})</li>`).join("")}
      </ul>
      `
      : ""
  }

  ${
    frozen.length > 0
      ? `
      <h2>
      FROZEN Channels (${frozen.length})
      </h2>

      <ul>
      ${frozen.map((c) => `<li>${c.name} (${c.location})</li>`).join("")}
      </ul>
      `
      : ""
  }

  ${
    recovered.length > 0
      ? `
      <h2>
      RECOVERED Channels (${recovered.length})
      </h2>

      <ul>
      ${recovered.map((c) => `<li>${c.name} (${c.location})</li>`).join("")}
      </ul>
      `
      : ""
  }

  `;
}

module.exports = {
  generateStatusSummary,
};
