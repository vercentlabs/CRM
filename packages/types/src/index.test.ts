import { describe, expect, it } from 'vitest';
import { API_V1_PREFIX, ERROR_CODES, REQUEST_ID_HEADER } from './index.js';

describe('@crm/types constants', () => {
  it('exposes the versioned API prefix and request id header', () => {
    expect(API_V1_PREFIX).toBe('/api/v1');
    expect(REQUEST_ID_HEADER).toBe('x-request-id');
  });

  it('has unique error codes', () => {
    expect(new Set(ERROR_CODES).size).toBe(ERROR_CODES.length);
  });
});
