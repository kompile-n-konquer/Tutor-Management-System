// Mock the Prisma client before requiring the controller
jest.mock('../prisma/client', () => ({
  user: { findUnique: jest.fn() },
  tutorAssignment: { findMany: jest.fn(), findUnique: jest.fn() },
  course: { findMany: jest.fn() },
  courseSlot: { findUnique: jest.fn() },
  session: { findMany: jest.fn(), findUnique: jest.fn(), findFirst: jest.fn(), update: jest.fn(), create: jest.fn() },
}));

const prisma = require('../prisma/client');
const {
  getMySessions,
  getLecturerSessions,
  scheduleSession,
  excuseSession,
} = require('../controllers/sessions');

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
    user: { user_id: 'uid-123' },
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
// getMySessions — the tutor dashboard's personalized feed
// ════════════════════════════════════════════════════════════════════════
describe('getMySessions', () => {
  test('returns 404 when the requesting user does not exist', async () => {
    prisma.user.findUnique.mockResolvedValue(null);

    const req = mockReq();
    const res = mockRes();
    const next = jest.fn();

    await getMySessions(req, res, next);
    await flushMicrotasks();

    expect(next).toHaveBeenCalledWith(
      expect.objectContaining({ statusCode: 404 }),
    );
    expect(prisma.session.findMany).not.toHaveBeenCalled();
  });

  test('returns 403 when the requesting user is not a tutor', async () => {
    prisma.user.findUnique.mockResolvedValue({ id: 1, tutor: null });

    const req = mockReq();
    const res = mockRes();
    const next = jest.fn();

    await getMySessions(req, res, next);
    await flushMicrotasks();

    expect(next).toHaveBeenCalledWith(
      expect.objectContaining({ statusCode: 403, message: 'Only tutors can view their assigned sessions' }),
    );
    expect(prisma.session.findMany).not.toHaveBeenCalled();
  });

  test('scopes sessions to the courses the tutor is actively assigned to, not just their own assignments', async () => {
    prisma.user.findUnique.mockResolvedValue({ id: 1, tutor: { id: 7, maxHoursPerWeek: 20 } });
    prisma.tutorAssignment.findMany.mockResolvedValue([
      {
        id: 11,
        allocatedHours: 6,
        semester: '2026-S2',
        course: {
          id: 100,
          courseCode: 'COMS1015',
          courseName: 'Introduction to Programming',
          lecturer: { user: { firstName: 'Sarah', lastName: 'Van Wyk' } },
        },
      },
    ]);
    prisma.session.findMany.mockResolvedValue([]);

    const req = mockReq();
    const res = mockRes();
    const next = jest.fn();

    await getMySessions(req, res, next);
    await flushMicrotasks();

    // The session query must filter by the tutor's course assignments —
    // every session whose assignment's course has an ACTIVE assignment
    // for this tutor, which is the course-level scoping the dashboard needs.
    expect(prisma.session.findMany.mock.calls[0][0].where).toEqual({
      assignment: {
        course: { assignments: { some: { tutorId: 7, status: 'ACTIVE' } } },
      },
    });

    // The tutor's own assignments drive the courses list.
    expect(prisma.tutorAssignment.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { tutorId: 7, status: 'ACTIVE' },
      }),
    );

    expect(res.json).toHaveBeenCalledWith(
      expect.objectContaining({
        maxHoursPerWeek: 20,
        courses: [
          expect.objectContaining({
            assignmentId: 11,
            courseCode: 'COMS1015',
            lecturerName: 'Sarah Van Wyk',
          }),
        ],
        sessions: [],
      }),
    );
    expect(next).not.toHaveBeenCalled();
  });

  test('marks own sessions with isMine and names the tutor leading each session', async () => {
    prisma.user.findUnique.mockResolvedValue({ id: 1, tutor: { id: 7, maxHoursPerWeek: 10 } });
    prisma.tutorAssignment.findMany.mockResolvedValue([]);
    prisma.session.findMany.mockResolvedValue([
      {
        id: 21,
        date: new Date('2026-09-21T00:00:00.000Z'),
        status: 'SCHEDULED',
        excuseReason: null,
        assignment: {
          tutorId: 7,
          courseId: 100,
          course: { courseCode: 'COMS1015', courseName: 'Introduction to Programming' },
          tutor: { user: { firstName: 'Thabo', lastName: 'Demotutor' } },
        },
        courseSlot: {
          id: 31,
          dayOfWeek: 1,
          venue: 'Lab 2',
          sessionType: 'Tutorial',
          timeSlot: { id: 3, startMinute: 480, endMinute: 570 },
        },
      },
      {
        id: 22,
        date: new Date('2026-09-22T00:00:00.000Z'),
        status: 'UNASSIGNED',
        excuseReason: 'Medical appointment',
        assignment: {
          tutorId: 9,
          courseId: 100,
          course: { courseCode: 'COMS1015', courseName: 'Introduction to Programming' },
          tutor: { user: { firstName: 'Alex', lastName: 'Mercer' } },
        },
        courseSlot: {
          id: 32,
          dayOfWeek: 2,
          venue: null,
          sessionType: null,
          timeSlot: { id: 4, startMinute: 660, endMinute: 750 },
        },
      },
    ]);

    const req = mockReq();
    const res = mockRes();
    const next = jest.fn();

    await getMySessions(req, res, next);
    await flushMicrotasks();

    expect(res.json).toHaveBeenCalledWith(
      expect.objectContaining({
        sessions: [
          expect.objectContaining({ id: 21, isMine: true, ledBy: 'Thabo Demotutor' }),
          expect.objectContaining({
            id: 22,
            isMine: false,
            ledBy: 'Alex Mercer',
            excuseReason: 'Medical appointment',
          }),
        ],
      }),
    );
    expect(next).not.toHaveBeenCalled();
  });
});

// ════════════════════════════════════════════════════════════════════════
// getLecturerSessions — the lecturer's scheduling overview
// ════════════════════════════════════════════════════════════════════════
describe('getLecturerSessions', () => {
  test('returns 403 when the requesting user is not a lecturer', async () => {
    prisma.user.findUnique.mockResolvedValue({ id: 1, lecturer: null });

    const req = mockReq();
    const res = mockRes();
    const next = jest.fn();

    await getLecturerSessions(req, res, next);
    await flushMicrotasks();

    expect(next).toHaveBeenCalledWith(
      expect.objectContaining({ statusCode: 403 }),
    );
    expect(prisma.course.findMany).not.toHaveBeenCalled();
  });

  test('returns only the courses owned by the lecturer with slots, tutors and flattened sessions', async () => {
    prisma.user.findUnique.mockResolvedValue({ id: 1, lecturer: { id: 5 } });
    prisma.course.findMany.mockResolvedValue([
      {
        id: 100,
        courseCode: 'COMS1015',
        courseName: 'Introduction to Programming',
        slots: [
          {
            id: 31,
            dayOfWeek: 1,
            venue: 'Lab 2',
            sessionType: 'Tutorial',
            timeSlot: { startMinute: 480, endMinute: 570 },
          },
        ],
        assignments: [
          {
            id: 11,
            tutorId: 7,
            allocatedHours: 6,
            tutor: { user: { firstName: 'Thabo', lastName: 'Demotutor' } },
            sessions: [
              {
                id: 21,
                date: new Date('2026-09-21T00:00:00.000Z'),
                status: 'SCHEDULED',
                excuseReason: null,
                courseSlot: {
                  id: 31,
                  dayOfWeek: 1,
                  venue: 'Lab 2',
                  sessionType: 'Tutorial',
                  timeSlot: { startMinute: 480, endMinute: 570 },
                },
              },
            ],
          },
        ],
      },
    ]);

    const req = mockReq();
    const res = mockRes();
    const next = jest.fn();

    await getLecturerSessions(req, res, next);
    await flushMicrotasks();

    expect(prisma.course.findMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: { lecturerId: 5 } }),
    );

    expect(res.json).toHaveBeenCalledWith({
      courses: [
        expect.objectContaining({
          id: 100,
          courseCode: 'COMS1015',
          slots: [expect.objectContaining({ id: 31, dayOfWeek: 1 })],
          tutors: [expect.objectContaining({ assignmentId: 11, name: 'Thabo Demotutor' })],
          sessions: [
            expect.objectContaining({ id: 21, assignmentId: 11, tutorName: 'Thabo Demotutor' }),
          ],
        }),
      ],
    });
    expect(next).not.toHaveBeenCalled();
  });
});

// ════════════════════════════════════════════════════════════════════════
// scheduleSession — lecturers scheduling sessions for their courses
// ════════════════════════════════════════════════════════════════════════
describe('scheduleSession', () => {
  function lecturerUser() {
    return { id: 2, lecturer: { id: 5 } };
  }

  function validBody() {
    return { assignmentId: 11, courseSlotId: 31, date: '2026-09-21' };
  }

  function ownAssignment() {
    return {
      id: 11,
      tutorId: 7,
      courseId: 100,
      status: 'ACTIVE',
      course: { id: 100, courseCode: 'COMS1015', courseName: 'Introduction to Programming', lecturerId: 5 },
    };
  }

  test('returns 400 when assignmentId or courseSlotId is not a valid integer', async () => {
    const req = mockReq({ body: { assignmentId: 'abc', courseSlotId: 31, date: '2026-09-21' } });
    const res = mockRes();
    const next = jest.fn();

    await scheduleSession(req, res, next);
    await flushMicrotasks();

    expect(next).toHaveBeenCalledWith(
      expect.objectContaining({ statusCode: 400, message: expect.stringContaining('valid integers') }),
    );
    expect(prisma.user.findUnique).not.toHaveBeenCalled();
  });

  test('returns 400 when the date is missing or invalid', async () => {
    const req = mockReq({ body: { assignmentId: 11, courseSlotId: 31, date: 'not-a-date' } });
    const res = mockRes();
    const next = jest.fn();

    await scheduleSession(req, res, next);
    await flushMicrotasks();

    expect(next).toHaveBeenCalledWith(
      expect.objectContaining({ statusCode: 400, message: expect.stringContaining('valid session date') }),
    );
  });

  test('returns 403 when the requesting user is not a lecturer', async () => {
    prisma.user.findUnique.mockResolvedValue({ id: 1, lecturer: null });

    const req = mockReq({ body: validBody() });
    const res = mockRes();
    const next = jest.fn();

    await scheduleSession(req, res, next);
    await flushMicrotasks();

    expect(next).toHaveBeenCalledWith(
      expect.objectContaining({ statusCode: 403 }),
    );
    expect(prisma.session.create).not.toHaveBeenCalled();
  });

  test('returns 404 when the tutor assignment does not exist', async () => {
    prisma.user.findUnique.mockResolvedValue(lecturerUser());
    prisma.tutorAssignment.findUnique.mockResolvedValue(null);

    const req = mockReq({ body: validBody() });
    const res = mockRes();
    const next = jest.fn();

    await scheduleSession(req, res, next);
    await flushMicrotasks();

    expect(next).toHaveBeenCalledWith(
      expect.objectContaining({ statusCode: 404, message: expect.stringContaining('Tutor assignment not found') }),
    );
  });

  test('returns 403 when the course belongs to a different lecturer', async () => {
    prisma.user.findUnique.mockResolvedValue(lecturerUser());
    const foreignAssignment = ownAssignment();
    foreignAssignment.course = { ...foreignAssignment.course, lecturerId: 999 };
    prisma.tutorAssignment.findUnique.mockResolvedValue(foreignAssignment);

    const req = mockReq({ body: validBody() });
    const res = mockRes();
    const next = jest.fn();

    await scheduleSession(req, res, next);
    await flushMicrotasks();

    expect(next).toHaveBeenCalledWith(
      expect.objectContaining({ statusCode: 403, message: expect.stringContaining('your own courses') }),
    );
    expect(prisma.session.create).not.toHaveBeenCalled();
  });

  test('returns 409 when the assignment is not active or has no tutor', async () => {
    prisma.user.findUnique.mockResolvedValue(lecturerUser());
    const inactiveAssignment = { ...ownAssignment(), status: 'REMOVED', tutorId: null };
    prisma.tutorAssignment.findUnique.mockResolvedValue(inactiveAssignment);

    const req = mockReq({ body: validBody() });
    const res = mockRes();
    const next = jest.fn();

    await scheduleSession(req, res, next);
    await flushMicrotasks();

    expect(next).toHaveBeenCalledWith(
      expect.objectContaining({ statusCode: 409, message: expect.stringContaining('not actively assigned') }),
    );
    expect(prisma.session.create).not.toHaveBeenCalled();
  });

  test('returns 400 when the course slot belongs to a different course', async () => {
    prisma.user.findUnique.mockResolvedValue(lecturerUser());
    prisma.tutorAssignment.findUnique.mockResolvedValue(ownAssignment());
    prisma.courseSlot.findUnique.mockResolvedValue({ id: 31, courseId: 200 });

    const req = mockReq({ body: validBody() });
    const res = mockRes();
    const next = jest.fn();

    await scheduleSession(req, res, next);
    await flushMicrotasks();

    expect(next).toHaveBeenCalledWith(
      expect.objectContaining({ statusCode: 400, message: expect.stringContaining('does not belong to this course') }),
    );
    expect(prisma.session.create).not.toHaveBeenCalled();
  });

  test('returns 409 when the same tutor, slot and date already has a session', async () => {
    prisma.user.findUnique.mockResolvedValue(lecturerUser());
    prisma.tutorAssignment.findUnique.mockResolvedValue(ownAssignment());
    prisma.courseSlot.findUnique.mockResolvedValue({ id: 31, courseId: 100 });
    prisma.session.findFirst.mockResolvedValue({ id: 99 });

    const req = mockReq({ body: validBody() });
    const res = mockRes();
    const next = jest.fn();

    await scheduleSession(req, res, next);
    await flushMicrotasks();

    expect(next).toHaveBeenCalledWith(
      expect.objectContaining({ statusCode: 409, message: expect.stringContaining('already scheduled') }),
    );
    expect(prisma.session.create).not.toHaveBeenCalled();
  });

  test('creates a SCHEDULED session for the tutor assignment and returns 201', async () => {
    prisma.user.findUnique.mockResolvedValue(lecturerUser());
    prisma.tutorAssignment.findUnique.mockResolvedValue(ownAssignment());
    prisma.courseSlot.findUnique.mockResolvedValue({ id: 31, courseId: 100 });
    prisma.session.findFirst.mockResolvedValue(null);

    const createdSession = {
      id: 21,
      date: new Date('2026-09-21T00:00:00.000Z'),
      status: 'SCHEDULED',
      assignment: {
        course: { courseCode: 'COMS1015', courseName: 'Introduction to Programming' },
        tutor: { user: { firstName: 'Thabo', lastName: 'Demotutor' } },
      },
      courseSlot: { timeSlot: { startMinute: 480, endMinute: 570 } },
    };
    prisma.session.create.mockResolvedValue(createdSession);

    const req = mockReq({ body: validBody() });
    const res = mockRes();
    const next = jest.fn();

    await scheduleSession(req, res, next);
    await flushMicrotasks();

    expect(prisma.session.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: {
          assignmentId: 11,
          courseSlotId: 31,
          date: new Date('2026-09-21T00:00:00.000Z'),
          status: 'SCHEDULED',
        },
      }),
    );
    expect(res.status).toHaveBeenCalledWith(201);
    expect(res.json).toHaveBeenCalledWith(createdSession);
    expect(next).not.toHaveBeenCalled();
  });
});

// ════════════════════════════════════════════════════════════════════════
// excuseSession — regression: the excuse flow keeps its tutor-scoped rules
// ════════════════════════════════════════════════════════════════════════
describe('excuseSession', () => {
  test('returns 400 when the session id is invalid', async () => {
    const req = mockReq({ params: { id: 'abc' }, body: { reason: 'Sick' } });
    const res = mockRes();
    const next = jest.fn();

    await excuseSession(req, res, next);
    await flushMicrotasks();

    expect(next).toHaveBeenCalledWith(
      expect.objectContaining({ statusCode: 400, message: 'Invalid session id' }),
    );
  });

  test('returns 400 when no reason is provided', async () => {
    const req = mockReq({ params: { id: '21' }, body: { reason: '   ' } });
    const res = mockRes();
    const next = jest.fn();

    await excuseSession(req, res, next);
    await flushMicrotasks();

    expect(next).toHaveBeenCalledWith(
      expect.objectContaining({ statusCode: 400, message: 'An excuse reason is required' }),
    );
  });

  test('returns 403 when the session belongs to another tutor', async () => {
    prisma.user.findUnique.mockResolvedValue({ id: 1, tutor: { id: 7 } });
    prisma.session.findUnique.mockResolvedValue({
      id: 21,
      status: 'SCHEDULED',
      assignment: { tutorId: 9 },
    });

    const req = mockReq({ params: { id: '21' }, body: { reason: 'Medical appointment' } });
    const res = mockRes();
    const next = jest.fn();

    await excuseSession(req, res, next);
    await flushMicrotasks();

    expect(next).toHaveBeenCalledWith(
      expect.objectContaining({ statusCode: 403, message: 'You can only excuse yourself from your own sessions' }),
    );
    expect(prisma.session.update).not.toHaveBeenCalled();
  });

  test('returns 409 when the session has already been excused or volunteered for', async () => {
    prisma.user.findUnique.mockResolvedValue({ id: 1, tutor: { id: 7 } });
    prisma.session.findUnique.mockResolvedValue({
      id: 21,
      status: 'UNASSIGNED',
      assignment: { tutorId: 7 },
    });

    const req = mockReq({ params: { id: '21' }, body: { reason: 'Medical appointment' } });
    const res = mockRes();
    const next = jest.fn();

    await excuseSession(req, res, next);
    await flushMicrotasks();

    expect(next).toHaveBeenCalledWith(
      expect.objectContaining({ statusCode: 409 }),
    );
    expect(prisma.session.update).not.toHaveBeenCalled();
  });

  test('marks the session UNASSIGNED with the trimmed reason', async () => {
    prisma.user.findUnique.mockResolvedValue({ id: 1, tutor: { id: 7 } });
    prisma.session.findUnique.mockResolvedValue({
      id: 21,
      status: 'SCHEDULED',
      assignment: { tutorId: 7 },
    });
    prisma.session.update.mockResolvedValue({ id: 21, status: 'UNASSIGNED' });

    const req = mockReq({ params: { id: '21' }, body: { reason: '  Medical appointment  ' } });
    const res = mockRes();
    const next = jest.fn();

    await excuseSession(req, res, next);
    await flushMicrotasks();

    expect(prisma.session.update).toHaveBeenCalledWith({
      where: { id: 21 },
      data: { status: 'UNASSIGNED', excuseReason: 'Medical appointment' },
    });
    expect(res.json).toHaveBeenCalledWith({ id: 21, status: 'UNASSIGNED' });
    expect(next).not.toHaveBeenCalled();
  });
});
