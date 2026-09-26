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
  getAllCourses,
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
});

describe('getAllCourses', () => {
  test('returns courses mapped to the expected shape', async () => {
    prisma.course.findMany.mockResolvedValue([
      {
        id: 1,
        courseCode: 'CS101',
        courseName: 'Intro to Programming',
        minimumMark: 50,
        requiredTutors: 5,
        budgetHours: 40,
        hourlyRate: 150,
        lecturerId: 10,
        _count: { assignments: 3 },
        lecturer: { user: { firstName: 'Kgaogelo', lastName: 'Mabuza' } },
      },
      {
        id: 2,
        courseCode: 'MATH202',
        courseName: 'Discrete Mathematics',
        minimumMark: 60,
        requiredTutors: 2,
        budgetHours: 20,
        hourlyRate: 160,
        lecturerId: 11,
        _count: { assignments: 0 },
        lecturer: { user: { firstName: 'Alice', lastName: 'Smith' } },
      },
    ]);

    const req = {};
    const res = mockRes();
    const next = jest.fn();

    await getAllCourses(req, res, next);
    await flushMicrotasks();

    expect(prisma.course.findMany).toHaveBeenCalledTimes(1);

    // Verify ordering and include shape
    const callArgs = prisma.course.findMany.mock.calls[0][0];
    expect(callArgs.orderBy).toEqual({ courseCode: 'asc' });
    expect(callArgs.include._count).toEqual({ select: { assignments: true } });

    expect(res.json).toHaveBeenCalledWith({
      courses: [
        expect.objectContaining({
          id: 1,
          courseCode: 'CS101',
          courseName: 'Intro to Programming',
          requiredTutors: 5,
          budgetHours: 40,
          hourlyRate: 150,
          assignedCount: 3,
          lecturer: 'Kgaogelo Mabuza',
        }),
        expect.objectContaining({
          id: 2,
          courseCode: 'MATH202',
          assignedCount: 0,
          lecturer: 'Alice Smith',
        }),
      ],
    });
    expect(next).not.toHaveBeenCalled();
  });

  test('handles null lecturer gracefully', async () => {
    prisma.course.findMany.mockResolvedValue([
      {
        id: 3,
        courseCode: 'CS305',
        courseName: 'Database Systems',
        minimumMark: 55,
        requiredTutors: 4,
        budgetHours: 35,
        hourlyRate: 155,
        lecturerId: 99,
        _count: { assignments: 1 },
        lecturer: null,
      },
    ]);

    const res = mockRes();
    const next = jest.fn();

    await getAllCourses({}, res, next);
    await flushMicrotasks();

    const body = res.json.mock.calls[0][0];
    expect(body.courses[0].lecturer).toBeNull();
    expect(next).not.toHaveBeenCalled();
  });

  test('returns empty array when no courses exist', async () => {
    prisma.course.findMany.mockResolvedValue([]);

    const res = mockRes();
    const next = jest.fn();

    await getAllCourses({}, res, next);
    await flushMicrotasks();

    expect(res.json).toHaveBeenCalledWith({ courses: [] });
    expect(next).not.toHaveBeenCalled();
  });
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
