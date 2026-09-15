const getFirebaseAdmin = require('../firebase/admin');
const prisma = require('../prisma/client');
const { normaliseRole } = require('../utils/roles');

// Extracts the Bearer token from the request, verifies it with Firebase and
// returns the decoded token — or null after sending the matching 401 response.
// Shared by both exported middlewares so error shapes stay identical.
async function verifyBearerToken(req, res) {
  const authHeader = req.headers.authorization;
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    res.status(401).json({ error: 'Missing or malformed Authorization header' });
    return null;
  }

  const idToken = authHeader.slice('Bearer '.length).trim();
  if (!idToken) {
    res.status(401).json({ error: 'Token is empty' });
    return null;
  }

  try {
    const { getAuth } = getFirebaseAdmin();
    return await getAuth().verifyIdToken(idToken);
  } catch (error) {
    console.error('Firebase token verification failed:', error.message);
    if (error.code === 'auth/id-token-expired') {
      res.status(401).json({ error: 'Firebase ID token has expired' });
      return null;
    }
    res.status(401).json({ error: 'Invalid Firebase ID token' });
    return null;
  }
}

// Verifies the Firebase ID token WITHOUT requiring a User row to exist yet.
// Used by signup (POST /api/users): the user row is created only after the
// Firebase account exists, so the standard middleware's database lookup can
// never pass. Sets req.firebaseUser to the identity proved by the token.
async function verifyFirebaseTokenOnly(req, res, next) {
  const decodedToken = await verifyBearerToken(req, res);
  if (!decodedToken) {
    return; // verifyBearerToken already sent the 401 response
  }

  req.firebaseUser = { uid: decodedToken.uid, email: decodedToken.email };
  next();
}

async function authenticateFirebaseToken(req, res, next) {
  const decodedToken = await verifyBearerToken(req, res);
  if (!decodedToken) {
    return; // verifyBearerToken already sent the 401 response
  }

  try {
    const firebaseUid = decodedToken.uid;

    const user = await prisma.user.findUnique({ where: { firebaseUid } });
    if (!user) {
      return res.status(401).json({ error: 'User not found' });
    }

    const role = normaliseRole(user.role);
    if (!role) {
      return res.status(403).json({ error: 'User role is not recognised' });
    }

    req.user = {
      ...decodedToken,
      id: user.id,
      email: user.email,
      role,
    };
    next();
  } catch (error) {
    console.error('Failed to authenticate user:', error.message);
    return res.status(401).json({ error: 'Invalid Firebase ID token' });
  }
}

module.exports = { authenticateFirebaseToken, verifyFirebaseTokenOnly };
