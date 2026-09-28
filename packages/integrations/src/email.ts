import nodemailer from 'nodemailer';
import { ProviderError, safeMessage } from './errors.js';

/**
 * SMTP email behind a small interface. Credentials come from the server
 * environment only; errors never include them. All socket phases are bounded.
 */

export interface EmailMessage {
  to: string;
  subject: string;
  html: string;
  text: string;
}

export interface EmailSender {
  send(message: EmailMessage): Promise<{ messageId: string | null }>;
  verify(): Promise<boolean>;
}

export interface SmtpConfig {
  host?: string | undefined;
  port?: number | undefined;
  secure?: boolean | undefined;
  user?: string | undefined;
  pass?: string | undefined;
  from?: string | undefined;
  timeoutMs?: number | undefined;
}

export function createSmtpSender(config: SmtpConfig): EmailSender {
  const timeout = config.timeoutMs ?? 15_000;
  const transport = () =>
    nodemailer.createTransport({
      host: config.host || 'smtp.gmail.com',
      port: config.port ?? 587,
      secure: config.secure ?? false,
      auth: config.user ? { user: config.user, pass: config.pass } : undefined,
      connectionTimeout: timeout,
      greetingTimeout: timeout,
      socketTimeout: timeout,
    });
  const from = config.from || '"CRM" <noreply@crm.local>';
  return {
    async send(message) {
      try {
        const info = await transport().sendMail({ from, ...message });
        return { messageId: info.messageId ?? null };
      } catch (error) {
        const code = (error as { responseCode?: number }).responseCode;
        // SMTP 5xx = permanent rejection; 4xx and connection errors are transient.
        const permanent = code !== undefined && code >= 500 && code < 600;
        throw new ProviderError(
          permanent ? 'EMAIL_REJECTED' : 'EMAIL_UNAVAILABLE',
          safeMessage(error),
          permanent,
          { cause: error },
        );
      }
    },
    async verify() {
      try {
        await transport().verify();
        return true;
      } catch {
        return false;
      }
    },
  };
}

/** Captures messages in memory (development and tests). */
export function createMemoryEmailSender(): EmailSender & { sent: EmailMessage[] } {
  const sent: EmailMessage[] = [];
  return {
    sent,
    async send(message) {
      sent.push(message);
      return { messageId: `memory-${sent.length}` };
    },
    async verify() {
      return true;
    },
  };
}

const escapeHtml = (value: string) => value.replace(/[&<>"']/g, (c) => `&#${c.charCodeAt(0)};`);

const layout = (title: string, body: string) => `
  <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px;">
    <h2 style="color: #333;">${escapeHtml(title)}</h2>
    ${body}
    <p>Thank you,<br>CRM Team</p>
  </div>`;

/** Builds the reset link. The URL contains a live token and must never be logged. */
export const buildResetUrl = (baseUrl: string, resetToken: string) =>
  `${String(baseUrl).replace(/\/+$/, '')}/reset-password?token=${encodeURIComponent(resetToken)}`;

export function passwordResetEmail(to: string, resetUrl: string): EmailMessage {
  const url = escapeHtml(resetUrl);
  return {
    to,
    subject: 'Password Reset Request',
    text: `You requested a password reset. Open this link within one hour: ${resetUrl}\nIf you did not request it, ignore this email.`,
    html: layout(
      'Password Reset Request',
      `<p>You requested a password reset for your CRM account.</p>
       <p style="text-align:center;margin:30px 0;"><a href="${url}" style="background-color:#2f54d9;color:#fff;padding:12px 24px;text-decoration:none;border-radius:4px;display:inline-block;">Reset password</a></p>
       <p>If the button doesn't work, copy this link into your browser:</p>
       <p style="word-break:break-all;color:#2f54d9;">${url}</p>
       <p>This link expires in 1 hour. If you didn't request a reset, ignore this email.</p>`,
    ),
  };
}

export function memberInvitationEmail(
  to: string,
  input: { organizationName: string; inviterName: string | null; signInUrl: string },
): EmailMessage {
  const org = escapeHtml(input.organizationName);
  const who = input.inviterName ? escapeHtml(input.inviterName) : 'An administrator';
  return {
    to,
    subject: `You have been invited to ${input.organizationName}`,
    text: `${input.inviterName ?? 'An administrator'} invited you to join ${input.organizationName} on the CRM. Sign in with your existing account to accept: ${input.signInUrl}`,
    html: layout(
      'Organization invitation',
      `<p>${who} invited you to join <strong>${org}</strong> on the CRM.</p>
       <p>Sign in with your existing account and accept the invitation from the organization switcher.</p>
       <p><a href="${escapeHtml(input.signInUrl)}">${escapeHtml(input.signInUrl)}</a></p>`,
    ),
  };
}
