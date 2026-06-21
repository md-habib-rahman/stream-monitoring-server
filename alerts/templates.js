function generateAlertEmail(stream, previousStatus, currentStatus) {
  const icon =
    currentStatus === "UP" ? "🟢" : currentStatus === "DOWN" ? "🔴" : "🟠";

  return `
        <div style="
            font-family: Arial;
            padding:20px;
        ">

            <h2>
                ${icon}
                HLS Stream Alert
            </h2>

            <table
                border="1"
                cellpadding="8"
                cellspacing="0"
            >

                <tr>
                    <td><b>Channel</b></td>
                    <td>${stream.name}</td>
                </tr>

                <tr>
                    <td><b>Previous</b></td>
                    <td>${previousStatus}</td>
                </tr>

                <tr>
                    <td><b>Current</b></td>
                    <td>${currentStatus}</td>
                </tr>

                <tr>
                    <td><b>Time</b></td>
                    <td>${new Date().toLocaleString()}</td>
                </tr>

            </table>

        </div>
    `;
}

module.exports = {
  generateAlertEmail,
};
