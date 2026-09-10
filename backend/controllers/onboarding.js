const prisma = require('../prisma/client');
const catchAsync = require('../utils/catchAsync');
const { ROLES } = require('../utils/roles');

// ────────────────────────────────────────────────────────────────────────────
// POST /api/onboarding/apply
// Submit a role application (TUTOR or LECTURER).
//
// Body (tutor):
//   { requestedRole: "TUTOR", hourlyRate: 150, maxHoursPerWeek: 10 }
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

    const { hourlyRate, maxHoursPerWeek } = req.body;

    if (!maxHoursPerWeek || maxHoursPerWeek < 1 || maxHoursPerWeek > 40) {
      const error = new Error('maxHoursPerWeek is required and must be between 1 and 40');
      error.statusCode = 400;
      return next(error);
    }

    const application = await prisma.roleApplication.create({
      data: {
        userId,
        requestedRole,
        hourlyRate: hourlyRate != null ? Number(hourlyRate) : null,
        maxHoursPerWeek: Number(maxHoursPerWeek),
      },
      include: { user: { select: { firstName: true, lastName: true, email: true } } },
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
      // For tutor applicants, fetch their course marks from Applicant records
      const courseMarks = await prisma.applicant.findMany({
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
  const courseMarks = await prisma.applicant.findMany({
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
  const courseMarks = await prisma.applicant.findMany({
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
    // ── Approve: change role and create Tutor/Lecturer record ────────
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

      // 3. Create the appropriate role-specific record
      if (application.requestedRole === ROLES.TUTOR) {
        await tx.tutor.upsert({
          where: { userId: application.userId },
          update: {
            hourlyRate: application.hourlyRate,
            maxHoursPerWeek: application.maxHoursPerWeek || 10,
            status: 'ACTIVE',
            approvedAt: new Date(),
          },
          create: {
            userId: application.userId,
            hourlyRate: application.hourlyRate,
            maxHoursPerWeek: application.maxHoursPerWeek || 10,
            status: 'ACTIVE',
            approvedAt: new Date(),
          },
        });
      } else if (application.requestedRole === ROLES.LECTURER) {
        await tx.lecturer.upsert({
          where: { userId: application.userId },
          update: {
            department: application.department,
            officeLocation: application.officeLocation,
            officeHours: application.officeHours,
          },
          create: {
            userId: application.userId,
            department: application.department || 'Unassigned',
            officeLocation: application.officeLocation,
            officeHours: application.officeHours,
          },
        });
      }
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

  res.json({
    message: `Application rejected.`,
    application: { ...application, status: 'REJECTED' },
  });
});
