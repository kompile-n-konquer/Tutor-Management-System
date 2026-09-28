const prisma = require('../prisma/client');
const catchAsync = require('../utils/catchAsync');

// Collapses a Prisma groupBy result into a plain { STATUS: count } map so the
// response shape is stable even when a status currently has no rows.
const countByStatus = (groups) =>
  groups.reduce((acc, group) => {
    acc[group.status] = group._count?._all ?? 0;
    return acc;
  }, {});

const hoursByStatus = (groups, status) =>
  groups.find((group) => group.status === status)?._sum?.totalHours ?? 0;

// ── GET /analytics/organiser ────────────────────────────────────────────────
// Live KPI aggregates for the organiser analytics page: staffing coverage,
// timesheet sign-off progress, application pipeline and per-tutor workload.
// Every figure is computed from the database on each request so a refresh
// always reflects the current data — nothing is mocked or cached.
exports.getOrganiserAnalytics = catchAsync(async (req, res, next) => {
  const user = await prisma.user.findUnique({ where: { firebaseUid: req.user.user_id } });
  if (!user) {
    const error = new Error('User not found. Please check if the user exists');
    error.statusCode = 404;
    return next(error);
  }

  const role = user.role.toUpperCase();
  if (role !== 'ORGANISER' && role !== 'ADMIN') {
    const error = new Error('Only organisers can view organiser analytics');
    error.statusCode = 403;
    return next(error);
  }

  const now = new Date();

  const [
    tutorCount,
    lecturerCount,
    studentCount,
    courses,
    eventCount,
    upcomingEventCount,
    sessionGroups,
    roleApplicationGroups,
    courseApplicationGroups,
    timesheetGroups,
    workloadGroups,
  ] = await Promise.all([
    prisma.user.count({ where: { role: 'TUTOR' } }),
    prisma.user.count({ where: { role: 'LECTURER' } }),
    prisma.user.count({ where: { role: 'STUDENT' } }),
    prisma.course.findMany({
      select: {
        id: true,
        courseCode: true,
        courseName: true,
        tutorsRequired: true,
        _count: { select: { assignments: true } },
      },
      orderBy: { courseCode: 'asc' },
    }),
    prisma.event.count(),
    prisma.event.count({ where: { date: { gte: now } } }),
    prisma.session.groupBy({ by: ['status'], _count: { _all: true } }),
    prisma.roleApplication.groupBy({ by: ['status'], _count: { _all: true } }),
    prisma.application.groupBy({ by: ['status'], _count: { _all: true } }),
    prisma.timesheet.groupBy({
      by: ['status'],
      _count: { _all: true },
      _sum: { totalHours: true },
    }),
    // Approved and awaiting-review hours per tutor for the workload card.
    prisma.timesheet.groupBy({
      by: ['userId', 'status'],
      where: { status: { in: ['APPROVED', 'SUBMITTED'] } },
      _sum: { totalHours: true },
    }),
  ]);

  const sessionCounts = countByStatus(sessionGroups);
  const roleAppCounts = countByStatus(roleApplicationGroups);
  const courseAppCounts = countByStatus(courseApplicationGroups);
  const timesheetCounts = countByStatus(timesheetGroups);

  const requiredTotal = courses.reduce((total, course) => total + course.tutorsRequired, 0);
  const assignedTotal = courses.reduce((total, course) => total + course._count.assignments, 0);
  const understaffedCourses = courses.filter(
    (course) => course._count.assignments < course.tutorsRequired,
  );

  // The sign-off rate only covers timesheets that entered the review pipeline —
  // drafts are excluded because nobody has submitted them yet.
  const reviewedTimesheets =
    timesheetCounts.SUBMITTED + timesheetCounts.APPROVED + timesheetCounts.REJECTED;

  // Collapse the per-status groups into one row per tutor.
  const workloadByUser = new Map();
  workloadGroups.forEach((group) => {
    const row = workloadByUser.get(group.userId) ?? {
      userId: group.userId,
      approvedHours: 0,
      submittedHours: 0,
    };
    if (group.status === 'APPROVED') row.approvedHours += group._sum?.totalHours ?? 0;
    if (group.status === 'SUBMITTED') row.submittedHours += group._sum?.totalHours ?? 0;
    workloadByUser.set(group.userId, row);
  });

  const workloadIds = [...workloadByUser.keys()];
  const workloadUsers = workloadIds.length
    ? await prisma.user.findMany({
        where: { id: { in: workloadIds } },
        select: { id: true, firstName: true, lastName: true },
      })
    : [];
  const nameById = new Map(
    workloadUsers.map((tutor) => [tutor.id, `${tutor.firstName} ${tutor.lastName}`]),
  );

  const workload = [...workloadByUser.values()]
    .map((row) => ({ ...row, name: nameById.get(row.userId) ?? 'Unknown tutor' }))
    .sort(
      (a, b) =>
        b.approvedHours - a.approvedHours ||
        b.submittedHours - a.submittedHours ||
        a.name.localeCompare(b.name),
    );

  res.status(200).json({
    totals: {
      tutors: tutorCount,
      lecturers: lecturerCount,
      students: studentCount,
      courses: courses.length,
      events: eventCount,
      upcomingEvents: upcomingEventCount,
    },
    staffing: {
      required: requiredTotal,
      assigned: assignedTotal,
      understaffedCourses: understaffedCourses.length,
      courses: courses.map((course) => ({
        id: course.id,
        courseCode: course.courseCode,
        courseName: course.courseName,
        tutorsRequired: course.tutorsRequired,
        assigned: course._count.assignments,
      })),
    },
    sessions: {
      scheduled: sessionCounts.SCHEDULED ?? 0,
      unassigned: sessionCounts.UNASSIGNED ?? 0,
      pendingCover: sessionCounts.PENDING ?? 0,
    },
    timesheets: {
      draft: timesheetCounts.DRAFT ?? 0,
      submitted: timesheetCounts.SUBMITTED ?? 0,
      approved: timesheetCounts.APPROVED ?? 0,
      rejected: timesheetCounts.REJECTED ?? 0,
      approvedHours: hoursByStatus(timesheetGroups, 'APPROVED'),
      submittedHours: hoursByStatus(timesheetGroups, 'SUBMITTED'),
      signOffRate:
        reviewedTimesheets > 0
          ? Math.round((timesheetCounts.APPROVED / reviewedTimesheets) * 100)
          : 0,
    },
    applications: {
      role: {
        pending: roleAppCounts.PENDING ?? 0,
        approved: roleAppCounts.APPROVED ?? 0,
        rejected: roleAppCounts.REJECTED ?? 0,
      },
      course: {
        pending: courseAppCounts.PENDING ?? 0,
        assigned: courseAppCounts.ASSIGNED ?? 0,
        rejected: courseAppCounts.REJECTED ?? 0,
      },
    },
    workload,
  });
});
