const prisma = require('../prisma/client');
const catchAsync = require('../utils/catchAsync');
const { ROLES } = require('../utils/roles');

// ────────────────────────────────────────────────────────────────────────────
// POST /api/onboarding/apply
// Submit a role application (TUTOR or LECTURER).
//
// Body (tutor):
//   { requestedRole: "TUTOR", courseId: 1, courseMark: 78, hourlyRate: 150, maxHoursPerWeek: 10 }
//   courseId/courseMark select the course the applicant wants to tutor; the
//   course's session slots must fall inside the applicant's availability.
//
// Body (lecturer):
//   { requestedRole: "LECTURER", department: "CSAM", officeLocation: "...", officeHours: "..." }
// ────────────────────────────────────────────────────────────────────────────
exports.submitApplication = catchAsync(async (req, res, next) => {
  const userId = req.user.id;
  const userRole = req.user.role;
  const { requestedRole } = req.body;

  // Only STUDENT users may apply for a new role
  if (userRole !== ROLES.STUDENT) {
    const error = new Error('Only students can submit role applications');
    error.statusCode = 403;
    return next(error);
  }

  // Validate requested role
  if (!requestedRole || ![ROLES.TUTOR, ROLES.LECTURER].includes(requestedRole)) {
    const error = new Error('requestedRole must be TUTOR or LECTURER');
    error.statusCode = 400;
    return next(error);
  }

  // Prevent duplicate PENDING applications for the same role
  const existingPending = await prisma.roleApplication.findFirst({
    where: { userId, requestedRole, status: 'PENDING' },
  });
  if (existingPending) {
    const error = new Error(`You already have a pending ${requestedRole} application`);
    error.statusCode = 409;
    return next(error);
  }

  // Prevent applying if already approved (user already holds the role)
  const alreadyApproved = await prisma.roleApplication.findFirst({
    where: { userId, requestedRole, status: 'APPROVED' },
  });
  if (alreadyApproved) {
    const error = new Error(`Your ${requestedRole} application has already been approved`);
    error.statusCode = 409;
    return next(error);
  }

  // ── Tutor-specific: require availability to be configured first ──
  if (requestedRole === ROLES.TUTOR) {
    const availabilityCount = await prisma.availability.count({
      where: { userId },
    });
    if (availabilityCount === 0) {
      const error = new Error(
        'You must configure your availability before applying to become a tutor. ' +
          'Go to your Profile > Edit Timetable to set your available time slots.',
      );
      error.statusCode = 400;
      return next(error);
    }

    const { hourlyRate, maxHoursPerWeek, courseId, courseMark } = req.body;

    if (!maxHoursPerWeek || maxHoursPerWeek < 1 || maxHoursPerWeek > 40) {
      const error = new Error('maxHoursPerWeek is required and must be between 1 and 40');
      error.statusCode = 400;
      return next(error);
    }

    // ── Course choice: the applicant picks the course they want to tutor ──
    const parsedCourseId = Number(courseId);
    if (!courseId || !Number.isInteger(parsedCourseId)) {
      const error = new Error('courseId is required: choose the course you want to tutor');
      error.statusCode = 400;
      return next(error);
    }

    const parsedMark = Number(courseMark);
    if (courseMark == null || isNaN(parsedMark) || parsedMark < 0 || parsedMark > 100) {
      const error = new Error('courseMark is required and must be between 0 and 100');
      error.statusCode = 400;
      return next(error);
    }

    const course = await prisma.course.findUnique({
      where: { id: parsedCourseId },
      include: { slots: { select: { dayOfWeek: true, timeSlotId: true } } },
    });
    if (!course) {
      const error = new Error('Course not found');
      error.statusCode = 404;
      return next(error);
    }

    if (parsedMark < course.minimumMark) {
      const error = new Error(
        `Your mark (${parsedMark}) is below the minimum required mark (${course.minimumMark}) for ${course.courseCode}`,
      );
      error.statusCode = 400;
      return next(error);
    }

    // Clash check: the lecturer specifies the slots in which the course's
    // sessions take place, so every slot must fall inside the applicant's
    // availability — a single uncovered slot is a clash.
    const availability = await prisma.availability.findMany({
      where: { userId },
      select: { dayOfWeek: true, timeSlotId: true },
    });
    const availableSlots = new Set(availability.map((a) => `${a.dayOfWeek}:${a.timeSlotId}`));
    const clashingSlot = course.slots.find(
      (slot) => !availableSlots.has(`${slot.dayOfWeek}:${slot.timeSlotId}`),
    );
    if (clashingSlot) {
      const error = new Error(
        `Your availability clashes with the session slots for ${course.courseCode} - ${course.courseName}. ` +
          'Add more available time slots on your timetable first.',
      );
      error.statusCode = 400;
      return next(error);
    }

    // One application per course per user
    const existingApplicant = await prisma.application.findFirst({
      where: { userId, courseId: parsedCourseId },
    });
    if (existingApplicant) {
      const error = new Error(`You have already applied to tutor ${course.courseCode}`);
      error.statusCode = 409;
      return next(error);
    }

    // Create the role application and the per-course Application row together
    // (atomically) so the organiser's per-course available pool immediately
    // reflects the chosen course.
    const application = await prisma.$transaction(async (tx) => {
      const roleApp = await tx.roleApplication.create({
        data: {
          userId,
          requestedRole,
          hourlyRate: hourlyRate != null ? Number(hourlyRate) : null,
          maxHoursPerWeek: Number(maxHoursPerWeek),
        },
        include: { user: { select: { firstName: true, lastName: true, email: true } } },
      });

      await tx.application.create({
        data: {
          userId,
          courseId: parsedCourseId,
          courseMark: parsedMark,
          status: 'PENDING',
        },
      });

      return roleApp;
    });

    return res.status(201).json({ application });
  }

  // ── Lecturer-specific fields ──────────────────────────────────────
  if (requestedRole === ROLES.LECTURER) {
    const { department, officeLocation, officeHours } = req.body;

    if (!department) {
      const error = new Error('department is required for lecturer applications');
      error.statusCode = 400;
      return next(error);
    }

    const application = await prisma.roleApplication.create({
      data: {
        userId,
        requestedRole,
        department,
        officeLocation: officeLocation || null,
        officeHours: officeHours || null,
      },
      include: { user: { select: { firstName: true, lastName: true, email: true } } },
    });

    return res.status(201).json({ application });
  }
});

// ────────────────────────────────────────────────────────────────────────────
// GET /api/onboarding/tutor-eligible-courses
// Courses the current user can apply to tutor. The lecturer specifies the
// slots in which a course's sessions take place, so a course is eligible only
// when EVERY course slot falls inside the user's availability — a single
// uncovered slot is a clash and hides the course from the list.
// ────────────────────────────────────────────────────────────────────────────
exports.getTutorEligibleCourses = catchAsync(async (req, res, next) => {
  const userId = req.user.id;

  const [availability, courses] = await Promise.all([
    prisma.availability.findMany({
      where: { userId },
      select: { dayOfWeek: true, timeSlotId: true },
    }),
    prisma.course.findMany({
      select: {
        id: true,
        courseCode: true,
        courseName: true,
        minimumMark: true,
        tutorsRequired: true,
        slots: { select: { dayOfWeek: true, timeSlotId: true } },
        user: { select: { firstName: true, lastName: true } },
      },
      orderBy: { courseCode: 'asc' },
    }),
  ]);

  const availableSlots = new Set(availability.map((a) => `${a.dayOfWeek}:${a.timeSlotId}`));

  const eligibleCourses = courses
    .filter((course) =>
      course.slots.every((slot) => availableSlots.has(`${slot.dayOfWeek}:${slot.timeSlotId}`)),
    )
    .map((course) => ({
      id: course.id,
      courseCode: course.courseCode,
      courseName: course.courseName,
      minimumMark: course.minimumMark,
      tutorsRequired: course.tutorsRequired,
      lecturerName: course.user
        ? `${course.user.firstName} ${course.user.lastName}`
        : null,
      slotCount: course.slots.length,
    }));

  res.json({ eligibleCourses });
});

// ────────────────────────────────────────────────────────────────────────────
// GET /api/onboarding/my-applications
// Return the current user's role applications.
// ────────────────────────────────────────────────────────────────────────────
exports.getMyApplications = catchAsync(async (req, res, next) => {
  const userId = req.user.id;

  const applications = await prisma.roleApplication.findMany({
    where: { userId },
    orderBy: { submittedAt: 'desc' },
  });

  // Also check availability count for the tutor prerequisite indicator
  const availabilityCount = await prisma.availability.count({ where: { userId } });

  res.json({ applications, hasAvailability: availabilityCount > 0 });
});

// ────────────────────────────────────────────────────────────────────────────
// GET /api/onboarding/applications
// (ORGANISER only) Return all pending role applications.
// Optional query: ?status=PENDING&role=TUTOR
// ────────────────────────────────────────────────────────────────────────────
exports.getPendingApplications = catchAsync(async (req, res, next) => {
  const { status, role } = req.query;

  const where = {};
  if (status) {
    where.status = status.toUpperCase();
  } else {
    where.status = 'PENDING';
  }
  if (role) {
    where.requestedRole = role.toUpperCase();
  }

  const applications = await prisma.roleApplication.findMany({
    where,
    orderBy: { submittedAt: 'asc' },
    include: {
      user: {
        select: {
          id: true,
          firstName: true,
          lastName: true,
          email: true,
          studentNumber: true,
          employeeNumber: true,
        },
      },
    },
  });

  // Enrich with availability count for tutor applications
  const enriched = await Promise.all(
    applications.map(async (app) => {
      const availabilityCount = await prisma.availability.count({
        where: { userId: app.userId },
      });
      // For tutor applicants, fetch their course marks from Application records
      const courseMarks = await prisma.application.findMany({
        where: { userId: app.userId },
        include: { course: { select: { courseCode: true, courseName: true } } },
        orderBy: { courseMark: 'desc' },
      });
      return {
        ...app,
        availabilityCount,
        courseMarks: courseMarks.map((cm) => ({
          courseCode: cm.course.courseCode,
          courseName: cm.course.courseName,
          mark: cm.courseMark,
        })),
      };
    }),
  );

  res.json({ applications: enriched });
});

// ────────────────────────────────────────────────────────────────────────────
// GET /api/onboarding/applications/:id
// Return a single application with full details for organiser review.
// ────────────────────────────────────────────────────────────────────────────
exports.getApplicationById = catchAsync(async (req, res, next) => {
  const appId = parseInt(req.params.id, 10);
  if (isNaN(appId)) {
    const error = new Error('Application id must be a valid integer');
    error.statusCode = 400;
    return next(error);
  }

  const application = await prisma.roleApplication.findUnique({
    where: { id: appId },
    include: {
      user: {
        select: {
          id: true,
          firstName: true,
          lastName: true,
          email: true,
          studentNumber: true,
          employeeNumber: true,
          phoneNumber: true,
        },
      },
    },
  });

  if (!application) {
    const error = new Error('Application not found');
    error.statusCode = 404;
    return next(error);
  }

  // Non-organiser users can only view their own applications
  if (req.user.role !== ROLES.ORGANISER && application.userId !== req.user.id) {
    const error = new Error('You do not have permission to view this application');
    error.statusCode = 403;
    return next(error);
  }

  // Enrich with availability slots
  const availability = await prisma.availability.findMany({
    where: { userId: application.userId },
    include: { timeSlot: true },
  });

  // Fetch course marks for rank suggestion
  const courseMarks = await prisma.application.findMany({
    where: { userId: application.userId },
    include: { course: { select: { courseCode: true, courseName: true, minimumMark: true } } },
    orderBy: { courseMark: 'desc' },
  });

  res.json({
    application: {
      ...application,
      availability,
      courseMarks: courseMarks.map((cm) => ({
        courseCode: cm.course.courseCode,
        courseName: cm.course.courseName,
        mark: cm.courseMark,
        minimumMark: cm.course.minimumMark,
      })),
    },
  });
});

// ────────────────────────────────────────────────────────────────────────────
// GET /api/onboarding/applications/:id/rank
// Compute a suitability score for a tutor applicant using the existing
// rank-suggestions approach: course marks and availability coverage.
// ────────────────────────────────────────────────────────────────────────────
exports.getApplicantRank = catchAsync(async (req, res, next) => {
  const appId = parseInt(req.params.id, 10);
  if (isNaN(appId)) {
    const error = new Error('Application id must be a valid integer');
    error.statusCode = 400;
    return next(error);
  }

  const application = await prisma.roleApplication.findUnique({
    where: { id: appId },
  });

  if (!application) {
    const error = new Error('Application not found');
    error.statusCode = 404;
    return next(error);
  }

  if (application.requestedRole !== ROLES.TUTOR) {
    const error = new Error('Rank suggestions are only available for tutor applications');
    error.statusCode = 400;
    return next(error);
  }

  // Gather course marks (same data the existing allocation rank uses)
  const courseMarks = await prisma.application.findMany({
    where: { userId: application.userId },
    include: { course: { select: { courseCode: true, courseName: true, minimumMark: true } } },
  });

  // Availability coverage (how many slots they marked available)
  const availabilityCount = await prisma.availability.count({
    where: { userId: application.userId },
  });
  const totalSlots = await prisma.timeSlot.count();
  const availabilityRatio = totalSlots > 0 ? availabilityCount / (totalSlots * 5) : 0; // 5 weekdays

  // Compute average course mark
  const avgMark =
    courseMarks.length > 0
      ? courseMarks.reduce((sum, cm) => sum + cm.courseMark, 0) / courseMarks.length
      : 0;

  // Rank score: 70% academic performance, 30% availability coverage
  const rankScore = Math.round(avgMark * 0.7 + availabilityRatio * 100 * 0.3);

  res.json({
    rankScore,
    avgCourseMark: Math.round(avgMark * 100) / 100,
    availabilityCount,
    totalPossibleSlots: totalSlots * 5,
    courses: courseMarks.map((cm) => ({
      courseCode: cm.course.courseCode,
      courseName: cm.course.courseName,
      mark: cm.courseMark,
      minimumMark: cm.course.minimumMark,
      aboveMinimum: cm.courseMark >= cm.course.minimumMark,
    })),
  });
});

// ────────────────────────────────────────────────────────────────────────────
// PATCH /api/onboarding/applications/:id/review
// (ORGANISER only) Approve or reject a role application.
//
// Body:
//   { action: "APPROVE" } or { action: "REJECT", rejectionReason: "..." }
// ────────────────────────────────────────────────────────────────────────────
exports.reviewApplication = catchAsync(async (req, res, next) => {
  const appId = parseInt(req.params.id, 10);
  const { action, rejectionReason } = req.body;
  const organiserId = req.user.id;

  if (isNaN(appId)) {
    const error = new Error('Application id must be a valid integer');
    error.statusCode = 400;
    return next(error);
  }

  if (!action || !['APPROVE', 'REJECT'].includes(action.toUpperCase())) {
    const error = new Error('action must be APPROVE or REJECT');
    error.statusCode = 400;
    return next(error);
  }

  const application = await prisma.roleApplication.findUnique({
    where: { id: appId },
    include: { user: true },
  });

  if (!application) {
    const error = new Error('Application not found');
    error.statusCode = 404;
    return next(error);
  }

  if (application.status !== 'PENDING') {
    const error = new Error(`Application has already been ${application.status.toLowerCase()}`);
    error.statusCode = 400;
    return next(error);
  }

  // Prevent self-approval
  if (application.userId === organiserId) {
    const error = new Error('You cannot review your own application');
    error.statusCode = 403;
    return next(error);
  }

  const normalizedAction = action.toUpperCase();

  if (normalizedAction === 'APPROVE') {
    // ── Approve: change role ────────────────────────────────────────
    await prisma.$transaction(async (tx) => {
      // 1. Update the application status
      await tx.roleApplication.update({
        where: { id: appId },
        data: { status: 'APPROVED', reviewedAt: new Date(), reviewedById: organiserId },
      });

      // 2. Change the user's role
      await tx.user.update({
        where: { id: application.userId },
        data: { role: application.requestedRole },
      });
    });

    return res.json({
      message: `Application approved. User is now ${application.requestedRole}.`,
      application: { ...application, status: 'APPROVED' },
    });
  }

  // ── Reject ──────────────────────────────────────────────────────────
  await prisma.roleApplication.update({
    where: { id: appId },
    data: {
      status: 'REJECTED',
      reviewedAt: new Date(),
      reviewedById: organiserId,
      rejectionReason: rejectionReason || null,
    },
  });

  // A rejected tutor applicant must not linger in the per-course available
  // pool. Only PENDING rows are touched — an applicant who was already
  // assigned keeps their assignment.
  if (application.requestedRole === ROLES.TUTOR) {
    await prisma.application.updateMany({
      where: { userId: application.userId, status: 'PENDING' },
      data: { status: 'REJECTED', reviewedAt: new Date() },
    });
  }

  res.json({
    message: `Application rejected.`,
    application: { ...application, status: 'REJECTED' },
  });
});
