import { describe, test, expect } from 'vitest';
import { NAV_LINKS, FOOTER_LINKS, getNavLinksForRole } from './navConfig.js';

describe('navConfig — sidebar link source of truth', () => {
  test('tutors see the dashboard, events, swaps, applications, volunteering, timesheets and timetable', () => {
    const labels = getNavLinksForRole('tutor').map((link) => link.label);
    expect(labels).toEqual([
      'Dashboard',
      'Events',
      'Session Swaps',
      'Applications',
      'Volunteer View',
      'Timesheets',
      'Timetable',
    ]);
  });

  test('lecturers see the dashboard, courses, events and timesheets', () => {
    const labels = getNavLinksForRole('lecturer').map((link) => link.label);
    expect(labels).toEqual(['Dashboard', 'Courses', 'Events', 'Timesheets']);
  });

  test('organisers see the dashboard, allocation and analytics before their working set', () => {
    const labels = getNavLinksForRole('organiser').map((link) => link.label);
    expect(labels).toEqual([
      'Dashboard',
      'Allocation',
      'Analytics',
      'Courses',
      'Events',
      'Timesheets',
      'Applications',
      'Swap Requests',
    ]);
  });

  test('students see applications, their timetable and onboarding — no dashboard and no volunteering', () => {
    const labels = getNavLinksForRole('student').map((link) => link.label);
    expect(labels).toEqual([
      'Applications',
      'Timetable',
      'Become a Tutor/Lecturer',
    ]);
  });

  test('admins see the unified dashboard (it replaces the old Admin View)', () => {
    const labels = getNavLinksForRole('admin').map((link) => link.label);
    expect(labels).toEqual(['Dashboard']);
  });

  test('every staff role shares one Dashboard entry pointing at /dashboard', () => {
    for (const role of ['tutor', 'lecturer', 'organiser', 'admin']) {
      const dashboard = getNavLinksForRole(role).find((link) => link.label === 'Dashboard');
      expect(dashboard).toMatchObject({ to: '/dashboard', section: 'main' });
    }
    // Students have no dashboard items — they keep the volunteer view home.
    expect(getNavLinksForRole('student').find((link) => link.label === 'Dashboard')).toBeUndefined();
  });

  test('returns an empty list for a missing or unknown role', () => {
    expect(getNavLinksForRole()).toEqual([]);
    expect(getNavLinksForRole('auditor')).toEqual([]);
  });

  test('role matching is case-insensitive', () => {
    expect(getNavLinksForRole('TUTOR')).toEqual(getNavLinksForRole('tutor'));
  });

  test('every nav link declares a route, icon, label, its roles and a section', () => {
    for (const link of NAV_LINKS) {
      expect(link.to).toMatch(/^\//);
      expect(link.icon).toBeTruthy();
      expect(link.label).toBeTruthy();
      expect(Array.isArray(link.roles)).toBe(true);
      expect(['main', 'general']).toContain(link.section);
    }
  });

  test('the footer always exposes Profile, Settings and Logout', () => {
    expect(FOOTER_LINKS.map((link) => link.label)).toEqual(['Profile', 'Settings', 'Logout']);
  });
});
