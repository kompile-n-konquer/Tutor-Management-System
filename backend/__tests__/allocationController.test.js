// Mock the Prisma client before requiring the controller
jest.mock('../prisma/client', () => {
  const mockTx = {
    user: { update: jest.fn(), updateMany: jest.fn() },
    tutorAssignment: { create: jest.fn(), createMany: jest.fn(), delete: jest.fn(), findMany: jest.fn() },
    application: { update: jest.fn(), updateMany: jest.fn() },
  };

  return {
    application: { findMany: jest.fn(), findUnique: jest.fn() },
    tutorAssignment: { findUnique: jest.fn(), findFirst: jest.fn(), findMany: jest.fn(), delete: jest.fn(), count: jest.fn() },
    course: { findUnique: jest.fn() },
    systemSetting: { findUnique: jest.fn() },
    $transaction: jest.fn((fn) => fn(mockTx)),
    __tx: mockTx, // expose for test assertions
  };
});

// Email notifications are fire-and-forget: mock the notifier so tests assert
// it was invoked without hitting Resend or the EmailLog table.
jest.mock('../email/notifier', () => ({
  notifyAssignmentAdded: jest.fn().mockResolvedValue({ sent: true, skipped: false }),
  notifyAssignmentRemoved: jest.fn().mockResolvedValue({ sent: true, skipped: false }),
}));

const prisma = require('../prisma/client');
const { notifyAssignmentAdded, notifyAssignmentRemoved } = require('../email/notifier');
const {
  getAvailableTutors,
  autoAssignTutors,
  assignTutor,
  getAssignedTutors,
  unassignTutor,
  removeTutor,
} = require('../controllers/allocation');

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
  res.end = jest.fn().mockReturnValue(res);
  return res;
}

beforeEach(() => {
  jest.clearAllMocks();
});

// ════════════════════════════════════════════════════════════════════════
// getAvailableTutors
// ════════════════════════════════════════════════════════════════════════
describe('getAvailableTutors', () => {
  test('returns applicants ranked by courseMark descending, excluding already-assigned ones', async () => {
    const applications = [
      {
        id: 1,
        userId: 10,
        courseId: 100,
        courseMark: 92,
        status: 'PENDING',
        user: { firstName: 'Alice', lastName: 'Smith', email: 'alice@wits.ac.za' },
        course: { courseCode: 'COMS3000', courseName: 'Algorithms', minimumMark: 65 },
      },
      {
        id: 2,
        userId: 20,
        courseId: 100,
        courseMark: 78,
        status: 'ACCEPTED',
        user: { firstName: 'Bob', lastName: 'Jones', email: 'bob@wits.ac.za' },
        course: { courseCode: 'COMS3000', courseName: 'Algorithms', minimumMark: 65 },
      },
    ];
    prisma.application.findMany.mockResolvedValue(applications);
    prisma.tutorAssignment.findMany.mockResolvedValue([]); // no existing assignments

    const req = mockReq();
    const res = mockRes();
    const next = jest.fn();

    await getAvailableTutors(req, res, next);
    await flushMicrotasks();

    expect(prisma.application.findMany).toHaveBeenCalledTimes(1);
    const callArgs = prisma.application.findMany.mock.calls[0][0];

    // Verify sorting: courseMark desc, then id asc for tiebreak
    expect(callArgs.orderBy).toEqual([{ courseMark: 'desc' }, { id: 'asc' }]);

    // Verify tutorAssignment was queried to exclude already-assigned users
    expect(prisma.tutorAssignment.findMany).toHaveBeenCalledWith({
      select: { userId: true, courseId: true },
    });

    expect(res.json).toHaveBeenCalledWith({
      availableTutors: [
        expect.objectContaining({ applicantId: 1, courseMark: 92, name: 'Alice Smith' }),
        expect.objectContaining({ applicantId: 2, courseMark: 78, name: 'Bob Jones' }),
      ],
    });
    expect(next).not.toHaveBeenCalled();
  });

  test('excludes applicants who already have a TutorAssignment for the same course', async () => {
    const applications = [
      {
        id: 1,
        userId: 10,
        courseId: 100,
        courseMark: 92,
        status: 'PENDING',
        user: { firstName: 'Alice', lastName: 'Smith', email: 'alice@wits.ac.za' },
        course: { courseCode: 'COMS3000', courseName: 'Algorithms', minimumMark: 65 },
      },
      {
        id: 2,
        userId: 20,
        courseId: 100,
        courseMark: 78,
        status: 'ACCEPTED',
        user: { firstName: 'Bob', lastName: 'Jones', email: 'bob@wits.ac.za' },
        course: { courseCode: 'COMS3000', courseName: 'Algorithms', minimumMark: 65 },
      },
    ];
    prisma.application.findMany.mockResolvedValue(applications);
    // Alice (userId 10) already assigned to course 100
    prisma.tutorAssignment.findMany.mockResolvedValue([{ userId: 10, courseId: 100 }]);

    const req = mockReq();
    const res = mockRes();
    const next = jest.fn();

    await getAvailableTutors(req, res, next);
    await flushMicrotasks();

    expect(res.json).toHaveBeenCalledWith({
      availableTutors: [
        expect.objectContaining({ applicantId: 2, courseMark: 78, name: 'Bob Jones' }),
      ],
    });
    expect(next).not.toHaveBeenCalled();
  });

  test('filters by courseId query parameter when provided', async () => {
    prisma.application.findMany.mockResolvedValue([]);
    prisma.tutorAssignment.findMany.mockResolvedValue([]);

    const req = mockReq({ query: { courseId: '5' } });
    const res = mockRes();
    const next = jest.fn();

    await getAvailableTutors(req, res, next);

    const callArgs = prisma.application.findMany.mock.calls[0][0];
    expect(callArgs.where.courseId).toBe(5);
    expect(next).not.toHaveBeenCalled();
  });

  test('returns 400 when courseId is not a valid integer', async () => {
    const req = mockReq({ query: { courseId: 'abc' } });
    const res = mockRes();
    const next = jest.fn();

    await getAvailableTutors(req, res, next);

    expect(next).toHaveBeenCalledWith(
      expect.objectContaining({ statusCode: 400 }),
    );
    expect(prisma.application.findMany).not.toHaveBeenCalled();
  });
});

// ════════════════════════════════════════════════════════════════════════
// assignTutor
// ════════════════════════════════════════════════════════════════════════
describe('assignTutor', () => {
  test('returns 400 when applicantId is missing', async () => {
    const req = mockReq({ body: {} });
    const res = mockRes();
    const next = jest.fn();

    await assignTutor(req, res, next);

    expect(next).toHaveBeenCalledWith(
      expect.objectContaining({ statusCode: 400, message: expect.stringContaining('applicantId') }),
    );
  });

  test('returns 400 when applicantId is not a valid integer', async () => {
    const req = mockReq({ body: { applicantId: 'abc' } });
    const res = mockRes();
    const next = jest.fn();

    await assignTutor(req, res, next);

    expect(next).toHaveBeenCalledWith(
      expect.objectContaining({ statusCode: 400 }),
    );
  });

  test('returns 404 when applicant does not exist', async () => {
    prisma.application.findUnique.mockResolvedValue(null);

    const req = mockReq({ body: { applicantId: 999 } });
    const res = mockRes();
    const next = jest.fn();

    await assignTutor(req, res, next);

    expect(next).toHaveBeenCalledWith(
      expect.objectContaining({ statusCode: 404, message: 'Applicant not found' }),
    );
  });

  test('returns 400 when applicant is already assigned', async () => {
    prisma.application.findUnique.mockResolvedValue({
      id: 1,
      userId: 10,
      courseId: 100,
      courseMark: 85,
      user: { firstName: 'Alice', lastName: 'Smith' },
    });
    prisma.tutorAssignment.findFirst.mockResolvedValue({ id: 50 }); // existing assignment

    const req = mockReq({ body: { applicantId: 1 } });
    const res = mockRes();
    const next = jest.fn();

    await assignTutor(req, res, next);
    await flushMicrotasks();

    expect(next).toHaveBeenCalledWith(
      expect.objectContaining({ statusCode: 400, message: expect.stringContaining('already assigned') }),
    );
  });

  test('creates assignment and updates user role to TUTOR', async () => {
    prisma.application.findUnique.mockResolvedValue({
      id: 1,
      userId: 10,
      courseId: 100,
      courseMark: 85,
      user: { firstName: 'Alice', lastName: 'Smith', email: 'alice@wits.ac.za' },
    });
    prisma.tutorAssignment.findFirst.mockResolvedValue(null);
    prisma.course.findUnique.mockResolvedValue({
      courseCode: 'COMS3000',
      courseName: 'Algorithms',
      tutorsRequired: 2,
    });
    prisma.tutorAssignment.count.mockResolvedValue(1); // below the cap

    const createdAssignment = {
      id: 1,
      userId: 10,
      courseId: 100,
      semester: '',
      course: { courseCode: 'COMS3000', courseName: 'Algorithms' },
      user: { id: 10, firstName: 'Alice', lastName: 'Smith', email: 'alice@wits.ac.za' },
    };

    prisma.__tx.tutorAssignment.create.mockResolvedValue(createdAssignment);
    prisma.__tx.application.update.mockResolvedValue({});

    const req = mockReq({ body: { applicantId: 1 } });
    const res = mockRes();
    const next = jest.fn();

    await assignTutor(req, res, next);
    await flushMicrotasks();

    // User role should be updated to TUTOR
    expect(prisma.__tx.user.update).toHaveBeenCalledWith({
      where: { id: 10 },
      data: { role: 'TUTOR' },
    });

    // Assignment should be created with userId and courseId (no tutorId/applicantId)
    expect(prisma.__tx.tutorAssignment.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          userId: 10,
          courseId: 100,
        }),
      }),
    );

    // Application status should be updated to ASSIGNED
    expect(prisma.__tx.application.update).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: 1 },
        data: expect.objectContaining({ status: 'ASSIGNED' }),
      }),
    );

    // The newly assigned tutor is notified by email
    expect(notifyAssignmentAdded).toHaveBeenCalledWith(createdAssignment);

    expect(res.status).toHaveBeenCalledWith(201);
    expect(res.json).toHaveBeenCalledWith({ assignment: createdAssignment });
    expect(next).not.toHaveBeenCalled();
  });

  test('returns 409 when the course has already reached its tutorsRequired cap', async () => {
    prisma.application.findUnique.mockResolvedValue({
      id: 3,
      userId: 30,
      courseId: 100,
      courseMark: 85,
      user: { firstName: 'Cara', lastName: 'Liu' },
    });
    prisma.tutorAssignment.findFirst.mockResolvedValue(null);
    prisma.course.findUnique.mockResolvedValue({
      courseCode: 'COMS3000',
      courseName: 'Algorithms',
      tutorsRequired: 2,
    });
    prisma.tutorAssignment.count.mockResolvedValue(2); // cap already reached

    const req = mockReq({ body: { applicantId: 3 } });
    const res = mockRes();
    const next = jest.fn();

    await assignTutor(req, res, next);
    await flushMicrotasks();

    expect(next).toHaveBeenCalledWith(
      expect.objectContaining({
        statusCode: 409,
        message: expect.stringContaining('Maximum number of required tutors'),
      }),
    );

    // Nothing is mutated: the applicant stays in the available pool
    expect(prisma.__tx.tutorAssignment.create).not.toHaveBeenCalled();
    expect(prisma.__tx.application.update).not.toHaveBeenCalled();
    expect(notifyAssignmentAdded).not.toHaveBeenCalled();
    expect(res.status).not.toHaveBeenCalledWith(201);
  });

  test('passes semester from request body to the assignment', async () => {
    prisma.application.findUnique.mockResolvedValue({
      id: 2,
      userId: 20,
      courseId: 100,
      courseMark: 78,
      user: { firstName: 'Bob', lastName: 'Jones', email: 'bob@wits.ac.za' },
    });
    prisma.tutorAssignment.findFirst.mockResolvedValue(null);
    prisma.course.findUnique.mockResolvedValue({
      courseCode: 'COMS3000',
      courseName: 'Algorithms',
      tutorsRequired: 3,
    });
    prisma.tutorAssignment.count.mockResolvedValue(0);

    const createdAssignment = {
      id: 2,
      userId: 20,
      courseId: 100,
      semester: '2026-S2',
      course: { courseCode: 'COMS3000', courseName: 'Algorithms' },
      user: { id: 20, firstName: 'Bob', lastName: 'Jones', email: 'bob@wits.ac.za' },
    };
    prisma.__tx.tutorAssignment.create.mockResolvedValue(createdAssignment);
    prisma.__tx.application.update.mockResolvedValue({});

    const req = mockReq({ body: { applicantId: 2, semester: '2026-S2' } });
    const res = mockRes();
    const next = jest.fn();

    await assignTutor(req, res, next);
    await flushMicrotasks();

    // Assignment should include the semester from the request body
    expect(prisma.__tx.tutorAssignment.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ userId: 20, courseId: 100, semester: '2026-S2' }),
      }),
    );

    expect(res.status).toHaveBeenCalledWith(201);
    expect(next).not.toHaveBeenCalled();
  });
});

// ════════════════════════════════════════════════════════════════════════
// getAssignedTutors
// ════════════════════════════════════════════════════════════════════════
describe('getAssignedTutors', () => {
  test('returns assignments mapped to the expected shape', async () => {
    prisma.tutorAssignment.findMany.mockResolvedValue([
      {
        id: 1,
        userId: 10,
        courseId: 100,
        semester: '2026-S1',
        user: { firstName: 'Alice', lastName: 'Smith', email: 'alice@wits.ac.za' },
        course: { courseCode: 'COMS3000', courseName: 'Algorithms' },
      },
    ]);

    const req = mockReq();
    const res = mockRes();
    const next = jest.fn();

    await getAssignedTutors(req, res, next);

    expect(res.json).toHaveBeenCalledWith({
      assignedTutors: [
        expect.objectContaining({
          assignmentId: 1,
          applicantId: 10,
          name: 'Alice Smith',
          courseCode: 'COMS3000',
          semester: '2026-S1',
        }),
      ],
    });
    expect(next).not.toHaveBeenCalled();
  });

  test('filters by courseId when provided', async () => {
    prisma.tutorAssignment.findMany.mockResolvedValue([]);

    const req = mockReq({ query: { courseId: '3' } });
    const res = mockRes();
    const next = jest.fn();

    await getAssignedTutors(req, res, next);

    expect(prisma.tutorAssignment.findMany.mock.calls[0][0].where.courseId).toBe(3);
    expect(next).not.toHaveBeenCalled();
  });

  test('returns 400 when the courseId filter is not a valid integer', async () => {
    const req = mockReq({ query: { courseId: 'abc' } });
    const res = mockRes();
    const next = jest.fn();

    await getAssignedTutors(req, res, next);

    expect(next).toHaveBeenCalledWith(
      expect.objectContaining({ statusCode: 400, message: 'courseId must be a valid integer' }),
    );
    expect(prisma.tutorAssignment.findMany).not.toHaveBeenCalled();
  });
});

// ════════════════════════════════════════════════════════════════════════
// unassignTutor
// ════════════════════════════════════════════════════════════════════════
describe('unassignTutor', () => {
  test('returns 400 when applicantId param is not a valid integer', async () => {
    const req = mockReq({ params: { applicantId: 'xyz' } });
    const res = mockRes();
    const next = jest.fn();

    await unassignTutor(req, res, next);

    expect(next).toHaveBeenCalledWith(
      expect.objectContaining({ statusCode: 400 }),
    );
  });

  test('returns 404 when no application exists for the applicant', async () => {
    prisma.application.findUnique.mockResolvedValue(null);

    const req = mockReq({ params: { applicantId: '7' } });
    const res = mockRes();
    const next = jest.fn();

    await unassignTutor(req, res, next);

    expect(next).toHaveBeenCalledWith(
      expect.objectContaining({ statusCode: 404, message: 'Application not found for this applicant' }),
    );
  });

  test('deletes assignment and resets application status to PENDING', async () => {
    prisma.application.findUnique.mockResolvedValue({
      id: 7,
      userId: 70,
      courseId: 100,
    });
    prisma.tutorAssignment.findFirst.mockResolvedValue({
      id: 10,
      userId: 70,
      courseId: 100,
      course: { courseCode: 'COMS3000', courseName: 'Algorithms' },
      user: { id: 70, firstName: 'Dave', lastName: 'Root', email: 'dave@wits.ac.za' },
    });
    prisma.__tx.tutorAssignment.delete.mockResolvedValue({});
    prisma.__tx.application.update.mockResolvedValue({});

    const req = mockReq({ params: { applicantId: '7' } });
    const res = mockRes();
    const next = jest.fn();

    await unassignTutor(req, res, next);
    await flushMicrotasks();

    expect(prisma.__tx.tutorAssignment.delete).toHaveBeenCalledWith({ where: { id: 10 } });
    expect(prisma.__tx.application.update).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: 7 },
        data: expect.objectContaining({ status: 'PENDING' }),
      }),
    );

    // The removed tutor is notified by email (loaded before deletion)
    expect(notifyAssignmentRemoved).toHaveBeenCalledWith(
      expect.objectContaining({ id: 10, userId: 70 }),
    );

    expect(res.status).toHaveBeenCalledWith(204);
    expect(res.end).toHaveBeenCalled();
    expect(next).not.toHaveBeenCalled();
  });
});

// ════════════════════════════════════════════════════════════════════════
// removeTutor
// ════════════════════════════════════════════════════════════════════════
describe('removeTutor', () => {
  test('returns 400 when applicantId param is not a valid integer', async () => {
    const req = mockReq({ params: { applicantId: 'xyz' } });
    const res = mockRes();
    const next = jest.fn();

    await removeTutor(req, res, next);

    expect(next).toHaveBeenCalledWith(
      expect.objectContaining({ statusCode: 400 }),
    );
    expect(prisma.application.findUnique).not.toHaveBeenCalled();
  });

  test('returns 404 when no application exists for the applicant', async () => {
    prisma.application.findUnique.mockResolvedValue(null);

    const req = mockReq({ params: { applicantId: '7' } });
    const res = mockRes();
    const next = jest.fn();

    await removeTutor(req, res, next);

    expect(next).toHaveBeenCalledWith(
      expect.objectContaining({ statusCode: 404, message: 'Application not found for this applicant' }),
    );
    expect(prisma.tutorAssignment.findFirst).not.toHaveBeenCalled();
  });

  test('returns 404 when the application has no assignment to remove', async () => {
    prisma.application.findUnique.mockResolvedValue({ id: 7, userId: 70, courseId: 100 });
    prisma.tutorAssignment.findFirst.mockResolvedValue(null);

    const req = mockReq({ params: { applicantId: '7' } });
    const res = mockRes();
    const next = jest.fn();

    await removeTutor(req, res, next);

    expect(next).toHaveBeenCalledWith(
      expect.objectContaining({ statusCode: 404, message: 'Assignment not found for this applicant' }),
    );
    expect(prisma.__tx.tutorAssignment.delete).not.toHaveBeenCalled();
  });

  test('deletes the assignment and permanently rejects the application (unlike unassign, which returns it to PENDING)', async () => {
    prisma.application.findUnique.mockResolvedValue({ id: 7, userId: 70, courseId: 100 });
    prisma.tutorAssignment.findFirst.mockResolvedValue({
      id: 10,
      userId: 70,
      courseId: 100,
      course: { courseCode: 'COMS3000', courseName: 'Algorithms' },
      user: { id: 70, firstName: 'Dave', lastName: 'Root', email: 'dave@wits.ac.za' },
    });
    prisma.__tx.tutorAssignment.delete.mockResolvedValue({});
    prisma.__tx.application.update.mockResolvedValue({});

    const req = mockReq({ params: { applicantId: '7' } });
    const res = mockRes();
    const next = jest.fn();

    await removeTutor(req, res, next);
    await flushMicrotasks();

    expect(prisma.tutorAssignment.findFirst).toHaveBeenCalledWith(
      expect.objectContaining({ where: { userId: 70, courseId: 100 } }),
    );
    expect(prisma.__tx.tutorAssignment.delete).toHaveBeenCalledWith({ where: { id: 10 } });
    expect(prisma.__tx.application.update).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: 7 },
        data: expect.objectContaining({ status: 'REJECTED' }),
      }),
    );
    // Removal is a review decision, so reviewedAt is stamped (unassign clears it)
    const updateData = prisma.__tx.application.update.mock.calls[0][0].data;
    expect(updateData.reviewedAt).toBeInstanceOf(Date);

    // The removed tutor is notified by email (loaded before deletion)
    expect(notifyAssignmentRemoved).toHaveBeenCalledWith(
      expect.objectContaining({ id: 10, userId: 70 }),
    );

    expect(res.status).toHaveBeenCalledWith(204);
    expect(res.end).toHaveBeenCalled();
    expect(next).not.toHaveBeenCalled();
  });
});

// ════════════════════════════════════════════════════════════════════════
// autoAssignTutors
// ════════════════════════════════════════════════════════════════════════
describe('autoAssignTutors', () => {
  // A course with one 08:00–08:45 slot (1 claimable hour) needing 3 tutors
  const course = {
    id: 100,
    courseCode: 'COMS3000',
    courseName: 'Algorithms',
    minimumMark: 65,
    tutorsRequired: 3,
    slots: [{ dayOfWeek: 1, timeSlotId: 5, timeSlot: { startMinute: 480, endMinute: 525 } }],
  };

  const makeApplication = (id, userId, courseMark, firstName, lastName) => ({
    id,
    userId,
    courseId: 100,
    courseMark,
    status: 'PENDING',
    user: { id: userId, firstName, lastName, email: `${firstName.toLowerCase()}@wits.ac.za` },
  });

  test('returns 400 when courseId is missing', async () => {
    const req = mockReq({ body: {} });
    const res = mockRes();
    const next = jest.fn();

    await autoAssignTutors(req, res, next);

    expect(next).toHaveBeenCalledWith(
      expect.objectContaining({ statusCode: 400, message: expect.stringContaining('courseId') }),
    );
    expect(prisma.course.findUnique).not.toHaveBeenCalled();
  });

  test('returns 400 when courseId is not a valid integer', async () => {
    const req = mockReq({ body: { courseId: 'abc' } });
    const res = mockRes();
    const next = jest.fn();

    await autoAssignTutors(req, res, next);

    expect(next).toHaveBeenCalledWith(
      expect.objectContaining({ statusCode: 400 }),
    );
    expect(prisma.course.findUnique).not.toHaveBeenCalled();
  });

  test('returns 404 when the course does not exist', async () => {
    prisma.course.findUnique.mockResolvedValue(null);

    const req = mockReq({ body: { courseId: 999 } });
    const res = mockRes();
    const next = jest.fn();

    await autoAssignTutors(req, res, next);

    expect(next).toHaveBeenCalledWith(
      expect.objectContaining({ statusCode: 404, message: 'Course not found' }),
    );
  });

  test('returns 409 when the course has already reached its tutorsRequired cap', async () => {
    prisma.course.findUnique.mockResolvedValue(course);
    prisma.tutorAssignment.count.mockResolvedValue(3); // cap already reached

    const req = mockReq({ body: { courseId: 100 } });
    const res = mockRes();
    const next = jest.fn();

    await autoAssignTutors(req, res, next);
    await flushMicrotasks();

    expect(next).toHaveBeenCalledWith(
      expect.objectContaining({
        statusCode: 409,
        message: expect.stringContaining('Maximum number of required tutors'),
      }),
    );

    // Nothing is mutated and no candidate list is even fetched
    expect(prisma.application.findMany).not.toHaveBeenCalled();
    expect(prisma.__tx.tutorAssignment.createMany).not.toHaveBeenCalled();
    expect(notifyAssignmentAdded).not.toHaveBeenCalled();
  });

  test('fills the remaining slots with the top-ranked applicants and reports the summary', async () => {
    prisma.course.findUnique.mockResolvedValue(course);
    prisma.tutorAssignment.count.mockResolvedValue(1); // 2 slots left
    prisma.application.findMany.mockResolvedValue([
      makeApplication(1, 10, 92, 'Alice', 'Smith'),
      makeApplication(2, 20, 78, 'Bob', 'Jones'),
      makeApplication(3, 30, 70, 'Cara', 'Liu'),
    ]);
    // Cara (userId 30) already holds an assignment for this course
    prisma.tutorAssignment.findMany
      .mockResolvedValueOnce([{ userId: 30 }])
      .mockResolvedValueOnce([]);
    prisma.systemSetting.findUnique.mockResolvedValue(null); // no hours cap set

    const aliceRow = {
      id: 501,
      userId: 10,
      courseId: 100,
      semester: '',
      course: { courseCode: 'COMS3000', courseName: 'Algorithms' },
      user: { id: 10, firstName: 'Alice', lastName: 'Smith', email: 'alice@wits.ac.za' },
    };
    const bobRow = {
      id: 502,
      userId: 20,
      courseId: 100,
      semester: '',
      course: { courseCode: 'COMS3000', courseName: 'Algorithms' },
      user: { id: 20, firstName: 'Bob', lastName: 'Jones', email: 'bob@wits.ac.za' },
    };
    prisma.__tx.user.updateMany.mockResolvedValue({ count: 2 });
    prisma.__tx.tutorAssignment.createMany.mockResolvedValue({ count: 2 });
    prisma.__tx.application.updateMany.mockResolvedValue({ count: 2 });
    prisma.__tx.tutorAssignment.findMany.mockResolvedValue([aliceRow, bobRow]);

    const req = mockReq({ body: { courseId: 100 } });
    const res = mockRes();
    const next = jest.fn();

    await autoAssignTutors(req, res, next);
    await flushMicrotasks();

    // Batched writes: one statement per concern, regardless of tutor count
    expect(prisma.__tx.user.updateMany).toHaveBeenCalledWith({
      where: { id: { in: [10, 20] } },
      data: { role: 'TUTOR' },
    });
    expect(prisma.__tx.tutorAssignment.createMany).toHaveBeenCalledWith({
      data: [
        expect.objectContaining({ userId: 10, courseId: 100 }),
        expect.objectContaining({ userId: 20, courseId: 100 }),
      ],
    });
    expect(prisma.__tx.application.updateMany).toHaveBeenCalledWith({
      where: { id: { in: [1, 2] } },
      data: expect.objectContaining({ status: 'ASSIGNED' }),
    });

    // Both newly assigned tutors are notified
    expect(notifyAssignmentAdded).toHaveBeenCalledTimes(2);
    expect(notifyAssignmentAdded).toHaveBeenCalledWith(aliceRow);
    expect(notifyAssignmentAdded).toHaveBeenCalledWith(bobRow);

    expect(res.status).toHaveBeenCalledWith(200);
    expect(res.json).toHaveBeenCalledWith({
      courseId: 100,
      courseCode: 'COMS3000',
      courseName: 'Algorithms',
      assigned: [
        expect.objectContaining({ assignmentId: 501, applicantId: 1, userId: 10, name: 'Alice Smith', courseMark: 92 }),
        expect.objectContaining({ assignmentId: 502, applicantId: 2, userId: 20, name: 'Bob Jones', courseMark: 78 }),
      ],
      skipped: [],
      remaining: 0,
    });
    expect(next).not.toHaveBeenCalled();
  });

  test('skips candidates who fail an allocation-time check and still assigns the rest', async () => {
    prisma.course.findUnique.mockResolvedValue(course);
    prisma.tutorAssignment.count.mockResolvedValue(2); // 1 slot left
    prisma.application.findMany.mockResolvedValue([
      makeApplication(1, 10, 92, 'Zoe', 'Adams'), // timetable clash
      makeApplication(2, 20, 78, 'Yusuf', 'Botha'), // over the hours cap
      makeApplication(3, 30, 60, 'Xola', 'Cele'), // below the minimum mark
      makeApplication(4, 40, 66, 'Dana', 'Pillay'), // passes every check
    ]);
    // Nobody is assigned to this course yet; Zoe and Yusuf already tutor elsewhere
    prisma.tutorAssignment.findMany
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([
        {
          userId: 10,
          course: {
            courseCode: 'COMS2000',
            slots: [{ dayOfWeek: 1, timeSlotId: 5, timeSlot: { startMinute: 480, endMinute: 525 } }],
          },
        },
        {
          userId: 20,
          course: {
            courseCode: 'MATH1000',
            slots: [{ dayOfWeek: 3, timeSlotId: 9, timeSlot: { startMinute: 480, endMinute: 660 } }],
          },
        },
      ]);
    prisma.systemSetting.findUnique.mockResolvedValue({
      key: 'TUTOR_MONTHLY_CLAIMABLE_HOURS',
      value: '3',
    });

    const danaRow = {
      id: 601,
      userId: 40,
      courseId: 100,
      semester: '',
      course: { courseCode: 'COMS3000', courseName: 'Algorithms' },
      user: { id: 40, firstName: 'Dana', lastName: 'Pillay', email: 'dana@wits.ac.za' },
    };
    prisma.__tx.user.updateMany.mockResolvedValue({ count: 1 });
    prisma.__tx.tutorAssignment.createMany.mockResolvedValue({ count: 1 });
    prisma.__tx.application.updateMany.mockResolvedValue({ count: 1 });
    prisma.__tx.tutorAssignment.findMany.mockResolvedValue([danaRow]);

    const req = mockReq({ body: { courseId: 100 } });
    const res = mockRes();
    const next = jest.fn();

    await autoAssignTutors(req, res, next);
    await flushMicrotasks();

    // Only Dana is assigned; the other three are skipped instead of blocking the run
    expect(prisma.__tx.tutorAssignment.createMany).toHaveBeenCalledTimes(1);
    expect(prisma.__tx.tutorAssignment.createMany).toHaveBeenCalledWith({
      data: [expect.objectContaining({ userId: 40, courseId: 100 })],
    });
    expect(notifyAssignmentAdded).toHaveBeenCalledTimes(1);
    expect(notifyAssignmentAdded).toHaveBeenCalledWith(danaRow);

    expect(res.status).toHaveBeenCalledWith(200);
    const payload = res.json.mock.calls[0][0];
    expect(payload.assigned).toEqual([
      expect.objectContaining({ applicantId: 4, userId: 40, name: 'Dana Pillay', courseMark: 66 }),
    ]);
    expect(payload.remaining).toBe(0);
    expect(payload.skipped).toEqual([
      expect.objectContaining({
        applicantId: 1,
        name: 'Zoe Adams',
        reason: expect.stringContaining('Timetable clash with already assigned COMS2000'),
      }),
      expect.objectContaining({
        applicantId: 2,
        name: 'Yusuf Botha',
        reason: expect.stringContaining('above the 3h claimable-hours cap'),
      }),
      expect.objectContaining({
        applicantId: 3,
        name: 'Xola Cele',
        reason: expect.stringContaining('below the course minimum of 65'),
      }),
    ]);
    expect(next).not.toHaveBeenCalled();
  });

  test('returns an empty summary without opening a transaction when there are no candidates', async () => {
    prisma.course.findUnique.mockResolvedValue(course);
    prisma.tutorAssignment.count.mockResolvedValue(0);
    prisma.application.findMany.mockResolvedValue([]);
    prisma.tutorAssignment.findMany.mockResolvedValue([]);
    prisma.systemSetting.findUnique.mockResolvedValue(null);

    const req = mockReq({ body: { courseId: 100 } });
    const res = mockRes();
    const next = jest.fn();

    await autoAssignTutors(req, res, next);
    await flushMicrotasks();

    // Nothing to assign: no transaction is opened at all
    expect(prisma.$transaction).not.toHaveBeenCalled();
    expect(res.status).toHaveBeenCalledWith(200);
    expect(res.json).toHaveBeenCalledWith({
      courseId: 100,
      courseCode: 'COMS3000',
      courseName: 'Algorithms',
      assigned: [],
      skipped: [],
      remaining: 3,
    });
    expect(next).not.toHaveBeenCalled();
  });
});
