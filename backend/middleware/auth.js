const getFirebaseAdmin = require('../firebase/admin');
const prisma = require('../prisma/client');
const { normaliseRole } = require('../utils/roles');

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
    console.error('Firebase token verification failed:', error.message);
    if (error.code === 'auth/id-token-expired') {
      return res.status(401).json({ error: 'Firebase ID token has expired' });
    }
    return res.status(401).json({ error: 'Invalid Firebase ID token' });
  }
}

module.exports = authenticateFirebaseToken;
