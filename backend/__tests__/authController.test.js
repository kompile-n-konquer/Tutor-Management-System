// Mock the Prisma client before requiring the controller
jest.mock('../prisma/client', () => ({
  user: { findMany: jest.fn(), findUnique: jest.fn(), create: jest.fn(), update: jest.fn() },
}));

// Factory mock — the real module must never load (firebase-admin ships ESM-only
// deps like jose that Jest cannot parse), so we replace it with a bare jest.fn().
jest.mock('../firebase/admin', () => jest.fn());

const prisma = require('../prisma/client');
const { getAllUsers, getUser, getUserMe, createUser, updateUser, verifyRole } = require('../controllers/auth');

// catchAsync does not `return` the inner promise — flushMicrotasks waits
// for the background async work to settle before assertions run.
function flushMicrotasks() {
  return new Promise((resolve) => setImmediate(resolve));
}

function mockRes() {
  const res = {};
  res.status = jest.fn().mockReturnValue(res);
  res.json = jest.fn().mockReturnValue(res);
  res.end = jest.fn().mockReturnValue(res);
  return res;
}

beforeEach(() => {
  jest.clearAllMocks();
});

describe('getAllUsers', () => {
  test('returns users without the firebaseUid column', async () => {
    prisma.user.findMany.mockResolvedValue([{ id: 1, firstName: 'A', email: 'a@wits.ac.za' }]);

    const res = mockRes();
    const next = jest.fn();

    await getAllUsers({}, res, next);
    await flushMicrotasks();

    expect(prisma.user.findMany).toHaveBeenCalledWith(
      expect.objectContaining({ select: expect.not.objectContaining({ firebaseUid: true }) }),
    );
    expect(res.json).toHaveBeenCalledTimes(1);
    expect(next).not.toHaveBeenCalled();
  });
});

describe('getUser', () => {
  const studentReq = (firebaseUid) => ({
    params: { firebaseUid },
    user: { user_id: 'student-uid', role: 'STUDENT' },
  });

  test('allows a user to fetch their own record', async () => {
    prisma.user.findUnique.mockResolvedValue({ id: 1, firstName: 'A', email: 'a@wits.ac.za' });

    const res = mockRes();
    const next = jest.fn();

    await getUser(studentReq('student-uid'), res, next);
    await flushMicrotasks();

    expect(res.status).toHaveBeenCalledWith(200);
    expect(next).not.toHaveBeenCalled();
  });

  test('blocks a student from fetching someone else\u0027s record', async () => {
    const res = mockRes();
    const next = jest.fn();

    await getUser(studentReq('someone-else-uid'), res, next);
    await flushMicrotasks();

    expect(next).toHaveBeenCalledWith(expect.objectContaining({ statusCode: 403 }));
    expect(prisma.user.findUnique).not.toHaveBeenCalled();
  });

  test('allows an organiser to fetch any record', async () => {
    prisma.user.findUnique.mockResolvedValue({ id: 2, firstName: 'B', email: 'b@wits.ac.za' });

    const res = mockRes();
    const next = jest.fn();

    await getUser(
      { params: { firebaseUid: 'someone-else-uid' }, user: { user_id: 'organiser-uid', role: 'ORGANISER' } },
      res,
      next,
    );
    await flushMicrotasks();

    expect(res.status).toHaveBeenCalledWith(200);
    expect(next).not.toHaveBeenCalled();
  });

  test('returns 404 when the user does not exist', async () => {
    prisma.user.findUnique.mockResolvedValue(null);

    const res = mockRes();
    const next = jest.fn();

    await getUser(studentReq('student-uid'), res, next);
    await flushMicrotasks();

    expect(next).toHaveBeenCalledWith(expect.objectContaining({ statusCode: 404 }));
  });
});

describe('getUserMe', () => {
  test('returns the profile without the firebaseUid column', async () => {
    prisma.user.findUnique.mockResolvedValue({ id: 1, firstName: 'A', role: 'STUDENT' });

    const res = mockRes();
    const next = jest.fn();

    await getUserMe({ user: { id: 1 } }, res, next);
    await flushMicrotasks();

    expect(prisma.user.findUnique).toHaveBeenCalledWith(
      expect.objectContaining({ select: expect.not.objectContaining({ firebaseUid: true }) }),
    );
    expect(res.json).toHaveBeenCalledWith(
      expect.not.objectContaining({ firebaseUid: expect.anything() }),
    );
  });
});

describe('createUser', () => {
  const body = {
    firstName: 'New',
    lastName: 'Student',
    email: 'new.student@wits.ac.za',
    firebaseUid: 'new-uid',
  };

  test('creates the user when the token matches the identity being created', async () => {
    prisma.user.create.mockResolvedValue({ id: 7, ...body, role: 'STUDENT' });

    const req = { body, firebaseUser: { uid: 'new-uid', email: 'new.student@wits.ac.za' } };
    const res = mockRes();
    const next = jest.fn();

    await createUser(req, res, next);
    await flushMicrotasks();

    expect(prisma.user.create).toHaveBeenCalledTimes(1);
    expect(res.status).toHaveBeenCalledWith(201);
    expect(next).not.toHaveBeenCalled();
  });

  test('rejects a token that belongs to a different Firebase account', async () => {
    const req = { body, firebaseUser: { uid: 'attacker-uid', email: 'attacker@wits.ac.za' } };
    const res = mockRes();
    const next = jest.fn();

    await createUser(req, res, next);
    await flushMicrotasks();

    expect(next).toHaveBeenCalledWith(expect.objectContaining({ statusCode: 403 }));
    expect(prisma.user.create).not.toHaveBeenCalled();
  });

  test('rejects an email that does not match the Firebase account', async () => {
    const req = { body, firebaseUser: { uid: 'new-uid', email: 'someone.else@wits.ac.za' } };
    const res = mockRes();
    const next = jest.fn();

    await createUser(req, res, next);
    await flushMicrotasks();

    expect(next).toHaveBeenCalledWith(expect.objectContaining({ statusCode: 403 }));
    expect(prisma.user.create).not.toHaveBeenCalled();
  });

  test('returns 409 when the email or uid is already registered', async () => {
    const prismaError = new Error('Unique constraint failed');
    prismaError.code = 'P2002';
    prisma.user.create.mockRejectedValue(prismaError);

    const req = { body, firebaseUser: { uid: 'new-uid', email: 'new.student@wits.ac.za' } };
    const res = mockRes();
    const next = jest.fn();

    await createUser(req, res, next);
    await flushMicrotasks();

    expect(next).toHaveBeenCalledWith(expect.objectContaining({ statusCode: 409 }));
  });
});

describe('getUserMe missing profile', () => {
  test('returns 404 when the profile row does not exist', async () => {
    prisma.user.findUnique.mockResolvedValue(null);

    const res = mockRes();
    const next = jest.fn();

    await getUserMe({ user: { id: 1 } }, res, next);
    await flushMicrotasks();

    expect(next).toHaveBeenCalledWith(expect.objectContaining({ statusCode: 404 }));
    expect(res.json).not.toHaveBeenCalled();
  });
});

describe('createUser unexpected failures', () => {
  test('rethrows database errors that are not unique-constraint violations', async () => {
    const dbError = new Error('connection lost');
    dbError.code = 'ECONNRESET';
    prisma.user.create.mockRejectedValue(dbError);

    const req = {
      body: {
        firstName: 'New',
        lastName: 'Student',
        email: 'new.student@wits.ac.za',
        firebaseUid: 'new-uid',
      },
      firebaseUser: { uid: 'new-uid', email: 'new.student@wits.ac.za' },
    };
    const res = mockRes();
    const next = jest.fn();

    await createUser(req, res, next);
    await flushMicrotasks();

    // catchAsync forwards the rethrown error to the global error handler
    expect(next).toHaveBeenCalledWith(dbError);
    expect(res.json).not.toHaveBeenCalled();
  });
});

describe('updateUser', () => {
  const req = (body) => ({ user: { user_id: 'uid-123' }, body });

  test('returns 404 when the profile row is missing', async () => {
    prisma.user.findUnique.mockResolvedValue(null);

    const next = jest.fn();

    await updateUser(req({ firstName: 'Ann' }), mockRes(), next);
    await flushMicrotasks();

    expect(next).toHaveBeenCalledWith(expect.objectContaining({ statusCode: 404 }));
    expect(prisma.user.update).not.toHaveBeenCalled();
  });

  test('rejects empty names and invalid years of study', async () => {
    prisma.user.findUnique.mockResolvedValue({ id: 1 });

    let next = jest.fn();
    await updateUser(req({ firstName: '   ' }), mockRes(), next);
    await flushMicrotasks();
    expect(next).toHaveBeenCalledWith(expect.objectContaining({ statusCode: 400 }));

    next = jest.fn();
    await updateUser(req({ lastName: '' }), mockRes(), next);
    await flushMicrotasks();
    expect(next).toHaveBeenCalledWith(expect.objectContaining({ statusCode: 400 }));

    next = jest.fn();
    await updateUser(req({ yearOfStudy: '1st year' }), mockRes(), next);
    await flushMicrotasks();
    expect(next).toHaveBeenCalledWith(expect.objectContaining({ statusCode: 400 }));
    expect(prisma.user.update).not.toHaveBeenCalled();
  });

  test('trims names, clears empty optional fields and returns the updated profile', async () => {
    prisma.user.findUnique.mockResolvedValue({ id: 1 });
    prisma.user.update.mockResolvedValue({ id: 1, firstName: 'Ann', lastName: 'Lee' });

    const res = mockRes();
    const next = jest.fn();

    await updateUser(
      req({ firstName: '  Ann ', lastName: ' Lee ', phoneNumber: '', yearOfStudy: null }),
      res,
      next,
    );
    await flushMicrotasks();

    expect(prisma.user.update).toHaveBeenCalledWith({
      where: { firebaseUid: 'uid-123' },
      data: { firstName: 'Ann', lastName: 'Lee', phoneNumber: null, yearOfStudy: null },
      select: expect.not.objectContaining({ firebaseUid: true }),
    });
    expect(res.status).toHaveBeenCalledWith(200);
    expect(res.json).toHaveBeenCalledWith({ id: 1, firstName: 'Ann', lastName: 'Lee' });
  });

  test('sends only the provided fields', async () => {
    prisma.user.findUnique.mockResolvedValue({ id: 1 });
    prisma.user.update.mockResolvedValue({ id: 1, phoneNumber: '0821234567', yearOfStudy: 'honours' });

    const res = mockRes();
    const next = jest.fn();

    await updateUser(req({ phoneNumber: '0821234567', yearOfStudy: 'honours' }), res, next);
    await flushMicrotasks();

    expect(prisma.user.update).toHaveBeenCalledWith({
      where: { firebaseUid: 'uid-123' },
      data: { phoneNumber: '0821234567', yearOfStudy: 'honours' },
      select: expect.any(Object),
    });
    expect(next).not.toHaveBeenCalled();
  });
});

describe('verifyRole', () => {
  test('allows when the caller role is in the requested list', async () => {
    const res = mockRes();
    const next = jest.fn();

    await verifyRole(
      { user: { role: 'ORGANISER' }, query: { roles: ' tutor, organiser ,' } },
      res,
      next,
    );
    await flushMicrotasks();

    expect(res.json).toHaveBeenCalledWith({ role: 'ORGANISER', allowed: true });
    expect(next).not.toHaveBeenCalled();
  });

  test('rejects when the role is not in the requested list or the list is empty', async () => {
    let next = jest.fn();
    await verifyRole({ user: { role: 'TUTOR' }, query: { roles: 'admin' } }, mockRes(), next);
    await flushMicrotasks();
    expect(next).toHaveBeenCalledWith(expect.objectContaining({ statusCode: 403 }));

    next = jest.fn();
    await verifyRole({ user: { role: 'TUTOR' }, query: {} }, mockRes(), next);
    await flushMicrotasks();
    expect(next).toHaveBeenCalledWith(expect.objectContaining({ statusCode: 403 }));
  });
});
