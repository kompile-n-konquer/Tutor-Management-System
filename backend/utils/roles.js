const ROLES = Object.freeze({
  STUDENT: 'STUDENT',
  TUTOR: 'TUTOR',
  LECTURER: 'LECTURER',
  ORGANISER: 'ORGANISER',
  ADMIN: 'ADMIN',
});

const ALL_ROLES = Object.values(ROLES);

function normaliseRole(role) {
  const normalized = String(role).toUpperCase().trim();
  if (!ALL_ROLES.includes(normalized)) {
    return null;
  }
  return normalized;
}

function requireRole(...allowedRoles) {
  const normalizedAllowed = allowedRoles.map(normaliseRole).filter(Boolean);

  return (req, res, next) => {
    const userRole = normaliseRole(req.user?.role);

    if (!userRole || !normalizedAllowed.includes(userRole)) {
      const error = new Error('You do not have permission to access this resource');
      error.statusCode = 403;
      return next(error);
    }

    next();
  };
}

module.exports = { ROLES, normaliseRole, requireRole };
