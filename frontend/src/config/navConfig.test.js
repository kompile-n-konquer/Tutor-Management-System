import { describe, test, expect } from 'vitest';
import { NAV_LINKS, FOOTER_LINKS, getNavLinksForRole } from './navConfig.js';

describe('navConfig — sidebar link source of truth', () => {
  test('tutors see the dashboard, organiser pages, volunteering, timesheets and timetable', () => {
    const labels = getNavLinksForRole('tutor').map((link) => link.label);
    expect(labels).toEqual([
      'Tutor Dashboard',
      'Organiser Board',
      'Analytics',
      'Volunteer View',
      'Profile',
      'Timesheets',
      'Timetable',
    ]);
  });

  test('organisers currently get no primary links — their board moved under the tutor role', () => {
    // main's nav reshuffle (PR #52) left the organiser role without primary
    // links; their tools live at /organiser under roles: ["tutor"] instead.
    expect(getNavLinksForRole('organiser')).toEqual([]);
  });

  test('students currently get no primary links — Profile moved to the tutor role', () => {
    expect(getNavLinksForRole('student')).toEqual([]);
  });

  test('returns an empty list for an unknown role', () => {
    expect(getNavLinksForRole('auditor')).toEqual([]);
  });

  test('every nav link declares a route, icon, label and its roles', () => {
    for (const link of NAV_LINKS) {
      expect(link.to).toMatch(/^\//);
      expect(link.icon).toBeTruthy();
      expect(link.label).toBeTruthy();
      expect(Array.isArray(link.roles)).toBe(true);
    }
  });

  test('the footer always exposes Settings and Logout', () => {
    expect(FOOTER_LINKS.map((link) => link.label)).toEqual(['Settings', 'Logout']);
  });
});
