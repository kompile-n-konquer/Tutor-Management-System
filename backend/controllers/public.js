const prisma = require('../prisma/client');
const catchAsync = require('../utils/catchAsync');
const { slotHours, dayOfWeekFor } = require('../utils/claimRules');

// ── Public API cache ─────────────────────────────────────────────────────────
// These endpoints are unauthenticated, so anyone can hammer them. A tiny
// in-memory cache with a short TTL makes abuse pointless while keeping the
// data fresh enough for browsing. The promise is cached (not its result) so
// concurrent misses share one query, and a rejected query is evicted so the
// next request retries instead of serving a cached failure.
const CACHE_TTL_MS = 60 * 1000;
const cache = new Map();

function cached(key, producer) {
  const entry = cache.get(key);
  if (entry && Date.now() - entry.at < CACHE_TTL_MS) {
    return entry.value;
  }
  const value = producer();
  cache.set(key, { at: Date.now(), value });
  value.catch(() => cache.delete(key));
  return value;
}

// Test hook: the suite clears the cache between cases so each test starts cold
function clearPublicCache() {
  cache.clear();
}

// ── Shared helpers ───────────────────────────────────────────────────────────

const DAY_NAMES = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday'];

const minutesToLabel = (minutes) => {
  const hours = Math.floor(minutes / 60);
  const mins = minutes % 60;
  return `${String(hours).padStart(2, '0')}:${String(mins).padStart(2, '0')}`;
};

// The course's slots on one weekday as display-ready time ranges, ordered by
// start time. Same derived-never-stored approach as the events controller —
// venue/sessionType ride along because the public feed exposes them.
const slotsForDay = (courseSlots, dayOfWeek) =>
  courseSlots
    .filter((slot) => slot.dayOfWeek === dayOfWeek)
    .map((slot) => ({
      startMinute: slot.timeSlot.startMinute,
      endMinute: slot.timeSlot.endMinute,
      venue: slot.venue,
      sessionType: slot.sessionType,
    }))
    .sort((a, b) => a.startMinute - b.startMinute);

const courseSlotsInclude = {
  slots: {
    include: { timeSlot: true },
    orderBy: [{ dayOfWeek: 'asc' }, { timeSlot: { startMinute: 'asc' } }],
  },
};

const isoDate = (date) => date.toISOString().split('T')[0];
const httpDate = (date) => isoDate(date).replace(/-/g, '');

// ── GET /public/courses — discover courses offering tutoring ─────────────────

exports.getPublicCourses = catchAsync(async (req, res, next) => {
  const courses = await cached('courses', () =>
    prisma.course.findMany({
      select: {
        courseCode: true,
        courseName: true,
        ...courseSlotsInclude,
      },
      orderBy: { courseCode: 'asc' },
    }),
  );

  res.set('Cache-Control', 'public, max-age=60');
  res.status(200).json({
    courses: courses.map((course) => ({
      courseCode: course.courseCode,
      courseName: course.courseName,
      weeklySlots: course.slots.length,
      weeklyHours: course.slots.reduce(
        (total, slot) => total + slotHours(slot.timeSlot.startMinute, slot.timeSlot.endMinute),
        0,
      ),
    })),
  });
});

// ── GET /public/courses/:courseCode/schedule — the weekly tutoring pattern ───

exports.getPublicSchedule = catchAsync(async (req, res, next) => {
  const courseCode = String(req.params.courseCode || '').toUpperCase();

  const course = await cached(`schedule:${courseCode}`, () =>
    prisma.course.findUnique({
      where: { courseCode },
      select: {
        courseCode: true,
        courseName: true,
        ...courseSlotsInclude,
      },
    }),
  );

  if (!course) {
    const error = new Error('Course not found');
    error.statusCode = 404;
    return next(error);
  }

  res.set('Cache-Control', 'public, max-age=60');
  res.status(200).json({
    courseCode: course.courseCode,
    courseName: course.courseName,
    schedule: course.slots.map((slot) => ({
      dayOfWeek: slot.dayOfWeek,
      day: DAY_NAMES[slot.dayOfWeek] ?? null,
      start: minutesToLabel(slot.timeSlot.startMinute),
      end: minutesToLabel(slot.timeSlot.endMinute),
      venue: slot.venue,
      sessionType: slot.sessionType,
    })),
  });
});

// ── GET /public/sessions/live — tutoring on right now and coming up ─────────
// Built purely from lecturer-created Events (concrete dated sessions); the
// times come from the course's slots on each event's weekday, exactly like
// the events controller derives them.

const LIVE_HORIZON_DAYS = 14;
const NEXT_LIMIT = 10;

exports.getLiveSessions = catchAsync(async (req, res, next) => {
  const now = new Date();
  const startOfToday = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));
  const horizon = new Date(startOfToday.getTime() + LIVE_HORIZON_DAYS * 24 * 60 * 60 * 1000);

  const events = await cached('live', () =>
    prisma.event.findMany({
      where: { date: { gte: startOfToday, lt: horizon } },
      include: {
        course: { select: { courseCode: true, courseName: true, ...courseSlotsInclude } },
      },
      orderBy: [{ date: 'asc' }, { id: 'asc' }],
    }),
  );

  // Weekday via the shared claimRules helper — an event's weekday is read in
  // UTC, so the whole computation stays in UTC like the rest of the codebase
  const nowMinutes = now.getUTCHours() * 60 + now.getUTCMinutes();
  const todayMs = startOfToday.getTime();

  const sessions = [];
  for (const event of events) {
    const dayOfWeek = dayOfWeekFor(event.date);
    if (dayOfWeek === null) continue;

    const times = slotsForDay(event.course?.slots || [], dayOfWeek);
    if (times.length === 0) continue; // course slots changed since; nothing to show

    sessions.push({
      date: event.date,
      courseCode: event.course.courseCode,
      courseName: event.course.courseName,
      description: event.description,
      ranges: times.map((time) => ({
        startMinute: time.startMinute,
        endMinute: time.endMinute,
        venue: time.venue,
      })),
    });
  }

  const isToday = (session) => session.date.getTime() === todayMs;

  const live = sessions
    .filter(
      (session) =>
        isToday(session) &&
        session.ranges.some((r) => nowMinutes >= r.startMinute && nowMinutes < r.endMinute),
    )
    .flatMap((session) =>
      session.ranges
        .filter((r) => nowMinutes >= r.startMinute && nowMinutes < r.endMinute)
        .map((r) => ({
          courseCode: session.courseCode,
          courseName: session.courseName,
          description: session.description,
          venue: r.venue,
          start: minutesToLabel(r.startMinute),
          end: minutesToLabel(r.endMinute),
        })),
    );

  // Upcoming: today's not-yet-started ranges first, then future days — a range
  // already under way is reported in `live`, not repeated here. Named
  // `upcoming` — `next` is the error-callback parameter of this handler.
  const upcoming = [];
  for (const session of sessions) {
    if (isToday(session)) {
      for (const r of session.ranges) {
        if (r.startMinute > nowMinutes) {
          upcoming.push({
            courseCode: session.courseCode,
            courseName: session.courseName,
            description: session.description,
            date: isoDate(session.date),
            venue: r.venue,
            start: minutesToLabel(r.startMinute),
            end: minutesToLabel(r.endMinute),
          });
        }
      }
    } else {
      for (const r of session.ranges) {
        upcoming.push({
          courseCode: session.courseCode,
          courseName: session.courseName,
          description: session.description,
          date: isoDate(session.date),
          venue: r.venue,
          start: minutesToLabel(r.startMinute),
          end: minutesToLabel(r.endMinute),
        });
      }
    }
    if (upcoming.length >= NEXT_LIMIT) break;
  }

  res.set('Cache-Control', 'public, max-age=60');
  res.status(200).json({
    generatedAt: now.toISOString(),
    live,
    next: upcoming.slice(0, NEXT_LIMIT),
  });
});

// ── GET /public/stats — aggregate numbers about the tutoring programme ──────

exports.getPublicStats = catchAsync(async (req, res, next) => {
  const startOfYear = new Date(Date.UTC(new Date().getUTCFullYear(), 0, 1));

  const stats = await cached('stats', async () => {
    const [courseCount, tutorAssignments, approvedHours] = await Promise.all([
      prisma.course.count({ where: { slots: { some: {} } } }),
      prisma.tutorAssignment.findMany({ select: { userId: true }, distinct: ['userId'] }),
      prisma.timesheetEntry.aggregate({
        _sum: { duration: true },
        where: { status: 'APPROVED', workDate: { gte: startOfYear } },
      }),
    ]);

    return {
      coursesWithTutoring: courseCount,
      activeTutors: tutorAssignments.length,
      approvedHoursThisYear: approvedHours._sum.duration ?? 0,
    };
  });

  res.set('Cache-Control', 'public, max-age=60');
  res.status(200).json({ ...stats, generatedAt: new Date().toISOString() });
});

// ── GET /public/calendar/:courseCode.ics — subscribe in any calendar app ────
// One VEVENT per time range of each upcoming lecturer-created event, with
// CRLF line endings and text escaping as RFC 5545 requires.

const icsEscape = (text) =>
  String(text ?? '')
    .replace(/\\/g, '\\\\')
    .replace(/;/g, '\\;')
    .replace(/,/g, '\\,')
    .replace(/\r?\n/g, '\\n');

const icsDateTime = (midnightUtc, minutes) =>
  `${httpDate(midnightUtc)}T${String(Math.floor(minutes / 60)).padStart(2, '0')}${String(minutes % 60).padStart(2, '0')}00Z`;

exports.getPublicCalendar = catchAsync(async (req, res, next) => {
  const filename = String(req.params.filename || '');
  if (!filename.endsWith('.ics')) {
    const error = new Error('Calendar feeds end in .ics, e.g. /public/calendar/COMS3007.ics');
    error.statusCode = 404;
    return next(error);
  }
  const courseCode = filename.slice(0, -'.ics'.length).toUpperCase();

  const startOfToday = new Date(
    Date.UTC(new Date().getUTCFullYear(), new Date().getUTCMonth(), new Date().getUTCDate()),
  );

  const { course, events } = await cached(`ics:${courseCode}`, async () => {
    const course = await prisma.course.findUnique({
      where: { courseCode },
      // id is selected (but never sent) so the events query below can filter on it
      select: { id: true, courseCode: true, courseName: true, ...courseSlotsInclude },
    });
    if (!course) return { course: null, events: [] };

    const events = await prisma.event.findMany({
      where: { courseId: course.id, date: { gte: startOfToday } },
      orderBy: [{ date: 'asc' }, { id: 'asc' }],
    });
    return { course, events };
  });

  if (!course) {
    const error = new Error('Course not found');
    error.statusCode = 404;
    return next(error);
  }

  const lines = [
    'BEGIN:VCALENDAR',
    'VERSION:2.0',
    'PRODID:-//TutorFlow//Public Tutoring Calendar//EN',
    'CALSCALE:GREGORIAN',
    `X-WR-CALNAME:${icsEscape(`${course.courseCode} tutoring`)}`,
  ];

  let sequence = 0;
  for (const event of events) {
    const dayOfWeek = dayOfWeekFor(event.date);
    if (dayOfWeek === null) continue;

    const times = slotsForDay(course.slots, dayOfWeek);
    for (const time of times) {
      sequence += 1;
      lines.push(
        'BEGIN:VEVENT',
        `UID:${course.courseCode.toLowerCase()}-${event.id}-${sequence}@tutorflow`,
        `DTSTAMP:${icsDateTime(event.updatedAt, 0)}`,
        `DTSTART:${icsDateTime(event.date, time.startMinute)}`,
        `DTEND:${icsDateTime(event.date, time.endMinute)}`,
        `SUMMARY:${icsEscape(`${course.courseCode} ${event.description}`)}`,
        ...(time.venue ? [`LOCATION:${icsEscape(time.venue)}`] : []),
        'END:VEVENT',
      );
    }
  }

  lines.push('END:VCALENDAR');

  res.set('Cache-Control', 'public, max-age=60');
  res.set('Content-Type', 'text/calendar; charset=utf-8');
  res.set('Content-Disposition', `inline; filename="${course.courseCode}.ics"`);
  res.status(200).send(lines.join('\r\n'));
});

exports.clearPublicCache = clearPublicCache;
