const prisma = require('../prisma/client');
const catchAsync = require('../utils/catchAsync');

/**
 * GET /api/courses
 *
 * Returns all courses with the count of currently assigned tutors so the
 * Organiser Board can display allocation progress without extra round-trips.
 */
exports.getAllCourses = catchAsync(async (req, res, next) => {
  const courses = await prisma.course.findMany({
    include: {
      _count: { select: { assignments: true } },
      lecturer: {
        include: {
          user: { select: { firstName: true, lastName: true } },
        },
      },
    },
    orderBy: { courseCode: 'asc' },
  });

  const mapped = courses.map((c) => ({
    id: c.id,
    courseCode: c.courseCode,
    courseName: c.courseName,
    minimumMark: c.minimumMark,
    requiredTutors: c.requiredTutors,
    budgetHours: c.budgetHours,
    hourlyRate: c.hourlyRate,
    assignedCount: c._count.assignments,
    lecturer: c.lecturer
      ? `${c.lecturer.user.firstName} ${c.lecturer.user.lastName}`
      : null,
  }));

  res.json({ courses: mapped });
});
