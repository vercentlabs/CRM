
import nodemailer from 'nodemailer';

// Create a transporter object using SMTP transport
const createTransporter = () => {
  // Use environment variables for email configuration
  console.log('Creating transporter with config:');
  console.log('Host:', process.env.EMAIL_HOST || 'smtp.gmail.com');
  console.log('Port:', process.env.EMAIL_PORT || 587);
  console.log('Secure:', process.env.EMAIL_SECURE === 'true');
  console.log('User:', process.env.EMAIL_USER);
  
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

// Verify email configuration
const verifyEmailConfig = async () => {
  try {
    console.log('Verifying email configuration...');
    const transporter = createTransporter();
    await transporter.verify();
    console.log('Email configuration verified successfully');
    return true;
  } catch (error) {
    console.error('Email configuration verification failed:', error);
    return false;
  }
};

/**
 * Send password reset email
 * @param {string} to - Recipient email address
 * @param {string} resetToken - Password reset token
 * @param {string} baseUrl - Base URL of the application
 * @returns {Promise<boolean>} - Success status
 */
const sendPasswordResetEmail = async (to, resetToken, baseUrl) => {
  try {
    console.log('Creating email transporter...');
    const transporter = createTransporter();
    console.log('Email transporter created successfully');

    // Create reset URL
    const resetUrl = `${baseUrl}/reset-password?token=${resetToken}`;

    // Email content
    const mailOptions = {
      from: process.env.EMAIL_FROM || '"CRM System" <noreply@crm.com>',
      to: to,
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

    // Send the email
    console.log('Sending email to:', to);
    await transporter.sendMail(mailOptions);
    console.log('Email sent successfully to:', to);
    return true;
  } catch (error) {
    console.error('Error sending password reset email:');
    console.error('Error details:', error);
    console.error('Recipient:', to);
    console.error('Reset URL:', resetUrl);
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
      to: to,
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
    console.error('Error sending test email:', error);
    return false;
  }
};

export default {
  sendPasswordResetEmail,
  sendTestEmail,
  verifyEmailConfig
};
