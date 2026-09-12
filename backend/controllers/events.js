const prisma = require('../prisma/client');
const catchAsync = require('../utils/catchAsync');
const { getTutorEventClaimMonths } = require('../utils/systemSettings');
const { monthsBefore, dayOfWeekFor, deriveTimes, timesTotalHours } = require('../utils/claimRules');

// ── Helpers ──────────────────────────────────────────────────────────────────

const getUser = async (firebaseUid) => {
  const user = await prisma.user.findUnique({ where: { firebaseUid } });
  if (!user) {
    const error = new Error('User not found. Please check if the user exists');
    error.statusCode = 404;
    throw error;
  }
  return user;
};

const VALID_DESCRIPTIONS = ['tutoring', 'marking', 'invigilation', 'admin'];

// Parses a YYYY-MM-DD string into a UTC-midnight Date so the weekday never
// drifts with the server's timezone
const parseEventDate = (value) => {
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return null;
  const date = new Date(`${value}T00:00:00.000Z`);
  return Number.isNaN(date.getTime()) ? null : date;
};

// Everything the event serialization needs from the event's course. Used both as
// the nested course select of EVENT_INCLUDE and directly as the select of the
// standalone course lookup in validateEventPayload.
const COURSE_SELECT = {
  id: true,
  courseCode: true,
  courseName: true,
  userId: true,
  user: { select: { firstName: true, lastName: true } },
  slots: {
    include: { timeSlot: true },
    orderBy: [{ dayOfWeek: 'asc' }, { timeSlot: { startMinute: 'asc' } }],
  },
};

const EVENT_INCLUDE = {
  course: { select: COURSE_SELECT },
};

const serializeEvent = (event, user) => ({
  id: event.id,
  courseId: event.courseId,
  courseCode: event.course?.courseCode || null,
  courseName: event.course?.courseName || null,
  date: event.date,
  description: event.description,
  lecturer: event.course?.user ? `${event.course.user.firstName} ${event.course.user.lastName}` : null,
  times: deriveTimes(event.course?.slots || [], dayOfWeekFor(event.date)),
  // The course's full weekly slots so the details page can render the read-only grid
  courseSlots: (event.course?.slots || []).map((slot) => ({
    dayOfWeek: slot.dayOfWeek,
    timeSlotId: slot.timeSlotId,
    startMinute: slot.timeSlot.startMinute,
    endMinute: slot.timeSlot.endMinute,
  })),
  // Only the lecturer who created the course may edit or delete the event
  canEdit: Boolean(user && user.role.toUpperCase() === 'LECTURER' && event.course?.userId === user.id),
  createdAt: event.createdAt,
  updatedAt: event.updatedAt,
});

// Validates the shared event payload. Returns { error } on failure or
// { course, eventDate, description } on success — the course is loaded with its
// slots so the caller can derive the times and check weekday coverage.
const validateEventPayload = async (user, body) => {
  const { courseId, date, description } = body;

  const parsedCourseId = Number(courseId);
  if (!Number.isInteger(parsedCourseId)) {
    const error = new Error('courseId must be a number');
    error.statusCode = 400;
    return { error };
  }

  if (!VALID_DESCRIPTIONS.includes(String(description || '').toLowerCase())) {
    const error = new Error(`description must be one of: ${VALID_DESCRIPTIONS.join(', ')}`);
    error.statusCode = 400;
    return { error };
  }

  const eventDate = parseEventDate(date);
  if (!eventDate) {
    const error = new Error('date must be a valid date in YYYY-MM-DD format');
    error.statusCode = 400;
    return { error };
  }

  const course = await prisma.course.findUnique({
    where: { id: parsedCourseId },
    select: COURSE_SELECT,
  });
  if (!course) {
    const error = new Error('Course not found');
    error.statusCode = 404;
    return { error };
  }

  // Events can only be created for courses the lecturer created themselves
  if (course.userId !== user.id) {
    const error = new Error('You can only create events for courses you have created');
    error.statusCode = 403;
    return { error };
  }

  // An event only makes sense on a day the course actually has tutoring slots
  const dayOfWeek = dayOfWeekFor(eventDate);
  if (dayOfWeek === null || deriveTimes(course.slots, dayOfWeek).length === 0) {
    const error = new Error('The course has no tutoring timeslots on that day of the week');
    error.statusCode = 400;
    return { error };
  }

  return { course, eventDate, description: String(description).toLowerCase() };
};

// ── GET /events ── List the events visible to the current user ───────────────

exports.getEvents = catchAsync(async (req, res, next) => {
  const user = await getUser(req.user.user_id);
  const role = user.role.toUpperCase();

  // Tutors see events for the courses they have been allocated to, lecturers the
  // events of the courses they created, organisers and admins see everything
  let where;
  if (role === 'TUTOR') {
    where = { course: { assignments: { some: { userId: user.id } } } };
  } else if (role === 'LECTURER') {
    where = { course: { userId: user.id } };
  } else if (role === 'ORGANISER' || role === 'ADMIN') {
    where = {};
  } else {
    const error = new Error('Only tutors, lecturers and organisers can view events');
    error.statusCode = 403;
    return next(error);
  }

  const events = await prisma.event.findMany({
    where,
    include: EVENT_INCLUDE,
    orderBy: [{ date: 'asc' }, { id: 'asc' }],
  });

  res.status(200).json(events.map((event) => serializeEvent(event, user)));
});

// ── GET /events/claimable ── Past events a tutor can still claim ────────────

exports.getClaimableEvents = catchAsync(async (req, res, next) => {
  const user = await getUser(req.user.user_id);
  const role = user.role.toUpperCase();
  if (role !== 'TUTOR') {
    const error = new Error('Only tutors can claim events');
    error.statusCode = 403;
    return next(error);
  }

  const now = new Date();
  const claimMonths = await getTutorEventClaimMonths();

  // Past events on the tutor's allocated courses that nobody has claimed yet
  // (the unique TimesheetEntry.eventId holds the claim) and that still sit inside
  // the organiser-set claim window — while unset, every past event is claimable
  const events = await prisma.event.findMany({
    where: {
      course: { assignments: { some: { userId: user.id } } },
      date: {
        lt: now,
        ...(claimMonths !== null ? { gte: monthsBefore(now, claimMonths) } : {}),
      },
      claims: { none: {} },
    },
    include: EVENT_INCLUDE,
    orderBy: [{ date: 'desc' }, { id: 'asc' }],
  });

  // The event data auto-populates an entire timesheet entry: course, date,
  // description, supervisor (the course's lecturer) and the round-up duration
  res.status(200).json(
    events
      .map((event) => {
        const times = deriveTimes(event.course?.slots || [], dayOfWeekFor(event.date));
        if (times.length === 0) return null; // the course's weekday slots were removed since
        return {
          id: event.id,
          courseId: event.courseId,
          courseCode: event.course?.courseCode || null,
          courseName: event.course?.courseName || null,
          date: event.date,
          description: event.description,
          lecturer: event.course?.user
            ? `${event.course.user.firstName} ${event.course.user.lastName}`
            : null,
          supervisorId: event.course?.userId ?? null,
          times,
          duration: timesTotalHours(times),
        };
      })
      .filter(Boolean)
  );
});

// ── GET /events/my-courses ── Courses the lecturer can create events for ─────

exports.getMyCourses = catchAsync(async (req, res, next) => {
  const user = await getUser(req.user.user_id);
  const role = user.role.toUpperCase();
  if (role !== 'LECTURER') {
    const error = new Error('Only lecturers can create events');
    error.statusCode = 403;
    return next(error);
  }

  const courses = await prisma.course.findMany({
    where: { userId: user.id },
    select: {
      id: true,
      courseCode: true,
      courseName: true,
      slots: COURSE_SELECT.slots,
    },
    orderBy: { courseCode: 'asc' },
  });

  // The form derives the event time client-side from these slots and renders
  // the course's read-only slot grid
  res.status(200).json(
    courses.map((course) => ({
      id: course.id,
      courseCode: course.courseCode,
      courseName: course.courseName,
      slots: course.slots.map((slot) => ({
        dayOfWeek: slot.dayOfWeek,
        timeSlotId: slot.timeSlotId,
        startMinute: slot.timeSlot.startMinute,
        endMinute: slot.timeSlot.endMinute,
      })),
    }))
  );
});

// ── POST /events ── Create an event (own course only) ────────────────────────

exports.createEvent = catchAsync(async (req, res, next) => {
  const user = await getUser(req.user.user_id);
  const role = user.role.toUpperCase();
  if (role !== 'LECTURER') {
    const error = new Error('Only lecturers can create events');
    error.statusCode = 403;
    return next(error);
  }

  const { error, course, eventDate, description } = await validateEventPayload(user, req.body);
  if (error) return next(error);

  // One event per course per date — the same course on the same day would
  // duplicate the tutoring session
  const duplicate = await prisma.event.findFirst({
    where: { courseId: course.id, date: eventDate },
  });
  if (duplicate) {
    const error = new Error('An event already exists for this course on that date');
    error.statusCode = 409;
    return next(error);
  }

  const event = await prisma.event.create({
    data: {
      courseId: course.id,
      date: eventDate,
      description,
    },
    include: EVENT_INCLUDE,
  });

  res.status(201).json(serializeEvent(event, user));
});

// ── GET /events/:id ── Single event for the details and edit pages ───────────

exports.getEvent = catchAsync(async (req, res, next) => {
  const user = await getUser(req.user.user_id);
  const role = user.role.toUpperCase();

  const eventId = Number(req.params.id);
  if (!Number.isInteger(eventId)) {
    const error = new Error('Event ID must be a number');
    error.statusCode = 400;
    return next(error);
  }

  const event = await prisma.event.findUnique({
    where: { id: eventId },
    include: EVENT_INCLUDE,
  });
  if (!event) {
    const error = new Error('Event not found');
    error.statusCode = 404;
    return next(error);
  }

  // Same visibility rules as the list: tutors see events for their allocated
  // courses, lecturers the events of the courses they created, organisers and
  // admins see everything. Editing stays limited to the owning lecturer via
  // the canEdit flag on the response.
  if (role === 'TUTOR') {
    const assignment = await prisma.tutorAssignment.findFirst({
      where: { userId: user.id, courseId: event.courseId },
    });
    if (!assignment) {
      const error = new Error('You can only view events for courses you have been allocated to');
      error.statusCode = 403;
      return next(error);
    }
  } else if (role === 'LECTURER') {
    if (event.course.userId !== user.id) {
      const error = new Error('You can only view events for courses you have created');
      error.statusCode = 403;
      return next(error);
    }
  } else if (role !== 'ORGANISER' && role !== 'ADMIN') {
    const error = new Error('Only tutors, lecturers and organisers can view events');
    error.statusCode = 403;
    return next(error);
  }

  res.status(200).json(serializeEvent(event, user));
});

// ── PUT /events/:id ── Update an event (own course only) ─────────────────────

exports.updateEvent = catchAsync(async (req, res, next) => {
  const user = await getUser(req.user.user_id);
  const role = user.role.toUpperCase();
  if (role !== 'LECTURER') {
    const error = new Error('Only lecturers can edit events');
    error.statusCode = 403;
    return next(error);
  }

  const eventId = Number(req.params.id);
  if (!Number.isInteger(eventId)) {
    const error = new Error('Event ID must be a number');
    error.statusCode = 400;
    return next(error);
  }

  const existing = await prisma.event.findUnique({
    where: { id: eventId },
    include: EVENT_INCLUDE,
  });
  if (!existing) {
    const error = new Error('Event not found');
    error.statusCode = 404;
    return next(error);
  }
  if (existing.course.userId !== user.id) {
    const error = new Error('You can only edit events for courses you have created');
    error.statusCode = 403;
    return next(error);
  }

  const { error, course, eventDate, description } = await validateEventPayload(user, req.body);
  if (error) return next(error);

  // The duplicate check excludes the event being edited
  const duplicate = await prisma.event.findFirst({
    where: { courseId: course.id, date: eventDate, id: { not: eventId } },
  });
  if (duplicate) {
    const error = new Error('An event already exists for this course on that date');
    error.statusCode = 409;
    return next(error);
  }

  const updated = await prisma.event.update({
    where: { id: eventId },
    data: {
      courseId: course.id,
      date: eventDate,
      description,
    },
    include: EVENT_INCLUDE,
  });

  res.status(200).json(serializeEvent(updated, user));
});

