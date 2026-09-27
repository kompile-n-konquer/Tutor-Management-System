const prisma = require('../prisma/client');
const { getResendClient, isResendConfigured, getFromAddress } = require('./resend');
const {
  assignmentAddedEmail,
  assignmentRemovedEmail,
  timesheetApprovedEmail,
  timesheetRejectedEmail,
  swapRequestedEmail,
  swapRespondedEmail,
  swapReviewedEmail,
} = require('./templates');

// Notification event types. Each type is a different dedupe-able event:
// creating and later removing the same assignment produce different keys,
// and a future assignment gets a new id (and therefore a new key).
const EVENT_TYPES = {
  ASSIGNMENT_ADDED: 'ASSIGNMENT_ADDED',
  ASSIGNMENT_REMOVED: 'ASSIGNMENT_REMOVED',
  TIMESHEET_APPROVED: 'TIMESHEET_APPROVED',
  TIMESHEET_REJECTED: 'TIMESHEET_REJECTED',
  TIMESHEET_STUCK_REMINDER: 'TIMESHEET_STUCK_REMINDER',
  SWAP_REQUESTED: 'SWAP_REQUESTED',
  SWAP_RESPONDED: 'SWAP_RESPONDED',
  SWAP_REVIEWED: 'SWAP_REVIEWED',
};

// A PENDING log row younger than this is treated as an in-flight attempt and
// blocks another send of the same event (protects against double-fired
// triggers, e.g. a double-clicked approve button). Older PENDING rows are
// ignored — they are leftovers of a crashed attempt and may be retried.
const PENDING_GRACE_MS = 10 * 60 * 1000;

// The EmailLog.errorMessage column is NVARCHAR(1000) on SQL Server.
const MAX_ERROR_MESSAGE_LENGTH = 1000;

function truncateErrorMessage(message) {
  return String(message || 'Unknown error').slice(0, MAX_ERROR_MESSAGE_LENGTH);
}

/**
 * Compose the dedupe key for a notification event. The suffix distinguishes
 * events that can legitimately repeat for the same entity:
 *   - approve/reject after a resubmission (suffix = new submittedAt)
 *   - stuck-timesheet reminders (suffix = ISO week + recipient email)
 * The recipient email is always appended so an event with several recipients
 * (e.g. a reminder to multiple lecturers) dedupes per recipient.
 */
function buildDedupeKey(eventType, entityType, entityId, suffix, recipientEmail) {
  const base = `${eventType}:${entityType}:${entityId}`;
  const withSuffix = suffix ? `${base}:${suffix}` : base;
  return `${withSuffix}:${recipientEmail}`;
}

// Normalize a Prisma-loaded user record into the notifier's recipient shape.
function toRecipient(user) {
  if (!user) {
    return null;
  }
  return {
    userId: user.id,
    email: user.email,
    name: [user.firstName, user.lastName].filter(Boolean).join(' ') || user.email,
  };
}

/**
 * Send one notification email via Resend and record the attempt in EmailLog.
 *
 * Duplicate prevention: before sending, the EmailLog is checked for a prior
 * successful (SENT) send of the same dedupe key — if one exists, the send is
 * skipped. Failed attempts are logged as FAILED and do NOT block a later
 * retry, so retries never produce duplicate successful notifications.
 *
 * This function never throws: every failure path (missing recipient, log
 * failure, Resend errors) is caught, logged to the console and returned in
 * the result so callers can keep serving requests.
 */
async function sendNotification({
  eventType,
  entityType,
  entityId,
  recipient,
  subject,
  html,
  text,
  dedupeSuffix = null,
}) {
  if (!recipient || !recipient.email) {
    console.warn(`[email] ${eventType} for ${entityType}#${entityId}: no recipient email, skipping`);
    return { sent: false, skipped: true, reason: 'NO_RECIPIENT' };
  }

  const dedupeKey = buildDedupeKey(eventType, entityType, entityId, dedupeSuffix, recipient.email);

  try {
    // 1. Duplicate prevention: skip when this exact event was already sent,
    //    or an attempt is currently in flight (see PENDING_GRACE_MS above).
    const alreadySent = await prisma.emailLog.findFirst({
      where: { dedupeKey, status: 'SENT' },
      select: { id: true },
    });
    if (alreadySent) {
      return { sent: false, skipped: true, reason: 'ALREADY_SENT', dedupeKey };
    }

    const inFlight = await prisma.emailLog.findFirst({
      where: {
        dedupeKey,
        status: 'PENDING',
        attemptedAt: { gte: new Date(Date.now() - PENDING_GRACE_MS) },
      },
      select: { id: true },
    });
    if (inFlight) {
      return { sent: false, skipped: true, reason: 'IN_FLIGHT', dedupeKey };
    }

    // 2. Record the attempt before sending, so even a crash mid-send leaves a
    //    trace. If the attempt cannot be recorded we must NOT send: without a
    //    log row there would be no way to prevent duplicate sends later.
    const log = await prisma.emailLog.create({
      data: {
        eventType,
        entityType,
        entityId,
        dedupeKey,
        recipientEmail: recipient.email,
        recipientUserId: recipient.userId ?? null,
        status: 'PENDING',
        subject: subject || null,
      },
    });

    // 3. Actually send through Resend.
    try {
      if (!isResendConfigured()) {
        throw new Error('RESEND_API_KEY is not set; cannot send notification emails');
      }
      const resend = getResendClient();
      const { data, error } = await resend.emails.send({
        from: getFromAddress(),
        to: [recipient.email],
        subject,
        html,
        text,
      });
      if (error) {
        throw new Error(`Resend API error ${error.statusCode ?? ''} (${error.name}): ${error.message}`);
      }

      // 4a. Success: mark the log row as SENT with the dispatch timestamp.
      await prisma.emailLog.update({
        where: { id: log.id },
        data: { status: 'SENT', sentAt: new Date(), errorMessage: null },
      });
      return { sent: true, skipped: false, messageId: data?.id ?? null, dedupeKey };
    } catch (sendError) {
      // 4b. Failure: keep the response intact — a failed email must never
      //     crash the app. The FAILED log row allows a later retry.
      console.error(
        `[email] failed to send ${eventType} for ${entityType}#${entityId} to ${recipient.email}:`,
        sendError.message,
      );
      try {
        await prisma.emailLog.update({
          where: { id: log.id },
          data: { status: 'FAILED', errorMessage: truncateErrorMessage(sendError.message) },
        });
      } catch (logError) {
        console.error(`[email] could not mark log row ${log.id} as FAILED:`, logError.message);
      }
      return { sent: false, skipped: false, reason: 'SEND_FAILED', error: sendError.message, dedupeKey };
    }
  } catch (error) {
    // Covers the dedupe check and the initial PENDING log creation.
    console.error(`[email] could not process ${eventType} for ${entityType}#${entityId}:`, error.message);
    return { sent: false, skipped: false, reason: 'LOG_FAILED', error: error.message, dedupeKey };
  }
}

/**
 * Assignment Added trigger. Expects `assignment` loaded with
 * course { courseCode, courseName } and tutor { user { id, firstName, lastName, email } }.
 */
async function notifyAssignmentAdded(assignment) {
  const user = assignment?.tutor?.user;
  const recipient = toRecipient(user);
  const email = assignmentAddedEmail({
    recipientName: recipient?.name ?? 'there',
    courseCode: assignment?.course?.courseCode,
    courseName: assignment?.course?.courseName,
    allocatedHours: assignment?.allocatedHours,
    semester: assignment?.semester,
    status: assignment?.status,
  });
  return sendNotification({
    eventType: EVENT_TYPES.ASSIGNMENT_ADDED,
    entityType: 'TutorAssignment',
    entityId: assignment?.id,
    recipient,
    ...email,
  });
}

/**
 * Assignment Removed trigger. Expects the same shape as notifyAssignmentAdded,
 * loaded BEFORE the assignment row is deleted (the log keeps entityType/entityId
 * as plain columns, so the audit record survives the deletion).
 */
async function notifyAssignmentRemoved(assignment) {
  const user = assignment?.tutor?.user;
  const recipient = toRecipient(user);
  const email = assignmentRemovedEmail({
    recipientName: recipient?.name ?? 'there',
    courseCode: assignment?.course?.courseCode,
    courseName: assignment?.course?.courseName,
    semester: assignment?.semester,
  });
  return sendNotification({
    eventType: EVENT_TYPES.ASSIGNMENT_REMOVED,
    entityType: 'TutorAssignment',
    entityId: assignment?.id,
    recipient,
    ...email,
  });
}

/**
 * Timesheet Approved trigger. Expects `timesheet` loaded with
 * tutor { user { id, firstName, lastName, email } }.
 *
 * The submittedAt timestamp is used as the dedupe suffix so that a timesheet
 * which is rejected, fixed, resubmitted and then approved again notifies the
 * tutor again (a new submission = a new submittedAt = a new event), while the
 * same approval event can never notify twice.
 */
async function notifyTimesheetApproved(timesheet) {
  const user = timesheet?.tutor?.user;
  const recipient = toRecipient(user);
  const email = timesheetApprovedEmail({
    recipientName: recipient?.name ?? 'there',
    timesheetId: timesheet?.id,
    totalHours: timesheet?.totalHours,
    approvedAt: timesheet?.approvedAt ?? new Date(),
  });
  return sendNotification({
    eventType: EVENT_TYPES.TIMESHEET_APPROVED,
    entityType: 'Timesheet',
    entityId: timesheet?.id,
    recipient,
    dedupeSuffix: timesheet?.submittedAt ? new Date(timesheet.submittedAt).toISOString() : null,
    ...email,
  });
}

/**
 * Timesheet Rejected trigger. Expects the same shape as notifyTimesheetApproved
 * plus the recorded rejectionReason (if any), which is included in the email.
 */
async function notifyTimesheetRejected(timesheet) {
  const user = timesheet?.tutor?.user;
  const recipient = toRecipient(user);
  const email = timesheetRejectedEmail({
    recipientName: recipient?.name ?? 'there',
    timesheetId: timesheet?.id,
    totalHours: timesheet?.totalHours,
    rejectionReason: timesheet?.rejectionReason,
  });
  return sendNotification({
    eventType: EVENT_TYPES.TIMESHEET_REJECTED,
    entityType: 'Timesheet',
    entityId: timesheet?.id,
    recipient,
    dedupeSuffix: timesheet?.submittedAt ? new Date(timesheet.submittedAt).toISOString() : null,
    ...email,
  });
}

/**
 * Swap Requested trigger. Expects `swap` loaded with requester/recipient and
 * both events (course with courseCode/courseName and date).
 */
async function notifySwapRequested(swap) {
  const recipient = toRecipient(swap?.recipient);
  const email = swapRequestedEmail({
    recipientName: recipient?.name ?? 'there',
    requesterName: toRecipient(swap?.requester)?.name ?? 'A tutor',
    courseCode: swap?.requesterEvent?.course?.courseCode,
    courseName: swap?.requesterEvent?.course?.courseName,
    sessionDate: swap?.requesterEvent?.date ? new Date(swap.requesterEvent.date).toISOString().split('T')[0] : null,
    twoWay: Boolean(swap?.recipientEvent),
    reason: swap?.reason,
  });
  return sendNotification({
    eventType: EVENT_TYPES.SWAP_REQUESTED,
    entityType: 'SwapRequest',
    entityId: swap?.id,
    recipient,
    ...email,
  });
}

/**
 * Swap Responded trigger. Expects the same shape as notifySwapRequested — sent
 * to the requester when the recipient accepts or declines.
 */
async function notifySwapResponded(swap) {
  const recipient = toRecipient(swap?.requester);
  const accepted = swap?.status === 'ACCEPTED';
  const email = swapRespondedEmail({
    recipientName: recipient?.name ?? 'there',
    responderName: toRecipient(swap?.recipient)?.name ?? 'The tutor',
    courseCode: swap?.requesterEvent?.course?.courseCode,
    sessionDate: swap?.requesterEvent?.date ? new Date(swap.requesterEvent.date).toISOString().split('T')[0] : null,
    accepted,
    rejectionReason: accepted ? null : swap?.rejectionReason,
  });
  return sendNotification({
    eventType: EVENT_TYPES.SWAP_RESPONDED,
    entityType: 'SwapRequest',
    entityId: swap?.id,
    recipient,
    ...email,
  });
}

/**
 * Swap Reviewed trigger. Expects the same shape as notifySwapRequested — sent
 * to BOTH tutors when the organiser approves or rejects the swap.
 */
async function notifySwapReviewed(swap) {
  const approved = swap?.status === 'APPROVED';
  const sessionDate = swap?.requesterEvent?.date
    ? new Date(swap.requesterEvent.date).toISOString().split('T')[0]
    : null;
  return Promise.all(
    [swap?.requester, swap?.recipient].map((tutor) => {
      const recipient = toRecipient(tutor);
      const other = tutor?.id === swap?.requester?.id ? swap?.recipient : swap?.requester;
      const email = swapReviewedEmail({
        recipientName: recipient?.name ?? 'there',
        otherTutorName: toRecipient(other)?.name ?? 'the other tutor',
        courseCode: swap?.requesterEvent?.course?.courseCode,
        sessionDate,
        approved,
        rejectionReason: approved ? null : swap?.rejectionReason,
      });
      return sendNotification({
        eventType: EVENT_TYPES.SWAP_REVIEWED,
        entityType: 'SwapRequest',
        entityId: swap?.id,
        recipient,
        ...email,
      });
    }),
  );
}

module.exports = {
  EVENT_TYPES,
  PENDING_GRACE_MS,
  buildDedupeKey,
  sendNotification,
  notifyAssignmentAdded,
  notifyAssignmentRemoved,
  notifyTimesheetApproved,
  notifyTimesheetRejected,
  notifySwapRequested,
  notifySwapResponded,
  notifySwapReviewed,
};
