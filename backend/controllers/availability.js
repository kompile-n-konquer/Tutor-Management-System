const prisma = require('../prisma/client');
const catchAsync = require('../utils/catchAsync');

exports.getAvailability = catchAsync(async (req, res, next) => {
  const firebaseUid = req.user.user_id;

  const user = await prisma.user.findUnique({ where: { firebaseUid } });
  if (!user) {
    const error = new Error('User not found. Please check if the user exists');
    error.statusCode = 404;
    return next(error);
  }

  const timeSlots = await prisma.timeSlot.findMany({
    orderBy: { startMinute: 'asc' },
  });

  const availability = await prisma.availability.findMany({
    where: { userId: user.id },
    select: { dayOfWeek: true, timeSlotId: true },
  });

  res.status(200).json({ timeSlots, availability });
});

exports.updateAvailability = catchAsync(async (req, res, next) => {
  const firebaseUid = req.user.user_id;

  const user = await prisma.user.findUnique({ where: { firebaseUid } });
  if (!user) {
    const error = new Error('User not found. Please check if the user exists');
    error.statusCode = 404;
    return next(error);
  }

  const availability = req.body.availability;
  if (!Array.isArray(availability)) {
    const error = new Error('availability must be an array of { dayOfWeek, timeSlotId } entries');
    error.statusCode = 400;
    return next(error);
  }

  // Validate every entry before writing anything to the database
  const validDays = [0, 1, 2, 3, 4];
  const timeSlots = await prisma.timeSlot.findMany();
  const validSlotIds = timeSlots.map((slot) => slot.id);

  for (const entry of availability) {
    if (!entry || !validDays.includes(entry.dayOfWeek) || !validSlotIds.includes(entry.timeSlotId)) {
      const error = new Error('Invalid availability entry. Each entry needs a valid dayOfWeek (0-4) and timeSlotId');
      error.statusCode = 400;
      return next(error);
    }
  }

  // Replace strategy: delete existing entries, then create the new set in one transaction
  await prisma.$transaction([
    prisma.availability.deleteMany({ where: { userId: user.id } }),
    prisma.availability.createMany({ data: availability.map((entry) => ({ ...entry, userId: user.id })) }),
  ]);

  const savedAvailability = await prisma.availability.findMany({
    where: { userId: user.id },
    select: { dayOfWeek: true, timeSlotId: true },
  });

  res.status(200).json(savedAvailability);
});
