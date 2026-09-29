// Mock the Prisma client before requiring the controller
jest.mock('../prisma/client', () => {
  const mockTx = {
    timesheetEntry: { findFirst: jest.fn(), findMany: jest.fn(), update: jest.fn() },
    timesheet: { findFirst: jest.fn(), create: jest.fn(), update: jest.fn() },
    swapRequest: { update: jest.fn() },
  };

  return {
    user: { findUnique: jest.fn() },
    timesheetEntry: { findMany: jest.fn(), findFirst: jest.fn(), update: jest.fn() },
    timesheet: { findFirst: jest.fn(), create: jest.fn(), update: jest.fn() },
    tutorAssignment: { findFirst: jest.fn(), findMany: jest.fn() },
    availability: { findMany: jest.fn() },
    busyBlock: { findMany: jest.fn() },
    systemSetting: { findUnique: jest.fn() },
    swapRequest: {
      findFirst: jest.fn(),
      findUnique: jest.fn(),
      findMany: jest.fn(),
      create: jest.fn(),
      update: jest.fn(),
    },
    $transaction: jest.fn((fn) => fn(mockTx)),
    __tx: mockTx, // expose for test assertions
  };
});

// Email notifications are fire-and-forget: mock the notifier so tests assert
// it was invoked without hitting Resend or the EmailLog table.
jest.mock('../email/notifier', () => ({
  notifySwapRequested: jest.fn().mockResolvedValue({ sent: true, skipped: false }),
  notifySwapResponded: jest.fn().mockResolvedValue({ sent: true, skipped: false }),
  notifySwapReviewed: jest.fn().mockResolvedValue([{ sent: true, skipped: false }]),
}));

const prisma = require('../prisma/client');
const {
  notifySwapRequested,
  notifySwapResponded,
  notifySwapReviewed,
} = require('../email/notifier');
const {
  getMySessions,
  getCandidates,
  getSwaps,
  createSwap,
  acceptSwap,
  declineSwap,
  cancelSwap,
  approveSwap,
  rejectSwap,
} = require('../controllers/swaps');

// catchAsync does not `return` the inner promise, so the wrapped handler
// resolves to `undefined` immediately while the inner async work keeps
// running on the microtask queue. flushMicrotasks waits for all pending
// microtasks to settle before assertions run.
function flushMicrotasks() {
  return new Promise((resolve) => setImmediate(resolve));
}

// ── Fixtures ────────────────────────────────────────────────────────────

const REQUESTER = {
  id: 10,
  role: 'TUTOR',
  isActive: true,
  firstName: 'Alice',
  lastName: 'Anderson',
  email: 'alice@wits.ac.za',
  firebaseUid: 'uid-alice',
};

const RECIPIENT = {
  id: 20,
  role: 'TUTOR',
  isActive: true,
  firstName: 'Bob',
  lastName: 'Banda',
  email: 'bob@wits.ac.za',
  firebaseUid: 'uid-bob',
};

const ORGANISER = {
  id: 99,
  role: 'ORGANISER',
  isActive: true,
  firstName: 'Olga',
  lastName: 'Organiser',
  email: 'olga@wits.ac.za',
  firebaseUid: 'uid-olga',
};

// 2026-10-05 is a Monday, which the schema numbers as dayOfWeek 0
const EVENT = {
  id: 100,
  courseId: 5,
  date: new Date('2026-10-05T00:00:00.000Z'),
  description: 'tutoring',
  course: {
    id: 5,
    courseCode: 'COMS3000',
    courseName: 'Algorithms',
    userId: 1,
    slots: [
      { dayOfWeek: 0, timeSlotId: 7, timeSlot: { id: 7, startMinute: 480, endMinute: 570 } },
    ],
  },
};

const OWN_ENTRY = {
  id: 500,
  timesheetId: 50,
  eventId: EVENT.id,
  status: 'PENDING',
  event: EVENT,
};

const PENDING_SWAP = {
  id: 1,
  requesterId: REQUESTER.id,
  recipientId: RECIPIENT.id,
  requesterEventId: EVENT.id,
  recipientEventId: null,
  status: 'PENDING',
  reason: null,
  requestedAt: new Date('2026-09-27T08:00:00.000Z'),
  respondedAt: null,
  reviewedAt: null,
  rejectionReason: null,
  requester: REQUESTER,
  recipient: RECIPIENT,
  requesterEvent: EVENT,
  recipientEvent: null,
};

// ── Helpers ─────────────────────────────────────────────────────────────

function mockReq(overrides = {}) {
  return {
    body: {},
    query: {},
    params: {},
    ...overrides,
  };
}

function mockRes() {
  const res = {};
  res.status = jest.fn().mockReturnValue(res);
  res.json = jest.fn().mockReturnValue(res);
  res.end = jest.fn().mockReturnValue(res);
  return res;
}

// Stubs every read validateSwapSide performs so a tutor comes out eligible:
// allocated to the course, availability covering the slot, no busy blocks, no
// other claims, and no hours cap configured. TimesheetEntry.findFirst is NOT
// stubbed here — callers queue it explicitly with claimLookupSequence(),
// because the same mock serves the own-claim lookups and the validator's
// existing-claim check in a strict call order.
function stubEligibleSide() {
  prisma.tutorAssignment.findFirst.mockResolvedValue({ id: 3, userId: 20, courseId: 5 });
  prisma.availability.findMany.mockResolvedValue([{ dayOfWeek: 0, timeSlotId: 7 }]);
  prisma.busyBlock.findMany.mockResolvedValue([]);
  prisma.timesheetEntry.findMany.mockResolvedValue([]);
  prisma.systemSetting.findUnique.mockResolvedValue(null);
}

// Queues the values prisma.timesheetEntry.findFirst must return in call order:
// the own-claim lookup(s) come first, the validator's existing-claim checks in
// between. Any further call falls back to null.
function claimLookupSequence(...values) {
  prisma.timesheetEntry.findFirst.mockReset();
  values.forEach((value) => prisma.timesheetEntry.findFirst.mockResolvedValueOnce(value));
  prisma.timesheetEntry.findFirst.mockResolvedValue(null);
}

beforeEach(() => {
  jest.clearAllMocks();
});

// ════════════════════════════════════════════════════════════════════════
// getMySessions
// ════════════════════════════════════════════════════════════════════════
describe('getMySessions', () => {
  test('returns 403 for non-tutors', async () => {
    prisma.user.findUnique.mockResolvedValue(ORGANISER);

    const req = mockReq({ user: { user_id: ORGANISER.firebaseUid } });
    const res = mockRes();
    const next = jest.fn();

    await getMySessions(req, res, next);
    await flushMicrotasks();

    expect(next).toHaveBeenCalledWith(expect.objectContaining({ statusCode: 403 }));
  });

  test('lists the tutor swappable (pending claimed) sessions', async () => {
    prisma.user.findUnique.mockResolvedValue(REQUESTER);
    prisma.timesheetEntry.findMany.mockResolvedValue([OWN_ENTRY]);

    const req = mockReq({ user: { user_id: REQUESTER.firebaseUid } });
    const res = mockRes();
    const next = jest.fn();

    await getMySessions(req, res, next);
    await flushMicrotasks();

    expect(prisma.timesheetEntry.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({ status: 'PENDING' }),
      })
    );
    expect(res.json).toHaveBeenCalledWith([
      expect.objectContaining({
        entryId: 500,
        eventId: 100,
        courseCode: 'COMS3000',
        duration: 2,
        slots: [{ dayOfWeek: 0, timeSlotId: 7, startMinute: 480, endMinute: 570 }],
      }),
    ]);
    expect(next).not.toHaveBeenCalled();
  });
});

// ════════════════════════════════════════════════════════════════════════
// getCandidates
// ════════════════════════════════════════════════════════════════════════
describe('getCandidates', () => {
  test('returns 404 when the session is not one of the tutor claimed sessions', async () => {
    prisma.user.findUnique.mockResolvedValue(REQUESTER);
    prisma.timesheetEntry.findFirst.mockResolvedValue(null);

    const req = mockReq({ user: { user_id: REQUESTER.firebaseUid }, params: { eventId: '999' } });
    const res = mockRes();
    const next = jest.fn();

    await getCandidates(req, res, next);
    await flushMicrotasks();

    expect(next).toHaveBeenCalledWith(
      expect.objectContaining({ statusCode: 404, message: 'Session not found among your claimed sessions' })
    );
  });

  test('returns 400 when eventId is not a valid integer', async () => {
    prisma.user.findUnique.mockResolvedValue(REQUESTER);

    const req = mockReq({ user: { user_id: REQUESTER.firebaseUid }, params: { eventId: 'abc' } });
    const res = mockRes();
    const next = jest.fn();

    await getCandidates(req, res, next);
    await flushMicrotasks();

    expect(next).toHaveBeenCalledWith(expect.objectContaining({ statusCode: 400 }));
    expect(prisma.tutorAssignment.findMany).not.toHaveBeenCalled();
  });

  test('lists tutors allocated to the course with their constraint verdict', async () => {
    prisma.user.findUnique.mockResolvedValue(REQUESTER);
    claimLookupSequence(OWN_ENTRY); // own claim lookup, then the validator's claim check
    prisma.tutorAssignment.findMany.mockResolvedValue([{ id: 3, user: RECIPIENT }]);
    stubEligibleSide();
    prisma.timesheetEntry.findMany.mockResolvedValue([]); // the candidate has no swappable sessions

    const req = mockReq({ user: { user_id: REQUESTER.firebaseUid }, params: { eventId: '100' } });
    const res = mockRes();
    const next = jest.fn();

    await getCandidates(req, res, next);
    await flushMicrotasks();

    expect(prisma.tutorAssignment.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({ courseId: 5, userId: { not: REQUESTER.id } }),
      })
    );
    expect(res.json).toHaveBeenCalledWith(
      expect.objectContaining({
        session: expect.objectContaining({ eventId: 100, courseCode: 'COMS3000' }),
        candidates: [
          expect.objectContaining({
            userId: RECIPIENT.id,
            name: 'Bob Banda',
            eligible: true,
            reasons: [],
            sessions: [],
          }),
        ],
      })
    );
    expect(next).not.toHaveBeenCalled();
  });
});

// ════════════════════════════════════════════════════════════════════════
// createSwap
// ════════════════════════════════════════════════════════════════════════
describe('createSwap', () => {
  test('returns 400 when required ids are missing or invalid', async () => {
    prisma.user.findUnique.mockResolvedValue(REQUESTER);

    const req = mockReq({ user: { user_id: REQUESTER.firebaseUid }, body: { recipientId: 'x', requesterEventId: 100 } });
    const res = mockRes();
    const next = jest.fn();

    await createSwap(req, res, next);
    await flushMicrotasks();

    expect(next).toHaveBeenCalledWith(
      expect.objectContaining({ statusCode: 400, message: expect.stringContaining('recipientId') })
    );
  });

  test('returns 400 when a tutor tries to swap with themselves', async () => {
    prisma.user.findUnique.mockResolvedValueOnce(REQUESTER).mockResolvedValueOnce(REQUESTER);

    const req = mockReq({
      user: { user_id: REQUESTER.firebaseUid },
      body: { recipientId: REQUESTER.id, requesterEventId: EVENT.id },
    });
    const res = mockRes();
    const next = jest.fn();

    await createSwap(req, res, next);
    await flushMicrotasks();

    expect(next).toHaveBeenCalledWith(
      expect.objectContaining({ statusCode: 400, message: expect.stringContaining('yourself') })
    );
  });

  test('returns 404 when the offered session is not a pending claim of the requester', async () => {
    prisma.user.findUnique.mockResolvedValueOnce(REQUESTER).mockResolvedValueOnce(RECIPIENT);
    prisma.timesheetEntry.findFirst.mockResolvedValue(null);

    const req = mockReq({
      user: { user_id: REQUESTER.firebaseUid },
      body: { recipientId: RECIPIENT.id, requesterEventId: EVENT.id },
    });
    const res = mockRes();
    const next = jest.fn();

    await createSwap(req, res, next);
    await flushMicrotasks();

    expect(next).toHaveBeenCalledWith(
      expect.objectContaining({ statusCode: 404, message: 'Session not found among your claimed sessions' })
    );
  });

  test('returns 409 when the session already has a live swap request', async () => {
    prisma.user.findUnique.mockResolvedValueOnce(REQUESTER).mockResolvedValueOnce(RECIPIENT);
    prisma.timesheetEntry.findFirst.mockResolvedValue(OWN_ENTRY);
    prisma.swapRequest.findFirst.mockResolvedValue({ id: 9, status: 'PENDING' });

    const req = mockReq({
      user: { user_id: REQUESTER.firebaseUid },
      body: { recipientId: RECIPIENT.id, requesterEventId: EVENT.id },
    });
    const res = mockRes();
    const next = jest.fn();

    await createSwap(req, res, next);
    await flushMicrotasks();

    expect(next).toHaveBeenCalledWith(
      expect.objectContaining({ statusCode: 409, message: expect.stringContaining('already has a swap request') })
    );
    expect(prisma.swapRequest.create).not.toHaveBeenCalled();
  });

  test('returns 403 when the recipient is not allocated to the course', async () => {
    prisma.user.findUnique.mockResolvedValueOnce(REQUESTER).mockResolvedValueOnce(RECIPIENT);
    claimLookupSequence(OWN_ENTRY);
    prisma.swapRequest.findFirst.mockResolvedValue(null);
    stubEligibleSide();
    prisma.tutorAssignment.findFirst.mockResolvedValue(null); // recipient not allocated

    const req = mockReq({
      user: { user_id: REQUESTER.firebaseUid },
      body: { recipientId: RECIPIENT.id, requesterEventId: EVENT.id },
    });
    const res = mockRes();
    const next = jest.fn();

    await createSwap(req, res, next);
    await flushMicrotasks();

    expect(next).toHaveBeenCalledWith(
      expect.objectContaining({
        statusCode: 403,
        message: expect.stringContaining('not allocated to COMS3000'),
      })
    );
    expect(prisma.swapRequest.create).not.toHaveBeenCalled();
  });

  test('returns 403 when the session falls outside the recipient availability', async () => {
    prisma.user.findUnique.mockResolvedValueOnce(REQUESTER).mockResolvedValueOnce(RECIPIENT);
    claimLookupSequence(OWN_ENTRY);
    prisma.swapRequest.findFirst.mockResolvedValue(null);
    stubEligibleSide();
    prisma.availability.findMany.mockResolvedValue([{ dayOfWeek: 2, timeSlotId: 3 }]); // different day+slot

    const req = mockReq({
      user: { user_id: REQUESTER.firebaseUid },
      body: { recipientId: RECIPIENT.id, requesterEventId: EVENT.id },
    });
    const res = mockRes();
    const next = jest.fn();

    await createSwap(req, res, next);
    await flushMicrotasks();

    expect(next).toHaveBeenCalledWith(
      expect.objectContaining({
        statusCode: 403,
        message: expect.stringContaining('outside their weekly availability'),
      })
    );
  });

  test('returns 403 when the session clashes with a recipient busy block', async () => {
    prisma.user.findUnique.mockResolvedValueOnce(REQUESTER).mockResolvedValueOnce(RECIPIENT);
    claimLookupSequence(OWN_ENTRY);
    prisma.swapRequest.findFirst.mockResolvedValue(null);
    stubEligibleSide();
    prisma.busyBlock.findMany.mockResolvedValue([{ id: 1, dayOfWeek: 0, startMinute: 500, endMinute: 530 }]);

    const req = mockReq({
      user: { user_id: REQUESTER.firebaseUid },
      body: { recipientId: RECIPIENT.id, requesterEventId: EVENT.id },
    });
    const res = mockRes();
    const next = jest.fn();

    await createSwap(req, res, next);
    await flushMicrotasks();

    expect(next).toHaveBeenCalledWith(
      expect.objectContaining({ statusCode: 403, message: expect.stringContaining('busy blocks') })
    );
  });

  test('creates a one-way swap request when every constraint passes', async () => {
    prisma.user.findUnique.mockResolvedValueOnce(REQUESTER).mockResolvedValueOnce(RECIPIENT);
    claimLookupSequence(OWN_ENTRY);
    prisma.swapRequest.findFirst.mockResolvedValue(null);
    stubEligibleSide();

    const created = { ...PENDING_SWAP, reason: 'Family commitment' };
    prisma.swapRequest.create.mockResolvedValue(created);

    const req = mockReq({
      user: { user_id: REQUESTER.firebaseUid },
      body: { recipientId: RECIPIENT.id, requesterEventId: EVENT.id, reason: 'Family commitment' },
    });
    const res = mockRes();
    const next = jest.fn();

    await createSwap(req, res, next);
    await flushMicrotasks();

    expect(prisma.swapRequest.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          requesterId: REQUESTER.id,
          recipientId: RECIPIENT.id,
          requesterEventId: EVENT.id,
          recipientEventId: null,
          reason: 'Family commitment',
        }),
      })
    );
    expect(notifySwapRequested).toHaveBeenCalledWith(created);
    expect(res.status).toHaveBeenCalledWith(201);
    expect(res.json).toHaveBeenCalledWith(
      expect.objectContaining({
        id: 1,
        status: 'PENDING',
        requester: expect.objectContaining({ userId: 10, name: 'Alice Anderson' }),
        recipient: expect.objectContaining({ userId: 20, name: 'Bob Banda' }),
        offeredSession: expect.objectContaining({ eventId: 100, courseCode: 'COMS3000', duration: 2 }),
        requestedSession: null,
      })
    );
    expect(next).not.toHaveBeenCalled();
  });

  test('creates a two-way swap when the return session passes validation for the requester', async () => {
    const RETURN_EVENT = {
      id: 200,
      courseId: 6,
      date: new Date('2026-10-06T00:00:00.000Z'), // Tuesday
      description: 'tutoring',
      course: {
        id: 6,
        courseCode: 'COMS2000',
        courseName: 'Data Structures',
        userId: 2,
        slots: [
          { dayOfWeek: 1, timeSlotId: 9, timeSlot: { id: 9, startMinute: 600, endMinute: 660 } },
        ],
      },
    };
    const THEIR_ENTRY = { id: 600, timesheetId: 70, eventId: 200, status: 'PENDING', event: RETURN_EVENT };

    prisma.user.findUnique.mockResolvedValueOnce(REQUESTER).mockResolvedValueOnce(RECIPIENT);
    // own entry, recipient's existing-claim check, recipient's return session, requester's existing-claim check
    claimLookupSequence(OWN_ENTRY, null, THEIR_ENTRY);
    prisma.swapRequest.findFirst.mockResolvedValue(null);
    stubEligibleSide();
    prisma.availability.findMany.mockResolvedValue([
      { dayOfWeek: 0, timeSlotId: 7 },
      { dayOfWeek: 1, timeSlotId: 9 },
    ]);

    const created = { ...PENDING_SWAP, recipientEventId: 200, recipientEvent: RETURN_EVENT };
    prisma.swapRequest.create.mockResolvedValue(created);

    const req = mockReq({
      user: { user_id: REQUESTER.firebaseUid },
      body: { recipientId: RECIPIENT.id, requesterEventId: EVENT.id, recipientEventId: 200 },
    });
    const res = mockRes();
    const next = jest.fn();

    await createSwap(req, res, next);
    await flushMicrotasks();

    expect(prisma.swapRequest.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ requesterEventId: 100, recipientEventId: 200 }),
      })
    );
    expect(res.status).toHaveBeenCalledWith(201);
    expect(next).not.toHaveBeenCalled();
  });
});

// ════════════════════════════════════════════════════════════════════════
// getSwaps
// ════════════════════════════════════════════════════════════════════════
describe('getSwaps', () => {
  test('tutors only see swaps they are part of', async () => {
    prisma.user.findUnique.mockResolvedValue(REQUESTER);
    prisma.swapRequest.findMany.mockResolvedValue([PENDING_SWAP]);

    const req = mockReq({ user: { user_id: REQUESTER.firebaseUid } });
    const res = mockRes();
    const next = jest.fn();

    await getSwaps(req, res, next);
    await flushMicrotasks();

    expect(prisma.swapRequest.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          OR: [{ requesterId: REQUESTER.id }, { recipientId: REQUESTER.id }],
        }),
      })
    );
    expect(res.json).toHaveBeenCalledWith([
      expect.objectContaining({ id: 1, status: 'PENDING', offeredSession: expect.objectContaining({ eventId: 100 }) }),
    ]);
  });

  test('organisers see every swap and can filter by status', async () => {
    prisma.user.findUnique.mockResolvedValue(ORGANISER);
    prisma.swapRequest.findMany.mockResolvedValue([{ ...PENDING_SWAP, status: 'ACCEPTED' }]);

    const req = mockReq({ user: { user_id: ORGANISER.firebaseUid }, query: { status: 'accepted' } });
    const res = mockRes();
    const next = jest.fn();

    await getSwaps(req, res, next);
    await flushMicrotasks();

    expect(prisma.swapRequest.findMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: expect.objectContaining({ status: 'ACCEPTED' }) })
    );
    expect(res.json).toHaveBeenCalledWith([expect.objectContaining({ status: 'ACCEPTED' })]);
  });
});

// ════════════════════════════════════════════════════════════════════════
// acceptSwap / declineSwap / cancelSwap
// ════════════════════════════════════════════════════════════════════════
describe('acceptSwap', () => {
  test('the recipient accepts a pending swap and the requester is notified', async () => {
    prisma.user.findUnique.mockResolvedValue(RECIPIENT);
    prisma.swapRequest.findUnique.mockResolvedValue(PENDING_SWAP);
    const accepted = { ...PENDING_SWAP, status: 'ACCEPTED', respondedAt: new Date() };
    prisma.swapRequest.update.mockResolvedValue(accepted);

    const req = mockReq({ user: { user_id: RECIPIENT.firebaseUid }, params: { id: '1' } });
    const res = mockRes();
    const next = jest.fn();

    await acceptSwap(req, res, next);
    await flushMicrotasks();

    expect(prisma.swapRequest.update).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: 1 },
        data: expect.objectContaining({ status: 'ACCEPTED', respondedAt: expect.any(Date) }),
      })
    );
    expect(notifySwapResponded).toHaveBeenCalledWith(accepted);
    expect(res.json).toHaveBeenCalledWith(expect.objectContaining({ id: 1, status: 'ACCEPTED' }));
    expect(next).not.toHaveBeenCalled();
  });

  test('a tutor who is not the recipient cannot accept', async () => {
    const OTHER_TUTOR = { ...RECIPIENT, id: 30, firebaseUid: 'uid-cara', firstName: 'Cara' };
    prisma.user.findUnique.mockResolvedValue(OTHER_TUTOR);
    prisma.swapRequest.findUnique.mockResolvedValue(PENDING_SWAP);

    const req = mockReq({ user: { user_id: OTHER_TUTOR.firebaseUid }, params: { id: '1' } });
    const res = mockRes();
    const next = jest.fn();

    await acceptSwap(req, res, next);
    await flushMicrotasks();

    expect(next).toHaveBeenCalledWith(expect.objectContaining({ statusCode: 403 }));
    expect(prisma.swapRequest.update).not.toHaveBeenCalled();
  });

  test('a swap that is no longer pending cannot be accepted', async () => {
    prisma.user.findUnique.mockResolvedValue(RECIPIENT);
    prisma.swapRequest.findUnique.mockResolvedValue({ ...PENDING_SWAP, status: 'APPROVED' });

    const req = mockReq({ user: { user_id: RECIPIENT.firebaseUid }, params: { id: '1' } });
    const res = mockRes();
    const next = jest.fn();

    await acceptSwap(req, res, next);
    await flushMicrotasks();

    expect(next).toHaveBeenCalledWith(expect.objectContaining({ statusCode: 409 }));
  });
});

describe('declineSwap', () => {
  test('the recipient declines with a reason and the requester is notified', async () => {
    prisma.user.findUnique.mockResolvedValue(RECIPIENT);
    prisma.swapRequest.findUnique.mockResolvedValue(PENDING_SWAP);
    const declined = { ...PENDING_SWAP, status: 'REJECTED', rejectionReason: 'Cannot make it' };
    prisma.swapRequest.update.mockResolvedValue(declined);

    const req = mockReq({
      user: { user_id: RECIPIENT.firebaseUid },
      params: { id: '1' },
      body: { reason: 'Cannot make it' },
    });
    const res = mockRes();
    const next = jest.fn();

    await declineSwap(req, res, next);
    await flushMicrotasks();

    expect(prisma.swapRequest.update).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ status: 'REJECTED', rejectionReason: 'Cannot make it' }),
      })
    );
    expect(notifySwapResponded).toHaveBeenCalledWith(declined);
    expect(res.json).toHaveBeenCalledWith(expect.objectContaining({ status: 'REJECTED', rejectionReason: 'Cannot make it' }));
  });
});

describe('cancelSwap', () => {
  test('the requester cancels a pending swap', async () => {
    prisma.user.findUnique.mockResolvedValue(REQUESTER);
    prisma.swapRequest.findUnique.mockResolvedValue(PENDING_SWAP);
    prisma.swapRequest.update.mockResolvedValue({ ...PENDING_SWAP, status: 'CANCELLED' });

    const req = mockReq({ user: { user_id: REQUESTER.firebaseUid }, params: { id: '1' } });
    const res = mockRes();
    const next = jest.fn();

    await cancelSwap(req, res, next);
    await flushMicrotasks();

    expect(prisma.swapRequest.update).toHaveBeenCalledWith(
      expect.objectContaining({ where: { id: 1 }, data: expect.objectContaining({ status: 'CANCELLED' }) })
    );
    expect(res.json).toHaveBeenCalledWith(expect.objectContaining({ status: 'CANCELLED' }));
  });

  test('the recipient cannot cancel the requester swap', async () => {
    prisma.user.findUnique.mockResolvedValue(RECIPIENT);
    prisma.swapRequest.findUnique.mockResolvedValue(PENDING_SWAP);

    const req = mockReq({ user: { user_id: RECIPIENT.firebaseUid }, params: { id: '1' } });
    const res = mockRes();
    const next = jest.fn();

    await cancelSwap(req, res, next);
    await flushMicrotasks();

    expect(next).toHaveBeenCalledWith(expect.objectContaining({ statusCode: 403 }));
  });
});

// ════════════════════════════════════════════════════════════════════════
// approveSwap
// ════════════════════════════════════════════════════════════════════════
describe('approveSwap', () => {
  test('returns 403 for tutors', async () => {
    prisma.user.findUnique.mockResolvedValue(REQUESTER);

    const req = mockReq({ user: { user_id: REQUESTER.firebaseUid }, params: { id: '1' } });
    const res = mockRes();
    const next = jest.fn();

    await approveSwap(req, res, next);
    await flushMicrotasks();

    expect(next).toHaveBeenCalledWith(expect.objectContaining({ statusCode: 403 }));
  });

  test('returns 409 when the swap is not yet accepted by both tutors', async () => {
    prisma.user.findUnique.mockResolvedValue(ORGANISER);
    prisma.swapRequest.findUnique.mockResolvedValue(PENDING_SWAP); // still PENDING

    const req = mockReq({ user: { user_id: ORGANISER.firebaseUid }, params: { id: '1' } });
    const res = mockRes();
    const next = jest.fn();

    await approveSwap(req, res, next);
    await flushMicrotasks();

    expect(next).toHaveBeenCalledWith(expect.objectContaining({ statusCode: 409 }));
    expect(prisma.$transaction).not.toHaveBeenCalled();
  });

  test('returns 409 when the requester no longer holds the offered claim', async () => {
    prisma.user.findUnique.mockResolvedValue(ORGANISER);
    prisma.swapRequest.findUnique.mockResolvedValue({ ...PENDING_SWAP, status: 'ACCEPTED' });
    prisma.timesheetEntry.findFirst.mockResolvedValue(null); // claim gone

    const req = mockReq({ user: { user_id: ORGANISER.firebaseUid }, params: { id: '1' } });
    const res = mockRes();
    const next = jest.fn();

    await approveSwap(req, res, next);
    await flushMicrotasks();

    expect(next).toHaveBeenCalledWith(
      expect.objectContaining({
        statusCode: 409,
        message: expect.stringContaining('no longer holds the claim'),
      })
    );
    expect(prisma.$transaction).not.toHaveBeenCalled();
  });

  test('returns 409 when constraints no longer pass at approval time', async () => {
    prisma.user.findUnique.mockResolvedValue(ORGANISER);
    prisma.swapRequest.findUnique.mockResolvedValue({ ...PENDING_SWAP, status: 'ACCEPTED' });
    // First findFirst: claim check (requester still holds); afterwards: recipient checks
    prisma.timesheetEntry.findFirst
      .mockResolvedValueOnce({ id: 500, timesheetId: 50, status: 'PENDING' })
      .mockResolvedValue(null);
    stubEligibleSide();
    prisma.tutorAssignment.findFirst.mockResolvedValue(null); // recipient was unassigned in the meantime

    const req = mockReq({ user: { user_id: ORGANISER.firebaseUid }, params: { id: '1' } });
    const res = mockRes();
    const next = jest.fn();

    await approveSwap(req, res, next);
    await flushMicrotasks();

    expect(next).toHaveBeenCalledWith(
      expect.objectContaining({
        statusCode: 409,
        message: expect.stringContaining('no longer passes validation'),
      })
    );
    expect(prisma.$transaction).not.toHaveBeenCalled();
  });

  test('approval moves the claim to the recipient draft timesheet and approves the swap', async () => {
    prisma.user.findUnique.mockResolvedValue(ORGANISER);
    const acceptedSwap = { ...PENDING_SWAP, status: 'ACCEPTED' };
    const approvedSwap = { ...PENDING_SWAP, status: 'APPROVED', reviewedAt: new Date(), reviewedById: ORGANISER.id };
    prisma.swapRequest.findUnique
      .mockResolvedValueOnce(acceptedSwap) // loadSwap
      .mockResolvedValueOnce(approvedSwap); // re-fetch for the response
    // Claim check (requester holds) then validateSwapSide's existing-claim check
    prisma.timesheetEntry.findFirst
      .mockResolvedValueOnce({ id: 500, timesheetId: 50, status: 'PENDING' })
      .mockResolvedValue(null);
    stubEligibleSide();

    prisma.__tx.timesheetEntry.findFirst.mockResolvedValue({ id: 500, timesheetId: 50, status: 'PENDING' });
    prisma.__tx.timesheet.findFirst.mockResolvedValue({ id: 60, userId: RECIPIENT.id, status: 'DRAFT' });
    prisma.__tx.timesheetEntry.findMany.mockResolvedValue([{ duration: 2 }]);
    prisma.__tx.swapRequest.update.mockResolvedValue({});

    const req = mockReq({ user: { user_id: ORGANISER.firebaseUid }, params: { id: '1' } });
    const res = mockRes();
    const next = jest.fn();

    await approveSwap(req, res, next);
    await flushMicrotasks();

    // The claim row is reused (eventId unique) and only its timesheet changes
    expect(prisma.__tx.timesheetEntry.update).toHaveBeenCalledWith(
      expect.objectContaining({ where: { id: 500 }, data: { timesheetId: 60 } })
    );
    // Totals are recomputed on both affected timesheets (50 given, 60 received)
    expect(prisma.__tx.timesheet.update).toHaveBeenCalledWith(
      expect.objectContaining({ where: { id: 50 }, data: { totalHours: 2 } })
    );
    expect(prisma.__tx.timesheet.update).toHaveBeenCalledWith(
      expect.objectContaining({ where: { id: 60 }, data: { totalHours: 2 } })
    );
    expect(prisma.__tx.swapRequest.update).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: 1 },
        data: expect.objectContaining({ status: 'APPROVED', reviewedById: ORGANISER.id }),
      })
    );
    expect(notifySwapReviewed).toHaveBeenCalledWith(approvedSwap);
    expect(res.json).toHaveBeenCalledWith(expect.objectContaining({ id: 1, status: 'APPROVED' }));
    expect(next).not.toHaveBeenCalled();
  });

  test('approval opens a fresh draft timesheet when the recipient has none', async () => {
    prisma.user.findUnique.mockResolvedValue(ORGANISER);
    prisma.swapRequest.findUnique
      .mockResolvedValueOnce({ ...PENDING_SWAP, status: 'ACCEPTED' })
      .mockResolvedValueOnce({ ...PENDING_SWAP, status: 'APPROVED' });
    prisma.timesheetEntry.findFirst
      .mockResolvedValueOnce({ id: 500, timesheetId: 50, status: 'PENDING' })
      .mockResolvedValue(null);
    stubEligibleSide();

    prisma.__tx.timesheetEntry.findFirst.mockResolvedValue({ id: 500, timesheetId: 50, status: 'PENDING' });
    prisma.__tx.timesheet.findFirst.mockResolvedValue(null); // no draft timesheet
    prisma.__tx.timesheet.create.mockResolvedValue({ id: 61, userId: RECIPIENT.id, status: 'DRAFT' });
    prisma.__tx.timesheetEntry.findMany.mockResolvedValue([{ duration: 2 }]);
    prisma.__tx.swapRequest.update.mockResolvedValue({});

    const req = mockReq({ user: { user_id: ORGANISER.firebaseUid }, params: { id: '1' } });
    const res = mockRes();
    const next = jest.fn();

    await approveSwap(req, res, next);
    await flushMicrotasks();

    expect(prisma.__tx.timesheet.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ userId: RECIPIENT.id, status: 'DRAFT' }),
      })
    );
    expect(prisma.__tx.timesheetEntry.update).toHaveBeenCalledWith(
      expect.objectContaining({ data: { timesheetId: 61 } })
    );
  });
});

// ════════════════════════════════════════════════════════════════════════
// rejectSwap
// ════════════════════════════════════════════════════════════════════════
describe('rejectSwap', () => {
  test('the organiser rejects an agreed swap with a reason and both tutors are notified', async () => {
    prisma.user.findUnique.mockResolvedValue(ORGANISER);
    prisma.swapRequest.findUnique.mockResolvedValue({ ...PENDING_SWAP, status: 'ACCEPTED' });
    const rejected = { ...PENDING_SWAP, status: 'REJECTED', rejectionReason: 'Course policy' };
    prisma.swapRequest.update.mockResolvedValue(rejected);

    const req = mockReq({
      user: { user_id: ORGANISER.firebaseUid },
      params: { id: '1' },
      body: { reason: 'Course policy' },
    });
    const res = mockRes();
    const next = jest.fn();

    await rejectSwap(req, res, next);
    await flushMicrotasks();

    expect(prisma.swapRequest.update).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          status: 'REJECTED',
          rejectionReason: 'Course policy',
          reviewedById: ORGANISER.id,
        }),
      })
    );
    expect(notifySwapReviewed).toHaveBeenCalledWith(rejected);
    expect(res.json).toHaveBeenCalledWith(
      expect.objectContaining({ status: 'REJECTED', rejectionReason: 'Course policy' })
    );
  });

  test('an agreed-only swap can be rejected, a pending one cannot', async () => {
    prisma.user.findUnique.mockResolvedValue(ORGANISER);
    prisma.swapRequest.findUnique.mockResolvedValue(PENDING_SWAP); // not yet ACCEPTED

    const req = mockReq({ user: { user_id: ORGANISER.firebaseUid }, params: { id: '1' } });
    const res = mockRes();
    const next = jest.fn();

    await rejectSwap(req, res, next);
    await flushMicrotasks();

    expect(next).toHaveBeenCalledWith(expect.objectContaining({ statusCode: 409 }));
    expect(prisma.swapRequest.update).not.toHaveBeenCalled();
  });
});
