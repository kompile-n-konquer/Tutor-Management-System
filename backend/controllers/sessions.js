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
    include: { tutor: true },
  });
  if (!requestingUser) {
    return next(createHttpError(404, 'User not found. Please check if the user exists'));
  }
  if (!requestingUser.tutor) {
    return next(createHttpError(403, 'Only tutors can view their assigned sessions'));
  }

  const tutorId = requestingUser.tutor.id;

  // The tutor's ACTIVE assignments — the courses they were approved to tutor.
  const assignments = await prisma.tutorAssignment.findMany({
    where: { tutorId, status: 'ACTIVE' },
    include: {
      course: {
        select: {
          id: true,
          courseCode: true,
          courseName: true,
          lecturer: { select: { user: { select: { firstName: true, lastName: true } } } },
        },
      },
    },
    orderBy: { id: 'asc' },
  });

  // Every session the lecturer scheduled for those courses — not just the ones
  // attached to this tutor's own assignments. A session belongs to the tutor's
  // dashboard when its assignment's course has an ACTIVE assignment for them,
  // which is exactly how the organiser links tutors to courses.
  const sessions = await prisma.session.findMany({
    where: {
      assignment: {
        course: { assignments: { some: { tutorId, status: 'ACTIVE' } } },
      },
    },
    include: {
      assignment: {
        select: {
          tutorId: true,
          courseId: true,
          course: { select: { courseCode: true, courseName: true } },
          tutor: { select: { user: { select: { firstName: true, lastName: true } } } },
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

  res.json({
    maxHoursPerWeek: requestingUser.tutor.maxHoursPerWeek,
    courses: assignments.map((assignment) => ({
      assignmentId: assignment.id,
      courseId: assignment.course.id,
      courseCode: assignment.course.courseCode,
      courseName: assignment.course.courseName,
      allocatedHours: assignment.allocatedHours,
      semester: assignment.semester,
      lecturerName: assignment.course.lecturer?.user
        ? `${assignment.course.lecturer.user.firstName} ${assignment.course.lecturer.user.lastName}`
        : null,
    })),
    sessions: sessions.map((session) => ({
      id: session.id,
      date: session.date,
      status: session.status,
      excuseReason: session.excuseReason,
      // isMine — the session is attached to this tutor's own assignment, so
      // they are the tutor expected to run it (and the one who can excuse it).
      isMine: session.assignment.tutorId === tutorId,
      ledBy: session.assignment.tutor?.user
        ? `${session.assignment.tutor.user.firstName} ${session.assignment.tutor.user.lastName}`
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

// Loads the requesting user with their Lecturer profile, or errors out.
// Shared by the lecturer-only session endpoints.
const requireLecturerProfile = async (req, next) => {
  const requestingUser = await prisma.user.findUnique({
    where: { firebaseUid: req.user.user_id },
    include: { lecturer: true },
  });
  if (!requestingUser) {
    next(createHttpError(404, 'User not found. Please check if the user exists'));
    return null;
  }
  if (!requestingUser.lecturer) {
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
    where: { lecturerId: requestingUser.lecturer.id },
    include: {
      slots: {
        include: { timeSlot: true },
        orderBy: [{ dayOfWeek: 'asc' }, { id: 'asc' }],
      },
      assignments: {
        where: { status: 'ACTIVE' },
        include: {
          tutor: { select: { user: { select: { firstName: true, lastName: true } } } },
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
          tutorName: assignment.tutor?.user
            ? `${assignment.tutor.user.firstName} ${assignment.tutor.user.lastName}`
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
        tutors: course.assignments
          .filter((assignment) => assignment.tutorId != null)
          .map((assignment) => ({
            assignmentId: assignment.id,
            tutorId: assignment.tutorId,
            name: assignment.tutor?.user
              ? `${assignment.tutor.user.firstName} ${assignment.tutor.user.lastName}`
              : null,
            allocatedHours: assignment.allocatedHours,
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
        select: { id: true, courseCode: true, courseName: true, lecturerId: true },
      },
    },
  });
  if (!assignment) {
    return next(createHttpError(404, 'Tutor assignment not found. Please check if it exists'));
  }
  if (assignment.course.lecturerId !== requestingUser.lecturer.id) {
    return next(createHttpError(403, 'You can only schedule sessions for your own courses'));
  }
  if (assignment.status !== 'ACTIVE' || assignment.tutorId == null) {
    return next(createHttpError(409, 'This tutor is not actively assigned to the course'));
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
          tutor: { select: { user: { select: { firstName: true, lastName: true } } } },
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
    include: { tutor: true },
  });
  if (!requestingUser) {
    return next(createHttpError(404, 'User not found. Please check if the user exists'));
  }
  if (!requestingUser.tutor) {
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
  if (session.assignment.tutorId !== requestingUser.tutor.id) {
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
              tutorId: true,
              course: { select: { courseCode: true, courseName: true } },
              tutor: { select: { user: { select: { firstName: true, lastName: true } } } },
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
      ledBy: record.session.assignment.tutor?.user
        ? `${record.session.assignment.tutor.user.firstName} ${record.session.assignment.tutor.user.lastName}`
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
