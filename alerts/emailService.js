require("dotenv").config();

const nodemailer = require("nodemailer");

const transporter = nodemailer.createTransport({
  service: "gmail",

  auth: {
    user: process.env.EMAIL_USER,
    pass: process.env.EMAIL_PASS,
  },
});

async function sendEmail(subject, html) {
  try {

    transporter.verify((error) => {
      if (error) {
        console.error("SMTP Error:", error.message);
      } else {
        console.log("SMTP Connected");
      }
    });
	
    const recipients = process.env.ALERT_EMAIL.split(",").map((email) =>
      email.trim(),
    );

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
