const path = require('path');
const { initializeApp, getApps, cert, applicationDefault } = require('firebase-admin/app');
const { getAuth } = require('firebase-admin/auth');
// Initialize Firebase Admin SDK.
// Option 1: Set GOOGLE_APPLICATION_CREDENTIALS to the path of your service account JSON file.
// Option 2: Set FIREBASE_PROJECT_ID, FIREBASE_CLIENT_EMAIL, and FIREBASE_PRIVATE_KEY env vars.
function getFirebaseAdmin() {
  if (getApps().length > 0) {
    return { getAuth };
  }
  const projectId = process.env.FIREBASE_PROJECT_ID;
  const clientEmail = process.env.FIREBASE_CLIENT_EMAIL;
  const privateKey = process.env.FIREBASE_PRIVATE_KEY
    ? process.env.FIREBASE_PRIVATE_KEY.replace(/\\n/g, '\n')
    : undefined;
  if (projectId && clientEmail && privateKey) {
    initializeApp({
      credential: cert({
        projectId,
        clientEmail,
        privateKey,
      }),
    });
  } else if (process.env.GOOGLE_APPLICATION_CREDENTIALS) {
    // Resolve relative paths against the backend directory
    const credPath = path.isAbsolute(process.env.GOOGLE_APPLICATION_CREDENTIALS)
      ? process.env.GOOGLE_APPLICATION_CREDENTIALS
      : path.resolve(__dirname, '..', process.env.GOOGLE_APPLICATION_CREDENTIALS);
    const serviceAccount = require(credPath);
    initializeApp({
      credential: cert(serviceAccount),
    });
  } else {
    throw new Error(
      'Firebase Admin SDK is not configured. ' +
        'Set FIREBASE_PROJECT_ID + FIREBASE_CLIENT_EMAIL + FIREBASE_PRIVATE_KEY, ' +
        'or set GOOGLE_APPLICATION_CREDENTIALS to the path of your service account JSON file.',
    );
  }
  return { getAuth };
}
module.exports = getFirebaseAdmin;
