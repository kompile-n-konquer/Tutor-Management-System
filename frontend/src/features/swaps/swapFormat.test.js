import { describe, test, expect } from 'vitest';
import {
  formatSessionDate,
  formatSlot,
  swapStatusBadge,
  swapStatusLabel,
} from './swapFormat.js';

describe('swapFormat — shared swap page formatting', () => {
  test('formats an ISO date as a locale date string', () => {
    const iso = '2026-10-05T00:00:00.000Z';
    expect(formatSessionDate(iso)).toBe(new Date(iso).toLocaleDateString());
  });

  test('formats a slot as the compact weekday time range used across the app', () => {
    const slot = { dayOfWeek: 0, startMinute: 600, endMinute: 690 };
    expect(formatSlot(slot)).toBe('Mon 10:00-11:30');
  });

  test('maps every swap status to its badge class and label', () => {
    expect(swapStatusBadge('PENDING')).toBe('bg-trust-blue/10 text-trust-blue');
    expect(swapStatusBadge('ACCEPTED')).toBe('bg-secondary-fixed text-on-secondary-fixed');
    expect(swapStatusBadge('APPROVED')).toBe('bg-primary/10 text-primary');
    expect(swapStatusBadge('REJECTED')).toBe('bg-error/10 text-error');
    expect(swapStatusBadge('CANCELLED')).toBe('bg-surface-variant text-on-surface-variant');

    expect(swapStatusLabel('PENDING')).toBe('Awaiting partner');
    expect(swapStatusLabel('ACCEPTED')).toBe('Awaiting organiser');
    expect(swapStatusLabel('APPROVED')).toBe('Approved');
    expect(swapStatusLabel('REJECTED')).toBe('Declined / rejected');
    expect(swapStatusLabel('CANCELLED')).toBe('Cancelled');
  });

  test('falls back to the cancelled badge and the raw status for unknown values', () => {
    expect(swapStatusBadge('SOMETHING_ELSE')).toBe('bg-surface-variant text-on-surface-variant');
    expect(swapStatusLabel('SOMETHING_ELSE')).toBe('SOMETHING_ELSE');
  });
});
