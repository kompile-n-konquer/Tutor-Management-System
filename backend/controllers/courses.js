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
    lecturer: c.lecturer ? `${c.lecturer.user.firstName} ${c.lecturer.user.lastName}` : null,
  }));

  res.json({ courses: mapped });
});

exports.getTimeSlots = catchAsync(async (req, res, next) => {
  const timeSlots = await prisma.timeSlot.findMany({
    orderBy: { startMinute: 'asc' },
  });

  res.status(200).json(timeSlots);
});

exports.createCourse = catchAsync(async (req, res, next) => {
  const firebaseUid = req.user.user_id;

  const user = await prisma.user.findUnique({ where: { firebaseUid } });
  if (!user) {
    const error = new Error('User not found. Please check if the user exists');
    error.statusCode = 404;
    return next(error);
  }

  const role = user.role.toUpperCase();
  if (role !== 'LECTURER' && role !== 'ORGANISER' && role !== 'ADMIN') {
    const error = new Error('Only a lecturer, organiser or admin can create a course');
    error.statusCode = 403;
    return next(error);
  }

  const { courseCode, courseName, minimumMark, tutorsRequired, slots } = req.body;

  if (
    !courseCode ||
    !courseName ||
    minimumMark === undefined ||
    tutorsRequired === undefined ||
    !Array.isArray(slots) ||
    slots.length === 0
  ) {
    const error = new Error(
      'courseCode, courseName, minimumMark, tutorsRequired and at least one tutoring slot are required',
    );
    error.statusCode = 400;
    return next(error);
  }

  const parsedMinimumMark = Number(minimumMark);
  if (Number.isNaN(parsedMinimumMark) || parsedMinimumMark < 0 || parsedMinimumMark > 100) {
    const error = new Error('minimumMark must be a number between 0 and 100');
    error.statusCode = 400;
    return next(error);
  }

  const parsedTutorsRequired = Number(tutorsRequired);
  if (!Number.isInteger(parsedTutorsRequired) || parsedTutorsRequired < 1) {
    const error = new Error('tutorsRequired must be a whole number of at least 1');
    error.statusCode = 400;
    return next(error);
  }

  // Validate every slot before writing anything to the database
  const validDays = [0, 1, 2, 3, 4];
  const timeSlots = await prisma.timeSlot.findMany();
  const validSlotIds = timeSlots.map((slot) => slot.id);

  for (const slot of slots) {
    if (!slot || !validDays.includes(slot.dayOfWeek) || !validSlotIds.includes(slot.timeSlotId)) {
      const error = new Error('Invalid slot. Each slot needs a valid dayOfWeek (0-4) and timeSlotId');
      error.statusCode = 400;
      return next(error);
    }
  }

  const existingCourse = await prisma.course.findUnique({ where: { courseCode } });
  if (existingCourse) {
    const error = new Error('A course with this course code already exists');
    error.statusCode = 409;
    return next(error);
  }

  // Nested slot writes make the course and its slots atomic in one create call
  const course = await prisma.course.create({
    data: {
      courseCode,
      courseName,
      minimumMark: parsedMinimumMark,
      tutorsRequired: parsedTutorsRequired,
      userId: user.id,
      slots: {
        create: slots.map((slot) => ({
          dayOfWeek: slot.dayOfWeek,
          timeSlotId: slot.timeSlotId,
        })),
      },
    },
    include: { slots: true },
  });

  res.status(201).json(course);
});

exports.getCourses = catchAsync(async (req, res, next) => {
  const firebaseUid = req.user.user_id;

  const user = await prisma.user.findUnique({ where: { firebaseUid } });
  if (!user) {
    const error = new Error('User not found. Please check if the user exists');
    error.statusCode = 404;
    return next(error);
  }

  const role = user.role.toUpperCase();
  if (role !== 'LECTURER' && role !== 'ORGANISER' && role !== 'ADMIN') {
    const error = new Error('Only a lecturer, organiser or admin can view courses');
    error.statusCode = 403;
    return next(error);
  }

  // Lecturers only see the courses they created (same visibility rule as
  // events.js); organisers and admins keep the full catalogue required for
  // allocation management.
  const where = role === 'LECTURER' ? { userId: user.id } : {};

  const courses = await prisma.course.findMany({
    where,
    orderBy: { createdAt: 'desc' },
    include: {
      user: { select: { id: true, firstName: true, lastName: true, email: true } },
      _count: { select: { assignments: true, slots: true, applications: true } },
    },
  });

  const courseList = courses.map((course) => {
    const assignedTutors = course._count.assignments;
    return {
      id: course.id,
      courseCode: course.courseCode,
      courseName: course.courseName,
      minimumMark: course.minimumMark,
      tutorsRequired: course.tutorsRequired,
      createdAt: course.createdAt,
      acceptingApplications: course.acceptingApplications,
      lecturer: course.user,
      slotsCount: course._count.slots,
      applicationsCount: course._count.applications,
      assignedTutors,
      tutorsMissing: Math.max(course.tutorsRequired - assignedTutors, 0),
      isAllocated: assignedTutors > 0,
    };
  });

  res.status(200).json(courseList);
});

exports.getCourse = catchAsync(async (req, res, next) => {
  const firebaseUid = req.user.user_id;

  const user = await prisma.user.findUnique({ where: { firebaseUid } });
  if (!user) {
    const error = new Error('User not found. Please check if the user exists');
    error.statusCode = 404;
    return next(error);
  }

  const role = user.role.toUpperCase();
  if (role !== 'LECTURER' && role !== 'ORGANISER' && role !== 'ADMIN') {
    const error = new Error('Only a lecturer, organiser or admin can view course details');
    error.statusCode = 403;
    return next(error);
  }

  const courseId = Number(req.params.courseId);
  if (!Number.isInteger(courseId)) {
    const error = new Error('courseId must be a number');
    error.statusCode = 400;
    return next(error);
  }

  const course = await prisma.course.findUnique({
    where: { id: courseId },
    include: {
      user: { select: { id: true, firstName: true, lastName: true, email: true } },
      slots: {
        include: { timeSlot: true },
        orderBy: [{ dayOfWeek: 'asc' }, { timeSlot: { startMinute: 'asc' } }],
      },
      assignments: {
        include: { user: { select: { firstName: true, lastName: true, email: true } } },
      },
      _count: { select: { applications: true } },
    },
  });

  if (!course) {
    const error = new Error('Course not found');
    error.statusCode = 404;
    return next(error);
  }

  // Lecturers may only inspect the courses they created; organisers and admins
  // keep the global view required for allocation management.
  if (role === 'LECTURER' && course.userId !== user.id) {
    const error = new Error('You can only view courses you have created');
    error.statusCode = 403;
    return next(error);
  }

  const assignedTutors = course.assignments.map((assignment) => ({
    userId: assignment.userId,
    tutorName: `${assignment.user.firstName} ${assignment.user.lastName}`,
    tutorEmail: assignment.user.email,
    semester: assignment.semester,
  }));

  const assignedCount = assignedTutors.length;

  res.status(200).json({
    id: course.id,
    courseCode: course.courseCode,
    courseName: course.courseName,
    minimumMark: course.minimumMark,
    tutorsRequired: course.tutorsRequired,
    acceptingApplications: course.acceptingApplications,
    createdAt: course.createdAt,
    lecturer: course.user,
    slots: course.slots.map((slot) => ({
      id: slot.id,
      dayOfWeek: slot.dayOfWeek,
      timeSlotId: slot.timeSlotId,
      startMinute: slot.timeSlot.startMinute,
      endMinute: slot.timeSlot.endMinute,
      venue: slot.venue,
      sessionType: slot.sessionType,
    })),
    assignedTutors,
    assignedCount,
    tutorsMissing: Math.max(course.tutorsRequired - assignedCount, 0),
    isAllocated: assignedCount > 0,
    applicationsCount: course._count.applications,
  });
});

exports.updateCourse = catchAsync(async (req, res, next) => {
  const firebaseUid = req.user.user_id;

  const user = await prisma.user.findUnique({ where: { firebaseUid } });
  if (!user) {
    const error = new Error('User not found. Please check if the user exists');
    error.statusCode = 404;
    return next(error);
  }

  const role = user.role.toUpperCase();
  if (role !== 'LECTURER' && role !== 'ORGANISER' && role !== 'ADMIN') {
    const error = new Error('Only a lecturer, organiser or admin can update a course');
    error.statusCode = 403;
    return next(error);
  }

  const courseId = Number(req.params.courseId);
  if (!Number.isInteger(courseId)) {
    const error = new Error('courseId must be a number');
    error.statusCode = 400;
    return next(error);
  }

  const course = await prisma.course.findUnique({ where: { id: courseId } });
  if (!course) {
    const error = new Error('Course not found');
    error.statusCode = 404;
    return next(error);
  }

  // Lecturers may only edit the courses they created; organisers and admins
  // keep the global edit access required for allocation management.
  if (role === 'LECTURER' && course.userId !== user.id) {
    const error = new Error('You can only update courses you have created');
    error.statusCode = 403;
    return next(error);
  }

  const { courseCode, courseName, minimumMark, tutorsRequired, slots } = req.body;

  if (
    !courseCode ||
    !courseName ||
    minimumMark === undefined ||
    tutorsRequired === undefined ||
    !Array.isArray(slots) ||
    slots.length === 0
  ) {
    const error = new Error(
      'courseCode, courseName, minimumMark, tutorsRequired and at least one tutoring slot are required',
    );
    error.statusCode = 400;
    return next(error);
  }

  const parsedMinimumMark = Number(minimumMark);
  if (Number.isNaN(parsedMinimumMark) || parsedMinimumMark < 0 || parsedMinimumMark > 100) {
    const error = new Error('minimumMark must be a number between 0 and 100');
    error.statusCode = 400;
    return next(error);
  }

  const parsedTutorsRequired = Number(tutorsRequired);
  if (!Number.isInteger(parsedTutorsRequired) || parsedTutorsRequired < 1) {
    const error = new Error('tutorsRequired must be a whole number of at least 1');
    error.statusCode = 400;
    return next(error);
  }

  const validDays = [0, 1, 2, 3, 4];
  const timeSlots = await prisma.timeSlot.findMany();
  const validSlotIds = timeSlots.map((slot) => slot.id);

  for (const slot of slots) {
    if (!slot || !validDays.includes(slot.dayOfWeek) || !validSlotIds.includes(slot.timeSlotId)) {
      const error = new Error('Invalid slot. Each slot needs a valid dayOfWeek (0-4) and timeSlotId');
      error.statusCode = 400;
      return next(error);
    }
  }

  // Another course (not this one) may already use the new course code
  const duplicate = await prisma.course.findFirst({
    where: { courseCode, id: { not: courseId } },
  });
  if (duplicate) {
    const error = new Error('A course with this course code already exists');
    error.statusCode = 409;
    return next(error);
  }

  // Details and slots are replaced in one transaction so a failure leaves the course untouched
  await prisma.$transaction([
    prisma.course.update({
      where: { id: courseId },
      data: {
        courseCode,
        courseName,
        minimumMark: parsedMinimumMark,
        tutorsRequired: parsedTutorsRequired,
      },
    }),
    prisma.courseSlot.deleteMany({ where: { courseId } }),
    prisma.courseSlot.createMany({
      data: slots.map((slot) => ({
        courseId,
        dayOfWeek: slot.dayOfWeek,
        timeSlotId: slot.timeSlotId,
      })),
    }),
  ]);

  const updatedCourse = await prisma.course.findUnique({
    where: { id: courseId },
    include: {
      slots: { include: { timeSlot: true }, orderBy: [{ dayOfWeek: 'asc' }, { timeSlot: { startMinute: 'asc' } }] },
    },
  });

  res.status(200).json(updatedCourse);
});

exports.updateCourseSlots = catchAsync(async (req, res, next) => {
  const firebaseUid = req.user.user_id;

  const user = await prisma.user.findUnique({ where: { firebaseUid } });
  if (!user) {
    const error = new Error('User not found. Please check if the user exists');
    error.statusCode = 404;
    return next(error);
  }

  const role = user.role.toUpperCase();
  if (role !== 'LECTURER' && role !== 'ORGANISER' && role !== 'ADMIN') {
    const error = new Error('Only a lecturer, organiser or admin can update course slots');
    error.statusCode = 403;
    return next(error);
  }

  const courseId = Number(req.params.courseId);
  if (!Number.isInteger(courseId)) {
    const error = new Error('courseId must be a number');
    error.statusCode = 400;
    return next(error);
  }

  const course = await prisma.course.findUnique({ where: { id: courseId } });
  if (!course) {
    const error = new Error('Course not found');
    error.statusCode = 404;
    return next(error);
  }

  // Lecturers may only edit the courses they created; organisers and admins
  // keep the global edit access required for allocation management.
  if (role === 'LECTURER' && course.userId !== user.id) {
    const error = new Error('You can only update slots for courses you have created');
    error.statusCode = 403;
    return next(error);
  }

  const { slots } = req.body;
  if (!Array.isArray(slots) || slots.length === 0) {
    const error = new Error('At least one tutoring slot is required');
    error.statusCode = 400;
    return next(error);
  }

  const validDays = [0, 1, 2, 3, 4];
  const timeSlots = await prisma.timeSlot.findMany();
  const validSlotIds = timeSlots.map((slot) => slot.id);

  for (const slot of slots) {
    if (!slot || !validDays.includes(slot.dayOfWeek) || !validSlotIds.includes(slot.timeSlotId)) {
      const error = new Error('Invalid slot. Each slot needs a valid dayOfWeek (0-4) and timeSlotId');
      error.statusCode = 400;
      return next(error);
    }
  }

  // Replacing all slots in one transaction keeps the course never left slot-less midway
  await prisma.$transaction([
    prisma.courseSlot.deleteMany({ where: { courseId } }),
    prisma.courseSlot.createMany({
      data: slots.map((slot) => ({
        courseId,
        dayOfWeek: slot.dayOfWeek,
        timeSlotId: slot.timeSlotId,
      })),
    }),
  ]);

  const updatedCourse = await prisma.course.findUnique({
    where: { id: courseId },
    include: {
      slots: { include: { timeSlot: true }, orderBy: [{ dayOfWeek: 'asc' }, { timeSlot: { startMinute: 'asc' } }] },
    },
  });

  res.status(200).json(updatedCourse);
});

exports.startApplicationProcess = catchAsync(async (req, res, next) => {
  const firebaseUid = req.user.user_id;

  const user = await prisma.user.findUnique({ where: { firebaseUid } });
  if (!user) {
    const error = new Error('User not found. Please check if the user exists');
    error.statusCode = 404;
    return next(error);
  }

  const role = user.role.toUpperCase();
  if (role !== 'LECTURER' && role !== 'ORGANISER' && role !== 'ADMIN') {
    const error = new Error('Only a lecturer, organiser or admin can start the application process');
    error.statusCode = 403;
    return next(error);
  }

  const { courseIds } = req.body;
  if (!Array.isArray(courseIds) || courseIds.length === 0) {
    const error = new Error('courseIds must be a non-empty array');
    error.statusCode = 400;
    return next(error);
  }

  const parsedIds = courseIds.map(Number);
  if (parsedIds.some((id) => !Number.isInteger(id))) {
    const error = new Error('Every courseId must be a number');
    error.statusCode = 400;
    return next(error);
  }

  const existingCourses = await prisma.course.findMany({
    where: { id: { in: parsedIds } },
    select: { id: true, userId: true },
  });
  if (existingCourses.length !== parsedIds.length) {
    const error = new Error('One or more courses were not found');
    error.statusCode = 404;
    return next(error);
  }

  // Lecturers may only open their own courses for applications; organisers and
  // admins manage the process across the whole course catalogue.
  if (role === 'LECTURER' && existingCourses.some((existing) => existing.userId !== user.id)) {
    const error = new Error('You can only start the application process for courses you have created');
    error.statusCode = 403;
    return next(error);
  }

  // Eligibility is enforced inside the where clause: only courses without any allocated
  // tutors and not already accepting applications are switched on
  const result = await prisma.course.updateMany({
    where: {
      id: { in: parsedIds },
      acceptingApplications: false,
      assignments: { none: {} },
    },
    data: { acceptingApplications: true },
  });

  res.status(200).json({
    requestedCount: parsedIds.length,
    updatedCount: result.count,
    skippedCount: parsedIds.length - result.count,
  });
});
