const { getAllUsers, createUser, deleteUser } = require('../controllers/auth');
const prisma = require('../prisma/client');
const getFirebaseAdmin = require('../firebase/admin');

jest.mock('../prisma/client', () => ({
  user: { findMany: jest.fn(), findUnique: jest.fn(), create: jest.fn(), update: jest.fn() },
}));
// Factory mock — the real module must never load (firebase-admin ships ESM-only deps
// like jose that Jest cannot parse), so we replace it with a bare jest.fn().
jest.mock('../firebase/admin', () => jest.fn());

describe('auth controller', () => {
  let req, res, next, updateUser;

  beforeEach(() => {
    jest.clearAllMocks();
    req = { body: {}, user: { user_id: 'firebase-uid-1' } };
    res = { json: jest.fn(), status: jest.fn().mockReturnThis(), end: jest.fn() };
    next = jest.fn();

    updateUser = jest.fn();
    getFirebaseAdmin.mockReturnValue({ getAuth: () => ({ updateUser }) });
  });

  describe('getAllUsers', () => {
    test('returns every user', async () => {
      const users = [{ id: 1, firstName: 'Kgaogelo' }, { id: 2, firstName: 'Thabo' }];
      prisma.user.findMany.mockResolvedValue(users);

      await getAllUsers(req, res, next);

      expect(res.json).toHaveBeenCalledWith(users);
      expect(next).not.toHaveBeenCalled();
    });
  });

  describe('createUser', () => {
    test('creates a user with the STUDENT role and returns 201', async () => {
      const created = { id: 3, firstName: 'Lerato', role: 'STUDENT' };
      prisma.user.create.mockResolvedValue(created);
      req.body = { firstName: 'Lerato', lastName: 'Mokoena', email: 'lerato@wits.ac.za', firebaseUid: 'uid-3' };

      await createUser(req, res, next);

      expect(prisma.user.create).toHaveBeenCalledWith({
        data: {
          firstName: 'Lerato',
          lastName: 'Mokoena',
          email: 'lerato@wits.ac.za',
          firebaseUid: 'uid-3',
          role: 'STUDENT',
        },
      });
      expect(res.status).toHaveBeenCalledWith(201);
      expect(res.json).toHaveBeenCalledWith(created);
      expect(next).not.toHaveBeenCalled();
    });

    test.each(['firstName', 'lastName', 'email', 'firebaseUid'])(
      '400s when %s is missing',
      async (missingField) => {
        req.body = { firstName: 'Lerato', lastName: 'Mokoena', email: 'lerato@wits.ac.za', firebaseUid: 'uid-3' };
        delete req.body[missingField];

        await createUser(req, res, next);

        expect(next).toHaveBeenCalledTimes(1);
        expect(next.mock.calls[0][0].statusCode).toBe(400);
        expect(next.mock.calls[0][0].message).toBe('All fields are required. Please provide all fields');
        expect(prisma.user.create).not.toHaveBeenCalled();
      },
    );
  });

  describe('deleteUser', () => {
    test('soft-deletes the user and disables the Firebase account', async () => {
      prisma.user.findUnique.mockResolvedValue({ id: 3, firebaseUid: 'firebase-uid-1', isActive: true });
      prisma.user.update.mockResolvedValue({ id: 3, isActive: false });

      await deleteUser(req, res, next);

      expect(prisma.user.update).toHaveBeenCalledWith({
        where: { firebaseUid: 'firebase-uid-1' },
        data: { isActive: false },
      });
      expect(updateUser).toHaveBeenCalledWith('firebase-uid-1', { disabled: true });
      expect(res.status).toHaveBeenCalledWith(204);
      expect(res.end).toHaveBeenCalled();
      expect(next).not.toHaveBeenCalled();
    });

    test('404s when the user does not exist', async () => {
      prisma.user.findUnique.mockResolvedValue(null);

      await deleteUser(req, res, next);

      expect(next.mock.calls[0][0].statusCode).toBe(404);
      expect(next.mock.calls[0][0].message).toBe('User not found. Please check if the user exists');
    });

    test('400s when the user was already deleted', async () => {
      prisma.user.findUnique.mockResolvedValue({ id: 3, isActive: false });

      await deleteUser(req, res, next);

      expect(next.mock.calls[0][0].statusCode).toBe(400);
      expect(next.mock.calls[0][0].message).toBe('User already deleted');
      expect(prisma.user.update).not.toHaveBeenCalled();
      expect(updateUser).not.toHaveBeenCalled();
    });
  });
});
