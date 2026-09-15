// Mock the Prisma client before requiring the controller
jest.mock('../prisma/client', () => {
  const mockTx = {
    user: { update: jest.fn() },
    tutorAssignment: { create: jest.fn(), delete: jest.fn() },
    application: { update: jest.fn() },
  };

  return {
    application: { findMany: jest.fn(), findUnique: jest.fn() },
    tutorAssignment: { findUnique: jest.fn(), findFirst: jest.fn(), findMany: jest.fn(), delete: jest.fn(), count: jest.fn() },
    course: { findUnique: jest.fn() },
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
  assignTutor,
  getAssignedTutors,
  unassignTutor,
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
