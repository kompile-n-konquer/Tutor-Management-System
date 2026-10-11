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
// it was invoked without hitting Brevo or the EmailLog table.
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

// ════════════════════════════════════════════════════════════════════════
// Gap-filling: shared guards, slot ordering and candidate sessions
// ════════════════════════════════════════════════════════════════════════

// 2026-10-06 is a Tuesday, which the schema numbers as dayOfWeek 1
const TUESDAY_EVENT = {
  id: 200,
  courseId: 6,
  date: new Date('2026-10-06T00:00:00.000Z'),
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

const TUESDAY_ENTRY = {
  id: 600,
  timesheetId: 70,
  eventId: TUESDAY_EVENT.id,
  status: 'PENDING',
  event: TUESDAY_EVENT,
};

describe('shared user lookup guard', () => {
  test('returns 404 when the firebase identity has no profile', async () => {
    prisma.user.findUnique.mockResolvedValue(null);

    const req = mockReq({ user: { user_id: 'uid-ghost' } });
    const res = mockRes();
    const next = jest.fn();

    await getSwaps(req, res, next);
    await flushMicrotasks();

    expect(next).toHaveBeenCalledWith(
      expect.objectContaining({
        statusCode: 404,
        message: 'User not found. Please check if the user exists',
      })
    );
    expect(res.json).not.toHaveBeenCalled();
  });
});

describe('getMySessions slot ordering', () => {
  test('derives and sorts every slot on the session day and sums the hours', async () => {
    const DOUBLE_SLOT_EVENT = {
      ...EVENT,
      course: {
        ...EVENT.course,
        slots: [
          { dayOfWeek: 0, timeSlotId: 8, timeSlot: { id: 8, startMinute: 600, endMinute: 660 } },
          { dayOfWeek: 0, timeSlotId: 7, timeSlot: { id: 7, startMinute: 480, endMinute: 570 } },
        ],
      },
    };
    prisma.user.findUnique.mockResolvedValue(REQUESTER);
    prisma.timesheetEntry.findMany.mockResolvedValue([{ ...OWN_ENTRY, event: DOUBLE_SLOT_EVENT }]);

    const req = mockReq({ user: { user_id: REQUESTER.firebaseUid } });
    const res = mockRes();
    const next = jest.fn();

    await getMySessions(req, res, next);
    await flushMicrotasks();

    const [session] = res.json.mock.calls[0][0];
    expect(session.slots.map((slot) => slot.startMinute)).toEqual([480, 600]);
    expect(session.duration).toBe(3); // 2h + 1h
    expect(next).not.toHaveBeenCalled();
  });
});

describe('getCandidates role guard', () => {
  test('returns 403 when a non-tutor asks for candidates', async () => {
    prisma.user.findUnique.mockResolvedValue(ORGANISER);

    const req = mockReq({ user: { user_id: ORGANISER.firebaseUid }, params: { eventId: '100' } });
    const res = mockRes();
    const next = jest.fn();

    await getCandidates(req, res, next);
    await flushMicrotasks();

    expect(next).toHaveBeenCalledWith(
      expect.objectContaining({ statusCode: 403, message: 'Only tutors can view swap candidates' })
    );
    expect(prisma.tutorAssignment.findMany).not.toHaveBeenCalled();
  });
});

describe('getCandidates candidate sessions', () => {
  test('lists the candidate sessions the requester can take over', async () => {
    const OTHER_COURSE_EVENT = {
      id: 300,
      courseId: 7,
      date: TUESDAY_EVENT.date,
      description: 'tutoring',
      course: {
        id: 7,
        courseCode: 'COMS1000',
        courseName: 'Intro to Computing',
        userId: 3,
        slots: [
          { dayOfWeek: 1, timeSlotId: 9, timeSlot: { id: 9, startMinute: 600, endMinute: 660 } },
        ],
      },
    };

    prisma.user.findUnique.mockResolvedValue(REQUESTER);
    claimLookupSequence(OWN_ENTRY, null, null);
    prisma.tutorAssignment.findMany.mockResolvedValue([{ id: 3, user: RECIPIENT }]);
    stubEligibleSide();
    prisma.availability.findMany.mockResolvedValue([
      { dayOfWeek: 0, timeSlotId: 7 },
      { dayOfWeek: 1, timeSlotId: 9 },
    ]);
    // #1: candidate conflict lookup; #2: the candidate swappable sessions; #3: requester conflict lookup
    prisma.timesheetEntry.findMany
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([TUESDAY_ENTRY, { ...TUESDAY_ENTRY, id: 601, eventId: 300, event: OTHER_COURSE_EVENT }])
      .mockResolvedValue([]);
    // Candidate allocation check, then the requester allocation checks: course 6 yes, course 7 no
    prisma.tutorAssignment.findFirst
      .mockResolvedValueOnce({ id: 4, userId: RECIPIENT.id, courseId: 5 })
      .mockResolvedValueOnce({ id: 5, userId: REQUESTER.id, courseId: 6 })
      .mockResolvedValueOnce({ id: 5, userId: REQUESTER.id, courseId: 6 })
      .mockResolvedValue(null);

    const req = mockReq({ user: { user_id: REQUESTER.firebaseUid }, params: { eventId: '100' } });
    const res = mockRes();
    const next = jest.fn();

    await getCandidates(req, res, next);
    await flushMicrotasks();

    const { candidates } = res.json.mock.calls[0][0];
    expect(candidates[0].sessions).toEqual([
      expect.objectContaining({ eventId: 200, courseCode: 'COMS2000', eligible: true, reasons: [] }),
    ]);
    expect(next).not.toHaveBeenCalled();
  });
});

describe('createSwap role guard', () => {
  test('returns 403 when a non-tutor tries to request a swap', async () => {
    prisma.user.findUnique.mockResolvedValue(ORGANISER);

    const req = mockReq({
      user: { user_id: ORGANISER.firebaseUid },
      body: { recipientId: RECIPIENT.id, requesterEventId: EVENT.id },
    });
    const res = mockRes();
    const next = jest.fn();

    await createSwap(req, res, next);
    await flushMicrotasks();

    expect(next).toHaveBeenCalledWith(
      expect.objectContaining({ statusCode: 403, message: 'Only tutors can request a session swap' })
    );
    expect(prisma.swapRequest.create).not.toHaveBeenCalled();
  });
});

describe('createSwap two-way id guard', () => {
  test('returns 400 when both legs point at the same session', async () => {
    prisma.user.findUnique.mockResolvedValue(REQUESTER);

    const req = mockReq({
      user: { user_id: REQUESTER.firebaseUid },
      body: { recipientId: RECIPIENT.id, requesterEventId: EVENT.id, recipientEventId: EVENT.id },
    });
    const res = mockRes();
    const next = jest.fn();

    await createSwap(req, res, next);
    await flushMicrotasks();

    expect(next).toHaveBeenCalledWith(
      expect.objectContaining({ statusCode: 400, message: 'A two-way swap needs two different sessions' })
    );
    expect(prisma.swapRequest.create).not.toHaveBeenCalled();
  });
});

// ════════════════════════════════════════════════════════════════════════
// Gap-filling: validateSwapSide constraint branches
// ════════════════════════════════════════════════════════════════════════

describe('createSwap constraint branches', () => {
  test('returns 403 when the course no longer has slots on the session day', async () => {
    const SLOTLESS_EVENT = {
      ...EVENT,
      id: 150,
      course: {
        ...EVENT.course,
        slots: [
          { dayOfWeek: 2, timeSlotId: 5, timeSlot: { id: 5, startMinute: 480, endMinute: 570 } },
        ],
      },
    };
    prisma.user.findUnique.mockResolvedValueOnce(REQUESTER).mockResolvedValueOnce(RECIPIENT);
    claimLookupSequence({ ...OWN_ENTRY, eventId: 150, event: SLOTLESS_EVENT });
    prisma.swapRequest.findFirst.mockResolvedValue(null);
    stubEligibleSide();

    const req = mockReq({
      user: { user_id: REQUESTER.firebaseUid },
      body: { recipientId: RECIPIENT.id, requesterEventId: 150 },
    });
    const res = mockRes();
    const next = jest.fn();

    await createSwap(req, res, next);
    await flushMicrotasks();

    expect(next).toHaveBeenCalledWith(
      expect.objectContaining({
        statusCode: 403,
        message: expect.stringContaining("no longer has tutoring timeslots on the session's day"),
      })
    );
    expect(prisma.swapRequest.create).not.toHaveBeenCalled();
  });

  test('returns 403 when the recipient already holds the session claim', async () => {
    prisma.user.findUnique.mockResolvedValueOnce(REQUESTER).mockResolvedValueOnce(RECIPIENT);
    // Own entry, then the recipient's existing-claim check finds their own row
    claimLookupSequence(OWN_ENTRY, { id: 700, timesheetId: 80, eventId: EVENT.id, status: 'PENDING' });
    prisma.swapRequest.findFirst.mockResolvedValue(null);
    stubEligibleSide();

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
        message: expect.stringContaining('they already hold this session'),
      })
    );
    expect(prisma.swapRequest.create).not.toHaveBeenCalled();
  });

  test('returns 403 when the session double-books the recipient against another claim', async () => {
    const CLASH_EVENT = {
      id: 999,
      courseId: 9,
      date: EVENT.date,
      description: 'tutoring',
      course: {
        id: 9,
        courseCode: 'COMS1000',
        courseName: 'Intro to Computing',
        userId: 3,
        slots: [
          { dayOfWeek: 0, timeSlotId: 7, timeSlot: { id: 7, startMinute: 480, endMinute: 570 } },
        ],
      },
    };
    prisma.user.findUnique.mockResolvedValueOnce(REQUESTER).mockResolvedValueOnce(RECIPIENT);
    claimLookupSequence(OWN_ENTRY);
    prisma.swapRequest.findFirst.mockResolvedValue(null);
    stubEligibleSide();
    // One entry with a missing event (filtered out) and one overlapping the offered session
    prisma.timesheetEntry.findMany.mockResolvedValue([
      { eventId: 998, event: null },
      { eventId: 999, event: CLASH_EVENT },
    ]);

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
        message: expect.stringContaining('it double-books them against COMS1000 on 2026-10-05'),
      })
    );
    expect(prisma.swapRequest.create).not.toHaveBeenCalled();
  });

  test('returns 403 when the session pushes the recipient past the claimable-hours window', async () => {
    prisma.user.findUnique.mockResolvedValueOnce(REQUESTER).mockResolvedValueOnce(RECIPIENT);
    claimLookupSequence(OWN_ENTRY);
    prisma.swapRequest.findFirst.mockResolvedValue(null);
    stubEligibleSide();
    prisma.systemSetting.findUnique.mockResolvedValue({
      key: 'TUTOR_MONTHLY_CLAIMABLE_HOURS',
      value: '4',
    });
    // #1 conflict lookup (none), then #2 the recipient's existing claims feeding the window
    prisma.timesheetEntry.findMany
      .mockResolvedValueOnce([])
      .mockResolvedValue([{ workDate: new Date('2026-09-20T00:00:00.000Z'), duration: 3 }]);

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
        message: expect.stringContaining(
          'it would push them above the 4 claimable-hours limit for the window 2026-09-20 to 2026-10-05'
        ),
      })
    );
    expect(prisma.swapRequest.create).not.toHaveBeenCalled();
  });

  test('allows the swap when the recipient stays within the claimable-hours window', async () => {
    prisma.user.findUnique.mockResolvedValueOnce(REQUESTER).mockResolvedValueOnce(RECIPIENT);
    claimLookupSequence(OWN_ENTRY);
    prisma.swapRequest.findFirst.mockResolvedValue(null);
    stubEligibleSide();
    prisma.systemSetting.findUnique.mockResolvedValue({
      key: 'TUTOR_MONTHLY_CLAIMABLE_HOURS',
      value: '4',
    });
    // #1 conflict lookup (none), then #2 the recipient's existing claims: 1 + 2 = 3 hours stay under the cap
    prisma.timesheetEntry.findMany
      .mockResolvedValueOnce([])
      .mockResolvedValue([{ workDate: new Date('2026-09-20T00:00:00.000Z'), duration: 1 }]);
    prisma.swapRequest.create.mockResolvedValue(PENDING_SWAP);

    const req = mockReq({
      user: { user_id: REQUESTER.firebaseUid },
      body: { recipientId: RECIPIENT.id, requesterEventId: EVENT.id },
    });
    const res = mockRes();
    const next = jest.fn();

    await createSwap(req, res, next);
    await flushMicrotasks();

    expect(res.status).toHaveBeenCalledWith(201);
    expect(next).not.toHaveBeenCalled();
  });
});

// ════════════════════════════════════════════════════════════════════════
// Gap-filling: swap partner guard
// ════════════════════════════════════════════════════════════════════════

describe('createSwap partner guard', () => {
  test('returns 404 when the partner is not an active tutor', async () => {
    prisma.user.findUnique.mockResolvedValueOnce(REQUESTER).mockResolvedValueOnce(null);

    const req = mockReq({
      user: { user_id: REQUESTER.firebaseUid },
      body: { recipientId: 777, requesterEventId: EVENT.id },
    });
    const res = mockRes();
    const next = jest.fn();

    await createSwap(req, res, next);
    await flushMicrotasks();

    expect(next).toHaveBeenCalledWith(
      expect.objectContaining({ statusCode: 404, message: 'The swap partner must be an active tutor' })
    );
    expect(prisma.swapRequest.create).not.toHaveBeenCalled();
  });
});

// ════════════════════════════════════════════════════════════════════════
// Gap-filling: remaining branch partials
// ════════════════════════════════════════════════════════════════════════

describe('getMySessions weekend sessions', () => {
  test('derives no slots and zero duration for an event on a weekend day', async () => {
    const SATURDAY_EVENT = {
      ...EVENT,
      date: new Date('2026-10-03T00:00:00.000Z'), // Saturday
    };
    prisma.user.findUnique.mockResolvedValue(REQUESTER);
    prisma.timesheetEntry.findMany.mockResolvedValue([{ ...OWN_ENTRY, event: SATURDAY_EVENT }]);

    const req = mockReq({ user: { user_id: REQUESTER.firebaseUid } });
    const res = mockRes();
    const next = jest.fn();

    await getMySessions(req, res, next);
    await flushMicrotasks();

    const [session] = res.json.mock.calls[0][0];
    expect(session.slots).toEqual([]);
    expect(session.duration).toBe(0);
    expect(next).not.toHaveBeenCalled();
  });
});

describe('getSwaps name fallback and organiser default filter', () => {
  test('falls back to the email when a tutor has no recorded name', async () => {
    const NAMELESS_TUTOR = { ...REQUESTER, firstName: null, lastName: null };
    prisma.user.findUnique.mockResolvedValue(REQUESTER);
    prisma.swapRequest.findMany.mockResolvedValue([{ ...PENDING_SWAP, requester: NAMELESS_TUTOR }]);

    const req = mockReq({ user: { user_id: REQUESTER.firebaseUid } });
    const res = mockRes();
    const next = jest.fn();

    await getSwaps(req, res, next);
    await flushMicrotasks();

    expect(res.json).toHaveBeenCalledWith([
      expect.objectContaining({
        requester: expect.objectContaining({ userId: REQUESTER.id, name: REQUESTER.email }),
      }),
    ]);
    expect(next).not.toHaveBeenCalled();
  });

  test('organisers without a status filter see every swap', async () => {
    prisma.user.findUnique.mockResolvedValue(ORGANISER);
    prisma.swapRequest.findMany.mockResolvedValue([]);

    const req = mockReq({ user: { user_id: ORGANISER.firebaseUid } });
    const res = mockRes();
    const next = jest.fn();

    await getSwaps(req, res, next);
    await flushMicrotasks();

    expect(prisma.swapRequest.findMany).toHaveBeenCalledWith(expect.objectContaining({ where: {} }));
    expect(res.json).toHaveBeenCalledWith([]);
  });
});

describe('createSwap id validation branches', () => {
  test('returns 400 when the request body is missing entirely', async () => {
    prisma.user.findUnique.mockResolvedValue(REQUESTER);

    const req = mockReq({ user: { user_id: REQUESTER.firebaseUid }, body: undefined });
    const res = mockRes();
    const next = jest.fn();

    await createSwap(req, res, next);
    await flushMicrotasks();

    expect(next).toHaveBeenCalledWith(
      expect.objectContaining({ statusCode: 400, message: expect.stringContaining('recipientId') })
    );
  });

  test('returns 400 when requesterEventId is not an integer', async () => {
    prisma.user.findUnique.mockResolvedValue(REQUESTER);

    const req = mockReq({
      user: { user_id: REQUESTER.firebaseUid },
      body: { recipientId: RECIPIENT.id, requesterEventId: 'abc' },
    });
    const res = mockRes();
    const next = jest.fn();

    await createSwap(req, res, next);
    await flushMicrotasks();

    expect(next).toHaveBeenCalledWith(
      expect.objectContaining({ statusCode: 400, message: expect.stringContaining('requesterEventId') })
    );
  });

  test('returns 400 when recipientEventId is not an integer', async () => {
    prisma.user.findUnique.mockResolvedValue(REQUESTER);

    const req = mockReq({
      user: { user_id: REQUESTER.firebaseUid },
      body: { recipientId: RECIPIENT.id, requesterEventId: EVENT.id, recipientEventId: 'abc' },
    });
    const res = mockRes();
    const next = jest.fn();

    await createSwap(req, res, next);
    await flushMicrotasks();

    expect(next).toHaveBeenCalledWith(
      expect.objectContaining({ statusCode: 400, message: expect.stringContaining('recipientEventId') })
    );
  });
});

describe('state-transition id validation', () => {
  test('acceptSwap rejects a non-integer id', async () => {
    prisma.user.findUnique.mockResolvedValue(RECIPIENT);

    const req = mockReq({ user: { user_id: RECIPIENT.firebaseUid }, params: { id: 'abc' } });
    const res = mockRes();
    const next = jest.fn();

    await acceptSwap(req, res, next);
    await flushMicrotasks();

    expect(next).toHaveBeenCalledWith(
      expect.objectContaining({ statusCode: 400, message: 'Swap request ID must be a valid integer' })
    );
    expect(prisma.swapRequest.findUnique).not.toHaveBeenCalled();
  });

  test('declineSwap rejects a non-integer id', async () => {
    prisma.user.findUnique.mockResolvedValue(RECIPIENT);

    const req = mockReq({ user: { user_id: RECIPIENT.firebaseUid }, params: { id: 'abc' } });
    const res = mockRes();
    const next = jest.fn();

    await declineSwap(req, res, next);
    await flushMicrotasks();

    expect(next).toHaveBeenCalledWith(expect.objectContaining({ statusCode: 400 }));
    expect(prisma.swapRequest.findUnique).not.toHaveBeenCalled();
  });

  test('cancelSwap rejects a non-integer id', async () => {
    prisma.user.findUnique.mockResolvedValue(REQUESTER);

    const req = mockReq({ user: { user_id: REQUESTER.firebaseUid }, params: { id: 'abc' } });
    const res = mockRes();
    const next = jest.fn();

    await cancelSwap(req, res, next);
    await flushMicrotasks();

    expect(next).toHaveBeenCalledWith(expect.objectContaining({ statusCode: 400 }));
    expect(prisma.swapRequest.findUnique).not.toHaveBeenCalled();
  });

  test('approveSwap rejects a non-integer id', async () => {
    prisma.user.findUnique.mockResolvedValue(ORGANISER);

    const req = mockReq({ user: { user_id: ORGANISER.firebaseUid }, params: { id: 'abc' } });
    const res = mockRes();
    const next = jest.fn();

    await approveSwap(req, res, next);
    await flushMicrotasks();

    expect(next).toHaveBeenCalledWith(expect.objectContaining({ statusCode: 400 }));
    expect(prisma.swapRequest.findUnique).not.toHaveBeenCalled();
  });

  test('rejectSwap rejects a non-integer id', async () => {
    prisma.user.findUnique.mockResolvedValue(ORGANISER);

    const req = mockReq({ user: { user_id: ORGANISER.firebaseUid }, params: { id: 'abc' } });
    const res = mockRes();
    const next = jest.fn();

    await rejectSwap(req, res, next);
    await flushMicrotasks();

    expect(next).toHaveBeenCalledWith(expect.objectContaining({ statusCode: 400 }));
    expect(prisma.swapRequest.findUnique).not.toHaveBeenCalled();
  });
});

describe('null rejection reasons and fire-and-forget notifier failures', () => {
  test('declining without a body stores a null rejection reason', async () => {
    prisma.user.findUnique.mockResolvedValue(RECIPIENT);
    prisma.swapRequest.findUnique.mockResolvedValue(PENDING_SWAP);
    prisma.swapRequest.update.mockResolvedValue({ ...PENDING_SWAP, status: 'REJECTED' });

    const req = mockReq({ user: { user_id: RECIPIENT.firebaseUid }, params: { id: '1' }, body: undefined });
    const res = mockRes();
    const next = jest.fn();

    await declineSwap(req, res, next);
    await flushMicrotasks();

    expect(prisma.swapRequest.update).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ rejectionReason: null }) })
    );
    expect(next).not.toHaveBeenCalled();
  });

  test('rejecting without a body stores a null rejection reason', async () => {
    prisma.user.findUnique.mockResolvedValue(ORGANISER);
    prisma.swapRequest.findUnique.mockResolvedValue({ ...PENDING_SWAP, status: 'ACCEPTED' });
    prisma.swapRequest.update.mockResolvedValue({ ...PENDING_SWAP, status: 'REJECTED' });

    const req = mockReq({ user: { user_id: ORGANISER.firebaseUid }, params: { id: '1' }, body: undefined });
    const res = mockRes();
    const next = jest.fn();

    await rejectSwap(req, res, next);
    await flushMicrotasks();

    expect(prisma.swapRequest.update).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ rejectionReason: null }) })
    );
    expect(next).not.toHaveBeenCalled();
  });

  test('a failing swap-requested email does not stop the swap being created', async () => {
    prisma.user.findUnique.mockResolvedValueOnce(REQUESTER).mockResolvedValueOnce(RECIPIENT);
    claimLookupSequence(OWN_ENTRY);
    prisma.swapRequest.findFirst.mockResolvedValue(null);
    stubEligibleSide();
    prisma.swapRequest.create.mockResolvedValue(PENDING_SWAP);
    notifySwapRequested.mockRejectedValueOnce(new Error('smtp down'));

    const req = mockReq({
      user: { user_id: REQUESTER.firebaseUid },
      body: { recipientId: RECIPIENT.id, requesterEventId: EVENT.id },
    });
    const res = mockRes();
    const next = jest.fn();

    await createSwap(req, res, next);
    await flushMicrotasks();

    expect(res.status).toHaveBeenCalledWith(201);
    expect(next).not.toHaveBeenCalled();
  });

  test('a failing swap-responded email does not stop the acceptance', async () => {
    prisma.user.findUnique.mockResolvedValue(RECIPIENT);
    prisma.swapRequest.findUnique.mockResolvedValue(PENDING_SWAP);
    prisma.swapRequest.update.mockResolvedValue({ ...PENDING_SWAP, status: 'ACCEPTED' });
    notifySwapResponded.mockRejectedValueOnce(new Error('smtp down'));

    const req = mockReq({ user: { user_id: RECIPIENT.firebaseUid }, params: { id: '1' } });
    const res = mockRes();
    const next = jest.fn();

    await acceptSwap(req, res, next);
    await flushMicrotasks();

    expect(res.json).toHaveBeenCalledWith(expect.objectContaining({ status: 'ACCEPTED' }));
    expect(next).not.toHaveBeenCalled();
  });

  test('a failing swap-reviewed email does not stop the rejection', async () => {
    prisma.user.findUnique.mockResolvedValue(ORGANISER);
    prisma.swapRequest.findUnique.mockResolvedValue({ ...PENDING_SWAP, status: 'ACCEPTED' });
    prisma.swapRequest.update.mockResolvedValue({ ...PENDING_SWAP, status: 'REJECTED' });
    notifySwapReviewed.mockRejectedValueOnce(new Error('smtp down'));

    const req = mockReq({ user: { user_id: ORGANISER.firebaseUid }, params: { id: '1' } });
    const res = mockRes();
    const next = jest.fn();

    await rejectSwap(req, res, next);
    await flushMicrotasks();

    expect(res.json).toHaveBeenCalledWith(expect.objectContaining({ status: 'REJECTED' }));
    expect(next).not.toHaveBeenCalled();
  });
});

// ════════════════════════════════════════════════════════════════════════
// Gap-filling: two-way swap leg guards
// ════════════════════════════════════════════════════════════════════════

describe('createSwap two-way leg guards', () => {
  test('returns 404 when the requested session is not a pending claim of the partner', async () => {
    prisma.user.findUnique.mockResolvedValueOnce(REQUESTER).mockResolvedValueOnce(RECIPIENT);
    // Own entry, recipient validator's claim check, then the missing return session
    claimLookupSequence(OWN_ENTRY, null);
    prisma.swapRequest.findFirst.mockResolvedValue(null);
    stubEligibleSide();

    const req = mockReq({
      user: { user_id: REQUESTER.firebaseUid },
      body: { recipientId: RECIPIENT.id, requesterEventId: EVENT.id, recipientEventId: 200 },
    });
    const res = mockRes();
    const next = jest.fn();

    await createSwap(req, res, next);
    await flushMicrotasks();

    expect(next).toHaveBeenCalledWith(
      expect.objectContaining({
        statusCode: 404,
        message: expect.stringContaining("was not found among the partner's claimed sessions"),
      })
    );
    expect(prisma.swapRequest.create).not.toHaveBeenCalled();
  });

  test('returns 403 when the requester cannot take over the return session', async () => {
    prisma.user.findUnique.mockResolvedValueOnce(REQUESTER).mockResolvedValueOnce(RECIPIENT);
    // Own entry, both existing-claim checks, then the partner's return session
    claimLookupSequence(OWN_ENTRY, null, TUESDAY_ENTRY);
    prisma.swapRequest.findFirst.mockResolvedValue(null);
    stubEligibleSide();
    prisma.availability.findMany.mockResolvedValue([
      { dayOfWeek: 0, timeSlotId: 7 },
      { dayOfWeek: 1, timeSlotId: 9 },
    ]);
    // The recipient check passes; the requester is not allocated to the return course
    prisma.tutorAssignment.findFirst
      .mockResolvedValueOnce({ id: 3, userId: RECIPIENT.id, courseId: 5 })
      .mockResolvedValue(null);

    const req = mockReq({
      user: { user_id: REQUESTER.firebaseUid },
      body: { recipientId: RECIPIENT.id, requesterEventId: EVENT.id, recipientEventId: 200 },
    });
    const res = mockRes();
    const next = jest.fn();

    await createSwap(req, res, next);
    await flushMicrotasks();

    expect(next).toHaveBeenCalledWith(
      expect.objectContaining({
        statusCode: 403,
        message: expect.stringContaining('You cannot take over the requested session: not allocated to COMS2000'),
      })
    );
    expect(prisma.swapRequest.create).not.toHaveBeenCalled();
  });
});

// ════════════════════════════════════════════════════════════════════════
// Gap-filling: state-transition guards
// ════════════════════════════════════════════════════════════════════════

describe('acceptSwap swap lookup guard', () => {
  test('returns 404 when the swap request does not exist', async () => {
    prisma.user.findUnique.mockResolvedValue(RECIPIENT);
    prisma.swapRequest.findUnique.mockResolvedValue(null);

    const req = mockReq({ user: { user_id: RECIPIENT.firebaseUid }, params: { id: '42' } });
    const res = mockRes();
    const next = jest.fn();

    await acceptSwap(req, res, next);
    await flushMicrotasks();

    expect(next).toHaveBeenCalledWith(
      expect.objectContaining({ statusCode: 404, message: 'Swap request not found' })
    );
    expect(prisma.swapRequest.update).not.toHaveBeenCalled();
  });
});

describe('getSwaps tutor filter and role guard', () => {
  test('a tutor can filter their own swaps by status', async () => {
    prisma.user.findUnique.mockResolvedValue(REQUESTER);
    prisma.swapRequest.findMany.mockResolvedValue([PENDING_SWAP]);

    const req = mockReq({ user: { user_id: REQUESTER.firebaseUid }, query: { status: 'pending' } });
    const res = mockRes();
    const next = jest.fn();

    await getSwaps(req, res, next);
    await flushMicrotasks();

    expect(prisma.swapRequest.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          OR: [{ requesterId: REQUESTER.id }, { recipientId: REQUESTER.id }],
          status: 'PENDING',
        }),
      })
    );
    expect(next).not.toHaveBeenCalled();
  });

  test('returns 403 for roles that are neither tutors nor organisers', async () => {
    prisma.user.findUnique.mockResolvedValue({ ...REQUESTER, role: 'STUDENT' });

    const req = mockReq({ user: { user_id: REQUESTER.firebaseUid } });
    const res = mockRes();
    const next = jest.fn();

    await getSwaps(req, res, next);
    await flushMicrotasks();

    expect(next).toHaveBeenCalledWith(
      expect.objectContaining({
        statusCode: 403,
        message: 'Only tutors and organisers can view swap requests',
      })
    );
    expect(prisma.swapRequest.findMany).not.toHaveBeenCalled();
  });
});

describe('declineSwap guards', () => {
  test('a tutor who is not the recipient cannot decline', async () => {
    const OTHER_TUTOR = { ...RECIPIENT, id: 30, firebaseUid: 'uid-cara', firstName: 'Cara' };
    prisma.user.findUnique.mockResolvedValue(OTHER_TUTOR);
    prisma.swapRequest.findUnique.mockResolvedValue(PENDING_SWAP);

    const req = mockReq({ user: { user_id: OTHER_TUTOR.firebaseUid }, params: { id: '1' } });
    const res = mockRes();
    const next = jest.fn();

    await declineSwap(req, res, next);
    await flushMicrotasks();

    expect(next).toHaveBeenCalledWith(
      expect.objectContaining({
        statusCode: 403,
        message: 'Only the tutor the swap was offered to can respond to it',
      })
    );
    expect(prisma.swapRequest.update).not.toHaveBeenCalled();
  });

  test('a swap that is no longer pending cannot be declined', async () => {
    prisma.user.findUnique.mockResolvedValue(RECIPIENT);
    prisma.swapRequest.findUnique.mockResolvedValue({ ...PENDING_SWAP, status: 'APPROVED' });

    const req = mockReq({ user: { user_id: RECIPIENT.firebaseUid }, params: { id: '1' } });
    const res = mockRes();
    const next = jest.fn();

    await declineSwap(req, res, next);
    await flushMicrotasks();

    expect(next).toHaveBeenCalledWith(
      expect.objectContaining({ statusCode: 409, message: expect.stringContaining('can be declined') })
    );
    expect(prisma.swapRequest.update).not.toHaveBeenCalled();
  });
});

describe('cancelSwap status guard', () => {
  test('a swap that is no longer pending cannot be cancelled', async () => {
    prisma.user.findUnique.mockResolvedValue(REQUESTER);
    prisma.swapRequest.findUnique.mockResolvedValue({ ...PENDING_SWAP, status: 'ACCEPTED' });

    const req = mockReq({ user: { user_id: REQUESTER.firebaseUid }, params: { id: '1' } });
    const res = mockRes();
    const next = jest.fn();

    await cancelSwap(req, res, next);
    await flushMicrotasks();

    expect(next).toHaveBeenCalledWith(
      expect.objectContaining({ statusCode: 409, message: expect.stringContaining('can be cancelled') })
    );
    expect(prisma.swapRequest.update).not.toHaveBeenCalled();
  });
});

describe('approveSwap claim-state blocker', () => {
  test('returns 409 when a traded claim is no longer pending', async () => {
    prisma.user.findUnique.mockResolvedValue(ORGANISER);
    prisma.swapRequest.findUnique.mockResolvedValue({ ...PENDING_SWAP, status: 'ACCEPTED' });
    // The requester now holds a rejected version of the claim; the validator's
    // existing-claim check afterwards finds nothing
    prisma.timesheetEntry.findFirst
      .mockResolvedValueOnce({ id: 500, timesheetId: 50, status: 'REJECTED' })
      .mockResolvedValue(null);
    stubEligibleSide();

    const req = mockReq({ user: { user_id: ORGANISER.firebaseUid }, params: { id: '1' } });
    const res = mockRes();
    const next = jest.fn();

    await approveSwap(req, res, next);
    await flushMicrotasks();

    expect(next).toHaveBeenCalledWith(
      expect.objectContaining({ statusCode: 409, message: expect.stringContaining('is no longer pending') })
    );
    expect(prisma.$transaction).not.toHaveBeenCalled();
  });
});

describe('approveSwap two-way trades', () => {
  test('approval moves both claims for a two-way swap', async () => {
    const acceptedSwap = {
      ...PENDING_SWAP,
      status: 'ACCEPTED',
      recipientEventId: TUESDAY_EVENT.id,
      recipientEvent: TUESDAY_EVENT,
    };
    const approvedSwap = {
      ...acceptedSwap,
      status: 'APPROVED',
      reviewedAt: new Date(),
      reviewedById: ORGANISER.id,
    };

    prisma.user.findUnique.mockResolvedValue(ORGANISER);
    // loadSwap, then the response re-fetch
    prisma.swapRequest.findUnique.mockResolvedValueOnce(acceptedSwap).mockResolvedValueOnce(approvedSwap);
    // Requester claim, recipient claim, then both validators' existing-claim checks
    prisma.timesheetEntry.findFirst
      .mockResolvedValueOnce({ id: 500, timesheetId: 50, status: 'PENDING' })
      .mockResolvedValueOnce({ id: 600, timesheetId: 51, status: 'PENDING' })
      .mockResolvedValue(null);
    // Every side checks the Monday slot 7 and the Tuesday slot 9
    stubEligibleSide();
    prisma.availability.findMany.mockResolvedValue([
      { dayOfWeek: 0, timeSlotId: 7 },
      { dayOfWeek: 1, timeSlotId: 9 },
    ]);

    prisma.__tx.timesheetEntry.findFirst
      .mockResolvedValueOnce({ id: 500, timesheetId: 50, status: 'PENDING' })
      .mockResolvedValueOnce({ id: 600, timesheetId: 51, status: 'PENDING' });
    prisma.__tx.timesheet.findFirst
      .mockResolvedValueOnce({ id: 60, userId: RECIPIENT.id, status: 'DRAFT' })
      .mockResolvedValueOnce({ id: 61, userId: REQUESTER.id, status: 'DRAFT' });
    prisma.__tx.timesheetEntry.findMany.mockResolvedValue([{ duration: 2 }]);
    prisma.__tx.swapRequest.update.mockResolvedValue({});

    const req = mockReq({ user: { user_id: ORGANISER.firebaseUid }, params: { id: '1' } });
    const res = mockRes();
    const next = jest.fn();

    await approveSwap(req, res, next);
    await flushMicrotasks();

    // The offered session moves to the recipient and the return session to the requester
    expect(prisma.__tx.timesheetEntry.update).toHaveBeenCalledWith(
      expect.objectContaining({ where: { id: 500 }, data: { timesheetId: 60 } })
    );
    expect(prisma.__tx.timesheetEntry.update).toHaveBeenCalledWith(
      expect.objectContaining({ where: { id: 600 }, data: { timesheetId: 61 } })
    );
    expect(notifySwapReviewed).toHaveBeenCalledWith(approvedSwap);
    expect(res.json).toHaveBeenCalledWith(
      expect.objectContaining({
        id: 1,
        status: 'APPROVED',
        requestedSession: expect.objectContaining({ eventId: 200 }),
      })
    );
    expect(next).not.toHaveBeenCalled();
  });
});

describe('rejectSwap role guard', () => {
  test('returns 403 for tutors', async () => {
    prisma.user.findUnique.mockResolvedValue(REQUESTER);

    const req = mockReq({ user: { user_id: REQUESTER.firebaseUid }, params: { id: '1' } });
    const res = mockRes();
    const next = jest.fn();

    await rejectSwap(req, res, next);
    await flushMicrotasks();

    expect(next).toHaveBeenCalledWith(
      expect.objectContaining({ statusCode: 403, message: 'Only organisers can reject swap requests' })
    );
    expect(prisma.swapRequest.update).not.toHaveBeenCalled();
  });
});
