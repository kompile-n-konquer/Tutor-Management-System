import { describe, test, expect } from 'vitest';
import { NAV_LINKS, FOOTER_LINKS, getNavLinksForRole } from './navConfig.js';

describe('navConfig — sidebar link source of truth', () => {
  test('tutors see their dashboard, volunteering, timesheets and timetable', () => {
    const labels = getNavLinksForRole('tutor').map((link) => link.label);
    expect(labels).toEqual(['Tutor Dashboard', 'Volunteer View', 'Timesheets', 'Timetable']);
  });

  test('organisers only see the allocation board', () => {
    const labels = getNavLinksForRole('organiser').map((link) => link.label);
    expect(labels).toEqual(['Allocation Board']);
  });

  test('students only see the profile link', () => {
    const labels = getNavLinksForRole('student').map((link) => link.label);
    expect(labels).toEqual(['Profile']);
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
