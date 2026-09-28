
import nodemailer from 'nodemailer';

// Create a transporter object using SMTP transport.
// Configuration values (and especially credentials) are never logged.
const createTransporter = () => {
  return nodemailer.createTransport({
    host: process.env.EMAIL_HOST || 'smtp.gmail.com',
    port: process.env.EMAIL_PORT || 587,
    secure: process.env.EMAIL_SECURE === 'true', // true for 465, false for other ports
    auth: {
      user: process.env.EMAIL_USER,
      pass: process.env.EMAIL_PASS
    }
  });
};

const describeError = (error) => (error instanceof Error ? error.message : String(error));

// Verify email configuration
const verifyEmailConfig = async () => {
  try {
    const transporter = createTransporter();
    await transporter.verify();
    return true;
  } catch (error) {
    console.error('Email configuration verification failed:', describeError(error));
    return false;
  }
};

/** Builds the reset link. Exported for tests; the URL contains a live token and must never be logged. */
export const buildResetUrl = (baseUrl, resetToken) =>
  `${String(baseUrl).replace(/\/+$/, '')}/reset-password?token=${encodeURIComponent(resetToken)}`;

/**
 * Send password reset email
 * @param {string} to - Recipient email address
 * @param {string} resetToken - Password reset token
 * @param {string} baseUrl - Base URL of the application
 * @returns {Promise<boolean>} - Success status (never throws)
 */
const sendPasswordResetEmail = async (to, resetToken, baseUrl) => {
  // Built outside the try block: the pre-Phase-2 catch block referenced it out
  // of scope (ReferenceError) and logged the token-bearing URL.
  const resetUrl = buildResetUrl(baseUrl, resetToken);
  try {
    const transporter = createTransporter();

    const mailOptions = {
      from: process.env.EMAIL_FROM || '"CRM System" <noreply@crm.com>',
      to,
      subject: 'Password Reset Request',
      html: `
        <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px;">
          <h2 style="color: #333;">Password Reset Request</h2>
          <p>Hello,</p>
          <p>You requested a password reset for your CRM account. Click the button below to reset your password:</p>
          <div style="text-align: center; margin: 30px 0;">
            <a href="${resetUrl}" style="background-color: #4f46e5; color: white; padding: 12px 24px; text-decoration: none; border-radius: 4px; display: inline-block;">Reset Password</a>
          </div>
          <p>If the button doesn't work, you can copy and paste the following link in your browser:</p>
          <p style="word-break: break-all; color: #4f46e5;">${resetUrl}</p>
          <p>This link will expire in 1 hour.</p>
          <p>If you didn't request this password reset, you can safely ignore this email.</p>
          <p>Thank you,<br>CRM Team</p>
        </div>
      `
    };

    await transporter.sendMail(mailOptions);
    return true;
  } catch (error) {
    console.error('Error sending password reset email:', describeError(error));
    return false;
  }
};

/**
 * Send test email
 * @param {string} to - Recipient email address
 * @returns {Promise<boolean>} - Success status
 */
const sendTestEmail = async (to) => {
  try {
    const transporter = createTransporter();

    const mailOptions = {
      from: process.env.EMAIL_FROM || '"CRM System" <noreply@crm.com>',
      to,
      subject: 'Test Email',
      html: `
        <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px;">
          <h2 style="color: #333;">Test Email</h2>
          <p>This is a test email from the CRM system.</p>
          <p>If you receive this email, the email service is working correctly.</p>
          <p>Thank you,<br>CRM Team</p>
        </div>
      `
    };

    await transporter.sendMail(mailOptions);
    return true;
  } catch (error) {
    console.error('Error sending test email:', describeError(error));
    return false;
  }
};

export default {
  sendPasswordResetEmail,
  sendTestEmail,
  verifyEmailConfig
};
