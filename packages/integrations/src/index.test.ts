import { randomBytes } from 'node:crypto';
import { describe, expect, it } from 'vitest';
import {
  ProviderError,
  assertSafeWebhookTarget,
  buildResetUrl,
  decryptSecret,
  encryptSecret,
  isPermanentStatus,
  isPrivateAddress,
  memberInvitationEmail,
  noSmsProvider,
  normalizeNumber,
  parseSecretKey,
  signPayload,
  verifySignature,
  withTimeout,
} from './index.js';

describe('timeouts and classification', () => {
  it('bounds slow providers with a transient TIMEOUT error', async () => {
    const never = new Promise(() => undefined);
    await expect(withTimeout(never, 20, 'test')).rejects.toMatchObject({
      code: 'TIMEOUT',
      permanent: false,
    });
  });

  it('treats 4xx as permanent except throttling/timeouts', () => {
    expect(isPermanentStatus(400)).toBe(true);
    expect(isPermanentStatus(404)).toBe(true);
    expect(isPermanentStatus(429)).toBe(false);
    expect(isPermanentStatus(408)).toBe(false);
    expect(isPermanentStatus(503)).toBe(false);
    expect(isPermanentStatus(undefined)).toBe(false);
  });
});

describe('sms', () => {
  it('normalizes national numbers only when a country code is configured', () => {
    expect(normalizeNumber('98765 43210', '91')).toBe('919876543210');
    expect(normalizeNumber('+44 20 7946 0958')).toBe('442079460958');
    expect(normalizeNumber('9876543210')).toBe('9876543210');
  });

  it('fails permanently when no provider is configured', async () => {
    await expect(noSmsProvider.send({ to: '1', text: 'x' })).rejects.toBeInstanceOf(ProviderError);
    await expect(noSmsProvider.send({ to: '1', text: 'x' })).rejects.toMatchObject({
      permanent: true,
    });
  });
});

describe('email templates', () => {
  it('escapes organization and inviter names', () => {
    const mail = memberInvitationEmail('a@b.test', {
      organizationName: '<script>x</script>',
      inviterName: 'Eve "admin"',
      signInUrl: 'https://crm.test/login',
    });
    expect(mail.html).not.toContain('<script>');
    expect(mail.html).toContain('&#60;script&#62;');
  });

  it('builds reset links with an encoded token', () => {
    expect(buildResetUrl('https://crm.test/', 'a b')).toBe(
      'https://crm.test/reset-password?token=a%20b',
    );
  });
});

describe('webhook signing', () => {
  it('signs with a timestamp and verifies within tolerance only', () => {
    const body = '{"a":1}';
    const now = 1_700_000_000_000;
    const ts = Math.floor(now / 1000);
    const sig = signPayload('secret', ts, body);
    expect(sig).toMatch(/^v1=[0-9a-f]{64}$/);
    expect(verifySignature('secret', sig, ts, body, 300, now)).toBe(true);
    expect(verifySignature('other', sig, ts, body, 300, now)).toBe(false);
    expect(verifySignature('secret', sig, ts, '{"a":2}', 300, now)).toBe(false);
    expect(verifySignature('secret', sig, ts, body, 300, now + 600_000)).toBe(false);
  });

  it('encrypts secrets with authenticated encryption', () => {
    const key = parseSecretKey(randomBytes(32).toString('base64'));
    const stored = encryptSecret(key, 'whsec_123');
    expect(stored).not.toContain('whsec_123');
    expect(decryptSecret(key, stored)).toBe('whsec_123');
    const tampered = stored.slice(0, -2) + (stored.endsWith('A') ? 'B' : 'A') + stored.slice(-1);
    expect(() => decryptSecret(key, tampered)).toThrow();
    expect(() => decryptSecret(parseSecretKey(randomBytes(32).toString('hex')), stored)).toThrow();
    expect(() => parseSecretKey('short')).toThrow(/32 bytes/);
  });
});

describe('SSRF guard', () => {
  const resolver = (map: Record<string, string[]>) => async (host: string) => map[host] ?? [];

  it('classifies private and public addresses', () => {
    for (const ip of [
      '127.0.0.1',
      '10.1.2.3',
      '172.16.0.1',
      '192.168.1.1',
      '169.254.169.254',
      '100.64.0.1',
      '0.0.0.0',
      '::1',
      'fd00::1',
      'fe80::1',
      '::ffff:10.0.0.1',
    ]) {
      expect(isPrivateAddress(ip), ip).toBe(true);
    }
    for (const ip of ['8.8.8.8', '172.32.0.1', '2606:4700::1111'])
      expect(isPrivateAddress(ip), ip).toBe(false);
  });

  it('blocks http, credentials, localhost and private resolutions in production', async () => {
    const opts = {
      allowPrivate: false,
      resolver: resolver({
        'hooks.example.com': ['93.184.216.34'],
        'evil.example.com': ['10.0.0.5'],
        'mixed.example.com': ['93.184.216.34', '127.0.0.1'],
      }),
    };
    await expect(
      assertSafeWebhookTarget('https://hooks.example.com/x', opts),
    ).resolves.toBeInstanceOf(URL);
    await expect(assertSafeWebhookTarget('http://hooks.example.com/x', opts)).rejects.toThrow(
      /HTTPS/,
    );
    await expect(assertSafeWebhookTarget('https://u:p@hooks.example.com', opts)).rejects.toThrow(
      /credentials/,
    );
    await expect(assertSafeWebhookTarget('https://localhost/x', opts)).rejects.toThrow(/private/);
    await expect(assertSafeWebhookTarget('https://169.254.169.254/latest', opts)).rejects.toThrow(
      /private/,
    );
    await expect(assertSafeWebhookTarget('https://evil.example.com', opts)).rejects.toThrow(
      /private/,
    );
    await expect(assertSafeWebhookTarget('https://mixed.example.com', opts)).rejects.toThrow(
      /private/,
    );
    await expect(
      assertSafeWebhookTarget('ftp://hooks.example.com', { allowPrivate: true }),
    ).rejects.toThrow(/scheme/);
  });
});
