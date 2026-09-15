const prisma = require('../prisma/client');
const catchAsync = require('../utils/catchAsync');

// Session lifecycle:
//   SCHEDULED  — assigned to a tutor through their TutorAssignment
//   UNASSIGNED — the tutor excused themselves, the session is open for volunteers
//   PENDING    — a student volunteered and is awaiting approval (see SessionVolunteer)
//
// A session's course is derivable without any extra join table: every Session
// belongs to a TutorAssignment (tutor ↔ course) and a CourseSlot (course's
// weekly time/venue), so course-level visibility reuses these relations.

// The global error handler renders any error that carries a statusCode + message.
const createHttpError = (statusCode, message) => {
  const error = new Error(message);
  error.statusCode = statusCode;
  return error;
};

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

exports.getUnassignedSessions = catchAsync(async (req, res, next) => {
  const sessions = await prisma.session.findMany({
    where: { status: 'UNASSIGNED' },
    include: {
      assignment: {
        include: {
          course: { select: { courseCode: true, courseName: true } },
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

  res.json(sessions);
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

  // Every session the lecturer scheduled for those courses — not just the ones
  // attached to this tutor's own assignments. A session belongs to the tutor's
  // dashboard when its assignment's course has an assignment for them,
  // which is exactly how the organiser links tutors to courses.
  const sessions = await prisma.session.findMany({
    where: {
      assignment: {
        course: { assignments: { some: { userId } } },
      },
    },
    include: {
      assignment: {
        select: {
          userId: true,
          courseId: true,
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
    orderBy: [{ date: 'asc' }, { id: 'asc' }],
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
  // weekly slots, so the hours are counted per teaching week — the Monday-to-
  // Sunday week of the tutor's next scheduled session.
  const MILLISECONDS_PER_DAY = 24 * 60 * 60 * 1000;
  const todayStart = new Date();
  todayStart.setUTCHours(0, 0, 0, 0);

  // findMany already ordered by date ascending, so the first entry is the
  // earliest session the tutor still leads.
  const myUpcomingSessions = sessions.filter(
    (session) =>
      session.assignment.userId === userId &&
      session.status === 'SCHEDULED' &&
      session.date.getTime() >= todayStart.getTime(),
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

  const inTeachingWeek = (session) => {
    if (!teachingWeekStart) return false;
    const time = session.date.getTime();
    return time >= teachingWeekStart.getTime() && time < teachingWeekEnd;
  };

  // The dashboard's "This week" card answers a different question than the
  // teaching week above: how much of the tutor's weekly cap does the current
  // calendar week use? Its window is the Monday-to-Sunday week containing
  // today, and days that already passed still count — those are hours the
  // tutor has already led against this week's cap.
  const currentWeekStart = new Date(todayStart);
  currentWeekStart.setUTCDate(currentWeekStart.getUTCDate() - ((currentWeekStart.getUTCDay() + 6) % 7));
  const currentWeekEnd = currentWeekStart.getTime() + 7 * MILLISECONDS_PER_DAY;

  const weekScheduledHours =
    Math.round(
      sessions
        .filter(
          (session) =>
            session.assignment.userId === userId &&
            session.status === 'SCHEDULED' &&
            session.date.getTime() >= currentWeekStart.getTime() &&
            session.date.getTime() < currentWeekEnd,
        )
        .reduce((total, session) => total + sessionHours(session), 0) * 10,
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
              (session) =>
                session.assignment.courseId === assignment.course.id && inTeachingWeek(session),
            )
            .reduce((total, session) => total + sessionHours(session), 0) * 10,
        ) / 10,
    })),
    sessions: sessions.map((session) => ({
      id: session.id,
      date: session.date,
      status: session.status,
      excuseReason: session.excuseReason,
      // isMine — the session is attached to this tutor's own assignment, so
      // they are the tutor expected to run it (and the one who can excuse it).
      isMine: session.assignment.userId === userId,
      ledBy: session.assignment.user
        ? `${session.assignment.user.firstName} ${session.assignment.user.lastName}`
        : null,
      course: session.assignment.course,
      courseSlot: {
        id: session.courseSlot.id,
        dayOfWeek: session.courseSlot.dayOfWeek,
        venue: session.courseSlot.venue,
        sessionType: session.courseSlot.sessionType,
        timeSlot: session.courseSlot.timeSlot,
      },
    })),
  });
});

// Loads the requesting user and verifies they have the LECTURER role.
// Shared by the lecturer-only session endpoints.
const requireLecturerProfile = async (req, next) => {
  const requestingUser = await prisma.user.findUnique({
    where: { firebaseUid: req.user.user_id },
  });
  if (!requestingUser) {
    next(createHttpError(404, 'User not found. Please check if the user exists'));
    return null;
  }
  if (requestingUser.role !== 'LECTURER') {
    next(createHttpError(403, 'Only lecturers can schedule and view course sessions'));
    return null;
  }
  return requestingUser;
};

exports.getLecturerSessions = catchAsync(async (req, res, next) => {
  const requestingUser = await requireLecturerProfile(req, next);
  if (!requestingUser) return;

  // Everything the lecturer needs to schedule sessions for THEIR courses only:
  // the course's weekly slots, its assigned tutors, and the sessions already
  // scheduled (flattened across the course's tutor assignments).
  const courses = await prisma.course.findMany({
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
  });

  res.json({
    courses: courses.map((course) => {
      const scheduledSessions = course.assignments.flatMap((assignment) =>
        assignment.sessions.map((session) => ({
          id: session.id,
          date: session.date,
          status: session.status,
          excuseReason: session.excuseReason,
          assignmentId: assignment.id,
          tutorName: assignment.user
            ? `${assignment.user.firstName} ${assignment.user.lastName}`
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
        sessions: scheduledSessions,
      };
    }),
  });
});

exports.scheduleSession = catchAsync(async (req, res, next) => {
  const { assignmentId, courseSlotId, date } = req.body || {};

  const parsedAssignmentId = Number(assignmentId);
  const parsedCourseSlotId = Number(courseSlotId);
  if (!Number.isInteger(parsedAssignmentId) || !Number.isInteger(parsedCourseSlotId)) {
    return next(createHttpError(400, 'assignmentId and courseSlotId must be valid integers'));
  }

  // The date input sends yyyy-mm-dd; new Date() then yields a deterministic
  // UTC-midnight timestamp that the duplicate check below can rely on.
  const sessionDate = date ? new Date(date) : null;
  if (!sessionDate || Number.isNaN(sessionDate.getTime())) {
    return next(createHttpError(400, 'A valid session date is required'));
  }

  const requestingUser = await requireLecturerProfile(req, next);
  if (!requestingUser) return;

  // The assignment decides both the tutor who runs the session and the course
  // it belongs to, so validating it covers the whole ownership chain.
  const assignment = await prisma.tutorAssignment.findUnique({
    where: { id: parsedAssignmentId },
    include: {
      course: {
        select: { id: true, courseCode: true, courseName: true, userId: true },
      },
    },
  });
  if (!assignment) {
    return next(createHttpError(404, 'Tutor assignment not found. Please check if it exists'));
  }
  if (assignment.course.userId !== requestingUser.id) {
    return next(createHttpError(403, 'You can only schedule sessions for your own courses'));
  }

  const courseSlot = await prisma.courseSlot.findUnique({
    where: { id: parsedCourseSlotId },
  });
  if (!courseSlot) {
    return next(createHttpError(404, 'Course slot not found. Please check if it exists'));
  }
  if (courseSlot.courseId !== assignment.courseId) {
    return next(createHttpError(400, 'The selected time slot does not belong to this course'));
  }

  const duplicate = await prisma.session.findFirst({
    where: {
      assignmentId: parsedAssignmentId,
      courseSlotId: parsedCourseSlotId,
      date: sessionDate,
    },
  });
  if (duplicate) {
    return next(createHttpError(409, 'A session is already scheduled for this tutor, time slot and date'));
  }

  const session = await prisma.session.create({
    data: {
      assignmentId: parsedAssignmentId,
      courseSlotId: parsedCourseSlotId,
      date: sessionDate,
      status: 'SCHEDULED',
    },
    include: {
      assignment: {
        select: {
          course: { select: { courseCode: true, courseName: true } },
          user: { select: { firstName: true, lastName: true } },
        },
      },
      courseSlot: { include: { timeSlot: true } },
    },
  });

  res.status(201).json(session);
});

exports.excuseSession = catchAsync(async (req, res, next) => {
  const sessionId = parseSessionId(req.params.id);
  if (!sessionId) {
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

  // Every SessionVolunteer record for this user whose status has not been
  // rejected — PENDING means awaiting approval, APPROVED means confirmed.
  const volunteerRecords = await prisma.sessionVolunteer.findMany({
    where: {
      userId: requestingUser.id,
      status: { in: ['PENDING', 'APPROVED'] },
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
  if (requestingUser.role !== 'STUDENT') {
    return next(createHttpError(403, 'Only students can volunteer for unassigned sessions'));
  }

  try {
    // The volunteer record and the session status flip happen atomically, and the
    // unique constraint on SessionVolunteer.sessionId stops two students from
    // volunteering for the same session.
    const volunteerAssignment = await prisma.$transaction(async (tx) => {
      const session = await tx.session.findUnique({ where: { id: sessionId } });
      if (!session) {
        throw createHttpError(404, 'Session not found. Please check if the session exists');
      }
      if (session.status !== 'UNASSIGNED') {
        throw createHttpError(409, 'This session is no longer available for volunteering');
      }

      // PENDING on purpose: volunteering must never confirm the assignment directly.
      const createdVolunteerAssignment = await tx.sessionVolunteer.create({
        data: { sessionId, userId: requestingUser.id, status: 'PENDING' },
      });
      await tx.session.update({ where: { id: sessionId }, data: { status: 'PENDING' } });

      return createdVolunteerAssignment;
    });

    res.status(201).json(volunteerAssignment);
  } catch (error) {
    // P2002 is the unique-constraint failure raised when another student beat us to it.
    if (error.code === 'P2002') {
      return next(createHttpError(409, 'Another student has already volunteered for this session'));
    }
    throw error;
  }
});
