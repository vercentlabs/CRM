import { describe, expect, it } from 'vitest';
import { cn } from './cn.js';

describe('cn', () => {
  it('lets later classes override defaults in the same group', () => {
    expect(cn('block w-full h-9 px-3.5 text-sm', 'w-40 h-8 px-0 text-xs')).toBe(
      'block w-40 h-8 px-0 text-xs',
    );
  });

  it('keeps unrelated utilities, variants and text colours apart', () => {
    expect(cn('text-sm text-fg hover:bg-surface', 'text-muted bg-primary')).toBe(
      'text-sm hover:bg-surface text-muted bg-primary',
    );
    expect(cn('p-2', false, null, undefined, 'sm:p-4')).toBe('p-2 sm:p-4');
  });
});
