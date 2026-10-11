import { describe, test, expect } from 'vitest';
import { ALERT_ACTIONS, alertActionFor, formatAlertTime } from './alertConfig.js';

describe('alertConfig — routing the priority feed', () => {
  test('every backend item type maps to an in-app action', () => {
    // The item types the backend's GET /api/dashboard can emit today. If the
    // backend grows a new one, this list (and the map) must grow with it.
    const knownTypes = [
      'swap-incoming',
      'swap-outgoing',
      'swap-accepted',
      'cover-awaiting',
      'cover-offered',
      'timesheet-rejected',
      'timesheet-draft',
      'cover-decision',
      'timesheet-review',
      'understaffed-course',
      'unassigned-session',
      'swap-review',
      'role-application',
      'course-application',
    ];

    expect(Object.keys(ALERT_ACTIONS).sort()).toEqual(knownTypes.sort());
    for (const type of knownTypes) {
      const action = ALERT_ACTIONS[type];
      expect(action.to).toMatch(/^(\/|#)/);
      expect(action.actionLabel).toBeTruthy();
    }
  });

  test('alertActionFor returns null for unknown types', () => {
    expect(alertActionFor('mystery-item')).toBeNull();
    expect(alertActionFor(undefined)).toBeNull();
  });

  test("the lecturer's cover decision anchors to the dashboard itself", () => {
    expect(ALERT_ACTIONS['cover-decision'].to).toBe('#lecturer-courses');
  });
});

describe('formatAlertTime — relative freshness', () => {
  const now = new Date('2026-10-11T12:00:00.000Z').getTime();

  test('empty, null and invalid timestamps render nothing', () => {
    expect(formatAlertTime(null, now)).toBe('');
    expect(formatAlertTime(undefined, now)).toBe('');
    expect(formatAlertTime('not-a-date', now)).toBe('');
  });

  test('steps through the relative bands', () => {
    expect(formatAlertTime(new Date(now - 30_000).toISOString(), now)).toBe('just now');
    expect(formatAlertTime(new Date(now - 5 * 60_000).toISOString(), now)).toBe('5m ago');
    expect(formatAlertTime(new Date(now - 3 * 3_600_000).toISOString(), now)).toBe('3h ago');
    expect(formatAlertTime(new Date(now - 2 * 86_400_000).toISOString(), now)).toBe('2d ago');
  });

  test('an upcoming timestamp (a session date) shows the calendar date', () => {
    const upcoming = new Date(now + 3 * 86_400_000);
    expect(formatAlertTime(upcoming.toISOString(), now)).toBe(upcoming.toLocaleDateString());
  });

  test('anything older than a week falls back to the calendar date', () => {
    const old = new Date(now - 12 * 86_400_000);
    expect(formatAlertTime(old.toISOString(), now)).toBe(old.toLocaleDateString());
  });
});
