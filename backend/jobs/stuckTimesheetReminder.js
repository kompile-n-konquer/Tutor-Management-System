const { PrismaClient } = require('@prisma/client');
const { EVENT_TYPES, sendNotification } = require('../email/notifier');
const { stuckTimesheetReminderEmail } = require('../email/templates');

const prisma = new PrismaClient();

// ---------------------------------------------------------------------------
// "Stuck" timesheet definition
//
// The existing workflow (docs/docs/diagrams/er-diagram.md) moves a timesheet
// DRAFT -> SUBMITTED -> APPROVED | REJECTED, where lecturers approve or reject
// a SUBMITTED timesheet. The codebase does not define how long that decision
// may take, so "stuck" is defined here as:
//
//   a timesheet that has been in the SUBMITTED state for more than
//   TIMESHEET_STUCK_DAYS days (default: 7) without a lecturer decision.
//
// The threshold is configurable through the environment. The reminder goes to
// the responsible party — the lecturer(s) of the course(s) logged on the
// timesheet — and the email log guarantees at most one reminder per lecturer
// per ISO week per stuck timesheet, no matter how often the check runs or the
// server restarts.
// ---------------------------------------------------------------------------

const DEFAULT_STUCK_THRESHOLD_DAYS = 7;
const DEFAULT_CHECK_INTERVAL_MINUTES = 60;
const FIRST_CHECK_DELAY_MS = 30 * 1000;
const MS_PER_DAY = 24 * 60 * 60 * 1000;
const MS_PER_MINUTE = 60 * 1000;

function getStuckThresholdDays() {
  const days = Number.parseInt(process.env.TIMESHEET_STUCK_DAYS, 10);
  return Number.isFinite(days) && days > 0 ? days : DEFAULT_STUCK_THRESHOLD_DAYS;
}

function getCheckIntervalMs() {
  const minutes = Number.parseFloat(process.env.TIMESHEET_REMINDER_CHECK_INTERVAL_MINUTES);
  const value = Number.isFinite(minutes) && minutes > 0 ? minutes : DEFAULT_CHECK_INTERVAL_MINUTES;
  return value * MS_PER_MINUTE;
}

// ISO-8601 week key like "2026-W37". Used in reminder dedupe keys so each
// stuck timesheet triggers at most one reminder per recipient per week;
// standard algorithm (week containing the first Thursday of the ISO year).
function isoWeekKey(date) {
  const d = new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate()));
  const dayNumber = d.getUTCDay() || 7; // Mon=1 ... Sun=7
  d.setUTCDate(d.getUTCDate() + 4 - dayNumber); // shift to this week's Thursday
  const yearStart = new Date(Date.UTC(d.getUTCFullYear(), 0, 1));
  const week = Math.ceil(((d.getTime() - yearStart.getTime()) / MS_PER_DAY + 1) / 7);
  return `${d.getUTCFullYear()}-W${String(week).padStart(2, '0')}`;
}

// The lecturers of the courses logged on the timesheet are the parties
// responsible for its approval. De-duplicated by user id.
function collectResponsibleLecturers(timesheet) {
  const lecturers = new Map();
  for (const entry of timesheet.entries) {
    const lecturerUser = entry.course?.lecturer?.user;
    if (lecturerUser?.email) {
      lecturers.set(lecturerUser.id, lecturerUser);
    }
  }
  return [...lecturers.values()];
}

async function runStuckTimesheetCheck(now = new Date()) {
  const stuckThresholdDays = getStuckThresholdDays();
  const cutoff = new Date(now.getTime() - stuckThresholdDays * MS_PER_DAY);

  const stuckTimesheets = await prisma.timesheet.findMany({
    where: {
      status: 'SUBMITTED',
      submittedAt: { lt: cutoff },
    },
    include: {
      tutor: {
        include: {
          user: { select: { id: true, firstName: true, lastName: true, email: true } },
        },
      },
      entries: {
        include: {
          course: {
            include: {
              lecturer: {
                include: { user: { select: { id: true, firstName: true, lastName: true, email: true } } },
              },
            },
          },
        },
      },
    },
    orderBy: { id: 'asc' },
  });

  let remindersSent = 0;
  for (const timesheet of stuckTimesheets) {
    const lecturers = collectResponsibleLecturers(timesheet);
    if (lecturers.length === 0) {
      console.warn(
        `[stuck-timesheet-reminder] timesheet #${timesheet.id} is stuck but has no ` +
          'responsible lecturer to remind (no course lecturers found on its entries)',
      );
      continue;
    }

    const tutorName =
      [timesheet.tutor?.user?.firstName, timesheet.tutor?.user?.lastName]
        .filter(Boolean)
        .join(' ') || 'a tutor';
    const daysPending = Math.max(
      1,
      Math.floor((now.getTime() - new Date(timesheet.submittedAt).getTime()) / MS_PER_DAY),
    );

    for (const lecturer of lecturers) {
      const recipient = {
        userId: lecturer.id,
        email: lecturer.email,
        name: [lecturer.firstName, lecturer.lastName].filter(Boolean).join(' ') || lecturer.email,
      };
      const email = stuckTimesheetReminderEmail({
        recipientName: recipient.name,
        tutorName,
        timesheetId: timesheet.id,
        totalHours: timesheet.totalHours,
        submittedAt: timesheet.submittedAt,
        daysPending,
        stuckThresholdDays,
      });

      // The ISO-week suffix makes the dedupe key unique per week (sendNotification
      // already appends the recipient email, so each lecturer gets their own key):
      // reminders repeat weekly while a timesheet stays stuck, but a single week
      // never sends the same reminder twice — even across server restarts or
      // repeated checks. A FAILED attempt does not block the next check's retry.
      const result = await sendNotification({
        eventType: EVENT_TYPES.TIMESHEET_STUCK_REMINDER,
        entityType: 'Timesheet',
        entityId: timesheet.id,
        recipient,
        dedupeSuffix: isoWeekKey(now),
        ...email,
      });

      if (result.sent) {
        remindersSent += 1;
      }
    }
  }

  return { stuckCount: stuckTimesheets.length, remindersSent };
}

let checkTimer = null;
let isCheckRunning = false;

async function runCheckSafely() {
  if (isCheckRunning) {
    return; // never overlap two checks
  }
  isCheckRunning = true;
  try {
    const summary = await runStuckTimesheetCheck();
    if (summary.stuckCount > 0) {
      console.log(
        `[stuck-timesheet-reminder] checked for stuck timesheets: ` +
          `${summary.stuckCount} stuck, ${summary.remindersSent} reminder(s) sent this run`,
      );
    }
  } catch (error) {
    // The reminder job must never take the server down.
    console.error('[stuck-timesheet-reminder] check failed:', error.message);
  } finally {
    isCheckRunning = false;
  }
}

// Starts the periodic stuck-timesheet check. The first run happens shortly
// after startup (safe thanks to the EmailLog dedupe), afterwards it repeats
// every TIMESHEET_REMINDER_CHECK_INTERVAL_MINUTES minutes. No external
// scheduling library is needed — setInterval is all this job requires.
function startStuckTimesheetReminderJob() {
  const intervalMs = getCheckIntervalMs();
  console.log(
    `[stuck-timesheet-reminder] job started: checking every ${Math.round(intervalMs / MS_PER_MINUTE)} ` +
      `minute(s) for timesheets SUBMITTED longer than ${getStuckThresholdDays()} day(s)`,
  );

  setTimeout(() => {
    runCheckSafely();
  }, FIRST_CHECK_DELAY_MS).unref?.();

  checkTimer = setInterval(() => {
    runCheckSafely();
  }, intervalMs);
  checkTimer.unref?.();

  return checkTimer;
}

function stopStuckTimesheetReminderJob() {
  if (checkTimer) {
    clearInterval(checkTimer);
    checkTimer = null;
  }
}

module.exports = {
  DEFAULT_STUCK_THRESHOLD_DAYS,
  DEFAULT_CHECK_INTERVAL_MINUTES,
  getStuckThresholdDays,
  getCheckIntervalMs,
  isoWeekKey,
  collectResponsibleLecturers,
  runStuckTimesheetCheck,
  startStuckTimesheetReminderJob,
  stopStuckTimesheetReminderJob,
};
