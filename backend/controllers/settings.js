const prisma = require('../prisma/client');
const catchAsync = require('../utils/catchAsync');
const { TUTOR_MONTHLY_CLAIMABLE_HOURS, TUTOR_EVENT_CLAIM_MONTHS } = require('../utils/systemSettings');

// A month has at most 744 hours (31 days), so anything above that cannot be a monthly target
const MAX_MONTHLY_HOURS = 744;
// The event claim window can span at most two years of past events
const MAX_CLAIM_MONTHS = 24;

exports.getSettings = catchAsync(async (req, res, next) => {
  const firebaseUid = req.user.user_id;

  const user = await prisma.user.findUnique({ where: { firebaseUid } });
  if (!user) {
    const error = new Error('User not found. Please check if the user exists');
    error.statusCode = 404;
    return next(error);
  }

  const settings = await prisma.systemSetting.findMany();
  const byKey = Object.fromEntries(settings.map((setting) => [setting.key, setting.value]));

  const monthlyHours = byKey[TUTOR_MONTHLY_CLAIMABLE_HOURS];
  const claimMonths = byKey[TUTOR_EVENT_CLAIM_MONTHS];
  res.status(200).json({
    tutorMonthlyClaimableHours: monthlyHours === undefined ? null : Number(monthlyHours),
    tutorEventClaimMonths: claimMonths === undefined ? null : Number(claimMonths),
  });
});

exports.updateTutorMonthlyHours = catchAsync(async (req, res, next) => {
  const firebaseUid = req.user.user_id;

  const user = await prisma.user.findUnique({ where: { firebaseUid } });
  if (!user) {
    const error = new Error('User not found. Please check if the user exists');
    error.statusCode = 404;
    return next(error);
  }

  const role = user.role.toUpperCase();
  if (role !== 'ORGANISER' && role !== 'ADMIN') {
    const error = new Error('Only an organiser or admin can set the tutor monthly claimable hours');
    error.statusCode = 403;
    return next(error);
  }

  const { tutorMonthlyClaimableHours } = req.body;

  const parsedHours = Number(tutorMonthlyClaimableHours);
  if (
    tutorMonthlyClaimableHours === undefined ||
    tutorMonthlyClaimableHours === null ||
    Number.isNaN(parsedHours) ||
    !Number.isInteger(parsedHours) ||
    parsedHours < 1 ||
    parsedHours > MAX_MONTHLY_HOURS
  ) {
    const error = new Error(`tutorMonthlyClaimableHours must be a whole number between 1 and ${MAX_MONTHLY_HOURS}`);
    error.statusCode = 400;
    return next(error);
  }

  await prisma.systemSetting.upsert({
    where: { key: TUTOR_MONTHLY_CLAIMABLE_HOURS },
    update: { value: String(parsedHours) },
    create: { key: TUTOR_MONTHLY_CLAIMABLE_HOURS, value: String(parsedHours) },
  });

  res.status(200).json({ tutorMonthlyClaimableHours: parsedHours });
});

exports.updateTutorEventClaimMonths = catchAsync(async (req, res, next) => {
  const firebaseUid = req.user.user_id;

  const user = await prisma.user.findUnique({ where: { firebaseUid } });
  if (!user) {
    const error = new Error('User not found. Please check if the user exists');
    error.statusCode = 404;
    return next(error);
  }

  const role = user.role.toUpperCase();
  if (role !== 'ORGANISER' && role !== 'ADMIN') {
    const error = new Error('Only an organiser or admin can set the tutor event claim window');
    error.statusCode = 403;
    return next(error);
  }

  const { tutorEventClaimMonths } = req.body;

  const parsedMonths = Number(tutorEventClaimMonths);
  if (
    tutorEventClaimMonths === undefined ||
    tutorEventClaimMonths === null ||
    Number.isNaN(parsedMonths) ||
    !Number.isInteger(parsedMonths) ||
    parsedMonths < 1 ||
    parsedMonths > MAX_CLAIM_MONTHS
  ) {
    const error = new Error(`tutorEventClaimMonths must be a whole number between 1 and ${MAX_CLAIM_MONTHS}`);
    error.statusCode = 400;
    return next(error);
  }

  await prisma.systemSetting.upsert({
    where: { key: TUTOR_EVENT_CLAIM_MONTHS },
    update: { value: String(parsedMonths) },
    create: { key: TUTOR_EVENT_CLAIM_MONTHS, value: String(parsedMonths) },
  });

  res.status(200).json({ tutorEventClaimMonths: parsedMonths });
});
