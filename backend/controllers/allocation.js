const prisma = require('../prisma/client');
const catchAsync = require('../utils/catchAsync');

const DEFAULT_ALLOCATED_HOURS = 5;

/**
 * GET /api/allocation/available-tutors
 *
 * Returns applicants ranked by courseMark (descending) so the organiser
 * can see the strongest candidates first.  Applicants who already hold a
 * TutorAssignment for the course they applied to are excluded – they
 * belong in the "Assigned Tutors" list instead.
 *
 * Optional query params:
 *   courseId – limit results to a single course
 */
exports.getAvailableTutors = catchAsync(async (req, res, next) => {
  const { courseId } = req.query;

  // Build a filter that excludes applicants who already have an
  // assignment for the course they applied to.
  const where = {
    NOT: {
      tutorAssignment: { isNot: null },
    },
  };

  if (courseId) {
    const parsedCourseId = parseInt(courseId, 10);
    if (isNaN(parsedCourseId)) {
      const error = new Error('courseId must be a valid integer');
      error.statusCode = 400;
      return next(error);
    }
    where.courseId = parsedCourseId;
  }

  const applicants = await prisma.applicant.findMany({
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

  const availableTutors = applicants.map((a) => ({
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
    availability: a.availability,
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
 *   applicantId    – (required) the Applicant to assign
 *   allocatedHours – (optional, default 5) hours allocated for the semester
 *   semester       – (optional) semester label, e.g. "2026-S2"
 */
exports.assignTutor = catchAsync(async (req, res, next) => {
  const { applicantId, allocatedHours, semester } = req.body;

  // ── Input validation ───────────────────────────────────────────────
  if (!applicantId || !Number.isInteger(Number(applicantId))) {
    const error = new Error('A valid integer applicantId is required');
    error.statusCode = 400;
    return next(error);
  }

  const parsedApplicantId = Number(applicantId);

  // ── Look up the applicant ──────────────────────────────────────────
  const applicant = await prisma.applicant.findUnique({
    where: { id: parsedApplicantId },
    include: { user: true },
  });

  if (!applicant) {
    const error = new Error('Applicant not found');
    error.statusCode = 404;
    return next(error);
  }

  // ── Guard against duplicate assignment ─────────────────────────────
  const existingAssignment = await prisma.tutorAssignment.findUnique({
    where: { applicantId: parsedApplicantId },
  });

  if (existingAssignment) {
    const error = new Error('This applicant is already assigned to this course');
    error.statusCode = 400;
    return next(error);
  }

  // ── Ensure a Tutor row exists for the user ─────────────────────────
  let tutor = await prisma.tutor.findUnique({
    where: { userId: applicant.userId },
  });

  let tutorId = tutor ? tutor.id : null;

  // ── Create the assignment (and Tutor if needed) in a transaction ───
  const assignment = await prisma.$transaction(async (tx) => {
    if (!tutor) {
      tutor = await tx.tutor.create({
        data: {
          userId: applicant.userId,
          hourlyRate: null,
          maxHoursPerWeek: 10,
          availableHours: 10,
          currentHours: 0,
          status: 'ACTIVE',
        },
      });
      tutorId = tutor.id;
    }

    const newAssignment = await tx.tutorAssignment.create({
      data: {
        tutorId,
        courseId: applicant.courseId,
        applicantId: parsedApplicantId,
        allocatedHours: allocatedHours ?? DEFAULT_ALLOCATED_HOURS,
        semester: semester ?? '',
        status: 'ACTIVE',
      },
      include: {
        course: { select: { courseCode: true, courseName: true } },
        applicant: {
          include: {
            user: { select: { firstName: true, lastName: true, email: true } },
          },
        },
      },
    });

    // Mark the applicant as assigned
    await tx.applicant.update({
      where: { id: parsedApplicantId },
      data: { status: 'ASSIGNED', reviewedAt: new Date() },
    });

    return newAssignment;
  });

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
      applicant: {
        include: {
          user: { select: { firstName: true, lastName: true, email: true } },
        },
      },
      course: { select: { courseCode: true, courseName: true } },
    },
    orderBy: { id: 'asc' },
  });

  const assignedTutors = assignments.map((a) => ({
    assignmentId: a.id,
    applicantId: a.applicantId,
    tutorId: a.tutorId,
    name: a.applicant
      ? `${a.applicant.user.firstName} ${a.applicant.user.lastName}`
      : null,
    email: a.applicant?.user.email ?? null,
    courseId: a.courseId,
    courseCode: a.course.courseCode,
    courseName: a.course.courseName,
    allocatedHours: a.allocatedHours,
    semester: a.semester,
    status: a.status,
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

  const assignment = await prisma.tutorAssignment.findUnique({
    where: { applicantId },
  });

  if (!assignment) {
    const error = new Error('Assignment not found for this applicant');
    error.statusCode = 404;
    return next(error);
  }

  await prisma.$transaction(async (tx) => {
    await tx.tutorAssignment.delete({ where: { id: assignment.id } });

    await tx.applicant.update({
      where: { id: applicantId },
      data: { status: 'PENDING', reviewedAt: null },
    });
  });

  res.status(204).end();
});

/**
 * DELETE /api/allocation/assignments/:applicantId/remove
 *
 * Permanently remove a tutor from a course.  Unlike unassignTutor
 * (which returns the applicant to the Available pool), this sets the
 * applicant status to REJECTED so they will not reappear anywhere.
 */
exports.removeTutor = catchAsync(async (req, res, next) => {
  const applicantId = parseInt(req.params.applicantId, 10);

  if (isNaN(applicantId)) {
    const error = new Error('applicantId must be a valid integer');
    error.statusCode = 400;
    return next(error);
  }

  const assignment = await prisma.tutorAssignment.findUnique({
    where: { applicantId },
  });

  if (!assignment) {
    const error = new Error('Assignment not found for this applicant');
    error.statusCode = 404;
    return next(error);
  }

  await prisma.$transaction(async (tx) => {
    await tx.tutorAssignment.delete({ where: { id: assignment.id } });

    await tx.applicant.update({
      where: { id: applicantId },
      data: { status: 'REJECTED', reviewedAt: new Date() },
    });
  });

  res.status(204).end();
});
