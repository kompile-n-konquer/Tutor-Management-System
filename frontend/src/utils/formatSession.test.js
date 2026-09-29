import { describe, test, expect } from 'vitest';
import {
  formatSessionDate,
  formatSessionTimeRange,
  sessionDurationHours,
} from './formatSession.js';

// Time info lives on session.courseSlot.timeSlot as minutes since midnight.
const makeSession = (startMinute, endMinute) => ({
  courseSlot: { timeSlot: { startMinute, endMinute } },
});

describe('formatSessionTimeRange', () => {
  test('formats a morning range with AM suffix', () => {
    expect(formatSessionTimeRange(makeSession(600, 720))).toBe('10:00 AM – 12:00 PM');
  });

  test('formats an afternoon range with PM suffix', () => {
    expect(formatSessionTimeRange(makeSession(810, 870))).toBe('1:30 PM – 2:30 PM');
  });

  test('renders midnight and noon as 12:00', () => {
    expect(formatSessionTimeRange(makeSession(0, 30))).toBe('12:00 AM – 12:30 AM');
    expect(formatSessionTimeRange(makeSession(720, 750))).toBe('12:00 PM – 12:30 PM');
  });

  test('pads single-digit minutes', () => {
    expect(formatSessionTimeRange(makeSession(541, 601))).toBe('9:01 AM – 10:01 AM');
  });

  test('returns an empty string when the session has no courseSlot/timeSlot', () => {
    expect(formatSessionTimeRange({})).toBe('');
    expect(formatSessionTimeRange({ courseSlot: {} })).toBe('');
    expect(formatSessionTimeRange(null)).toBe('');
  });

  test('falls back to an empty label for non-numeric minutes', () => {
    const session = { courseSlot: { timeSlot: { startMinute: 'ten', endMinute: 720 } } };
    expect(formatSessionTimeRange(session)).toBe(' – 12:00 PM');
  });
});

describe('sessionDurationHours', () => {
  test('returns whole hours rounded to one decimal', () => {
    expect(sessionDurationHours(makeSession(600, 720))).toBe(2);
    expect(sessionDurationHours(makeSession(570, 660))).toBe(1.5);
  });

  test('returns null when the slot is missing or unusable', () => {
    expect(sessionDurationHours({})).toBeNull();
    expect(sessionDurationHours({ courseSlot: { timeSlot: null } })).toBeNull();
    expect(sessionDurationHours(makeSession(600, 600))).toBeNull(); // zero-length
    expect(sessionDurationHours(makeSession(720, 600))).toBeNull(); // negative
  });
});

describe('formatSessionDate', () => {
  test('formats a date with the weekday and day of the month', () => {
    const formatted = formatSessionDate('2026-09-15T12:00:00.000Z');
    // Locale layout differs (e.g. "Tue, Sep 15" vs "Tue 15 Sep"), so assert the day.
    expect(formatted).toMatch(/15/);
    expect(formatted).toMatch(/Tue/i);
  });
});
