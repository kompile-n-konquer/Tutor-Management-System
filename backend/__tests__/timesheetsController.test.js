// Timesheet workflow — the intermediate-tier feature: tutors claim past events
// into entries, submit for approval, supervisors approve per-entry or reject
// the whole timesheet with a reason, and a rejected timesheet returns to
// editable so the tutor can correct it and resubmit.
const {
  getMyTimesheets,
  getPendingReview,
  getSupervisors,
  createTimesheet,
  getTimesheet,
  updateTimesheet,
  deleteTimesheet,
  submitTimesheet,
  approveEntry,
  rejectTimesheet,
  exportTimesheetPdf,
} = require('../controllers/timesheets');
const prisma = require('../prisma/client');

jest.mock('../prisma/client', () => {
  const tx = {
    timesheet: { create: jest.fn(), update: jest.fn() },
    timesheetEntry: { deleteMany: jest.fn(), createMany: jest.fn(), updateMany: jest.fn() },
  };
  return {
    __tx: tx,
    user: { findUnique: jest.fn(), findMany: jest.fn() },
    timesheet: {
      findMany: jest.fn(),
      findUnique: jest.fn(),
      create: jest.fn(),
      update: jest.fn(),
      delete: jest.fn(),
    },
    timesheetEntry: {
      findFirst: jest.fn(),
      findMany: jest.fn(),
      update: jest.fn(),
      updateMany: jest.fn(),
      deleteMany: jest.fn(),
    },
    systemSetting: { findUnique: jest.fn() },
    event: { findMany: jest.fn() },
    eventRegister: { findMany: jest.fn(), findFirst: jest.fn() },
    $transaction: jest.fn(),
  };
});

// Timesheet approval/rejection emails are fire-and-forget: mock the notifier
// so tests assert it was invoked without hitting Brevo or the EmailLog table.
jest.mock('../email/notifier', () => ({
  notifyTimesheetApproved: jest.fn().mockResolvedValue({ sent: true, skipped: false }),
  notifyTimesheetRejected: jest.fn().mockResolvedValue({ sent: true, skipped: false }),
}));

// The claim rules and organiser settings are unit-tested in their own suites
// (claimRules.test.js) — stub them here so this suite stays focused on the
// controller's workflow logic.
jest.mock('../utils/systemSettings', () => ({
  getTutorMonthlyClaimableHours: jest.fn(),
  getTutorEventClaimMonths: jest.fn(),
  HOURLY_RATE_KEYS: { '3rd year': 'timesheets.hourlyRate.3rdYear' },
  PDF_TEMPLATE_KEY: 'timesheets.pdfTemplate',
}));
jest.mock('../utils/claimRules', () => ({
  monthsBefore: jest.fn(),
  findExcessiveWindow: jest.fn(),
  deriveEventEntry: jest.fn(),
  deriveTimes: jest.fn(),
  dayOfWeekFor: jest.fn(),
}));

// The PDF export draws onto a real template file — stub pdf-lib and the
// filesystem so no binary template is needed in CI.
jest.mock('pdf-lib', () => ({
  PDFDocument: { load: jest.fn() },
  StandardFonts: { Helvetica: 'helvetica', HelveticaBold: 'helvetica-bold' },
  rgb: jest.fn((r, g, b) => ({ r, g, b })),
}));
jest.mock('fs', () => ({
  existsSync: jest.fn(),
  readFileSync: jest.fn(),
}));

const {
  getTutorMonthlyClaimableHours,
  getTutorEventClaimMonths,
  PDF_TEMPLATE_KEY,
} = require('../utils/systemSettings');
const {
  monthsBefore,
  findExcessiveWindow,
  deriveEventEntry,
  deriveTimes,
  dayOfWeekFor,
} = require('../utils/claimRules');
const { notifyTimesheetApproved, notifyTimesheetRejected } = require('../email/notifier');
const { PDFDocument } = require('pdf-lib');
const fs = require('fs');

// Asserts next() received a single http-style error with the expected code + message.
const expectHttpError = (next, statusCode, message) => {
  expect(next).toHaveBeenCalledTimes(1);
  const error = next.mock.calls[0][0];
  expect(error.statusCode).toBe(statusCode);
  expect(error.message).toBe(message);
};

const DAY = 24 * 60 * 60 * 1000;

const makeEntry = (overrides = {}) => ({
  id: 71,
  timesheetId: 1,
  courseId: 3,
  supervisorId: 9,
  eventId: 11,
  workDate: new Date(Date.now() - DAY),
  duration: 2,
  description: 'Tutoring',
  status: 'PENDING',
  course: { courseCode: 'COMS1015', courseName: 'Intro to CS' },
  supervisor: { firstName: 'Ada', lastName: 'Lovelace' },
  ...overrides,
});

const makeTimesheet = (overrides = {}) => ({
  id: 1,
  userId: 5,
  name: 'September',
  payrollNumber: null,
  totalHours: 2,
  status: 'DRAFT',
  rejectionReason: null,
  createdAt: new Date('2026-09-01'),
  updatedAt: new Date('2026-09-02'),
  submittedAt: null,
  approvedAt: null,
  entries: [],
  ...overrides,
});

describe('timesheet workflow — creation, review, corrections', () => {
  let req, res, next;

  beforeEach(() => {
    jest.clearAllMocks();
    req = { params: {}, body: {}, query: {}, user: { user_id: 'firebase-uid-1' } };
    res = { json: jest.fn(), status: jest.fn().mockReturnThis(), setHeader: jest.fn(), send: jest.fn(), end: jest.fn() };
    next = jest.fn();

    // The signed-in tutor by default; role-specific tests override this.
    prisma.user.findUnique.mockResolvedValue({ id: 5, role: 'TUTOR' });

    // The controller uses both transaction forms: a callback for read-modify-
    // write flows and an array for independent writes.
    prisma.$transaction.mockImplementation(async (arg) =>
      Array.isArray(arg) ? Promise.all(arg) : arg(prisma.__tx),
    );

    // No organiser-set limits by default — each cap test sets its own.
    getTutorMonthlyClaimableHours.mockResolvedValue(null);
    getTutorEventClaimMonths.mockResolvedValue(null);
    monthsBefore.mockReturnValue(null);

    // No register rows by default — register-attendance tests set their own
    prisma.eventRegister.findMany.mockResolvedValue([]);
    prisma.eventRegister.findFirst.mockResolvedValue(null);
  });

  describe('getMyTimesheets', () => {
    test("returns the tutor's timesheets with serialized entries", async () => {
      prisma.timesheet.findMany.mockResolvedValue([
        makeTimesheet({ entries: [makeEntry()] }),
      ]);

      await getMyTimesheets(req, res, next);

      expect(prisma.timesheet.findMany).toHaveBeenCalledWith(
        expect.objectContaining({ where: { userId: 5 } }),
      );
      expect(res.json).toHaveBeenCalledWith([
        expect.objectContaining({
          id: 1,
          name: 'September',
          totalHours: 2,
          status: 'DRAFT',
          entries: [
            expect.objectContaining({
              courseCode: 'COMS1015',
              supervisorName: 'Ada Lovelace',
              eventId: 11,
              duration: 2,
            }),
          ],
        }),
      ]);
    });

    test('404s when the requesting user does not exist', async () => {
      prisma.user.findUnique.mockResolvedValue(null);

      await getMyTimesheets(req, res, next);

      expectHttpError(next, 404, 'User not found. Please check if the user exists');
    });
  });

  describe('getPendingReview', () => {
    test('403s when the requester is not a reviewer', async () => {
      await getPendingReview(req, res, next);

      expectHttpError(next, 403, 'Only lecturers, organisers or admins can review timesheets');
    });

    test('returns submitted timesheets with only the entries this supervisor owns', async () => {
      prisma.user.findUnique.mockResolvedValue({ id: 9, role: 'LECTURER' });
      prisma.timesheet.findMany.mockResolvedValue([
        {
          ...makeTimesheet({ status: 'SUBMITTED' }),
          user: { firstName: 'Thabo', lastName: 'Nkosi', email: 'thabo@wits.ac.za' },
          entries: [makeEntry({ supervisorId: 9 }), makeEntry({ id: 72, supervisorId: 6 })],
        },
      ]);

      await getPendingReview(req, res, next);

      expect(prisma.timesheet.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { status: 'SUBMITTED', entries: { some: { supervisorId: 9 } } },
        }),
      );
      // A timesheet can span multiple supervisors — each reviewer only sees
      // their own entries, plus the tutor's identity.
      const [review] = res.json.mock.calls[0][0];
      expect(review.entries).toHaveLength(1);
      expect(review.entries[0]).toEqual(expect.objectContaining({ supervisorId: 9 }));
      expect(review.tutorName).toBe('Thabo Nkosi');
      expect(review.tutorEmail).toBe('thabo@wits.ac.za');
    });

    test('returns the global submitted queue with every entry for an organiser', async () => {
      prisma.user.findUnique.mockResolvedValue({ id: 4, role: 'ORGANISER' });
      prisma.timesheet.findMany.mockResolvedValue([
        {
          ...makeTimesheet({ status: 'SUBMITTED' }),
          user: { firstName: 'Alex', lastName: 'Mercer', email: 'alex@wits.ac.za' },
          entries: [makeEntry({ supervisorId: 9 }), makeEntry({ id: 72, supervisorId: 6 })],
        },
      ]);

      await getPendingReview(req, res, next);

      expect(prisma.timesheet.findMany).toHaveBeenCalledWith(
        expect.objectContaining({ where: { status: 'SUBMITTED' } }),
      );
      const [review] = res.json.mock.calls[0][0];
      expect(review.entries).toHaveLength(2);
      expect(review.tutorName).toBe('Alex Mercer');
    });
  });

  describe('getSupervisors', () => {
    test('lists the active lecturers, organisers and admins as picker options', async () => {
      prisma.user.findMany.mockResolvedValue([
        { id: 9, firstName: 'Ada', lastName: 'Lovelace', email: 'ada@wits.ac.za' },
      ]);

      await getSupervisors(req, res, next);

      expect(prisma.user.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { role: { in: ['LECTURER', 'ORGANISER', 'ADMIN'] }, isActive: true },
        }),
      );
      expect(res.json).toHaveBeenCalledWith([
        { id: 9, name: 'Ada Lovelace', email: 'ada@wits.ac.za' },
      ]);
    });
  });

  describe('createTimesheet', () => {
    test('creates a draft timesheet with the provided name', async () => {
      req.body = { name: '  September  ' };
      prisma.__tx.timesheet.create.mockResolvedValue(
        makeTimesheet({ name: 'September' }),
      );

      await createTimesheet(req, res, next);

      expect(prisma.__tx.timesheet.create).toHaveBeenCalledWith({
        data: { userId: 5, name: 'September', totalHours: 0, status: 'DRAFT' },
      });
      expect(prisma.__tx.timesheet.update).not.toHaveBeenCalled();
      expect(res.status).toHaveBeenCalledWith(201);
      expect(res.json).toHaveBeenCalledWith(
        expect.objectContaining({ name: 'September', status: 'DRAFT', entries: [] }),
      );
    });

    test('falls back to a unique Untitled-<id> name when none is provided', async () => {
      req.body = {};
      prisma.__tx.timesheet.create.mockResolvedValue(
        makeTimesheet({ id: 42, name: 'Untitled' }),
      );
      prisma.__tx.timesheet.update.mockResolvedValue(
        makeTimesheet({ id: 42, name: 'Untitled-42' }),
      );

      await createTimesheet(req, res, next);

      expect(prisma.__tx.timesheet.update).toHaveBeenCalledWith({
        where: { id: 42 },
        data: { name: 'Untitled-42' },
      });
      expect(res.status).toHaveBeenCalledWith(201);
      expect(res.json).toHaveBeenCalledWith(
        expect.objectContaining({ name: 'Untitled-42' }),
      );
    });
  });

  describe('getTimesheet', () => {
    test('400s when the id is not a number', async () => {
      req.params.id = 'abc';

      await getTimesheet(req, res, next);

      expectHttpError(next, 400, 'Timesheet ID must be a number');
    });

    test('404s when the timesheet does not exist', async () => {
      req.params.id = '1';
      prisma.timesheet.findUnique.mockResolvedValue(null);

      await getTimesheet(req, res, next);

      expectHttpError(next, 404, 'Timesheet not found');
    });

    test('403s when the requester is neither owner, supervisor nor organiser', async () => {
      req.params.id = '1';
      prisma.timesheet.findUnique.mockResolvedValue(
        makeTimesheet({ userId: 7, entries: [makeEntry({ supervisorId: 9 })] }),
      );

      await getTimesheet(req, res, next);

      expectHttpError(next, 403, 'You do not have permission to view this timesheet');
    });

    test('returns the timesheet with the tutor identity for the owner', async () => {
      req.params.id = '1';
      prisma.timesheet.findUnique.mockResolvedValue({
        ...makeTimesheet({ entries: [makeEntry()] }),
        user: { firstName: 'Thabo', lastName: 'Nkosi', email: 'thabo@wits.ac.za' },
      });

      await getTimesheet(req, res, next);

      expect(res.json).toHaveBeenCalledWith(
        expect.objectContaining({
          tutorName: 'Thabo Nkosi',
          tutorEmail: 'thabo@wits.ac.za',
          entries: [expect.objectContaining({ courseCode: 'COMS1015' })],
        }),
      );
    });

    test('flags each event-claimed entry with register attendance', async () => {
      req.params.id = '1';
      prisma.timesheet.findUnique.mockResolvedValue({
        ...makeTimesheet({ entries: [makeEntry({ eventId: 11 }), makeEntry({ id: 72, eventId: null })] }),
        user: { firstName: 'Thabo', lastName: 'Nkosi', email: 'thabo@wits.ac.za' },
      });
      prisma.eventRegister.findMany.mockResolvedValue([{ eventId: 11, userId: 5 }]);

      await getTimesheet(req, res, next);

      expect(prisma.eventRegister.findMany).toHaveBeenCalledWith({
        where: { userId: 5, eventId: { in: [11] } },
        select: { eventId: true },
      });
      expect(res.json).toHaveBeenCalledWith(
        expect.objectContaining({
          entries: [
            expect.objectContaining({ eventId: 11, attended: true }),
            expect.objectContaining({ eventId: null, attended: null }),
          ],
        }),
      );
    });

    test('lets a supervising lecturer view a timesheet they do not own', async () => {
      req.params.id = '1';
      prisma.user.findUnique.mockResolvedValue({ id: 9, role: 'LECTURER' });
      prisma.timesheet.findUnique.mockResolvedValue({
        ...makeTimesheet({ userId: 7, entries: [makeEntry({ supervisorId: 9 })] }),
        user: { firstName: 'Thabo', lastName: 'Nkosi', email: 'thabo@wits.ac.za' },
      });

      await getTimesheet(req, res, next);

      expect(next).not.toHaveBeenCalled();
      expect(res.status).toHaveBeenCalledWith(200);
    });
  });

  describe('updateTimesheet — saving entries (drafts and corrections)', () => {
    // Shared happy-path fixtures: one claimed past event and its derived entry.
    const pastEvent = { id: 11, date: new Date(Date.now() - DAY) };
    const derivedEntry = {
      courseId: 3,
      supervisorId: 9,
      eventId: 11,
      workDate: new Date(Date.now() - DAY),
      duration: 2,
      description: 'Tutoring',
    };

    test('400s when the id is not a number', async () => {
      req.params.id = 'abc';

      await updateTimesheet(req, res, next);

      expectHttpError(next, 400, 'Timesheet ID must be a number');
    });

    test('404s when the timesheet does not exist', async () => {
      req.params.id = '1';
      prisma.timesheet.findUnique.mockResolvedValue(null);

      await updateTimesheet(req, res, next);

      expectHttpError(next, 404, 'Timesheet not found');
    });

    test("403s when the timesheet belongs to someone else", async () => {
      req.params.id = '1';
      prisma.timesheet.findUnique.mockResolvedValue(makeTimesheet({ userId: 7 }));

      await updateTimesheet(req, res, next);

      expectHttpError(next, 403, 'You can only edit your own timesheets');
    });

    test('400s when the timesheet is locked for review', async () => {
      req.params.id = '1';
      prisma.timesheet.findUnique.mockResolvedValue(makeTimesheet({ status: 'SUBMITTED' }));

      await updateTimesheet(req, res, next);

      expectHttpError(next, 400, 'Only draft or rejected timesheets can be edited');
    });

    test('400s when an explicit name is empty', async () => {
      req.params.id = '1';
      req.body = { name: '   ' };
      prisma.timesheet.findUnique.mockResolvedValue(makeTimesheet());

      await updateTimesheet(req, res, next);

      expectHttpError(next, 400, 'Timesheet name cannot be empty');
    });

    test('400s when entries is not an array', async () => {
      req.params.id = '1';
      req.body = {};
      prisma.timesheet.findUnique.mockResolvedValue(makeTimesheet());

      await updateTimesheet(req, res, next);

      expectHttpError(next, 400, 'entries must be an array');
    });

    test('400s when an entry is manually filled in instead of claiming an event', async () => {
      req.params.id = '1';
      req.body = { entries: [{ courseId: 3, duration: 2 }] };
      prisma.timesheet.findUnique.mockResolvedValue(makeTimesheet());

      await updateTimesheet(req, res, next);

      expectHttpError(
        next,
        400,
        'Timesheet entries can only be added by claiming an event — remove the manually added entries',
      );
    });

    test('400s when an eventId is not a number', async () => {
      req.params.id = '1';
      req.body = { entries: [{ eventId: 'abc' }] };
      prisma.timesheet.findUnique.mockResolvedValue(makeTimesheet());

      await updateTimesheet(req, res, next);

      expectHttpError(next, 400, 'eventId must be a number');
    });

    test('400s when the same event is claimed twice in one payload', async () => {
      req.params.id = '1';
      req.body = { entries: [{ eventId: 11 }, { eventId: 11 }] };
      prisma.timesheet.findUnique.mockResolvedValue(makeTimesheet());

      await updateTimesheet(req, res, next);

      expectHttpError(next, 400, 'Each event can only be claimed once per timesheet');
    });

    test('404s when a claimed event no longer exists', async () => {
      req.params.id = '1';
      req.body = { entries: [{ eventId: 11 }] };
      prisma.timesheet.findUnique.mockResolvedValue(makeTimesheet());
      prisma.event.findMany.mockResolvedValue([]);

      await updateTimesheet(req, res, next);

      expectHttpError(next, 404, 'Event not found');
    });

    test('400s when the claimed event has not happened yet', async () => {
      req.params.id = '1';
      req.body = { entries: [{ eventId: 11 }] };
      prisma.timesheet.findUnique.mockResolvedValue(makeTimesheet());
      prisma.event.findMany.mockResolvedValue([{ id: 11, date: new Date(Date.now() + DAY) }]);

      await updateTimesheet(req, res, next);

      expectHttpError(next, 400, 'Only past events can be claimed');
    });

    test('400s when the claimed event falls outside the claimable window', async () => {
      req.params.id = '1';
      req.body = { entries: [{ eventId: 11 }] };
      getTutorEventClaimMonths.mockResolvedValue(1);
      monthsBefore.mockReturnValue(new Date(Date.now() - 30 * DAY));
      prisma.timesheet.findUnique.mockResolvedValue(makeTimesheet());
      prisma.event.findMany.mockResolvedValue([{ id: 11, date: new Date(Date.now() - 40 * DAY) }]);

      await updateTimesheet(req, res, next);

      expectHttpError(next, 400, 'Events older than 1 month can no longer be claimed');
    });

    test('400s when the event can no longer be derived from the course slots', async () => {
      req.params.id = '1';
      req.body = { entries: [{ eventId: 11 }] };
      prisma.timesheet.findUnique.mockResolvedValue(makeTimesheet());
      prisma.event.findMany.mockResolvedValue([pastEvent]);
      deriveEventEntry.mockReturnValue(null);

      await updateTimesheet(req, res, next);

      expectHttpError(
        next,
        400,
        'This event can no longer be claimed — the course no longer has tutoring timeslots on that day',
      );
    });

    test('replaces the entries of a draft and saves a renamed timesheet', async () => {
      req.params.id = '1';
      req.body = { name: '  September (fixed)  ', entries: [{ eventId: 11 }] };
      prisma.timesheet.findUnique
        .mockResolvedValueOnce(makeTimesheet()) // validation fetch
        .mockResolvedValueOnce(makeTimesheet({ name: 'September (fixed)', entries: [makeEntry()] })); // re-fetch for the response
      prisma.event.findMany.mockResolvedValue([pastEvent]);
      deriveEventEntry.mockReturnValue(derivedEntry);

      await updateTimesheet(req, res, next);

      // Replace strategy inside one transaction: old rows go, new rows arrive.
      expect(prisma.__tx.timesheetEntry.deleteMany).toHaveBeenCalledWith({ where: { timesheetId: 1 } });
      expect(prisma.__tx.timesheetEntry.createMany).toHaveBeenCalledWith({
        data: [
          expect.objectContaining({
            timesheetId: 1,
            courseId: 3,
            supervisorId: 9,
            eventId: 11,
            status: 'PENDING',
          }),
        ],
      });
      expect(prisma.__tx.timesheet.update).toHaveBeenCalledWith({
        where: { id: 1 },
        data: { name: 'September (fixed)', totalHours: 2, status: 'DRAFT', rejectionReason: null },
      });
      expect(res.status).toHaveBeenCalledWith(200);
      expect(res.json).toHaveBeenCalledWith(
        expect.objectContaining({ name: 'September (fixed)', totalHours: 2 }),
      );
    });

    test('a rejected timesheet returns to draft and clears the rejection reason when corrected', async () => {
      req.params.id = '1';
      req.body = { entries: [{ eventId: 11 }] };
      prisma.timesheet.findUnique
        .mockResolvedValueOnce(makeTimesheet({ status: 'REJECTED', rejectionReason: 'Wrong dates' }))
        .mockResolvedValueOnce(makeTimesheet({ status: 'DRAFT', entries: [makeEntry()] }));
      prisma.event.findMany.mockResolvedValue([pastEvent]);
      deriveEventEntry.mockReturnValue(derivedEntry);

      await updateTimesheet(req, res, next);

      expect(prisma.__tx.timesheet.update).toHaveBeenCalledWith({
        where: { id: 1 },
        data: { totalHours: 2, status: 'DRAFT', rejectionReason: null },
      });
    });

    test('409s when another tutor already claimed one of the events', async () => {
      req.params.id = '1';
      req.body = { entries: [{ eventId: 11 }] };
      prisma.timesheet.findUnique.mockResolvedValue(makeTimesheet());
      prisma.event.findMany.mockResolvedValue([pastEvent]);
      deriveEventEntry.mockReturnValue(derivedEntry);
      prisma.$transaction.mockRejectedValueOnce(
        Object.assign(new Error('Unique constraint failed'), { code: 'P2002' }),
      );

      await updateTimesheet(req, res, next);

      expectHttpError(
        next,
        409,
        'An event in this timesheet has already been claimed by another tutor',
      );
    });

    test('rethrows unexpected transaction failures instead of masking them as a 409', async () => {
      req.params.id = '1';
      req.body = { entries: [{ eventId: 11 }] };
      prisma.timesheet.findUnique.mockResolvedValue(makeTimesheet());
      prisma.event.findMany.mockResolvedValue([pastEvent]);
      deriveEventEntry.mockReturnValue(derivedEntry);
      const boom = new Error('Connection reset');
      prisma.$transaction.mockRejectedValueOnce(boom);

      await updateTimesheet(req, res, next);

      // The claim-collision catch must not swallow unrelated database
      // failures — the original error reaches the global handler untouched.
      expect(next).toHaveBeenCalledTimes(1);
      expect(next.mock.calls[0][0]).toBe(boom);
      expect(res.status).not.toHaveBeenCalled();
    });
  });

  describe('deleteTimesheet', () => {
    test('400s when the id is not a number', async () => {
      req.params.id = 'abc';

      await deleteTimesheet(req, res, next);

      expectHttpError(next, 400, 'Timesheet ID must be a number');
    });

    test('404s when the timesheet does not exist', async () => {
      req.params.id = '1';
      prisma.timesheet.findUnique.mockResolvedValue(null);

      await deleteTimesheet(req, res, next);

      expectHttpError(next, 404, 'Timesheet not found');
    });

    test("403s when the timesheet belongs to someone else", async () => {
      req.params.id = '1';
      prisma.timesheet.findUnique.mockResolvedValue(makeTimesheet({ userId: 7 }));

      await deleteTimesheet(req, res, next);

      expectHttpError(next, 403, 'You can only delete your own timesheets');
    });

    test('400s when the timesheet is not a draft', async () => {
      req.params.id = '1';
      prisma.timesheet.findUnique.mockResolvedValue(makeTimesheet({ status: 'SUBMITTED' }));

      await deleteTimesheet(req, res, next);

      expectHttpError(next, 400, 'Only draft timesheets can be deleted');
    });

    test('deletes the entries and the timesheet together', async () => {
      req.params.id = '1';
      prisma.timesheet.findUnique.mockResolvedValue(makeTimesheet());
      prisma.timesheetEntry.deleteMany.mockResolvedValue({});
      prisma.timesheet.delete.mockResolvedValue({});

      await deleteTimesheet(req, res, next);

      expect(prisma.timesheetEntry.deleteMany).toHaveBeenCalledWith({ where: { timesheetId: 1 } });
      expect(prisma.timesheet.delete).toHaveBeenCalledWith({ where: { id: 1 } });
      expect(res.json).toHaveBeenCalledWith({ message: 'Timesheet deleted' });
    });
  });

  describe('submitTimesheet', () => {
    test('400s when the id is not a number', async () => {
      req.params.id = 'abc';

      await submitTimesheet(req, res, next);

      expectHttpError(next, 400, 'Timesheet ID must be a number');
    });

    test('404s when the timesheet does not exist', async () => {
      req.params.id = '1';
      prisma.timesheet.findUnique.mockResolvedValue(null);

      await submitTimesheet(req, res, next);

      expectHttpError(next, 404, 'Timesheet not found');
    });

    test("403s when the timesheet belongs to someone else", async () => {
      req.params.id = '1';
      prisma.timesheet.findUnique.mockResolvedValue(makeTimesheet({ userId: 7 }));

      await submitTimesheet(req, res, next);

      expectHttpError(next, 403, 'You can only submit your own timesheets');
    });

    test('400s when the timesheet is already submitted', async () => {
      req.params.id = '1';
      prisma.timesheet.findUnique.mockResolvedValue(makeTimesheet({ status: 'SUBMITTED' }));

      await submitTimesheet(req, res, next);

      expectHttpError(next, 400, 'Only draft or rejected timesheets can be submitted');
    });

    test('400s when the timesheet has no entries', async () => {
      req.params.id = '1';
      prisma.timesheet.findUnique.mockResolvedValue(makeTimesheet({ entries: [] }));

      await submitTimesheet(req, res, next);

      expectHttpError(next, 400, 'Cannot submit a timesheet with no entries');
    });

    test('400s when a 31-day window exceeds the organiser-set claim cap', async () => {
      req.params.id = '1';
      const entries = [makeEntry()];
      getTutorMonthlyClaimableHours.mockResolvedValue(10);
      findExcessiveWindow.mockReturnValue({
        hours: 12,
        start: new Date('2026-09-01T00:00:00Z'),
        end: new Date('2026-09-20T00:00:00Z'),
      });
      prisma.timesheet.findUnique.mockResolvedValue(makeTimesheet({ entries }));

      await submitTimesheet(req, res, next);

      expect(findExcessiveWindow).toHaveBeenCalledWith(entries, 10);
      expectHttpError(
        next,
        400,
        'This timesheet claims 12 hours between 2026-09-01 and 2026-09-20, above the maximum of 10 claimable hours per 31 days. Remove some entries before submitting.',
      );
    });

    test('submits a draft for review', async () => {
      req.params.id = '1';
      prisma.timesheet.findUnique.mockResolvedValue(
        makeTimesheet({ entries: [makeEntry()] }),
      );
      prisma.timesheet.update.mockResolvedValue(
        makeTimesheet({ status: 'SUBMITTED', submittedAt: new Date() }),
      );

      await submitTimesheet(req, res, next);

      expect(prisma.timesheet.update).toHaveBeenCalledWith({
        where: { id: 1 },
        data: { status: 'SUBMITTED', rejectionReason: null, submittedAt: expect.any(Date) },
      });
      expect(res.json).toHaveBeenCalledWith(expect.objectContaining({ status: 'SUBMITTED' }));
    });

    test('resubmits a corrected timesheet after rejection', async () => {
      req.params.id = '1';
      prisma.timesheet.findUnique.mockResolvedValue(
        makeTimesheet({ status: 'REJECTED', rejectionReason: 'Wrong dates', entries: [makeEntry()] }),
      );
      prisma.timesheet.update.mockResolvedValue(makeTimesheet({ status: 'SUBMITTED' }));

      await submitTimesheet(req, res, next);

      expect(prisma.timesheet.update).toHaveBeenCalledWith(
        expect.objectContaining({ data: expect.objectContaining({ status: 'SUBMITTED', rejectionReason: null }) }),
      );
    });
  });

  describe('approveEntry', () => {
    beforeEach(() => {
      prisma.user.findUnique.mockResolvedValue({ id: 9, role: 'LECTURER' });
      req.params = { id: '1', entryId: '7' };
    });

    test('403s when the requester is a tutor', async () => {
      prisma.user.findUnique.mockResolvedValue({ id: 5, role: 'TUTOR' });

      await approveEntry(req, res, next);

      expectHttpError(next, 403, 'Only lecturers, organisers or admins can approve entries');
    });

    test('400s when the ids are not numbers', async () => {
      req.params = { id: 'abc', entryId: '7' };

      await approveEntry(req, res, next);

      expectHttpError(next, 400, 'Timesheet and entry IDs must be numbers');
    });

    test('404s when the timesheet is not in the submitted state', async () => {
      prisma.timesheet.findUnique.mockResolvedValue(makeTimesheet({ status: 'DRAFT' }));

      await approveEntry(req, res, next);

      expectHttpError(next, 404, 'Timesheet not found or not in submitted state');
    });

    test('404s when the entry does not belong to this timesheet', async () => {
      prisma.timesheet.findUnique.mockResolvedValue(makeTimesheet({ status: 'SUBMITTED' }));
      prisma.timesheetEntry.findFirst.mockResolvedValue(null);

      await approveEntry(req, res, next);

      expectHttpError(next, 404, 'Entry not found in this timesheet');
    });

    test('403s when the requester does not supervise this entry', async () => {
      prisma.timesheet.findUnique.mockResolvedValue(makeTimesheet({ status: 'SUBMITTED' }));
      prisma.timesheetEntry.findFirst.mockResolvedValue({ id: 7, supervisorId: 6 });

      await approveEntry(req, res, next);

      expectHttpError(next, 403, 'You can only approve entries where you are the supervisor');
    });

    test('lets an organiser approve an entry assigned to another supervisor', async () => {
      prisma.user.findUnique.mockResolvedValue({ id: 4, role: 'ORGANISER' });
      prisma.timesheet.findUnique.mockResolvedValue(makeTimesheet({ status: 'SUBMITTED' }));
      prisma.timesheetEntry.findFirst.mockResolvedValue({ id: 7, supervisorId: 9 });
      prisma.timesheetEntry.update.mockResolvedValue({});
      prisma.timesheetEntry.findMany.mockResolvedValue([{ status: 'PENDING' }]);

      await approveEntry(req, res, next);

      expect(prisma.timesheetEntry.update).toHaveBeenCalledWith({
        where: { id: 7 },
        data: { status: 'APPROVED' },
      });
      expect(res.json).toHaveBeenCalledWith({ message: 'Entry approved', allApproved: false });
    });

    test('approves one entry while others are still pending', async () => {
      prisma.timesheet.findUnique.mockResolvedValue(makeTimesheet({ status: 'SUBMITTED' }));
      prisma.timesheetEntry.findFirst.mockResolvedValue({ id: 7, supervisorId: 9 });
      prisma.timesheetEntry.update.mockResolvedValue({});
      prisma.timesheetEntry.findMany.mockResolvedValue([{ status: 'PENDING' }]);

      await approveEntry(req, res, next);

      expect(prisma.timesheetEntry.update).toHaveBeenCalledWith({
        where: { id: 7 },
        data: { status: 'APPROVED' },
      });
      // Not every entry is approved yet — the timesheet stays submitted.
      expect(prisma.timesheet.update).not.toHaveBeenCalled();
      expect(res.json).toHaveBeenCalledWith({ message: 'Entry approved', allApproved: false });
    });

    test('the final approval moves the whole timesheet to APPROVED and emails the tutor', async () => {
      prisma.timesheet.findUnique.mockResolvedValue(makeTimesheet({ status: 'SUBMITTED' }));
      prisma.timesheetEntry.findFirst.mockResolvedValue({ id: 7, supervisorId: 9 });
      prisma.timesheetEntry.update.mockResolvedValue({});
      prisma.timesheetEntry.findMany.mockResolvedValue([{ status: 'APPROVED' }]);
      const approvedTimesheet = makeTimesheet({ status: 'APPROVED' });
      prisma.timesheet.update.mockResolvedValue(approvedTimesheet);

      await approveEntry(req, res, next);

      expect(prisma.timesheet.update).toHaveBeenCalledWith({
        where: { id: 1 },
        data: { status: 'APPROVED', approvedAt: expect.any(Date) },
        include: { user: { select: { id: true, firstName: true, lastName: true, email: true } } },
      });
      // The approval email is fire-and-forget and never fails the request.
      expect(notifyTimesheetApproved).toHaveBeenCalledWith(approvedTimesheet);
      expect(res.json).toHaveBeenCalledWith({ message: 'Entry approved', allApproved: true });
    });
  });

  describe('rejectTimesheet', () => {
    beforeEach(() => {
      prisma.user.findUnique.mockResolvedValue({ id: 9, role: 'LECTURER' });
      req.params.id = '1';
    });

    test('403s when the requester is a tutor', async () => {
      prisma.user.findUnique.mockResolvedValue({ id: 5, role: 'TUTOR' });

      await rejectTimesheet(req, res, next);

      expectHttpError(next, 403, 'Only lecturers, organisers or admins can reject timesheets');
    });

    test('400s when the id is not a number', async () => {
      req.params.id = 'abc';
      req.body = { reason: 'Wrong dates' };

      await rejectTimesheet(req, res, next);

      expectHttpError(next, 400, 'Timesheet ID must be a number');
    });

    test('400s when no reason — or only whitespace — is given', async () => {
      req.body = {};

      await rejectTimesheet(req, res, next);

      expectHttpError(next, 400, 'A rejection reason is required');

      req.body = { reason: '   ' };
      next.mockClear();

      await rejectTimesheet(req, res, next);

      expectHttpError(next, 400, 'A rejection reason is required');
    });

    test('404s when the timesheet is not in the submitted state', async () => {
      req.body = { reason: 'Wrong dates' };
      prisma.timesheet.findUnique.mockResolvedValue(makeTimesheet({ status: 'DRAFT' }));

      await rejectTimesheet(req, res, next);

      expectHttpError(next, 404, 'Timesheet not found or not in submitted state');
    });

    test('403s when a lecturer rejects a timesheet they do not supervise', async () => {
      req.body = { reason: 'Wrong dates' };
      prisma.timesheet.findUnique.mockResolvedValue(
        makeTimesheet({ status: 'SUBMITTED', entries: [makeEntry({ supervisorId: 6 })] }),
      );

      await rejectTimesheet(req, res, next);

      expectHttpError(next, 403, 'You can only reject timesheets where you are a supervisor');
    });

    test('rejects the whole timesheet and resets every entry for correction', async () => {
      req.body = { reason: '  Wrong dates  ' };
      prisma.timesheet.findUnique.mockResolvedValue(
        makeTimesheet({
          status: 'SUBMITTED',
          entries: [makeEntry({ supervisorId: 9 }), makeEntry({ id: 72, supervisorId: 6 })],
        }),
      );
      const rejectedTimesheet = makeTimesheet({ status: 'REJECTED', rejectionReason: 'Wrong dates' });
      prisma.__tx.timesheetEntry.updateMany.mockResolvedValue({});
      prisma.__tx.timesheet.update.mockResolvedValue(rejectedTimesheet);

      await rejectTimesheet(req, res, next);

      // Every entry returns to PENDING inside the transaction so the tutor can
      // edit and resubmit.
      expect(prisma.__tx.timesheetEntry.updateMany).toHaveBeenCalledWith({
        where: { timesheetId: 1 },
        data: { status: 'PENDING' },
      });
      expect(prisma.__tx.timesheet.update).toHaveBeenCalledWith({
        where: { id: 1 },
        data: { status: 'REJECTED', rejectionReason: 'Wrong dates' },
        include: { user: { select: { id: true, firstName: true, lastName: true, email: true } } },
      });
      // The rejection email is fire-and-forget and carries the reason.
      expect(notifyTimesheetRejected).toHaveBeenCalledWith(rejectedTimesheet);
      expect(res.json).toHaveBeenCalledWith({ message: 'Timesheet rejected', reason: 'Wrong dates' });
    });

    test('lets an organiser reject a timesheet they do not supervise', async () => {
      prisma.user.findUnique.mockResolvedValue({ id: 2, role: 'ORGANISER' });
      req.body = { reason: 'Payroll query' };
      prisma.timesheet.findUnique.mockResolvedValue(
        makeTimesheet({ status: 'SUBMITTED', entries: [makeEntry({ supervisorId: 9 })] }),
      );
      prisma.__tx.timesheetEntry.updateMany.mockResolvedValue({});
      prisma.__tx.timesheet.update.mockResolvedValue(
        makeTimesheet({ status: 'REJECTED', rejectionReason: 'Payroll query' }),
      );

      await rejectTimesheet(req, res, next);

      expect(next).not.toHaveBeenCalled();
      expect(res.json).toHaveBeenCalledWith({ message: 'Timesheet rejected', reason: 'Payroll query' });
    });
  });

  describe('exportTimesheetPdf', () => {
    beforeEach(() => {
      req.params.id = '1';
      fs.existsSync.mockReturnValue(true);
      fs.readFileSync.mockReturnValue(Buffer.from('template'));
    });

    test('400s when the id is not a number', async () => {
      req.params.id = 'abc';

      await exportTimesheetPdf(req, res, next);

      expectHttpError(next, 400, 'Timesheet ID must be a number');
    });

    test('404s when no PDF template has been uploaded', async () => {
      prisma.systemSetting.findUnique.mockResolvedValue(null);

      await exportTimesheetPdf(req, res, next);

      expectHttpError(
        next,
        404,
        'No PDF template has been uploaded. Ask an organiser to upload one in Settings.',
      );
    });

    test('404s when the template file is missing on disk', async () => {
      prisma.systemSetting.findUnique.mockResolvedValue({ value: 'template.pdf' });
      fs.existsSync.mockReturnValue(false);

      await exportTimesheetPdf(req, res, next);

      expectHttpError(next, 404, 'The PDF template file was not found on disk');
    });

    test('404s when the timesheet does not exist', async () => {
      prisma.systemSetting.findUnique.mockResolvedValue({ value: 'template.pdf' });
      prisma.timesheet.findUnique.mockResolvedValue(null);

      await exportTimesheetPdf(req, res, next);

      expectHttpError(next, 404, 'Timesheet not found');
    });

    test('403s when the timesheet is not approved', async () => {
      prisma.systemSetting.findUnique.mockResolvedValue({ value: 'template.pdf' });
      prisma.timesheet.findUnique.mockResolvedValue(makeTimesheet({ status: 'SUBMITTED' }));

      await exportTimesheetPdf(req, res, next);

      expectHttpError(next, 403, 'Only approved timesheets can be exported as PDF');
    });

    test('exports the populated payroll PDF with the hourly-rate total', async () => {
      const page = { drawText: jest.fn() };
      PDFDocument.load.mockResolvedValue({
        getPages: () => [page],
        embedFont: jest.fn(async () => 'font'),
        save: jest.fn(async () => new Uint8Array([1, 2, 3])),
      });
      // First lookup is the template, the second the hourly rate for the year.
      prisma.systemSetting.findUnique.mockImplementation(({ where }) =>
        Promise.resolve(where.key === PDF_TEMPLATE_KEY ? { value: 'template.pdf' } : { value: '150' }),
      );
      prisma.timesheet.findUnique.mockResolvedValue({
        ...makeTimesheet({ status: 'APPROVED', approvedAt: new Date('2026-09-25') }),
        user: {
          firstName: 'Thabo',
          lastName: 'Nkosi',
          email: 'thabo@wits.ac.za',
          phoneNumber: '011-717-1000',
          yearOfStudy: '3rd year',
        },
        entries: [
          {
            ...makeEntry(),
            event: { date: new Date(Date.now() - DAY), course: { slots: [{ timeSlot: {} }] } },
          },
        ],
      });
      dayOfWeekFor.mockReturnValue(1);
      deriveTimes.mockReturnValue([{ startMinute: 480, endMinute: 525 }]);

      await exportTimesheetPdf(req, res, next);

      expect(res.setHeader).toHaveBeenCalledWith('Content-Type', 'application/pdf');
      expect(res.setHeader).toHaveBeenCalledWith('Content-Disposition', 'attachment; filename="September.pdf"');
      expect(res.send).toHaveBeenCalledWith(expect.any(Buffer));
      // Tutor details are drawn onto the template...
      expect(page.drawText).toHaveBeenCalledWith('Thabo Nkosi', expect.anything());
      // ...and the total amount is hours x rate (2 x 150).
      expect(page.drawText).toHaveBeenCalledWith('300', expect.objectContaining({ x: 443 }));
    });

    test('leaves the total blank when no hourly rate is on file for the year', async () => {
      const page = { drawText: jest.fn() };
      PDFDocument.load.mockResolvedValue({
        getPages: () => [page],
        embedFont: jest.fn(async () => 'font'),
        save: jest.fn(async () => new Uint8Array([1])),
      });
      prisma.systemSetting.findUnique.mockImplementation(({ where }) =>
        Promise.resolve(where.key === PDF_TEMPLATE_KEY ? { value: 'template.pdf' } : null),
      );
      prisma.timesheet.findUnique.mockResolvedValue({
        ...makeTimesheet({ status: 'APPROVED', approvedAt: new Date('2026-09-25') }),
        user: {
          firstName: 'Thabo',
          lastName: 'Nkosi',
          email: 'thabo@wits.ac.za',
          phoneNumber: null,
          yearOfStudy: '3rd year',
        },
        entries: [makeEntry()], // no event → no task times, still exported
      });

      await exportTimesheetPdf(req, res, next);

      expect(page.drawText).toHaveBeenCalledWith('', expect.objectContaining({ x: 443 }));
    });

    test('skips the rate lookup when the tutor has no year of study', async () => {
      const page = { drawText: jest.fn() };
      PDFDocument.load.mockResolvedValue({
        getPages: () => [page],
        embedFont: jest.fn(async () => 'font'),
        save: jest.fn(async () => new Uint8Array([1])),
      });
      prisma.systemSetting.findUnique.mockResolvedValue({ value: 'template.pdf' });
      prisma.timesheet.findUnique.mockResolvedValue({
        ...makeTimesheet({ status: 'APPROVED', approvedAt: new Date('2026-09-25') }),
        user: {
          firstName: 'Thabo',
          lastName: 'Nkosi',
          email: 'thabo@wits.ac.za',
          phoneNumber: null,
          yearOfStudy: null,
        },
        entries: [],
      });

      await exportTimesheetPdf(req, res, next);

      // Only the template lookup happens — no rate key to fetch.
      expect(prisma.systemSetting.findUnique).toHaveBeenCalledTimes(1);
      expect(res.send).toHaveBeenCalledWith(expect.any(Buffer));
    });
  });
});
