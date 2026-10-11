jest.mock('../prisma/client', () => ({
  user: { findUnique: jest.fn() },
  swapRequest: { findMany: jest.fn(), count: jest.fn() },
  session: { findMany: jest.fn() },
  sessionVolunteer: { findMany: jest.fn() },
  timesheet: { findMany: jest.fn(), count: jest.fn() },
  course: { findMany: jest.fn() },
  roleApplication: { count: jest.fn() },
  application: { count: jest.fn() },
}));

const prisma = require('../prisma/client');
const { getDashboard } = require('../controllers/dashboard');

// catchAsync does not `return` the inner promise — flushMicrotasks waits
// for the background async work to settle before assertions run.
function flushMicrotasks() {
  return new Promise((resolve) => setImmediate(resolve));
}

function mockReq() {
  return { user: { user_id: 'uid-123' } };
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
  // Empty-database baseline — tests override the feeds they care about.
  prisma.user.findUnique.mockResolvedValue(null);
  prisma.swapRequest.findMany.mockResolvedValue([]);
  prisma.swapRequest.count.mockResolvedValue(0);
  prisma.session.findMany.mockResolvedValue([]);
  prisma.sessionVolunteer.findMany.mockResolvedValue([]);
  prisma.timesheet.findMany.mockResolvedValue([]);
  prisma.timesheet.count.mockResolvedValue(0);
  prisma.course.findMany.mockResolvedValue([]);
  prisma.roleApplication.count.mockResolvedValue(0);
  prisma.application.count.mockResolvedValue(0);
});

describe('getDashboard', () => {
  test('a tutor sees swaps, uncovered sessions, offers and their timesheet pipeline', async () => {
    prisma.user.findUnique.mockResolvedValue({ id: 7, role: 'TUTOR' });

    // Swap the three swapRequest.findMany calls (incoming / outgoing / agreed)
    prisma.swapRequest.findMany
      .mockResolvedValueOnce([
        {
          id: 12,
          requesterId: 99,
          recipientId: 7,
          status: 'PENDING',
          requestedAt: new Date('2026-10-05T09:00:00Z'),
          requester: { firstName: 'Thabo', lastName: 'Molefe' },
          recipient: { firstName: 'Riya', lastName: 'Naidoo' },
          requesterEvent: {
            id: 3,
            date: new Date('2026-10-14T00:00:00Z'),
            course: { courseCode: 'CS101' },
          },
        },
      ])
      .mockResolvedValueOnce([
        {
          id: 20,
          requesterId: 7,
          recipientId: 99,
          status: 'PENDING',
          requestedAt: new Date('2026-10-04T15:00:00Z'),
          requester: { firstName: 'Riya', lastName: 'Naidoo' },
          recipient: { firstName: 'Thabo', lastName: 'Molefe' },
          requesterEvent: {
            id: 4,
            date: new Date('2026-10-15T00:00:00Z'),
            course: { courseCode: 'CS305' },
          },
        },
      ])
      .mockResolvedValueOnce([
        {
          id: 30,
          requesterId: 99,
          recipientId: 7,
          status: 'ACCEPTED',
          requestedAt: new Date('2026-10-03T10:00:00Z'),
          respondedAt: new Date('2026-10-06T12:00:00Z'),
          requester: { firstName: 'Thabo', lastName: 'Molefe' },
          recipient: { firstName: 'Riya', lastName: 'Naidoo' },
          requesterEvent: {
            id: 5,
            date: new Date('2026-10-20T00:00:00Z'),
            course: { courseCode: 'MATH202' },
          },
        },
      ]);

    prisma.sessionVolunteer.findMany.mockResolvedValue([
      {
        id: 44,
        status: 'PENDING',
        createdAt: new Date('2026-10-07T08:00:00Z'),
        session: {
          id: 9,
          date: new Date('2026-10-16T00:00:00Z'),
          courseSlot: { course: { courseCode: 'MATH202' } },
        },
      },
    ]);

    prisma.timesheet.findMany
      .mockResolvedValueOnce([
        {
          id: 5,
          name: 'October',
          rejectionReason: 'Missing claim for the 14th',
          updatedAt: new Date('2026-10-08T10:00:00Z'),
        },
      ])
      .mockResolvedValueOnce([
        {
          id: 6,
          name: 'September',
          totalHours: 4,
          updatedAt: new Date('2026-10-09T10:00:00Z'),
        },
      ]);

    prisma.session.findMany.mockResolvedValue([
      {
        id: 15,
        date: new Date('2026-10-15T00:00:00Z'),
        status: 'UNASSIGNED',
        courseSlot: { course: { courseCode: 'CS305' } },
      },
    ]);

    const res = mockRes();
    const next = jest.fn();

    await getDashboard(mockReq(), res, next);
    await flushMicrotasks();

    expect(res.status).toHaveBeenCalledWith(200);
    expect(next).not.toHaveBeenCalled();

    // The scoping that keeps items private to the caller
    expect(prisma.swapRequest.findMany).toHaveBeenNthCalledWith(
      1,
      expect.objectContaining({ where: { recipientId: 7, status: 'PENDING' } }),
    );
    expect(prisma.swapRequest.findMany).toHaveBeenNthCalledWith(
      2,
      expect.objectContaining({ where: { requesterId: 7, status: 'PENDING' } }),
    );
    expect(prisma.timesheet.findMany).toHaveBeenNthCalledWith(
      2,
      expect.objectContaining({
        where: { userId: 7, status: 'DRAFT', entries: { some: {} } },
      }),
    );
    expect(prisma.session.findMany).toHaveBeenCalledWith({
      where: {
        assignment: { userId: 7 },
        status: 'UNASSIGNED',
        date: { gte: expect.any(Date) },
      },
      include: { courseSlot: { include: { course: { select: { courseCode: true } } } } },
      orderBy: { date: 'asc' },
    });

    const body = res.json.mock.calls[0][0];
    expect(body.role).toBe('TUTOR');
    // Urgent first, then newest first inside each tier
    expect(body.items).toEqual([
      {
        id: 'session-15',
        type: 'cover-awaiting',
        severity: 'urgent',
        title: 'Your CS305 session on 2026-10-15 needs a cover',
        detail: 'You excused yourself — waiting for a volunteer to take it',
        at: '2026-10-15T00:00:00.000Z',
      },
      {
        id: 'timesheet-5',
        type: 'timesheet-rejected',
        severity: 'urgent',
        title: 'Timesheet "October" was rejected',
        detail: 'Missing claim for the 14th',
        at: '2026-10-08T10:00:00.000Z',
      },
      {
        id: 'swap-12',
        type: 'swap-incoming',
        severity: 'urgent',
        title: 'Cover swap from Thabo Molefe',
        detail: 'CS101 on 2026-10-14 — waiting for your response',
        at: '2026-10-05T09:00:00.000Z',
      },
      {
        id: 'timesheet-6',
        type: 'timesheet-draft',
        severity: 'info',
        title: 'Draft timesheet "September" has unsubmitted hours',
        detail: '4 hours claimed — submit it for approval',
        at: '2026-10-09T10:00:00.000Z',
      },
      {
        id: 'offer-44',
        type: 'cover-offered',
        severity: 'info',
        title: 'You offered to cover MATH202 on 2026-10-16',
        detail: 'Waiting for the lecturer to approve your offer',
        at: '2026-10-07T08:00:00.000Z',
      },
      {
        id: 'swap-30',
        type: 'swap-accepted',
        severity: 'info',
        title: 'Your swap with Thabo Molefe awaits organiser approval',
        detail: 'MATH202 on 2026-10-20',
        at: '2026-10-06T12:00:00.000Z',
      },
      {
        id: 'swap-20',
        type: 'swap-outgoing',
        severity: 'info',
        title: 'Your swap offer to Thabo Molefe is awaiting their response',
        detail: 'CS305 on 2026-10-15',
        at: '2026-10-04T15:00:00.000Z',
      },
    ]);
  });

  test('a tutor who was the requester sees the other side named on an agreed swap', async () => {
    prisma.user.findUnique.mockResolvedValue({ id: 7, role: 'TUTOR' });
    prisma.swapRequest.findMany
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([
        {
          id: 30,
          requesterId: 7,
          recipientId: 99,
          status: 'ACCEPTED',
          requestedAt: new Date('2026-10-03T10:00:00Z'),
          respondedAt: new Date('2026-10-06T12:00:00Z'),
          requester: { firstName: 'Riya', lastName: 'Naidoo' },
          recipient: { firstName: 'Thabo', lastName: 'Molefe' },
          requesterEvent: {
            id: 5,
            date: new Date('2026-10-20T00:00:00Z'),
            course: { courseCode: 'MATH202' },
          },
        },
      ]);

    const res = mockRes();
    const next = jest.fn();

    await getDashboard(mockReq(), res, next);
    await flushMicrotasks();

    const body = res.json.mock.calls[0][0];
    expect(body.items).toEqual([
      {
        id: 'swap-30',
        type: 'swap-accepted',
        severity: 'info',
        title: 'Your swap with Thabo Molefe awaits organiser approval',
        detail: 'MATH202 on 2026-10-20',
        at: '2026-10-06T12:00:00.000Z',
      },
    ]);
  });

  test('a lecturer sees cover decisions and timesheets awaiting their review', async () => {
    prisma.user.findUnique.mockResolvedValue({ id: 4, role: 'LECTURER' });

    prisma.session.findMany.mockResolvedValue([
      {
        id: 21,
        date: new Date('2026-10-13T00:00:00Z'),
        status: 'PENDING',
        volunteerRequest: {
          userId: 55,
          status: 'PENDING',
          createdAt: new Date('2026-10-06T09:30:00Z'),
          user: { firstName: 'Priya', lastName: 'Singh' },
        },
        courseSlot: { course: { courseCode: 'CS101' } },
      },
    ]);
    prisma.timesheet.findMany.mockResolvedValue([
      {
        id: 8,
        name: 'Week 5',
        totalHours: 6,
        submittedAt: new Date('2026-10-07T14:00:00Z'),
        user: { firstName: 'Thabo', lastName: 'Molefe' },
      },
    ]);

    const res = mockRes();
    const next = jest.fn();

    await getDashboard(mockReq(), res, next);
    await flushMicrotasks();

    // Only the lecturer's own courses, and only upcoming sessions
    expect(prisma.session.findMany).toHaveBeenCalledWith({
      where: {
        status: 'PENDING',
        date: { gte: expect.any(Date) },
        courseSlot: { course: { userId: 4 } },
        volunteerRequest: { status: 'PENDING' },
      },
      include: {
        volunteerRequest: {
          include: { user: { select: { firstName: true, lastName: true } } },
        },
        courseSlot: { include: { course: { select: { courseCode: true } } } },
      },
      orderBy: { date: 'asc' },
    });
    expect(prisma.timesheet.findMany).toHaveBeenCalledWith({
      where: { status: 'SUBMITTED', entries: { some: { supervisorId: 4 } } },
      include: { user: { select: { firstName: true, lastName: true } } },
      orderBy: { submittedAt: 'desc' },
    });

    const body = res.json.mock.calls[0][0];
    expect(body.role).toBe('LECTURER');
    expect(body.items).toEqual([
      {
        id: 'timesheet-8',
        type: 'timesheet-review',
        severity: 'urgent',
        title: "Thabo Molefe's timesheet awaits your review",
        detail: '"Week 5" — 6 hours claimed',
        at: '2026-10-07T14:00:00.000Z',
      },
      {
        id: 'session-21',
        type: 'cover-decision',
        severity: 'urgent',
        title: 'Priya Singh volunteered to cover CS101',
        detail: 'Session on 2026-10-13 — approve or reject the offer',
        at: '2026-10-06T09:30:00.000Z',
      },
    ]);
  });

  test('an organiser sees aggregate queue depths, urgent tiers first', async () => {
    prisma.user.findUnique.mockResolvedValue({ id: 1, role: 'ORGANISER' });

    prisma.course.findMany.mockResolvedValue([
      {
        id: 1,
        courseCode: 'CS101',
        tutorsRequired: 5,
        _count: { assignments: 2 },
      },
      {
        id: 2,
        courseCode: 'MATH202',
        tutorsRequired: 2,
        _count: { assignments: 2 },
      },
      {
        id: 3,
        courseCode: 'CS305',
        tutorsRequired: 3,
        _count: { assignments: 1 },
      },
    ]);
    prisma.session.findMany.mockResolvedValue([
      {
        id: 31,
        date: new Date('2026-10-12T00:00:00Z'),
        courseSlot: { course: { courseCode: 'CS101' } },
      },
      {
        id: 32,
        date: new Date('2026-10-13T00:00:00Z'),
        courseSlot: { course: { courseCode: 'MATH202' } },
      },
    ]);
    prisma.timesheet.count.mockResolvedValue(4);
    prisma.swapRequest.count.mockResolvedValue(2);
    prisma.roleApplication.count.mockResolvedValue(3);
    prisma.application.count.mockResolvedValue(5);

    const res = mockRes();
    const next = jest.fn();

    await getDashboard(mockReq(), res, next);
    await flushMicrotasks();

    expect(prisma.timesheet.count).toHaveBeenCalledWith({ where: { status: 'SUBMITTED' } });
    expect(prisma.swapRequest.count).toHaveBeenCalledWith({ where: { status: 'ACCEPTED' } });
    expect(prisma.roleApplication.count).toHaveBeenCalledWith({ where: { status: 'PENDING' } });
    expect(prisma.application.count).toHaveBeenCalledWith({ where: { status: 'PENDING' } });

    const body = res.json.mock.calls[0][0];
    expect(body.role).toBe('ORGANISER');
    expect(body.items).toEqual([
      {
        id: 'understaffed-courses',
        type: 'understaffed-course',
        severity: 'urgent',
        title: '2 courses below the required tutor count',
        detail: 'CS101, CS305',
        at: null,
      },
      {
        id: 'uncovered-sessions',
        type: 'unassigned-session',
        severity: 'urgent',
        title: '2 upcoming sessions without a tutor',
        detail: 'Next: CS101 on 2026-10-12',
        at: null,
      },
      {
        id: 'timesheet-review',
        type: 'timesheet-review',
        severity: 'urgent',
        title: '4 timesheets awaiting review',
        detail: 'Submitted by tutors and waiting on supervisor approval',
        at: null,
      },
      {
        id: 'swap-review',
        type: 'swap-review',
        severity: 'urgent',
        title: '2 swap requests awaiting approval',
        detail: 'Both tutors have agreed — approving moves the session claims',
        at: null,
      },
      {
        id: 'role-applications',
        type: 'role-application',
        severity: 'info',
        title: '3 role applications to review',
        detail: 'Tutor and lecturer onboarding requests',
        at: null,
      },
      {
        id: 'course-applications',
        type: 'course-application',
        severity: 'info',
        title: '5 tutor applications pending',
        detail: 'Applicants waiting to join a course tutor pool',
        at: null,
      },
    ]);
  });

  test('an admin sees the same aggregates as an organiser', async () => {
    prisma.user.findUnique.mockResolvedValue({ id: 9, role: 'ADMIN' });
    prisma.timesheet.count.mockResolvedValue(1);

    const res = mockRes();
    const next = jest.fn();

    await getDashboard(mockReq(), res, next);
    await flushMicrotasks();

    const body = res.json.mock.calls[0][0];
    expect(body.role).toBe('ADMIN');
    expect(body.items).toEqual([
      {
        id: 'timesheet-review',
        type: 'timesheet-review',
        severity: 'urgent',
        title: '1 timesheet awaiting review',
        detail: 'Submitted by tutors and waiting on supervisor approval',
        at: null,
      },
    ]);
  });

  test('a quiet organiser dashboard is an empty list, not an error', async () => {
    prisma.user.findUnique.mockResolvedValue({ id: 1, role: 'ORGANISER' });

    const res = mockRes();
    const next = jest.fn();

    await getDashboard(mockReq(), res, next);
    await flushMicrotasks();

    const body = res.json.mock.calls[0][0];
    expect(body.items).toEqual([]);
    expect(next).not.toHaveBeenCalled();
  });

  test('a student gets an empty feed — they have no dashboard items', async () => {
    prisma.user.findUnique.mockResolvedValue({ id: 3, role: 'STUDENT' });

    const res = mockRes();
    const next = jest.fn();

    await getDashboard(mockReq(), res, next);
    await flushMicrotasks();

    // No role-specific query should run for students
    expect(prisma.swapRequest.findMany).not.toHaveBeenCalled();
    expect(prisma.course.findMany).not.toHaveBeenCalled();

    const body = res.json.mock.calls[0][0];
    expect(body.role).toBe('STUDENT');
    expect(body.items).toEqual([]);
  });

  test('returns 404 when the requesting user does not exist', async () => {
    prisma.user.findUnique.mockResolvedValue(null);

    const res = mockRes();
    const next = jest.fn();

    await getDashboard(mockReq(), res, next);
    await flushMicrotasks();

    expect(next).toHaveBeenCalledWith(expect.objectContaining({ statusCode: 404 }));
    expect(prisma.timesheet.findMany).not.toHaveBeenCalled();
    expect(res.json).not.toHaveBeenCalled();
  });
});
