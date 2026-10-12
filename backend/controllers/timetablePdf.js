const prisma = require('../prisma/client');
const catchAsync = require('../utils/catchAsync');
const path = require('path');
const fs = require('fs');
const fsp = require('fs/promises');
const { extractAvailabilityFromPdf } = require('../utils/timetablePdf');

const UPLOADS_DIR = path.join(__dirname, '..', 'uploads');

// Response shape for the stored upload — parses the JSON extraction columns
const serializeTimetablePdf = (row) => ({
  filename: row.filename,
  originalName: row.originalName,
  sizeBytes: row.sizeBytes,
  uploadedAt: row.uploadedAt,
  extractedSlots: JSON.parse(row.extractedSlots || '[]'),
});

// Deletes an uploaded file from disk if it is still there
const removeUpload = async (filename) => {
  if (!filename) return;
  const filePath = path.join(UPLOADS_DIR, filename);
  if (fs.existsSync(filePath)) {
    await fsp.unlink(filePath);
  }
};

// Converts multer failures (wrong type, over 500KB) into clean 4xx responses
// instead of the generic 500 the global handler would produce
exports.timetableUploadError = (err, _req, res, next) => {
  if (!err) return next();
  const message =
    err.code === 'LIMIT_FILE_SIZE'
      ? 'The timetable PDF must be 500KB or smaller'
      : err.message || 'The timetable upload failed';
  res.status(err.code === 'LIMIT_FILE_SIZE' ? 413 : 400).json({ message });
};

// The middleware has already verified the token, so a missing row means the
// Firebase account has no User record yet — same 404 shape as availability.js
const getUserOr404 = async (req, next) => {
  const user = await prisma.user.findUnique({ where: { firebaseUid: req.user.user_id } });
  if (!user) {
    const error = new Error('User not found. Please check if the user exists');
    error.statusCode = 404;
    next(error);
    return null;
  }
  return user;
};

exports.getTimetablePdf = catchAsync(async (req, res, next) => {
  const user = await getUserOr404(req, next);
  if (!user) return;

  const row = await prisma.timetablePdf.findUnique({ where: { userId: user.id } });
  if (!row) {
    const error = new Error('No timetable PDF has been uploaded');
    error.statusCode = 404;
    return next(error);
  }

  res.status(200).json({ timetablePdf: serializeTimetablePdf(row) });
});

exports.uploadTimetablePdf = catchAsync(async (req, res, next) => {
  const user = await getUserOr404(req, next);
  if (!user) return;

  if (!req.file) {
    const error = new Error('No PDF file was provided');
    error.statusCode = 400;
    return next(error);
  }

  // Parse before replacing anything — a broken upload leaves the stored one intact
  const timeSlots = await prisma.timeSlot.findMany({ orderBy: { startMinute: 'asc' } });
  let extraction;
  try {
    const buffer = await fsp.readFile(req.file.path);
    extraction = await extractAvailabilityFromPdf(buffer, timeSlots);
  } catch (parseError) {
    await removeUpload(req.file.filename);
    console.error('[timetable-pdf] extraction failed:', parseError.message);
    const error = new Error('The file could not be read as a PDF timetable');
    error.statusCode = 400;
    return next(error);
  }

  // One timetable per user: the previous file is replaced on upload
  const previous = await prisma.timetablePdf.findUnique({ where: { userId: user.id } });
  await removeUpload(previous?.filename);

  const extractionData = {
    filename: req.file.filename,
    originalName: req.file.originalname,
    sizeBytes: req.file.size,
    extractedSlots: JSON.stringify(extraction.slots),
    cellContents: JSON.stringify(extraction.cells),
  };
  const row = await prisma.timetablePdf.upsert({
    where: { userId: user.id },
    update: extractionData,
    create: { userId: user.id, ...extractionData },
  });

  const message =
    extraction.slots.length > 0
      ? `Detected ${extraction.slots.length} available slot${extraction.slots.length === 1 ? '' : 's'} in your timetable.`
      : extraction.warnings.length > 0
        ? `No available slots could be detected. ${extraction.warnings.join(' ')}`
        : 'No available slots could be detected in this PDF.';
  res.status(200).json({ timetablePdf: serializeTimetablePdf(row), extractionMessage: message });
});

exports.downloadTimetablePdf = catchAsync(async (req, res, next) => {
  const user = await getUserOr404(req, next);
  if (!user) return;

  const row = await prisma.timetablePdf.findUnique({ where: { userId: user.id } });
  if (!row) {
    const error = new Error('No timetable PDF has been uploaded');
    error.statusCode = 404;
    return next(error);
  }

  const filePath = path.join(UPLOADS_DIR, row.filename);
  if (!fs.existsSync(filePath)) {
    const error = new Error('The timetable PDF file was not found on disk');
    error.statusCode = 404;
    return next(error);
  }

  res.download(filePath, row.originalName);
});

exports.deleteTimetablePdf = catchAsync(async (req, res, next) => {
  const user = await getUserOr404(req, next);
  if (!user) return;

  const row = await prisma.timetablePdf.findUnique({ where: { userId: user.id } });
  if (row) {
    await removeUpload(row.filename);
    await prisma.timetablePdf.delete({ where: { userId: user.id } });
  }

  res.status(200).json({ timetablePdf: null });
});
