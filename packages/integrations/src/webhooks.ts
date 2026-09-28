import {
  createCipheriv,
  createDecipheriv,
  createHmac,
  randomBytes,
  timingSafeEqual,
} from 'node:crypto';
import { lookup } from 'node:dns/promises';
import { isIP } from 'node:net';

/**
 * Outbound webhook primitives: HMAC signing, secret encryption at rest and an
 * SSRF guard. Nothing here logs secrets or payloads.
 */

// ---------------------------------------------------------------- signing

export const SIGNATURE_HEADER = 'x-crm-signature';
export const TIMESTAMP_HEADER = 'x-crm-timestamp';
export const DELIVERY_HEADER = 'x-crm-delivery-id';
export const EVENT_ID_HEADER = 'x-crm-event-id';
export const EVENT_TYPE_HEADER = 'x-crm-event-type';

/** `v1=<hex HMAC-SHA256(secret, "<timestamp>.<body>")>` (Stripe-style, replay-resistant). */
export function signPayload(secret: string, timestamp: number, body: string): string {
  const mac = createHmac('sha256', secret).update(`${timestamp}.${body}`).digest('hex');
  return `v1=${mac}`;
}

/** Receiver-side check (also used in tests): signature match + timestamp tolerance. */
export function verifySignature(
  secret: string,
  signature: string,
  timestamp: number,
  body: string,
  toleranceSeconds = 300,
  now = Date.now(),
): boolean {
  if (Math.abs(now / 1000 - timestamp) > toleranceSeconds) return false;
  const expected = Buffer.from(signPayload(secret, timestamp, body));
  const given = Buffer.from(signature);
  return expected.length === given.length && timingSafeEqual(expected, given);
}

// ---------------------------------------------------------------- secrets

/** Parses WEBHOOK_SECRET_KEY: 32 bytes, base64 or hex. */
export function parseSecretKey(value: string): Buffer {
  const key = /^[0-9a-f]{64}$/i.test(value)
    ? Buffer.from(value, 'hex')
    : Buffer.from(value, 'base64');
  if (key.length !== 32) throw new Error('WEBHOOK_SECRET_KEY must be 32 bytes (base64 or hex)');
  return key;
}

/** AES-256-GCM: `v1.<iv>.<tag>.<ciphertext>` (base64url parts). */
export function encryptSecret(key: Buffer, plaintext: string): string {
  const iv = randomBytes(12);
  const cipher = createCipheriv('aes-256-gcm', key, iv);
  const data = Buffer.concat([cipher.update(plaintext, 'utf8'), cipher.final()]);
  return ['v1', iv, cipher.getAuthTag(), data]
    .map((p) => (typeof p === 'string' ? p : p.toString('base64url')))
    .join('.');
}

export function decryptSecret(key: Buffer, ciphertext: string): string {
  const [version, iv, tag, data] = ciphertext.split('.');
  if (version !== 'v1' || !iv || !tag || !data) throw new Error('Unsupported secret format');
  const decipher = createDecipheriv('aes-256-gcm', key, Buffer.from(iv, 'base64url'));
  decipher.setAuthTag(Buffer.from(tag, 'base64url'));
  return Buffer.concat([
    decipher.update(Buffer.from(data, 'base64url')),
    decipher.final(),
  ]).toString('utf8');
}

// ---------------------------------------------------------------- SSRF guard

/** Loopback, private, link-local, CGNAT, multicast, unspecified and IPv6 ULA/link-local. */
export function isPrivateAddress(address: string): boolean {
  const v4 = address.startsWith('::ffff:') ? address.slice(7) : address;
  if (isIP(v4) === 4) {
    const [a, b] = v4.split('.').map(Number) as [number, number];
    return (
      a === 0 ||
      a === 10 ||
      a === 127 ||
      (a === 100 && b >= 64 && b <= 127) ||
      (a === 169 && b === 254) ||
      (a === 172 && b >= 16 && b <= 31) ||
      (a === 192 && b === 168) ||
      a >= 224
    );
  }
  const v6 = address.toLowerCase();
  return (
    v6 === '::' ||
    v6 === '::1' ||
    v6.startsWith('fc') ||
    v6.startsWith('fd') ||
    v6.startsWith('fe8') ||
    v6.startsWith('fe9') ||
    v6.startsWith('fea') ||
    v6.startsWith('feb') ||
    v6.startsWith('ff')
  );
}

export type Resolver = (hostname: string) => Promise<string[]>;
const systemResolver: Resolver = async (hostname) =>
  (await lookup(hostname, { all: true, verbatim: true })).map((r) => r.address);

/**
 * Throws unless the URL is an acceptable webhook target. In production:
 * HTTPS only, no credentials in the URL, and every resolved address public.
 * Resolution happens right before each delivery (DNS can change).
 */
export async function assertSafeWebhookTarget(
  rawUrl: string,
  options: { allowPrivate: boolean; resolver?: Resolver },
): Promise<URL> {
  let url: URL;
  try {
    url = new URL(rawUrl);
  } catch {
    throw new Error('Invalid webhook URL');
  }
  if (url.username || url.password) throw new Error('Webhook URLs must not contain credentials');
  if (!options.allowPrivate && url.protocol !== 'https:')
    throw new Error('Webhook URLs must use HTTPS');
  if (url.protocol !== 'https:' && url.protocol !== 'http:')
    throw new Error('Unsupported webhook scheme');
  if (options.allowPrivate) return url;
  const host = url.hostname.replace(/^\[|\]$/g, '');
  if (host === 'localhost' || host.endsWith('.localhost') || host.endsWith('.internal')) {
    throw new Error('Webhook target resolves to a private address');
  }
  const addresses = isIP(host) ? [host] : await (options.resolver ?? systemResolver)(host);
  if (addresses.length === 0 || addresses.some(isPrivateAddress)) {
    throw new Error('Webhook target resolves to a private address');
  }
  return url;
}
