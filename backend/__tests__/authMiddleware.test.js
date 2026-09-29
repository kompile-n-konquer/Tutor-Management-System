const { authenticateFirebaseToken, verifyFirebaseTokenOnly } = require('../middleware/auth');
const getFirebaseAdmin = require('../firebase/admin');
const prisma = require('../prisma/client');

// Factory mock — the real module must never load (firebase-admin ships ESM-only deps
// like jose that Jest cannot parse), so we replace it with a bare jest.fn().
jest.mock('../firebase/admin', () => jest.fn());
jest.mock('../prisma/client', () => ({
  user: { findUnique: jest.fn() },
}));

describe('authenticateFirebaseToken middleware', () => {
  let req, res, next, verifyIdToken;

  beforeEach(() => {
    jest.clearAllMocks();
    // Keep the expected console.error noise out of the test output.
    jest.spyOn(console, 'error').mockImplementation(() => {});

    verifyIdToken = jest.fn();
    getFirebaseAdmin.mockReturnValue({ getAuth: () => ({ verifyIdToken }) });

    req = { headers: {} };
    res = { status: jest.fn().mockReturnThis(), json: jest.fn() };
    next = jest.fn();
  });

  afterEach(() => {
    console.error.mockRestore();
  });

  test('401s when the Authorization header is missing', async () => {
    await authenticateFirebaseToken(req, res, next);

    expect(res.status).toHaveBeenCalledWith(401);
    expect(res.json).toHaveBeenCalledWith({ error: 'Missing or malformed Authorization header' });
    expect(next).not.toHaveBeenCalled();
  });

  test('401s when the Authorization header is not a Bearer token', async () => {
    req.headers.authorization = 'Basic some-credentials';

    await authenticateFirebaseToken(req, res, next);

    expect(res.status).toHaveBeenCalledWith(401);
    expect(res.json).toHaveBeenCalledWith({ error: 'Missing or malformed Authorization header' });
    expect(next).not.toHaveBeenCalled();
  });

  test('401s when the Bearer token is empty after trimming', async () => {
    req.headers.authorization = 'Bearer    ';

    await authenticateFirebaseToken(req, res, next);

    expect(res.status).toHaveBeenCalledWith(401);
    expect(res.json).toHaveBeenCalledWith({ error: 'Token is empty' });
    expect(next).not.toHaveBeenCalled();
  });

  test('attaches the decoded token to req.user and calls next() for a valid token', async () => {
    req.headers.authorization = 'Bearer valid-token';
    const decodedToken = { uid: 'firebase-uid-1', email: 'tutor@wits.ac.za' };
    verifyIdToken.mockResolvedValue(decodedToken);
    prisma.user.findUnique.mockResolvedValue({
      id: 42,
      email: 'tutor@wits.ac.za',
      role: 'TUTOR',
    });

    await authenticateFirebaseToken(req, res, next);

    expect(verifyIdToken).toHaveBeenCalledWith('valid-token');
    expect(prisma.user.findUnique).toHaveBeenCalledWith({ where: { firebaseUid: 'firebase-uid-1' } });
    expect(req.user).toEqual({
      ...decodedToken,
      id: 42,
      email: 'tutor@wits.ac.za',
      // normaliseRole() uppercases the stored role before attaching it.
      role: 'TUTOR',
    });
    expect(next).toHaveBeenCalledTimes(1);
    expect(next).toHaveBeenCalledWith(); // no error
    expect(res.status).not.toHaveBeenCalled();
  });

  test('401s when no User row exists for the verified Firebase account', async () => {
    req.headers.authorization = 'Bearer valid-token';
    verifyIdToken.mockResolvedValue({ uid: 'ghost-uid', email: 'ghost@wits.ac.za' });
    prisma.user.findUnique.mockResolvedValue(null);

    await authenticateFirebaseToken(req, res, next);

    expect(res.status).toHaveBeenCalledWith(401);
    expect(res.json).toHaveBeenCalledWith({ error: 'User not found' });
    expect(next).not.toHaveBeenCalled();
  });

  test('403s when the stored role is not one of the known roles', async () => {
    req.headers.authorization = 'Bearer valid-token';
    verifyIdToken.mockResolvedValue({ uid: 'firebase-uid-1', email: 'tutor@wits.ac.za' });
    prisma.user.findUnique.mockResolvedValue({
      id: 42,
      email: 'tutor@wits.ac.za',
      role: 'WIZARD',
    });

    await authenticateFirebaseToken(req, res, next);

    expect(res.status).toHaveBeenCalledWith(403);
    expect(res.json).toHaveBeenCalledWith({ error: 'User role is not recognised' });
    expect(next).not.toHaveBeenCalled();
  });

  test('401s when the database lookup itself fails', async () => {
    req.headers.authorization = 'Bearer valid-token';
    verifyIdToken.mockResolvedValue({ uid: 'firebase-uid-1', email: 'tutor@wits.ac.za' });
    prisma.user.findUnique.mockRejectedValue(new Error('Connection lost'));

    await authenticateFirebaseToken(req, res, next);

    expect(res.status).toHaveBeenCalledWith(401);
    expect(res.json).toHaveBeenCalledWith({ error: 'Invalid Firebase ID token' });
    expect(next).not.toHaveBeenCalled();
  });

  test('401s with a specific message when the Firebase ID token has expired', async () => {
    req.headers.authorization = 'Bearer expired-token';
    const expiredError = new Error('Firebase ID token has expired');
    expiredError.code = 'auth/id-token-expired';
    verifyIdToken.mockRejectedValue(expiredError);

    await authenticateFirebaseToken(req, res, next);

    expect(res.status).toHaveBeenCalledWith(401);
    expect(res.json).toHaveBeenCalledWith({ error: 'Firebase ID token has expired' });
    expect(next).not.toHaveBeenCalled();
  });

  test('401s for any other verification failure', async () => {
    req.headers.authorization = 'Bearer forged-token';
    verifyIdToken.mockRejectedValue(new Error('Malformed JWT'));

    await authenticateFirebaseToken(req, res, next);

    expect(res.status).toHaveBeenCalledWith(401);
    expect(res.json).toHaveBeenCalledWith({ error: 'Invalid Firebase ID token' });
    expect(next).not.toHaveBeenCalled();
  });

  test('verifyFirebaseTokenOnly attaches the raw Firebase identity without a database lookup', async () => {
    req.headers.authorization = 'Bearer valid-token';
    verifyIdToken.mockResolvedValue({ uid: 'firebase-uid-1', email: 'newuser@wits.ac.za' });

    await verifyFirebaseTokenOnly(req, res, next);

    expect(prisma.user.findUnique).not.toHaveBeenCalled();
    expect(req.firebaseUser).toEqual({ uid: 'firebase-uid-1', email: 'newuser@wits.ac.za' });
    expect(next).toHaveBeenCalledTimes(1);
    expect(res.status).not.toHaveBeenCalled();
  });

  test('verifyFirebaseTokenOnly 401s on a missing header without calling next()', async () => {
    await verifyFirebaseTokenOnly(req, res, next);

    expect(res.status).toHaveBeenCalledWith(401);
    expect(res.json).toHaveBeenCalledWith({ error: 'Missing or malformed Authorization header' });
    expect(next).not.toHaveBeenCalled();
  });
});
