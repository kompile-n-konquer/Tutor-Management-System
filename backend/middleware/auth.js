const { PrismaClient } = require('@prisma/client');
const getFirebaseAdmin = require('../firebase/admin');

const prisma = new PrismaClient();

async function authenticateFirebaseToken(req, res, next) {
  const authHeader = req.headers.authorization;
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return res.status(401).json({ error: 'Missing or malformed Authorization header' });
  }

  const idToken = authHeader.slice('Bearer '.length).trim();
  if (!idToken) {
    return res.status(401).json({ error: 'Token is empty' });
  }

  try {
    const { getAuth } = getFirebaseAdmin();
    const decodedToken = await getAuth().verifyIdToken(idToken);
    req.user = decodedToken;
    next();
  } catch (error) {
    console.error('Firebase token verification failed:', error.message);
    if (error.code === 'auth/id-token-expired') {
      return res.status(401).json({ error: 'Firebase ID token has expired' });
    }
    return res.status(401).json({ error: 'Invalid Firebase ID token' });
  }
}

// Role guard for routes. Must run after authenticateFirebaseToken, which sets
// req.user (the decoded Firebase token). Looks up the application user record
// and rejects the request unless its role is in the allowed list. The database
// record is attached as req.dbUser for controllers that need it downstream.
function requireRole(...allowedRoles) {
  return async (req, res, next) => {
    try {
      if (!req.user) {
        return res.status(401).json({ error: 'Not authenticated' });
      }

      const user = await prisma.user.findUnique({
        where: { firebaseUid: req.user.uid },
      });

      if (!user) {
        return res.status(403).json({ error: 'User not found in database' });
      }

      if (!allowedRoles.includes(user.role)) {
        return res.status(403).json({ error: 'Forbidden: insufficient role' });
      }

      req.dbUser = user;
      next();
    } catch (error) {
      next(error);
    }
  };
}

module.exports = { authenticateFirebaseToken, requireRole };
