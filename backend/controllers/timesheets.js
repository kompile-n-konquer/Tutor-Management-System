const { PrismaClient } = require('@prisma/client');
const catchAsync = require('../utils/catchAsync');
const { notifyTimesheetApproved, notifyTimesheetRejected } = require('../email/notifier');

const prisma = new PrismaClient();

// Timesheet workflow states (docs/docs/diagrams/er-diagram.md):
//   DRAFT -> SUBMITTED -> APPROVED | REJECTED (a rejected timesheet can be
//   updated by the tutor and resubmitted, re-entering the SUBMITTED state).
const TIMESHEET_SELECT = {
  id: true,
  tutorId: true,
  totalHours: true,
  status: true,
  submittedAt: true,
  approvedAt: true,
  rejectionReason: true,
  tutor: {
    select: {
      id: true,
      user: {
        select: {
          id: true,
          firstName: true,
          lastName: true,
          email: true,
        },
      },
    },
  },
};

// The rejectionReason column is NVARCHAR(1000) on SQL Server.
const MAX_REJECTION_REASON_LENGTH = 1000;

function parseTimesheetId(rawId) {
  const id = Number(rawId);
  if (!Number.isInteger(id) || id <= 0) {
    const error = new Error('Invalid timesheet id');
    error.statusCode = 400;
    throw error;
  }
  return id;
}

/**
 * POST /api/timesheets/:id/submit
 *
 * A tutor submits their own timesheet for lecturer approval (DRAFT or
 * REJECTED -> SUBMITTED). No email is sent on submission; the lecturers are
 * prompted by the stuck-timesheet reminder if the submission sits unanswered.
 */
exports.submitTimesheet = catchAsync(async (req, res, next) => {
  const timesheetId = parseTimesheetId(req.params.id);

  const user = await prisma.user.findUnique({
    where: { firebaseUid: req.user.uid },
    include: { tutor: true },
  });

  if (!user) {
    const error = new Error('User not found');
    error.statusCode = 404;
    return next(error);
  }

  if (user.role !== 'TUTOR' || !user.tutor) {
    const error = new Error('Only tutors can submit timesheets');
    error.statusCode = 403;
    return next(error);
  }

  const timesheet = await prisma.timesheet.findUnique({
    where: { id: timesheetId },
  });

  if (!timesheet) {
    const error = new Error('Timesheet not found');
    error.statusCode = 404;
    return next(error);
  }

  if (timesheet.tutorId !== user.tutor.id) {
    const error = new Error('You can only submit your own timesheets');
    error.statusCode = 403;
    return next(error);
  }

  if (timesheet.status !== 'DRAFT' && timesheet.status !== 'REJECTED') {
    const error = new Error(
      `Only DRAFT or REJECTED timesheets can be submitted (current status: ${timesheet.status})`
    );
    error.statusCode = 409;
    return next(error);
  }

  const updated = await prisma.timesheet.update({
    where: { id: timesheetId },
    data: { status: 'SUBMITTED', submittedAt: new Date() },
    select: TIMESHEET_SELECT,
  });

  res.json(updated);
});

/**
 * POST /api/timesheets/:id/approve
 *
 * A lecturer approves a submitted timesheet (SUBMITTED -> APPROVED) and the
 * tutor is notified by email. The submittedAt timestamp is part of the
 * notification's dedupe key, so if the tutor resubmits after a rejection and
 * the timesheet is approved again, the tutor is legitimately notified again.
 */
exports.approveTimesheet = catchAsync(async (req, res, next) => {
  const timesheetId = parseTimesheetId(req.params.id);

  const timesheet = await prisma.timesheet.findUnique({
    where: { id: timesheetId },
  });

  if (!timesheet) {
    const error = new Error('Timesheet not found');
    error.statusCode = 404;
    return next(error);
  }

  if (timesheet.status !== 'SUBMITTED') {
    const error = new Error(
      `Only SUBMITTED timesheets can be approved (current status: ${timesheet.status})`
    );
    error.statusCode = 409;
    return next(error);
  }

  const updated = await prisma.timesheet.update({
    where: { id: timesheetId },
    data: {
      status: 'APPROVED',
      approvedAt: new Date(),
      rejectionReason: null, // clear any reason from an earlier rejection cycle
    },
    select: TIMESHEET_SELECT,
  });

  // Approving a timesheet approves its logged entries as well.
  await prisma.timesheetEntry.updateMany({
    where: { timesheetId },
    data: { isApproved: true },
  });

  // Trigger: notify the tutor. The notifier never throws and logs the
  // attempt in EmailLog, so a Resend outage cannot fail the approval itself.
  await notifyTimesheetApproved(updated);

  res.json(updated);
});

/**
 * POST /api/timesheets/:id/reject
 *
 * A lecturer rejects a submitted timesheet (SUBMITTED -> REJECTED) and the
 * tutor is notified by email. An optional rejection reason can be supplied in
 * the body ({ "reason": "..." }); when present it is stored on the timesheet
 * and included in the notification email.
 */
exports.rejectTimesheet = catchAsync(async (req, res, next) => {
  const timesheetId = parseTimesheetId(req.params.id);

  const timesheet = await prisma.timesheet.findUnique({
    where: { id: timesheetId },
  });

  if (!timesheet) {
    const error = new Error('Timesheet not found');
    error.statusCode = 404;
    return next(error);
  }

  if (timesheet.status !== 'SUBMITTED') {
    const error = new Error(
      `Only SUBMITTED timesheets can be rejected (current status: ${timesheet.status})`
    );
    error.statusCode = 409;
    return next(error);
  }

  const rawReason = typeof req.body?.reason === 'string' ? req.body.reason.trim() : '';
  const reason = rawReason ? rawReason.slice(0, MAX_REJECTION_REASON_LENGTH) : null;

  const updated = await prisma.timesheet.update({
    where: { id: timesheetId },
    data: {
      status: 'REJECTED',
      approvedAt: null,
      rejectionReason: reason,
    },
    select: TIMESHEET_SELECT,
  });

  // Trigger: notify the tutor, including the recorded reason when present.
  // The notifier never throws and logs the attempt in EmailLog, so a Resend
  // outage cannot fail the rejection itself.
  await notifyTimesheetRejected(updated);

  res.json(updated);
});
