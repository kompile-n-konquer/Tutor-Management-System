const prisma = require('../prisma/client');
const catchAsync = require('../utils/catchAsync');
const { notifyAssignmentAdded, notifyAssignmentRemoved } = require('../email/notifier');
const { getTutorMonthlyClaimableHours } = require('../utils/systemSettings');
const { slotHours } = require('../utils/claimRules');
const { emitToOrganisers, emitDashboardChange } = require('../realtime/io');

// Board mutations are attributed to the signed-in organiser so other
// organisers see who changed what on the organiser board.
async function editorFromReq(req) {
  const user = await prisma.user.findUnique({
    where: { id: req.user.id },
    select: { firstName: true, lastName: true },
  });
  return { id: req.user.id, name: user ? `${user.firstName} ${user.lastName}`.trim() : req.user?.email };
}

// Broadcast a board change to every connected organiser (including the
// actor — the client filters its own events out by actorId).
function broadcastAllocationChange(type, courseId, editor) {
  emitToOrganisers('allocation:changed', {
    type,
    courseId,
    actorId: editor.id,
    actorName: editor.name,
    at: new Date().toISOString(),
  });
}

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
  // throws (every failure is logged in EmailLog instead), so a Brevo outage
  // can never fail the assignment request itself.
  notifyAssignmentAdded(assignment).catch(() => {});

  const editor = await editorFromReq(req);
  broadcastAllocationChange('assign', application.courseId, editor);
  // The newly assigned tutor's dashboard gains the course; an organiser
  // sitting on the Dashboard (not the board) refreshes its staffing items.
  emitDashboardChange([application.userId], 'assignment-added', { includeOrganisers: true });

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

  // The unassign/remove endpoints key off the APPLICATION id, not the
  // assignment row or the user id — resolve the real application for each
  // assignment (userId + courseId pair) so drags back to the available pool
  // and the remove (x) button hit the right record instead of 404-ing.
  const applications = assignments.length
    ? await prisma.application.findMany({
        where: {
          OR: assignments.map((a) => ({ userId: a.userId, courseId: a.courseId })),
        },
        select: { id: true, userId: true, courseId: true },
      })
    : [];
  const applicationIdByKey = new Map(
    applications.map((app) => [`${app.userId}:${app.courseId}`, app.id]),
  );

  const assignedTutors = assignments.map((a) => ({
    assignmentId: a.id,
    applicantId: applicationIdByKey.get(`${a.userId}:${a.courseId}`) ?? null,
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

  // Fire-and-forget removal notification, loaded before the row was deleted.
  notifyAssignmentRemoved(assignment).catch(() => {});

  await prisma.$transaction(async (tx) => {
    await tx.tutorAssignment.delete({ where: { id: assignment.id } });

    await tx.application.update({
      where: { id: applicantId },
      data: { status: 'PENDING', reviewedAt: null },
    });
  });

  const editor = await editorFromReq(req);
  broadcastAllocationChange('unassign', application.courseId, editor);
  emitDashboardChange([application.userId], 'assignment-removed', { includeOrganisers: true });

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

  const editor = await editorFromReq(req);
  broadcastAllocationChange('remove', application.courseId, editor);
  emitDashboardChange([application.userId], 'assignment-removed', { includeOrganisers: true });

  res.status(204).end();
});

// ── Auto-Assign ──────────────────────────────────────────────────────────────

// Weekly hours a tutor can claim on a course — same round-up rule as the
// opportunity serializer in applications.js (every slot counts as at least
// one full hour).
const weeklyClaimableHours = (courseSlots) =>
  courseSlots.reduce(
    (total, slot) => total + slotHours(slot.timeSlot.startMinute, slot.timeSlot.endMinute),
    0,
  );

/**
 * POST /api/allocation/auto-assign
 *
 * Fill a course's remaining tutor slots in one click: the top-ranked
 * available applicants (highest courseMark first — the same order as the
 * "Available Tutors" pool) are assigned until the course's tutorsRequired
 * cap is reached. Each candidate is re-validated at allocation time —
 * minimum mark, the organiser-set claimable-hours cap and timetable clashes
 * with their other assigned courses. Candidates who fail a check are skipped
 * with a reason instead of blocking the whole run.
 *
 * Body:
 *   courseId – (required) the course to staff
 *   semester – (optional) semester label, e.g. "2026-S2"
 */
exports.autoAssignTutors = catchAsync(async (req, res, next) => {
  const { courseId, semester } = req.body;

  if (!courseId || !Number.isInteger(Number(courseId))) {
    const error = new Error('A valid integer courseId is required');
    error.statusCode = 400;
    return next(error);
  }
  const parsedCourseId = Number(courseId);

  const course = await prisma.course.findUnique({
    where: { id: parsedCourseId },
    select: {
      id: true,
      courseCode: true,
      courseName: true,
      minimumMark: true,
      tutorsRequired: true,
      slots: { include: { timeSlot: true } },
    },
  });

  if (!course) {
    const error = new Error('Course not found');
    error.statusCode = 404;
    return next(error);
  }

  // ── Enforce the course's tutorsRequired cap ──────────────────────────
  const assignedCount = await prisma.tutorAssignment.count({
    where: { courseId: course.id },
  });
  const remaining = Math.max(0, course.tutorsRequired - assignedCount);

  if (remaining === 0) {
    const error = new Error(
      `Maximum number of required tutors (${course.tutorsRequired}) has already been reached for ${course.courseCode} - ${course.courseName}`,
    );
    error.statusCode = 409;
    return next(error);
  }

  // ── Ranked applicants — same filters and order as the available pool ─
  const applications = await prisma.application.findMany({
    where: { courseId: course.id, status: { not: 'REJECTED' } },
    orderBy: [{ courseMark: 'desc' }, { id: 'asc' }],
    include: {
      user: { select: { id: true, firstName: true, lastName: true, email: true } },
    },
  });

  // Applicants who already hold an assignment for this course are not
  // candidates — they are already in the "Assigned Tutors" list.
  const alreadyAssigned = new Set(
    (
      await prisma.tutorAssignment.findMany({
        where: { courseId: course.id },
        select: { userId: true },
      })
    ).map((assignment) => assignment.userId),
  );
  const candidates = applications.filter((application) => !alreadyAssigned.has(application.userId));

  // ── Everything the re-validation needs, in one round trip ────────────
  const candidateIds = candidates.map((application) => application.userId);
  const [otherAssignments, maxClaimableHours] = await Promise.all([
    candidateIds.length > 0
      ? prisma.tutorAssignment.findMany({
          where: { userId: { in: candidateIds }, courseId: { not: course.id } },
          select: {
            userId: true,
            course: {
              select: {
                courseCode: true,
                slots: { select: { dayOfWeek: true, timeSlotId: true, timeSlot: true } },
              },
            },
          },
        })
      : [],
    getTutorMonthlyClaimableHours(),
  ]);

  const assignmentsByUser = new Map();
  otherAssignments.forEach((assignment) => {
    const list = assignmentsByUser.get(assignment.userId) ?? [];
    list.push(assignment);
    assignmentsByUser.set(assignment.userId, list);
  });

  const courseHours = weeklyClaimableHours(course.slots);
  const courseSlotKeys = new Set(
    course.slots.map((slot) => `${slot.dayOfWeek}-${slot.timeSlotId}`),
  );

  // ── Pick the strongest candidates that still pass every check ────────
  const selected = [];
  const skipped = [];

  for (const application of candidates) {
    if (selected.length >= remaining) break;

    const name = `${application.user.firstName} ${application.user.lastName}`;

    if (application.courseMark < course.minimumMark) {
      skipped.push({
        applicantId: application.id,
        name,
        reason: `Mark ${application.courseMark} is below the course minimum of ${course.minimumMark}`,
      });
      continue;
    }

    const userAssignments = assignmentsByUser.get(application.userId) ?? [];
    const assignedHours = userAssignments.reduce(
      (total, assignment) => total + weeklyClaimableHours(assignment.course.slots),
      0,
    );

    if (maxClaimableHours !== null && assignedHours + courseHours > maxClaimableHours) {
      skipped.push({
        applicantId: application.id,
        name,
        reason: `Would reach ${assignedHours + courseHours}h, above the ${maxClaimableHours}h claimable-hours cap`,
      });
      continue;
    }

    const clashingAssignment = userAssignments.find((assignment) =>
      assignment.course.slots.some((slot) => courseSlotKeys.has(`${slot.dayOfWeek}-${slot.timeSlotId}`)),
    );
    if (clashingAssignment) {
      skipped.push({
        applicantId: application.id,
        name,
        reason: `Timetable clash with already assigned ${clashingAssignment.course.courseCode}`,
      });
      continue;
    }

    selected.push(application);
  }

  // ── Create the assignments, upgrade roles and mark applications ──────
  // Batched into a fixed number of statements regardless of how many tutors
  // are filled: a per-tutor loop of round trips can exceed Prisma's default
  // 5s interactive-transaction timeout on slow/remote databases (P2028,
  // "Transaction not found"), so the call also gets explicit headroom.
  const userIds = selected.map((application) => application.userId);

  let createdAssignments = [];
  if (selected.length > 0) {
    createdAssignments = await prisma.$transaction(
      async (tx) => {
        await tx.user.updateMany({
          where: { id: { in: userIds } },
          data: { role: 'TUTOR' },
        });

        await tx.tutorAssignment.createMany({
          data: selected.map((application) => ({
            userId: application.userId,
            courseId: course.id,
            semester: semester ?? '',
          })),
        });

        await tx.application.updateMany({
          where: { id: { in: selected.map((application) => application.id) } },
          data: { status: 'ASSIGNED', reviewedAt: new Date() },
        });

        // The rows just created, shaped for the response and the
        // assignment-added notification payload
        return tx.tutorAssignment.findMany({
          where: { courseId: course.id, userId: { in: userIds } },
          include: {
            course: { select: { courseCode: true, courseName: true } },
            user: { select: { id: true, firstName: true, lastName: true, email: true } },
          },
        });
      },
      { timeout: 15000, maxWait: 5000 },
    );
  }

  const assignmentByUserId = new Map(
    createdAssignments.map((assignment) => [assignment.userId, assignment]),
  );

  // Fire-and-forget: notify every newly assigned tutor.
  selected.forEach((application) => {
    const assignment = assignmentByUserId.get(application.userId);
    if (assignment) notifyAssignmentAdded(assignment).catch(() => {});
  });

  if (createdAssignments.length > 0) {
    const editor = await editorFromReq(req);
    broadcastAllocationChange('auto-assign', course.id, editor);
    emitDashboardChange(userIds, 'assignment-added', { includeOrganisers: true });
  }

  res.status(200).json({
    courseId: course.id,
    courseCode: course.courseCode,
    courseName: course.courseName,
    assigned: selected.map((application) => ({
      assignmentId: assignmentByUserId.get(application.userId).id,
      applicantId: application.id,
      userId: application.userId,
      name: `${application.user.firstName} ${application.user.lastName}`,
      courseMark: application.courseMark,
    })),
    skipped,
    remaining: remaining - createdAssignments.length,
  });
});
