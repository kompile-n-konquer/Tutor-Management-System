const prisma = require('../prisma/client');
const catchAsync = require('../utils/catchAsync');

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

  if (!courseCode || !courseName || minimumMark === undefined || tutorsRequired === undefined || !Array.isArray(slots) || slots.length === 0) {
    const error = new Error('courseCode, courseName, minimumMark, tutorsRequired and at least one tutoring slot are required');
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
