// Mock the Prisma client before requiring the controller
jest.mock('../prisma/client', () => ({
  user: { findUnique: jest.fn() },
  tutorAssignment: { findMany: jest.fn(), findUnique: jest.fn(), findFirst: jest.fn(), create: jest.fn() },
  course: { findMany: jest.fn() },
  courseSlot: { findUnique: jest.fn() },
  session: { findMany: jest.fn(), findUnique: jest.fn(), findFirst: jest.fn(), update: jest.fn(), create: jest.fn() },
  roleApplication: { findFirst: jest.fn() },
  application: { findMany: jest.fn(), findFirst: jest.fn() },
  sessionVolunteer: { findUnique: jest.fn(), create: jest.fn(), update: jest.fn() },
  $transaction: jest.fn(),
}));

const prisma = require('../prisma/client');
const {
  getMySessions,
  getLecturerSessions,
  scheduleSession,
  excuseSession,
  getUnassignedSessions,
  volunteerForSession,
  decideVolunteerRequest,
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
  // Run transactional callbacks against the same mock object so the tx.*
  // calls inside the interactive transactions remain observable.
  prisma.$transaction.mockImplementation((callback) => callback(prisma));
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
    prisma.user.findUnique.mockResolvedValue({ id: 1, role: 'STUDENT' });

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
    prisma.user.findUnique.mockResolvedValue({ id: 1, role: 'TUTOR' });
    prisma.roleApplication.findFirst.mockResolvedValue(null);
    prisma.tutorAssignment.findMany.mockResolvedValue([
      {
        id: 11,
        semester: '2026-S2',
        course: {
          id: 100,
          courseCode: 'COMS1015',
          courseName: 'Introduction to Programming',
          user: { firstName: 'Sarah', lastName: 'Van Wyk' },
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
        course: { assignments: { some: { userId: 1 } } },
      },
    });

    // The tutor's own assignments drive the courses list.
    expect(prisma.tutorAssignment.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { userId: 1 },
      }),
    );

    expect(res.json).toHaveBeenCalledWith(
      expect.objectContaining({
        maxHoursPerWeek: null,
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
    prisma.user.findUnique.mockResolvedValue({ id: 1, role: 'TUTOR' });
    prisma.roleApplication.findFirst.mockResolvedValue(null);
    prisma.tutorAssignment.findMany.mockResolvedValue([]);
    prisma.session.findMany.mockResolvedValue([
      {
        id: 21,
        date: new Date('2026-09-21T00:00:00.000Z'),
        status: 'SCHEDULED',
        excuseReason: null,
        assignment: {
          userId: 1,
          courseId: 100,
          course: { courseCode: 'COMS1015', courseName: 'Introduction to Programming' },
          user: { firstName: 'Thabo', lastName: 'Demotutor' },
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
          userId: 9,
          courseId: 100,
          course: { courseCode: 'COMS1015', courseName: 'Introduction to Programming' },
          user: { firstName: 'Alex', lastName: 'Mercer' },
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

  test('derives allocatedHours from the tutor\'s still-scheduled sessions and the cap from the approved application', async () => {
    prisma.user.findUnique.mockResolvedValue({ id: 1, role: 'TUTOR' });
    prisma.roleApplication.findFirst.mockResolvedValue({ maxHoursPerWeek: 10 });
    prisma.tutorAssignment.findMany.mockResolvedValue([
      {
        id: 11,
        semester: '2026-S2',
        course: {
          id: 100,
          courseCode: 'COMS1015',
          courseName: 'Introduction to Programming',
          user: { firstName: 'Sarah', lastName: 'Van Wyk' },
        },
      },
    ]);

    // Anchor the teaching week on next Monday — the same weekday logic the
    // seed uses — so the test is date-independent.
    const nextMonday = new Date();
    nextMonday.setUTCHours(0, 0, 0, 0);
    nextMonday.setUTCDate(
      nextMonday.getUTCDate() + ((((1 - nextMonday.getUTCDay()) % 7) + 7) % 7 || 7),
    );
    const nextWednesday = new Date(nextMonday.getTime() + 2 * 24 * 60 * 60 * 1000);

    const baseSession = {
      date: nextMonday,
      status: 'SCHEDULED',
      excuseReason: null,
      assignment: {
        userId: 1,
        courseId: 100,
        course: { courseCode: 'COMS1015', courseName: 'Introduction to Programming' },
        user: { firstName: 'Thabo', lastName: 'Demotutor' },
      },
      courseSlot: {
        id: 31,
        dayOfWeek: 0,
        venue: 'Lab 2',
        sessionType: 'Tutorial',
        timeSlot: { id: 3, startMinute: 480, endMinute: 570 },
      },
    };
    prisma.session.findMany.mockResolvedValue([
      { ...baseSession, id: 21 },
      // Excused by the tutor — excluded from the allocated hours.
      { ...baseSession, id: 22, date: nextWednesday, status: 'UNASSIGNED', excuseReason: 'Medical appointment' },
      // Another tutor's session on the same course — never this tutor's hours.
      {
        ...baseSession,
        id: 23,
        assignment: { ...baseSession.assignment, userId: 9 },
      },
    ]);

    const req = mockReq();
    const res = mockRes();
    const next = jest.fn();

    await getMySessions(req, res, next);
    await flushMicrotasks();

    expect(prisma.roleApplication.findFirst).toHaveBeenCalledWith(
      expect.objectContaining({ where: { userId: 1, requestedRole: 'TUTOR', status: 'APPROVED' } }),
    );

    // Only the Monday 08:00–09:30 session counts: 1.5 hours, not the 1.5h
    // excused session nor the other tutor's session.
    expect(res.json).toHaveBeenCalledWith(
      expect.objectContaining({
        maxHoursPerWeek: 10,
        courses: [expect.objectContaining({ courseCode: 'COMS1015', allocatedHours: 1.5 })],
      }),
    );
    expect(next).not.toHaveBeenCalled();
  });

  test('reports weekScheduledHours for the current Monday-to-Sunday week, separate from the teaching week', async () => {
    prisma.user.findUnique.mockResolvedValue({ id: 1, role: 'TUTOR' });
    prisma.roleApplication.findFirst.mockResolvedValue({ maxHoursPerWeek: 10 });
    prisma.tutorAssignment.findMany.mockResolvedValue([
      {
        id: 11,
        semester: '2026-S2',
        course: {
          id: 100,
          courseCode: 'COMS1015',
          courseName: 'Introduction to Programming',
          user: { firstName: 'Sarah', lastName: 'Van Wyk' },
        },
      },
    ]);

    // Anchor on the current Monday-to-Sunday week so the test is
    // date-independent whichever day it runs.
    const thisMonday = new Date();
    thisMonday.setUTCHours(0, 0, 0, 0);
    thisMonday.setUTCDate(thisMonday.getUTCDate() - ((thisMonday.getUTCDay() + 6) % 7));
    const dayAt = (offset) => new Date(thisMonday.getTime() + offset * 24 * 60 * 60 * 1000);

    const baseSession = {
      status: 'SCHEDULED',
      excuseReason: null,
      assignment: {
        userId: 1,
        courseId: 100,
        course: { courseCode: 'COMS1015', courseName: 'Introduction to Programming' },
        user: { firstName: 'Thabo', lastName: 'Demotutor' },
      },
      courseSlot: {
        id: 31,
        dayOfWeek: 0,
        venue: 'Lab 2',
        sessionType: 'Tutorial',
        timeSlot: { id: 3, startMinute: 480, endMinute: 570 },
      },
    };

    prisma.session.findMany.mockResolvedValue([
      // Earlier this week — the day may already have passed, but its hours
      // still count against this week's cap.
      { ...baseSession, id: 21, date: dayAt(0) },
      // Excused this week — excluded from the card.
      { ...baseSession, id: 22, date: dayAt(2), status: 'UNASSIGNED', excuseReason: 'Medical appointment' },
      // Another tutor's session this week — never this tutor's hours.
      { ...baseSession, id: 23, date: dayAt(3), assignment: { ...baseSession.assignment, userId: 9 } },
      // Later this week — counts.
      { ...baseSession, id: 24, date: dayAt(4) },
      // Next week — feeds the teaching-week allocatedHours, not this card.
      { ...baseSession, id: 25, date: dayAt(8) },
    ]);

    const req = mockReq();
    const res = mockRes();
    const next = jest.fn();

    await getMySessions(req, res, next);
    await flushMicrotasks();

    // Monday's and Friday's 08:00–09:30 sessions are 3h in the current week;
    // next Tuesday's 1.5h, the excused session and the other tutor's session
    // never reach the card.
    expect(res.json).toHaveBeenCalledWith(
      expect.objectContaining({
        maxHoursPerWeek: 10,
        weekScheduledHours: 3,
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
    prisma.user.findUnique.mockResolvedValue({ id: 1, role: 'STUDENT' });

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
    prisma.user.findUnique.mockResolvedValue({ id: 1, role: 'LECTURER' });
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
            userId: 7,
            user: { firstName: 'Thabo', lastName: 'Demotutor' },
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
      expect.objectContaining({ where: { userId: 1 } }),
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
    return { id: 2, role: 'LECTURER' };
  }

  function validBody() {
    return { assignmentId: 11, courseSlotId: 31, date: '2026-09-21' };
  }

  function ownAssignment() {
    return {
      id: 11,
      userId: 7,
      courseId: 100,
      course: { id: 100, courseCode: 'COMS1015', courseName: 'Introduction to Programming', userId: 2 },
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
    prisma.user.findUnique.mockResolvedValue({ id: 1, role: 'STUDENT' });

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
    foreignAssignment.course = { ...foreignAssignment.course, userId: 999 };
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
        user: { firstName: 'Thabo', lastName: 'Demotutor' },
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
    prisma.user.findUnique.mockResolvedValue({ id: 1, role: 'TUTOR' });
    prisma.session.findUnique.mockResolvedValue({
      id: 21,
      status: 'SCHEDULED',
      assignment: { userId: 9 },
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
    prisma.user.findUnique.mockResolvedValue({ id: 1, role: 'TUTOR' });
    prisma.session.findUnique.mockResolvedValue({
      id: 21,
      status: 'UNASSIGNED',
      assignment: { userId: 1 },
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
    prisma.user.findUnique.mockResolvedValue({ id: 1, role: 'TUTOR' });
    prisma.session.findUnique.mockResolvedValue({
      id: 21,
      status: 'SCHEDULED',
      assignment: { userId: 1 },
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

// ════════════════════════════════════════════════════════════════════════
// getUnassignedSessions — excused sessions a qualifying tutor can cover
// ════════════════════════════════════════════════════════════════════════
describe('getUnassignedSessions', () => {
  test('returns 404 when the requesting user does not exist', async () => {
    prisma.user.findUnique.mockResolvedValue(null);

    const req = mockReq();
    const res = mockRes();
    const next = jest.fn();

    await getUnassignedSessions(req, res, next);
    await flushMicrotasks();

    expect(next).toHaveBeenCalledWith(expect.objectContaining({ statusCode: 404 }));
    expect(prisma.session.findMany).not.toHaveBeenCalled();
  });

  test('returns 403 when the requesting user is not a tutor', async () => {
    prisma.user.findUnique.mockResolvedValue({ id: 1, role: 'STUDENT' });

    const req = mockReq();
    const res = mockRes();
    const next = jest.fn();

    await getUnassignedSessions(req, res, next);
    await flushMicrotasks();

    expect(next).toHaveBeenCalledWith(
      expect.objectContaining({ statusCode: 403, message: 'Only tutors can volunteer for excused sessions' }),
    );
    expect(prisma.session.findMany).not.toHaveBeenCalled();
  });

  test('returns an empty list when no application mark meets its course minimum', async () => {
    prisma.user.findUnique.mockResolvedValue({ id: 1, role: 'TUTOR' });
    prisma.application.findMany.mockResolvedValue([
      { courseId: 100, courseMark: 58, course: { id: 100, minimumMark: 65 } },
    ]);

    const req = mockReq();
    const res = mockRes();
    const next = jest.fn();

    await getUnassignedSessions(req, res, next);
    await flushMicrotasks();

    expect(res.json).toHaveBeenCalledWith([]);
    expect(prisma.session.findMany).not.toHaveBeenCalled();
    expect(next).not.toHaveBeenCalled();
  });

  test('returns only UNASSIGNED sessions for qualifying courses, excluding the tutor\'s own, with myCourseMark', async () => {
    prisma.user.findUnique.mockResolvedValue({ id: 1, role: 'TUTOR' });
    prisma.application.findMany.mockResolvedValue([
      // Qualifies — mark 88 ≥ minimum 65.
      { courseId: 100, courseMark: 88, course: { id: 100, minimumMark: 65 } },
      // Does not qualify — mark 58 < minimum 60.
      { courseId: 200, courseMark: 58, course: { id: 200, minimumMark: 60 } },
    ]);
    prisma.session.findMany.mockResolvedValue([
      {
        id: 22,
        date: new Date('2026-09-22T00:00:00.000Z'),
        status: 'UNASSIGNED',
        excuseReason: 'Medical appointment',
        assignment: {
          userId: 9,
          courseId: 100,
          course: { courseCode: 'COMS1015', courseName: 'Introduction to Programming', minimumMark: 65 },
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

    await getUnassignedSessions(req, res, next);
    await flushMicrotasks();

    // Only the qualifying course is queried, and the tutor's own excused
    // session is excluded — someone else has to cover it.
    expect(prisma.session.findMany.mock.calls[0][0].where).toEqual({
      status: 'UNASSIGNED',
      courseSlot: { courseId: { in: [100] } },
      assignment: { userId: { not: 1 } },
    });

    expect(res.json).toHaveBeenCalledWith([
      expect.objectContaining({ id: 22, myCourseMark: 88 }),
    ]);
    expect(next).not.toHaveBeenCalled();
  });
});

// ════════════════════════════════════════════════════════════════════════
// volunteerForSession — a qualifying tutor requests cover
// ════════════════════════════════════════════════════════════════════════
describe('volunteerForSession', () => {
  function unassignedSession(overrides = {}) {
    return {
      id: 21,
      status: 'UNASSIGNED',
      assignment: { userId: 9 },
      courseSlot: { course: { id: 100, minimumMark: 65 } },
      ...overrides,
    };
  }

  test('returns 400 when the session id is invalid', async () => {
    const req = mockReq({ params: { id: 'abc' } });
    const res = mockRes();
    const next = jest.fn();

    await volunteerForSession(req, res, next);
    await flushMicrotasks();

    expect(next).toHaveBeenCalledWith(
      expect.objectContaining({ statusCode: 400, message: 'Invalid session id' }),
    );
    expect(prisma.user.findUnique).not.toHaveBeenCalled();
  });

  test('returns 403 when the requesting user is not a tutor', async () => {
    prisma.user.findUnique.mockResolvedValue({ id: 1, role: 'STUDENT' });

    const req = mockReq({ params: { id: '21' } });
    const res = mockRes();
    const next = jest.fn();

    await volunteerForSession(req, res, next);
    await flushMicrotasks();

    expect(next).toHaveBeenCalledWith(
      expect.objectContaining({ statusCode: 403, message: 'Only tutors can volunteer for excused sessions' }),
    );
    expect(prisma.sessionVolunteer.create).not.toHaveBeenCalled();
  });

  test('returns 409 when the session is not open for volunteering', async () => {
    prisma.user.findUnique.mockResolvedValue({ id: 1, role: 'TUTOR' });
    prisma.session.findUnique.mockResolvedValue(unassignedSession({ status: 'SCHEDULED' }));

    const req = mockReq({ params: { id: '21' } });
    const res = mockRes();
    const next = jest.fn();

    await volunteerForSession(req, res, next);
    await flushMicrotasks();

    expect(next).toHaveBeenCalledWith(
      expect.objectContaining({ statusCode: 409, message: expect.stringContaining('no longer available') }),
    );
    expect(prisma.sessionVolunteer.create).not.toHaveBeenCalled();
  });

  test('returns 403 when the tutor tries to cover a session they excused themselves', async () => {
    prisma.user.findUnique.mockResolvedValue({ id: 1, role: 'TUTOR' });
    prisma.session.findUnique.mockResolvedValue(unassignedSession({ assignment: { userId: 1 } }));

    const req = mockReq({ params: { id: '21' } });
    const res = mockRes();
    const next = jest.fn();

    await volunteerForSession(req, res, next);
    await flushMicrotasks();

    expect(next).toHaveBeenCalledWith(
      expect.objectContaining({ statusCode: 403, message: expect.stringContaining('You excused this session') }),
    );
    expect(prisma.application.findFirst).not.toHaveBeenCalled();
  });

  test('returns 403 when the tutor\'s course mark is below the minimum', async () => {
    prisma.user.findUnique.mockResolvedValue({ id: 1, role: 'TUTOR' });
    prisma.session.findUnique.mockResolvedValue(unassignedSession());
    prisma.application.findFirst.mockResolvedValue({ courseMark: 58, status: 'APPROVED' });

    const req = mockReq({ params: { id: '21' } });
    const res = mockRes();
    const next = jest.fn();

    await volunteerForSession(req, res, next);
    await flushMicrotasks();

    expect(next).toHaveBeenCalledWith(
      expect.objectContaining({ statusCode: 403, message: expect.stringContaining('does not meet the minimum') }),
    );
    expect(prisma.sessionVolunteer.create).not.toHaveBeenCalled();
    expect(prisma.session.update).not.toHaveBeenCalled();
  });

  test('returns 409 when another tutor already has a live request', async () => {
    prisma.user.findUnique.mockResolvedValue({ id: 1, role: 'TUTOR' });
    prisma.session.findUnique.mockResolvedValue(unassignedSession());
    prisma.application.findFirst.mockResolvedValue({ courseMark: 88, status: 'APPROVED' });
    prisma.sessionVolunteer.findUnique.mockResolvedValue({ id: 5, sessionId: 21, userId: 7, status: 'PENDING' });

    const req = mockReq({ params: { id: '21' } });
    const res = mockRes();
    const next = jest.fn();

    await volunteerForSession(req, res, next);
    await flushMicrotasks();

    expect(next).toHaveBeenCalledWith(
      expect.objectContaining({ statusCode: 409, message: 'Another tutor has already volunteered for this session' }),
    );
    expect(prisma.sessionVolunteer.create).not.toHaveBeenCalled();
    expect(prisma.session.update).not.toHaveBeenCalled();
  });

  test('creates a PENDING request and flips the session to PENDING', async () => {
    prisma.user.findUnique.mockResolvedValue({ id: 1, role: 'TUTOR' });
    prisma.session.findUnique.mockResolvedValue(unassignedSession());
    prisma.application.findFirst.mockResolvedValue({ courseMark: 88, status: 'APPROVED' });
    prisma.sessionVolunteer.findUnique.mockResolvedValue(null);
    const record = { id: 5, sessionId: 21, userId: 1, status: 'PENDING' };
    prisma.sessionVolunteer.create.mockResolvedValue(record);

    const req = mockReq({ params: { id: '21' } });
    const res = mockRes();
    const next = jest.fn();

    await volunteerForSession(req, res, next);
    await flushMicrotasks();

    expect(prisma.sessionVolunteer.create).toHaveBeenCalledWith({
      data: { sessionId: 21, userId: 1, status: 'PENDING' },
    });
    expect(prisma.session.update).toHaveBeenCalledWith({
      where: { id: 21 },
      data: { status: 'PENDING' },
    });
    expect(res.status).toHaveBeenCalledWith(201);
    expect(res.json).toHaveBeenCalledWith(record);
    expect(next).not.toHaveBeenCalled();
  });

  test('replaces a rejected request so the session can be covered after all', async () => {
    prisma.user.findUnique.mockResolvedValue({ id: 1, role: 'TUTOR' });
    prisma.session.findUnique.mockResolvedValue(unassignedSession());
    prisma.application.findFirst.mockResolvedValue({ courseMark: 88, status: 'APPROVED' });
    prisma.sessionVolunteer.findUnique.mockResolvedValue({ id: 5, sessionId: 21, userId: 7, status: 'REJECTED' });
    prisma.sessionVolunteer.update.mockResolvedValue({ id: 5, sessionId: 21, userId: 1, status: 'PENDING' });

    const req = mockReq({ params: { id: '21' } });
    const res = mockRes();
    const next = jest.fn();

    await volunteerForSession(req, res, next);
    await flushMicrotasks();

    expect(prisma.sessionVolunteer.update).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { sessionId: 21 },
        data: expect.objectContaining({ userId: 1, status: 'PENDING' }),
      }),
    );
    expect(prisma.sessionVolunteer.create).not.toHaveBeenCalled();
    expect(prisma.session.update).toHaveBeenCalledWith({
      where: { id: 21 },
      data: { status: 'PENDING' },
    });
    expect(res.status).toHaveBeenCalledWith(201);
    expect(next).not.toHaveBeenCalled();
  });
});

// ════════════════════════════════════════════════════════════════════════
// decideVolunteerRequest — the lecturer approves or rejects the cover request
// ════════════════════════════════════════════════════════════════════════
describe('decideVolunteerRequest', () => {
  function pendingSession(overrides = {}) {
    return {
      id: 21,
      status: 'PENDING',
      assignment: { semester: '2026-S2' },
      courseSlot: { course: { id: 100, userId: 2 } },
      volunteerRequest: { id: 5, sessionId: 21, userId: 1, status: 'PENDING' },
      ...overrides,
    };
  }

  test('returns 400 when the session id is invalid', async () => {
    const req = mockReq({ params: { id: 'abc' }, body: { decision: 'APPROVED' } });
    const res = mockRes();
    const next = jest.fn();

    await decideVolunteerRequest(req, res, next);
    await flushMicrotasks();

    expect(next).toHaveBeenCalledWith(
      expect.objectContaining({ statusCode: 400, message: 'Invalid session id' }),
    );
  });

  test('returns 400 when the decision is not APPROVED or REJECTED', async () => {
    const req = mockReq({ params: { id: '21' }, body: { decision: 'MAYBE' } });
    const res = mockRes();
    const next = jest.fn();

    await decideVolunteerRequest(req, res, next);
    await flushMicrotasks();

    expect(next).toHaveBeenCalledWith(
      expect.objectContaining({ statusCode: 400, message: 'decision must be APPROVED or REJECTED' }),
    );
    expect(prisma.user.findUnique).not.toHaveBeenCalled();
  });

  test('returns 403 when the requesting user is not a lecturer', async () => {
    prisma.user.findUnique.mockResolvedValue({ id: 1, role: 'TUTOR' });

    const req = mockReq({ params: { id: '21' }, body: { decision: 'APPROVED' } });
    const res = mockRes();
    const next = jest.fn();

    await decideVolunteerRequest(req, res, next);
    await flushMicrotasks();

    expect(next).toHaveBeenCalledWith(
      expect.objectContaining({ statusCode: 403, message: 'Only lecturers can decide on volunteer requests' }),
    );
    expect(prisma.session.update).not.toHaveBeenCalled();
  });

  test('returns 403 when the session belongs to another lecturer\'s course', async () => {
    prisma.user.findUnique.mockResolvedValue({ id: 2, role: 'LECTURER' });
    prisma.session.findUnique.mockResolvedValue(
      pendingSession({ courseSlot: { course: { id: 100, userId: 999 } } }),
    );

    const req = mockReq({ params: { id: '21' }, body: { decision: 'APPROVED' } });
    const res = mockRes();
    const next = jest.fn();

    await decideVolunteerRequest(req, res, next);
    await flushMicrotasks();

    expect(next).toHaveBeenCalledWith(
      expect.objectContaining({ statusCode: 403, message: 'You can only decide on requests for your own courses' }),
    );
    expect(prisma.session.update).not.toHaveBeenCalled();
  });

  test('returns 409 when no request is awaiting a decision', async () => {
    prisma.user.findUnique.mockResolvedValue({ id: 2, role: 'LECTURER' });
    prisma.session.findUnique.mockResolvedValue(
      pendingSession({ status: 'UNASSIGNED', volunteerRequest: null }),
    );

    const req = mockReq({ params: { id: '21' }, body: { decision: 'APPROVED' } });
    const res = mockRes();
    const next = jest.fn();

    await decideVolunteerRequest(req, res, next);
    await flushMicrotasks();

    expect(next).toHaveBeenCalledWith(expect.objectContaining({ statusCode: 409 }));
    expect(prisma.session.update).not.toHaveBeenCalled();
  });

  test('approval re-points the session at the volunteer\'s existing assignment', async () => {
    prisma.user.findUnique.mockResolvedValue({ id: 2, role: 'LECTURER' });
    prisma.session.findUnique.mockResolvedValue(pendingSession());
    prisma.tutorAssignment.findFirst.mockResolvedValue({ id: 55, userId: 1, courseId: 100 });
    const updatedSession = { id: 21, assignmentId: 55, status: 'SCHEDULED' };
    prisma.session.update.mockResolvedValue(updatedSession);

    const req = mockReq({ params: { id: '21' }, body: { decision: 'APPROVED' } });
    const res = mockRes();
    const next = jest.fn();

    await decideVolunteerRequest(req, res, next);
    await flushMicrotasks();

    expect(prisma.tutorAssignment.findFirst).toHaveBeenCalledWith({
      where: { userId: 1, courseId: 100 },
    });
    expect(prisma.tutorAssignment.create).not.toHaveBeenCalled();
    expect(prisma.sessionVolunteer.update).toHaveBeenCalledWith({
      where: { sessionId: 21 },
      data: { status: 'APPROVED' },
    });
    expect(prisma.session.update).toHaveBeenCalledWith({
      where: { id: 21 },
      data: { assignmentId: 55, status: 'SCHEDULED' },
    });
    expect(res.json).toHaveBeenCalledWith({
      decision: 'APPROVED',
      session: updatedSession,
      assignmentId: 55,
    });
    expect(next).not.toHaveBeenCalled();
  });

  test('approval creates a tutor assignment for the volunteer when they have none', async () => {
    prisma.user.findUnique.mockResolvedValue({ id: 2, role: 'LECTURER' });
    prisma.session.findUnique.mockResolvedValue(pendingSession());
    prisma.tutorAssignment.findFirst.mockResolvedValue(null);
    prisma.tutorAssignment.create.mockResolvedValue({ id: 56, userId: 1, courseId: 100, semester: '2026-S2' });
    prisma.session.update.mockResolvedValue({ id: 21, assignmentId: 56, status: 'SCHEDULED' });

    const req = mockReq({ params: { id: '21' }, body: { decision: 'APPROVED' } });
    const res = mockRes();
    const next = jest.fn();

    await decideVolunteerRequest(req, res, next);
    await flushMicrotasks();

    expect(prisma.tutorAssignment.create).toHaveBeenCalledWith({
      data: { userId: 1, courseId: 100, semester: '2026-S2' },
    });
    expect(prisma.session.update).toHaveBeenCalledWith({
      where: { id: 21 },
      data: { assignmentId: 56, status: 'SCHEDULED' },
    });
    expect(res.json).toHaveBeenCalledWith(
      expect.objectContaining({ decision: 'APPROVED', assignmentId: 56 }),
    );
    expect(next).not.toHaveBeenCalled();
  });

  test('rejection marks the request REJECTED and reopens the session', async () => {
    prisma.user.findUnique.mockResolvedValue({ id: 2, role: 'LECTURER' });
    prisma.session.findUnique.mockResolvedValue(pendingSession());
    const updatedSession = { id: 21, status: 'UNASSIGNED' };
    prisma.session.update.mockResolvedValue(updatedSession);

    const req = mockReq({ params: { id: '21' }, body: { decision: 'REJECTED' } });
    const res = mockRes();
    const next = jest.fn();

    await decideVolunteerRequest(req, res, next);
    await flushMicrotasks();

    expect(prisma.sessionVolunteer.update).toHaveBeenCalledWith({
      where: { sessionId: 21 },
      data: { status: 'REJECTED' },
    });
    expect(prisma.session.update).toHaveBeenCalledWith({
      where: { id: 21 },
      data: { status: 'UNASSIGNED' },
    });
    expect(res.json).toHaveBeenCalledWith({ decision: 'REJECTED', session: updatedSession });
    expect(next).not.toHaveBeenCalled();
  });
});
