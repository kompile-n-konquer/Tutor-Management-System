const authenticateFirebaseToken = require('../middleware/auth');
const getFirebaseAdmin = require('../firebase/admin');

// Factory mock — the real module must never load (firebase-admin ships ESM-only deps
// like jose that Jest cannot parse), so we replace it with a bare jest.fn().
jest.mock('../firebase/admin', () => jest.fn());

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
    const decodedToken = { user_id: 'firebase-uid-1', email: 'tutor@wits.ac.za' };
    verifyIdToken.mockResolvedValue(decodedToken);

    await authenticateFirebaseToken(req, res, next);

    expect(verifyIdToken).toHaveBeenCalledWith('valid-token');
    expect(req.user).toBe(decodedToken);
    expect(next).toHaveBeenCalledTimes(1);
    expect(next).toHaveBeenCalledWith(); // no error
    expect(res.status).not.toHaveBeenCalled();
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
});
