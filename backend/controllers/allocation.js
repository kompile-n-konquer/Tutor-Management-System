const prisma = require('../prisma/client');
const catchAsync = require('../utils/catchAsync');
const { notifyAssignmentAdded, notifyAssignmentRemoved } = require('../email/notifier');

/**
 * GET /api/allocation/available-tutors
 *
 * Returns applicants ranked by courseMark (descending) so the organiser
 * can see the strongest candidates first.  Applicants who already hold a
 * TutorAssignment for the course they applied to are excluded – they
 * belong in the "Assigned Tutors" list instead.  Rejected applicants
 * (rejected by the organiser here or via the onboarding review) do not
 * reappear in the pool.
 *
 * Optional query params:
 *   courseId – limit results to a single course
 */
exports.getAvailableTutors = catchAsync(async (req, res, next) => {
  const { courseId } = req.query;

  const where = { status: { not: 'REJECTED' } };

  if (courseId) {
    const parsedCourseId = parseInt(courseId, 10);
    if (isNaN(parsedCourseId)) {
      const error = new Error('courseId must be a valid integer');
      error.statusCode = 400;
      return next(error);
    }
    where.courseId = parsedCourseId;
  }

  const applications = await prisma.application.findMany({
    where,
    orderBy: [
      { courseMark: 'desc' },
      { id: 'asc' }, // deterministic tiebreak
    ],
    include: {
      user: { select: { firstName: true, lastName: true, email: true } },
      course: { select: { courseCode: true, courseName: true, minimumMark: true } },
    },
  });

  // Exclude applicants who already have a TutorAssignment for the same
  // userId + courseId (the old schema had a direct relation; the new schema
  // correlates through shared userId and courseId).
  const assignedPairs = new Set(
    (await prisma.tutorAssignment.findMany({
      select: { userId: true, courseId: true },
    })).map((a) => `${a.userId}:${a.courseId}`),
  );

  const availableTutors = applications
    .filter((a) => !assignedPairs.has(`${a.userId}:${a.courseId}`))
    .map((a) => ({
      applicantId: a.id,
      userId: a.userId,
      name: `${a.user.firstName} ${a.user.lastName}`,
      email: a.user.email,
      courseId: a.courseId,
      courseCode: a.course.courseCode,
      courseName: a.course.courseName,
      courseMark: a.courseMark,
      minimumMark: a.course.minimumMark,
      applicationStatus: a.status,
    }));

  res.json({ availableTutors });
});

/**
 * POST /api/allocation/assignments
 *
 * Transfer an applicant from the "Available Tutors" pool into the
 * "Assigned Tutors" list by creating a TutorAssignment record.
 *
 * Body:
 *   applicantId – (required) the Application to assign
 *   semester    – (optional) semester label, e.g. "2026-S2"
 */
exports.assignTutor = catchAsync(async (req, res, next) => {
  const { applicantId, semester } = req.body;

  // ── Input validation ───────────────────────────────────────────────
  if (!applicantId || !Number.isInteger(Number(applicantId))) {
    const error = new Error('A valid integer applicantId is required');
    error.statusCode = 400;
    return next(error);
  }

  const parsedApplicantId = Number(applicantId);

  // ── Look up the application ────────────────────────────────────────
  const application = await prisma.application.findUnique({
    where: { id: parsedApplicantId },
    include: { user: true },
  });

  if (!application) {
    const error = new Error('Applicant not found');
    error.statusCode = 404;
    return next(error);
  }

  // ── Guard against duplicate assignment ─────────────────────────────
  const existingAssignment = await prisma.tutorAssignment.findFirst({
    where: { userId: application.userId, courseId: application.courseId },
  });

  if (existingAssignment) {
    const error = new Error('This applicant is already assigned to this course');
    error.statusCode = 400;
    return next(error);
  }

  // ── Enforce the course's tutorsRequired cap ────────────────────────
  // The organiser may not assign more tutors than the course requires.
  // The applicant stays in the Available pool (nothing is mutated) so
  // they can still be assigned to another course.
  const course = await prisma.course.findUnique({
    where: { id: application.courseId },
    select: { courseCode: true, courseName: true, tutorsRequired: true },
  });

  const assignedCount = await prisma.tutorAssignment.count({
    where: { courseId: application.courseId },
  });

  if (course && assignedCount >= course.tutorsRequired) {
    const error = new Error(
      `Maximum number of required tutors (${course.tutorsRequired}) has already been reached for ${course.courseCode} - ${course.courseName}`,
    );
    error.statusCode = 409;
    return next(error);
  }

  // ── Create the assignment and update the user role in a transaction ─
  const assignment = await prisma.$transaction(async (tx) => {
    // Ensure the user has the TUTOR role
    await tx.user.update({
      where: { id: application.userId },
      data: { role: 'TUTOR' },
    });

    const newAssignment = await tx.tutorAssignment.create({
      data: {
        userId: application.userId,
        courseId: application.courseId,
        semester: semester ?? '',
      },
      include: {
        course: { select: { courseCode: true, courseName: true } },
        user: { select: { id: true, firstName: true, lastName: true, email: true } },
      },
    });

    // Mark the application as assigned
    await tx.application.update({
      where: { id: parsedApplicantId },
      data: { status: 'ASSIGNED', reviewedAt: new Date() },
    });

    return newAssignment;
  });

  // Fire-and-forget: email the newly assigned tutor. sendNotification never
  // throws (every failure is logged in EmailLog instead), so a Resend outage
  // can never fail the assignment request itself.
  notifyAssignmentAdded(assignment).catch(() => {});

  res.status(201).json({ assignment });
});

/**
 * GET /api/allocation/assignments
 *
 * List all current tutor assignments with related applicant / course data
 * so the organiser can see who is in the "Assigned Tutors" list.
 *
 * Optional query params:
 *   courseId – limit results to a single course
 */
exports.getAssignedTutors = catchAsync(async (req, res, next) => {
  const { courseId } = req.query;

  const where = {};
  if (courseId) {
    const parsedCourseId = parseInt(courseId, 10);
    if (isNaN(parsedCourseId)) {
      const error = new Error('courseId must be a valid integer');
      error.statusCode = 400;
      return next(error);
    }
    where.courseId = parsedCourseId;
  }

  const assignments = await prisma.tutorAssignment.findMany({
    where,
    include: {
      user: { select: { firstName: true, lastName: true, email: true } },
      course: { select: { courseCode: true, courseName: true } },
    },
    orderBy: { id: 'asc' },
  });

  const assignedTutors = assignments.map((a) => ({
    assignmentId: a.id,
    applicantId: a.userId,
    name: a.user
      ? `${a.user.firstName} ${a.user.lastName}`
      : null,
    email: a.user?.email ?? null,
    courseId: a.courseId,
    courseCode: a.course.courseCode,
    courseName: a.course.courseName,
    semester: a.semester,
  }));

  res.json({ assignedTutors });
});

/**
 * DELETE /api/allocation/assignments/:applicantId
 *
 * Remove a tutor assignment and return the applicant to the
 * "Available Tutors" pool.
 */
exports.unassignTutor = catchAsync(async (req, res, next) => {
  const applicantId = parseInt(req.params.applicantId, 10);

  if (isNaN(applicantId)) {
    const error = new Error('applicantId must be a valid integer');
    error.statusCode = 400;
    return next(error);
  }

  // Look up the Application, then find the TutorAssignment by userId + courseId
  const application = await prisma.application.findUnique({
    where: { id: applicantId },
  });

  if (!application) {
    const error = new Error('Application not found for this applicant');
    error.statusCode = 404;
    return next(error);
  }

  const assignment = await prisma.tutorAssignment.findFirst({
    where: { userId: application.userId, courseId: application.courseId },
    include: {
      course: { select: { courseCode: true, courseName: true } },
      user: { select: { id: true, firstName: true, lastName: true, email: true } },
    },
  });

  if (!assignment) {
    const error = new Error('Assignment not found for this applicant');
    error.statusCode = 404;
    return next(error);
  }

  await prisma.$transaction(async (tx) => {
    await tx.tutorAssignment.delete({ where: { id: assignment.id } });

    await tx.application.update({
      where: { id: applicantId },
      data: { status: 'PENDING', reviewedAt: null },
    });
  });

  // Fire-and-forget removal notification, loaded before the row was deleted.
  notifyAssignmentRemoved(assignment).catch(() => {});

  res.status(204).end();
});

/**
 * DELETE /api/allocation/assignments/:applicantId/remove
 *
 * Permanently remove a tutor from a course.  Unlike unassignTutor
 * (which returns the applicant to the Available pool), this sets the
 * application status to REJECTED so they will not reappear anywhere.
 */
exports.removeTutor = catchAsync(async (req, res, next) => {
  const applicantId = parseInt(req.params.applicantId, 10);

  if (isNaN(applicantId)) {
    const error = new Error('applicantId must be a valid integer');
    error.statusCode = 400;
    return next(error);
  }

  // Look up the Application, then find the TutorAssignment by userId + courseId
  const application = await prisma.application.findUnique({
    where: { id: applicantId },
  });

  if (!application) {
    const error = new Error('Application not found for this applicant');
    error.statusCode = 404;
    return next(error);
  }

  const assignment = await prisma.tutorAssignment.findFirst({
    where: { userId: application.userId, courseId: application.courseId },
    include: {
      course: { select: { courseCode: true, courseName: true } },
      user: { select: { id: true, firstName: true, lastName: true, email: true } },
    },
  });

  if (!assignment) {
    const error = new Error('Assignment not found for this applicant');
    error.statusCode = 404;
    return next(error);
  }

  await prisma.$transaction(async (tx) => {
    await tx.tutorAssignment.delete({ where: { id: assignment.id } });

    await tx.application.update({
      where: { id: applicantId },
      data: { status: 'REJECTED', reviewedAt: new Date() },
    });
  });

  // Fire-and-forget removal notification, loaded before the row was deleted.
  notifyAssignmentRemoved(assignment).catch(() => {});

  res.status(204).end();
});
