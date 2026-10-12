export const ROLES = Object.freeze({
  STUDENT: 'student',
  TUTOR: 'tutor',
  LECTURER: 'lecturer',
  ORGANISER: 'organiser',
  ADMIN: 'admin',
});

export const ROLE_HOME_ROUTE = Object.freeze({
  // Every staff role lands on the unified Dashboard; students still start
  // from the volunteer view where their timetable and applications live.
  [ROLES.ORGANISER]: '/dashboard',
  [ROLES.TUTOR]: '/dashboard',
  [ROLES.STUDENT]: '/volunteer',
  [ROLES.LECTURER]: '/dashboard',
  [ROLES.ADMIN]: '/dashboard',
});
