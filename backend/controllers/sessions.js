const prisma = require('../prisma/client');
const catchAsync = require('../utils/catchAsync');

// Session lifecycle:
//   SCHEDULED  — assigned to a tutor through their TutorAssignment
//   UNASSIGNED — the tutor excused themselves, the session is open for volunteers
//   PENDING    — a student volunteered and is awaiting approval (see SessionVolunteer)

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

  const sessions = await prisma.session.findMany({
    where: { assignment: { tutorId: requestingUser.tutor.id } },
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
