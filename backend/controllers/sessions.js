const prisma = require('../prisma/client');
const catchAsync = require('../utils/catchAsync');
const { dayOfWeekFor, deriveTimes } = require('../utils/claimRules');

// Session lifecycle:
//   SCHEDULED  — derived from an Event on the tutor's assigned course (never stored)
//   UNASSIGNED — the tutor excused themselves, the session is open for volunteers
//   OFFERED    — the excusing tutor pointed the cover at one appointed tutor, who
//                has not responded yet (a directed cover offer)
//   PENDING    — a cover request (volunteer or accepted directed offer) is
//                awaiting the lecturer's approval (see SessionVolunteer)
//
// Lecturers schedule tutoring exclusively through Events (controllers/events.js):
// a tutor's upcoming sessions are derived at read time from the events on their
// assigned courses — one occurrence per course slot on the event's weekday. The
// dashboard is single-tutor: only occurrences on the requesting tutor's own
// assignment ever appear, never another tutor's parallel copy. Real Session rows
// are only written when a tutor excuses themselves from an occurrence, which
// materializes it as UNASSIGNED so the student volunteer flow can pick it up.

// The global error handler renders any error that carries a statusCode + message.
const createHttpError = (statusCode, message) => {
  const error = new Error(message);
  error.statusCode = statusCode;
  return error;
};

// An upcoming session derived from an event carries an id of the form
// e{courseSlotId}-{yyyy-mm-dd} — it identifies the event occurrence (course,
// date, slot) without a Session row existing yet. excuseSession accepts these
// ids and materializes the occurrence when the tutor excuses themselves.
const VIRTUAL_SESSION_ID_PATTERN = /^e(\d+)-(\d{4}-\d{2}-\d{2})$/;

const parseSessionId = (rawId) => {
  const sessionId = Number(rawId);
  return Number.isInteger(sessionId) ? sessionId : null;
};

// A session's actual length in hours (e.g. 1.5 for 08:00–09:30) — the real
// span of its time slot, not the whole-hour round-up timesheet claims use,
// so the dashboard's allocated hours match the session times it displays.
const sessionHours = (session) => {
  const timeSlot = session.courseSlot?.timeSlot;
  if (!timeSlot) return 0;
  const durationMinutes = timeSlot.endMinute - timeSlot.startMinute;
  if (durationMinutes <= 0) return 0;
  return Math.round((durationMinutes / 60) * 10) / 10;
};

// "Jane Doe" — falls back to the email when name parts are missing. Used in
// the human-readable reasons of cover validation failures.
const tutorDisplayName = (user) =>
  [user.firstName, user.lastName].filter(Boolean).join(' ') || user.email || 'Unknown tutor';

const formatDay = (date) => new Date(date).toISOString().split('T')[0];

const rangesOverlap = (a, b) => a.startMinute < b.endMinute && b.startMinute < a.endMinute;

// Validates that `tutor` could cover `session` — the same practical constraints
// any replacement tutor must satisfy, applied to the concrete session (course
// slot: day, timeslot and minute range):
//   1. their weekly availability covers the session's course slot
//   2. none of their busy blocks overlap the session's times
//   3. they lead no other session that double-books the same date+time
// Returns human-readable failure reasons — empty means eligible.
const validateCoverCandidate = async (session, tutor) => {
  const reasons = [];
  const { course, dayOfWeek, timeSlotId, timeSlot } = session.courseSlot;

  if (!timeSlot) {
    reasons.push(`${course.courseCode} has no tutoring timeslot on the session's day`);
    return reasons; // the checks below need the session's time range
  }
  const slot = { startMinute: timeSlot.startMinute, endMinute: timeSlot.endMinute };

  // 1. weekly availability covers the session's slot
  const availability = await prisma.availability.findMany({
    where: { userId: tutor.id, dayOfWeek, timeSlotId },
    select: { id: true },
  });
  if (availability.length === 0) {
    reasons.push('the session falls outside their weekly availability');
  }

  // 2. busy blocks clashing with the session's times
  const busyBlocks = await prisma.busyBlock.findMany({ where: { userId: tutor.id, dayOfWeek } });
  if (busyBlocks.some((block) => rangesOverlap(block, slot))) {
    reasons.push('the session clashes with one of their busy blocks');
  }

  // 3. double-booking against another session they already lead
  const overlappingSession = await prisma.session.findFirst({
    where: {
      id: { not: session.id },
      date: session.date,
      status: 'SCHEDULED',
      assignment: { userId: tutor.id },
      courseSlot: {
        timeSlot: { startMinute: { lt: slot.endMinute }, endMinute: { gt: slot.startMinute } },
      },
    },
  });
  if (overlappingSession) {
    reasons.push(`it double-books them against another session on ${formatDay(session.date)}`);
  }

  return reasons;
};

// The session shape the directed-cover pages render (mirrors the tutor
// dashboard's rows): course code/name plus the slot and its time range.
const serializeCoverSession = (session) => ({
  id: session.id,
  date: session.date,
  status: session.status,
  excuseReason: session.excuseReason ?? null,
  course: {
    courseCode: session.courseSlot.course.courseCode,
    courseName: session.courseSlot.course.courseName,
  },
  courseSlot: {
    id: session.courseSlot.id,
    dayOfWeek: session.courseSlot.dayOfWeek,
    venue: session.courseSlot.venue,
    sessionType: session.courseSlot.sessionType,
    timeSlot: session.courseSlot.timeSlot,
  },
});

exports.getUnassignedSessions = catchAsync(async (req, res, next) => {
  const requestingUser = await prisma.user.findUnique({
    where: { firebaseUid: req.user.user_id },
  });
  if (!requestingUser) {
    return next(createHttpError(404, 'User not found. Please check if the user exists'));
  }
  if (requestingUser.role !== 'TUTOR') {
    return next(createHttpError(403, 'Only tutors can volunteer for excused sessions'));
  }

  // A tutor may only cover courses where their own application mark meets the
  // course's minimum mark — the same bar used when applying to tutor a course.
  const myApplications = await prisma.application.findMany({
    where: { userId: requestingUser.id, status: { not: 'REJECTED' } },
    include: { course: { select: { id: true, minimumMark: true } } },
  });
  const myMarkByCourse = new Map(
    myApplications
      .filter((application) => application.courseMark >= application.course.minimumMark)
      .map((application) => [application.courseId, application.courseMark]),
  );

  if (myMarkByCourse.size === 0) {
    return res.json([]);
  }

  const sessions = await prisma.session.findMany({
    where: {
      status: 'UNASSIGNED',
      courseSlot: { courseId: { in: [...myMarkByCourse.keys()] } },
      // The tutor who excused themselves cannot cover their own session.
      assignment: { userId: { not: requestingUser.id } },
    },
    include: {
      assignment: {
        include: {
          course: { select: { courseCode: true, courseName: true, minimumMark: true } },
        },
      },
      courseSlot: {
        include: {
          timeSlot: true,
        },
      },
    },
    orderBy: [{ date: 'asc' }],
  });

  // myCourseMark lets the page show why each session is open to this tutor.
  res.json(
    sessions.map((session) => ({
      ...session,
      myCourseMark: myMarkByCourse.get(session.assignment.courseId) ?? null,
    })),
  );
});

exports.getMySessions = catchAsync(async (req, res, next) => {
  const requestingUser = await prisma.user.findUnique({
    where: { firebaseUid: req.user.user_id },
  });
  if (!requestingUser) {
    return next(createHttpError(404, 'User not found. Please check if the user exists'));
  }
  if (requestingUser.role !== 'TUTOR') {
    return next(createHttpError(403, 'Only tutors can view their assigned sessions'));
  }

  const userId = requestingUser.id;

  // The tutor's assignments — the courses they were approved to tutor.
  const assignments = await prisma.tutorAssignment.findMany({
    where: { userId },
    include: {
      course: {
        select: {
          id: true,
          courseCode: true,
          courseName: true,
          user: { select: { firstName: true, lastName: true } },
        },
      },
    },
    orderBy: { id: 'asc' },
  });

  // Date windows shared by the queries below. Event and session dates are
  // stored at UTC midnight, so the windows use UTC days.
  const todayStart = new Date();
  todayStart.setUTCHours(0, 0, 0, 0);
  // Monday of the current calendar week. Occurrences from earlier this week
  // are past for the ledger but still count toward the "This week" hours card,
  // so the feed reaches back to the start of the week and no further — the
  // tutor's older teaching history lives in their claimed events, not here.
  const currentWeekStart = new Date(todayStart);
  currentWeekStart.setUTCDate(
    currentWeekStart.getUTCDate() - ((currentWeekStart.getUTCDay() + 6) % 7),
  );

  // Events are how lecturers schedule tutoring: every event on the tutor's
  // assigned courses becomes one session occurrence per course slot on the
  // event's weekday. Nothing is written here — the times derive from the
  // course's current slots, so a lecturer editing the slots keeps every
  // event (and this dashboard) correct.
  const events = await prisma.event.findMany({
    where: {
      course: { assignments: { some: { userId } } },
      date: { gte: currentWeekStart },
    },
    include: {
      course: {
        select: {
          id: true,
          courseCode: true,
          courseName: true,
          slots: { include: { timeSlot: true } },
        },
      },
    },
    orderBy: [{ date: 'asc' }, { id: 'asc' }],
  });

  // Real Session rows carry the excuse / volunteer lifecycle: occurrences this
  // tutor excused themselves from (materialized as UNASSIGNED by excuseSession)
  // and legacy rows. Scoped to the tutor's OWN assignment — a session on another
  // assignment is that tutor's copy of the occurrence, and single-tutor
  // visibility means it must never reach this dashboard. The date window matches
  // the events query above.
  const sessions = await prisma.session.findMany({
    where: {
      assignment: { userId },
      date: { gte: currentWeekStart },
    },
    include: {
      assignment: {
        select: {
          userId: true,
          courseId: true,
          course: { select: { courseCode: true, courseName: true } },
        },
      },
      courseSlot: {
        include: {
          timeSlot: true,
        },
      },
      // The cover lifecycle attached to the row: the excusing tutor's own view
      // of who they pointed the cover at (directed cover offer) and the state
      // of that request.
      volunteerRequest: {
        include: { user: { select: { firstName: true, lastName: true } } },
      },
    },
    orderBy: [{ date: 'asc' }, { id: 'asc' }],
  });

  // ── Merge event occurrences with real session rows ────────────────────
  // A real session on the tutor's own assignment supersedes the event occurrence
  // it matches (course, date, slot): it IS that occurrence, carrying the tutor's
  // excuse or volunteer state. The guard keeps the own-assignment invariant
  // explicit: sessions belonging to other tutors never enter the ledger, so
  // they can neither appear nor supersede this tutor's occurrences.
  const occurrenceKey = (courseId, date, courseSlotId) =>
    `${courseId}|${date.toISOString().slice(0, 10)}|${courseSlotId}`;
  const ownSessions = sessions.filter((session) => session.assignment.userId === userId);
  const ownSessionKeys = new Set(
    ownSessions.map((session) =>
      occurrenceKey(session.assignment.courseId, session.date, session.courseSlotId),
    ),
  );

  const tutorName = `${requestingUser.firstName} ${requestingUser.lastName}`;

  const occurrences = [];

  for (const event of events) {
    const dayOfWeek = dayOfWeekFor(event.date);
    if (dayOfWeek === null) continue; // weekend — courses have no tutoring slots
    for (const slot of event.course.slots) {
      if (slot.dayOfWeek !== dayOfWeek) continue;
      if (ownSessionKeys.has(occurrenceKey(event.course.id, event.date, slot.id))) continue;
      occurrences.push({
        id: `e${slot.id}-${event.date.toISOString().slice(0, 10)}`,
        date: event.date,
        status: 'SCHEDULED',
        excuseReason: null,
        volunteerRequest: null,
        ownerId: userId,
        courseId: event.course.id,
        ledBy: tutorName,
        course: { courseCode: event.course.courseCode, courseName: event.course.courseName },
        courseSlot: {
          id: slot.id,
          dayOfWeek: slot.dayOfWeek,
          venue: slot.venue,
          sessionType: slot.sessionType,
          timeSlot: slot.timeSlot,
        },
      });
    }
  }

  for (const session of ownSessions) {
    occurrences.push({
      id: session.id,
      date: session.date,
      status: session.status,
      excuseReason: session.excuseReason,
      volunteerRequest: session.volunteerRequest
        ? {
            status: session.volunteerRequest.status,
            userId: session.volunteerRequest.userId,
            tutorName: session.volunteerRequest.user
              ? `${session.volunteerRequest.user.firstName} ${session.volunteerRequest.user.lastName}`
              : null,
          }
        : null,
      ownerId: session.assignment.userId,
      courseId: session.assignment.courseId,
      // Every ledger row belongs to the requesting tutor — they lead it.
      ledBy: tutorName,
      course: session.assignment.course,
      courseSlot: {
        id: session.courseSlot.id,
        dayOfWeek: session.courseSlot.dayOfWeek,
        venue: session.courseSlot.venue,
        sessionType: session.courseSlot.sessionType,
        timeSlot: session.courseSlot.timeSlot,
      },
    });
  }

  // Interleave both sources chronologically; within a day, by start time.
  occurrences.sort((a, b) => {
    const dateDiff = a.date.getTime() - b.date.getTime();
    if (dateDiff !== 0) return dateDiff;
    const aStart = a.courseSlot.timeSlot ? a.courseSlot.timeSlot.startMinute : 0;
    const bStart = b.courseSlot.timeSlot ? b.courseSlot.timeSlot.startMinute : 0;
    if (aStart !== bStart) return aStart - bStart;
    return String(a.id) < String(b.id) ? -1 : 1;
  });

  // The weekly cap the tutor agreed to when their tutor application was
  // approved — the approved RoleApplication is the only place the schema
  // stores it, and the dashboard's hours bar is drawn against it.
  const tutorApplication = await prisma.roleApplication.findFirst({
    where: { userId, requestedRole: 'TUTOR', status: 'APPROVED' },
    orderBy: { submittedAt: 'desc' },
  });

  // Allocated hours come from the sessions the tutor still leads, not from
  // the course's slots: excusing oneself (UNASSIGNED) or a pending volunteer
  // (PENDING) immediately reduces the figure. Sessions are dated instances of
  // the course's events, so the hours are counted per teaching week — the
  // Monday-to-Sunday week of the tutor's next scheduled session.
  const MILLISECONDS_PER_DAY = 24 * 60 * 60 * 1000;

  // occurrences is sorted chronologically, so the first entry is the earliest
  // session the tutor still leads. Every entry is theirs — other tutors' rows
  // never reach the ledger.
  const myUpcomingSessions = occurrences.filter(
    (occurrence) =>
      occurrence.status === 'SCHEDULED' && occurrence.date.getTime() >= todayStart.getTime(),
  );

  let teachingWeekStart = null;
  if (myUpcomingSessions.length > 0) {
    // Session dates are stored at UTC midnight, so the window uses UTC days.
    teachingWeekStart = new Date(myUpcomingSessions[0].date);
    teachingWeekStart.setUTCHours(0, 0, 0, 0);
    teachingWeekStart.setUTCDate(teachingWeekStart.getUTCDate() - ((teachingWeekStart.getUTCDay() + 6) % 7));
  }
  const teachingWeekEnd = teachingWeekStart
    ? teachingWeekStart.getTime() + 7 * MILLISECONDS_PER_DAY
    : null;

  const inTeachingWeek = (occurrence) => {
    if (!teachingWeekStart) return false;
    const time = occurrence.date.getTime();
    return time >= teachingWeekStart.getTime() && time < teachingWeekEnd;
  };

  // The dashboard's "This week" card answers a different question than the
  // teaching week above: how much of the tutor's weekly cap does the current
  // calendar week use? Its window is the Monday-to-Sunday week containing
  // today, and days that already passed still count — those are hours the
  // tutor has already led against this week's cap.
  const currentWeekEnd = currentWeekStart.getTime() + 7 * MILLISECONDS_PER_DAY;

  const weekScheduledHours =
    Math.round(
      occurrences
        .filter(
          (occurrence) =>
            occurrence.status === 'SCHEDULED' &&
            occurrence.date.getTime() >= currentWeekStart.getTime() &&
            occurrence.date.getTime() < currentWeekEnd,
        )
        .reduce((total, occurrence) => total + sessionHours(occurrence), 0) * 10,
    ) / 10;

  res.json({
    maxHoursPerWeek: tutorApplication?.maxHoursPerWeek ?? null,
    // The current calendar week's own still-scheduled hours — the figure the
    // dashboard's "This week" card and its progress bar are drawn against.
    weekScheduledHours,
    courses: assignments.map((assignment) => ({
      assignmentId: assignment.id,
      courseId: assignment.course.id,
      courseCode: assignment.course.courseCode,
      courseName: assignment.course.courseName,
      semester: assignment.semester,
      lecturerName: assignment.course.user
        ? `${assignment.course.user.firstName} ${assignment.course.user.lastName}`
        : null,
      // Hours this tutor is still scheduled to run for the course in the
      // teaching week — their own sessions only, so excusing one lowers it.
      allocatedHours:
        Math.round(
          myUpcomingSessions
            .filter(
              (occurrence) =>
                occurrence.courseId === assignment.course.id && inTeachingWeek(occurrence),
            )
            .reduce((total, occurrence) => total + sessionHours(occurrence), 0) * 10,
        ) / 10,
    })),
    // The tutor's own ledger: their event-derived occurrences and own session
    // rows in one chronological list, shaped exactly like the sessions the
    // dashboard and the timetable/profile pages sharing this endpoint render.
    sessions: occurrences.map((occurrence) => ({
      id: occurrence.id,
      date: occurrence.date,
      status: occurrence.status,
      excuseReason: occurrence.excuseReason,
      volunteerRequest: occurrence.volunteerRequest ?? null,
      // isMine — every row of this feed sits on the requesting tutor's own
      // assignment: they are the one expected to run it and the only one who
      // can excuse it. Kept in the payload so consumers can filter defensively.
      isMine: occurrence.ownerId === userId,
      ledBy: occurrence.ledBy,
      course: occurrence.course,
      courseSlot: occurrence.courseSlot,
    })),
  });
});

// Loads the requesting user and verifies they have the LECTURER role.
const requireLecturerProfile = async (req, next) => {
  const requestingUser = await prisma.user.findUnique({
    where: { firebaseUid: req.user.user_id },
  });
  if (!requestingUser) {
    next(createHttpError(404, 'User not found. Please check if the user exists'));
    return null;
  }
  if (requestingUser.role !== 'LECTURER') {
    next(createHttpError(403, 'Only lecturers can view course sessions'));
    return null;
  }
  return requestingUser;
};

exports.getLecturerSessions = catchAsync(async (req, res, next) => {
  const requestingUser = await requireLecturerProfile(req, next);
  if (!requestingUser) return;

  // Everything the lecturer needs to follow tutoring on THEIR courses only:
  // the course's weekly slots, its assigned tutors, the upcoming events (the
  // schedule itself — every assigned tutor's dashboard derives its sessions
  // from them) and the sessions that entered the excuse / volunteer lifecycle.
  const todayStart = new Date();
  todayStart.setUTCHours(0, 0, 0, 0);

  const [courses, events] = await Promise.all([
    prisma.course.findMany({
      where: { userId: requestingUser.id },
      include: {
        slots: {
          include: { timeSlot: true },
          orderBy: [{ dayOfWeek: 'asc' }, { id: 'asc' }],
        },
        assignments: {
          include: {
            user: { select: { firstName: true, lastName: true } },
            sessions: {
              include: { courseSlot: { include: { timeSlot: true } } },
              orderBy: [{ date: 'asc' }, { id: 'asc' }],
            },
          },
          orderBy: { id: 'asc' },
        },
      },
      orderBy: { courseCode: 'asc' },
    }),
    prisma.event.findMany({
      where: { course: { userId: requestingUser.id }, date: { gte: todayStart } },
      include: {
        course: {
          select: { id: true, slots: { include: { timeSlot: true } } },
        },
      },
      orderBy: [{ date: 'asc' }, { id: 'asc' }],
    }),
  ]);

  // Upcoming events grouped per course. Times derive from the course's slots
  // on the event's weekday — the same derivation the tutor dashboard's session
  // occurrences and the Events page use, so every view agrees.
  const eventsByCourseId = new Map();
  for (const event of events) {
    const courseId = event.course.id;
    if (!eventsByCourseId.has(courseId)) {
      eventsByCourseId.set(courseId, []);
    }
    eventsByCourseId.get(courseId).push({
      id: event.id,
      date: event.date,
      description: event.description,
      times: deriveTimes(event.course.slots, dayOfWeekFor(event.date)),
    });
  }

  res.json({
    courses: courses.map((course) => {
      const lifecycleSessions = course.assignments.flatMap((assignment) =>
        assignment.sessions.map((session) => ({
          id: session.id,
          date: session.date,
          status: session.status,
          excuseReason: session.excuseReason,
          assignmentId: assignment.id,
          tutorName: assignment.user
            ? `${assignment.user.firstName} ${assignment.user.lastName}`
            : null,
          volunteerRequest: session.volunteerRequest
            ? {
                id: session.volunteerRequest.id,
                status: session.volunteerRequest.status,
                userId: session.volunteerRequest.userId,
                volunteerName: session.volunteerRequest.user
                  ? `${session.volunteerRequest.user.firstName} ${session.volunteerRequest.user.lastName}`
                  : null,
              }
            : null,
          courseSlot: {
            id: session.courseSlot.id,
            dayOfWeek: session.courseSlot.dayOfWeek,
            venue: session.courseSlot.venue,
            sessionType: session.courseSlot.sessionType,
            timeSlot: session.courseSlot.timeSlot,
          },
        })),
      );

      return {
        id: course.id,
        courseCode: course.courseCode,
        courseName: course.courseName,
        slots: course.slots.map((slot) => ({
          id: slot.id,
          dayOfWeek: slot.dayOfWeek,
          venue: slot.venue,
          sessionType: slot.sessionType,
          timeSlot: slot.timeSlot,
        })),
        tutors: course.assignments.map((assignment) => ({
          assignmentId: assignment.id,
          userId: assignment.userId,
          name: assignment.user
            ? `${assignment.user.firstName} ${assignment.user.lastName}`
            : null,
        })),
        // Upcoming events — each becomes one session per course slot on its
        // weekday for every assigned tutor.
        events: eventsByCourseId.get(course.id) ?? [],
        sessions: lifecycleSessions,
      };
    }),
  });
});

exports.excuseSession = catchAsync(async (req, res, next) => {
  // Event-derived occurrences carry the virtual id e{courseSlotId}-{date};
  // anything else must be a numeric session id.
  const virtualMatch = VIRTUAL_SESSION_ID_PATTERN.exec(req.params.id);
  const sessionId = virtualMatch ? null : parseSessionId(req.params.id);
  if (!virtualMatch && !sessionId) {
    return next(createHttpError(400, 'Invalid session id'));
  }

  const { reason } = req.body || {};
  if (!reason || !reason.trim()) {
    return next(createHttpError(400, 'An excuse reason is required'));
  }

  const requestingUser = await prisma.user.findUnique({
    where: { firebaseUid: req.user.user_id },
  });
  if (!requestingUser) {
    return next(createHttpError(404, 'User not found. Please check if the user exists'));
  }
  if (requestingUser.role !== 'TUTOR') {
    return next(createHttpError(403, 'Only tutors can excuse themselves from a session'));
  }

  // Excusing only makes sense for a session that has not taken place yet —
  // volunteers cannot cover the past. Session dates are UTC midnights.
  const todayStart = new Date();
  todayStart.setUTCHours(0, 0, 0, 0);

  // A virtual id: excusing materializes the event-derived occurrence as a
  // real UNASSIGNED Session row so the student volunteer flow can pick it up.
  if (virtualMatch) {
    const courseSlotId = Number(virtualMatch[1]);
    const sessionDate = new Date(`${virtualMatch[2]}T00:00:00.000Z`);
    if (Number.isNaN(sessionDate.getTime())) {
      return next(createHttpError(400, 'Invalid session id'));
    }
    if (sessionDate.getTime() < todayStart.getTime()) {
      return next(createHttpError(409, 'This session has already taken place'));
    }

    const courseSlot = await prisma.courseSlot.findUnique({
      where: { id: courseSlotId },
      include: {
        course: { select: { id: true } },
      },
    });

    // The occurrence only exists if the course has an event on that date whose
    // weekday matches the course slot the id carries — the event IS the schedule.
    const event = courseSlot
      ? await prisma.event.findFirst({
          where: { courseId: courseSlot.course.id, date: sessionDate },
        })
      : null;
    if (!courseSlot || !event || courseSlot.dayOfWeek !== dayOfWeekFor(sessionDate)) {
      return next(createHttpError(404, 'Session not found. Please check if the session exists'));
    }

    // The materialized session attaches to the tutor's own assignment for the
    // course — the assignment the dashboard derived the occurrence from.
    const assignment = await prisma.tutorAssignment.findFirst({
      where: { userId: requestingUser.id, courseId: courseSlot.course.id },
      orderBy: { id: 'desc' },
    });
    if (!assignment) {
      return next(createHttpError(403, 'You can only excuse yourself from your own sessions'));
    }

    // The dashboard hides the virtual occurrence once a real row exists for
    // it, so reaching this point twice means the excuse already happened
    // (e.g. a second request raced the first).
    const existing = await prisma.session.findFirst({
      where: {
        assignmentId: assignment.id,
        courseSlotId,
        date: sessionDate,
      },
    });
    if (existing) {
      return next(createHttpError(409, 'This session has already been excused or has a pending volunteer'));
    }

    const createdSession = await prisma.session.create({
      data: {
        assignmentId: assignment.id,
        courseSlotId,
        date: sessionDate,
        status: 'UNASSIGNED',
        excuseReason: reason.trim(),
      },
    });

    return res.json(createdSession);
  }

  const session = await prisma.session.findUnique({
    where: { id: sessionId },
    include: { assignment: true },
  });
  if (!session) {
    return next(createHttpError(404, 'Session not found. Please check if the session exists'));
  }
  if (session.status !== 'SCHEDULED') {
    return next(createHttpError(409, 'This session has already been excused or has a pending volunteer'));
  }
  if (session.assignment.userId !== requestingUser.id) {
    return next(createHttpError(403, 'You can only excuse yourself from your own sessions'));
  }
  if (session.date.getTime() < todayStart.getTime()) {
    return next(createHttpError(409, 'This session has already taken place'));
  }

  // Excusing returns the session to the unassigned state so students can volunteer for it.
  const updatedSession = await prisma.session.update({
    where: { id: sessionId },
    data: { status: 'UNASSIGNED', excuseReason: reason.trim() },
  });

  res.json(updatedSession);
});

exports.getMyVolunteeredSessions = catchAsync(async (req, res, next) => {
  const requestingUser = await prisma.user.findUnique({
    where: { firebaseUid: req.user.user_id },
  });
  if (!requestingUser) {
    return next(createHttpError(404, 'User not found. Please check if the user exists'));
  }

  // Every SessionVolunteer record for this user that still matters: OFFERED
  // means a directed cover offer awaits their response, PENDING awaits the
  // lecturer's approval, APPROVED means confirmed.
  const volunteerRecords = await prisma.sessionVolunteer.findMany({
    where: {
      userId: requestingUser.id,
      status: { in: ['OFFERED', 'PENDING', 'APPROVED'] },
    },
    include: {
      session: {
        include: {
          assignment: {
            select: {
              userId: true,
              course: { select: { courseCode: true, courseName: true } },
              user: { select: { firstName: true, lastName: true } },
            },
          },
          courseSlot: {
            include: {
              timeSlot: true,
            },
          },
        },
      },
    },
    orderBy: { createdAt: 'desc' },
  });

  res.json({
    sessions: volunteerRecords.map((record) => ({
      id: record.session.id,
      date: record.session.date,
      status: record.session.status,
      volunteerStatus: record.status,
      course: record.session.assignment.course,
      courseSlot: {
        id: record.session.courseSlot.id,
        dayOfWeek: record.session.courseSlot.dayOfWeek,
        venue: record.session.courseSlot.venue,
        sessionType: record.session.courseSlot.sessionType,
        timeSlot: record.session.courseSlot.timeSlot,
      },
      ledBy: record.session.assignment.user
        ? `${record.session.assignment.user.firstName} ${record.session.assignment.user.lastName}`
        : null,
    })),
  });
});

exports.volunteerForSession = catchAsync(async (req, res, next) => {
  const sessionId = parseSessionId(req.params.id);
  if (!sessionId) {
    return next(createHttpError(400, 'Invalid session id'));
  }

  const requestingUser = await prisma.user.findUnique({
    where: { firebaseUid: req.user.user_id },
  });
  if (!requestingUser) {
    return next(createHttpError(404, 'User not found. Please check if the user exists'));
  }
  if (requestingUser.role !== 'TUTOR') {
    return next(createHttpError(403, 'Only tutors can volunteer for excused sessions'));
  }

  try {
    // The request record and the session status flip happen atomically. The
    // unique constraint on SessionVolunteer.sessionId keeps a single request
    // per session while it is open (or awaiting the lecturer's decision).
    const volunteerRequest = await prisma.$transaction(async (tx) => {
      const session = await tx.session.findUnique({
        where: { id: sessionId },
        include: {
          assignment: { select: { userId: true } },
          courseSlot: { include: { course: { select: { id: true, minimumMark: true } } } },
        },
      });
      if (!session) {
        throw createHttpError(404, 'Session not found. Please check if the session exists');
      }
      if (session.status !== 'UNASSIGNED') {
        throw createHttpError(409, 'This session is no longer available for volunteering');
      }
      if (session.assignment.userId === requestingUser.id) {
        throw createHttpError(403, 'You excused this session — another tutor must cover it');
      }

      const course = session.courseSlot.course;

      // The volunteer's own application mark for the course must meet the
      // course minimum — the same bar the course uses for its tutors.
      const myApplication = await tx.application.findFirst({
        where: { userId: requestingUser.id, courseId: course.id, status: { not: 'REJECTED' } },
        orderBy: { courseMark: 'desc' },
      });
      if (!myApplication || myApplication.courseMark < course.minimumMark) {
        throw createHttpError(403, 'Your course mark does not meet the minimum for this course');
      }

      // A record left behind by a rejected request or a withdrawn directed
      // offer is history only — the next cover request replaces it.
      const existingRequest = await tx.sessionVolunteer.findUnique({ where: { sessionId } });
      if (existingRequest && !['REJECTED', 'CANCELLED'].includes(existingRequest.status)) {
        throw createHttpError(409, 'Another tutor has already volunteered for this session');
      }

      // PENDING on purpose: the lecturer decides before the session changes hands.
      const request = existingRequest
        ? await tx.sessionVolunteer.update({
            where: { sessionId },
            data: { userId: requestingUser.id, status: 'PENDING', createdAt: new Date() },
          })
        : await tx.sessionVolunteer.create({
            data: { sessionId, userId: requestingUser.id, status: 'PENDING' },
          });

      await tx.session.update({ where: { id: sessionId }, data: { status: 'PENDING' } });

      return request;
    });

    res.status(201).json(volunteerRequest);
  } catch (error) {
    // P2002 is the unique-constraint failure raised when another tutor beat us to it.
    if (error.code === 'P2002') {
      return next(createHttpError(409, 'Another tutor has already volunteered for this session'));
    }
    throw error;
  }
});

// The course's lecturer decides on a PENDING cover request — raised either by
// a student volunteer or by an accepted directed cover offer; both reach the
// same decision point. Approval re-points the session at the covering tutor's
// TutorAssignment (created for the course when they never had one), so the
// covering tutor takes the excusing tutor's place.
exports.decideVolunteerRequest = catchAsync(async (req, res, next) => {
  const sessionId = parseSessionId(req.params.id);
  if (!sessionId) {
    return next(createHttpError(400, 'Invalid session id'));
  }

  const { decision } = req.body || {};
  if (decision !== 'APPROVED' && decision !== 'REJECTED') {
    return next(createHttpError(400, 'decision must be APPROVED or REJECTED'));
  }

  const requestingUser = await prisma.user.findUnique({
    where: { firebaseUid: req.user.user_id },
  });
  if (!requestingUser) {
    return next(createHttpError(404, 'User not found. Please check if the user exists'));
  }
  if (requestingUser.role !== 'LECTURER') {
    return next(createHttpError(403, 'Only lecturers can decide on volunteer requests'));
  }

  const result = await prisma.$transaction(async (tx) => {
    const session = await tx.session.findUnique({
      where: { id: sessionId },
      include: {
        assignment: { select: { semester: true } },
        courseSlot: { include: { course: { select: { id: true, userId: true } } } },
        volunteerRequest: true,
      },
    });
    if (!session) {
      throw createHttpError(404, 'Session not found. Please check if the session exists');
    }
    if (session.courseSlot.course.userId !== requestingUser.id) {
      throw createHttpError(403, 'You can only decide on requests for your own courses');
    }
    if (
      session.status !== 'PENDING' ||
      !session.volunteerRequest ||
      session.volunteerRequest.status !== 'PENDING'
    ) {
      throw createHttpError(409, 'This session has no volunteer request awaiting a decision');
    }

    if (decision === 'REJECTED') {
      // The rejected record stays for history; the session returns to the open
      // pool, and the next cover request (a volunteer or a directed offer)
      // replaces the record (see volunteerForSession).
      await tx.sessionVolunteer.update({
        where: { sessionId },
        data: { status: 'REJECTED' },
      });
      const updatedSession = await tx.session.update({
        where: { id: sessionId },
        data: { status: 'UNASSIGNED' },
      });
      return { decision, session: updatedSession };
    }

    // Approved: the volunteer takes over the session through their assignment
    // for the course — created on the spot when they are not yet its tutor.
    let coverAssignment = await tx.tutorAssignment.findFirst({
      where: { userId: session.volunteerRequest.userId, courseId: session.courseSlot.course.id },
    });
    if (!coverAssignment) {
      coverAssignment = await tx.tutorAssignment.create({
        data: {
          userId: session.volunteerRequest.userId,
          courseId: session.courseSlot.course.id,
          semester: session.assignment.semester,
        },
      });
    }

    await tx.sessionVolunteer.update({
      where: { sessionId },
      data: { status: 'APPROVED' },
    });
    const updatedSession = await tx.session.update({
      where: { id: sessionId },
      data: { assignmentId: coverAssignment.id, status: 'SCHEDULED' },
    });
    return { decision, session: updatedSession, assignmentId: coverAssignment.id };
  });

  res.json(result);
});

// ── Directed cover offers ─────────────────────────────────────────────────────
// The excusing tutor may point the cover at one specific tutor instead of
// leaving the session in the open pool. The nominee must be an active tutor
// appointed to the course (taking the session over is an appointment, not just
// a scheduling act) and must pass the same practical checks any replacement
// tutor must satisfy. The nominee accepts or declines first; only then does the request reach
// the lecturer, who decides exactly as for a self-volunteered request. No
// claim/pay row moves anywhere — the covering tutor claims the event after it
// happens, and the excusing tutor is blocked from claiming it (timesheets).

// GET /:id/cover-candidates — the appointed tutors for an excused session,
// each validated with human-readable reasons.
exports.getCoverCandidates = catchAsync(async (req, res, next) => {
  const sessionId = parseSessionId(req.params.id);
  if (!sessionId) {
    return next(createHttpError(400, 'Invalid session id'));
  }

  const requestingUser = await prisma.user.findUnique({
    where: { firebaseUid: req.user.user_id },
  });
  if (!requestingUser) {
    return next(createHttpError(404, 'User not found. Please check if the user exists'));
  }
  if (requestingUser.role !== 'TUTOR') {
    return next(createHttpError(403, 'Only tutors can view cover candidates'));
  }

  const session = await prisma.session.findUnique({
    where: { id: sessionId },
    include: {
      assignment: { select: { userId: true } },
      courseSlot: {
        include: {
          course: { select: { id: true, courseCode: true, courseName: true } },
          timeSlot: true,
        },
      },
    },
  });
  if (!session) {
    return next(createHttpError(404, 'Session not found. Please check if the session exists'));
  }
  if (session.assignment.userId !== requestingUser.id) {
    return next(createHttpError(403, 'You can only offer cover for your own excused sessions'));
  }
  if (session.status !== 'UNASSIGNED') {
    return next(createHttpError(409, 'This session is not open for a directed cover offer'));
  }

  // Every other active tutor appointed to the same course is a potential cover.
  const assignments = await prisma.tutorAssignment.findMany({
    where: {
      courseId: session.courseSlot.course.id,
      userId: { not: requestingUser.id },
      user: { role: 'TUTOR', isActive: true },
    },
    include: { user: true },
  });

  const candidates = [];
  for (const assignment of assignments) {
    const tutor = assignment.user;
    const reasons = await validateCoverCandidate(session, tutor);
    candidates.push({
      userId: tutor.id,
      name: tutorDisplayName(tutor),
      email: tutor.email,
      eligible: reasons.length === 0,
      reasons,
    });
  }

  res.json({ session: serializeCoverSession(session), candidates });
});

// POST /:id/cover-offer — the excuser offers the session to one appointed
// tutor. The session leaves the open pool while the nominee decides.
exports.createCoverOffer = catchAsync(async (req, res, next) => {
  const sessionId = parseSessionId(req.params.id);
  if (!sessionId) {
    return next(createHttpError(400, 'Invalid session id'));
  }

  const { nomineeId } = req.body || {};
  const parsedNomineeId = Number(nomineeId);
  if (!Number.isInteger(parsedNomineeId)) {
    return next(createHttpError(400, 'nomineeId must be a valid integer'));
  }

  const requestingUser = await prisma.user.findUnique({
    where: { firebaseUid: req.user.user_id },
  });
  if (!requestingUser) {
    return next(createHttpError(404, 'User not found. Please check if the user exists'));
  }
  if (requestingUser.role !== 'TUTOR') {
    return next(createHttpError(403, 'Only tutors can offer a session to another tutor'));
  }

  const nominee = await prisma.user.findUnique({ where: { id: parsedNomineeId } });
  if (!nominee || nominee.role !== 'TUTOR' || !nominee.isActive) {
    return next(createHttpError(404, 'The nominated tutor must be an active tutor'));
  }
  if (nominee.id === requestingUser.id) {
    return next(createHttpError(400, 'You cannot offer a session to yourself'));
  }

  // Excusing only happens for future sessions, but a stale UNASSIGNED row can
  // still age past its date — it must not collect offers anymore.
  const todayStart = new Date();
  todayStart.setUTCHours(0, 0, 0, 0);

  try {
    // The offer record and the session status flip happen atomically. The
    // unique constraint on SessionVolunteer.sessionId keeps a single request
    // per session while it is open (or awaiting the lecturer's decision).
    const offer = await prisma.$transaction(async (tx) => {
      const session = await tx.session.findUnique({
        where: { id: sessionId },
        include: {
          assignment: { select: { userId: true } },
          courseSlot: {
            include: {
              course: { select: { id: true, courseCode: true } },
              timeSlot: true,
            },
          },
        },
      });
      if (!session) {
        throw createHttpError(404, 'Session not found. Please check if the session exists');
      }
      if (session.assignment.userId !== requestingUser.id) {
        throw createHttpError(403, 'You can only offer cover for your own excused sessions');
      }
      if (session.status !== 'UNASSIGNED') {
        throw createHttpError(409, 'This session is not open for a directed cover offer');
      }
      if (session.date.getTime() < todayStart.getTime()) {
        throw createHttpError(409, 'This session has already taken place');
      }

      // The nominee must be an appointed tutor for the course the session sits
      // on — taking it over is an appointment, so qualified outsiders are not
      // enough (same gate as any other cover tutor).
      const appointment = await tx.tutorAssignment.findFirst({
        where: { userId: nominee.id, courseId: session.courseSlot.course.id },
      });
      if (!appointment) {
        throw createHttpError(
          403,
          `${tutorDisplayName(nominee)} is not allocated to ${session.courseSlot.course.courseCode}`,
        );
      }

      const reasons = await validateCoverCandidate(session, nominee);
      if (reasons.length > 0) {
        throw createHttpError(
          403,
          `${tutorDisplayName(nominee)} cannot cover this session: ${reasons.join('; ')}`,
        );
      }

      const existingRequest = await tx.sessionVolunteer.findUnique({ where: { sessionId } });
      if (existingRequest && !['REJECTED', 'CANCELLED'].includes(existingRequest.status)) {
        throw createHttpError(409, 'This session already has a cover request in progress');
      }

      // OFFERED on purpose: the nominee decides before the lecturer is asked.
      const record = existingRequest
        ? await tx.sessionVolunteer.update({
            where: { sessionId },
            data: { userId: nominee.id, status: 'OFFERED', createdAt: new Date() },
          })
        : await tx.sessionVolunteer.create({
            data: { sessionId, userId: nominee.id, status: 'OFFERED' },
          });

      await tx.session.update({ where: { id: sessionId }, data: { status: 'OFFERED' } });

      return record;
    });

    res.status(201).json(offer);
  } catch (error) {
    // P2002 is the unique-constraint failure raised when another offer raced us.
    if (error.code === 'P2002') {
      return next(createHttpError(409, 'This session already has a cover request in progress'));
    }
    throw error;
  }
});

// PATCH /:id/cover-offer — the nominated tutor accepts or declines. Accepting
// moves the request to the lecturer's queue; declining returns the session to
// the open pool.
exports.respondToCoverOffer = catchAsync(async (req, res, next) => {
  const sessionId = parseSessionId(req.params.id);
  if (!sessionId) {
    return next(createHttpError(400, 'Invalid session id'));
  }

  const { decision } = req.body || {};
  if (decision !== 'ACCEPT' && decision !== 'DECLINE') {
    return next(createHttpError(400, 'decision must be ACCEPT or DECLINE'));
  }

  const requestingUser = await prisma.user.findUnique({
    where: { firebaseUid: req.user.user_id },
  });
  if (!requestingUser) {
    return next(createHttpError(404, 'User not found. Please check if the user exists'));
  }
  if (requestingUser.role !== 'TUTOR') {
    return next(createHttpError(403, 'Only tutors can respond to cover offers'));
  }

  const result = await prisma.$transaction(async (tx) => {
    const session = await tx.session.findUnique({
      where: { id: sessionId },
      include: { volunteerRequest: true },
    });
    if (!session) {
      throw createHttpError(404, 'Session not found. Please check if the session exists');
    }
    if (
      session.status !== 'OFFERED' ||
      !session.volunteerRequest ||
      session.volunteerRequest.status !== 'OFFERED'
    ) {
      throw createHttpError(409, 'This session has no cover offer awaiting a response');
    }
    if (session.volunteerRequest.userId !== requestingUser.id) {
      throw createHttpError(403, 'Only the tutor the session was offered to can respond');
    }

    if (decision === 'DECLINE') {
      // The declined record stays for history (replaceable, like a rejected
      // volunteer request); the session returns to the open pool.
      const record = await tx.sessionVolunteer.update({
        where: { sessionId },
        data: { status: 'REJECTED' },
      });
      const updatedSession = await tx.session.update({
        where: { id: sessionId },
        data: { status: 'UNASSIGNED' },
      });
      return { decision, volunteerRequest: record, session: updatedSession };
    }

    // Accepted: the cover request now waits for the course lecturer — the same
    // decision point a self-volunteered request reaches (see
    // decideVolunteerRequest, which needs no distinction between the two).
    const record = await tx.sessionVolunteer.update({
      where: { sessionId },
      data: { status: 'PENDING' },
    });
    const updatedSession = await tx.session.update({
      where: { id: sessionId },
      data: { status: 'PENDING' },
    });
    return { decision, volunteerRequest: record, session: updatedSession };
  });

  res.json(result);
});

// DELETE /:id/cover-offer — the excuser withdraws the offer while it still
// waits on the nominee. Once accepted the request sits with the lecturer and
// cannot be pulled back.
exports.cancelCoverOffer = catchAsync(async (req, res, next) => {
  const sessionId = parseSessionId(req.params.id);
  if (!sessionId) {
    return next(createHttpError(400, 'Invalid session id'));
  }

  const requestingUser = await prisma.user.findUnique({
    where: { firebaseUid: req.user.user_id },
  });
  if (!requestingUser) {
    return next(createHttpError(404, 'User not found. Please check if the user exists'));
  }
  if (requestingUser.role !== 'TUTOR') {
    return next(createHttpError(403, 'Only tutors can withdraw cover offers'));
  }

  const result = await prisma.$transaction(async (tx) => {
    const session = await tx.session.findUnique({
      where: { id: sessionId },
      include: {
        assignment: { select: { userId: true } },
        volunteerRequest: true,
      },
    });
    if (!session) {
      throw createHttpError(404, 'Session not found. Please check if the session exists');
    }
    if (
      session.status !== 'OFFERED' ||
      !session.volunteerRequest ||
      session.volunteerRequest.status !== 'OFFERED'
    ) {
      throw createHttpError(409, 'This session has no cover offer waiting for a response');
    }
    if (session.assignment.userId !== requestingUser.id) {
      throw createHttpError(403, 'Only the tutor who excused this session can withdraw the offer');
    }

    const record = await tx.sessionVolunteer.update({
      where: { sessionId },
      data: { status: 'CANCELLED' },
    });
    const updatedSession = await tx.session.update({
      where: { id: sessionId },
      data: { status: 'UNASSIGNED' },
    });
    return { volunteerRequest: record, session: updatedSession };
  });

  res.json(result);
});
