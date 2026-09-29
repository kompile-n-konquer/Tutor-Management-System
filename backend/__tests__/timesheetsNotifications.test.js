// Mock the Prisma client before requiring the controller
jest.mock('../prisma/client', () => {
  const mockTx = {
    timesheetEntry: { updateMany: jest.fn() },
    timesheet: { update: jest.fn() },
  };

  return {
    user: { findUnique: jest.fn() },
    timesheet: { findUnique: jest.fn(), update: jest.fn() },
    timesheetEntry: { findFirst: jest.fn(), update: jest.fn(), findMany: jest.fn() },
    $transaction: jest.fn((fn) => fn(mockTx)),
    __tx: mockTx, // expose for test assertions
  };
});

// Email notifications are fire-and-forget: mock the notifier so tests assert
// it was invoked without hitting Resend or the EmailLog table.
jest.mock('../email/notifier', () => ({
  notifyTimesheetApproved: jest.fn().mockResolvedValue({ sent: true, skipped: false }),
  notifyTimesheetRejected: jest.fn().mockResolvedValue({ sent: true, skipped: false }),
}));

const prisma = require('../prisma/client');
const { notifyTimesheetApproved, notifyTimesheetRejected } = require('../email/notifier');
const { approveEntry, rejectTimesheet } = require('../controllers/timesheets');

// catchAsync does not `return` the inner promise, so the wrapped handler
// resolves to `undefined` immediately while the inner async work keeps
// running on the microtask queue.  flushMicrotasks waits for all
// pending microtasks to settle before assertions run.
function flushMicrotasks() {
  return new Promise((resolve) => setImmediate(resolve));
}

// ── Helpers ────────────────────────────────────────────────────────────
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
  return res;
}

const LECTURER_UID = 'uid-lecturer';

const lecturerUser = {
  id: 7,
  role: 'LECTURER',
  firebaseUid: LECTURER_UID,
  firstName: 'Lecturer',
  lastName: 'One',
  email: 'lecturer@wits.ac.za',
};

const tutorUser = {
  id: 3,
  role: 'TUTOR',
  firstName: 'Tutor',
  lastName: 'Two',
  email: 'tutor@wits.ac.za',
};

// The owner shape the notifier needs: the timesheet row plus its user relation
const timesheetOwner = {
  id: tutorUser.id,
  firstName: tutorUser.firstName,
  lastName: tutorUser.lastName,
  email: tutorUser.email,
};

const submittedTimesheet = {
  id: 50,
  userId: tutorUser.id,
  status: 'SUBMITTED',
  submittedAt: new Date('2026-09-20T10:00:00Z'),
  rejectionReason: null,
};

const USER_INCLUDE = { user: { select: { id: true, firstName: true, lastName: true, email: true } } };

beforeEach(() => {
  jest.clearAllMocks();
  prisma.user.findUnique.mockResolvedValue(lecturerUser);
});

// ════════════════════════════════════════════════════════════════════════
// approveEntry
// ════════════════════════════════════════════════════════════════════════
describe('approveEntry', () => {
  test('notifies the tutor by email when the last entry flips the timesheet to APPROVED', async () => {
    prisma.timesheet.findUnique.mockResolvedValue(submittedTimesheet);
    prisma.timesheetEntry.findFirst.mockResolvedValue({ id: 11, timesheetId: 50, supervisorId: lecturerUser.id });
    prisma.timesheetEntry.findMany.mockResolvedValue([{ status: 'APPROVED' }, { status: 'APPROVED' }]);

    const approvedRow = {
      ...submittedTimesheet,
      status: 'APPROVED',
      approvedAt: new Date('2026-09-26T09:00:00Z'),
      user: timesheetOwner,
    };
    prisma.timesheet.update.mockResolvedValue(approvedRow);

    const req = mockReq({ user: { user_id: LECTURER_UID }, params: { id: '50', entryId: '11' } });
    const res = mockRes();
    const next = jest.fn();

    await approveEntry(req, res, next);
    await flushMicrotasks();

    expect(prisma.timesheet.update).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: 50 },
        data: { status: 'APPROVED', approvedAt: expect.any(Date) },
        include: USER_INCLUDE,
      }),
    );
    // The approved row (with its owner) is what the notifier receives
    expect(notifyTimesheetApproved).toHaveBeenCalledTimes(1);
    expect(notifyTimesheetApproved).toHaveBeenCalledWith(approvedRow);
    expect(res.status).toHaveBeenCalledWith(200);
    expect(res.json).toHaveBeenCalledWith({ message: 'Entry approved', allApproved: true });
    expect(next).not.toHaveBeenCalled();
  });

  test('does not notify while other entries are still awaiting approval', async () => {
    prisma.timesheet.findUnique.mockResolvedValue(submittedTimesheet);
    prisma.timesheetEntry.findFirst.mockResolvedValue({ id: 12, timesheetId: 50, supervisorId: lecturerUser.id });
    prisma.timesheetEntry.findMany.mockResolvedValue([{ status: 'APPROVED' }, { status: 'PENDING' }]);

    const req = mockReq({ user: { user_id: LECTURER_UID }, params: { id: '50', entryId: '12' } });
    const res = mockRes();
    const next = jest.fn();

    await approveEntry(req, res, next);
    await flushMicrotasks();

    expect(prisma.timesheet.update).not.toHaveBeenCalled();
    expect(notifyTimesheetApproved).not.toHaveBeenCalled();
    expect(res.json).toHaveBeenCalledWith({ message: 'Entry approved', allApproved: false });
    expect(next).not.toHaveBeenCalled();
  });

  test('forbids approving an entry the lecturer does not supervise and skips the notification', async () => {
    prisma.timesheet.findUnique.mockResolvedValue(submittedTimesheet);
    prisma.timesheetEntry.findFirst.mockResolvedValue({ id: 11, timesheetId: 50, supervisorId: 999 });

    const req = mockReq({ user: { user_id: LECTURER_UID }, params: { id: '50', entryId: '11' } });
    const res = mockRes();
    const next = jest.fn();

    await approveEntry(req, res, next);
    await flushMicrotasks();

    expect(next).toHaveBeenCalledWith(expect.objectContaining({ statusCode: 403 }));
    expect(prisma.timesheet.update).not.toHaveBeenCalled();
    expect(notifyTimesheetApproved).not.toHaveBeenCalled();
  });

  test('forbids non-reviewers from approving entries', async () => {
    prisma.user.findUnique.mockResolvedValue({ ...lecturerUser, id: 7, role: 'TUTOR' });

    const req = mockReq({ user: { user_id: LECTURER_UID }, params: { id: '50', entryId: '11' } });
    const res = mockRes();
    const next = jest.fn();

    await approveEntry(req, res, next);
    await flushMicrotasks();

    expect(next).toHaveBeenCalledWith(expect.objectContaining({ statusCode: 403 }));
    expect(notifyTimesheetApproved).not.toHaveBeenCalled();
  });
});

// ════════════════════════════════════════════════════════════════════════
// rejectTimesheet
// ════════════════════════════════════════════════════════════════════════
describe('rejectTimesheet', () => {
  test('notifies the tutor by email with the recorded reason when a supervisor rejects', async () => {
    prisma.timesheet.findUnique.mockResolvedValue({
      ...submittedTimesheet,
      entries: [{ supervisorId: lecturerUser.id }],
    });

    const rejectedRow = {
      ...submittedTimesheet,
      status: 'REJECTED',
      rejectionReason: 'Hours do not match the schedule',
      user: timesheetOwner,
    };
    prisma.__tx.timesheet.update.mockResolvedValue(rejectedRow);

    const req = mockReq({
      user: { user_id: LECTURER_UID },
      params: { id: '50' },
      body: { reason: '  Hours do not match the schedule  ' },
    });
    const res = mockRes();
    const next = jest.fn();

    await rejectTimesheet(req, res, next);
    await flushMicrotasks();

    // The reason is trimmed before it is stored and emailed
    expect(prisma.__tx.timesheet.update).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: 50 },
        data: { status: 'REJECTED', rejectionReason: 'Hours do not match the schedule' },
        include: USER_INCLUDE,
      }),
    );
    expect(notifyTimesheetRejected).toHaveBeenCalledTimes(1);
    expect(notifyTimesheetRejected).toHaveBeenCalledWith(rejectedRow);
    expect(res.status).toHaveBeenCalledWith(200);
    expect(res.json).toHaveBeenCalledWith({
      message: 'Timesheet rejected',
      reason: 'Hours do not match the schedule',
    });
    expect(next).not.toHaveBeenCalled();
  });

  test('forbids rejection by a lecturer who is not a supervisor on the timesheet', async () => {
    const otherLecturer = { ...lecturerUser, id: 99 };
    prisma.user.findUnique.mockResolvedValue(otherLecturer);
    prisma.timesheet.findUnique.mockResolvedValue({
      ...submittedTimesheet,
      entries: [{ supervisorId: lecturerUser.id }], // someone else supervises
    });

    const req = mockReq({ user: { user_id: LECTURER_UID }, params: { id: '50' }, body: { reason: 'Nope' } });
    const res = mockRes();
    const next = jest.fn();

    await rejectTimesheet(req, res, next);
    await flushMicrotasks();

    expect(next).toHaveBeenCalledWith(expect.objectContaining({ statusCode: 403 }));
    expect(prisma.$transaction).not.toHaveBeenCalled();
    expect(notifyTimesheetRejected).not.toHaveBeenCalled();
  });

  test('requires a rejection reason', async () => {
    const req = mockReq({ user: { user_id: LECTURER_UID }, params: { id: '50' }, body: {} });
    const res = mockRes();
    const next = jest.fn();

    await rejectTimesheet(req, res, next);
    await flushMicrotasks();

    expect(next).toHaveBeenCalledWith(expect.objectContaining({ statusCode: 400 }));
    expect(notifyTimesheetRejected).not.toHaveBeenCalled();
  });
});
