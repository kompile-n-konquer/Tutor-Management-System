import { describe, test, expect } from 'vitest';
import { NAV_LINKS, FOOTER_LINKS, getNavLinksForRole } from './navConfig.js';

describe('navConfig — sidebar link source of truth', () => {
  test('tutors see the dashboard, events, applications, volunteering, timesheets and timetable', () => {
    const labels = getNavLinksForRole('tutor').map((link) => link.label);
    expect(labels).toEqual([
      'Tutor Dashboard',
      'Events',
      'Applications',
      'Volunteer View',
      'Timesheets',
      'Timetable',
    ]);
  });

  test('lecturers see courses, events, timesheets and the lecturer view', () => {
    const labels = getNavLinksForRole('lecturer').map((link) => link.label);
    expect(labels).toEqual(['Courses', 'Events', 'Timesheets', 'Lecturer View']);
  });

  test('organisers see courses, events, their board, application review, analytics and timesheets', () => {
    const labels = getNavLinksForRole('organiser').map((link) => link.label);
    // Order follows NAV_LINKS: timesheets sits between events and the board.
    expect(labels).toEqual([
      'Courses',
      'Events',
      'Timesheets',
      'Organiser Board',
      'Applications',
      'Analytics',
    ]);
  });

  test('students see applications, volunteering, their timetable and onboarding', () => {
    const labels = getNavLinksForRole('student').map((link) => link.label);
    expect(labels).toEqual([
      'Applications',
      'Volunteer View',
      'Timetable',
      'Become a Tutor/Lecturer',
    ]);
  });

  test('admins only see the admin view', () => {
    const labels = getNavLinksForRole('admin').map((link) => link.label);
    expect(labels).toEqual(['Admin View']);
  });

  test('returns an empty list for a missing or unknown role', () => {
    expect(getNavLinksForRole()).toEqual([]);
    expect(getNavLinksForRole('auditor')).toEqual([]);
  });

  test('role matching is case-insensitive', () => {
    expect(getNavLinksForRole('TUTOR')).toEqual(getNavLinksForRole('tutor'));
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
