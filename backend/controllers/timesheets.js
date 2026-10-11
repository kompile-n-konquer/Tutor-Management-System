const prisma = require('../prisma/client');
const catchAsync = require('../utils/catchAsync');
const path = require('path');
const fs = require('fs');
const { PDFDocument, StandardFonts, rgb } = require('pdf-lib');
const { getTutorMonthlyClaimableHours, getTutorEventClaimMonths, HOURLY_RATE_KEYS, PDF_TEMPLATE_KEY } = require('../utils/systemSettings');
const { monthsBefore, findExcessiveWindow, deriveEventEntry, deriveTimes, dayOfWeekFor } = require('../utils/claimRules');
const { notifyTimesheetApproved, notifyTimesheetRejected } = require('../email/notifier');
const { emitDashboardChange } = require('../realtime/io');

const UPLOADS_DIR = path.join(__dirname, '..', 'uploads');

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

  // The supervisors of the submitted entries — a timesheet may span several
  // courses with different lecturers — each gain a review item, the organiser
  // queue counts one more, and the tutor's own draft item disappears.
  const supervisorIds = [...new Set(timesheet.entries.map((entry) => entry.supervisorId))];
  emitDashboardChange([user.id, ...supervisorIds], 'timesheet-submitted', {
    includeOrganisers: true,
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
    const approvedTimesheet = await prisma.timesheet.update({
      where: { id: timesheetId },
      data: { status: 'APPROVED', approvedAt: new Date() },
      include: { user: { select: { id: true, firstName: true, lastName: true, email: true } } },
    });

    // Fire-and-forget: notify the tutor their timesheet was approved. The
    // notifier never throws (failures are logged in EmailLog), so a Resend
    // outage can never fail the approval request itself.
    notifyTimesheetApproved(approvedTimesheet).catch(() => {});

    // The tutor's submitted item clears and the organiser queue shrinks.
    emitDashboardChange([approvedTimesheet.user?.id], 'timesheet-approved', {
      includeOrganisers: true,
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
  const rejectedTimesheet = await prisma.$transaction(async (tx) => {
    await tx.timesheetEntry.updateMany({
      where: { timesheetId },
      data: { status: 'PENDING' },
    });
    return tx.timesheet.update({
      where: { id: timesheetId },
      data: {
        status: 'REJECTED',
        rejectionReason: reason.trim(),
      },
      include: { user: { select: { id: true, firstName: true, lastName: true, email: true } } },
    });
  });

  // Fire-and-forget: notify the tutor their timesheet was rejected, including
  // the recorded reason. The notifier never throws, so a Resend outage can
  // never fail the rejection request itself.
  notifyTimesheetRejected(rejectedTimesheet).catch(() => {});

  // The tutor gains an urgent fix-and-resubmit item; the review queue moves on.
  emitDashboardChange([rejectedTimesheet.user?.id], 'timesheet-rejected', {
    includeOrganisers: true,
  });

  res.status(200).json({ message: 'Timesheet rejected', reason: reason.trim() });
});

// ── PDF Export ────────────────────────────────────────────────────────────────

// Converts minutes since midnight into "HH:MM"
const minutesToLabel = (m) => {
  const h = Math.floor(m / 60);
  const mins = m % 60;
  return `${String(h).padStart(2, '0')}:${String(mins).padStart(2, '0')}`;
};

exports.exportTimesheetPdf = catchAsync(async (req, res, next) => {
  const user = await getUser(req.user.user_id);
  const timesheetId = Number(req.params.id);
  if (!Number.isInteger(timesheetId)) {
    const error = new Error('Timesheet ID must be a number');
    error.statusCode = 400;
    return next(error);
  }

  // Load template setting
  const templateSetting = await prisma.systemSetting.findUnique({ where: { key: PDF_TEMPLATE_KEY } });
  if (!templateSetting) {
    const error = new Error('No PDF template has been uploaded. Ask an organiser to upload one in Settings.');
    error.statusCode = 404;
    return next(error);
  }

  const templatePath = path.join(UPLOADS_DIR, templateSetting.value);
  if (!fs.existsSync(templatePath)) {
    const error = new Error('The PDF template file was not found on disk');
    error.statusCode = 404;
    return next(error);
  }

  // Load timesheet with all related data including event slots for time derivation
  const timesheet = await prisma.timesheet.findUnique({
    where: { id: timesheetId },
    include: {
      user: { select: { firstName: true, lastName: true, email: true, yearOfStudy: true, phoneNumber: true } },
      entries: {
        include: {
          course: { select: { courseCode: true, courseName: true } },
          supervisor: { select: { firstName: true, lastName: true } },
          event: {
            include: {
              course: {
                include: {
                  slots: { include: { timeSlot: true } },
                },
              },
            },
          },
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

  // Only APPROVED timesheets can be exported
  if (timesheet.status !== 'APPROVED') {
    const error = new Error('Only approved timesheets can be exported as PDF');
    error.statusCode = 403;
    return next(error);
  }

  // Look up hourly rate for this tutor's year of study
  let hourlyRate = null;
  if (timesheet.user.yearOfStudy && HOURLY_RATE_KEYS[timesheet.user.yearOfStudy]) {
    const rateSetting = await prisma.systemSetting.findUnique({
      where: { key: HOURLY_RATE_KEYS[timesheet.user.yearOfStudy] },
    });
    if (rateSetting) hourlyRate = Number(rateSetting.value);
  }

  // Load the PDF template and draw text directly at the measured positions
  const templateBytes = fs.readFileSync(templatePath);
  const pdfDoc = await PDFDocument.load(templateBytes, { ignoreEncryption: true });
  const page = pdfDoc.getPages()[0];
  const font = await pdfDoc.embedFont(StandardFonts.Helvetica);
  const boldFont = await pdfDoc.embedFont(StandardFonts.HelveticaBold);
  const fontSize = 10; // matches the template body text

  // ── Tutor Details ─────────────────────────────────────────────────────────
  const tutor = timesheet.user;
  page.drawText(`${tutor.firstName} ${tutor.lastName}`, { x: 135, y: 712, size: fontSize, font, color: rgb(0, 0, 0) });
  page.drawText(tutor.email, { x: 135, y: 665, size: fontSize, font, color: rgb(0, 0, 0) });
  page.drawText(tutor.phoneNumber || '', { x: 416, y: 642, size: fontSize, font, color: rgb(0, 0, 0) });

  // Year of study — draw a bold "X" next to the matching option
  const yearXPositions = {
    '3rd year': 142,
    honours:   188,
    masters:   236,
    phd:       291,
  };
  if (tutor.yearOfStudy && yearXPositions[tutor.yearOfStudy] != null) {
    page.drawText('X', {
      x: yearXPositions[tutor.yearOfStudy],
      y: 642,
      size: 14,
      font: boldFont,
      color: rgb(0, 0, 0),
    });
  }

  // ── Timesheet Entry Rows ──────────────────────────────────────────────────
  // The table has 14 row positions; fill them top-to-bottom
  const entryRowYs = [
    584, 563, 543, 521, 500, 480, 459,
    439, 419, 397, 376, 356, 335, 314,
  ];

  timesheet.entries.forEach((entry, i) => {
    if (i >= entryRowYs.length) return; // table is full
    const y = entryRowYs[i];

    // Derive "Start-End" from event slots
    let taskTimes = '';
    if (entry.event?.course?.slots) {
      const eventDate = new Date(entry.event.date);
      const dow = dayOfWeekFor(eventDate);
      const slots = deriveTimes(entry.event.course.slots, dow);
      if (slots.length > 0) {
        const first = slots[0];
        const last = slots[slots.length - 1];
        taskTimes = `${minutesToLabel(first.startMinute)}-${minutesToLabel(last.endMinute)}`;
      }
    }

    // Date of Task
    const dateFontSize = 8;
    const dateStr = entry.workDate ? new Date(entry.workDate).toLocaleDateString('en-ZA') : '';
    page.drawText(dateStr, { x: 39, y, size: dateFontSize, font, color: rgb(0, 0, 0) });

    // Times of Task
    page.drawText(taskTimes, { x: 84, y, size: dateFontSize, font, color: rgb(0, 0, 0) });

    // Duration of Task
    page.drawText(String(entry.duration), { x: 151, y, size: fontSize, font, color: rgb(0, 0, 0) });

    // Description
    page.drawText(`${entry.description || ''} - ${entry.course.courseCode || ''}`, { x: 210, y, size: fontSize, font, color: rgb(0, 0, 0) });

    // Name of Supervisor
    const supName = entry.supervisor ? `${entry.supervisor.firstName} ${entry.supervisor.lastName}` : '';
    page.drawText(supName, { x: 385, y, size: fontSize, font, color: rgb(0, 0, 0) });
  });

  // ── Claim Information (Signature + Totals) ────────────────────────────────
  // Date (approval date) next to Student Signature
  const footerFontSize = 13;
  const approvalDate = timesheet.approvedAt
    ? new Date(timesheet.approvedAt).toLocaleDateString('en-ZA')
    : '';
  page.drawText(approvalDate, { x: 423, y: 244, size: footerFontSize, font, color: rgb(0, 0, 0) });

  // Total Number of Hours
  page.drawText(String(timesheet.totalHours), { x: 189, y: 191, size: footerFontSize, font, color: rgb(0, 0, 0) });

  // Total Amount (total hours x hourly rate)
  const totalAmount = hourlyRate != null ? String(timesheet.totalHours * hourlyRate) : '';
  page.drawText(totalAmount, { x: 443, y: 191, size: footerFontSize, font, color: rgb(0, 0, 0) });

  const pdfBytes = await pdfDoc.save();

  // Use the timesheet name as the filename
  const safeName = (timesheet.name || 'timesheet').replace(/[^a-zA-Z0-9 _-]/g, '').replace(/\s+/g, '_');

  res.setHeader('Content-Type', 'application/pdf');
  res.setHeader('Content-Disposition', `attachment; filename="${safeName}.pdf"`);
  res.send(Buffer.from(pdfBytes));
});
