// Mock the Prisma client before requiring the controller
jest.mock('../prisma/client', () => ({
  course: { findMany: jest.fn(), findUnique: jest.fn(), count: jest.fn() },
  event: { findMany: jest.fn() },
  tutorAssignment: { findMany: jest.fn() },
  timesheetEntry: { aggregate: jest.fn() },
}));

const prisma = require('../prisma/client');
const {
  clearPublicCache,
  getPublicCourses,
  getPublicSchedule,
  getLiveSessions,
  getPublicStats,
  getPublicCalendar,
} = require('../controllers/public');

// catchAsync does not `return` the inner promise — flushMicrotasks waits
// for the background async work to settle before assertions run.
function flushMicrotasks() {
  return new Promise((resolve) => setImmediate(resolve));
}

function mockRes() {
  const res = {};
  res.status = jest.fn().mockReturnValue(res);
  res.json = jest.fn().mockReturnValue(res);
  res.send = jest.fn().mockReturnValue(res);
  res.end = jest.fn().mockReturnValue(res);
  res.set = jest.fn().mockReturnValue(res);
  return res;
}

const slot = (dayOfWeek, startMinute, endMinute, venue = null) => ({
  dayOfWeek,
  venue,
  sessionType: null,
  timeSlot: { startMinute, endMinute },
});

beforeEach(() => {
  jest.clearAllMocks();
  clearPublicCache();
});

afterEach(() => {
  jest.useRealTimers();
});

describe('getPublicCourses', () => {
  test('returns the discovery list with weekly hours, no personal data', async () => {
    prisma.course.findMany.mockResolvedValue([
      {
        courseCode: 'COMS3007',
        courseName: 'Machine Learning',
        slots: [slot(0, 480, 540), slot(2, 600, 660)],
      },
      {
        courseCode: 'COMS0015',
        courseName: 'Data Structures',
        slots: [slot(1, 480, 540)],
      },
    ]);

    const res = mockRes();
    await getPublicCourses({}, res, jest.fn());
    await flushMicrotasks();

    expect(res.status).toHaveBeenCalledWith(200);
    const body = res.json.mock.calls[0][0];
    expect(body.courses).toEqual([
      { courseCode: 'COMS3007', courseName: 'Machine Learning', weeklySlots: 2, weeklyHours: 2 },
      { courseCode: 'COMS0015', courseName: 'Data Structures', weeklySlots: 1, weeklyHours: 1 },
    ]);
    expect(JSON.stringify(body)).not.toContain('userId');
    expect(JSON.stringify(body)).not.toContain('email');
  });

  test('serves the second call within the TTL from cache', async () => {
    prisma.course.findMany.mockResolvedValue([]);

    const res = mockRes();
    await getPublicCourses({}, res, jest.fn());
    await getPublicCourses({}, res, jest.fn());
    await flushMicrotasks();

    expect(prisma.course.findMany).toHaveBeenCalledTimes(1);
    expect(res.json).toHaveBeenCalledTimes(2);
  });
});

describe('getPublicSchedule', () => {
  test('returns the weekly pattern with day names and labels', async () => {
    prisma.course.findUnique.mockResolvedValue({
      courseCode: 'COMS3007',
      courseName: 'Machine Learning',
      slots: [slot(0, 480, 540, 'CH-3'), slot(2, 600, 660)],
    });

    const req = { params: { courseCode: 'coms3007' } }; // lower-case in, upper-case lookup
    const res = mockRes();
    await getPublicSchedule(req, res, jest.fn());
    await flushMicrotasks();

    expect(prisma.course.findUnique).toHaveBeenCalledWith(
      expect.objectContaining({ where: { courseCode: 'COMS3007' } }),
    );
    const body = res.json.mock.calls[0][0];
    expect(body.courseCode).toBe('COMS3007');
    expect(body.schedule[0]).toEqual({
      dayOfWeek: 0,
      day: 'Monday',
      start: '08:00',
      end: '09:00',
      venue: 'CH-3',
      sessionType: null,
    });
  });

  test('returns 404 for an unknown course', async () => {
    prisma.course.findUnique.mockResolvedValue(null);

    const next = jest.fn();
    await getPublicSchedule({ params: { courseCode: 'NOPE101' } }, mockRes(), next);
    await flushMicrotasks();

    expect(next).toHaveBeenCalledWith(expect.objectContaining({ statusCode: 404 }));
  });
});

describe('getLiveSessions', () => {
  // Wednesday 2026-09-16, 10:30 UTC — schema day 2
  const NOW = new Date('2026-09-16T10:30:00.000Z');
  const today = (d) => new Date(`2026-09-${d}T00:00:00.000Z`);

  function seedEvents(events) {
    prisma.event.findMany.mockImplementation(({ where }) =>
      Promise.resolve(events.filter((e) => e.date >= where.date.gte && e.date < where.date.lt)),
    );
  }

  function courseOf(slots) {
    return { courseCode: 'COMS3007', courseName: 'Machine Learning', slots };
  }

  beforeEach(() => {
    jest.useFakeTimers({ doNotFake: ['setImmediate', 'nextTick', 'queueMicrotask'] });
    jest.setSystemTime(NOW);
  });

  test('splits today events into live and next, drops ended sessions', async () => {
    seedEvents([
      // live right now: Wednesday 10:00-11:00
      { id: 1, date: today('16'), description: 'tutoring', course: courseOf([slot(2, 600, 660, 'CH-3')]) },
      // later today: 14:00-15:00 -> next
      { id: 2, date: today('16'), description: 'tutoring', course: courseOf([slot(2, 840, 900, 'F1')]) },
      // tomorrow (Thursday) morning -> next
      { id: 3, date: today('17'), description: 'marking', course: courseOf([slot(3, 540, 600)]) },
      // ended this morning at 09:00 -> excluded
      { id: 4, date: today('16'), description: 'tutoring', course: courseOf([slot(2, 480, 540)]) },
      // weekend event -> excluded (no schema weekday)
      { id: 5, date: today('19'), description: 'tutoring', course: courseOf([slot(2, 600, 660)]) },
    ]);

    const res = mockRes();
    await getLiveSessions({}, res, jest.fn());
    await flushMicrotasks();

    const body = res.json.mock.calls[0][0];
    expect(body.generatedAt).toBe(NOW.toISOString());
    expect(body.live).toEqual([
      {
        courseCode: 'COMS3007',
        courseName: 'Machine Learning',
        description: 'tutoring',
        venue: 'CH-3',
        start: '10:00',
        end: '11:00',
      },
    ]);
    expect(body.next.map((n) => n.date)).toEqual(['2026-09-16', '2026-09-17']);
    expect(body.next[0]).toMatchObject({ start: '14:00', end: '15:00', venue: 'F1' });
    expect(body.next[1]).toMatchObject({ start: '09:00', end: '10:00', description: 'marking' });
  });

  test('returns empty arrays when no events exist', async () => {
    seedEvents([]);

    const res = mockRes();
    await getLiveSessions({}, res, jest.fn());
    await flushMicrotasks();

    const body = res.json.mock.calls[0][0];
    expect(body.live).toEqual([]);
    expect(body.next).toEqual([]);
  });
});

describe('getPublicStats', () => {
  test('aggregates counts and approved hours without personal data', async () => {
    prisma.course.count.mockResolvedValue(38);
    prisma.tutorAssignment.findMany.mockResolvedValue([{ userId: 1 }, { userId: 7 }, { userId: 12 }]);
    prisma.timesheetEntry.aggregate.mockResolvedValue({ _sum: { duration: 4200 } });

    const res = mockRes();
    await getPublicStats({}, res, jest.fn());
    await flushMicrotasks();

    expect(res.status).toHaveBeenCalledWith(200);
    const body = res.json.mock.calls[0][0];
    expect(body.coursesWithTutoring).toBe(38);
    expect(body.activeTutors).toBe(3);
    expect(body.approvedHoursThisYear).toBe(4200);
    expect(body.generatedAt).toEqual(expect.any(String));
  });

  test('treats a null sum as zero hours', async () => {
    prisma.course.count.mockResolvedValue(0);
    prisma.tutorAssignment.findMany.mockResolvedValue([]);
    prisma.timesheetEntry.aggregate.mockResolvedValue({ _sum: { duration: null } });

    const res = mockRes();
    await getPublicStats({}, res, jest.fn());
    await flushMicrotasks();

    expect(res.json.mock.calls[0][0].approvedHoursThisYear).toBe(0);
  });
});

describe('getPublicCalendar', () => {
  test('renders an RFC 5545 feed with CRLF line endings', async () => {
    const eventDate = new Date('2026-09-21T00:00:00.000Z'); // Monday after fake "now"
    prisma.course.findUnique.mockResolvedValue({
      id: 1,
      courseCode: 'COMS3007',
      courseName: 'Machine Learning',
      slots: [slot(0, 480, 540, 'CH-3')],
    });
    prisma.event.findMany.mockResolvedValue([
      { id: 42, date: eventDate, description: 'tutoring', updatedAt: eventDate },
    ]);

    const res = mockRes();
    await getPublicCalendar({ params: { filename: 'coms3007.ics' } }, res, jest.fn());
    await flushMicrotasks();

    expect(prisma.course.findUnique).toHaveBeenCalledWith(
      expect.objectContaining({ where: { courseCode: 'COMS3007' } }),
    );
    // regression: the events query filters on course.id, so the select must fetch it
    expect(prisma.course.findUnique).toHaveBeenCalledWith(
      expect.objectContaining({ select: expect.objectContaining({ id: true }) }),
    );
    expect(prisma.event.findMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: expect.objectContaining({ courseId: 1 }) }),
    );
    expect(res.set).toHaveBeenCalledWith('Content-Type', 'text/calendar; charset=utf-8');
    const ics = res.send.mock.calls[0][0];
    expect(ics).toContain('BEGIN:VCALENDAR');
    expect(ics).toContain('DTSTART:20260921T080000Z');
    expect(ics).toContain('DTEND:20260921T090000Z');
    expect(ics).toContain('LOCATION:CH-3');
    expect(ics).toContain('UID:coms3007-42-1@tutorflow');
    expect(ics).toContain('END:VCALENDAR');
    expect(ics).toContain('\r\n');
  });

  test('returns 404 for a feed without the .ics suffix', async () => {
    const next = jest.fn();
    await getPublicCalendar({ params: { filename: 'COMS3007' } }, mockRes(), next);
    await flushMicrotasks();

    expect(next).toHaveBeenCalledWith(expect.objectContaining({ statusCode: 404 }));
    expect(prisma.course.findUnique).not.toHaveBeenCalled();
  });

  test('returns 404 for an unknown course', async () => {
    prisma.course.findUnique.mockResolvedValue(null);

    const next = jest.fn();
    await getPublicCalendar({ params: { filename: 'NOPE101.ics' } }, mockRes(), next);
    await flushMicrotasks();

    expect(next).toHaveBeenCalledWith(expect.objectContaining({ statusCode: 404 }));
  });
});
