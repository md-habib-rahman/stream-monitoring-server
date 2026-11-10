require("dotenv").config();

const nodemailer = require("nodemailer");
const { getAlertRecipients } = require("../repositories/alertRecipientRepository");

const transporter = nodemailer.createTransport({
  service: "gmail",

  auth: {
    user: process.env.EMAIL_USER,
    pass: process.env.EMAIL_PASS,
  },
});

async function sendEmail(subject, html) {
  try {
    const recipients = (await getAlertRecipients()).map(({ email }) => email);
    if (recipients.length === 0) {
      console.error("Email alert not sent: no alert recipients are configured.");
      return false;
    }

    const info = await transporter.sendMail({
      from: `"HLS Monitor" <${process.env.EMAIL_USER}>`,

      to: recipients,

      subject,

      html,
    });

    console.log("Email sent:", info.messageId);

    return true;
  } catch (error) {
    console.error("Email error:", error.message);

    return false;
  }
}

module.exports = {
  sendEmail,
};
