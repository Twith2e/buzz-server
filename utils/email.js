import mailer from "nodemailer";
import dotenv from "dotenv";

dotenv.config();

/**
 * Creates a nodemailer transporter using Google App Password authentication
 * @returns {Promise<Object>} Configured nodemailer transporter
 */
async function createTransporter() {
  if (!process.env.email || !process.env.APP_PASSWORD) {
    console.error(
      "Missing email configuration. Ensure 'email' and 'APP_PASSWORD' variables are set."
    );
    throw new Error("Missing email configuration");
  }

  try {
    const transporter = mailer.createTransport({
      service: "gmail",
      auth: {
        user: process.env.email,
        pass: process.env.APP_PASSWORD,
      },
    });
    return transporter;
  } catch (error) {
    console.error("Error creating transporter:", error);
    throw error;
  }
}

async function sendEmail(recipient, message, subject) {
  try {
    const transporter = await createTransporter();
    const mailOptions = {
      from: process.env.email,
      to: recipient,
      subject,
      html: message,
    };

    const info = await transporter.sendMail(mailOptions);
    if (!info) {
      console.error("Mail sent but no info returned");
      return false;
    }
    console.log(`Email sent to ${recipient}: ${info.messageId}`);
    return true;
  } catch (error) {
    console.error(`Error sending mail to ${recipient}:`, error);
    return false;
  }
}

export default sendEmail;
