// Mock the Prisma client before requiring the controller
jest.mock('../prisma/client', () => ({
  user: { findUnique: jest.fn() },
  tutorAssignment: { findMany: jest.fn(), findUnique: jest.fn(), findFirst: jest.fn() },
  course: { findMany: jest.fn() },
  courseSlot: { findUnique: jest.fn() },
  session: { findMany: jest.fn(), findUnique: jest.fn(), findFirst: jest.fn(), update: jest.fn(), create: jest.fn() },
  event: { findMany: jest.fn(), findFirst: jest.fn() },
  roleApplication: { findFirst: jest.fn() },
}));

const prisma = require('../prisma/client');
const {
  getMySessions,
  getLecturerSessions,
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

  test('scopes sessions to the tutor\'s own assignments, never another tutor\'s rows', async () => {
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
    prisma.event.findMany.mockResolvedValue([]);
    prisma.session.findMany.mockResolvedValue([]);

    const req = mockReq();
    const res = mockRes();
    const next = jest.fn();

    await getMySessions(req, res, next);
    await flushMicrotasks();

    // The session query must filter by the tutor's OWN assignment — a session
    // on another tutor's assignment is their copy of the occurrence and must
    // never leak onto this dashboard. The date window keeps the feed to the
    // current week onwards.
    expect(prisma.session.findMany.mock.calls[0][0].where).toEqual(
      expect.objectContaining({
        assignment: { userId: 1 },
      }),
    );

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

  test('returns only the tutor\'s own sessions — a foreign row returned by the database is dropped', async () => {
    prisma.user.findUnique.mockResolvedValue({ id: 1, role: 'TUTOR', firstName: 'Thabo', lastName: 'Demotutor' });
    prisma.roleApplication.findFirst.mockResolvedValue(null);
    prisma.tutorAssignment.findMany.mockResolvedValue([]);
    prisma.event.findMany.mockResolvedValue([]);
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

    // Session 22 sits on another tutor's assignment (a parallel tutorial
    // group): even though the mock returns it, the merge guard keeps it out
    // of the response entirely — only the tutor's own session 21 remains.
    expect(res.json).toHaveBeenCalledWith(
      expect.objectContaining({
        sessions: [expect.objectContaining({ id: 21, isMine: true, ledBy: 'Thabo Demotutor' })],
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

    prisma.event.findMany.mockResolvedValue([]);

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

    prisma.event.findMany.mockResolvedValue([]);

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

  test('derives upcoming sessions from the course events, one occurrence per matching weekday slot', async () => {
    prisma.user.findUnique.mockResolvedValue({ id: 1, role: 'TUTOR', firstName: 'Thabo', lastName: 'Demotutor' });
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

    // Anchor on next Monday so the test is date-independent.
    const nextMonday = new Date();
    nextMonday.setUTCHours(0, 0, 0, 0);
    nextMonday.setUTCDate(
      nextMonday.getUTCDate() + ((((1 - nextMonday.getUTCDay()) % 7) + 7) % 7 || 7),
    );
    const nextWednesday = new Date(nextMonday.getTime() + 2 * 24 * 60 * 60 * 1000);
    const nextSaturday = new Date(nextMonday.getTime() + 5 * 24 * 60 * 60 * 1000);
    const mondayISO = nextMonday.toISOString().slice(0, 10);

    const courseSlots = [
      {
        id: 31,
        dayOfWeek: 0,
        venue: 'Lab 2',
        sessionType: 'Tutorial',
        timeSlot: { id: 3, startMinute: 480, endMinute: 570 },
      },
      {
        id: 32,
        dayOfWeek: 2,
        venue: 'CB 24',
        sessionType: 'Lab',
        timeSlot: { id: 4, startMinute: 600, endMinute: 690 },
      },
    ];

    // The lecturer's events are the schedule: Monday and Wednesday generate
    // occurrences; Saturday is a weekend, so it cannot.
    const eventCourse = {
      id: 100,
      courseCode: 'COMS1015',
      courseName: 'Introduction to Programming',
      slots: courseSlots,
    };
    prisma.event.findMany.mockResolvedValue([
      { id: 41, date: nextMonday, description: 'tutoring', course: eventCourse },
      { id: 42, date: nextWednesday, description: 'tutoring', course: eventCourse },
      { id: 43, date: nextSaturday, description: 'tutoring', course: eventCourse },
    ]);

    // The tutor already excused themselves from Wednesday's occurrence — the
    // real UNASSIGNED row supersedes the virtual one for that slot.
    prisma.session.findMany.mockResolvedValue([
      {
        id: 24,
        date: nextWednesday,
        status: 'UNASSIGNED',
        excuseReason: 'Medical appointment',
        // Prisma rows carry the scalar FK alongside the included relation —
        // the dedup key is built from it.
        courseSlotId: 32,
        assignment: {
          userId: 1,
          courseId: 100,
          course: { courseCode: 'COMS1015', courseName: 'Introduction to Programming' },
          user: { firstName: 'Thabo', lastName: 'Demotutor' },
        },
        courseSlot: courseSlots[1],
      },
    ]);

    const currentWeekStart = new Date();
    currentWeekStart.setUTCHours(0, 0, 0, 0);
    currentWeekStart.setUTCDate(currentWeekStart.getUTCDate() - ((currentWeekStart.getUTCDay() + 6) % 7));

    const req = mockReq();
    const res = mockRes();
    const next = jest.fn();

    await getMySessions(req, res, next);
    await flushMicrotasks();

    // The events query scopes to the tutor's assigned courses from the start
    // of the current teaching week onwards.
    expect(prisma.event.findMany.mock.calls[0][0].where).toEqual({
      course: { assignments: { some: { userId: 1 } } },
      date: { gte: currentWeekStart },
    });

    const sessions = res.json.mock.calls[0][0].sessions;
    // Monday's occurrence is virtual (id e{courseSlotId}-{date}); Wednesday's
    // is the real excused row; Saturday generated nothing.
    expect(sessions).toHaveLength(2);
    expect(sessions[0]).toEqual(
      expect.objectContaining({
        id: `e31-${mondayISO}`,
        status: 'SCHEDULED',
        isMine: true,
        ledBy: 'Thabo Demotutor',
        course: { courseCode: 'COMS1015', courseName: 'Introduction to Programming' },
        courseSlot: expect.objectContaining({ id: 31, dayOfWeek: 0 }),
      }),
    );
    expect(sessions[1]).toEqual(
      expect.objectContaining({
        id: 24,
        status: 'UNASSIGNED',
        excuseReason: 'Medical appointment',
        isMine: true,
      }),
    );

    // The virtual Monday occurrence drives the course's allocated hours —
    // the event's slot is 08:00–09:30, so 1.5 hours.
    expect(res.json.mock.calls[0][0].courses[0]).toEqual(
      expect.objectContaining({ courseCode: 'COMS1015', allocatedHours: 1.5 }),
    );
    expect(next).not.toHaveBeenCalled();
  });

  test('never leaks another tutor\'s real session for the same event onto the dashboard', async () => {
    prisma.user.findUnique.mockResolvedValue({ id: 1, role: 'TUTOR', firstName: 'Thabo', lastName: 'Demotutor' });
    prisma.roleApplication.findFirst.mockResolvedValue(null);
    prisma.tutorAssignment.findMany.mockResolvedValue([]);

    const nextMonday = new Date();
    nextMonday.setUTCHours(0, 0, 0, 0);
    nextMonday.setUTCDate(
      nextMonday.getUTCDate() + ((((1 - nextMonday.getUTCDay()) % 7) + 7) % 7 || 7),
    );

    prisma.event.findMany.mockResolvedValue([
      {
        id: 41,
        date: nextMonday,
        description: 'tutoring',
        course: {
          id: 100,
          courseCode: 'COMS1015',
          courseName: 'Introduction to Programming',
          slots: [
            {
              id: 31,
              dayOfWeek: 0,
              venue: 'Lab 2',
              sessionType: 'Tutorial',
              timeSlot: { id: 3, startMinute: 480, endMinute: 570 },
            },
          ],
        },
      },
    ]);
    // A parallel tutorial group: another tutor's real session for the same
    // event occurrence, on their own assignment. It must neither appear in
    // the response nor supersede this tutor's virtual occurrence.
    prisma.session.findMany.mockResolvedValue([
      {
        id: 25,
        date: nextMonday,
        status: 'SCHEDULED',
        excuseReason: null,
        courseSlotId: 31,
        assignment: {
          userId: 9,
          courseId: 100,
          course: { courseCode: 'COMS1015', courseName: 'Introduction to Programming' },
        },
        courseSlot: {
          id: 31,
          dayOfWeek: 0,
          venue: 'Lab 2',
          sessionType: 'Tutorial',
          timeSlot: { id: 3, startMinute: 480, endMinute: 570 },
        },
      },
    ]);

    const req = mockReq();
    const res = mockRes();
    const next = jest.fn();

    await getMySessions(req, res, next);
    await flushMicrotasks();

    // Only the tutor's own virtual occurrence remains — the other tutor's
    // row is filtered out before it can reach (or supersede) the ledger.
    const sessions = res.json.mock.calls[0][0].sessions;
    expect(sessions).toHaveLength(1);
    expect(sessions[0]).toEqual(
      expect.objectContaining({
        id: `e31-${nextMonday.toISOString().slice(0, 10)}`,
        status: 'SCHEDULED',
        isMine: true,
        ledBy: 'Thabo Demotutor',
      }),
    );
    expect(sessions.find((s) => s.id === 25)).toBeUndefined();
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

  test('returns only the courses owned by the lecturer with slots, tutors, events and flattened sessions', async () => {
    prisma.user.findUnique.mockResolvedValue({ id: 1, role: 'LECTURER' });
    prisma.event.findMany.mockResolvedValue([]);
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
          events: [],
          sessions: [
            expect.objectContaining({ id: 21, assignmentId: 11, tutorName: 'Thabo Demotutor' }),
          ],
        }),
      ],
    });
    expect(next).not.toHaveBeenCalled();
  });

  test('groups the upcoming events per course with times derived from the weekday slots', async () => {
    prisma.user.findUnique.mockResolvedValue({ id: 1, role: 'LECTURER' });
    prisma.course.findMany.mockResolvedValue([
      {
        id: 100,
        courseCode: 'COMS1015',
        courseName: 'Introduction to Programming',
        slots: [
          {
            id: 31,
            dayOfWeek: 0,
            venue: 'Lab 2',
            sessionType: 'Tutorial',
            timeSlot: { startMinute: 480, endMinute: 570 },
          },
        ],
        assignments: [],
      },
    ]);

    // Anchored on next Monday / Wednesday so the test is date-independent.
    const nextMonday = new Date();
    nextMonday.setUTCHours(0, 0, 0, 0);
    nextMonday.setUTCDate(
      nextMonday.getUTCDate() + ((((1 - nextMonday.getUTCDay()) % 7) + 7) % 7 || 7),
    );
    const nextWednesday = new Date(nextMonday.getTime() + 2 * 24 * 60 * 60 * 1000);

    prisma.event.findMany.mockResolvedValue([
      // The Monday event derives the 08:00–09:30 slot; the course has no
      // Wednesday slots, so the Wednesday event derives no times.
      {
        id: 51,
        date: nextMonday,
        description: 'Intro tutoring',
        course: {
          id: 100,
          slots: [{ id: 31, dayOfWeek: 0, timeSlot: { startMinute: 480, endMinute: 570 } }],
        },
      },
      {
        id: 52,
        date: nextWednesday,
        description: 'Midweek catch-up',
        course: { id: 100, slots: [] },
      },
    ]);

    const req = mockReq();
    const res = mockRes();
    const next = jest.fn();

    await getLecturerSessions(req, res, next);
    await flushMicrotasks();

    // Events are fetched for the lecturer's own courses from today onwards.
    const todayStart = new Date();
    todayStart.setUTCHours(0, 0, 0, 0);
    expect(prisma.event.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { course: { userId: 1 }, date: { gte: todayStart } },
      }),
    );

    expect(res.json).toHaveBeenCalledWith({
      courses: [
        expect.objectContaining({
          id: 100,
          events: [
            expect.objectContaining({
              id: 51,
              description: 'Intro tutoring',
              times: [{ startMinute: 480, endMinute: 570 }],
            }),
            expect.objectContaining({ id: 52, times: [] }),
          ],
        }),
      ],
    });
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
    const nextMonday = new Date();
    nextMonday.setUTCHours(0, 0, 0, 0);
    nextMonday.setUTCDate(
      nextMonday.getUTCDate() + ((((1 - nextMonday.getUTCDay()) % 7) + 7) % 7 || 7),
    );

    prisma.user.findUnique.mockResolvedValue({ id: 1, role: 'TUTOR' });
    prisma.session.findUnique.mockResolvedValue({
      id: 21,
      date: nextMonday,
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

  test('materializes a virtual event occurrence as an UNASSIGNED session', async () => {
    const nextMonday = new Date();
    nextMonday.setUTCHours(0, 0, 0, 0);
    nextMonday.setUTCDate(
      nextMonday.getUTCDate() + ((((1 - nextMonday.getUTCDay()) % 7) + 7) % 7 || 7),
    );
    const mondayISO = nextMonday.toISOString().slice(0, 10);

    prisma.user.findUnique.mockResolvedValue({ id: 1, role: 'TUTOR' });
    prisma.courseSlot.findUnique.mockResolvedValue({
      id: 31,
      dayOfWeek: 0,
      course: { id: 100 },
    });
    prisma.event.findFirst.mockResolvedValue({ id: 41, courseId: 100, date: nextMonday });
    prisma.tutorAssignment.findFirst.mockResolvedValue({ id: 11, userId: 1, courseId: 100 });
    prisma.session.findFirst.mockResolvedValue(null);
    prisma.session.create.mockResolvedValue({ id: 24, status: 'UNASSIGNED' });

    const req = mockReq({ params: { id: `e31-${mondayISO}` }, body: { reason: '  Medical appointment  ' } });
    const res = mockRes();
    const next = jest.fn();

    await excuseSession(req, res, next);
    await flushMicrotasks();

    expect(prisma.session.create).toHaveBeenCalledWith({
      data: {
        assignmentId: 11,
        courseSlotId: 31,
        date: new Date(`${mondayISO}T00:00:00.000Z`),
        status: 'UNASSIGNED',
        excuseReason: 'Medical appointment',
      },
    });
    expect(res.json).toHaveBeenCalledWith({ id: 24, status: 'UNASSIGNED' });
    expect(next).not.toHaveBeenCalled();
  });

  test('returns 404 for a virtual id with no event on that date', async () => {
    const nextMonday = new Date();
    nextMonday.setUTCHours(0, 0, 0, 0);
    nextMonday.setUTCDate(
      nextMonday.getUTCDate() + ((((1 - nextMonday.getUTCDay()) % 7) + 7) % 7 || 7),
    );
    const mondayISO = nextMonday.toISOString().slice(0, 10);

    prisma.user.findUnique.mockResolvedValue({ id: 1, role: 'TUTOR' });
    prisma.courseSlot.findUnique.mockResolvedValue({
      id: 31,
      dayOfWeek: 0,
      course: { id: 100 },
    });
    prisma.event.findFirst.mockResolvedValue(null);

    const req = mockReq({ params: { id: `e31-${mondayISO}` }, body: { reason: 'Medical appointment' } });
    const res = mockRes();
    const next = jest.fn();

    await excuseSession(req, res, next);
    await flushMicrotasks();

    expect(next).toHaveBeenCalledWith(
      expect.objectContaining({ statusCode: 404, message: expect.stringContaining('Session not found') }),
    );
    expect(prisma.session.create).not.toHaveBeenCalled();
  });

  test('returns 409 when the virtual occurrence has already taken place', async () => {
    prisma.user.findUnique.mockResolvedValue({ id: 1, role: 'TUTOR' });

    const req = mockReq({ params: { id: 'e31-2020-01-06' }, body: { reason: 'Medical appointment' } });
    const res = mockRes();
    const next = jest.fn();

    await excuseSession(req, res, next);
    await flushMicrotasks();

    expect(next).toHaveBeenCalledWith(
      expect.objectContaining({ statusCode: 409, message: 'This session has already taken place' }),
    );
    expect(prisma.session.create).not.toHaveBeenCalled();
  });

  test('returns 409 when the virtual occurrence was already excused', async () => {
    const nextMonday = new Date();
    nextMonday.setUTCHours(0, 0, 0, 0);
    nextMonday.setUTCDate(
      nextMonday.getUTCDate() + ((((1 - nextMonday.getUTCDay()) % 7) + 7) % 7 || 7),
    );
    const mondayISO = nextMonday.toISOString().slice(0, 10);

    prisma.user.findUnique.mockResolvedValue({ id: 1, role: 'TUTOR' });
    prisma.courseSlot.findUnique.mockResolvedValue({
      id: 31,
      dayOfWeek: 0,
      course: { id: 100 },
    });
    prisma.event.findFirst.mockResolvedValue({ id: 41, courseId: 100, date: nextMonday });
    prisma.tutorAssignment.findFirst.mockResolvedValue({ id: 11, userId: 1, courseId: 100 });
    prisma.session.findFirst.mockResolvedValue({ id: 24, status: 'UNASSIGNED' });

    const req = mockReq({ params: { id: `e31-${mondayISO}` }, body: { reason: 'Medical appointment' } });
    const res = mockRes();
    const next = jest.fn();

    await excuseSession(req, res, next);
    await flushMicrotasks();

    expect(next).toHaveBeenCalledWith(
      expect.objectContaining({
        statusCode: 409,
        message: 'This session has already been excused or has a pending volunteer',
      }),
    );
    expect(prisma.session.create).not.toHaveBeenCalled();
  });
});
