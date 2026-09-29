import { createHmac } from 'node:crypto';
import {
  createImageKitStorage,
  createMemoryStorage,
  createSmtpSender,
  type EmailSender,
  type FileStorage,
} from '@crm/integrations';
import { env } from './env.js';

/**
 * Provider adapters used synchronously by the API (clients are created
 * lazily). Background delivery (email, SMS, provider cleanup) runs in the
 * worker with the same adapters.
 */

export function createStorage(): FileStorage {
  if (env.STORAGE_PROVIDER === 'memory') {
    // Stable per deployment so signed development URLs survive restarts.
    const signingSecret = createHmac('sha256', env.JWT_SECRET).update('file-urls').digest('hex');
    return createMemoryStorage({ signingSecret });
  }
  return createImageKitStorage({
    publicKey: env.IMAGEKIT_PUBLIC_KEY,
    privateKey: env.IMAGEKIT_PRIVATE_KEY,
    urlEndpoint: env.IMAGEKIT_URL_ENDPOINT,
  });
}

let storage: FileStorage = createStorage();

export const fileStorage = (): FileStorage => storage;

/** Test seam for the storage provider. */
export function useStorage(adapter: FileStorage): void {
  storage = adapter;
}

/** SMTP for the synchronous admin diagnostics (verify / test email). */
export const emailSender: EmailSender = createSmtpSender({
  host: env.EMAIL_HOST,
  port: env.EMAIL_PORT ? Number(env.EMAIL_PORT) : undefined,
  secure: env.EMAIL_SECURE === 'true',
  user: env.EMAIL_USER,
  pass: env.EMAIL_PASS,
  from: env.EMAIL_FROM,
});
