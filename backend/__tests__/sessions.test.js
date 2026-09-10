const {
  getUnassignedSessions,
  getMySessions,
  excuseSession,
  volunteerForSession,
} = require('../controllers/sessions');
const prisma = require('../prisma/client');

jest.mock('../prisma/client', () => ({
  user: { findUnique: jest.fn() },
  session: { findMany: jest.fn(), findUnique: jest.fn(), update: jest.fn() },
  sessionVolunteer: { create: jest.fn() },
  $transaction: jest.fn(),
}));

// Asserts next() received a single http-style error with the expected code + message.
const expectHttpError = (next, statusCode, message) => {
  expect(next).toHaveBeenCalledTimes(1);
  const error = next.mock.calls[0][0];
  expect(error.statusCode).toBe(statusCode);
  expect(error.message).toBe(message);
};

const makeTutorUser = (tutorId) => ({
  id: 5,
  role: 'TUTOR',
  tutor: tutorId === null ? null : { id: tutorId },
});

describe('sessions controller — excuse + volunteer feature (#37)', () => {
  let req, res, next, tx;

  beforeEach(() => {
    jest.clearAllMocks();
    req = { params: {}, body: {}, user: { user_id: 'firebase-uid-1' } };
    res = { json: jest.fn(), status: jest.fn().mockReturnThis() };
    next = jest.fn();

    // The interactive transaction receives a tx client; default to a happy path.
    tx = {
      session: { findUnique: jest.fn(), update: jest.fn() },
      sessionVolunteer: { create: jest.fn() },
    };
    prisma.$transaction.mockImplementation(async (callback) => callback(tx));
  });

  describe('getUnassignedSessions', () => {
    test('returns only UNASSIGNED sessions ordered by date', async () => {
      const sessions = [
        { id: 1, status: 'UNASSIGNED' },
        { id: 2, status: 'UNASSIGNED' },
      ];
      prisma.session.findMany.mockResolvedValue(sessions);

      await getUnassignedSessions(req, res, next);

      expect(prisma.session.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { status: 'UNASSIGNED' },
          orderBy: [{ date: 'asc' }],
        }),
      );
      expect(res.json).toHaveBeenCalledWith(sessions);
      expect(next).not.toHaveBeenCalled();
    });

    test('forwards database failures to the global error handler', async () => {
      const dbError = new Error('ECONNREFUSED');
      prisma.session.findMany.mockRejectedValue(dbError);

      await getUnassignedSessions(req, res, next);

      expect(next).toHaveBeenCalledWith(dbError);
    });
  });

  describe('getMySessions', () => {
    test('returns the signed-in tutor sessions', async () => {
      prisma.user.findUnique.mockResolvedValue(makeTutorUser(9));
      const sessions = [{ id: 1 }, { id: 2 }];
      prisma.session.findMany.mockResolvedValue(sessions);

      await getMySessions(req, res, next);

      expect(prisma.session.findMany).toHaveBeenCalledWith(
        expect.objectContaining({ where: { assignment: { tutorId: 9 } } }),
      );
      expect(res.json).toHaveBeenCalledWith(sessions);
      expect(next).not.toHaveBeenCalled();
    });

    test('404s when the requesting user does not exist', async () => {
      prisma.user.findUnique.mockResolvedValue(null);

      await getMySessions(req, res, next);

      expectHttpError(next, 404, 'User not found. Please check if the user exists');
    });

    test('403s when the requesting user is not a tutor', async () => {
      prisma.user.findUnique.mockResolvedValue(makeTutorUser(null));

      await getMySessions(req, res, next);

      expectHttpError(next, 403, 'Only tutors can view their assigned sessions');
    });
  });

  describe('excuseSession', () => {
    const makeSession = (overrides = {}) => ({
      id: 1,
      status: 'SCHEDULED',
      assignment: { tutorId: 9 },
      ...overrides,
    });

    beforeEach(() => {
      prisma.user.findUnique.mockResolvedValue(makeTutorUser(9));
      prisma.session.findUnique.mockResolvedValue(makeSession());
    });

    test('sets the session back to UNASSIGNED with the trimmed excuse reason', async () => {
      const updated = { id: 1, status: 'UNASSIGNED' };
      prisma.session.update.mockResolvedValue(updated);
      req.params.id = '1';
      req.body = { reason: '  Medical appointment  ' };

      await excuseSession(req, res, next);

      expect(prisma.session.update).toHaveBeenCalledWith({
        where: { id: 1 },
        data: { status: 'UNASSIGNED', excuseReason: 'Medical appointment' },
      });
      expect(res.json).toHaveBeenCalledWith(updated);
      expect(next).not.toHaveBeenCalled();
    });

    test('400s on a non-integer session id', async () => {
      req.params.id = 'not-a-number';
      req.body = { reason: 'Sick' };

      await excuseSession(req, res, next);

      expectHttpError(next, 400, 'Invalid session id');
    });

    test('400s when the body is missing entirely', async () => {
      req.params.id = '1';
      delete req.body;

      await excuseSession(req, res, next);

      expectHttpError(next, 400, 'An excuse reason is required');
    });

    test('400s when the reason is only whitespace', async () => {
      req.params.id = '1';
      req.body = { reason: '   ' };

      await excuseSession(req, res, next);

      expectHttpError(next, 400, 'An excuse reason is required');
    });

    test('404s when the requesting user does not exist', async () => {
      prisma.user.findUnique.mockResolvedValue(null);
      req.params.id = '1';
      req.body = { reason: 'Sick' };

      await excuseSession(req, res, next);

      expectHttpError(next, 404, 'User not found. Please check if the user exists');
    });

    test('403s when the requesting user is not a tutor', async () => {
      prisma.user.findUnique.mockResolvedValue(makeTutorUser(null));
      req.params.id = '1';
      req.body = { reason: 'Sick' };

      await excuseSession(req, res, next);

      expectHttpError(next, 403, 'Only tutors can excuse themselves from a session');
    });

    test('404s when the session does not exist', async () => {
      prisma.session.findUnique.mockResolvedValue(null);
      req.params.id = '99';
      req.body = { reason: 'Sick' };

      await excuseSession(req, res, next);

      expectHttpError(next, 404, 'Session not found. Please check if the session exists');
    });

    test('409s when the session is not SCHEDULED anymore', async () => {
      prisma.session.findUnique.mockResolvedValue(makeSession({ status: 'UNASSIGNED' }));
      req.params.id = '1';
      req.body = { reason: 'Sick' };

      await excuseSession(req, res, next);

      expectHttpError(next, 409, 'This session has already been excused or has a pending volunteer');
    });

    test('403s when the session belongs to a different tutor', async () => {
      prisma.session.findUnique.mockResolvedValue(makeSession({ assignment: { tutorId: 777 } }));
      req.params.id = '1';
      req.body = { reason: 'Sick' };

      await excuseSession(req, res, next);

      expectHttpError(next, 403, 'You can only excuse yourself from your own sessions');
    });
  });

  describe('volunteerForSession', () => {
    const makeStudentUser = () => ({ id: 12, role: 'STUDENT' });

    beforeEach(() => {
      prisma.user.findUnique.mockResolvedValue(makeStudentUser());
      tx.session.findUnique.mockResolvedValue({ id: 1, status: 'UNASSIGNED' });
      tx.sessionVolunteer.create.mockResolvedValue({ id: 3, sessionId: 1, userId: 12, status: 'PENDING' });
    });

    test('creates a PENDING volunteer assignment and flips the session status atomically', async () => {
      req.params.id = '1';

      await volunteerForSession(req, res, next);

      expect(prisma.$transaction).toHaveBeenCalledTimes(1);
      expect(tx.sessionVolunteer.create).toHaveBeenCalledWith({
        data: { sessionId: 1, userId: 12, status: 'PENDING' },
      });
      expect(tx.session.update).toHaveBeenCalledWith({
        where: { id: 1 },
        data: { status: 'PENDING' },
      });
      expect(res.status).toHaveBeenCalledWith(201);
      expect(res.json).toHaveBeenCalledWith({ id: 3, sessionId: 1, userId: 12, status: 'PENDING' });
      expect(next).not.toHaveBeenCalled();
    });

    test('400s on a non-integer session id', async () => {
      req.params.id = '1.5';

      await volunteerForSession(req, res, next);

      expectHttpError(next, 400, 'Invalid session id');
    });

    test('404s when the requesting user does not exist', async () => {
      prisma.user.findUnique.mockResolvedValue(null);
      req.params.id = '1';

      await volunteerForSession(req, res, next);

      expectHttpError(next, 404, 'User not found. Please check if the user exists');
    });

    test('403s when the requesting user is not a student', async () => {
      prisma.user.findUnique.mockResolvedValue({ id: 12, role: 'TUTOR' });
      req.params.id = '1';

      await volunteerForSession(req, res, next);

      expectHttpError(next, 403, 'Only students can volunteer for unassigned sessions');
    });

    test('404s when the session does not exist inside the transaction', async () => {
      tx.session.findUnique.mockResolvedValue(null);
      req.params.id = '1';

      await volunteerForSession(req, res, next);

      expectHttpError(next, 404, 'Session not found. Please check if the session exists');
    });

    test('409s when the session is no longer UNASSIGNED', async () => {
      tx.session.findUnique.mockResolvedValue({ id: 1, status: 'PENDING' });
      req.params.id = '1';

      await volunteerForSession(req, res, next);

      expectHttpError(next, 409, 'This session is no longer available for volunteering');
    });

    test('409s on the P2002 unique-constraint race (another student volunteered first)', async () => {
      const raceError = new Error('Unique constraint failed on the fields: (`sessionId`)');
      raceError.code = 'P2002';
      tx.sessionVolunteer.create.mockRejectedValue(raceError);
      req.params.id = '1';

      await volunteerForSession(req, res, next);

      expectHttpError(next, 409, 'Another student has already volunteered for this session');
    });

    test('rethrows unexpected transaction failures for the global error handler', async () => {
      const dbError = new Error('Transaction failed');
      tx.session.update.mockRejectedValue(dbError);
      req.params.id = '1';

      await volunteerForSession(req, res, next);

      expect(next).toHaveBeenCalledWith(dbError);
      expect(next.mock.calls[0][0].statusCode).toBeUndefined();
    });
  });
});
