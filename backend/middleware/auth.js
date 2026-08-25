const getFirebaseAdmin = require('../firebase/admin');

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
module.exports = authenticateFirebaseToken;
