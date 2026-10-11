// Mock the Prisma client before requiring the controller
jest.mock('../prisma/client', () => ({
  user: { findUnique: jest.fn() },
  tutorAssignment: { findMany: jest.fn(), findUnique: jest.fn(), findFirst: jest.fn(), create: jest.fn() },
  course: { findMany: jest.fn() },
  courseSlot: { findUnique: jest.fn() },
  session: { findMany: jest.fn(), findUnique: jest.fn(), findFirst: jest.fn(), update: jest.fn(), create: jest.fn() },
  event: { findMany: jest.fn(), findFirst: jest.fn() },
  roleApplication: { findFirst: jest.fn() },
  application: { findMany: jest.fn(), findFirst: jest.fn() },
  sessionVolunteer: { findUnique: jest.fn(), findMany: jest.fn(), create: jest.fn(), update: jest.fn() },
  availability: { findMany: jest.fn() },
  busyBlock: { findMany: jest.fn() },
  $transaction: jest.fn(),
}));

const prisma = require('../prisma/client');
const {
  getMySessions,
  getLecturerSessions,
  excuseSession,
  getUnassignedSessions,
  getMyVolunteeredSessions,
  volunteerForSession,
  decideVolunteerRequest,
  getCoverCandidates,
  createCoverOffer,
  respondToCoverOffer,
  cancelCoverOffer,
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

  test('orders same-day sessions by start time then id, treating a missing time slot as zero', async () => {
    prisma.user.findUnique.mockResolvedValue({ id: 1, role: 'TUTOR', firstName: 'Thabo', lastName: 'Demotutor' });
    prisma.roleApplication.findFirst.mockResolvedValue(null);
    prisma.tutorAssignment.findMany.mockResolvedValue([]);
    prisma.event.findMany.mockResolvedValue([]);

    // This week's Monday — always inside the "This week" card's window, so
    // the test stays date-independent.
    const thisWeekMonday = new Date();
    thisWeekMonday.setUTCHours(0, 0, 0, 0);
    thisWeekMonday.setUTCDate(
      thisWeekMonday.getUTCDate() - ((thisWeekMonday.getUTCDay() + 6) % 7),
    );

    const baseAssignment = {
      userId: 1,
      courseId: 100,
      course: { courseCode: 'COMS1015', courseName: 'Introduction to Programming' },
      user: { firstName: 'Thabo', lastName: 'Demotutor' },
    };
    const session = (id, timeSlot) => ({
      id,
      date: thisWeekMonday,
      status: 'SCHEDULED',
      excuseReason: null,
      assignment: baseAssignment,
      courseSlot: { id: 31, dayOfWeek: 0, venue: null, sessionType: null, timeSlot },
    });

    // 21 has a real 08:00–09:30 slot; 22 and 23 carry no time slot (start 0);
    // 20 shares 21's 08:00 start but ends before it begins, so it must
    // contribute zero hours instead of a negative figure.
    prisma.session.findMany.mockResolvedValue([
      session(21, { startMinute: 480, endMinute: 570 }),
      session(22, null),
      session(23, null),
      session(20, { startMinute: 480, endMinute: 300 }),
    ]);

    const req = mockReq();
    const res = mockRes();
    const next = jest.fn();

    await getMySessions(req, res, next);
    await flushMicrotasks();

    // The two slot-less rows lead (start 0, id order 22 then 23), followed
    // by the two 08:00 rows in id order (20 then 21).
    const payload = res.json.mock.calls[0][0];
    expect(payload.sessions.map((row) => row.id)).toEqual([22, 23, 20, 21]);
    // Only the 1.5-hour 08:00–09:30 slot counts — the missing slots and the
    // inverted slot contribute zero.
    expect(payload.weekScheduledHours).toBe(1.5);
    expect(next).not.toHaveBeenCalled();
  });

  test('reports a null lecturer name when the course has no lecturer record', async () => {
    prisma.user.findUnique.mockResolvedValue({ id: 1, role: 'TUTOR', firstName: 'Thabo', lastName: 'Demotutor' });
    prisma.roleApplication.findFirst.mockResolvedValue(null);
    prisma.tutorAssignment.findMany.mockResolvedValue([
      {
        id: 11,
        semester: '2026-S2',
        course: { id: 100, courseCode: 'COMS1015', courseName: 'Introduction to Programming', user: null },
      },
    ]);
    prisma.event.findMany.mockResolvedValue([]);
    prisma.session.findMany.mockResolvedValue([]);

    const req = mockReq();
    const res = mockRes();
    const next = jest.fn();

    await getMySessions(req, res, next);
    await flushMicrotasks();

    expect(res.json).toHaveBeenCalledWith(
      expect.objectContaining({
        courses: [expect.objectContaining({ courseCode: 'COMS1015', lecturerName: null })],
      }),
    );
    expect(next).not.toHaveBeenCalled();
  });

  test('exposes the directed cover offer on the excuser\'s own session rows', async () => {
    prisma.user.findUnique.mockResolvedValue({ id: 1, role: 'TUTOR', firstName: 'Thabo', lastName: 'Demotutor' });
    prisma.roleApplication.findFirst.mockResolvedValue(null);
    prisma.tutorAssignment.findMany.mockResolvedValue([]);
    prisma.event.findMany.mockResolvedValue([]);

    const nextMonday = new Date();
    nextMonday.setUTCHours(0, 0, 0, 0);
    nextMonday.setUTCDate(
      nextMonday.getUTCDate() + ((((1 - nextMonday.getUTCDay()) % 7) + 7) % 7 || 7),
    );

    prisma.session.findMany.mockResolvedValue([
      {
        id: 21,
        date: nextMonday,
        status: 'OFFERED',
        excuseReason: 'Medical appointment',
        courseSlotId: 31,
        assignment: {
          userId: 1,
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
        volunteerRequest: {
          status: 'OFFERED',
          userId: 7,
          user: { firstName: 'Nina', lastName: 'Nominee' },
        },
      },
    ]);

    const req = mockReq();
    const res = mockRes();
    const next = jest.fn();

    await getMySessions(req, res, next);
    await flushMicrotasks();

    // The excuser's ledger shows who they pointed the cover at and where the
    // offer stands — the directed-cover counterpart of the volunteer state.
    const sessions = res.json.mock.calls[0][0].sessions;
    expect(sessions).toHaveLength(1);
    expect(sessions[0]).toEqual(
      expect.objectContaining({
        id: 21,
        status: 'OFFERED',
        volunteerRequest: { status: 'OFFERED', userId: 7, tutorName: 'Nina Nominee' },
      }),
    );
    expect(next).not.toHaveBeenCalled();
  });

  test('serializes a cover request whose tutor relation is missing with a null name', async () => {
    prisma.user.findUnique.mockResolvedValue({ id: 1, role: 'TUTOR', firstName: 'Thabo', lastName: 'Demotutor' });
    prisma.roleApplication.findFirst.mockResolvedValue(null);
    prisma.tutorAssignment.findMany.mockResolvedValue([]);
    prisma.event.findMany.mockResolvedValue([]);

    const nextMonday = new Date();
    nextMonday.setUTCHours(0, 0, 0, 0);
    nextMonday.setUTCDate(
      nextMonday.getUTCDate() + ((((1 - nextMonday.getUTCDay()) % 7) + 7) % 7 || 7),
    );

    prisma.session.findMany.mockResolvedValue([
      {
        id: 22,
        date: nextMonday,
        status: 'PENDING',
        excuseReason: 'Medical appointment',
        courseSlotId: 31,
        assignment: {
          userId: 1,
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
        volunteerRequest: { status: 'PENDING', userId: 7, user: null },
      },
    ]);

    const req = mockReq();
    const res = mockRes();
    const next = jest.fn();

    await getMySessions(req, res, next);
    await flushMicrotasks();

    const sessions = res.json.mock.calls[0][0].sessions;
    expect(sessions[0]).toEqual(
      expect.objectContaining({
        volunteerRequest: { status: 'PENDING', userId: 7, tutorName: null },
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

  test('returns 404 when the requesting user does not exist', async () => {
    prisma.user.findUnique.mockResolvedValue(null);

    const req = mockReq();
    const res = mockRes();
    const next = jest.fn();

    await getLecturerSessions(req, res, next);
    await flushMicrotasks();

    expect(next).toHaveBeenCalledWith(
      expect.objectContaining({ statusCode: 404, message: 'User not found. Please check if the user exists' }),
    );
    expect(prisma.course.findMany).not.toHaveBeenCalled();
  });

  test('maps tutor-less assignments and volunteer request metadata defensively', async () => {
    prisma.user.findUnique.mockResolvedValue({ id: 1, role: 'LECTURER' });
    prisma.event.findMany.mockResolvedValue([]);
    prisma.course.findMany.mockResolvedValue([
      {
        id: 100,
        courseCode: 'COMS1015',
        courseName: 'Introduction to Programming',
        slots: [],
        assignments: [
          {
            id: 11,
            userId: 7,
            user: null,
            sessions: [
              {
                id: 21,
                date: new Date('2026-09-21T00:00:00.000Z'),
                status: 'PENDING',
                excuseReason: 'Medical appointment',
                volunteerRequest: {
                  id: 5,
                  status: 'PENDING',
                  userId: 8,
                  user: { firstName: 'Lerato', lastName: 'Mokoena' },
                },
                courseSlot: { id: 31, dayOfWeek: 1, venue: 'Lab 2', sessionType: 'Tutorial', timeSlot: { startMinute: 480, endMinute: 570 } },
              },
            ],
          },
          {
            id: 12,
            userId: 9,
            user: { firstName: 'Thabo', lastName: 'Demotutor' },
            sessions: [
              {
                id: 22,
                date: new Date('2026-09-22T00:00:00.000Z'),
                status: 'PENDING',
                excuseReason: null,
                volunteerRequest: { id: 6, status: 'APPROVED', userId: 8, user: null },
                courseSlot: { id: 32, dayOfWeek: 2, venue: null, sessionType: null, timeSlot: null },
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

    // The lecturer's Approve/Reject UI reads volunteerRequest — assert the
    // query actually loads the relation, not just that the mapping survives
    // a mock that already carries the field.
    expect(prisma.course.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        include: expect.objectContaining({
          assignments: expect.objectContaining({
            include: expect.objectContaining({
              sessions: expect.objectContaining({
                include: expect.objectContaining({
                  volunteerRequest: expect.objectContaining({
                    include: { user: { select: { firstName: true, lastName: true } } },
                  }),
                }),
              }),
            }),
          }),
        }),
      }),
    );

    expect(res.json).toHaveBeenCalledWith({
      courses: [
        expect.objectContaining({
          id: 100,
          tutors: [
            expect.objectContaining({ assignmentId: 11, name: null }),
            expect.objectContaining({ assignmentId: 12, name: 'Thabo Demotutor' }),
          ],
          sessions: [
            expect.objectContaining({
              id: 21,
              tutorName: null,
              volunteerRequest: expect.objectContaining({ userId: 8, volunteerName: 'Lerato Mokoena' }),
            }),
            expect.objectContaining({
              id: 22,
              tutorName: 'Thabo Demotutor',
              volunteerRequest: expect.objectContaining({ userId: 8, volunteerName: null }),
            }),
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

  test('returns 404 when the requesting user does not exist', async () => {
    prisma.user.findUnique.mockResolvedValue(null);

    const req = mockReq({ params: { id: '21' }, body: { reason: 'Medical appointment' } });
    const res = mockRes();
    const next = jest.fn();

    await excuseSession(req, res, next);
    await flushMicrotasks();

    expect(next).toHaveBeenCalledWith(
      expect.objectContaining({ statusCode: 404, message: 'User not found. Please check if the user exists' }),
    );
    expect(prisma.session.findUnique).not.toHaveBeenCalled();
  });

  test('returns 403 when the requesting user is not a tutor', async () => {
    prisma.user.findUnique.mockResolvedValue({ id: 1, role: 'LECTURER' });

    const req = mockReq({ params: { id: '21' }, body: { reason: 'Medical appointment' } });
    const res = mockRes();
    const next = jest.fn();

    await excuseSession(req, res, next);
    await flushMicrotasks();

    expect(next).toHaveBeenCalledWith(
      expect.objectContaining({ statusCode: 403, message: 'Only tutors can excuse themselves from a session' }),
    );
    expect(prisma.session.findUnique).not.toHaveBeenCalled();
  });

  test('treats a missing request body as a missing reason', async () => {
    const req = mockReq({ params: { id: '21' }, body: undefined });
    const res = mockRes();
    const next = jest.fn();

    await excuseSession(req, res, next);
    await flushMicrotasks();

    expect(next).toHaveBeenCalledWith(
      expect.objectContaining({ statusCode: 400, message: 'An excuse reason is required' }),
    );
  });

  test('returns 400 for a virtual id whose date is not a real calendar date', async () => {
    prisma.user.findUnique.mockResolvedValue({ id: 1, role: 'TUTOR' });

    const req = mockReq({ params: { id: 'e31-9999-99-99' }, body: { reason: 'Medical appointment' } });
    const res = mockRes();
    const next = jest.fn();

    await excuseSession(req, res, next);
    await flushMicrotasks();

    expect(next).toHaveBeenCalledWith(
      expect.objectContaining({ statusCode: 400, message: 'Invalid session id' }),
    );
    expect(prisma.courseSlot.findUnique).not.toHaveBeenCalled();
  });

  test('returns 404 when the virtual id references a course slot that does not exist', async () => {
    const nextMonday = new Date();
    nextMonday.setUTCHours(0, 0, 0, 0);
    nextMonday.setUTCDate(
      nextMonday.getUTCDate() + ((((1 - nextMonday.getUTCDay()) % 7) + 7) % 7 || 7),
    );
    const mondayISO = nextMonday.toISOString().slice(0, 10);

    prisma.user.findUnique.mockResolvedValue({ id: 1, role: 'TUTOR' });
    prisma.courseSlot.findUnique.mockResolvedValue(null);

    const req = mockReq({ params: { id: `e31-${mondayISO}` }, body: { reason: 'Medical appointment' } });
    const res = mockRes();
    const next = jest.fn();

    await excuseSession(req, res, next);
    await flushMicrotasks();

    expect(next).toHaveBeenCalledWith(
      expect.objectContaining({ statusCode: 404, message: expect.stringContaining('Session not found') }),
    );
    expect(prisma.event.findFirst).not.toHaveBeenCalled();
    expect(prisma.session.create).not.toHaveBeenCalled();
  });

  test('returns 403 when the tutor has no assignment for the virtual occurrence\'s course', async () => {
    const nextMonday = new Date();
    nextMonday.setUTCHours(0, 0, 0, 0);
    nextMonday.setUTCDate(
      nextMonday.getUTCDate() + ((((1 - nextMonday.getUTCDay()) % 7) + 7) % 7 || 7),
    );
    const mondayISO = nextMonday.toISOString().slice(0, 10);

    prisma.user.findUnique.mockResolvedValue({ id: 1, role: 'TUTOR' });
    prisma.courseSlot.findUnique.mockResolvedValue({ id: 31, dayOfWeek: 0, course: { id: 100 } });
    prisma.event.findFirst.mockResolvedValue({ id: 41, courseId: 100, date: nextMonday });
    prisma.tutorAssignment.findFirst.mockResolvedValue(null);

    const req = mockReq({ params: { id: `e31-${mondayISO}` }, body: { reason: 'Medical appointment' } });
    const res = mockRes();
    const next = jest.fn();

    await excuseSession(req, res, next);
    await flushMicrotasks();

    expect(next).toHaveBeenCalledWith(
      expect.objectContaining({ statusCode: 403, message: 'You can only excuse yourself from your own sessions' }),
    );
    expect(prisma.session.create).not.toHaveBeenCalled();
  });

  test('returns 404 when the real session does not exist', async () => {
    prisma.user.findUnique.mockResolvedValue({ id: 1, role: 'TUTOR' });
    prisma.session.findUnique.mockResolvedValue(null);

    const req = mockReq({ params: { id: '21' }, body: { reason: 'Medical appointment' } });
    const res = mockRes();
    const next = jest.fn();

    await excuseSession(req, res, next);
    await flushMicrotasks();

    expect(next).toHaveBeenCalledWith(
      expect.objectContaining({ statusCode: 404, message: expect.stringContaining('Session not found') }),
    );
    expect(prisma.session.update).not.toHaveBeenCalled();
  });

  test('returns 409 when the real session has already taken place', async () => {
    prisma.user.findUnique.mockResolvedValue({ id: 1, role: 'TUTOR' });
    prisma.session.findUnique.mockResolvedValue({
      id: 21,
      date: new Date('2020-01-06T00:00:00.000Z'),
      status: 'SCHEDULED',
      assignment: { userId: 1 },
    });

    const req = mockReq({ params: { id: '21' }, body: { reason: 'Medical appointment' } });
    const res = mockRes();
    const next = jest.fn();

    await excuseSession(req, res, next);
    await flushMicrotasks();

    expect(next).toHaveBeenCalledWith(
      expect.objectContaining({ statusCode: 409, message: 'This session has already taken place' }),
    );
    expect(prisma.session.update).not.toHaveBeenCalled();
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

  test('defaults myCourseMark to null for a session outside the tutor\'s qualifying courses', async () => {
    prisma.user.findUnique.mockResolvedValue({ id: 1, role: 'TUTOR' });
    prisma.application.findMany.mockResolvedValue([
      { courseId: 100, courseMark: 88, course: { id: 100, minimumMark: 65 } },
    ]);
    prisma.session.findMany.mockResolvedValue([
      {
        id: 23,
        date: new Date('2026-09-23T00:00:00.000Z'),
        status: 'UNASSIGNED',
        excuseReason: 'Medical appointment',
        assignment: {
          userId: 9,
          courseId: 999,
          course: { courseCode: 'COMS3003', courseName: 'Formal Languages', minimumMark: 60 },
        },
        courseSlot: {
          id: 33,
          dayOfWeek: 3,
          venue: null,
          sessionType: null,
          timeSlot: { id: 5, startMinute: 660, endMinute: 750 },
        },
      },
    ]);

    const req = mockReq();
    const res = mockRes();
    const next = jest.fn();

    await getUnassignedSessions(req, res, next);
    await flushMicrotasks();

    expect(res.json).toHaveBeenCalledWith([expect.objectContaining({ id: 23, myCourseMark: null })]);
    expect(next).not.toHaveBeenCalled();
  });
});

// ════════════════════════════════════════════════════════════════════════
// getMyVolunteeredSessions — the tutor's own cover requests
// ════════════════════════════════════════════════════════════════════════
describe('getMyVolunteeredSessions', () => {
  test('returns 404 when the requesting user does not exist', async () => {
    prisma.user.findUnique.mockResolvedValue(null);

    const req = mockReq();
    const res = mockRes();
    const next = jest.fn();

    await getMyVolunteeredSessions(req, res, next);
    await flushMicrotasks();

    expect(next).toHaveBeenCalledWith(
      expect.objectContaining({ statusCode: 404, message: 'User not found. Please check if the user exists' }),
    );
    expect(prisma.sessionVolunteer.findMany).not.toHaveBeenCalled();
  });

  test('returns the tutor\'s live cover requests with volunteer status and cover-lead names', async () => {
    prisma.user.findUnique.mockResolvedValue({ id: 1, role: 'TUTOR' });
    prisma.sessionVolunteer.findMany.mockResolvedValue([
      {
        id: 5,
        status: 'PENDING',
        createdAt: new Date('2026-09-25T10:00:00.000Z'),
        session: {
          id: 21,
          date: new Date('2026-09-28T00:00:00.000Z'),
          status: 'PENDING',
          assignment: {
            userId: 9,
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
      },
      {
        id: 6,
        status: 'APPROVED',
        createdAt: new Date('2026-09-24T10:00:00.000Z'),
        session: {
          id: 22,
          date: new Date('2026-09-30T00:00:00.000Z'),
          status: 'SCHEDULED',
          assignment: {
            userId: 9,
            course: { courseCode: 'COMS1017', courseName: 'Data Structures and Algorithms' },
            user: null,
          },
          courseSlot: {
            id: 32,
            dayOfWeek: 3,
            venue: null,
            sessionType: null,
            timeSlot: { id: 4, startMinute: 660, endMinute: 750 },
          },
        },
      },
    ]);

    const req = mockReq();
    const res = mockRes();
    const next = jest.fn();

    await getMyVolunteeredSessions(req, res, next);
    await flushMicrotasks();

    // Only the tutor's own live requests are listed — directed offers still
    // waiting on their response plus PENDING/APPROVED covers — newest first.
    expect(prisma.sessionVolunteer.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { userId: 1, status: { in: ['OFFERED', 'PENDING', 'APPROVED'] } },
        orderBy: { createdAt: 'desc' },
      }),
    );

    expect(res.json).toHaveBeenCalledWith({
      sessions: [
        expect.objectContaining({
          id: 21,
          date: new Date('2026-09-28T00:00:00.000Z'),
          status: 'PENDING',
          volunteerStatus: 'PENDING',
          course: { courseCode: 'COMS1015', courseName: 'Introduction to Programming' },
          courseSlot: expect.objectContaining({
            id: 31,
            venue: 'Lab 2',
            timeSlot: { id: 3, startMinute: 480, endMinute: 570 },
          }),
          ledBy: 'Thabo Demotutor',
        }),
        expect.objectContaining({
          id: 22,
          volunteerStatus: 'APPROVED',
          ledBy: null,
        }),
      ],
    });
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

  test('replaces a withdrawn cover offer so the session can be covered after all', async () => {
    prisma.user.findUnique.mockResolvedValue({ id: 1, role: 'TUTOR' });
    prisma.session.findUnique.mockResolvedValue(unassignedSession());
    prisma.application.findFirst.mockResolvedValue({ courseMark: 88, status: 'APPROVED' });
    prisma.sessionVolunteer.findUnique.mockResolvedValue({ id: 5, sessionId: 21, userId: 7, status: 'CANCELLED' });
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

  test('returns 404 when the requesting user does not exist', async () => {
    prisma.user.findUnique.mockResolvedValue(null);

    const req = mockReq({ params: { id: '21' } });
    const res = mockRes();
    const next = jest.fn();

    await volunteerForSession(req, res, next);
    await flushMicrotasks();

    expect(next).toHaveBeenCalledWith(
      expect.objectContaining({ statusCode: 404, message: 'User not found. Please check if the user exists' }),
    );
    expect(prisma.session.findUnique).not.toHaveBeenCalled();
  });

  test('returns 404 when the session does not exist', async () => {
    prisma.user.findUnique.mockResolvedValue({ id: 1, role: 'TUTOR' });
    prisma.session.findUnique.mockResolvedValue(null);

    const req = mockReq({ params: { id: '21' } });
    const res = mockRes();
    const next = jest.fn();

    await volunteerForSession(req, res, next);
    await flushMicrotasks();

    expect(next).toHaveBeenCalledWith(
      expect.objectContaining({ statusCode: 404, message: expect.stringContaining('Session not found') }),
    );
    expect(prisma.sessionVolunteer.create).not.toHaveBeenCalled();
    expect(prisma.session.update).not.toHaveBeenCalled();
  });

  test('returns 409 when the unique constraint catches a racing volunteer request', async () => {
    prisma.user.findUnique.mockResolvedValue({ id: 1, role: 'TUTOR' });
    prisma.$transaction.mockRejectedValueOnce(
      Object.assign(new Error('Unique constraint failed'), { code: 'P2002' }),
    );

    const req = mockReq({ params: { id: '21' } });
    const res = mockRes();
    const next = jest.fn();

    await volunteerForSession(req, res, next);
    await flushMicrotasks();

    expect(next).toHaveBeenCalledWith(
      expect.objectContaining({ statusCode: 409, message: 'Another tutor has already volunteered for this session' }),
    );
    expect(res.status).not.toHaveBeenCalled();
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

  test('treats a missing request body as an invalid decision', async () => {
    const req = mockReq({ params: { id: '21' }, body: undefined });
    const res = mockRes();
    const next = jest.fn();

    await decideVolunteerRequest(req, res, next);
    await flushMicrotasks();

    expect(next).toHaveBeenCalledWith(
      expect.objectContaining({ statusCode: 400, message: 'decision must be APPROVED or REJECTED' }),
    );
    expect(prisma.user.findUnique).not.toHaveBeenCalled();
  });

  test('returns 404 when the requesting user does not exist', async () => {
    prisma.user.findUnique.mockResolvedValue(null);

    const req = mockReq({ params: { id: '21' }, body: { decision: 'APPROVED' } });
    const res = mockRes();
    const next = jest.fn();

    await decideVolunteerRequest(req, res, next);
    await flushMicrotasks();

    expect(next).toHaveBeenCalledWith(
      expect.objectContaining({ statusCode: 404, message: 'User not found. Please check if the user exists' }),
    );
    expect(prisma.session.findUnique).not.toHaveBeenCalled();
  });

  test('returns 404 when the session does not exist', async () => {
    prisma.user.findUnique.mockResolvedValue({ id: 2, role: 'LECTURER' });
    prisma.session.findUnique.mockResolvedValue(null);

    const req = mockReq({ params: { id: '21' }, body: { decision: 'APPROVED' } });
    const res = mockRes();
    const next = jest.fn();

    await decideVolunteerRequest(req, res, next);
    await flushMicrotasks();

    expect(next).toHaveBeenCalledWith(
      expect.objectContaining({ statusCode: 404, message: expect.stringContaining('Session not found') }),
    );
    expect(prisma.session.update).not.toHaveBeenCalled();
  });
});

// ════════════════════════════════════════════════════════════════════════
// getCoverCandidates — the appointed tutors an excused session can be offered to
// ════════════════════════════════════════════════════════════════════════

// An excused (UNASSIGNED) future session owned by tutor 1 — the shape the
// directed-cover endpoints read: assignment, course slot with course + timeslot.
function coverSession(overrides = {}) {
  return {
    id: 21,
    date: new Date('2099-01-05T00:00:00.000Z'),
    status: 'UNASSIGNED',
    excuseReason: 'Medical appointment',
    courseSlotId: 31,
    assignment: { userId: 1, courseId: 100 },
    courseSlot: {
      id: 31,
      dayOfWeek: 0,
      venue: 'Lab 2',
      sessionType: 'Tutorial',
      timeSlotId: 3,
      timeSlot: { id: 3, startMinute: 480, endMinute: 570 },
      course: { id: 100, courseCode: 'COMS1015', courseName: 'Introduction to Programming' },
    },
    ...overrides,
  };
}

describe('getCoverCandidates', () => {
  test('returns 400 when the session id is invalid', async () => {
    const req = mockReq({ params: { id: 'abc' } });
    const res = mockRes();
    const next = jest.fn();

    await getCoverCandidates(req, res, next);
    await flushMicrotasks();

    expect(next).toHaveBeenCalledWith(
      expect.objectContaining({ statusCode: 400, message: 'Invalid session id' }),
    );
    expect(prisma.user.findUnique).not.toHaveBeenCalled();
  });

  test('returns 404 when the requesting user does not exist', async () => {
    prisma.user.findUnique.mockResolvedValue(null);

    const req = mockReq({ params: { id: '21' } });
    const res = mockRes();
    const next = jest.fn();

    await getCoverCandidates(req, res, next);
    await flushMicrotasks();

    expect(next).toHaveBeenCalledWith(
      expect.objectContaining({ statusCode: 404, message: 'User not found. Please check if the user exists' }),
    );
    expect(prisma.session.findUnique).not.toHaveBeenCalled();
  });

  test('returns 403 when the requesting user is not a tutor', async () => {
    prisma.user.findUnique.mockResolvedValue({ id: 1, role: 'STUDENT' });

    const req = mockReq({ params: { id: '21' } });
    const res = mockRes();
    const next = jest.fn();

    await getCoverCandidates(req, res, next);
    await flushMicrotasks();

    expect(next).toHaveBeenCalledWith(
      expect.objectContaining({ statusCode: 403, message: 'Only tutors can view cover candidates' }),
    );
    expect(prisma.session.findUnique).not.toHaveBeenCalled();
  });

  test('returns 404 when the session does not exist', async () => {
    prisma.user.findUnique.mockResolvedValue({ id: 1, role: 'TUTOR' });
    prisma.session.findUnique.mockResolvedValue(null);

    const req = mockReq({ params: { id: '21' } });
    const res = mockRes();
    const next = jest.fn();

    await getCoverCandidates(req, res, next);
    await flushMicrotasks();

    expect(next).toHaveBeenCalledWith(
      expect.objectContaining({ statusCode: 404, message: 'Session not found. Please check if the session exists' }),
    );
    expect(prisma.tutorAssignment.findMany).not.toHaveBeenCalled();
  });

  test('returns 403 when the session sits on another tutor\'s assignment', async () => {
    prisma.user.findUnique.mockResolvedValue({ id: 1, role: 'TUTOR' });
    prisma.session.findUnique.mockResolvedValue(
      coverSession({ assignment: { userId: 99, courseId: 100 } }),
    );

    const req = mockReq({ params: { id: '21' } });
    const res = mockRes();
    const next = jest.fn();

    await getCoverCandidates(req, res, next);
    await flushMicrotasks();

    expect(next).toHaveBeenCalledWith(
      expect.objectContaining({ statusCode: 403, message: 'You can only offer cover for your own excused sessions' }),
    );
    expect(prisma.tutorAssignment.findMany).not.toHaveBeenCalled();
  });

  test('returns 409 when the session is not in the open pool', async () => {
    prisma.user.findUnique.mockResolvedValue({ id: 1, role: 'TUTOR' });
    prisma.session.findUnique.mockResolvedValue(coverSession({ status: 'PENDING' }));

    const req = mockReq({ params: { id: '21' } });
    const res = mockRes();
    const next = jest.fn();

    await getCoverCandidates(req, res, next);
    await flushMicrotasks();

    expect(next).toHaveBeenCalledWith(
      expect.objectContaining({ statusCode: 409, message: 'This session is not open for a directed cover offer' }),
    );
    expect(prisma.tutorAssignment.findMany).not.toHaveBeenCalled();
  });

  test('validates each appointed tutor and explains why they cannot cover', async () => {
    prisma.user.findUnique.mockResolvedValue({ id: 1, role: 'TUTOR' });
    prisma.session.findUnique.mockResolvedValue(coverSession());
    prisma.tutorAssignment.findMany.mockResolvedValue([
      { user: { id: 7, firstName: 'Nina', lastName: 'Nominee', email: 'nina@example.com' } },
      { user: { id: 8, firstName: null, lastName: null, email: 'ben@example.com' } },
      { user: { id: 10, firstName: null, lastName: null, email: null } },
    ]);
    // 7 passes every check; 8 fails all three (availability, busy block and
    // double-booking); 10 has no availability covering the session's slot.
    prisma.availability.findMany.mockImplementation(({ where }) =>
      Promise.resolve(where.userId === 7 ? [{ id: 1 }] : []),
    );
    prisma.busyBlock.findMany.mockImplementation(({ where }) =>
      Promise.resolve(where.userId === 8 ? [{ startMinute: 500, endMinute: 600 }] : []),
    );
    prisma.session.findFirst.mockImplementation(({ where }) =>
      Promise.resolve(where.assignment.userId === 8 ? { id: 99 } : null),
    );

    const req = mockReq({ params: { id: '21' } });
    const res = mockRes();
    const next = jest.fn();

    await getCoverCandidates(req, res, next);
    await flushMicrotasks();

    // The candidate pool is the course's other appointed, active tutors.
    expect(prisma.tutorAssignment.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: {
          courseId: 100,
          userId: { not: 1 },
          user: { role: 'TUTOR', isActive: true },
        },
      }),
    );

    expect(res.json).toHaveBeenCalledWith({
      session: expect.objectContaining({
        id: 21,
        date: new Date('2099-01-05T00:00:00.000Z'),
        status: 'UNASSIGNED',
        excuseReason: 'Medical appointment',
        course: { courseCode: 'COMS1015', courseName: 'Introduction to Programming' },
        courseSlot: expect.objectContaining({ id: 31, dayOfWeek: 0, venue: 'Lab 2' }),
      }),
      candidates: [
        { userId: 7, name: 'Nina Nominee', email: 'nina@example.com', eligible: true, reasons: [] },
        {
          userId: 8,
          name: 'ben@example.com',
          email: 'ben@example.com',
          eligible: false,
          reasons: [
            'the session falls outside their weekly availability',
            'the session clashes with one of their busy blocks',
            'it double-books them against another session on 2099-01-05',
          ],
        },
        {
          userId: 10,
          name: 'Unknown tutor',
          email: null,
          eligible: false,
          reasons: ['the session falls outside their weekly availability'],
        },
      ],
    });
    expect(next).not.toHaveBeenCalled();
  });

  test('flags every candidate when the session has no matching timeslot', async () => {
    prisma.user.findUnique.mockResolvedValue({ id: 1, role: 'TUTOR' });
    prisma.session.findUnique.mockResolvedValue(
      coverSession({
        courseSlot: {
          ...coverSession().courseSlot,
          timeSlotId: null,
          timeSlot: null,
        },
      }),
    );
    prisma.tutorAssignment.findMany.mockResolvedValue([
      { user: { id: 7, firstName: 'Nina', lastName: 'Nominee', email: 'nina@example.com' } },
    ]);

    const req = mockReq({ params: { id: '21' } });
    const res = mockRes();
    const next = jest.fn();

    await getCoverCandidates(req, res, next);
    await flushMicrotasks();

    expect(res.json).toHaveBeenCalledWith(
      expect.objectContaining({
        candidates: [
          {
            userId: 7,
            name: 'Nina Nominee',
            email: 'nina@example.com',
            eligible: false,
            reasons: ["COMS1015 has no tutoring timeslot on the session's day"],
          },
        ],
      }),
    );
    // The time-range checks would be meaningless without a slot.
    expect(prisma.availability.findMany).not.toHaveBeenCalled();
    expect(next).not.toHaveBeenCalled();
  });
});

// ════════════════════════════════════════════════════════════════════════
// createCoverOffer — the excuser points the cover at one appointed tutor
// ════════════════════════════════════════════════════════════════════════
describe('createCoverOffer', () => {
  // The requester (looked up by firebaseUid) and the nominee (looked up by id)
  // share prisma.user.findUnique — resolve both shapes by the where-clause.
  const requesterAndNominee = (
    nominee = { id: 7, role: 'TUTOR', isActive: true, firstName: 'Nina', lastName: 'Nominee', email: 'nina@example.com' },
  ) =>
    prisma.user.findUnique.mockImplementation(({ where }) =>
      Promise.resolve(where.firebaseUid ? { id: 1, role: 'TUTOR' } : nominee),
    );

  // A nominee who passes every practical cover check.
  const nomineeIsValid = () => {
    prisma.tutorAssignment.findFirst.mockResolvedValue({ id: 55, userId: 7, courseId: 100 });
    prisma.availability.findMany.mockResolvedValue([{ id: 1 }]);
    prisma.busyBlock.findMany.mockResolvedValue([]);
    prisma.session.findFirst.mockResolvedValue(null);
  };

  test('returns 400 when the session id is invalid', async () => {
    const req = mockReq({ params: { id: 'abc' }, body: { nomineeId: 7 } });
    const res = mockRes();
    const next = jest.fn();

    await createCoverOffer(req, res, next);
    await flushMicrotasks();

    expect(next).toHaveBeenCalledWith(
      expect.objectContaining({ statusCode: 400, message: 'Invalid session id' }),
    );
    expect(prisma.user.findUnique).not.toHaveBeenCalled();
  });

  test('returns 400 when nomineeId is not an integer', async () => {
    const req = mockReq({ params: { id: '21' }, body: { nomineeId: 'seven' } });
    const res = mockRes();
    const next = jest.fn();

    await createCoverOffer(req, res, next);
    await flushMicrotasks();

    expect(next).toHaveBeenCalledWith(
      expect.objectContaining({ statusCode: 400, message: 'nomineeId must be a valid integer' }),
    );
    expect(prisma.user.findUnique).not.toHaveBeenCalled();
  });

  test('returns 404 when the requesting user does not exist', async () => {
    prisma.user.findUnique.mockResolvedValue(null);

    const req = mockReq({ params: { id: '21' }, body: { nomineeId: 7 } });
    const res = mockRes();
    const next = jest.fn();

    await createCoverOffer(req, res, next);
    await flushMicrotasks();

    expect(next).toHaveBeenCalledWith(
      expect.objectContaining({ statusCode: 404, message: 'User not found. Please check if the user exists' }),
    );
    expect(prisma.session.findUnique).not.toHaveBeenCalled();
  });

  test('returns 403 when the requesting user is not a tutor', async () => {
    prisma.user.findUnique.mockResolvedValue({ id: 1, role: 'STUDENT' });

    const req = mockReq({ params: { id: '21' }, body: { nomineeId: 7 } });
    const res = mockRes();
    const next = jest.fn();

    await createCoverOffer(req, res, next);
    await flushMicrotasks();

    expect(next).toHaveBeenCalledWith(
      expect.objectContaining({ statusCode: 403, message: 'Only tutors can offer a session to another tutor' }),
    );
    expect(prisma.session.findUnique).not.toHaveBeenCalled();
  });

  test('returns 404 when the nominated user does not exist', async () => {
    requesterAndNominee(null);

    const req = mockReq({ params: { id: '21' }, body: { nomineeId: 7 } });
    const res = mockRes();
    const next = jest.fn();

    await createCoverOffer(req, res, next);
    await flushMicrotasks();

    expect(next).toHaveBeenCalledWith(
      expect.objectContaining({ statusCode: 404, message: 'The nominated tutor must be an active tutor' }),
    );
    expect(prisma.session.findUnique).not.toHaveBeenCalled();
  });

  test('returns 404 when the nominee is not a tutor', async () => {
    requesterAndNominee({ id: 7, role: 'STUDENT' });

    const req = mockReq({ params: { id: '21' }, body: { nomineeId: 7 } });
    const res = mockRes();
    const next = jest.fn();

    await createCoverOffer(req, res, next);
    await flushMicrotasks();

    expect(next).toHaveBeenCalledWith(
      expect.objectContaining({ statusCode: 404, message: 'The nominated tutor must be an active tutor' }),
    );
    expect(prisma.session.findUnique).not.toHaveBeenCalled();
  });

  test('returns 404 when the nominee is deactivated', async () => {
    requesterAndNominee({ id: 7, role: 'TUTOR', isActive: false });

    const req = mockReq({ params: { id: '21' }, body: { nomineeId: 7 } });
    const res = mockRes();
    const next = jest.fn();

    await createCoverOffer(req, res, next);
    await flushMicrotasks();

    expect(next).toHaveBeenCalledWith(
      expect.objectContaining({ statusCode: 404, message: 'The nominated tutor must be an active tutor' }),
    );
    expect(prisma.session.findUnique).not.toHaveBeenCalled();
  });

  test('returns 400 when the nominee is the requester themselves', async () => {
    requesterAndNominee({ id: 1, role: 'TUTOR', isActive: true });

    const req = mockReq({ params: { id: '21' }, body: { nomineeId: 1 } });
    const res = mockRes();
    const next = jest.fn();

    await createCoverOffer(req, res, next);
    await flushMicrotasks();

    expect(next).toHaveBeenCalledWith(
      expect.objectContaining({ statusCode: 400, message: 'You cannot offer a session to yourself' }),
    );
    expect(prisma.session.findUnique).not.toHaveBeenCalled();
  });

  test('returns 404 when the session does not exist', async () => {
    requesterAndNominee();
    prisma.session.findUnique.mockResolvedValue(null);

    const req = mockReq({ params: { id: '21' }, body: { nomineeId: 7 } });
    const res = mockRes();
    const next = jest.fn();

    await createCoverOffer(req, res, next);
    await flushMicrotasks();

    expect(next).toHaveBeenCalledWith(
      expect.objectContaining({ statusCode: 404, message: 'Session not found. Please check if the session exists' }),
    );
    expect(prisma.sessionVolunteer.create).not.toHaveBeenCalled();
  });

  test('returns 403 when the session sits on another tutor\'s assignment', async () => {
    requesterAndNominee();
    prisma.session.findUnique.mockResolvedValue(
      coverSession({ assignment: { userId: 99, courseId: 100 } }),
    );

    const req = mockReq({ params: { id: '21' }, body: { nomineeId: 7 } });
    const res = mockRes();
    const next = jest.fn();

    await createCoverOffer(req, res, next);
    await flushMicrotasks();

    expect(next).toHaveBeenCalledWith(
      expect.objectContaining({ statusCode: 403, message: 'You can only offer cover for your own excused sessions' }),
    );
    expect(prisma.sessionVolunteer.create).not.toHaveBeenCalled();
  });

  test('returns 409 when the session is not in the open pool', async () => {
    requesterAndNominee();
    prisma.session.findUnique.mockResolvedValue(coverSession({ status: 'PENDING' }));

    const req = mockReq({ params: { id: '21' }, body: { nomineeId: 7 } });
    const res = mockRes();
    const next = jest.fn();

    await createCoverOffer(req, res, next);
    await flushMicrotasks();

    expect(next).toHaveBeenCalledWith(
      expect.objectContaining({ statusCode: 409, message: 'This session is not open for a directed cover offer' }),
    );
    expect(prisma.sessionVolunteer.create).not.toHaveBeenCalled();
  });

  test('returns 409 when the session has already taken place', async () => {
    requesterAndNominee();
    prisma.session.findUnique.mockResolvedValue(
      coverSession({ date: new Date('2000-01-01T00:00:00.000Z') }),
    );

    const req = mockReq({ params: { id: '21' }, body: { nomineeId: 7 } });
    const res = mockRes();
    const next = jest.fn();

    await createCoverOffer(req, res, next);
    await flushMicrotasks();

    expect(next).toHaveBeenCalledWith(
      expect.objectContaining({ statusCode: 409, message: 'This session has already taken place' }),
    );
    expect(prisma.tutorAssignment.findFirst).not.toHaveBeenCalled();
  });

  test('returns 403 when the nominee is not appointed to the course', async () => {
    requesterAndNominee();
    prisma.session.findUnique.mockResolvedValue(coverSession());
    prisma.tutorAssignment.findFirst.mockResolvedValue(null);

    const req = mockReq({ params: { id: '21' }, body: { nomineeId: 7 } });
    const res = mockRes();
    const next = jest.fn();

    await createCoverOffer(req, res, next);
    await flushMicrotasks();

    // Taking a session over is an appointment — qualified outsiders are not
    // enough, a tutor without a TutorAssignment for the course is refused.
    expect(next).toHaveBeenCalledWith(
      expect.objectContaining({ statusCode: 403, message: 'Nina Nominee is not allocated to COMS1015' }),
    );
    expect(prisma.sessionVolunteer.create).not.toHaveBeenCalled();
  });

  test('returns 403 with the reasons when the nominee fails the cover checks', async () => {
    requesterAndNominee();
    prisma.session.findUnique.mockResolvedValue(coverSession());
    prisma.tutorAssignment.findFirst.mockResolvedValue({ id: 55, userId: 7, courseId: 100 });
    prisma.availability.findMany.mockResolvedValue([]);
    prisma.busyBlock.findMany.mockResolvedValue([]);
    prisma.session.findFirst.mockResolvedValue(null);

    const req = mockReq({ params: { id: '21' }, body: { nomineeId: 7 } });
    const res = mockRes();
    const next = jest.fn();

    await createCoverOffer(req, res, next);
    await flushMicrotasks();

    expect(next).toHaveBeenCalledWith(
      expect.objectContaining({
        statusCode: 403,
        message: 'Nina Nominee cannot cover this session: the session falls outside their weekly availability',
      }),
    );
    expect(prisma.sessionVolunteer.create).not.toHaveBeenCalled();
  });

  test('returns 409 when another cover request is already in progress', async () => {
    requesterAndNominee();
    nomineeIsValid();
    prisma.session.findUnique.mockResolvedValue(coverSession());
    prisma.sessionVolunteer.findUnique.mockResolvedValue({ id: 5, sessionId: 21, userId: 9, status: 'PENDING' });

    const req = mockReq({ params: { id: '21' }, body: { nomineeId: 7 } });
    const res = mockRes();
    const next = jest.fn();

    await createCoverOffer(req, res, next);
    await flushMicrotasks();

    expect(next).toHaveBeenCalledWith(
      expect.objectContaining({ statusCode: 409, message: 'This session already has a cover request in progress' }),
    );
    expect(prisma.sessionVolunteer.create).not.toHaveBeenCalled();
    expect(prisma.sessionVolunteer.update).not.toHaveBeenCalled();
  });

  test('creates an OFFERED request and flips the session to OFFERED', async () => {
    requesterAndNominee();
    nomineeIsValid();
    prisma.session.findUnique.mockResolvedValue(coverSession());
    prisma.sessionVolunteer.findUnique.mockResolvedValue(null);
    const record = { id: 5, sessionId: 21, userId: 7, status: 'OFFERED' };
    prisma.sessionVolunteer.create.mockResolvedValue(record);

    const req = mockReq({ params: { id: '21' }, body: { nomineeId: 7 } });
    const res = mockRes();
    const next = jest.fn();

    await createCoverOffer(req, res, next);
    await flushMicrotasks();

    expect(prisma.sessionVolunteer.create).toHaveBeenCalledWith({
      data: { sessionId: 21, userId: 7, status: 'OFFERED' },
    });
    expect(prisma.session.update).toHaveBeenCalledWith({ where: { id: 21 }, data: { status: 'OFFERED' } });
    expect(res.status).toHaveBeenCalledWith(201);
    expect(res.json).toHaveBeenCalledWith(record);
    expect(next).not.toHaveBeenCalled();
  });

  test('replaces a declined offer with the new nominee', async () => {
    requesterAndNominee();
    nomineeIsValid();
    prisma.session.findUnique.mockResolvedValue(coverSession());
    prisma.sessionVolunteer.findUnique.mockResolvedValue({ id: 5, sessionId: 21, userId: 9, status: 'REJECTED' });
    prisma.sessionVolunteer.update.mockResolvedValue({ id: 5, sessionId: 21, userId: 7, status: 'OFFERED' });

    const req = mockReq({ params: { id: '21' }, body: { nomineeId: 7 } });
    const res = mockRes();
    const next = jest.fn();

    await createCoverOffer(req, res, next);
    await flushMicrotasks();

    // The dead record is reused (single cover request per session), refreshed
    // with the new nominee and a new createdAt so the list orders correctly.
    expect(prisma.sessionVolunteer.update).toHaveBeenCalledWith({
      where: { sessionId: 21 },
      data: { userId: 7, status: 'OFFERED', createdAt: expect.any(Date) },
    });
    expect(prisma.sessionVolunteer.create).not.toHaveBeenCalled();
    expect(prisma.session.update).toHaveBeenCalledWith({ where: { id: 21 }, data: { status: 'OFFERED' } });
    expect(res.status).toHaveBeenCalledWith(201);
    expect(next).not.toHaveBeenCalled();
  });

  test('returns 409 when the unique constraint catches a racing offer', async () => {
    requesterAndNominee();
    prisma.$transaction.mockRejectedValueOnce(
      Object.assign(new Error('Unique constraint failed'), { code: 'P2002' }),
    );

    const req = mockReq({ params: { id: '21' }, body: { nomineeId: 7 } });
    const res = mockRes();
    const next = jest.fn();

    await createCoverOffer(req, res, next);
    await flushMicrotasks();

    expect(next).toHaveBeenCalledWith(
      expect.objectContaining({ statusCode: 409, message: 'This session already has a cover request in progress' }),
    );
    expect(res.status).not.toHaveBeenCalled();
  });
});

// ════════════════════════════════════════════════════════════════════════
// respondToCoverOffer — the nominated tutor accepts or declines
// ════════════════════════════════════════════════════════════════════════

// The session mid directed offer: tutor 1 excused it, tutor 7 was nominated.
const offeredSession = (overrides = {}) => ({
  id: 21,
  status: 'OFFERED',
  assignment: { userId: 1 },
  volunteerRequest: { id: 5, sessionId: 21, userId: 7, status: 'OFFERED' },
  ...overrides,
});

describe('respondToCoverOffer', () => {
  test('returns 400 when the session id is invalid', async () => {
    const req = mockReq({ params: { id: 'abc' }, body: { decision: 'ACCEPT' } });
    const res = mockRes();
    const next = jest.fn();

    await respondToCoverOffer(req, res, next);
    await flushMicrotasks();

    expect(next).toHaveBeenCalledWith(
      expect.objectContaining({ statusCode: 400, message: 'Invalid session id' }),
    );
    expect(prisma.user.findUnique).not.toHaveBeenCalled();
  });

  test('returns 400 when the decision is not ACCEPT or DECLINE', async () => {
    const req = mockReq({ params: { id: '21' }, body: { decision: 'MAYBE' } });
    const res = mockRes();
    const next = jest.fn();

    await respondToCoverOffer(req, res, next);
    await flushMicrotasks();

    expect(next).toHaveBeenCalledWith(
      expect.objectContaining({ statusCode: 400, message: 'decision must be ACCEPT or DECLINE' }),
    );
    expect(prisma.user.findUnique).not.toHaveBeenCalled();
  });

  test('treats a missing request body as an invalid decision', async () => {
    const req = mockReq({ params: { id: '21' }, body: undefined });
    const res = mockRes();
    const next = jest.fn();

    await respondToCoverOffer(req, res, next);
    await flushMicrotasks();

    expect(next).toHaveBeenCalledWith(
      expect.objectContaining({ statusCode: 400, message: 'decision must be ACCEPT or DECLINE' }),
    );
    expect(prisma.user.findUnique).not.toHaveBeenCalled();
  });

  test('returns 404 when the requesting user does not exist', async () => {
    prisma.user.findUnique.mockResolvedValue(null);

    const req = mockReq({ params: { id: '21' }, body: { decision: 'ACCEPT' } });
    const res = mockRes();
    const next = jest.fn();

    await respondToCoverOffer(req, res, next);
    await flushMicrotasks();

    expect(next).toHaveBeenCalledWith(
      expect.objectContaining({ statusCode: 404, message: 'User not found. Please check if the user exists' }),
    );
    expect(prisma.session.findUnique).not.toHaveBeenCalled();
  });

  test('returns 403 when the requesting user is not a tutor', async () => {
    prisma.user.findUnique.mockResolvedValue({ id: 7, role: 'STUDENT' });

    const req = mockReq({ params: { id: '21' }, body: { decision: 'ACCEPT' } });
    const res = mockRes();
    const next = jest.fn();

    await respondToCoverOffer(req, res, next);
    await flushMicrotasks();

    expect(next).toHaveBeenCalledWith(
      expect.objectContaining({ statusCode: 403, message: 'Only tutors can respond to cover offers' }),
    );
    expect(prisma.session.findUnique).not.toHaveBeenCalled();
  });

  test('returns 404 when the session does not exist', async () => {
    prisma.user.findUnique.mockResolvedValue({ id: 7, role: 'TUTOR' });
    prisma.session.findUnique.mockResolvedValue(null);

    const req = mockReq({ params: { id: '21' }, body: { decision: 'ACCEPT' } });
    const res = mockRes();
    const next = jest.fn();

    await respondToCoverOffer(req, res, next);
    await flushMicrotasks();

    expect(next).toHaveBeenCalledWith(
      expect.objectContaining({ statusCode: 404, message: 'Session not found. Please check if the session exists' }),
    );
    expect(prisma.sessionVolunteer.update).not.toHaveBeenCalled();
  });

  test('returns 409 when the session left the offered state', async () => {
    prisma.user.findUnique.mockResolvedValue({ id: 7, role: 'TUTOR' });
    prisma.session.findUnique.mockResolvedValue(offeredSession({ status: 'UNASSIGNED' }));

    const req = mockReq({ params: { id: '21' }, body: { decision: 'ACCEPT' } });
    const res = mockRes();
    const next = jest.fn();

    await respondToCoverOffer(req, res, next);
    await flushMicrotasks();

    expect(next).toHaveBeenCalledWith(
      expect.objectContaining({ statusCode: 409, message: 'This session has no cover offer awaiting a response' }),
    );
    expect(prisma.sessionVolunteer.update).not.toHaveBeenCalled();
  });

  test('returns 409 when the offer record disappeared', async () => {
    prisma.user.findUnique.mockResolvedValue({ id: 7, role: 'TUTOR' });
    prisma.session.findUnique.mockResolvedValue(offeredSession({ volunteerRequest: null }));

    const req = mockReq({ params: { id: '21' }, body: { decision: 'ACCEPT' } });
    const res = mockRes();
    const next = jest.fn();

    await respondToCoverOffer(req, res, next);
    await flushMicrotasks();

    expect(next).toHaveBeenCalledWith(
      expect.objectContaining({ statusCode: 409, message: 'This session has no cover offer awaiting a response' }),
    );
    expect(prisma.sessionVolunteer.update).not.toHaveBeenCalled();
  });

  test('returns 409 when the offer was already answered', async () => {
    prisma.user.findUnique.mockResolvedValue({ id: 7, role: 'TUTOR' });
    prisma.session.findUnique.mockResolvedValue(
      offeredSession({ volunteerRequest: { id: 5, sessionId: 21, userId: 7, status: 'PENDING' } }),
    );

    const req = mockReq({ params: { id: '21' }, body: { decision: 'ACCEPT' } });
    const res = mockRes();
    const next = jest.fn();

    await respondToCoverOffer(req, res, next);
    await flushMicrotasks();

    expect(next).toHaveBeenCalledWith(
      expect.objectContaining({ statusCode: 409, message: 'This session has no cover offer awaiting a response' }),
    );
    expect(prisma.sessionVolunteer.update).not.toHaveBeenCalled();
  });

  test('returns 403 when the responder is not the nominee', async () => {
    prisma.user.findUnique.mockResolvedValue({ id: 99, role: 'TUTOR' });
    prisma.session.findUnique.mockResolvedValue(offeredSession());

    const req = mockReq({ params: { id: '21' }, body: { decision: 'ACCEPT' } });
    const res = mockRes();
    const next = jest.fn();

    await respondToCoverOffer(req, res, next);
    await flushMicrotasks();

    expect(next).toHaveBeenCalledWith(
      expect.objectContaining({ statusCode: 403, message: 'Only the tutor the session was offered to can respond' }),
    );
    expect(prisma.sessionVolunteer.update).not.toHaveBeenCalled();
  });

  test('accepting moves the request to PENDING for the lecturer', async () => {
    prisma.user.findUnique.mockResolvedValue({ id: 7, role: 'TUTOR' });
    prisma.session.findUnique.mockResolvedValue(offeredSession());
    const record = { id: 5, sessionId: 21, userId: 7, status: 'PENDING' };
    prisma.sessionVolunteer.update.mockResolvedValue(record);
    const updatedSession = { id: 21, status: 'PENDING' };
    prisma.session.update.mockResolvedValue(updatedSession);

    const req = mockReq({ params: { id: '21' }, body: { decision: 'ACCEPT' } });
    const res = mockRes();
    const next = jest.fn();

    await respondToCoverOffer(req, res, next);
    await flushMicrotasks();

    // The accepted offer reaches the exact same decision point as a
    // self-volunteered request — decideVolunteerRequest takes it from here.
    expect(prisma.sessionVolunteer.update).toHaveBeenCalledWith({
      where: { sessionId: 21 },
      data: { status: 'PENDING' },
    });
    expect(prisma.session.update).toHaveBeenCalledWith({
      where: { id: 21 },
      data: { status: 'PENDING' },
    });
    expect(res.json).toHaveBeenCalledWith({
      decision: 'ACCEPT',
      volunteerRequest: record,
      session: updatedSession,
    });
    expect(next).not.toHaveBeenCalled();
  });

  test('declining closes the offer and returns the session to the open pool', async () => {
    prisma.user.findUnique.mockResolvedValue({ id: 7, role: 'TUTOR' });
    prisma.session.findUnique.mockResolvedValue(offeredSession());
    const record = { id: 5, sessionId: 21, userId: 7, status: 'REJECTED' };
    prisma.sessionVolunteer.update.mockResolvedValue(record);
    const updatedSession = { id: 21, status: 'UNASSIGNED' };
    prisma.session.update.mockResolvedValue(updatedSession);

    const req = mockReq({ params: { id: '21' }, body: { decision: 'DECLINE' } });
    const res = mockRes();
    const next = jest.fn();

    await respondToCoverOffer(req, res, next);
    await flushMicrotasks();

    // The declined record stays for history (replaceable) while other tutors
    // can volunteer for the session again.
    expect(prisma.sessionVolunteer.update).toHaveBeenCalledWith({
      where: { sessionId: 21 },
      data: { status: 'REJECTED' },
    });
    expect(prisma.session.update).toHaveBeenCalledWith({
      where: { id: 21 },
      data: { status: 'UNASSIGNED' },
    });
    expect(res.json).toHaveBeenCalledWith({
      decision: 'DECLINE',
      volunteerRequest: record,
      session: updatedSession,
    });
    expect(next).not.toHaveBeenCalled();
  });
});

// ════════════════════════════════════════════════════════════════════════
// cancelCoverOffer — the excuser withdraws the offer before the nominee answers
// ════════════════════════════════════════════════════════════════════════
describe('cancelCoverOffer', () => {
  test('returns 400 when the session id is invalid', async () => {
    const req = mockReq({ params: { id: 'abc' } });
    const res = mockRes();
    const next = jest.fn();

    await cancelCoverOffer(req, res, next);
    await flushMicrotasks();

    expect(next).toHaveBeenCalledWith(
      expect.objectContaining({ statusCode: 400, message: 'Invalid session id' }),
    );
    expect(prisma.user.findUnique).not.toHaveBeenCalled();
  });

  test('returns 404 when the requesting user does not exist', async () => {
    prisma.user.findUnique.mockResolvedValue(null);

    const req = mockReq({ params: { id: '21' } });
    const res = mockRes();
    const next = jest.fn();

    await cancelCoverOffer(req, res, next);
    await flushMicrotasks();

    expect(next).toHaveBeenCalledWith(
      expect.objectContaining({ statusCode: 404, message: 'User not found. Please check if the user exists' }),
    );
    expect(prisma.session.findUnique).not.toHaveBeenCalled();
  });

  test('returns 403 when the requesting user is not a tutor', async () => {
    prisma.user.findUnique.mockResolvedValue({ id: 1, role: 'STUDENT' });

    const req = mockReq({ params: { id: '21' } });
    const res = mockRes();
    const next = jest.fn();

    await cancelCoverOffer(req, res, next);
    await flushMicrotasks();

    expect(next).toHaveBeenCalledWith(
      expect.objectContaining({ statusCode: 403, message: 'Only tutors can withdraw cover offers' }),
    );
    expect(prisma.session.findUnique).not.toHaveBeenCalled();
  });

  test('returns 404 when the session does not exist', async () => {
    prisma.user.findUnique.mockResolvedValue({ id: 1, role: 'TUTOR' });
    prisma.session.findUnique.mockResolvedValue(null);

    const req = mockReq({ params: { id: '21' } });
    const res = mockRes();
    const next = jest.fn();

    await cancelCoverOffer(req, res, next);
    await flushMicrotasks();

    expect(next).toHaveBeenCalledWith(
      expect.objectContaining({ statusCode: 404, message: 'Session not found. Please check if the session exists' }),
    );
    expect(prisma.sessionVolunteer.update).not.toHaveBeenCalled();
  });

  test('returns 409 when the session is no longer offered', async () => {
    prisma.user.findUnique.mockResolvedValue({ id: 1, role: 'TUTOR' });
    prisma.session.findUnique.mockResolvedValue(offeredSession({ status: 'PENDING' }));

    const req = mockReq({ params: { id: '21' } });
    const res = mockRes();
    const next = jest.fn();

    await cancelCoverOffer(req, res, next);
    await flushMicrotasks();

    expect(next).toHaveBeenCalledWith(
      expect.objectContaining({ statusCode: 409, message: 'This session has no cover offer waiting for a response' }),
    );
    expect(prisma.sessionVolunteer.update).not.toHaveBeenCalled();
  });

  test('returns 409 when the offer record is missing', async () => {
    prisma.user.findUnique.mockResolvedValue({ id: 1, role: 'TUTOR' });
    prisma.session.findUnique.mockResolvedValue(offeredSession({ volunteerRequest: null }));

    const req = mockReq({ params: { id: '21' } });
    const res = mockRes();
    const next = jest.fn();

    await cancelCoverOffer(req, res, next);
    await flushMicrotasks();

    expect(next).toHaveBeenCalledWith(
      expect.objectContaining({ statusCode: 409, message: 'This session has no cover offer waiting for a response' }),
    );
    expect(prisma.sessionVolunteer.update).not.toHaveBeenCalled();
  });

  test('returns 409 when the offer already moved past the nominee', async () => {
    prisma.user.findUnique.mockResolvedValue({ id: 1, role: 'TUTOR' });
    prisma.session.findUnique.mockResolvedValue(
      offeredSession({ volunteerRequest: { id: 5, sessionId: 21, userId: 7, status: 'PENDING' } }),
    );

    const req = mockReq({ params: { id: '21' } });
    const res = mockRes();
    const next = jest.fn();

    await cancelCoverOffer(req, res, next);
    await flushMicrotasks();

    // Once accepted, the request sits with the lecturer and cannot be pulled
    // back by the excuser.
    expect(next).toHaveBeenCalledWith(
      expect.objectContaining({ statusCode: 409, message: 'This session has no cover offer waiting for a response' }),
    );
    expect(prisma.sessionVolunteer.update).not.toHaveBeenCalled();
  });

  test('returns 403 when the requester did not excuse the session', async () => {
    prisma.user.findUnique.mockResolvedValue({ id: 9, role: 'TUTOR' });
    prisma.session.findUnique.mockResolvedValue(offeredSession());

    const req = mockReq({ params: { id: '21' } });
    const res = mockRes();
    const next = jest.fn();

    await cancelCoverOffer(req, res, next);
    await flushMicrotasks();

    expect(next).toHaveBeenCalledWith(
      expect.objectContaining({ statusCode: 403, message: 'Only the tutor who excused this session can withdraw the offer' }),
    );
    expect(prisma.sessionVolunteer.update).not.toHaveBeenCalled();
  });

  test('withdrawing cancels the offer record and reopens the session', async () => {
    prisma.user.findUnique.mockResolvedValue({ id: 1, role: 'TUTOR' });
    prisma.session.findUnique.mockResolvedValue(offeredSession());
    const record = { id: 5, sessionId: 21, userId: 7, status: 'CANCELLED' };
    prisma.sessionVolunteer.update.mockResolvedValue(record);
    const updatedSession = { id: 21, status: 'UNASSIGNED' };
    prisma.session.update.mockResolvedValue(updatedSession);

    const req = mockReq({ params: { id: '21' } });
    const res = mockRes();
    const next = jest.fn();

    await cancelCoverOffer(req, res, next);
    await flushMicrotasks();

    expect(prisma.sessionVolunteer.update).toHaveBeenCalledWith({
      where: { sessionId: 21 },
      data: { status: 'CANCELLED' },
    });
    expect(prisma.session.update).toHaveBeenCalledWith({
      where: { id: 21 },
      data: { status: 'UNASSIGNED' },
    });
    expect(res.json).toHaveBeenCalledWith({ volunteerRequest: record, session: updatedSession });
    expect(next).not.toHaveBeenCalled();
  });
});
