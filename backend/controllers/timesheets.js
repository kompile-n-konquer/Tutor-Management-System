const prisma = require('../prisma/client');
const catchAsync = require('../utils/catchAsync');

// ── Helpers ──────────────────────────────────────────────────────────────────

const getUser = async (firebaseUid) => {
  const user = await prisma.user.findUnique({ where: { firebaseUid } });
  if (!user) {
    const error = new Error('User not found. Please check if the user exists');
    error.statusCode = 404;
    throw error;
  }
  return user;
};

const serializeEntry = (entry) => ({
  id: entry.id,
  timesheetId: entry.timesheetId,
  courseId: entry.courseId,
  courseCode: entry.course?.courseCode || null,
  courseName: entry.course?.courseName || null,
  supervisorId: entry.supervisorId,
  supervisorName: entry.supervisor
    ? `${entry.supervisor.firstName} ${entry.supervisor.lastName}`
    : null,
  workDate: entry.workDate,
  duration: entry.duration,
  description: entry.description,
  status: entry.status,
});

const serializeTimesheet = (timesheet) => ({
  id: timesheet.id,
  name: timesheet.name,
  payrollNumber: timesheet.payrollNumber,
  totalHours: timesheet.totalHours,
  status: timesheet.status,
  rejectionReason: timesheet.rejectionReason,
  submittedAt: timesheet.submittedAt,
  approvedAt: timesheet.approvedAt,
  createdAt: timesheet.createdAt,
  updatedAt: timesheet.updatedAt,
  entries: timesheet.entries ? timesheet.entries.map(serializeEntry) : [],
});

const VALID_DESCRIPTIONS = ['tutoring', 'marking', 'invigilation', 'admin'];

exports.getMyTimesheets = catchAsync(async (req, res, next) => {
  const user = await getUser(req.user.user_id);

  const timesheets = await prisma.timesheet.findMany({
    where: { userId: user.id },
    include: {
      entries: {
        include: {
          course: { select: { courseCode: true, courseName: true } },
          supervisor: { select: { firstName: true, lastName: true } },
        },
        orderBy: { workDate: 'asc' },
      },
    },
    orderBy: { id: 'desc' },
  });

  res.status(200).json(timesheets.map(serializeTimesheet));
});

exports.getPendingReview = catchAsync(async (req, res, next) => {
  const user = await getUser(req.user.user_id);
  const role = user.role.toUpperCase();
  if (role !== 'LECTURER' && role !== 'ORGANISER' && role !== 'ADMIN') {
    const error = new Error('Only lecturers, organisers or admins can review timesheets');
    error.statusCode = 403;
    return next(error);
  }

  // Find submitted timesheets where this user is listed as supervisor on at least one entry
  const timesheets = await prisma.timesheet.findMany({
    where: {
      status: 'SUBMITTED',
      entries: { some: { supervisorId: user.id } },
    },
    include: {
      user: { select: { firstName: true, lastName: true, email: true } },
      entries: {
        include: {
          course: { select: { courseCode: true, courseName: true } },
          supervisor: { select: { firstName: true, lastName: true } },
        },
        orderBy: { workDate: 'asc' },
      },
    },
    orderBy: { submittedAt: 'desc' },
  });

  res.status(200).json(
    timesheets.map((timesheet) => ({
      ...serializeTimesheet(timesheet),
      tutorName: `${timesheet.user.firstName} ${timesheet.user.lastName}`,
      tutorEmail: timesheet.user.email,
    }))
  );
});

exports.getSupervisors = catchAsync(async (req, res, next) => {
  await getUser(req.user.user_id);

  const lecturers = await prisma.user.findMany({
    where: {
      role: { in: ['LECTURER', 'ORGANISER', 'ADMIN'] },
      isActive: true,
    },
    select: { id: true, firstName: true, lastName: true, email: true },
    orderBy: { lastName: 'asc' },
  });

  res.status(200).json(
    lecturers.map((l) => ({
      id: l.id,
      name: `${l.firstName} ${l.lastName}`,
      email: l.email,
    }))
  );
});

exports.createTimesheet = catchAsync(async (req, res, next) => {
  const user = await getUser(req.user.user_id);

  const { name } = req.body;
  if (!name || !name.trim()) {
    const error = new Error('A timesheet name is required');
    error.statusCode = 400;
    return next(error);
  }

  const timesheet = await prisma.timesheet.create({
    data: {
      userId: user.id,
      name: name.trim(),
      totalHours: 0,
      status: 'DRAFT',
    },
  });

  res.status(201).json(serializeTimesheet({ ...timesheet, entries: [] }));
});

// ── GET /timesheets/:id ── Get a single timesheet with entries ──────────────

exports.getTimesheet = catchAsync(async (req, res, next) => {
  const user = await getUser(req.user.user_id);
  const timesheetId = Number(req.params.id);
  if (!Number.isInteger(timesheetId)) {
    const error = new Error('Timesheet ID must be a number');
    error.statusCode = 400;
    return next(error);
  }

  const timesheet = await prisma.timesheet.findUnique({
    where: { id: timesheetId },
    include: {
      user: { select: { firstName: true, lastName: true, email: true } },
      entries: {
        include: {
          course: { select: { courseCode: true, courseName: true } },
          supervisor: { select: { firstName: true, lastName: true, email: true } },
        },
        orderBy: { workDate: 'asc' },
      },
    },
  });

  if (!timesheet) {
    const error = new Error('Timesheet not found');
    error.statusCode = 404;
    return next(error);
  }

  // Owner or supervisor (lecturer) can view
  const isOwner = timesheet.userId === user.id;
  const isSupervisor = timesheet.entries.some((e) => e.supervisorId === user.id);
  const role = user.role.toUpperCase();
  if (!isOwner && !isSupervisor && role !== 'ORGANISER' && role !== 'ADMIN') {
    const error = new Error('You do not have permission to view this timesheet');
    error.statusCode = 403;
    return next(error);
  }

  res.status(200).json({
    ...serializeTimesheet(timesheet),
    tutorName: `${timesheet.user.firstName} ${timesheet.user.lastName}`,
    tutorEmail: timesheet.user.email,
  });
});

// ── PUT /timesheets/:id ── Save/update timesheet entries (DRAFT or REJECTED) ─

exports.updateTimesheet = catchAsync(async (req, res, next) => {
  const user = await getUser(req.user.user_id);
  const timesheetId = Number(req.params.id);
  if (!Number.isInteger(timesheetId)) {
    const error = new Error('Timesheet ID must be a number');
    error.statusCode = 400;
    return next(error);
  }

  const timesheet = await prisma.timesheet.findUnique({ where: { id: timesheetId } });
  if (!timesheet) {
    const error = new Error('Timesheet not found');
    error.statusCode = 404;
    return next(error);
  }
  if (timesheet.userId !== user.id) {
    const error = new Error('You can only edit your own timesheets');
    error.statusCode = 403;
    return next(error);
  }
  if (timesheet.status !== 'DRAFT' && timesheet.status !== 'REJECTED') {
    const error = new Error('Only draft or rejected timesheets can be edited');
    error.statusCode = 400;
    return next(error);
  }

  const { entries, name } = req.body;

  // Name is optional on update — only change it when explicitly provided
  if (name !== undefined && (!name || !String(name).trim())) {
    const error = new Error('Timesheet name cannot be empty');
    error.statusCode = 400;
    return next(error);
  }

  if (!Array.isArray(entries)) {
    const error = new Error('entries must be an array');
    error.statusCode = 400;
    return next(error);
  }

  // Validate every entry before writing
  for (const entry of entries) {
    if (!entry.courseId || !entry.supervisorId || !entry.workDate || !entry.duration || !entry.description) {
      const error = new Error('Every entry requires courseId, supervisorId, workDate, duration and description');
      error.statusCode = 400;
      return next(error);
    }
    const duration = Number(entry.duration);
    if (Number.isNaN(duration) || duration < 1 || duration > 8) {
      const error = new Error('Duration must be a number between 1 and 8');
      error.statusCode = 400;
      return next(error);
    }
    if (!VALID_DESCRIPTIONS.includes(entry.description.toLowerCase())) {
      const error = new Error(`Description must be one of: ${VALID_DESCRIPTIONS.join(', ')}`);
      error.statusCode = 400;
      return next(error);
    }
  }

  // Replace strategy inside a transaction: delete old entries, create new ones
  const totalHours = entries.reduce((sum, e) => sum + Number(e.duration), 0);

  const updated = await prisma.$transaction(async (tx) => {
    await tx.timesheetEntry.deleteMany({ where: { timesheetId } });

    if (entries.length > 0) {
      await tx.timesheetEntry.createMany({
        data: entries.map((e) => ({
          timesheetId,
          courseId: Number(e.courseId),
          supervisorId: Number(e.supervisorId),
          workDate: new Date(e.workDate),
          duration: Number(e.duration),
          description: e.description.toLowerCase(),
          status: 'PENDING',
        })),
      });
    }

    return tx.timesheet.update({
      where: { id: timesheetId },
      data: {
        ...(name !== undefined ? { name: name.trim() } : {}),
        totalHours,
        status: timesheet.status === 'REJECTED' ? 'DRAFT' : timesheet.status,
        rejectionReason: timesheet.status === 'REJECTED' ? null : timesheet.rejectionReason,
      },
    });
  });

  // Re-fetch with relations for the response
  const full = await prisma.timesheet.findUnique({
    where: { id: timesheetId },
    include: {
      entries: {
        include: {
          course: { select: { courseCode: true, courseName: true } },
          supervisor: { select: { firstName: true, lastName: true } },
        },
        orderBy: { workDate: 'asc' },
      },
    },
  });

  res.status(200).json(serializeTimesheet(full));
});

// ── DELETE /timesheets/:id ── Delete a draft timesheet ───────────────────────

exports.deleteTimesheet = catchAsync(async (req, res, next) => {
  const user = await getUser(req.user.user_id);
  const timesheetId = Number(req.params.id);
  if (!Number.isInteger(timesheetId)) {
    const error = new Error('Timesheet ID must be a number');
    error.statusCode = 400;
    return next(error);
  }

  const timesheet = await prisma.timesheet.findUnique({ where: { id: timesheetId } });
  if (!timesheet) {
    const error = new Error('Timesheet not found');
    error.statusCode = 404;
    return next(error);
  }
  if (timesheet.userId !== user.id) {
    const error = new Error('You can only delete your own timesheets');
    error.statusCode = 403;
    return next(error);
  }
  if (timesheet.status !== 'DRAFT') {
    const error = new Error('Only draft timesheets can be deleted');
    error.statusCode = 400;
    return next(error);
  }

  await prisma.$transaction([
    prisma.timesheetEntry.deleteMany({ where: { timesheetId } }),
    prisma.timesheet.delete({ where: { id: timesheetId } }),
  ]);

  res.status(200).json({ message: 'Timesheet deleted' });
});

// ── POST /timesheets/:id/submit ── Submit for approval ───────────────────────

exports.submitTimesheet = catchAsync(async (req, res, next) => {
  const user = await getUser(req.user.user_id);
  const timesheetId = Number(req.params.id);
  if (!Number.isInteger(timesheetId)) {
    const error = new Error('Timesheet ID must be a number');
    error.statusCode = 400;
    return next(error);
  }

  const timesheet = await prisma.timesheet.findUnique({
    where: { id: timesheetId },
    include: { entries: true },
  });
  if (!timesheet) {
    const error = new Error('Timesheet not found');
    error.statusCode = 404;
    return next(error);
  }
  if (timesheet.userId !== user.id) {
    const error = new Error('You can only submit your own timesheets');
    error.statusCode = 403;
    return next(error);
  }
  if (timesheet.status !== 'DRAFT' && timesheet.status !== 'REJECTED') {
    const error = new Error('Only draft or rejected timesheets can be submitted');
    error.statusCode = 400;
    return next(error);
  }
  if (timesheet.entries.length === 0) {
    const error = new Error('Cannot submit a timesheet with no entries');
    error.statusCode = 400;
    return next(error);
  }

  const updated = await prisma.timesheet.update({
    where: { id: timesheetId },
    data: {
      status: 'SUBMITTED',
      rejectionReason: null,
      submittedAt: new Date(),
    },
  });

  res.status(200).json(serializeTimesheet(updated));
});

// ── PUT /timesheets/:id/entries/:entryId/approve ─────────────────────────────

exports.approveEntry = catchAsync(async (req, res, next) => {
  const user = await getUser(req.user.user_id);
  const role = user.role.toUpperCase();
  if (role !== 'LECTURER' && role !== 'ORGANISER' && role !== 'ADMIN') {
    const error = new Error('Only lecturers, organisers or admins can approve entries');
    error.statusCode = 403;
    return next(error);
  }

  const timesheetId = Number(req.params.id);
  const entryId = Number(req.params.entryId);
  if (!Number.isInteger(timesheetId) || !Number.isInteger(entryId)) {
    const error = new Error('Timesheet and entry IDs must be numbers');
    error.statusCode = 400;
    return next(error);
  }

  const timesheet = await prisma.timesheet.findUnique({ where: { id: timesheetId } });
  if (!timesheet || timesheet.status !== 'SUBMITTED') {
    const error = new Error('Timesheet not found or not in submitted state');
    error.statusCode = 404;
    return next(error);
  }

  const entry = await prisma.timesheetEntry.findFirst({
    where: { id: entryId, timesheetId },
  });
  if (!entry) {
    const error = new Error('Entry not found in this timesheet');
    error.statusCode = 404;
    return next(error);
  }
  if (entry.supervisorId !== user.id) {
    const error = new Error('You can only approve entries where you are the supervisor');
    error.statusCode = 403;
    return next(error);
  }

  await prisma.timesheetEntry.update({
    where: { id: entryId },
    data: { status: 'APPROVED' },
  });

  // Check if all entries in the timesheet are now approved
  const allEntries = await prisma.timesheetEntry.findMany({
    where: { timesheetId },
    select: { status: true },
  });
  const allApproved = allEntries.every((e) => e.status === 'APPROVED');
  if (allApproved) {
    await prisma.timesheet.update({
      where: { id: timesheetId },
      data: { status: 'APPROVED', approvedAt: new Date() },
    });
  }

  res.status(200).json({ message: 'Entry approved', allApproved });
});

// ── PUT /timesheets/:id/reject ── Reject the timesheet with a reason ─────────

exports.rejectTimesheet = catchAsync(async (req, res, next) => {
  const user = await getUser(req.user.user_id);
  const role = user.role.toUpperCase();
  if (role !== 'LECTURER' && role !== 'ORGANISER' && role !== 'ADMIN') {
    const error = new Error('Only lecturers, organisers or admins can reject timesheets');
    error.statusCode = 403;
    return next(error);
  }

  const timesheetId = Number(req.params.id);
  if (!Number.isInteger(timesheetId)) {
    const error = new Error('Timesheet ID must be a number');
    error.statusCode = 400;
    return next(error);
  }

  const { reason } = req.body;
  if (!reason || !reason.trim()) {
    const error = new Error('A rejection reason is required');
    error.statusCode = 400;
    return next(error);
  }

  const timesheet = await prisma.timesheet.findUnique({
    where: { id: timesheetId },
    include: { entries: true },
  });
  if (!timesheet || timesheet.status !== 'SUBMITTED') {
    const error = new Error('Timesheet not found or not in submitted state');
    error.statusCode = 404;
    return next(error);
  }

  // Verify the lecturer is a supervisor on at least one entry
  const isSupervisor = timesheet.entries.some((e) => e.supervisorId === user.id);
  if (!isSupervisor && role !== 'ORGANISER' && role !== 'ADMIN') {
    const error = new Error('You can only reject timesheets where you are a supervisor');
    error.statusCode = 403;
    return next(error);
  }

  // Reset all entries back to PENDING so the tutor can edit and resubmit
  await prisma.$transaction([
    prisma.timesheetEntry.updateMany({
      where: { timesheetId },
      data: { status: 'PENDING' },
    }),
    prisma.timesheet.update({
      where: { id: timesheetId },
      data: {
        status: 'REJECTED',
        rejectionReason: reason.trim(),
      },
    }),
  ]);

  res.status(200).json({ message: 'Timesheet rejected', reason: reason.trim() });
});
