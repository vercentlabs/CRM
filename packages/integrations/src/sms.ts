import plivo from 'plivo';
import { ProviderError, isPermanentStatus, safeMessage, withTimeout } from './errors.js';

/**
 * Outbound text messages. Only SMS through Plivo is implemented; WhatsApp has
 * no provider integration, so callers must fail such messages truthfully
 * instead of pretending they were sent.
 */

export interface SmsRequest {
  to: string;
  text: string;
  /** Provider delivery-report callback URL. */
  statusCallbackUrl?: string | undefined;
}

export interface SmsProvider {
  readonly name: string;
  send(request: SmsRequest): Promise<{ providerMessageId: string }>;
}

export interface PlivoSmsConfig {
  authId: string;
  authToken: string;
  from: string;
  /** Prefix for bare national numbers (e.g. "91" for India); leave unset for E.164 input. */
  defaultCountryCode?: string | undefined;
  timeoutMs?: number | undefined;
}

/** Normalizes to digits with a country code (Plivo's expected format). */
export function normalizeNumber(raw: string, defaultCountryCode?: string): string {
  const digits = raw.replace(/[^\d+]/g, '');
  if (digits.startsWith('+')) return digits.slice(1);
  if (defaultCountryCode && digits.length === 10) return `${defaultCountryCode}${digits}`;
  return digits;
}

export function createPlivoSms(config: PlivoSmsConfig): SmsProvider {
  let client: InstanceType<typeof plivo.Client> | undefined;
  const sdk = () => (client ??= new plivo.Client(config.authId, config.authToken));
  return {
    name: 'plivo',
    async send({ to, text, statusCallbackUrl }) {
      const destination = normalizeNumber(to, config.defaultCountryCode);
      if (!/^\d{8,15}$/.test(destination)) {
        throw new ProviderError('INVALID_RECIPIENT', 'Recipient number is not valid', true);
      }
      try {
        const response = (await withTimeout(
          sdk().messages.create(
            config.from,
            destination,
            text,
            statusCallbackUrl ? { url: statusCallbackUrl, method: 'POST' } : {},
          ),
          config.timeoutMs ?? 15_000,
          'Plivo SMS',
        )) as unknown as { messageUuid?: string[] | string };
        const uuid = Array.isArray(response.messageUuid)
          ? response.messageUuid[0]
          : response.messageUuid;
        if (!uuid)
          throw new ProviderError('PROVIDER_BAD_RESPONSE', 'No message id returned', false);
        return { providerMessageId: String(uuid) };
      } catch (error) {
        if (error instanceof ProviderError) throw error;
        const status =
          (error as { statusCode?: number; status?: number }).statusCode ??
          (error as { status?: number }).status;
        throw new ProviderError(
          isPermanentStatus(status) ? 'PROVIDER_REJECTED' : 'PROVIDER_UNAVAILABLE',
          safeMessage(error),
          isPermanentStatus(status),
          { cause: error },
        );
      }
    },
  };
}

/**
 * Development provider: records the request and reports success without any
 * network call. Refused in production by the worker's configuration check.
 */
export function createLogSms(): SmsProvider & { sent: SmsRequest[] } {
  const sent: SmsRequest[] = [];
  return {
    name: 'log',
    sent,
    async send(request) {
      sent.push(request);
      return { providerMessageId: `log-${Date.now()}-${sent.length}` };
    },
  };
}

/** No provider configured: every send fails permanently (truthful status). */
export const noSmsProvider: SmsProvider = {
  name: 'none',
  async send() {
    throw new ProviderError('PROVIDER_NOT_CONFIGURED', 'No SMS provider is configured', true);
  },
};
