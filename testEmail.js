require("dotenv").config();

const { sendEmail } = require("./alerts/emailService");

(async () => {
  await sendEmail(
    "HLS Monitor Test",

    `
        <h2>HLS Monitor</h2>

        <p>
            Email service is working.
        </p>

        <p>
            Time:
            ${new Date().toLocaleString()}
        </p>
        `,
  );
})();
