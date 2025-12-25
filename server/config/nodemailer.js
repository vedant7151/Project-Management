import nodemailer from "nodemailer";

const transporter = nodemailer.createTransport({
  host: "smtp-relay.brevo.com",
  port: 587,
  secure: false, // true for 465, false for other ports
  auth: {
    user: process.env.SMTP_USER,
    pass: process.env.SMTP_PASS,
  },
});

const sendEmail = async ({ to, subject, body }) => {
  try {
    const response = await transporter.sendMail({
      from: process.env.SENDER_EMAIL, // Must be a verified sender in Brevo
      to,
      subject,
      html: body, // Correctly mapping your HTML string to the 'html' field
    });

    console.log(`Email sent to ${to}: MessageID ${response.messageId}`);
    return response;
  } catch (error) {
    console.error("Error sending email:", error);
    throw error; // Rethrow so Inngest knows to retry the step
  }
};

export default sendEmail;