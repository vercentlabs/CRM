import { describe, expect, it, vi } from 'vitest';

const sendMail = vi.fn();
vi.mock('nodemailer', () => ({
  default: { createTransport: () => ({ sendMail, verify: vi.fn() }) },
}));

const { default: emailService, buildResetUrl } = await import('./email.service.js');

describe('email service', () => {
  it('builds reset links with an encoded token', () => {
    expect(buildResetUrl('https://app.test/', 'a b')).toBe('https://app.test/reset-password?token=a%20b');
  });

  it('returns false instead of throwing when sending fails, without logging the token URL', async () => {
    // Regression: the catch block referenced `resetUrl` out of scope (ReferenceError).
    sendMail.mockRejectedValueOnce(new Error('smtp down'));
    const errors = vi.spyOn(console, 'error').mockImplementation(() => undefined);
    await expect(emailService.sendPasswordResetEmail('u@x.test', 'secret-token', 'https://app.test')).resolves.toBe(false);
    const logged = errors.mock.calls.flat().map(String).join(' ');
    expect(logged).not.toContain('secret-token');
    expect(logged).toContain('smtp down');
    errors.mockRestore();
  });

  it('sends the reset email', async () => {
    sendMail.mockResolvedValueOnce({});
    await expect(emailService.sendPasswordResetEmail('u@x.test', 'tok', 'https://app.test')).resolves.toBe(true);
    expect(sendMail.mock.calls.at(-1)![0].html).toContain('https://app.test/reset-password?token=tok');
  });
});
