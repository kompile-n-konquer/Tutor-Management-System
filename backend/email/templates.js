// Subject/body builders for every notification event type. Kept as pure
// functions (no Prisma, no Resend) so they are trivially unit-testable.
// All dynamic values are HTML-escaped before being embedded in the HTML body.

const APP_NAME = 'Tutor Management System';

// Escape values coming from the database (names, course titles, rejection
// reasons, ...) before embedding them in the HTML body.
function escapeHtml(value) {
  return String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

const DETAIL_LABEL_STYLE =
  'padding:8px 12px;border-bottom:1px solid #eee;color:#666;font-size:14px;white-space:nowrap;vertical-align:top;';
const DETAIL_VALUE_STYLE =
  'padding:8px 12px;border-bottom:1px solid #eee;color:#222;font-size:14px;font-weight:600;';

function renderDetails(details) {
  if (!details || details.length === 0) {
    return '';
  }
  const rows = details
    .map(
      ([label, value]) =>
        `<tr><td style="${DETAIL_LABEL_STYLE}">${escapeHtml(label)}</td>` +
        `<td style="${DETAIL_VALUE_STYLE}">${escapeHtml(value ?? '—')}</td></tr>`,
    )
    .join('');
  return `
    <table style="border-collapse:collapse;margin:24px 0;width:100%;max-width:520px;" cellpadding="0" cellspacing="0">
      ${rows}
    </table>`;
}

function renderLayout({ heading, intro, details, note }) {
  return `
<html>
  <body style="margin:0;padding:0;background-color:#f4f5f7;font-family:Arial,Helvetica,sans-serif;">
    <div style="max-width:600px;margin:0 auto;padding:32px 16px;">
      <div style="background-color:#ffffff;border-radius:8px;border:1px solid #e0e0e0;padding:32px;">
        <p style="margin:0 0 8px 0;font-size:12px;letter-spacing:1px;color:#888;text-transform:uppercase;">${escapeHtml(APP_NAME)}</p>
        <h1 style="margin:0 0 16px 0;font-size:20px;color:#1a1a1a;">${escapeHtml(heading)}</h1>
        <p style="margin:0 0 8px 0;font-size:14px;line-height:1.6;color:#444;">${escapeHtml(intro)}</p>
        ${renderDetails(details)}
        ${note ? `<p style="margin:0 0 8px 0;font-size:13px;line-height:1.6;color:#777;">${escapeHtml(note)}</p>` : ''}
      </div>
      <p style="margin:16px 4px 0 4px;font-size:12px;color:#999;">
        This is an automated notification from the ${escapeHtml(APP_NAME)}. Please do not reply directly to this email.
      </p>
    </div>
  </body>
</html>`;
}

// Plain-text rendering of the same details, for the text part of the email.
function renderTextDetails(details) {
  if (!details || details.length === 0) {
    return '';
  }
  return details.map(([label, value]) => `- ${label}: ${value ?? '—'}`).join('\n');
}

function renderText({ heading, intro, details, note }) {
  const lines = [APP_NAME, '', heading, '', intro];
  const detailText = renderTextDetails(details);
  if (detailText) {
    lines.push('', detailText);
  }
  if (note) {
    lines.push('', note);
  }
  lines.push('', 'This is an automated notification. Please do not reply directly to this email.');
  return lines.join('\n');
}

function formatDate(date) {
  if (!date) {
    return null;
  }
  return new Date(date).toUTCString();
}

/**
 * 1. Assignment Added — sent to the tutor who has just been assigned to a course.
 * Assignment details are included where available.
 */
function assignmentAddedEmail({ recipientName, courseCode, courseName, allocatedHours, semester, status }) {
  const details = [
    ['Course', courseCode && courseName ? `${courseCode} - ${courseName}` : courseCode || courseName],
    ['Allocated hours', allocatedHours != null ? `${allocatedHours} h` : null],
    ['Semester', semester],
    ['Status', status],
  ];
  const content = {
    heading: 'You have been assigned as a tutor',
    intro: `Hi ${recipientName}, you have been assigned as a tutor for a course. Here are the details of your new assignment:`,
    details,
    note: 'You can view this assignment on your Tutor Dashboard.',
  };
  return {
    subject: `You have been assigned to ${courseCode || 'a course'}${courseName ? ` - ${courseName}` : ''}`,
    html: renderLayout(content),
    text: renderText(content),
  };
}

/**
 * 2. Assignment Removed — sent to the tutor whose assignment has been removed.
 */
function assignmentRemovedEmail({ recipientName, courseCode, courseName, semester }) {
  const details = [
    ['Course', courseCode && courseName ? `${courseCode} - ${courseName}` : courseCode || courseName],
    ['Semester', semester],
  ];
  const content = {
    heading: 'Your tutoring assignment has been removed',
    intro: `Hi ${recipientName}, your tutoring assignment for the following course has been removed:`,
    details,
    note: 'If you believe this was done in error, please contact the course lecturer.',
  };
  return {
    subject: `Your assignment to ${courseCode || 'a course'}${courseName ? ` - ${courseName}` : ''} has been removed`,
    html: renderLayout(content),
    text: renderText(content),
  };
}

/**
 * 3. Timesheet Approved — sent to the tutor who owns the timesheet.
 */
function timesheetApprovedEmail({ recipientName, timesheetId, totalHours, approvedAt }) {
  const details = [
    ['Timesheet', `#${timesheetId}`],
    ['Total hours', totalHours != null ? `${totalHours} h` : null],
    ['Approved on', formatDate(approvedAt)],
  ];
  const content = {
    heading: 'Your timesheet has been approved',
    intro: `Hi ${recipientName}, your submitted timesheet has been approved:`,
    details,
  };
  return {
    subject: `Your timesheet #${timesheetId} has been approved`,
    html: renderLayout(content),
    text: renderText(content),
  };
}

/**
 * 4. Timesheet Rejected — sent to the tutor who owns the timesheet.
 * The rejection reason is included when one was recorded.
 */
function timesheetRejectedEmail({ recipientName, timesheetId, totalHours, rejectionReason }) {
  const details = [
    ['Timesheet', `#${timesheetId}`],
    ['Total hours', totalHours != null ? `${totalHours} h` : null],
  ];
  if (rejectionReason) {
    details.push(['Reason', rejectionReason]);
  }
  const content = {
    heading: 'Your timesheet has been rejected',
    intro: `Hi ${recipientName}, your submitted timesheet has been rejected${rejectionReason ? '' : '.'}`,
    details,
    note: 'Please review the reason above (if provided), update your timesheet and resubmit it for approval.',
  };
  return {
    subject: `Your timesheet #${timesheetId} has been rejected`,
    html: renderLayout(content),
    text: renderText(content),
  };
}

/**
 * 5. Stuck Timesheet Reminder — sent to the lecturer(s) responsible for
 * approving a timesheet that has been pending for too long.
 */
function stuckTimesheetReminderEmail({ recipientName, tutorName, timesheetId, totalHours, submittedAt, daysPending, stuckThresholdDays }) {
  const details = [
    ['Timesheet', `#${timesheetId}`],
    ['Tutor', tutorName],
    ['Total hours', totalHours != null ? `${totalHours} h` : null],
    ['Submitted on', formatDate(submittedAt)],
    ['Pending for', `${daysPending} day${daysPending === 1 ? '' : 's'}`],
  ];
  const content = {
    heading: 'Reminder: a timesheet is awaiting your approval',
    intro: `Hi ${recipientName}, the timesheet below has been in the SUBMITTED state for more than ${stuckThresholdDays} days without a decision. Please review and approve or reject it:`,
    details,
  };
  return {
    subject: `Reminder: timesheet #${timesheetId} (${tutorName}) has been awaiting approval for ${daysPending} days`,
    html: renderLayout(content),
    text: renderText(content),
  };
}

/**
 * 6. Swap Requested — sent to the tutor a swap is offered to. The organiser
 * must still approve before any session moves.
 */
function swapRequestedEmail({ recipientName, requesterName, courseCode, courseName, sessionDate, twoWay, reason }) {
  const details = [
    ['Offered by', requesterName],
    ['Session', courseCode && courseName ? `${courseCode} - ${courseName}` : courseCode || courseName],
    ['Session date', sessionDate],
    ['Trade type', twoWay ? 'Two-way (you give a session back)' : 'One-way (you take the session)'],
  ];
  if (reason) {
    details.push(['Message', reason]);
  }
  const content = {
    heading: 'A tutor offered you a session swap',
    intro: `Hi ${recipientName}, ${requesterName} would like to trade a tutoring session with you. Accept or decline the request on the Session Swaps page:`,
    details,
    note: 'The session only changes hands once the organiser approves the swap.',
  };
  return {
    subject: `${requesterName} offered you a session swap (${courseCode || 'session'})`,
    html: renderLayout(content),
    text: renderText(content),
  };
}

/**
 * 7. Swap Responded — sent to the requester when the recipient accepts or
 * declines the trade.
 */
function swapRespondedEmail({ recipientName, responderName, courseCode, sessionDate, accepted, rejectionReason }) {
  const details = [
    ['Session', courseCode],
    ['Session date', sessionDate],
    ['Response', accepted ? 'Accepted' : 'Declined'],
  ];
  if (rejectionReason) {
    details.push(['Reason', rejectionReason]);
  }
  const content = {
    heading: accepted ? 'Your swap request was accepted' : 'Your swap request was declined',
    intro: accepted
      ? `Hi ${recipientName}, ${responderName} agreed to trade with you. The swap now waits for organiser approval before the sessions move.`
      : `Hi ${recipientName}, ${responderName} declined your session swap request:`,
    details,
  };
  return {
    subject: accepted
      ? `${responderName} accepted your swap request (${courseCode})`
      : `${responderName} declined your swap request (${courseCode})`,
    html: renderLayout(content),
    text: renderText(content),
  };
}

/**
 * 8. Swap Reviewed — sent to both tutors when the organiser approves or
 * rejects an agreed swap.
 */
function swapReviewedEmail({ recipientName, otherTutorName, courseCode, sessionDate, approved, rejectionReason }) {
  const details = [
    ['Session', courseCode],
    ['Session date', sessionDate],
    ['Other tutor', otherTutorName],
  ];
  if (!approved && rejectionReason) {
    details.push(['Reason', rejectionReason]);
  }
  const content = {
    heading: approved ? 'Your session swap was approved' : 'Your session swap was rejected',
    intro: approved
      ? `Hi ${recipientName}, the organiser approved the session trade with ${otherTutorName}. The session now belongs to the other tutor's record.`
      : `Hi ${recipientName}, the organiser rejected the session trade with ${otherTutorName}. The sessions stay with their current tutors.`,
    details,
  };
  return {
    subject: approved
      ? `Session swap approved (${courseCode})`
      : `Session swap rejected (${courseCode})`,
    html: renderLayout(content),
    text: renderText(content),
  };
}

module.exports = {
  escapeHtml,
  assignmentAddedEmail,
  assignmentRemovedEmail,
  timesheetApprovedEmail,
  timesheetRejectedEmail,
  stuckTimesheetReminderEmail,
  swapRequestedEmail,
  swapRespondedEmail,
  swapReviewedEmail,
};
