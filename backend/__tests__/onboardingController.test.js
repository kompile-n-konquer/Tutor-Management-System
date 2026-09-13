// Mock the Prisma client before requiring the controller
jest.mock('../prisma/client', () => {
  const mockTx = {
    roleApplication: { update: jest.fn(), create: jest.fn() },
    user: { update: jest.fn() },
    tutor: { upsert: jest.fn() },
    lecturer: { upsert: jest.fn() },
    applicant: { create: jest.fn() },
  };

  return {
    roleApplication: {
      create: jest.fn(),
      findFirst: jest.fn(),
      findMany: jest.fn(),
      findUnique: jest.fn(),
      update: jest.fn(),
    },
    user: { update: jest.fn() },
    tutor: { upsert: jest.fn() },
    lecturer: { upsert: jest.fn() },
    availability: { count: jest.fn(), findMany: jest.fn() },
    applicant: { findMany: jest.fn(), findFirst: jest.fn(), create: jest.fn(), updateMany: jest.fn() },
    course: { findUnique: jest.fn(), findMany: jest.fn() },
    timeSlot: { count: jest.fn() },
    $transaction: jest.fn((fn) => fn(mockTx)),
    __tx: mockTx,
  };
});

const prisma = require('../prisma/client');
const {
  submitApplication,
  getTutorEligibleCourses,
  getMyApplications,
  getPendingApplications,
  getApplicationById,
  getApplicantRank,
  reviewApplication,
} = require('../controllers/onboarding');

function flushMicrotasks() {
  return new Promise((resolve) => setImmediate(resolve));
}

function mockReq(overrides = {}) {
  return {
    body: {},
    query: {},
    params: {},
    user: { id: 1, role: 'STUDENT', email: 'student@test.com' },
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
// submitApplication
// ════════════════════════════════════════════════════════════════════════
describe('submitApplication', () => {
  test('returns 403 when non-student tries to apply', async () => {
    const req = mockReq({ user: { id: 1, role: 'TUTOR', email: 'tutor@test.com' } });
    const res = mockRes();
    const next = jest.fn();

    await submitApplication(req, res, next);
    await flushMicrotasks();

    expect(next).toHaveBeenCalledWith(
      expect.objectContaining({ statusCode: 403, message: expect.stringContaining('Only students') }),
    );
  });

  test('returns 400 when requestedRole is missing or invalid', async () => {
    const req = mockReq({ body: { requestedRole: 'ADMIN' } });
    const res = mockRes();
    const next = jest.fn();

    await submitApplication(req, res, next);
    await flushMicrotasks();

    expect(next).toHaveBeenCalledWith(
      expect.objectContaining({ statusCode: 400, message: expect.stringContaining('TUTOR or LECTURER') }),
    );
  });

  test('returns 409 when student already has a pending application for the role', async () => {
    prisma.roleApplication.findFirst.mockResolvedValueOnce({ id: 10, status: 'PENDING' });

    const req = mockReq({ body: { requestedRole: 'TUTOR' } });
    const res = mockRes();
    const next = jest.fn();

    await submitApplication(req, res, next);
    await flushMicrotasks();

    expect(next).toHaveBeenCalledWith(
      expect.objectContaining({ statusCode: 409, message: expect.stringContaining('pending') }),
    );
  });

  test('returns 400 for tutor application when availability is not configured', async () => {
    prisma.roleApplication.findFirst
      .mockResolvedValueOnce(null) // no pending
      .mockResolvedValueOnce(null); // no approved
    prisma.availability.count.mockResolvedValue(0);

    const req = mockReq({
      body: { requestedRole: 'TUTOR', hourlyRate: 150, maxHoursPerWeek: 10 },
    });
    const res = mockRes();
    const next = jest.fn();

    await submitApplication(req, res, next);
    await flushMicrotasks();

    expect(next).toHaveBeenCalledWith(
      expect.objectContaining({ statusCode: 400, message: expect.stringContaining('availability') }),
    );
  });

  test('returns 400 when maxHoursPerWeek is missing for tutor application', async () => {
    prisma.roleApplication.findFirst
      .mockResolvedValueOnce(null)
      .mockResolvedValueOnce(null);
    prisma.availability.count.mockResolvedValue(5);

    const req = mockReq({
      body: { requestedRole: 'TUTOR', hourlyRate: 150 },
    });
    const res = mockRes();
    const next = jest.fn();

    await submitApplication(req, res, next);
    await flushMicrotasks();

    expect(next).toHaveBeenCalledWith(
      expect.objectContaining({ statusCode: 400, message: expect.stringContaining('maxHoursPerWeek') }),
    );
  });

  test('creates tutor application with course choice successfully', async () => {
    prisma.roleApplication.findFirst
      .mockResolvedValueOnce(null)
      .mockResolvedValueOnce(null);
    prisma.availability.count.mockResolvedValue(10);
    prisma.course.findUnique.mockResolvedValue({
      id: 1,
      courseCode: 'COMS1015',
      courseName: 'Intro to Programming',
      minimumMark: 65,
      slots: [
        { dayOfWeek: 1, timeSlotId: 2 },
        { dayOfWeek: 3, timeSlotId: 4 },
      ],
    });
    prisma.availability.findMany.mockResolvedValue([
      { dayOfWeek: 1, timeSlotId: 2 },
      { dayOfWeek: 3, timeSlotId: 4 },
      { dayOfWeek: 2, timeSlotId: 6 },
    ]);
    prisma.applicant.findFirst.mockResolvedValue(null);
    prisma.__tx.roleApplication.create.mockResolvedValue({
      id: 1,
      userId: 1,
      requestedRole: 'TUTOR',
      status: 'PENDING',
      hourlyRate: 150,
      maxHoursPerWeek: 10,
      user: { firstName: 'Alex', lastName: 'Mercer', email: 'alex@test.com' },
    });
    prisma.__tx.applicant.create.mockResolvedValue({});

    const req = mockReq({
      body: { requestedRole: 'TUTOR', courseId: 1, courseMark: 78, hourlyRate: 150, maxHoursPerWeek: 10 },
    });
    const res = mockRes();
    const next = jest.fn();

    await submitApplication(req, res, next);
    await flushMicrotasks();

    expect(prisma.__tx.roleApplication.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          userId: 1,
          requestedRole: 'TUTOR',
          hourlyRate: 150,
          maxHoursPerWeek: 10,
        }),
      }),
    );

    // The per-course Applicant row is created alongside the role application
    expect(prisma.__tx.applicant.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          userId: 1,
          courseId: 1,
          courseMark: 78,
          status: 'PENDING',
        }),
      }),
    );

    expect(res.status).toHaveBeenCalledWith(201);
    expect(next).not.toHaveBeenCalled();
  });

  test('returns 400 when courseId is missing for tutor application', async () => {
    prisma.roleApplication.findFirst
      .mockResolvedValueOnce(null)
      .mockResolvedValueOnce(null);
    prisma.availability.count.mockResolvedValue(10);

    const req = mockReq({
      body: { requestedRole: 'TUTOR', courseMark: 78, maxHoursPerWeek: 10 },
    });
    const res = mockRes();
    const next = jest.fn();

    await submitApplication(req, res, next);
    await flushMicrotasks();

    expect(next).toHaveBeenCalledWith(
      expect.objectContaining({ statusCode: 400, message: expect.stringContaining('courseId') }),
    );
  });

  test('returns 400 when courseMark is missing or invalid', async () => {
    prisma.roleApplication.findFirst
      .mockResolvedValueOnce(null)
      .mockResolvedValueOnce(null);
    prisma.availability.count.mockResolvedValue(10);

    const req = mockReq({
      body: { requestedRole: 'TUTOR', courseId: 1, courseMark: 150, maxHoursPerWeek: 10 },
    });
    const res = mockRes();
    const next = jest.fn();

    await submitApplication(req, res, next);
    await flushMicrotasks();

    expect(next).toHaveBeenCalledWith(
      expect.objectContaining({ statusCode: 400, message: expect.stringContaining('courseMark') }),
    );
  });

  test('returns 404 when the chosen course does not exist', async () => {
    prisma.roleApplication.findFirst
      .mockResolvedValueOnce(null)
      .mockResolvedValueOnce(null);
    prisma.availability.count.mockResolvedValue(10);
    prisma.course.findUnique.mockResolvedValue(null);

    const req = mockReq({
      body: { requestedRole: 'TUTOR', courseId: 999, courseMark: 78, maxHoursPerWeek: 10 },
    });
    const res = mockRes();
    const next = jest.fn();

    await submitApplication(req, res, next);
    await flushMicrotasks();

    expect(next).toHaveBeenCalledWith(
      expect.objectContaining({ statusCode: 404, message: 'Course not found' }),
    );
  });

  test('returns 400 when courseMark is below the course minimumMark', async () => {
    prisma.roleApplication.findFirst
      .mockResolvedValueOnce(null)
      .mockResolvedValueOnce(null);
    prisma.availability.count.mockResolvedValue(10);
    prisma.course.findUnique.mockResolvedValue({
      id: 1,
      courseCode: 'COMS1015',
      courseName: 'Intro to Programming',
      minimumMark: 65,
      slots: [],
    });

    const req = mockReq({
      body: { requestedRole: 'TUTOR', courseId: 1, courseMark: 60, maxHoursPerWeek: 10 },
    });
    const res = mockRes();
    const next = jest.fn();

    await submitApplication(req, res, next);
    await flushMicrotasks();

    expect(next).toHaveBeenCalledWith(
      expect.objectContaining({ statusCode: 400, message: expect.stringContaining('below the minimum') }),
    );
  });

  test('returns 400 when availability clashes with a course session slot', async () => {
    prisma.roleApplication.findFirst
      .mockResolvedValueOnce(null)
      .mockResolvedValueOnce(null);
    prisma.availability.count.mockResolvedValue(10);
    prisma.course.findUnique.mockResolvedValue({
      id: 1,
      courseCode: 'COMS1015',
      courseName: 'Intro to Programming',
      minimumMark: 65,
      slots: [
        { dayOfWeek: 1, timeSlotId: 2 }, // covered
        { dayOfWeek: 5, timeSlotId: 4 }, // NOT covered → clash
      ],
    });
    prisma.availability.findMany.mockResolvedValue([
      { dayOfWeek: 1, timeSlotId: 2 },
    ]);

    const req = mockReq({
      body: { requestedRole: 'TUTOR', courseId: 1, courseMark: 78, maxHoursPerWeek: 10 },
    });
    const res = mockRes();
    const next = jest.fn();

    await submitApplication(req, res, next);
    await flushMicrotasks();

    expect(next).toHaveBeenCalledWith(
      expect.objectContaining({ statusCode: 400, message: expect.stringContaining('clashes') }),
    );
    expect(prisma.__tx.applicant.create).not.toHaveBeenCalled();
  });

  test('returns 409 when the user has already applied to tutor the course', async () => {
    prisma.roleApplication.findFirst
      .mockResolvedValueOnce(null)
      .mockResolvedValueOnce(null);
    prisma.availability.count.mockResolvedValue(10);
    prisma.course.findUnique.mockResolvedValue({
      id: 1,
      courseCode: 'COMS1015',
      courseName: 'Intro to Programming',
      minimumMark: 65,
      slots: [],
    });
    prisma.availability.findMany.mockResolvedValue([]);
    prisma.applicant.findFirst.mockResolvedValue({ id: 55, userId: 1, courseId: 1 });

    const req = mockReq({
      body: { requestedRole: 'TUTOR', courseId: 1, courseMark: 78, maxHoursPerWeek: 10 },
    });
    const res = mockRes();
    const next = jest.fn();

    await submitApplication(req, res, next);
    await flushMicrotasks();

    expect(next).toHaveBeenCalledWith(
      expect.objectContaining({ statusCode: 409, message: expect.stringContaining('already applied') }),
    );
    expect(prisma.__tx.applicant.create).not.toHaveBeenCalled();
  });

  test('creates lecturer application successfully', async () => {
    prisma.roleApplication.findFirst
      .mockResolvedValueOnce(null)
      .mockResolvedValueOnce(null);
    prisma.roleApplication.create.mockResolvedValue({
      id: 2,
      userId: 1,
      requestedRole: 'LECTURER',
      status: 'PENDING',
      department: 'CSAM',
      user: { firstName: 'Alex', lastName: 'Mercer', email: 'alex@test.com' },
    });

    const req = mockReq({
      body: { requestedRole: 'LECTURER', department: 'CSAM', officeLocation: 'Room 204' },
    });
    const res = mockRes();
    const next = jest.fn();

    await submitApplication(req, res, next);
    await flushMicrotasks();

    expect(prisma.roleApplication.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          userId: 1,
          requestedRole: 'LECTURER',
          department: 'CSAM',
          officeLocation: 'Room 204',
        }),
      }),
    );
    expect(res.status).toHaveBeenCalledWith(201);
    expect(next).not.toHaveBeenCalled();
  });

  test('returns 400 when department is missing for lecturer application', async () => {
    prisma.roleApplication.findFirst
      .mockResolvedValueOnce(null)
      .mockResolvedValueOnce(null);

    const req = mockReq({
      body: { requestedRole: 'LECTURER' },
    });
    const res = mockRes();
    const next = jest.fn();

    await submitApplication(req, res, next);
    await flushMicrotasks();

    expect(next).toHaveBeenCalledWith(
      expect.objectContaining({ statusCode: 400, message: expect.stringContaining('department') }),
    );
  });
});

// ════════════════════════════════════════════════════════════════════════
// getMyApplications
// ════════════════════════════════════════════════════════════════════════
describe('getMyApplications', () => {
  test('returns user applications and availability status', async () => {
    prisma.roleApplication.findMany.mockResolvedValue([
      { id: 1, userId: 1, requestedRole: 'TUTOR', status: 'PENDING', submittedAt: new Date() },
    ]);
    prisma.availability.count.mockResolvedValue(5);

    const req = mockReq();
    const res = mockRes();
    const next = jest.fn();

    await getMyApplications(req, res, next);
    await flushMicrotasks();

    expect(res.json).toHaveBeenCalledWith({
      applications: expect.arrayContaining([
        expect.objectContaining({ requestedRole: 'TUTOR', status: 'PENDING' }),
      ]),
      hasAvailability: true,
    });
    expect(next).not.toHaveBeenCalled();
  });
});

// ════════════════════════════════════════════════════════════════════════
// reviewApplication
// ════════════════════════════════════════════════════════════════════════
describe('reviewApplication', () => {
  test('returns 400 when action is missing', async () => {
    const req = mockReq({
      user: { id: 99, role: 'ORGANISER' },
      params: { id: '1' },
      body: {},
    });
    const res = mockRes();
    const next = jest.fn();

    await reviewApplication(req, res, next);
    await flushMicrotasks();

    expect(next).toHaveBeenCalledWith(
      expect.objectContaining({ statusCode: 400, message: expect.stringContaining('APPROVE or REJECT') }),
    );
  });

  test('returns 404 when application does not exist', async () => {
    prisma.roleApplication.findUnique.mockResolvedValue(null);

    const req = mockReq({
      user: { id: 99, role: 'ORGANISER' },
      params: { id: '999' },
      body: { action: 'APPROVE' },
    });
    const res = mockRes();
    const next = jest.fn();

    await reviewApplication(req, res, next);
    await flushMicrotasks();

    expect(next).toHaveBeenCalledWith(
      expect.objectContaining({ statusCode: 404, message: 'Application not found' }),
    );
  });

  test('returns 400 when application is not PENDING', async () => {
    prisma.roleApplication.findUnique.mockResolvedValue({
      id: 1,
      userId: 5,
      requestedRole: 'TUTOR',
      status: 'APPROVED',
    });

    const req = mockReq({
      user: { id: 99, role: 'ORGANISER' },
      params: { id: '1' },
      body: { action: 'APPROVE' },
    });
    const res = mockRes();
    const next = jest.fn();

    await reviewApplication(req, res, next);
    await flushMicrotasks();

    expect(next).toHaveBeenCalledWith(
      expect.objectContaining({ statusCode: 400, message: expect.stringContaining('already been') }),
    );
  });

  test('returns 403 when organiser tries to self-approve', async () => {
    prisma.roleApplication.findUnique.mockResolvedValue({
      id: 1,
      userId: 99,
      requestedRole: 'TUTOR',
      status: 'PENDING',
      user: { id: 99 },
    });

    const req = mockReq({
      user: { id: 99, role: 'ORGANISER' },
      params: { id: '1' },
      body: { action: 'APPROVE' },
    });
    const res = mockRes();
    const next = jest.fn();

    await reviewApplication(req, res, next);
    await flushMicrotasks();

    expect(next).toHaveBeenCalledWith(
      expect.objectContaining({ statusCode: 403, message: expect.stringContaining('own application') }),
    );
  });

  test('approves tutor application: updates role, creates tutor record', async () => {
    prisma.roleApplication.findUnique.mockResolvedValue({
      id: 1,
      userId: 5,
      requestedRole: 'TUTOR',
      status: 'PENDING',
      hourlyRate: 150,
      maxHoursPerWeek: 10,
      user: { id: 5, firstName: 'Alex', lastName: 'Mercer' },
    });
    prisma.__tx.roleApplication.update.mockResolvedValue({});
    prisma.__tx.user.update.mockResolvedValue({});
    prisma.__tx.tutor.upsert.mockResolvedValue({ id: 10, userId: 5 });

    const req = mockReq({
      user: { id: 99, role: 'ORGANISER' },
      params: { id: '1' },
      body: { action: 'APPROVE' },
    });
    const res = mockRes();
    const next = jest.fn();

    await reviewApplication(req, res, next);
    await flushMicrotasks();

    // Verify role was updated to TUTOR
    expect(prisma.__tx.user.update).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: 5 },
        data: expect.objectContaining({ role: 'TUTOR' }),
      }),
    );

    // Verify tutor record was created
    expect(prisma.__tx.tutor.upsert).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { userId: 5 },
        create: expect.objectContaining({
          userId: 5,
          hourlyRate: 150,
          maxHoursPerWeek: 10,
          status: 'ACTIVE',
        }),
      }),
    );

    // Verify application status was updated
    expect(prisma.__tx.roleApplication.update).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: 1 },
        data: expect.objectContaining({ status: 'APPROVED' }),
      }),
    );

    expect(res.json).toHaveBeenCalledWith(
      expect.objectContaining({
        message: expect.stringContaining('approved'),
      }),
    );
    expect(next).not.toHaveBeenCalled();
  });

  test('approves lecturer application: updates role, creates lecturer record', async () => {
    prisma.roleApplication.findUnique.mockResolvedValue({
      id: 2,
      userId: 6,
      requestedRole: 'LECTURER',
      status: 'PENDING',
      department: 'CSAM',
      officeLocation: 'Room 204',
      officeHours: 'Mon/Wed 14:00-16:00',
      user: { id: 6, firstName: 'Sarah', lastName: 'Van Wyk' },
    });
    prisma.__tx.roleApplication.update.mockResolvedValue({});
    prisma.__tx.user.update.mockResolvedValue({});
    prisma.__tx.lecturer.upsert.mockResolvedValue({ id: 5, userId: 6 });

    const req = mockReq({
      user: { id: 99, role: 'ORGANISER' },
      params: { id: '2' },
      body: { action: 'APPROVE' },
    });
    const res = mockRes();
    const next = jest.fn();

    await reviewApplication(req, res, next);
    await flushMicrotasks();

    expect(prisma.__tx.user.update).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: 6 },
        data: expect.objectContaining({ role: 'LECTURER' }),
      }),
    );

    expect(prisma.__tx.lecturer.upsert).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { userId: 6 },
        create: expect.objectContaining({
          userId: 6,
          department: 'CSAM',
          officeLocation: 'Room 204',
        }),
      }),
    );

    expect(res.json).toHaveBeenCalledWith(
      expect.objectContaining({
        message: expect.stringContaining('approved'),
      }),
    );
    expect(next).not.toHaveBeenCalled();
  });

  test('rejects application and stores rejection reason', async () => {
    prisma.roleApplication.findUnique.mockResolvedValue({
      id: 1,
      userId: 5,
      requestedRole: 'TUTOR',
      status: 'PENDING',
      user: { id: 5 },
    });
    prisma.roleApplication.update.mockResolvedValue({});
    prisma.applicant.updateMany.mockResolvedValue({ count: 1 });

    const req = mockReq({
      user: { id: 99, role: 'ORGANISER' },
      params: { id: '1' },
      body: { action: 'REJECT', rejectionReason: 'Insufficient availability' },
    });
    const res = mockRes();
    const next = jest.fn();

    await reviewApplication(req, res, next);
    await flushMicrotasks();

    expect(prisma.roleApplication.update).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: 1 },
        data: expect.objectContaining({
          status: 'REJECTED',
          rejectionReason: 'Insufficient availability',
        }),
      }),
    );

    // Rejected tutor applicants leave the per-course available pool
    expect(prisma.applicant.updateMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { userId: 5, status: 'PENDING' },
        data: expect.objectContaining({ status: 'REJECTED' }),
      }),
    );

    expect(res.json).toHaveBeenCalledWith(
      expect.objectContaining({
        message: expect.stringContaining('rejected'),
      }),
    );
    expect(next).not.toHaveBeenCalled();
  });
});

// ════════════════════════════════════════════════════════════════════════
// getTutorEligibleCourses
// ════════════════════════════════════════════════════════════════════════
describe('getTutorEligibleCourses', () => {
  test('returns only courses whose session slots fit the user availability', async () => {
    prisma.availability.findMany.mockResolvedValue([
      { dayOfWeek: 1, timeSlotId: 2 },
      { dayOfWeek: 3, timeSlotId: 4 },
      { dayOfWeek: 2, timeSlotId: 6 },
    ]);
    prisma.course.findMany.mockResolvedValue([
      {
        id: 1,
        courseCode: 'COMS1015',
        courseName: 'Intro to Programming',
        minimumMark: 65,
        requiredTutors: 2,
        slots: [
          { dayOfWeek: 1, timeSlotId: 2 },
          { dayOfWeek: 3, timeSlotId: 4 },
        ],
        lecturer: { user: { firstName: 'Sarah', lastName: 'Van Wyk' } },
      },
      {
        id: 2,
        courseCode: 'MATH2002',
        courseName: 'Discrete Mathematics',
        minimumMark: 60,
        requiredTutors: 1,
        slots: [
          { dayOfWeek: 1, timeSlotId: 2 },
          { dayOfWeek: 5, timeSlotId: 4 }, // not in availability → clash
        ],
        lecturer: { user: { firstName: 'Sarah', lastName: 'Van Wyk' } },
      },
    ]);

    const req = mockReq();
    const res = mockRes();
    const next = jest.fn();

    await getTutorEligibleCourses(req, res, next);
    await flushMicrotasks();

    expect(res.json).toHaveBeenCalledWith({
      eligibleCourses: [
        expect.objectContaining({
          id: 1,
          courseCode: 'COMS1015',
          lecturerName: 'Sarah Van Wyk',
          slotCount: 2,
        }),
      ],
    });
    expect(next).not.toHaveBeenCalled();
  });

  test('returns courses without slots as eligible (nothing to clash with)', async () => {
    prisma.availability.findMany.mockResolvedValue([]);
    prisma.course.findMany.mockResolvedValue([
      {
        id: 3,
        courseCode: 'COMS3055',
        courseName: 'Database Systems',
        minimumMark: 65,
        requiredTutors: 4,
        slots: [],
        lecturer: null,
      },
    ]);

    const req = mockReq();
    const res = mockRes();
    const next = jest.fn();

    await getTutorEligibleCourses(req, res, next);
    await flushMicrotasks();

    expect(res.json).toHaveBeenCalledWith({
      eligibleCourses: [
        expect.objectContaining({ courseCode: 'COMS3055', lecturerName: null, slotCount: 0 }),
      ],
    });
    expect(next).not.toHaveBeenCalled();
  });
});

// ════════════════════════════════════════════════════════════════════════
// getApplicantRank
// ════════════════════════════════════════════════════════════════════════
describe('getApplicantRank', () => {
  test('returns 404 when application not found', async () => {
    prisma.roleApplication.findUnique.mockResolvedValue(null);

    const req = mockReq({ params: { id: '999' } });
    const res = mockRes();
    const next = jest.fn();

    await getApplicantRank(req, res, next);
    await flushMicrotasks();

    expect(next).toHaveBeenCalledWith(
      expect.objectContaining({ statusCode: 404 }),
    );
  });

  test('returns 400 when application is not for TUTOR role', async () => {
    prisma.roleApplication.findUnique.mockResolvedValue({
      id: 1,
      userId: 5,
      requestedRole: 'LECTURER',
    });

    const req = mockReq({ params: { id: '1' } });
    const res = mockRes();
    const next = jest.fn();

    await getApplicantRank(req, res, next);
    await flushMicrotasks();

    expect(next).toHaveBeenCalledWith(
      expect.objectContaining({ statusCode: 400, message: expect.stringContaining('tutor') }),
    );
  });

  test('computes rank score from course marks and availability', async () => {
    prisma.roleApplication.findUnique.mockResolvedValue({
      id: 1,
      userId: 5,
      requestedRole: 'TUTOR',
    });
    prisma.applicant.findMany.mockResolvedValue([
      {
        courseMark: 85,
        course: { courseCode: 'COMS1015', courseName: 'Intro to Programming', minimumMark: 65 },
      },
      {
        courseMark: 90,
        course: { courseCode: 'MATH2002', courseName: 'Discrete Math', minimumMark: 60 },
      },
    ]);
    prisma.availability.count.mockResolvedValue(15);
    prisma.timeSlot.count.mockResolvedValue(6); // 6 slots × 5 days = 30 total

    const req = mockReq({ params: { id: '1' } });
    const res = mockRes();
    const next = jest.fn();

    await getApplicantRank(req, res, next);
    await flushMicrotasks();

    // avg mark = (85+90)/2 = 87.5
    // availability ratio = 15/30 = 0.5
    // rank score = round(87.5 * 0.7 + 0.5 * 100 * 0.3) = round(61.25 + 15) = 76
    expect(res.json).toHaveBeenCalledWith(
      expect.objectContaining({
        rankScore: 76,
        avgCourseMark: 87.5,
        availabilityCount: 15,
      }),
    );
    expect(next).not.toHaveBeenCalled();
  });
});

// ════════════════════════════════════════════════════════════════════════
// getPendingApplications
// ════════════════════════════════════════════════════════════════════════
describe('getPendingApplications', () => {
  test('returns enriched pending applications', async () => {
    prisma.roleApplication.findMany.mockResolvedValue([
      {
        id: 1,
        userId: 5,
        requestedRole: 'TUTOR',
        status: 'PENDING',
        submittedAt: new Date(),
        user: { id: 5, firstName: 'Alex', lastName: 'Mercer', email: 'alex@test.com' },
      },
    ]);
    prisma.availability.count.mockResolvedValue(10);
    prisma.applicant.findMany.mockResolvedValue([
      {
        courseMark: 88,
        course: { courseCode: 'COMS1015', courseName: 'Intro to Programming' },
      },
    ]);

    const req = mockReq({ user: { id: 99, role: 'ORGANISER' }, query: {} });
    const res = mockRes();
    const next = jest.fn();

    await getPendingApplications(req, res, next);
    await flushMicrotasks();

    const result = res.json.mock.calls[0][0];
    expect(result.applications).toHaveLength(1);
    expect(result.applications[0]).toMatchObject({
      requestedRole: 'TUTOR',
      availabilityCount: 10,
      courseMarks: expect.arrayContaining([
        expect.objectContaining({ courseCode: 'COMS1015', mark: 88 }),
      ]),
    });
    expect(next).not.toHaveBeenCalled();
  });
});
