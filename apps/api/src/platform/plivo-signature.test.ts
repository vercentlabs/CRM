import { createHmac } from 'node:crypto';
import type { AddressInfo } from 'node:net';
import express from 'express';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { verifyPlivoSignature } from './plivo-signature.js';

const AUTH_TOKEN = process.env.PLIVO_AUTH_TOKEN!;
const PUBLIC_BASE = process.env.PLIVO_WEBHOOK_URL!;

/**
 * Independent implementation of Plivo's documented V3 scheme for POST:
 * base64(HMAC-SHA256(authToken, `${url}?${sorted key+value pairs}.${nonce}`)).
 */
function signV3(
  url: string,
  params: Record<string, string>,
  nonce: string,
  token = AUTH_TOKEN,
): string {
  const sorted = Object.keys(params)
    .sort()
    .map((key) => `${key}${params[key]}`)
    .join('');
  const base = Object.keys(params).length ? `${url}?${sorted}` : url;
  return createHmac('sha256', token).update(`${base}.${nonce}`).digest('base64');
}

describe('verifyPlivoSignature', () => {
  let baseUrl: string;
  let close: () => Promise<void>;

  beforeAll(async () => {
    const app = express();
    const router = express.Router();
    router.use(express.urlencoded({ extended: false }));
    router.use(verifyPlivoSignature);
    router.post('/webhook/status', (_req, res) => res.json({ ok: true }));
    app.use('/api/plivo', router);
    const server = await new Promise<import('node:http').Server>((resolve) => {
      const s = app.listen(0, '127.0.0.1', () => resolve(s));
    });
    baseUrl = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
    close = () => new Promise((resolve) => server.close(() => resolve()));
  });

  afterAll(async () => close());

  const post = (
    signature: string | undefined,
    nonce: string | undefined,
    params: Record<string, string>,
  ) =>
    fetch(`${baseUrl}/api/plivo/webhook/status`, {
      method: 'POST',
      headers: {
        'content-type': 'application/x-www-form-urlencoded',
        ...(signature ? { 'X-Plivo-Signature-V3': signature } : {}),
        ...(nonce ? { 'X-Plivo-Signature-V3-Nonce': nonce } : {}),
      },
      body: new URLSearchParams(params).toString(),
    });

  const params = { CallUUID: 'abc-123', CallStatus: 'completed', CallDuration: '42' };

  it('accepts requests signed for the configured public URL', async () => {
    const nonce = '12345678901234567890';
    const res = await post(signV3(`${PUBLIC_BASE}/status`, params, nonce), nonce, params);
    expect(res.status).toBe(200);
  });

  it('rejects missing, forged or tampered signatures', async () => {
    const nonce = '12345678901234567890';
    expect((await post(undefined, undefined, params)).status).toBe(403);
    expect(
      (await post(signV3(`${PUBLIC_BASE}/status`, params, nonce, 'wrong-token'), nonce, params))
        .status,
    ).toBe(403);
    const signed = signV3(`${PUBLIC_BASE}/status`, params, nonce);
    expect((await post(signed, nonce, { ...params, CallStatus: 'failed' })).status).toBe(403);
    expect((await post(signed, 'another-nonce-000000', params)).status).toBe(403);
    // Signature computed for the internal URL instead of the public one.
    expect(
      (await post(signV3(`${baseUrl}/api/plivo/webhook/status`, params, nonce), nonce, params))
        .status,
    ).toBe(403);
  });
});
