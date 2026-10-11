// Mock the Prisma client before requiring the controller
jest.mock('../prisma/client', () => ({
  user: { findUnique: jest.fn() },
  course: {
    findMany: jest.fn(),
    findUnique: jest.fn(),
    updateMany: jest.fn(),
    update: jest.fn(),
  },
  courseSlot: { deleteMany: jest.fn(), createMany: jest.fn() },
  $transaction: jest.fn(),
}));

const prisma = require('../prisma/client');
const { getCourses, getCourse, updateCourse, startApplicationProcess } = require('../controllers/courses');

// catchAsync does not `return` the inner promise — flushMicrotasks waits
// for the background async work to settle before assertions run.
function flushMicrotasks() {
  return new Promise((resolve) => setImmediate(resolve));
}

function mockReq() {
  return { user: { user_id: 'uid-123' }, params: {}, body: {} };
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
  // Most tests exercise the staff path — an organiser requesting the full
  // registry. Tests that need another role override this mock.
  prisma.user.findUnique.mockResolvedValue({ id: 1, role: 'ORGANISER' });
  // getCourse aggregates — no approved timesheets and no configured rates by default
  prisma.timesheet.groupBy.mockResolvedValue([]);
  prisma.systemSetting.findMany.mockResolvedValue([]);
});

describe('getCourses', () => {
  test('returns a plain array of courses with allocation progress and claimable-hours fields', async () => {
    prisma.course.findMany.mockResolvedValue([
      {
        id: 1,
        courseCode: 'CS101',
        courseName: 'Intro to Programming',
        minimumMark: 50,
        tutorsRequired: 5,
        createdAt: new Date('2026-09-10T00:00:00.000Z'),
        acceptingApplications: true,
        user: { id: 10, firstName: 'Kgaogelo', lastName: 'Mabuza', email: 'kgaogelo@wits.ac.za' },
        // Four slots — three 45-minute and one 90-minute — claim 5 rounded-up hours
        slots: [
          { timeSlot: { startMinute: 480, endMinute: 525 } },
          { timeSlot: { startMinute: 525, endMinute: 570 } },
          { timeSlot: { startMinute: 600, endMinute: 645 } },
          { timeSlot: { startMinute: 660, endMinute: 750 } },
        ],
        _count: { assignments: 2, applications: 7 },
      },
      {
        id: 2,
        courseCode: 'MATH202',
        courseName: 'Discrete Mathematics',
        minimumMark: 60,
        tutorsRequired: 3,
        createdAt: new Date('2026-09-11T00:00:00.000Z'),
        acceptingApplications: false,
        user: { id: 11, firstName: 'Alice', lastName: 'Smith', email: 'alice@wits.ac.za' },
        // Two 45-minute slots — claim 2 rounded-up hours
        slots: [
          { timeSlot: { startMinute: 480, endMinute: 525 } },
          { timeSlot: { startMinute: 540, endMinute: 585 } },
        ],
        _count: { assignments: 0, applications: 1 },
      },
    ]);

    const res = mockRes();
    const next = jest.fn();

    await getCourses(mockReq(), res, next);
    await flushMicrotasks();

    expect(prisma.course.findMany).toHaveBeenCalledTimes(1);

    // Newest courses first, with the lecturer, tutoring slots and per-relation counts included
    const callArgs = prisma.course.findMany.mock.calls[0][0];
    expect(callArgs.orderBy).toEqual({ createdAt: 'desc' });
    expect(callArgs.include.user).toEqual({ select: { id: true, firstName: true, lastName: true, email: true } });
    expect(callArgs.include.slots).toEqual({ include: { timeSlot: true } });
    expect(callArgs.include._count).toEqual({ select: { assignments: true, applications: true } });

    // The frontend (ViewAllCourses, Organiser board, global search) consumes a
    // plain array — not a { courses } wrapper.
    const body = res.json.mock.calls[0][0];
    expect(Array.isArray(body)).toBe(true);
    expect(body).toEqual([
      expect.objectContaining({
        id: 1,
        courseCode: 'CS101',
        courseName: 'Intro to Programming',
        minimumMark: 50,
        tutorsRequired: 5,
        acceptingApplications: true,
        lecturer: { id: 10, firstName: 'Kgaogelo', lastName: 'Mabuza', email: 'kgaogelo@wits.ac.za' },
        slotsCount: 4,
        claimableHours: 5,
        applicationsCount: 7,
        assignedTutors: 2,
        tutorsMissing: 3,
        isAllocated: true,
      }),
      expect.objectContaining({
        id: 2,
        courseCode: 'MATH202',
        slotsCount: 2,
        claimableHours: 2,
        assignedTutors: 0,
        tutorsMissing: 3,
        isAllocated: false,
      }),
    ]);
    expect(res.status).toHaveBeenCalledWith(200);
    expect(next).not.toHaveBeenCalled();
  });

  test('never reports negative tutorsMissing when a course is overstaffed', async () => {
    prisma.course.findMany.mockResolvedValue([
      {
        id: 3,
        courseCode: 'CS305',
        courseName: 'Database Systems',
        minimumMark: 55,
        tutorsRequired: 1,
        createdAt: new Date('2026-09-12T00:00:00.000Z'),
        acceptingApplications: false,
        user: null,
        // A 45-minute and a 60-minute slot both round up to one hour each
        slots: [
          { timeSlot: { startMinute: 480, endMinute: 525 } },
          { timeSlot: { startMinute: 600, endMinute: 660 } },
        ],
        _count: { assignments: 3, applications: 4 },
      },
    ]);

    const res = mockRes();
    const next = jest.fn();

    await getCourses(mockReq(), res, next);
    await flushMicrotasks();

    const body = res.json.mock.calls[0][0];
    expect(body[0].assignedTutors).toBe(3);
    expect(body[0].tutorsMissing).toBe(0);
    expect(body[0].isAllocated).toBe(true);
    expect(body[0].claimableHours).toBe(2);
    expect(next).not.toHaveBeenCalled();
  });

  test('returns an empty array when no courses exist', async () => {
    prisma.course.findMany.mockResolvedValue([]);

    const res = mockRes();
    const next = jest.fn();

    await getCourses(mockReq(), res, next);
    await flushMicrotasks();

    expect(res.status).toHaveBeenCalledWith(200);
    expect(res.json).toHaveBeenCalledWith([]);
    expect(next).not.toHaveBeenCalled();
  });

  test('returns 404 when the requesting user does not exist', async () => {
    prisma.user.findUnique.mockResolvedValue(null);

    const res = mockRes();
    const next = jest.fn();

    await getCourses(mockReq(), res, next);
    await flushMicrotasks();

    expect(next).toHaveBeenCalledWith(
      expect.objectContaining({ statusCode: 404 }),
    );
    expect(prisma.course.findMany).not.toHaveBeenCalled();
  });

  test.each(['STUDENT', 'TUTOR'])(
    'returns an empty list for a %s — the registry is staff-only data',
    async (role) => {
      prisma.user.findUnique.mockResolvedValue({ id: 5, role });

      const res = mockRes();
      const next = jest.fn();

      await getCourses(mockReq(), res, next);
      await flushMicrotasks();

      // The catalogue is never queried for applicants — they see open
      // opportunities through GET /applications instead.
      expect(prisma.course.findMany).not.toHaveBeenCalled();
      expect(res.status).toHaveBeenCalledWith(200);
      expect(res.json).toHaveBeenCalledWith([]);
      expect(next).not.toHaveBeenCalled();
    },
  );

  test('scopes the catalogue to the requesting lecturer’s own courses', async () => {
    prisma.user.findUnique.mockResolvedValue({ id: 7, role: 'LECTURER' });
    prisma.course.findMany.mockResolvedValue([]);

    const res = mockRes();
    const next = jest.fn();

    await getCourses(mockReq(), res, next);
    await flushMicrotasks();

    // The where clause is the ownership gate: only courses created by
    // user 7 may leave the database.
    expect(prisma.course.findMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: { userId: 7 } }),
    );
    expect(res.status).toHaveBeenCalledWith(200);
    expect(res.json).toHaveBeenCalledWith([]);
    expect(next).not.toHaveBeenCalled();
  });

  test('keeps the full catalogue global for an organiser', async () => {
    prisma.course.findMany.mockResolvedValue([]);

    const res = mockRes();
    const next = jest.fn();

    await getCourses(mockReq(), res, next);
    await flushMicrotasks();

    expect(prisma.course.findMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: {} }),
    );
    expect(next).not.toHaveBeenCalled();
  });
});

describe('getCourse', () => {
  const staffCourse = {
    id: 1,
    courseCode: 'CS101',
    courseName: 'Intro to Programming',
    minimumMark: 50,
    tutorsRequired: 5,
    acceptingApplications: true,
    createdAt: new Date('2026-09-10T00:00:00.000Z'),
    userId: 7,
    user: { id: 7, firstName: 'Kgaogelo', lastName: 'Mabuza', email: 'kgaogelo@wits.ac.za' },
    slots: [],
    assignments: [],
    _count: { applications: 2 },
  };

  test.each(['STUDENT', 'TUTOR'])(
    'rejects a %s — tutor names and emails are staff-only data',
    async (role) => {
      prisma.user.findUnique.mockResolvedValue({ id: 5, role });

      const req = { ...mockReq(), params: { courseId: '1' } };
      const res = mockRes();
      const next = jest.fn();

      await getCourse(req, res, next);
      await flushMicrotasks();

      expect(next).toHaveBeenCalledWith(expect.objectContaining({ statusCode: 403 }));
      expect(prisma.course.findUnique).not.toHaveBeenCalled();
    },
  );

  test('rejects a lecturer reading a course they did not create', async () => {
    prisma.user.findUnique.mockResolvedValue({ id: 8, role: 'LECTURER' });
    prisma.course.findUnique.mockResolvedValue(staffCourse); // owned by user 7

    const req = { ...mockReq(), params: { courseId: '1' } };
    const res = mockRes();
    const next = jest.fn();

    await getCourse(req, res, next);
    await flushMicrotasks();

    expect(next).toHaveBeenCalledWith(expect.objectContaining({ statusCode: 403 }));
    expect(res.json).not.toHaveBeenCalled();
  });

  test('lets the owning lecturer read their own course', async () => {
    prisma.user.findUnique.mockResolvedValue({ id: 7, role: 'LECTURER' });
    prisma.course.findUnique.mockResolvedValue(staffCourse);

    const req = { ...mockReq(), params: { courseId: '1' } };
    const res = mockRes();
    const next = jest.fn();

    await getCourse(req, res, next);
    await flushMicrotasks();

    expect(res.status).toHaveBeenCalledWith(200);
    expect(res.json).toHaveBeenCalledWith(expect.objectContaining({ courseCode: 'CS101' }));
    expect(next).not.toHaveBeenCalled();
  });

  test('returns 404 for a course that does not exist', async () => {
    prisma.user.findUnique.mockResolvedValue({ id: 1, role: 'ORGANISER' });
    prisma.course.findUnique.mockResolvedValue(null);

    const req = { ...mockReq(), params: { courseId: '1' } };
    const res = mockRes();
    const next = jest.fn();

    await getCourse(req, res, next);
    await flushMicrotasks();

    expect(next).toHaveBeenCalledWith(expect.objectContaining({ statusCode: 404 }));
  });
});

describe('updateCourse ownership', () => {
  test('rejects a lecturer updating a course they did not create', async () => {
    prisma.user.findUnique.mockResolvedValue({ id: 8, role: 'LECTURER' });
    prisma.course.findUnique.mockResolvedValue({ id: 1, userId: 7 });

    const req = { ...mockReq(), params: { courseId: '1' } };
    const res = mockRes();
    const next = jest.fn();

    await updateCourse(req, res, next);
    await flushMicrotasks();

    expect(next).toHaveBeenCalledWith(expect.objectContaining({ statusCode: 403 }));
    // The rejection happens before any validation or write work.
    expect(prisma.$transaction).not.toHaveBeenCalled();
  });
});

describe('startApplicationProcess ownership', () => {
  test('rejects a lecturer opening applications on a foreign course', async () => {
    prisma.user.findUnique.mockResolvedValue({ id: 8, role: 'LECTURER' });
    prisma.course.findMany.mockResolvedValue([{ id: 1, userId: 7 }]);

    const req = { user: { user_id: 'uid-123' }, body: { courseIds: [1] } };
    const res = mockRes();
    const next = jest.fn();

    await startApplicationProcess(req, res, next);
    await flushMicrotasks();

    expect(next).toHaveBeenCalledWith(expect.objectContaining({ statusCode: 403 }));
    expect(prisma.course.updateMany).not.toHaveBeenCalled();
  });

  test('lets an organiser open applications on any course', async () => {
    prisma.user.findUnique.mockResolvedValue({ id: 1, role: 'ORGANISER' });
    prisma.course.findMany.mockResolvedValue([{ id: 1, userId: 7 }]);
    prisma.course.updateMany.mockResolvedValue({ count: 1 });

    const req = { user: { user_id: 'uid-123' }, body: { courseIds: [1] } };
    const res = mockRes();
    const next = jest.fn();

    await startApplicationProcess(req, res, next);
    await flushMicrotasks();

    expect(res.status).toHaveBeenCalledWith(200);
    expect(res.json).toHaveBeenCalledWith({ requestedCount: 1, updatedCount: 1, skippedCount: 0 });
    expect(next).not.toHaveBeenCalled();
  });
});

describe('getCourse', () => {
  test("derives each tutor's spent amount, claimed hours and claims from approved timesheets", async () => {
    prisma.course.findUnique.mockResolvedValue({
      id: 1,
      courseCode: 'CS101',
      courseName: 'Intro to Programming',
      minimumMark: 50,
      tutorsRequired: 2,
      acceptingApplications: true,
      createdAt: new Date('2026-09-10T00:00:00.000Z'),
      user: { id: 10, firstName: 'Kgaogelo', lastName: 'Mabuza', email: 'kgaogelo@wits.ac.za' },
      slots: [
        { id: 1, dayOfWeek: 0, timeSlotId: 3, venue: null, sessionType: null, timeSlot: { startMinute: 480, endMinute: 525 } },
      ],
      assignments: [
        {
          userId: 7,
          semester: 'Semester 2 - 2026',
          user: { firstName: 'Thabo', lastName: 'Molefe', email: 'thabo@wits.ac.za', yearOfStudy: '3rd year' },
        },
        {
          userId: 8,
          semester: 'Semester 2 - 2026',
          user: { firstName: 'Riya', lastName: 'Naidoo', email: 'riya@wits.ac.za', yearOfStudy: 'honours' },
        },
      ],
      _count: { applications: 7 },
    });
    // Thabo has three approved timesheets totalling 12 hours; Riya has none.
    prisma.timesheet.groupBy.mockResolvedValue([
      { userId: 7, _count: { _all: 3 }, _sum: { totalHours: 12 } },
    ]);
    // Only the 3rd-year rate is configured (R150/h) — the honours rate is unset,
    // so an honours tutor cannot have spent anything yet.
    prisma.systemSetting.findMany.mockResolvedValue([
      { key: 'HOURLY_RATE_3RD_YEAR', value: '150' },
    ]);

    const res = mockRes();
    const next = jest.fn();

    await getCourse({ params: { courseId: '1' } }, res, next);
    await flushMicrotasks();

    expect(prisma.timesheet.groupBy).toHaveBeenCalledWith({
      by: ['userId'],
      where: { userId: { in: [7, 8] }, status: 'APPROVED' },
      _count: { _all: true },
      _sum: { totalHours: true },
    });

    const body = res.json.mock.calls[0][0];
    expect(res.status).toHaveBeenCalledWith(200);
    expect(next).not.toHaveBeenCalled();

    // One 45-minute slot rounds up to a single claimable hour
    expect(body.claimableHours).toBe(1);
    expect(body.assignedCount).toBe(2);
    expect(body.assignedTutors).toEqual([
      {
        userId: 7,
        tutorName: 'Thabo Molefe',
        tutorEmail: 'thabo@wits.ac.za',
        semester: 'Semester 2 - 2026',
        claimedHours: 12,
        claims: 3,
        spent: 1800, // 12 hours x R150
      },
      {
        userId: 8,
        tutorName: 'Riya Naidoo',
        tutorEmail: 'riya@wits.ac.za',
        semester: 'Semester 2 - 2026',
        claimedHours: 0,
        claims: 0,
        spent: 0,
      },
    ]);
  });

  test('skips the timesheet aggregation entirely when the course has no tutors', async () => {
    prisma.course.findUnique.mockResolvedValue({
      id: 2,
      courseCode: 'MATH202',
      courseName: 'Discrete Mathematics',
      minimumMark: 60,
      tutorsRequired: 1,
      acceptingApplications: false,
      createdAt: new Date('2026-09-11T00:00:00.000Z'),
      user: null,
      slots: [],
      assignments: [],
      _count: { applications: 0 },
    });

    const res = mockRes();
    const next = jest.fn();

    await getCourse({ params: { courseId: '2' } }, res, next);
    await flushMicrotasks();

    expect(prisma.timesheet.groupBy).not.toHaveBeenCalled();
    const body = res.json.mock.calls[0][0];
    expect(body.assignedTutors).toEqual([]);
    expect(body.assignedCount).toBe(0);
    expect(body.tutorsMissing).toBe(1);
    expect(body.isAllocated).toBe(false);
  });

  test('returns 404 when the course does not exist', async () => {
    prisma.course.findUnique.mockResolvedValue(null);

    const res = mockRes();
    const next = jest.fn();

    await getCourse({ params: { courseId: '999' } }, res, next);
    await flushMicrotasks();

    expect(next).toHaveBeenCalledWith(
      expect.objectContaining({ statusCode: 404 }),
    );
    expect(prisma.timesheet.groupBy).not.toHaveBeenCalled();
    expect(res.json).not.toHaveBeenCalled();
  });

  test('returns 400 when the courseId is not a number', async () => {
    const res = mockRes();
    const next = jest.fn();

    await getCourse({ params: { courseId: 'abc' } }, res, next);
    await flushMicrotasks();

    expect(next).toHaveBeenCalledWith(
      expect.objectContaining({ statusCode: 400 }),
    );
    expect(prisma.course.findUnique).not.toHaveBeenCalled();
  });
});
