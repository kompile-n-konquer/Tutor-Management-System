export const ROLES = Object.freeze({
  STUDENT: 'student',
  TUTOR: 'tutor',
  LECTURER: 'lecturer',
  ORGANISER: 'organiser',
  ADMIN: 'admin',
});

export const ROLE_HOME_ROUTE = Object.freeze({
  [ROLES.ORGANISER]: '/organiser',
  [ROLES.TUTOR]: '/tutor-dashboard',
  [ROLES.STUDENT]: '/volunteer',
  [ROLES.LECTURER]: '/lecturer-view',
  [ROLES.ADMIN]: '/admin-view',
});
