// Locks the applications controller's rules: opportunities are only visible
// when the caller's availability covers every course slot, applications follow
// a strict validation chain and the organiser-set hours cap is enforced as a
// backstop on top of the opportunity-page warning.
jest.mock('../prisma/client', () => ({
  user: { findUnique: jest.fn() },
  course: { findMany: jest.fn(), findUnique: jest.fn() },
  availability: { findMany: jest.fn() },
  application: { findMany: jest.fn(), findFirst: jest.fn(), create: jest.fn() },
  tutorAssignment: { findMany: jest.fn() },
  systemSetting: { findUnique: jest.fn() },
}));

const prisma = require('../prisma/client');
const {
  getOpportunities,
  getOpportunity,
  createApplication,
  getMyApplications,
} = require('../controllers/applications');

// catchAsync does not `return` the inner promise — flushMicrotasks waits
// for the background async work to settle before assertions run.
function flushMicrotasks() {
  return new Promise((resolve) => setImmediate(resolve));
}

// Asserts next() received a single http-style error with the expected code + message.
const expectHttpError = (next, statusCode, message) => {
  expect(next).toHaveBeenCalledTimes(1);
  const error = next.mock.calls[0][0];
  expect(error.statusCode).toBe(statusCode);
  expect(error.message).toBe(message);
};

function mockReq(overrides = {}) {
  return { user: { user_id: 'uid-123' }, params: {}, query: {}, body: {}, ...overrides };
}

function mockRes() {
  const res = {};
  res.status = jest.fn().mockReturnValue(res);
  res.json = jest.fn().mockReturnValue(res);
  res.end = jest.fn().mockReturnValue(res);
  return res;
}

// A course shaped like the include the opportunities endpoints use. Its two
// 45-minute Monday slots claim 2 rounded-up hours.
const courseFixture = (overrides = {}) => ({
  id: 1,
  courseCode: 'CS101',
  courseName: 'Intro to Programming',
  minimumMark: 50,
  tutorsRequired: 3,
  createdAt: new Date('2026-09-01T00:00:00.000Z'),
  acceptingApplications: true,
  user: { firstName: 'Kgaogelo', lastName: 'Mabuza' },
  slots: [
    { dayOfWeek: 1, timeSlotId: 1, timeSlot: { startMinute: 480, endMinute: 525 } },
    { dayOfWeek: 1, timeSlotId: 2, timeSlot: { startMinute: 600, endMinute: 645 } },
  ],
  _count: { assignments: 2 },
  ...overrides,
});

// The availability that covers every slot of courseFixture
const COVERING_AVAILABILITY = [
  { dayOfWeek: 1, timeSlotId: 1 },
  { dayOfWeek: 1, timeSlotId: 2 },
];

beforeEach(() => {
  jest.clearAllMocks();
  // Lowercase on purpose — the controller normalises with toUpperCase()
  prisma.user.findUnique.mockResolvedValue({ id: 21, role: 'student' });
  prisma.availability.findMany.mockResolvedValue(COVERING_AVAILABILITY);
  prisma.application.findMany.mockResolvedValue([]);
  prisma.application.findFirst.mockResolvedValue(null);
  prisma.tutorAssignment.findMany.mockResolvedValue([]);
  prisma.systemSetting.findUnique.mockResolvedValue(null);
});

describe('getOpportunities', () => {
  test('returns 404 when the caller has no profile yet', async () => {
    prisma.user.findUnique.mockResolvedValue(null);

    const res = mockRes();
    const next = jest.fn();

    await getOpportunities(mockReq(), res, next);
    await flushMicrotasks();

    expectHttpError(next, 404, 'User not found. Please check if the user exists');
    expect(prisma.course.findMany).not.toHaveBeenCalled();
  });

  test('rejects staff roles — only applicants browse opportunities', async () => {
    prisma.user.findUnique.mockResolvedValue({ id: 7, role: 'LECTURER' });

    const res = mockRes();
    const next = jest.fn();

    await getOpportunities(mockReq(), res, next);
    await flushMicrotasks();

    expectHttpError(next, 403, 'Only students and tutors can view tutoring opportunities');
  });

  test('only returns courses whose slots fit the availability and that were not applied to', async () => {
    prisma.course.findMany.mockResolvedValue([
      // Fully covered by the availability — visible, with the lecturer unknown
      courseFixture({ id: 1, user: null }),
      // Slot on a day the student is not available — hidden
      courseFixture({
        id: 2,
        slots: [{ dayOfWeek: 0, timeSlotId: 5, timeSlot: { startMinute: 480, endMinute: 525 } }],
      }),
      // Covered but already applied to — hidden (it lives under My Applications)
      courseFixture({ id: 3 }),
      // No slots at all — nothing can clash, so it is visible
      courseFixture({
        id: 4,
        slots: [],
        user: { firstName: 'Alice', lastName: 'Smith' },
        _count: { assignments: 0 },
      }),
    ]);
    prisma.application.findMany.mockResolvedValue([{ courseId: 3 }]);

    const res = mockRes();
    const next = jest.fn();

    await getOpportunities(mockReq(), res, next);
    await flushMicrotasks();

    expect(res.status).toHaveBeenCalledWith(200);
    expect(next).not.toHaveBeenCalled();

    const body = res.json.mock.calls[0][0];
    expect(body.map((opportunity) => opportunity.id)).toEqual([1, 4]);
    expect(body[0]).toEqual({
      id: 1,
      courseCode: 'CS101',
      courseName: 'Intro to Programming',
      minimumMark: 50,
      tutorsRequired: 3,
      createdAt: new Date('2026-09-01T00:00:00.000Z'),
      lecturer: null,
      slots: [
        { dayOfWeek: 1, timeSlotId: 1, startMinute: 480, endMinute: 525 },
        { dayOfWeek: 1, timeSlotId: 2, startMinute: 600, endMinute: 645 },
      ],
      slotsCount: 2,
      weeklyHours: 2,
      assignedTutors: 2,
    });
    expect(body[1]).toEqual(
      expect.objectContaining({ id: 4, lecturer: 'Alice Smith', weeklyHours: 0, slotsCount: 0 }),
    );
  });
});

describe('getOpportunity', () => {
  test('guards the caller profile and role', async () => {
    prisma.user.findUnique.mockResolvedValue(null);
    let next = jest.fn();
    await getOpportunity({ ...mockReq(), params: { courseId: '1' } }, mockRes(), next);
    await flushMicrotasks();
    expectHttpError(next, 404, 'User not found. Please check if the user exists');

    prisma.user.findUnique.mockResolvedValue({ id: 7, role: 'ORGANISER' });
    next = jest.fn();
    await getOpportunity({ ...mockReq(), params: { courseId: '1' } }, mockRes(), next);
    await flushMicrotasks();
    expectHttpError(next, 403, 'Only students and tutors can view tutoring opportunities');
  });

  test('rejects a non-numeric course id before querying', async () => {
    const next = jest.fn();

    await getOpportunity({ ...mockReq(), params: { courseId: 'abc' } }, mockRes(), next);
    await flushMicrotasks();

    expectHttpError(next, 400, 'courseId must be a number');
    expect(prisma.course.findUnique).not.toHaveBeenCalled();
  });

  test('returns 404 when the course is missing or no longer accepting applications', async () => {
    prisma.course.findUnique.mockResolvedValue(null);
    let next = jest.fn();
    await getOpportunity({ ...mockReq(), params: { courseId: '99' } }, mockRes(), next);
    await flushMicrotasks();
    expectHttpError(next, 404, 'Opportunity not found or no longer accepting applications');

    prisma.course.findUnique.mockResolvedValue(courseFixture({ acceptingApplications: false }));
    next = jest.fn();
    await getOpportunity({ ...mockReq(), params: { courseId: '1' } }, mockRes(), next);
    await flushMicrotasks();
    expectHttpError(next, 404, 'Opportunity not found or no longer accepting applications');
  });

  test('returns 404 when the caller already applied to the opportunity', async () => {
    prisma.course.findUnique.mockResolvedValue(courseFixture());
    prisma.application.findFirst.mockResolvedValue({ id: 4, courseId: 1 });

    const next = jest.fn();

    await getOpportunity({ ...mockReq(), params: { courseId: '1' } }, mockRes(), next);
    await flushMicrotasks();

    expectHttpError(
      next,
      404,
      'You have already applied for this opportunity. It is listed under My Applications',
    );
  });

  test('rejects an opportunity whose slots are not fully inside the availability', async () => {
    prisma.course.findUnique.mockResolvedValue(courseFixture());
    prisma.availability.findMany.mockResolvedValue([{ dayOfWeek: 1, timeSlotId: 1 }]);

    const next = jest.fn();

    await getOpportunity({ ...mockReq(), params: { courseId: '1' } }, mockRes(), next);
    await flushMicrotasks();

    expectHttpError(
      next,
      403,
      'You can only view opportunities whose tutoring slots fit your availability',
    );
  });

  test('derives locked slots, assigned hours and the unset hours cap', async () => {
    prisma.course.findUnique.mockResolvedValue(courseFixture());
    // The caller's other submitted application locks the Monday 08:00 slot
    prisma.application.findMany.mockResolvedValue([
      { course: { slots: [{ dayOfWeek: 1, timeSlotId: 1 }] } },
    ]);
    // One existing assignment of a single 45-minute slot -> 1 assigned hour
    prisma.tutorAssignment.findMany.mockResolvedValue([
      { course: { slots: [{ timeSlot: { startMinute: 480, endMinute: 525 } }] } },
    ]);

    const res = mockRes();
    const next = jest.fn();

    await getOpportunity({ ...mockReq(), params: { courseId: '1' } }, res, next);
    await flushMicrotasks();

    const body = res.json.mock.calls[0][0];
    expect(res.status).toHaveBeenCalledWith(200);
    expect(next).not.toHaveBeenCalled();
    expect(body.assignedHours).toBe(1);
    expect(body.maxClaimableHours).toBeNull();
    expect(body.hoursExceeded).toBe(false);
    expect(body.lockedSlots).toEqual([{ dayOfWeek: 1, timeSlotId: 1 }]);
  });

  test('flags hoursExceeded when accepting the course would pass the organiser cap', async () => {
    prisma.course.findUnique.mockResolvedValue(courseFixture());
    prisma.systemSetting.findUnique.mockResolvedValue({ value: '4' });
    // Three 45-minute slots -> 3 assigned hours; 3 + 2 course hours > 4 cap
    prisma.tutorAssignment.findMany.mockResolvedValue([
      {
        course: {
          slots: [
            { timeSlot: { startMinute: 480, endMinute: 525 } },
            { timeSlot: { startMinute: 540, endMinute: 585 } },
            { timeSlot: { startMinute: 600, endMinute: 645 } },
          ],
        },
      },
    ]);

    const res = mockRes();
    const next = jest.fn();

    await getOpportunity({ ...mockReq(), params: { courseId: '1' } }, res, next);
    await flushMicrotasks();

    const body = res.json.mock.calls[0][0];
    expect(body.assignedHours).toBe(3);
    expect(body.maxClaimableHours).toBe(4);
    expect(body.hoursExceeded).toBe(true);
  });
});

describe('createApplication', () => {
  test('guards the caller profile and role', async () => {
    prisma.user.findUnique.mockResolvedValue(null);
    let next = jest.fn();
    await createApplication({ ...mockReq(), params: { courseId: '1' } }, mockRes(), next);
    await flushMicrotasks();
    expectHttpError(next, 404, 'User not found. Please check if the user exists');

    prisma.user.findUnique.mockResolvedValue({ id: 7, role: 'LECTURER' });
    next = jest.fn();
    await createApplication({ ...mockReq(), params: { courseId: '1' } }, mockRes(), next);
    await flushMicrotasks();
    expectHttpError(next, 403, 'Only students and tutors can apply for tutoring opportunities');
  });

  test('rejects non-numeric course ids and out-of-range marks', async () => {
    let next = jest.fn();
    await createApplication(
      { ...mockReq(), params: { courseId: 'abc' }, body: { courseMark: 75 } },
      mockRes(),
      next,
    );
    await flushMicrotasks();
    expectHttpError(next, 400, 'courseId must be a number');

    for (const courseMark of [undefined, 'abc', -1, 101]) {
      next = jest.fn();
      await createApplication(
        { ...mockReq(), params: { courseId: '1' }, body: { courseMark } },
        mockRes(),
        next,
      );
      await flushMicrotasks();
      expectHttpError(next, 400, 'courseMark must be a number between 0 and 100');
    }
    expect(prisma.course.findUnique).not.toHaveBeenCalled();
  });

  test('returns 404 when the course does not exist', async () => {
    prisma.course.findUnique.mockResolvedValue(null);

    const next = jest.fn();

    await createApplication(
      { ...mockReq(), params: { courseId: '99' }, body: { courseMark: 75 } },
      mockRes(),
      next,
    );
    await flushMicrotasks();

    expectHttpError(next, 404, 'Course not found');
  });

  test('rejects a course that is not accepting applications', async () => {
    prisma.course.findUnique.mockResolvedValue(courseFixture({ acceptingApplications: false }));

    const next = jest.fn();

    await createApplication(
      { ...mockReq(), params: { courseId: '1' }, body: { courseMark: 75 } },
      mockRes(),
      next,
    );
    await flushMicrotasks();

    expectHttpError(next, 400, 'This course is not accepting applications');
  });

  test('returns 409 when the student already applied', async () => {
    prisma.course.findUnique.mockResolvedValue(courseFixture());
    prisma.application.findFirst.mockResolvedValue({ id: 4 });

    const next = jest.fn();

    await createApplication(
      { ...mockReq(), params: { courseId: '1' }, body: { courseMark: 75 } },
      mockRes(),
      next,
    );
    await flushMicrotasks();

    expectHttpError(next, 409, 'You have already applied for this opportunity');
  });

  test('rejects an application whose slots are not fully inside the availability', async () => {
    prisma.course.findUnique.mockResolvedValue(courseFixture());
    prisma.availability.findMany.mockResolvedValue([]);

    const next = jest.fn();

    await createApplication(
      { ...mockReq(), params: { courseId: '1' }, body: { courseMark: 75 } },
      mockRes(),
      next,
    );
    await flushMicrotasks();

    expectHttpError(
      next,
      403,
      'You can only apply for opportunities whose tutoring slots fit your availability',
    );
  });

  test('rejects a mark below the course minimum', async () => {
    prisma.course.findUnique.mockResolvedValue(courseFixture({ minimumMark: 50 }));

    const next = jest.fn();

    await createApplication(
      { ...mockReq(), params: { courseId: '1' }, body: { courseMark: 40 } },
      mockRes(),
      next,
    );
    await flushMicrotasks();

    expectHttpError(
      next,
      403,
      'Your mark does not meet the minimum mark of 50 required for this course',
    );
  });

  test('rejects an application that would push the student past the hours cap', async () => {
    prisma.course.findUnique.mockResolvedValue(courseFixture());
    prisma.systemSetting.findUnique.mockResolvedValue({ value: '5' });
    // Two 90-minute slots -> 4 assigned hours; 4 + 2 course hours > 5 cap
    prisma.tutorAssignment.findMany.mockResolvedValue([
      {
        course: {
          slots: [
            { timeSlot: { startMinute: 480, endMinute: 570 } },
            { timeSlot: { startMinute: 600, endMinute: 690 } },
          ],
        },
      },
    ]);

    const next = jest.fn();

    await createApplication(
      { ...mockReq(), params: { courseId: '1' }, body: { courseMark: 75 } },
      mockRes(),
      next,
    );
    await flushMicrotasks();

    expectHttpError(
      next,
      403,
      'Tutoring this course would give you 6 hours, above the maximum of 5 claimable hours',
    );
    expect(prisma.application.create).not.toHaveBeenCalled();
  });

  test('creates the application and echoes the stored record', async () => {
    prisma.course.findUnique.mockResolvedValue(courseFixture());
    prisma.application.create.mockResolvedValue({
      id: 9,
      courseId: 1,
      courseMark: 75,
      status: 'PENDING',
      appliedAt: new Date('2026-10-11T00:00:00.000Z'),
    });

    const res = mockRes();
    const next = jest.fn();

    await createApplication(
      { ...mockReq(), params: { courseId: '1' }, body: { courseMark: '75' } },
      res,
      next,
    );
    await flushMicrotasks();

    expect(prisma.application.create).toHaveBeenCalledWith({
      data: { userId: 21, courseId: 1, courseMark: 75 },
    });
    expect(res.status).toHaveBeenCalledWith(201);
    expect(res.json).toHaveBeenCalledWith({
      id: 9,
      courseId: 1,
      courseMark: 75,
      status: 'PENDING',
      appliedAt: new Date('2026-10-11T00:00:00.000Z'),
    });
    expect(next).not.toHaveBeenCalled();
  });
});

describe('getMyApplications', () => {
  test('returns 404 when the caller has no profile yet', async () => {
    prisma.user.findUnique.mockResolvedValue(null);

    const next = jest.fn();

    await getMyApplications(mockReq(), mockRes(), next);
    await flushMicrotasks();

    expectHttpError(next, 404, 'User not found. Please check if the user exists');
  });

  test('maps every application with its course details, newest first', async () => {
    prisma.application.findMany.mockResolvedValue([
      {
        id: 4,
        courseId: 1,
        courseMark: 75,
        status: 'APPROVED',
        appliedAt: new Date('2026-09-20T00:00:00.000Z'),
        course: {
          courseCode: 'CS101',
          courseName: 'Intro to Programming',
          minimumMark: 50,
          acceptingApplications: true,
        },
      },
    ]);

    const res = mockRes();
    const next = jest.fn();

    await getMyApplications(mockReq(), res, next);
    await flushMicrotasks();

    expect(prisma.application.findMany).toHaveBeenCalledWith({
      where: { userId: 21 },
      include: {
        course: {
          select: { courseCode: true, courseName: true, minimumMark: true, acceptingApplications: true },
        },
      },
      orderBy: { appliedAt: 'desc' },
    });
    expect(res.status).toHaveBeenCalledWith(200);
    expect(res.json).toHaveBeenCalledWith([
      {
        id: 4,
        courseId: 1,
        courseCode: 'CS101',
        courseName: 'Intro to Programming',
        minimumMark: 50,
        acceptingApplications: true,
        courseMark: 75,
        status: 'APPROVED',
        appliedAt: new Date('2026-09-20T00:00:00.000Z'),
      },
    ]);
    expect(next).not.toHaveBeenCalled();
  });
});
