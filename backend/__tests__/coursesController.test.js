// Mock the Prisma client before requiring the controller
jest.mock('../prisma/client', () => ({
  course: {
    findMany: jest.fn(),
    findUnique: jest.fn(),
    findFirst: jest.fn(),
    update: jest.fn(),
    updateMany: jest.fn(),
  },
  courseSlot: { deleteMany: jest.fn(), createMany: jest.fn() },
  timeSlot: { findMany: jest.fn() },
  user: { findUnique: jest.fn() },
  $transaction: jest.fn(),
}));

const prisma = require('../prisma/client');
const {
  getCourses,
  getCourse,
  updateCourse,
  updateCourseSlots,
  startApplicationProcess,
} = require('../controllers/courses');

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

function mockReq(overrides = {}) {
  return {
    params: {},
    body: {},
    user: { user_id: 'firebase-uid-1' },
    ...overrides,
  };
}

beforeEach(() => {
  jest.clearAllMocks();
  prisma.$transaction.mockResolvedValue([]);
  // Most tests exercise the staff path — an organiser requesting the full
  // registry. Tests that need another role override this mock.
  prisma.user.findUnique.mockResolvedValue({ id: 1, role: 'ORGANISER' });
});

describe('getCourses', () => {
  test('returns a plain array of courses with allocation progress fields', async () => {
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
        _count: { assignments: 2, slots: 4, applications: 7 },
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
        _count: { assignments: 0, slots: 2, applications: 1 },
      },
    ]);

    const res = mockRes();
    const next = jest.fn();

    await getCourses(mockReq(), res, next);
    await flushMicrotasks();

    expect(prisma.course.findMany).toHaveBeenCalledTimes(1);

    // Newest courses first, with the lecturer and per-relation counts included
    const callArgs = prisma.course.findMany.mock.calls[0][0];
    expect(callArgs.orderBy).toEqual({ createdAt: 'desc' });
    expect(callArgs.include.user).toEqual({ select: { id: true, firstName: true, lastName: true, email: true } });
    expect(callArgs.include._count).toEqual({ select: { assignments: true, slots: true, applications: true } });

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
        applicationsCount: 7,
        assignedTutors: 2,
        tutorsMissing: 3,
        isAllocated: true,
      }),
      expect.objectContaining({
        id: 2,
        courseCode: 'MATH202',
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
        _count: { assignments: 3, slots: 2, applications: 4 },
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
    'rejects a %s with 403 — the registry is staff-only data',
    async (role) => {
      prisma.user.findUnique.mockResolvedValue({ id: 5, role });

      const res = mockRes();
      const next = jest.fn();

      await getCourses(mockReq(), res, next);
      await flushMicrotasks();

      // The catalogue is never queried for applicants — they see open
      // opportunities through GET /applications instead.
      expect(next).toHaveBeenCalledWith(expect.objectContaining({ statusCode: 403 }));
      expect(prisma.course.findMany).not.toHaveBeenCalled();
      expect(res.status).not.toHaveBeenCalled();
    },
  );
});

// ════════════════════════════════════════════════════════════════════════
// Ownership fixtures
// ════════════════════════════════════════════════════════════════════════

const lecturerUser = { id: 5, role: 'LECTURER', firebaseUid: 'firebase-uid-1' };
const organiserUser = { id: 99, role: 'ORGANISER', firebaseUid: 'firebase-uid-1' };

const courseRecord = {
  id: 1,
  courseCode: 'CS101',
  courseName: 'Intro to Programming',
  minimumMark: 50,
  tutorsRequired: 2,
  acceptingApplications: true,
  createdAt: new Date('2026-01-15T10:00:00Z'),
  userId: 5,
  user: { id: 5, firstName: 'Sarah', lastName: 'Van Wyk', email: 'sarah@test.com' },
  slots: [
    {
      id: 10,
      dayOfWeek: 1,
      timeSlotId: 2,
      venue: 'Room 101',
      sessionType: 'LECTURE',
      timeSlot: { startMinute: 480, endMinute: 525 },
    },
  ],
  assignments: [
    {
      userId: 7,
      semester: '2026-S1',
      user: { firstName: 'Alex', lastName: 'Mercer', email: 'alex@test.com' },
    },
  ],
  _count: { applications: 3 },
};

const updatedCourseRecord = {
  id: 1,
  courseCode: 'CS101',
  courseName: 'Intro to Programming',
  minimumMark: 50,
  tutorsRequired: 2,
  slots: [
    { id: 10, dayOfWeek: 1, timeSlotId: 2, timeSlot: { startMinute: 480, endMinute: 525 } },
  ],
};

// ════════════════════════════════════════════════════════════════════════
// getCourses
// ════════════════════════════════════════════════════════════════════════
describe('getCourses', () => {
  const listedCourse = {
    id: 1,
    courseCode: 'CS101',
    courseName: 'Intro to Programming',
    minimumMark: 50,
    tutorsRequired: 2,
    createdAt: new Date('2026-01-15T10:00:00Z'),
    acceptingApplications: false,
    userId: 5,
    user: { id: 5, firstName: 'Sarah', lastName: 'Van Wyk', email: 'sarah@test.com' },
    _count: { assignments: 1, slots: 2, applications: 3 },
  };

  test('scopes a lecturer to the courses they created', async () => {
    prisma.user.findUnique.mockResolvedValue(lecturerUser);
    prisma.course.findMany.mockResolvedValue([listedCourse]);

    const req = mockReq();
    const res = mockRes();
    const next = jest.fn();

    await getCourses(req, res, next);
    await flushMicrotasks();

    expect(prisma.course.findMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: { userId: 5 } }),
    );
    expect(res.status).toHaveBeenCalledWith(200);
    expect(res.json).toHaveBeenCalledWith([
      expect.objectContaining({
        id: 1,
        courseCode: 'CS101',
        assignedTutors: 1,
        tutorsMissing: 1,
        isAllocated: true,
        slotsCount: 2,
      }),
    ]);
    expect(next).not.toHaveBeenCalled();
  });

  test('gives an organiser the unrestricted catalogue', async () => {
    prisma.user.findUnique.mockResolvedValue(organiserUser);
    prisma.course.findMany.mockResolvedValue([listedCourse]);

    const req = mockReq();
    const res = mockRes();
    const next = jest.fn();

    await getCourses(req, res, next);
    await flushMicrotasks();

    expect(prisma.course.findMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: {} }),
    );
    expect(res.status).toHaveBeenCalledWith(200);
    expect(next).not.toHaveBeenCalled();
  });

  test('gives an admin the unrestricted catalogue', async () => {
    prisma.user.findUnique.mockResolvedValue({ id: 77, role: 'ADMIN', firebaseUid: 'firebase-uid-1' });
    prisma.course.findMany.mockResolvedValue([listedCourse]);

    const req = mockReq();
    const res = mockRes();
    const next = jest.fn();

    await getCourses(req, res, next);
    await flushMicrotasks();

    expect(prisma.course.findMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: {} }),
    );
    expect(res.status).toHaveBeenCalledWith(200);
    expect(next).not.toHaveBeenCalled();
  });

  test('returns 403 for tutor and student roles without reading courses', async () => {
    prisma.user.findUnique.mockResolvedValue({ id: 6, role: 'TUTOR', firebaseUid: 'firebase-uid-1' });

    const req = mockReq();
    const res = mockRes();
    const next = jest.fn();

    await getCourses(req, res, next);
    await flushMicrotasks();

    expect(next).toHaveBeenCalledWith(expect.objectContaining({ statusCode: 403 }));
    expect(prisma.course.findMany).not.toHaveBeenCalled();
  });
});

// ════════════════════════════════════════════════════════════════════════
// getCourse
// ════════════════════════════════════════════════════════════════════════
describe('getCourse', () => {
  test('allows a lecturer to view a course they created', async () => {
    prisma.user.findUnique.mockResolvedValue(lecturerUser);
    prisma.course.findUnique.mockResolvedValue(courseRecord);

    const req = mockReq({ params: { courseId: '1' } });
    const res = mockRes();
    const next = jest.fn();

    await getCourse(req, res, next);
    await flushMicrotasks();

    expect(res.status).toHaveBeenCalledWith(200);
    const body = res.json.mock.calls[0][0];
    expect(body).toMatchObject({
      id: 1,
      courseCode: 'CS101',
      assignedCount: 1,
      applicationsCount: 3,
    });
    expect(body.assignedTutors).toEqual([
      expect.objectContaining({ userId: 7, tutorEmail: 'alex@test.com' }),
    ]);
    expect(next).not.toHaveBeenCalled();
  });

  test('returns 403 when a lecturer requests a course created by another lecturer', async () => {
    prisma.user.findUnique.mockResolvedValue(lecturerUser);
    prisma.course.findUnique.mockResolvedValue({ ...courseRecord, userId: 42 });

    const req = mockReq({ params: { courseId: '1' } });
    const res = mockRes();
    const next = jest.fn();

    await getCourse(req, res, next);
    await flushMicrotasks();

    expect(next).toHaveBeenCalledWith(
      expect.objectContaining({
        statusCode: 403,
        message: expect.stringContaining('view courses you have created'),
      }),
    );
    expect(res.status).not.toHaveBeenCalled();
  });

  test('allows an organiser to view any course', async () => {
    prisma.user.findUnique.mockResolvedValue(organiserUser);
    prisma.course.findUnique.mockResolvedValue({ ...courseRecord, userId: 42 });

    const req = mockReq({ params: { courseId: '1' } });
    const res = mockRes();
    const next = jest.fn();

    await getCourse(req, res, next);
    await flushMicrotasks();

    expect(res.status).toHaveBeenCalledWith(200);
    expect(next).not.toHaveBeenCalled();
  });

  test('returns 403 for tutor and student roles without reading the course', async () => {
    prisma.user.findUnique.mockResolvedValue({ id: 6, role: 'TUTOR', firebaseUid: 'firebase-uid-1' });

    const req = mockReq({ params: { courseId: '1' } });
    const res = mockRes();
    const next = jest.fn();

    await getCourse(req, res, next);
    await flushMicrotasks();

    expect(next).toHaveBeenCalledWith(expect.objectContaining({ statusCode: 403 }));
    expect(prisma.course.findUnique).not.toHaveBeenCalled();
  });

  test('returns 404 when the course does not exist', async () => {
    prisma.user.findUnique.mockResolvedValue(lecturerUser);
    prisma.course.findUnique.mockResolvedValue(null);

    const req = mockReq({ params: { courseId: '999' } });
    const res = mockRes();
    const next = jest.fn();

    await getCourse(req, res, next);
    await flushMicrotasks();

    expect(next).toHaveBeenCalledWith(
      expect.objectContaining({ statusCode: 404, message: 'Course not found' }),
    );
  });
});

// ════════════════════════════════════════════════════════════════════════
// updateCourse
// ════════════════════════════════════════════════════════════════════════
describe('updateCourse', () => {
  const updateBody = {
    courseCode: 'CS101',
    courseName: 'Intro to Programming',
    minimumMark: 50,
    tutorsRequired: 2,
    slots: [{ dayOfWeek: 1, timeSlotId: 2 }],
  };

  test('returns 403 when a lecturer updates a course created by another lecturer', async () => {
    prisma.user.findUnique.mockResolvedValue(lecturerUser);
    prisma.course.findUnique.mockResolvedValue({ id: 1, userId: 42 });

    const req = mockReq({ params: { courseId: '1' }, body: updateBody });
    const res = mockRes();
    const next = jest.fn();

    await updateCourse(req, res, next);
    await flushMicrotasks();

    expect(next).toHaveBeenCalledWith(
      expect.objectContaining({
        statusCode: 403,
        message: expect.stringContaining('update courses you have created'),
      }),
    );
    expect(prisma.$transaction).not.toHaveBeenCalled();
  });

  test('allows a lecturer to update a course they created', async () => {
    prisma.user.findUnique.mockResolvedValue(lecturerUser);
    prisma.course.findUnique
      .mockResolvedValueOnce({ id: 1, userId: 5 })
      .mockResolvedValueOnce(updatedCourseRecord);
    prisma.timeSlot.findMany.mockResolvedValue([{ id: 2 }]);
    prisma.course.findFirst.mockResolvedValue(null);

    const req = mockReq({ params: { courseId: '1' }, body: updateBody });
    const res = mockRes();
    const next = jest.fn();

    await updateCourse(req, res, next);
    await flushMicrotasks();

    expect(prisma.$transaction).toHaveBeenCalledTimes(1);
    expect(res.status).toHaveBeenCalledWith(200);
    expect(next).not.toHaveBeenCalled();
  });

  test('allows an organiser to update any course', async () => {
    prisma.user.findUnique.mockResolvedValue(organiserUser);
    prisma.course.findUnique
      .mockResolvedValueOnce({ id: 1, userId: 42 })
      .mockResolvedValueOnce(updatedCourseRecord);
    prisma.timeSlot.findMany.mockResolvedValue([{ id: 2 }]);
    prisma.course.findFirst.mockResolvedValue(null);

    const req = mockReq({ params: { courseId: '1' }, body: updateBody });
    const res = mockRes();
    const next = jest.fn();

    await updateCourse(req, res, next);
    await flushMicrotasks();

    expect(res.status).toHaveBeenCalledWith(200);
    expect(next).not.toHaveBeenCalled();
  });
});

// ════════════════════════════════════════════════════════════════════════
// updateCourseSlots
// ════════════════════════════════════════════════════════════════════════
describe('updateCourseSlots', () => {
  const slotsBody = { slots: [{ dayOfWeek: 0, timeSlotId: 2 }] };

  test('returns 403 when a lecturer updates slots of a course created by another lecturer', async () => {
    prisma.user.findUnique.mockResolvedValue(lecturerUser);
    prisma.course.findUnique.mockResolvedValue({ id: 1, userId: 42 });

    const req = mockReq({ params: { courseId: '1' }, body: slotsBody });
    const res = mockRes();
    const next = jest.fn();

    await updateCourseSlots(req, res, next);
    await flushMicrotasks();

    expect(next).toHaveBeenCalledWith(
      expect.objectContaining({
        statusCode: 403,
        message: expect.stringContaining('slots for courses you have created'),
      }),
    );
    expect(prisma.$transaction).not.toHaveBeenCalled();
  });

  test('allows a lecturer to update slots of a course they created', async () => {
    prisma.user.findUnique.mockResolvedValue(lecturerUser);
    prisma.course.findUnique
      .mockResolvedValueOnce({ id: 1, userId: 5 })
      .mockResolvedValueOnce(updatedCourseRecord);
    prisma.timeSlot.findMany.mockResolvedValue([{ id: 2 }]);

    const req = mockReq({ params: { courseId: '1' }, body: slotsBody });
    const res = mockRes();
    const next = jest.fn();

    await updateCourseSlots(req, res, next);
    await flushMicrotasks();

    expect(prisma.$transaction).toHaveBeenCalledTimes(1);
    expect(res.status).toHaveBeenCalledWith(200);
    expect(next).not.toHaveBeenCalled();
  });
});

// ════════════════════════════════════════════════════════════════════════
// startApplicationProcess
// ════════════════════════════════════════════════════════════════════════
describe('startApplicationProcess', () => {
  test('returns 403 when a lecturer selects a course created by another lecturer', async () => {
    prisma.user.findUnique.mockResolvedValue(lecturerUser);
    prisma.course.findMany.mockResolvedValue([
      { id: 1, userId: 5 },
      { id: 2, userId: 42 },
    ]);

    const req = mockReq({ body: { courseIds: [1, 2] } });
    const res = mockRes();
    const next = jest.fn();

    await startApplicationProcess(req, res, next);
    await flushMicrotasks();

    expect(next).toHaveBeenCalledWith(
      expect.objectContaining({
        statusCode: 403,
        message: expect.stringContaining('start the application process for courses you have created'),
      }),
    );
    expect(prisma.course.updateMany).not.toHaveBeenCalled();
  });

  test('allows a lecturer to open their own courses for applications', async () => {
    prisma.user.findUnique.mockResolvedValue(lecturerUser);
    prisma.course.findMany.mockResolvedValue([
      { id: 1, userId: 5 },
      { id: 2, userId: 5 },
    ]);
    prisma.course.updateMany.mockResolvedValue({ count: 2 });

    const req = mockReq({ body: { courseIds: [1, 2] } });
    const res = mockRes();
    const next = jest.fn();

    await startApplicationProcess(req, res, next);
    await flushMicrotasks();

    expect(prisma.course.updateMany).toHaveBeenCalledTimes(1);
    expect(res.json).toHaveBeenCalledWith({ requestedCount: 2, updatedCount: 2, skippedCount: 0 });
    expect(next).not.toHaveBeenCalled();
  });

  test('allows an organiser to open any course for applications', async () => {
    prisma.user.findUnique.mockResolvedValue(organiserUser);
    prisma.course.findMany.mockResolvedValue([{ id: 2, userId: 42 }]);
    prisma.course.updateMany.mockResolvedValue({ count: 1 });

    const req = mockReq({ body: { courseIds: [2] } });
    const res = mockRes();
    const next = jest.fn();

    await startApplicationProcess(req, res, next);
    await flushMicrotasks();

    expect(prisma.course.updateMany).toHaveBeenCalledTimes(1);
    expect(res.json).toHaveBeenCalledWith({ requestedCount: 1, updatedCount: 1, skippedCount: 0 });
    expect(next).not.toHaveBeenCalled();
  });
});
