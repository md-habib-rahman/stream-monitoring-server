// template/bitrateTemplates.js

function generateLowBitrateEmail(streamName, currentBitrate, threshold) {
  return `
    <div style="font-family: 'Inter', sans-serif; background-color: #f1f5f9; padding: 40px 10px;">
      <div style="max-width: 600px; margin: 0 auto; background-color: #ffffff; border-radius: 8px; overflow: hidden;">
        <div style="background-color: #0f172a; padding: 24px; text-align: center; border-bottom: 4px solid #f59e0b;">
          <h1 style="color: #ffffff; margin: 0; font-size: 20px;">⚠️ Low Bitrate Detected</h1>
        </div>
        <div style="padding: 32px 40px;">
          <p>The streaming bitrate for <strong>${streamName}</strong> has dropped below the threshold.</p>
          <ul>
            <li>Current Bitrate: <strong style="color:#f59e0b">${currentBitrate} Kbps</strong></li>
            <li>Threshold: ${threshold} Kbps</li>
          </ul>
        </div>
      </div>
    </div>
  `;
}

function generateBitrateRestoredEmail(streamName, currentBitrate) {
  return `
    <div style="font-family: 'Inter', sans-serif; background-color: #f1f5f9; padding: 40px 10px;">
      <div style="max-width: 600px; margin: 0 auto; background-color: #ffffff; border-radius: 8px; overflow: hidden;">
        <div style="background-color: #0f172a; padding: 24px; text-align: center; border-bottom: 4px solid #10b981;">
          <h1 style="color: #ffffff; margin: 0; font-size: 20px;">✅ Bitrate Restored</h1>
        </div>
        <div style="padding: 32px 40px;">
          <p>The streaming bitrate for <strong>${streamName}</strong> has stabilized.</p>
          <p>Current Bitrate: <strong style="color:#10b981">${currentBitrate} Kbps</strong></p>
        </div>
      </div>
    </div>
  `;
}

module.exports = {
  generateLowBitrateEmail,
  generateBitrateRestoredEmail,
};
