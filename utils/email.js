import dotenv from "dotenv";
import SibApiV3Sdk from "sib-api-v3-sdk";

dotenv.config();

const apiKey = process.env.BREVO_API_KEY;
if (!apiKey) throw new Error("Missing BREVO_API_KEY environment variable");

const defaultClient = SibApiV3Sdk.ApiClient.instance;
defaultClient.authentications["api-key"].apiKey = apiKey;

export async function sendMail(to, subject, html) {
  const apiInstance = new SibApiV3Sdk.TransactionalEmailsApi();

  const sendSmtpEmail = {
    to: [{ email: to }],
    sender: { email: process.env.EMAIL_USER, name: "Buzz" },
    subject,
    htmlContent: html,
  };

  try {
    const data = await apiInstance.sendTransacEmail(sendSmtpEmail);
    return { success: true, data };
  } catch (error) {
    console.error("Error sending email:", error.message);
    return { success: false, error };
  }
}

export default sendMail;
