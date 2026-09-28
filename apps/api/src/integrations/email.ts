import nodemailer from 'nodemailer';
import { errorFields, logger } from '../platform/logger.js';

/**
 * SMTP adapter (nodemailer). Configuration and credentials come only from
 * the server environment and are never logged or tenant-editable.
 * Every function returns a boolean and never throws.
 */

const createTransporter = () =>
  nodemailer.createTransport({
    host: process.env.EMAIL_HOST || 'smtp.gmail.com',
    port: Number(process.env.EMAIL_PORT || 587),
    secure: process.env.EMAIL_SECURE === 'true',
    auth: { user: process.env.EMAIL_USER, pass: process.env.EMAIL_PASS },
  });

const from = () => process.env.EMAIL_FROM || '"CRM System" <noreply@crm.com>';

async function verifyEmailConfig(): Promise<boolean> {
  try {
    await createTransporter().verify();
    return true;
  } catch (error) {
    logger.warn('email_config_invalid', errorFields(error));
    return false;
  }
}

/** Builds the reset link. The URL contains a live token and must never be logged. */
export const buildResetUrl = (baseUrl: string, resetToken: string) =>
  `${String(baseUrl).replace(/\/+$/, '')}/reset-password?token=${encodeURIComponent(resetToken)}`;

async function sendPasswordResetEmail(
  to: string,
  resetToken: string,
  baseUrl: string,
): Promise<boolean> {
  const resetUrl = buildResetUrl(baseUrl, resetToken);
  try {
    await createTransporter().sendMail({
      from: from(),
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
      `,
    });
    return true;
  } catch (error) {
    logger.error('password_reset_email_failed', errorFields(error));
    return false;
  }
}

async function sendTestEmail(to: string): Promise<boolean> {
  try {
    await createTransporter().sendMail({
      from: from(),
      to,
      subject: 'Test Email',
      html: `
        <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px;">
          <h2 style="color: #333;">Test Email</h2>
          <p>This is a test email from the CRM system.</p>
          <p>If you receive this email, the email service is working correctly.</p>
          <p>Thank you,<br>CRM Team</p>
        </div>
      `,
    });
    return true;
  } catch (error) {
    logger.error('test_email_failed', errorFields(error));
    return false;
  }
}

export default { sendPasswordResetEmail, sendTestEmail, verifyEmailConfig };
