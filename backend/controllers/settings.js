const prisma = require('../prisma/client');
const catchAsync = require('../utils/catchAsync');
const path = require('path');
const fs = require('fs');
const { TUTOR_MONTHLY_CLAIMABLE_HOURS, TUTOR_EVENT_CLAIM_MONTHS, HOURLY_RATE_KEYS, PDF_TEMPLATE_KEY, MONTHLY_BUDGET } = require('../utils/systemSettings');

const UPLOADS_DIR = path.join(__dirname, '..', 'uploads');

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

  // Hourly rates keyed by year of study (null when the organiser has not set them)
  const hourlyRates = {};
  for (const [year, key] of Object.entries(HOURLY_RATE_KEYS)) {
    const raw = byKey[key];
    hourlyRates[year] = raw === undefined ? null : Number(raw);
  }

  // PDF template filename (null when none uploaded)
  const pdfTemplateFilename = byKey[PDF_TEMPLATE_KEY] || null;
  // Monthly budget (null when the organiser has not set one)
  const monthlyBudget = byKey[MONTHLY_BUDGET];

  res.status(200).json({
    tutorMonthlyClaimableHours: monthlyHours === undefined ? null : Number(monthlyHours),
    tutorEventClaimMonths: claimMonths === undefined ? null : Number(claimMonths),
    hourlyRates,
    pdfTemplateFilename,
    monthlyBudget: monthlyBudget === undefined ? null : Number(monthlyBudget),
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

// Maximum hourly rate in ZAR — a sanity bound so a typo cannot set R99 999/h
const MAX_HOURLY_RATE = 5000;
// Maximum monthly budget in ZAR — a sanity bound so a typo cannot set R99 999 999
const MAX_MONTHLY_BUDGET = 100000000;

// Sets the monthly budget — the amount (in ZAR) the school plans to spend per
// month on all tutors and courses. Spent amounts are derived from approved
// timesheets (hours x the tutor's year-of-study hourly rate), never stored.
exports.updateMonthlyBudget = catchAsync(async (req, res, next) => {
  const firebaseUid = req.user.user_id;

  const user = await prisma.user.findUnique({ where: { firebaseUid } });
  if (!user) {
    const error = new Error('User not found. Please check if the user exists');
    error.statusCode = 404;
    return next(error);
  }

  const role = user.role.toUpperCase();
  if (role !== 'ORGANISER' && role !== 'ADMIN') {
    const error = new Error('Only an organiser or admin can set the monthly budget');
    error.statusCode = 403;
    return next(error);
  }

  const { monthlyBudget } = req.body;
  const parsedBudget = Number(monthlyBudget);
  if (
    monthlyBudget === undefined ||
    monthlyBudget === null ||
    monthlyBudget === '' ||
    Number.isNaN(parsedBudget) ||
    parsedBudget < 0 ||
    parsedBudget > MAX_MONTHLY_BUDGET
  ) {
    const error = new Error(`monthlyBudget must be a number between 0 and ${MAX_MONTHLY_BUDGET}`);
    error.statusCode = 400;
    return next(error);
  }

  await prisma.systemSetting.upsert({
    where: { key: MONTHLY_BUDGET },
    update: { value: String(parsedBudget) },
    create: { key: MONTHLY_BUDGET, value: String(parsedBudget) },
  });

  res.status(200).json({ monthlyBudget: parsedBudget });
});

exports.updateHourlyRates = catchAsync(async (req, res, next) => {
  const firebaseUid = req.user.user_id;

  const user = await prisma.user.findUnique({ where: { firebaseUid } });
  if (!user) {
    const error = new Error('User not found. Please check if the user exists');
    error.statusCode = 404;
    return next(error);
  }

  const role = user.role.toUpperCase();
  if (role !== 'ORGANISER' && role !== 'ADMIN') {
    const error = new Error('Only an organiser or admin can set hourly rates');
    error.statusCode = 403;
    return next(error);
  }

  const { hourlyRates } = req.body;
  if (!hourlyRates || typeof hourlyRates !== 'object') {
    const error = new Error('hourlyRates must be an object with year-of-study keys');
    error.statusCode = 400;
    return next(error);
  }

  // Validate every supplied key and value
  const validYears = Object.keys(HOURLY_RATE_KEYS);
  const toUpsert = [];

  for (const [year, raw] of Object.entries(hourlyRates)) {
    if (!validYears.includes(year)) {
      const error = new Error(`Unknown year of study: ${year}. Valid values: ${validYears.join(', ')}`);
      error.statusCode = 400;
      return next(error);
    }

    // Allow null / empty string to clear a rate
    if (raw === null || raw === '' || raw === undefined) {
      toUpsert.push({ year, value: null });
      continue;
    }

    const parsed = Number(raw);
    if (Number.isNaN(parsed) || parsed < 0 || parsed > MAX_HOURLY_RATE) {
      const error = new Error(`Rate for "${year}" must be a number between 0 and ${MAX_HOURLY_RATE}`);
      error.statusCode = 400;
      return next(error);
    }
    toUpsert.push({ year, value: String(parsed) });
  }

  // Upsert each rate
  for (const { year, value } of toUpsert) {
    const key = HOURLY_RATE_KEYS[year];
    if (value === null) {
      // Clear: delete the row if it exists
      await prisma.systemSetting.deleteMany({ where: { key } });
    } else {
      await prisma.systemSetting.upsert({
        where: { key },
        update: { value },
        create: { key, value },
      });
    }
  }

  // Return the updated rates map
  const updatedRates = {};
  for (const year of validYears) {
    const key = HOURLY_RATE_KEYS[year];
    const setting = await prisma.systemSetting.findUnique({ where: { key } });
    updatedRates[year] = setting ? Number(setting.value) : null;
  }

  res.status(200).json({ hourlyRates: updatedRates });
});

// --- PDF Template endpoints ---

exports.uploadPdfTemplate = catchAsync(async (req, res, next) => {
  const firebaseUid = req.user.user_id;
  const user = await prisma.user.findUnique({ where: { firebaseUid } });
  if (!user) {
    const error = new Error('User not found. Please check if the user exists');
    error.statusCode = 404;
    return next(error);
  }

  const role = user.role.toUpperCase();
  if (role !== 'ORGANISER' && role !== 'ADMIN') {
    const error = new Error('Only an organiser or admin can upload a PDF template');
    error.statusCode = 403;
    return next(error);
  }

  if (!req.file) {
    const error = new Error('No PDF file was provided');
    error.statusCode = 400;
    return next(error);
  }

  // Remove old template file from disk if it exists
  const oldSetting = await prisma.systemSetting.findUnique({ where: { key: PDF_TEMPLATE_KEY } });
  if (oldSetting) {
    const oldPath = path.join(UPLOADS_DIR, oldSetting.value);
    if (fs.existsSync(oldPath)) fs.unlinkSync(oldPath);
  }

  // Save new template filename
  await prisma.systemSetting.upsert({
    where: { key: PDF_TEMPLATE_KEY },
    update: { value: req.file.filename },
    create: { key: PDF_TEMPLATE_KEY, value: req.file.filename },
  });

  res.status(200).json({ pdfTemplateFilename: req.file.filename });
});

exports.getPdfTemplate = catchAsync(async (req, res, next) => {
  const setting = await prisma.systemSetting.findUnique({ where: { key: PDF_TEMPLATE_KEY } });
  if (!setting) {
    const error = new Error('No PDF template has been uploaded');
    error.statusCode = 404;
    return next(error);
  }

  const filePath = path.join(UPLOADS_DIR, setting.value);
  if (!fs.existsSync(filePath)) {
    const error = new Error('The PDF template file was not found on disk');
    error.statusCode = 404;
    return next(error);
  }

  res.download(filePath, setting.value);
});

exports.deletePdfTemplate = catchAsync(async (req, res, next) => {
  const firebaseUid = req.user.user_id;
  const user = await prisma.user.findUnique({ where: { firebaseUid } });
  if (!user) {
    const error = new Error('User not found. Please check if the user exists');
    error.statusCode = 404;
    return next(error);
  }

  const role = user.role.toUpperCase();
  if (role !== 'ORGANISER' && role !== 'ADMIN') {
    const error = new Error('Only an organiser or admin can remove a PDF template');
    error.statusCode = 403;
    return next(error);
  }

  const setting = await prisma.systemSetting.findUnique({ where: { key: PDF_TEMPLATE_KEY } });
  if (setting) {
    const filePath = path.join(UPLOADS_DIR, setting.value);
    if (fs.existsSync(filePath)) fs.unlinkSync(filePath);
    await prisma.systemSetting.delete({ where: { key: PDF_TEMPLATE_KEY } });
  }

  res.status(200).json({ pdfTemplateFilename: null });
});
