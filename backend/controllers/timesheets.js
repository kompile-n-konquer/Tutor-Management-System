const prisma = require('../prisma/client');
const catchAsync = require('../utils/catchAsync');
const { getTutorMonthlyClaimableHours, getTutorEventClaimMonths } = require('../utils/systemSettings');
const { monthsBefore, findExcessiveWindow, deriveEventEntry } = require('../utils/claimRules');

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
  eventId: entry.eventId ?? null,
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

// Event + course shape needed to derive a claimed entry's fields server-side
const EVENT_CLAIM_INCLUDE = {
  course: {
    select: {
      id: true,
      userId: true,
      slots: { include: { timeSlot: true } },
    },
  },
};

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

  // Each lecturer only sees the entries they supervise — a timesheet may span
  // multiple courses with different lecturers, and approval/rejection is per-
  // lecturer (approve = all my entries approved; reject = the whole timesheet)
  res.status(200).json(
    timesheets.map((timesheet) => {
      const filtered = {
        ...timesheet,
        entries: timesheet.entries.filter((e) => e.supervisorId === user.id),
      };
      return {
        ...serializeTimesheet(filtered),
        tutorName: `${timesheet.user.firstName} ${timesheet.user.lastName}`,
        tutorEmail: timesheet.user.email,
      };
    })
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

  // The name is optional — a timesheet created without one gets the unique
  // default "Untitled-<id>", so clients never need to send a body at all. The
  // id only exists after creation, so create with a placeholder and rename in
  // the same transaction.
  const providedName = typeof req.body?.name === 'string' ? req.body.name.trim() : '';

  const timesheet = await prisma.$transaction(async (tx) => {
    const created = await tx.timesheet.create({
      data: {
        userId: user.id,
        name: providedName || 'Untitled',
        totalHours: 0,
        status: 'DRAFT',
      },
    });
    if (providedName) return created;
    return tx.timesheet.update({
      where: { id: created.id },
      data: { name: `Untitled-${created.id}` },
    });
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

  // Timesheet entries are created by claiming events only — each entry carries
  // just its eventId, and every other field (course, date, description,
  // supervisor, round-up duration) is derived server-side so the client cannot
  // drift them. Manually filled-in entries are rejected outright.
  const now = new Date();
  const claimMonths = await getTutorEventClaimMonths();
  const cutoff = claimMonths !== null ? monthsBefore(now, claimMonths) : null;

  if (entries.some((e) => e.eventId === undefined || e.eventId === null)) {
    const error = new Error(
      'Timesheet entries can only be added by claiming an event — remove the manually added entries'
    );
    error.statusCode = 400;
    return next(error);
  }

  const claimedEventIds = entries.map((e) => Number(e.eventId));
  if (claimedEventIds.some((id) => !Number.isInteger(id))) {
    const error = new Error('eventId must be a number');
    error.statusCode = 400;
    return next(error);
  }
  // An event can only be claimed once — including twice within the same payload
  if (new Set(claimedEventIds).size !== claimedEventIds.length) {
    const error = new Error('Each event can only be claimed once per timesheet');
    error.statusCode = 400;
    return next(error);
  }

  const events =
    claimedEventIds.length > 0
      ? await prisma.event.findMany({
          where: { id: { in: claimedEventIds } },
          include: EVENT_CLAIM_INCLUDE,
        })
      : [];
  const eventsById = new Map(events.map((event) => [event.id, event]));

  const resolvedEntries = entries.map((entry) => {
    // Event claim — every field comes from the event itself
    const event = eventsById.get(Number(entry.eventId));
    if (!event) {
      const error = new Error('Event not found');
      error.statusCode = 404;
      return { error };
    }
    if (event.date.getTime() >= now.getTime()) {
      const error = new Error('Only past events can be claimed');
      error.statusCode = 400;
      return { error };
    }
    if (cutoff && event.date.getTime() < cutoff.getTime()) {
      const error = new Error(
        `Events older than ${claimMonths} month${claimMonths === 1 ? '' : 's'} can no longer be claimed`
      );
      error.statusCode = 400;
      return { error };
    }
    const derived = deriveEventEntry(event);
    if (!derived) {
      const error = new Error(
        'This event can no longer be claimed — the course no longer has tutoring timeslots on that day'
      );
      error.statusCode = 400;
      return { error };
    }
    return derived;
  });

  const invalid = resolvedEntries.find((entry) => entry.error);
  if (invalid) return next(invalid.error);

  // Replace strategy inside a transaction: delete old entries, create new ones
  const totalHours = resolvedEntries.reduce((sum, e) => sum + e.duration, 0);

  let updated;
  try {
    updated = await prisma.$transaction(async (tx) => {
      await tx.timesheetEntry.deleteMany({ where: { timesheetId } });

      if (resolvedEntries.length > 0) {
        await tx.timesheetEntry.createMany({
          data: resolvedEntries.map((e) => ({
            timesheetId,
            courseId: e.courseId,
            supervisorId: e.supervisorId,
            eventId: e.eventId,
            workDate: e.workDate,
            duration: e.duration,
            description: e.description,
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
  } catch (error) {
    // The unique eventId index is the claim-once guarantee across tutors and
    // timesheets — surface the collision as a friendly conflict, not a 500
    if (error && error.code === 'P2002') {
      const conflict = new Error('An event in this timesheet has already been claimed by another tutor');
      conflict.statusCode = 409;
      return next(conflict);
    }
    throw error;
  }

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

  // A month is 30-31 days: the timesheet may total more than the monthly cap as
  // long as every 31-day window of entries stays within it. While the organiser
  // has not set a cap, no limit applies.
  const maxClaimableHours = await getTutorMonthlyClaimableHours();
  if (maxClaimableHours !== null) {
    const excessive = findExcessiveWindow(timesheet.entries, maxClaimableHours);
    if (excessive) {
      const day = (date) => date.toISOString().split('T')[0];
      const error = new Error(
        `This timesheet claims ${excessive.hours} hours between ${day(excessive.start)} and ${day(excessive.end)}, above the maximum of ${maxClaimableHours} claimable hours per 31 days. Remove some entries before submitting.`
      );
      error.statusCode = 400;
      return next(error);
    }
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
