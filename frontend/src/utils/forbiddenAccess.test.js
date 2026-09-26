import { describe, test, expect } from 'vitest';
import { isForbiddenResource } from './forbiddenAccess.js';

describe('isForbiddenResource — masks ownership 403s as 404s', () => {
  test('treats 403s on course, event and timesheet detail endpoints as forbidden resources', () => {
    expect(isForbiddenResource(403, '/courses/12')).toBe(true);
    expect(isForbiddenResource(403, '/courses/12/slots')).toBe(true);
    expect(isForbiddenResource(403, '/events/7')).toBe(true);
    expect(isForbiddenResource(403, '/timesheets/3/export')).toBe(true);
  });

  test('ignores 403s on other endpoints so their inline errors keep working', () => {
    expect(isForbiddenResource(403, '/courses')).toBe(false);
    expect(isForbiddenResource(403, '/courses/time-slots')).toBe(false);
    expect(isForbiddenResource(403, '/courses/open-applications')).toBe(false);
    expect(isForbiddenResource(403, '/events/claimable')).toBe(false);
    expect(isForbiddenResource(403, '/applications/3/apply')).toBe(false);
    expect(isForbiddenResource(403, '/onboarding/apply')).toBe(false);
    expect(isForbiddenResource(403, '/users/me')).toBe(false);
  });

  test('only the 403 status counts — success and not-found responses are left alone', () => {
    expect(isForbiddenResource(200, '/courses/12')).toBe(false);
    expect(isForbiddenResource(404, '/courses/12')).toBe(false);
    expect(isForbiddenResource(500, '/timesheets/3')).toBe(false);
  });

  test('handles a missing URL safely', () => {
    expect(isForbiddenResource(403)).toBe(false);
    expect(isForbiddenResource(403, undefined)).toBe(false);
  });
});
