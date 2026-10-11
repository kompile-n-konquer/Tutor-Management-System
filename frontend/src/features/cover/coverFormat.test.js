import { describe, test, expect } from 'vitest';
import { coverStatusBadge, coverStatusLabel } from './coverFormat.js';

describe('coverFormat — cover request status styling', () => {
  test('maps every cover status to its badge class and label', () => {
    expect(coverStatusBadge('OFFERED')).toBe('bg-trust-blue/10 text-trust-blue');
    expect(coverStatusBadge('PENDING')).toBe('bg-secondary-fixed text-on-secondary-container');
    expect(coverStatusBadge('APPROVED')).toBe('bg-primary/10 text-primary');
    expect(coverStatusBadge('REJECTED')).toBe('bg-error/10 text-error');
    expect(coverStatusBadge('CANCELLED')).toBe('bg-surface-variant text-on-surface-variant');

    expect(coverStatusLabel('OFFERED')).toBe('Awaiting nominee');
    expect(coverStatusLabel('PENDING')).toBe('Awaiting lecturer');
    expect(coverStatusLabel('APPROVED')).toBe('Approved');
    expect(coverStatusLabel('REJECTED')).toBe('Declined');
    expect(coverStatusLabel('CANCELLED')).toBe('Withdrawn');
  });

  test('falls back to the withdrawn badge and the raw status for unknown values', () => {
    expect(coverStatusBadge('SOMETHING_ELSE')).toBe('bg-surface-variant text-on-surface-variant');
    expect(coverStatusLabel('SOMETHING_ELSE')).toBe('SOMETHING_ELSE');
  });
});
