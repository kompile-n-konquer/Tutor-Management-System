// Mock the Prisma client before requiring the controller
jest.mock('../prisma/client', () => {
  const mockTx = {
    tutor: { create: jest.fn(), findUnique: jest.fn() },
    tutorAssignment: { create: jest.fn(), delete: jest.fn() },
    applicant: { update: jest.fn() },
  };

  return {
    applicant: { findMany: jest.fn(), findUnique: jest.fn() },
    tutorAssignment: { findUnique: jest.fn(), findMany: jest.fn(), delete: jest.fn() },
    tutor: { findUnique: jest.fn(), create: jest.fn() },
    $transaction: jest.fn((fn) => fn(mockTx)),
    __tx: mockTx, // expose for test assertions
  };
});

const prisma = require('../prisma/client');
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
  test('returns applicants ranked by courseMark descending', async () => {
    const applicants = [
      {
        id: 1,
        userId: 10,
        courseId: 100,
        courseMark: 92,
        status: 'PENDING',
        availability: 'Mon-Fri',
        user: { firstName: 'Alice', lastName: 'Smith', email: 'alice@wits.ac.za' },
        course: { courseCode: 'COMS3000', courseName: 'Algorithms', minimumMark: 65 },
      },
      {
        id: 2,
        userId: 20,
        courseId: 100,
        courseMark: 78,
        status: 'ACCEPTED',
        availability: null,
        user: { firstName: 'Bob', lastName: 'Jones', email: 'bob@wits.ac.za' },
        course: { courseCode: 'COMS3000', courseName: 'Algorithms', minimumMark: 65 },
      },
    ];
    prisma.applicant.findMany.mockResolvedValue(applicants);

    const req = mockReq();
    const res = mockRes();
    const next = jest.fn();

    await getAvailableTutors(req, res, next);

    expect(prisma.applicant.findMany).toHaveBeenCalledTimes(1);
    const callArgs = prisma.applicant.findMany.mock.calls[0][0];

    // Verify sorting: courseMark desc, then id asc for tiebreak
    expect(callArgs.orderBy).toEqual([{ courseMark: 'desc' }, { id: 'asc' }]);

    // Verify excluded applicants that already have an assignment
    expect(callArgs.where).toEqual(
      expect.objectContaining({
        NOT: { tutorAssignment: { isNot: null } },
      }),
    );

    expect(res.json).toHaveBeenCalledWith({
      availableTutors: [
        expect.objectContaining({ applicantId: 1, courseMark: 92, name: 'Alice Smith' }),
        expect.objectContaining({ applicantId: 2, courseMark: 78, name: 'Bob Jones' }),
      ],
    });
    expect(next).not.toHaveBeenCalled();
  });

  test('filters by courseId query parameter when provided', async () => {
    prisma.applicant.findMany.mockResolvedValue([]);

    const req = mockReq({ query: { courseId: '5' } });
    const res = mockRes();
    const next = jest.fn();

    await getAvailableTutors(req, res, next);

    const callArgs = prisma.applicant.findMany.mock.calls[0][0];
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
    expect(prisma.applicant.findMany).not.toHaveBeenCalled();
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
    prisma.applicant.findUnique.mockResolvedValue(null);

    const req = mockReq({ body: { applicantId: 999 } });
    const res = mockRes();
    const next = jest.fn();

    await assignTutor(req, res, next);

    expect(next).toHaveBeenCalledWith(
      expect.objectContaining({ statusCode: 404, message: 'Applicant not found' }),
    );
  });

  test('returns 400 when applicant is already assigned', async () => {
    prisma.applicant.findUnique.mockResolvedValue({
      id: 1,
      userId: 10,
      courseId: 100,
      courseMark: 85,
      user: { firstName: 'Alice', lastName: 'Smith' },
    });
    prisma.tutor.findUnique.mockResolvedValue({ id: 5, userId: 10 });
    prisma.tutorAssignment.findUnique.mockResolvedValue({ id: 50 }); // existing assignment

    const req = mockReq({ body: { applicantId: 1 } });
    const res = mockRes();
    const next = jest.fn();

    await assignTutor(req, res, next);
    await flushMicrotasks();

    expect(next).toHaveBeenCalledWith(
      expect.objectContaining({ statusCode: 400, message: expect.stringContaining('already assigned') }),
    );
  });

  test('creates assignment with existing Tutor row', async () => {
    prisma.applicant.findUnique.mockResolvedValue({
      id: 1,
      userId: 10,
      courseId: 100,
      courseMark: 85,
      user: { firstName: 'Alice', lastName: 'Smith', email: 'alice@wits.ac.za' },
    });
    prisma.tutorAssignment.findUnique.mockResolvedValue(null);
    prisma.tutor.findUnique.mockResolvedValue({ id: 5, userId: 10 });
    prisma.__tx.tutor.findUnique.mockResolvedValue({ id: 5, userId: 10 });

    const createdAssignment = {
      id: 1,
      tutorId: 5,
      courseId: 100,
      applicantId: 1,
      allocatedHours: 5,
      semester: '',
      status: 'ACTIVE',
      course: { courseCode: 'COMS3000', courseName: 'Algorithms' },
      applicant: { user: { firstName: 'Alice', lastName: 'Smith', email: 'alice@wits.ac.za' } },
    };

    prisma.__tx.tutorAssignment.create.mockResolvedValue(createdAssignment);
    prisma.__tx.applicant.update.mockResolvedValue({});

    const req = mockReq({ body: { applicantId: 1 } });
    const res = mockRes();
    const next = jest.fn();

    await assignTutor(req, res, next);
    await flushMicrotasks();

    // Tutor should NOT be re-created since one already exists
    expect(prisma.__tx.tutor.create).not.toHaveBeenCalled();

    // Assignment should be created with default values
    expect(prisma.__tx.tutorAssignment.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          tutorId: 5,
          courseId: 100,
          applicantId: 1,
          allocatedHours: 5,
          status: 'ACTIVE',
        }),
      }),
    );

    // Applicant status should be updated to ASSIGNED
    expect(prisma.__tx.applicant.update).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: 1 },
        data: expect.objectContaining({ status: 'ASSIGNED' }),
      }),
    );

    expect(res.status).toHaveBeenCalledWith(201);
    expect(res.json).toHaveBeenCalledWith({ assignment: createdAssignment });
    expect(next).not.toHaveBeenCalled();
  });

  test('creates Tutor row when one does not exist for the user', async () => {
    prisma.applicant.findUnique.mockResolvedValue({
      id: 2,
      userId: 20,
      courseId: 100,
      courseMark: 78,
      user: { firstName: 'Bob', lastName: 'Jones', email: 'bob@wits.ac.za' },
    });
    prisma.tutorAssignment.findUnique.mockResolvedValue(null);
    prisma.tutor.findUnique.mockResolvedValue(null); // no Tutor yet
    prisma.__tx.tutor.findUnique.mockResolvedValue(null); // none inside tx either

    const newTutor = { id: 99, userId: 20 };
    prisma.__tx.tutor.create.mockResolvedValue(newTutor);

    const createdAssignment = {
      id: 2,
      tutorId: 99,
      courseId: 100,
      applicantId: 2,
      allocatedHours: 10,
      semester: '2026-S2',
      status: 'ACTIVE',
      course: { courseCode: 'COMS3000', courseName: 'Algorithms' },
      applicant: { user: { firstName: 'Bob', lastName: 'Jones', email: 'bob@wits.ac.za' } },
    };
    prisma.__tx.tutorAssignment.create.mockResolvedValue(createdAssignment);
    prisma.__tx.applicant.update.mockResolvedValue({});

    const req = mockReq({ body: { applicantId: 2, allocatedHours: 10, semester: '2026-S2' } });
    const res = mockRes();
    const next = jest.fn();

    await assignTutor(req, res, next);
    await flushMicrotasks();

    // Tutor should be created inside the transaction
    expect(prisma.__tx.tutor.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ userId: 20, status: 'ACTIVE' }),
      }),
    );

    // Assignment should use the newly created tutor id
    expect(prisma.__tx.tutorAssignment.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ tutorId: 99, allocatedHours: 10, semester: '2026-S2' }),
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
        tutorId: 5,
        applicantId: 1,
        courseId: 100,
        allocatedHours: 5,
        semester: '2026-S1',
        status: 'ACTIVE',
        applicant: { user: { firstName: 'Alice', lastName: 'Smith', email: 'alice@wits.ac.za' } },
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
          applicantId: 1,
          tutorId: 5,
          name: 'Alice Smith',
          courseCode: 'COMS3000',
          allocatedHours: 5,
          status: 'ACTIVE',
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

  test('returns 404 when no assignment exists for the applicant', async () => {
    prisma.tutorAssignment.findUnique.mockResolvedValue(null);

    const req = mockReq({ params: { applicantId: '7' } });
    const res = mockRes();
    const next = jest.fn();

    await unassignTutor(req, res, next);

    expect(next).toHaveBeenCalledWith(
      expect.objectContaining({ statusCode: 404, message: 'Assignment not found for this applicant' }),
    );
  });

  test('deletes assignment and resets applicant status to PENDING', async () => {
    prisma.tutorAssignment.findUnique.mockResolvedValue({ id: 10, applicantId: 7 });
    prisma.__tx.tutorAssignment.delete.mockResolvedValue({});
    prisma.__tx.applicant.update.mockResolvedValue({});

    const req = mockReq({ params: { applicantId: '7' } });
    const res = mockRes();
    const next = jest.fn();

    await unassignTutor(req, res, next);
    await flushMicrotasks();

    expect(prisma.__tx.tutorAssignment.delete).toHaveBeenCalledWith({ where: { id: 10 } });
    expect(prisma.__tx.applicant.update).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: 7 },
        data: expect.objectContaining({ status: 'PENDING' }),
      }),
    );
    expect(res.status).toHaveBeenCalledWith(204);
    expect(res.end).toHaveBeenCalled();
    expect(next).not.toHaveBeenCalled();
  });
});
