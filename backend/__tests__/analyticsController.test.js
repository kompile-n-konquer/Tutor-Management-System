jest.mock('../prisma/client', () => ({
  user: { findUnique: jest.fn(), count: jest.fn(), findMany: jest.fn() },
  course: { findMany: jest.fn() },
  event: { count: jest.fn() },
  session: { groupBy: jest.fn() },
  roleApplication: { groupBy: jest.fn() },
  application: { groupBy: jest.fn() },
  timesheet: { groupBy: jest.fn(), findMany: jest.fn() },
  systemSetting: { findUnique: jest.fn(), findMany: jest.fn() },
}));

const prisma = require('../prisma/client');
const { getOrganiserAnalytics } = require('../controllers/analytics');

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
  // Most tests exercise the organiser path; other role tests override this.
  prisma.user.findUnique.mockResolvedValue({ id: 1, role: 'ORGANISER' });

  // Empty-database baseline — tests override the aggregates they care about.
  prisma.user.count.mockResolvedValue(0);
  prisma.course.findMany.mockResolvedValue([]);
  prisma.event.count.mockResolvedValue(0);
  prisma.session.groupBy.mockResolvedValue([]);
  prisma.roleApplication.groupBy.mockResolvedValue([]);
  prisma.application.groupBy.mockResolvedValue([]);
  prisma.timesheet.groupBy.mockResolvedValue([]);
  prisma.user.findMany.mockResolvedValue([]);
  // No approved timesheets, no configured rates and no monthly budget by default
  prisma.timesheet.findMany.mockResolvedValue([]);
  prisma.systemSetting.findMany.mockResolvedValue([]);
  prisma.systemSetting.findUnique.mockResolvedValue(null);
});

describe('getOrganiserAnalytics', () => {
  test('aggregates every KPI from live database counts', async () => {
    prisma.user.count
      .mockResolvedValueOnce(42) // tutors
      .mockResolvedValueOnce(8) // lecturers
      .mockResolvedValueOnce(310); // students
    prisma.course.findMany.mockResolvedValue([
      {
        id: 1,
        courseCode: 'CS101',
        courseName: 'Intro to Programming',
        tutorsRequired: 5,
        _count: { assignments: 2 },
      },
      {
        id: 2,
        courseCode: 'MATH202',
        courseName: 'Discrete Mathematics',
        tutorsRequired: 2,
        _count: { assignments: 2 },
      },
      {
        id: 3,
        courseCode: 'CS305',
        courseName: 'Database Systems',
        tutorsRequired: 1,
        _count: { assignments: 4 },
      },
    ]);
    // The total count call has no arguments; the upcoming count filters by date.
    prisma.event.count.mockImplementation((args) => Promise.resolve(args ? 4 : 12));
    prisma.session.groupBy.mockResolvedValue([
      { status: 'SCHEDULED', _count: { _all: 5 } },
      { status: 'UNASSIGNED', _count: { _all: 2 } },
      { status: 'PENDING', _count: { _all: 1 } },
    ]);
    prisma.roleApplication.groupBy.mockResolvedValue([
      { status: 'PENDING', _count: { _all: 2 } },
      { status: 'APPROVED', _count: { _all: 1 } },
      // No REJECTED group — the response must still expose a 0.
    ]);
    prisma.application.groupBy.mockResolvedValue([
      { status: 'PENDING', _count: { _all: 3 } },
      { status: 'ASSIGNED', _count: { _all: 4 } },
      { status: 'REJECTED', _count: { _all: 1 } },
    ]);
    // Two shaped groupBy calls — per status for the funnel, per user for workload.
    prisma.timesheet.groupBy.mockImplementation((args) =>
      args.by.includes('userId')
        ? Promise.resolve([
            { userId: 2, status: 'APPROVED', _sum: { totalHours: 6 } },
            { userId: 2, status: 'SUBMITTED', _sum: { totalHours: 3 } },
            { userId: 1, status: 'APPROVED', _sum: { totalHours: 10 } },
          ])
        : Promise.resolve([
            { status: 'DRAFT', _count: { _all: 2 }, _sum: { totalHours: 0 } },
            { status: 'SUBMITTED', _count: { _all: 3 }, _sum: { totalHours: 12 } },
            { status: 'APPROVED', _count: { _all: 5 }, _sum: { totalHours: 42.5 } },
            { status: 'REJECTED', _count: { _all: 1 }, _sum: { totalHours: 4 } },
          ]),
    );
    prisma.user.findMany.mockResolvedValue([
      { id: 1, firstName: 'Thabo', lastName: 'Molefe' },
      { id: 2, firstName: 'Riya', lastName: 'Naidoo' },
    ]);
    // Spending inputs — one approved-timesheet query, the rate rows and the budget row.
    // The 3rd-year rate is R150/h; the other years are unset, so those tutors spend R0.
    const now = new Date();
    const monthsAgo = (n) => new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() - n, 10));
    prisma.timesheet.findMany.mockResolvedValue([
      { totalHours: 10, approvedAt: monthsAgo(2), user: { yearOfStudy: '3rd year' } },
      { totalHours: 5, approvedAt: monthsAgo(0), user: { yearOfStudy: '3rd year' } },
      { totalHours: 6, approvedAt: monthsAgo(0), user: { yearOfStudy: 'honours' } }, // rate unset -> R0
      { totalHours: 8, approvedAt: monthsAgo(13), user: { yearOfStudy: '3rd year' } }, // outside the 12-month window
    ]);
    prisma.systemSetting.findMany.mockResolvedValue([
      { key: 'HOURLY_RATE_3RD_YEAR', value: '150' },
    ]);
    prisma.systemSetting.findUnique.mockResolvedValue({ key: 'MONTHLY_BUDGET', value: '150000' });

    const res = mockRes();
    const next = jest.fn();

    await getOrganiserAnalytics(mockReq(), res, next);
    await flushMicrotasks();

    expect(prisma.user.findUnique).toHaveBeenCalledWith({
      where: { firebaseUid: 'uid-123' },
    });
    expect(prisma.user.count).toHaveBeenNthCalledWith(1, { where: { role: 'TUTOR' } });
    expect(prisma.user.count).toHaveBeenNthCalledWith(2, { where: { role: 'LECTURER' } });
    expect(prisma.user.count).toHaveBeenNthCalledWith(3, { where: { role: 'STUDENT' } });
    expect(prisma.event.count).toHaveBeenLastCalledWith({
      where: { date: { gte: expect.any(Date) } },
    });
    expect(prisma.timesheet.groupBy).toHaveBeenCalledWith({
      by: ['status'],
      _count: { _all: true },
      _sum: { totalHours: true },
    });

    expect(res.status).toHaveBeenCalledWith(200);
    expect(next).not.toHaveBeenCalled();

    const body = res.json.mock.calls[0][0];
    expect(body.totals).toEqual({
      tutors: 42,
      lecturers: 8,
      students: 310,
      courses: 3,
      events: 12,
      upcomingEvents: 4,
    });

    // 5 + 2 + 1 tutors required across 8 assigned; only CS101 is understaffed.
    expect(body.staffing).toEqual({
      required: 8,
      assigned: 8,
      understaffedCourses: 1,
      courses: [
        { id: 1, courseCode: 'CS101', courseName: 'Intro to Programming', tutorsRequired: 5, assigned: 2 },
        { id: 2, courseCode: 'MATH202', courseName: 'Discrete Mathematics', tutorsRequired: 2, assigned: 2 },
        { id: 3, courseCode: 'CS305', courseName: 'Database Systems', tutorsRequired: 1, assigned: 4 },
      ],
    });

    expect(body.sessions).toEqual({ scheduled: 5, unassigned: 2, pendingCover: 1 });
    expect(body.timesheets).toEqual({
      draft: 2,
      submitted: 3,
      approved: 5,
      rejected: 1,
      approvedHours: 42.5,
      submittedHours: 12,
      // 5 approved out of 9 reviewed (submitted + approved + rejected) = 56%.
      signOffRate: 56,
    });
    expect(body.applications).toEqual({
      role: { pending: 2, approved: 1, rejected: 0 },
      course: { pending: 3, assigned: 4, rejected: 1 },
    });

    // Workload collapses per-user rows, resolves names and sorts by approved hours.
    expect(body.workload).toEqual([
      { userId: 1, approvedHours: 10, submittedHours: 0, name: 'Thabo Molefe' },
      { userId: 2, approvedHours: 6, submittedHours: 3, name: 'Riya Naidoo' },
    ]);

    // Spending: only approved timesheets count, priced at the tutor's year-of-study
    // rate, bucketed by approval month over a rolling 12-month window.
    expect(prisma.timesheet.findMany).toHaveBeenCalledWith({
      where: { status: 'APPROVED', approvedAt: { not: null } },
      select: {
        totalHours: true,
        approvedAt: true,
        user: { select: { yearOfStudy: true } },
      },
    });
    expect(body.spending.monthlyBudget).toBe(150000);
    expect(body.spending.months).toHaveLength(12);
    const monthKey = (date) =>
      `${date.getUTCFullYear()}-${String(date.getUTCMonth() + 1).padStart(2, '0')}`;
    // Newest month last: the current month holds R750, two months back R1500.
    expect(body.spending.months[11]).toEqual({ month: monthKey(now), amount: 750 });
    expect(body.spending.months[9]).toEqual({ month: monthKey(monthsAgo(2)), amount: 1500 });
    // Months without approvals — and the one 13 months back — contribute nothing.
    expect(body.spending.months[10].amount).toBe(0);
    expect(body.spending.months[0].amount).toBe(0);
    expect(body.spending.months.some((month) => month.amount === 1200)).toBe(false);
  });

  test('reports a zero sign-off rate before any timesheet enters review', async () => {
    prisma.timesheet.groupBy.mockImplementation((args) =>
      args.by.includes('userId')
        ? Promise.resolve([])
        : Promise.resolve([{ status: 'DRAFT', _count: { _all: 4 }, _sum: { totalHours: 9 } }]),
    );

    const res = mockRes();
    const next = jest.fn();

    await getOrganiserAnalytics(mockReq(), res, next);
    await flushMicrotasks();

    const body = res.json.mock.calls[0][0];
    expect(body.timesheets.draft).toBe(4);
    expect(body.timesheets.signOffRate).toBe(0);
    expect(body.timesheets.approvedHours).toBe(0);
    // No workload rows means the user lookup for names is skipped entirely.
    expect(prisma.user.findMany).not.toHaveBeenCalled();
    expect(body.workload).toEqual([]);
  });

  test('an admin can view the same aggregates as an organiser', async () => {
    prisma.user.findUnique.mockResolvedValue({ id: 9, role: 'ADMIN' });

    const res = mockRes();
    const next = jest.fn();

    await getOrganiserAnalytics(mockReq(), res, next);
    await flushMicrotasks();

    expect(res.status).toHaveBeenCalledWith(200);
    expect(next).not.toHaveBeenCalled();

    const body = res.json.mock.calls[0][0];
    expect(body.totals).toEqual({
      tutors: 0,
      lecturers: 0,
      students: 0,
      courses: 0,
      events: 0,
      upcomingEvents: 0,
    });
    expect(body.staffing).toEqual({ required: 0, assigned: 0, understaffedCourses: 0, courses: [] });
    expect(body.sessions).toEqual({ scheduled: 0, unassigned: 0, pendingCover: 0 });
    expect(body.timesheets.signOffRate).toBe(0);
    expect(body.applications).toEqual({
      role: { pending: 0, approved: 0, rejected: 0 },
      course: { pending: 0, assigned: 0, rejected: 0 },
    });
    expect(body.workload).toEqual([]);
  });

  test.each(['TUTOR', 'LECTURER', 'STUDENT', 'tutor'])(
    'rejects a %s with 403 before touching any aggregate query',
    async (role) => {
      prisma.user.findUnique.mockResolvedValue({ id: 5, role });

      const res = mockRes();
      const next = jest.fn();

      await getOrganiserAnalytics(mockReq(), res, next);
      await flushMicrotasks();

      expect(next).toHaveBeenCalledWith(
        expect.objectContaining({ statusCode: 403 }),
      );
      expect(prisma.user.count).not.toHaveBeenCalled();
      expect(prisma.course.findMany).not.toHaveBeenCalled();
      expect(res.json).not.toHaveBeenCalled();
    },
  );

  test('returns 404 when the requesting user does not exist', async () => {
    prisma.user.findUnique.mockResolvedValue(null);

    const res = mockRes();
    const next = jest.fn();

    await getOrganiserAnalytics(mockReq(), res, next);
    await flushMicrotasks();

    expect(next).toHaveBeenCalledWith(
      expect.objectContaining({ statusCode: 404 }),
    );
    expect(prisma.user.count).not.toHaveBeenCalled();
    expect(res.json).not.toHaveBeenCalled();
  });
});
