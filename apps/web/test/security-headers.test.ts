import { describe, expect, it } from 'vitest';
import { contentSecurityPolicy, securityHeaders } from '../security-headers';

const header = (list: { key: string; value: string }[], key: string) =>
  list.find((h) => h.key === key)?.value;

describe('web security headers', () => {
  it('locks down framing, plugins and network targets in production', () => {
    const headers = securityHeaders({
      apiBaseUrl: 'https://api.crm.example.com/v',
      production: true,
    });
    const csp = header(headers, 'Content-Security-Policy')!;
    expect(csp).toContain("frame-ancestors 'none'");
    expect(csp).toContain("object-src 'none'");
    expect(csp).toContain("base-uri 'self'");
    expect(csp).toContain("connect-src 'self' https://api.crm.example.com;");
    expect(csp).not.toContain('unsafe-eval');
    expect(csp).not.toContain('ws:');
    expect(csp).toContain('upgrade-insecure-requests');
    expect(header(headers, 'Strict-Transport-Security')).toMatch(/max-age=31536000/);
    expect(header(headers, 'X-Frame-Options')).toBe('DENY');
    expect(header(headers, 'X-Content-Type-Options')).toBe('nosniff');
  });

  it('relaxes only what the development server needs', () => {
    const headers = securityHeaders({ apiBaseUrl: 'http://localhost:5000', production: false });
    expect(header(headers, 'Strict-Transport-Security')).toBeUndefined();
    const csp = header(headers, 'Content-Security-Policy')!;
    expect(csp).toContain("'unsafe-eval'");
    expect(csp).toContain('http://localhost:5000');
  });

  it('never widens connect-src for an invalid API URL', () => {
    expect(contentSecurityPolicy({ apiBaseUrl: 'not a url', production: true })).toContain(
      "connect-src 'self';",
    );
  });
});
