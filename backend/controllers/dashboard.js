const prisma = require('../prisma/client');
const catchAsync = require('../utils/catchAsync');

// GET /api/dashboard — the priority feed for the unified dashboard.
//
// Every authenticated role gets a payload; the queries branch on the caller's
// role so the panel only ever lists what that user can actually act on:
//
//   TUTOR             swaps waiting on them, their uncovered sessions and
//                     volunteer offers, their own timesheet pipeline
//   LECTURER          cover requests awaiting their decision, timesheets
//                     submitted for their review
//   ORGANISER / ADMIN aggregate queue depths (staffing gaps, uncovered
//                     sessions, reviews and applications)
//   STUDENT           nothing yet — students have no dashboard items
//
// The client renders items in the order received: urgent first, then newest
// first. Where an item leads is the frontend's decision (its alert config
// maps item types to routes) — the backend only describes WHAT needs
// attention, not where to go.

const SEVERITY_RANK = { urgent: 0, info: 1 };

const iso = (value) => (value ? new Date(value).toISOString() : null);

const isoDate = (value) => new Date(value).toISOString().split('T')[0];

const fullName = (person) =>
  person
    ? [person.firstName, person.lastName].filter(Boolean).join(' ') || 'Unknown user'
    : 'Unknown user';

const countLabel = (count, singular) => `${count} ${singular}${count === 1 ? '' : 's'}`;

const sortItems = (items) =>
  [...items].sort((a, b) => {
    const severityGap =
      (SEVERITY_RANK[a.severity] ?? SEVERITY_RANK.info) -
      (SEVERITY_RANK[b.severity] ?? SEVERITY_RANK.info);
    if (severityGap !== 0) return severityGap;
    return new Date(b.at ?? 0).getTime() - new Date(a.at ?? 0).getTime();
  });

// Just enough of each relation to label an item — the heavy feeds stay on
// their own pages; this endpoint answers "what needs me?", not "show me
// everything".
const SWAP_INCLUDE = {
  requester: { select: { firstName: true, lastName: true } },
  recipient: { select: { firstName: true, lastName: true } },
  requesterEvent: { include: { course: { select: { courseCode: true } } } },
};

const COURSE_CODE_THROUGH_SLOT = {
  courseSlot: { include: { course: { select: { courseCode: true } } } },
};

const COVER_DECISION_INCLUDE = {
  volunteerRequest: { include: { user: { select: { firstName: true, lastName: true } } } },
  courseSlot: { include: { course: { select: { courseCode: true } } } },
};

// ── Tutor items ──────────────────────────────────────────────────────────────

async function tutorItems(user, todayStart) {
  const [
    incomingSwaps,
    outgoingSwaps,
    agreedSwaps,
    offeredCovers,
    rejectedTimesheets,
    draftTimesheets,
    uncoveredSessions,
  ] = await Promise.all([
    // Swaps another tutor sent me — they block until I accept or decline
    prisma.swapRequest.findMany({
      where: { recipientId: user.id, status: 'PENDING' },
      include: SWAP_INCLUDE,
      orderBy: { requestedAt: 'desc' },
    }),
    // Swaps I sent that the partner has not answered yet (I can still cancel)
    prisma.swapRequest.findMany({
      where: { requesterId: user.id, status: 'PENDING' },
      include: SWAP_INCLUDE,
      orderBy: { requestedAt: 'desc' },
    }),
    // Swaps both tutors agreed to — now waiting on the organiser
    prisma.swapRequest.findMany({
      where: { OR: [{ requesterId: user.id }, { recipientId: user.id }], status: 'ACCEPTED' },
      include: SWAP_INCLUDE,
      orderBy: { requestedAt: 'desc' },
    }),
    // My volunteer offers awaiting the lecturer's decision
    prisma.sessionVolunteer.findMany({
      where: { userId: user.id, status: 'PENDING' },
      include: { session: { include: COURSE_CODE_THROUGH_SLOT } },
      orderBy: { createdAt: 'desc' },
    }),
    prisma.timesheet.findMany({
      where: { userId: user.id, status: 'REJECTED' },
      orderBy: { updatedAt: 'desc' },
    }),
    // Only drafts with at least one entry are worth submitting — an empty
    // shell draft is not actionable
    prisma.timesheet.findMany({
      where: { userId: user.id, status: 'DRAFT', entries: { some: {} } },
      orderBy: { updatedAt: 'desc' },
    }),
    // My excused sessions that still have no volunteer
    prisma.session.findMany({
      where: { assignment: { userId: user.id }, status: 'UNASSIGNED', date: { gte: todayStart } },
      include: COURSE_CODE_THROUGH_SLOT,
      orderBy: { date: 'asc' },
    }),
  ]);

  return [
    ...incomingSwaps.map((swap) => ({
      id: `swap-${swap.id}`,
      type: 'swap-incoming',
      severity: 'urgent',
      title: `Cover swap from ${fullName(swap.requester)}`,
      detail: `${swap.requesterEvent.course.courseCode} on ${isoDate(swap.requesterEvent.date)} — waiting for your response`,
      at: iso(swap.requestedAt),
    })),
    ...uncoveredSessions.map((session) => ({
      id: `session-${session.id}`,
      type: 'cover-awaiting',
      severity: 'urgent',
      title: `Your ${session.courseSlot.course.courseCode} session on ${isoDate(session.date)} needs a cover`,
      detail: 'You excused yourself — waiting for a volunteer to take it',
      at: iso(session.date),
    })),
    ...rejectedTimesheets.map((timesheet) => ({
      id: `timesheet-${timesheet.id}`,
      type: 'timesheet-rejected',
      severity: 'urgent',
      title: `Timesheet "${timesheet.name}" was rejected`,
      detail: timesheet.rejectionReason || 'Update the entries and resubmit it for approval',
      at: iso(timesheet.updatedAt),
    })),
    ...outgoingSwaps.map((swap) => ({
      id: `swap-${swap.id}`,
      type: 'swap-outgoing',
      severity: 'info',
      title: `Your swap offer to ${fullName(swap.recipient)} is awaiting their response`,
      detail: `${swap.requesterEvent.course.courseCode} on ${isoDate(swap.requesterEvent.date)}`,
      at: iso(swap.requestedAt),
    })),
    ...agreedSwaps.map((swap) => ({
      id: `swap-${swap.id}`,
      type: 'swap-accepted',
      severity: 'info',
      // Either side of the trade sees the same "waiting on the organiser" state
      title: `Your swap with ${fullName(
        swap.requesterId === user.id ? swap.recipient : swap.requester,
      )} awaits organiser approval`,
      detail: `${swap.requesterEvent.course.courseCode} on ${isoDate(swap.requesterEvent.date)}`,
      at: iso(swap.respondedAt ?? swap.requestedAt),
    })),
    ...offeredCovers.map((offer) => ({
      id: `offer-${offer.id}`,
      type: 'cover-offered',
      severity: 'info',
      title: `You offered to cover ${offer.session.courseSlot.course.courseCode} on ${isoDate(offer.session.date)}`,
      detail: 'Waiting for the lecturer to approve your offer',
      at: iso(offer.createdAt),
    })),
    ...draftTimesheets.map((timesheet) => ({
      id: `timesheet-${timesheet.id}`,
      type: 'timesheet-draft',
      severity: 'info',
      title: `Draft timesheet "${timesheet.name}" has unsubmitted hours`,
      detail: `${timesheet.totalHours} hours claimed — submit it for approval`,
      at: iso(timesheet.updatedAt),
    })),
  ];
}

// ── Lecturer items ───────────────────────────────────────────────────────────

async function lecturerItems(user, todayStart) {
  const [pendingCovers, reviewTimesheets] = await Promise.all([
    // Volunteer offers on MY courses only, and only while the session is
    // still ahead — a past session can no longer be handed over
    prisma.session.findMany({
      where: {
        status: 'PENDING',
        date: { gte: todayStart },
        courseSlot: { course: { userId: user.id } },
        volunteerRequest: { status: 'PENDING' },
      },
      include: COVER_DECISION_INCLUDE,
      orderBy: { date: 'asc' },
    }),
    prisma.timesheet.findMany({
      where: { status: 'SUBMITTED', entries: { some: { supervisorId: user.id } } },
      include: { user: { select: { firstName: true, lastName: true } } },
      orderBy: { submittedAt: 'desc' },
    }),
  ]);

  return [
    ...pendingCovers.map((session) => ({
      id: `session-${session.id}`,
      type: 'cover-decision',
      severity: 'urgent',
      title: `${fullName(session.volunteerRequest.user)} volunteered to cover ${session.courseSlot.course.courseCode}`,
      detail: `Session on ${isoDate(session.date)} — approve or reject the offer`,
      at: iso(session.volunteerRequest.createdAt),
    })),
    ...reviewTimesheets.map((timesheet) => ({
      id: `timesheet-${timesheet.id}`,
      type: 'timesheet-review',
      severity: 'urgent',
      title: `${fullName(timesheet.user)}'s timesheet awaits your review`,
      detail: `"${timesheet.name}" — ${timesheet.totalHours} hours claimed`,
      at: iso(timesheet.submittedAt),
    })),
  ];
}

// ── Organiser / admin items ──────────────────────────────────────────────────

async function organiserItems(todayStart) {
  const [courses, uncoveredSessions, submittedTimesheets, agreedSwaps, pendingRoleApplications, pendingCourseApplications] =
    await Promise.all([
      prisma.course.findMany({
        select: {
          id: true,
          courseCode: true,
          tutorsRequired: true,
          _count: { select: { assignments: true } },
        },
        orderBy: { courseCode: 'asc' },
      }),
      prisma.session.findMany({
        where: { status: 'UNASSIGNED', date: { gte: todayStart } },
        include: COURSE_CODE_THROUGH_SLOT,
        orderBy: { date: 'asc' },
      }),
      prisma.timesheet.count({ where: { status: 'SUBMITTED' } }),
      prisma.swapRequest.count({ where: { status: 'ACCEPTED' } }),
      prisma.roleApplication.count({ where: { status: 'PENDING' } }),
      prisma.application.count({ where: { status: 'PENDING' } }),
    ]);

  const items = [];
  const understaffed = courses.filter(
    (course) => course._count.assignments < course.tutorsRequired,
  );

  if (understaffed.length > 0) {
    const shown = understaffed.slice(0, 4).map((course) => course.courseCode);
    const hidden = understaffed.length - shown.length;
    items.push({
      id: 'understaffed-courses',
      type: 'understaffed-course',
      severity: 'urgent',
      title: `${countLabel(understaffed.length, 'course')} below the required tutor count`,
      detail: hidden > 0 ? `${shown.join(', ')} +${hidden} more` : shown.join(', '),
      at: null,
    });
  }

  if (uncoveredSessions.length > 0) {
    const [next] = uncoveredSessions;
    items.push({
      id: 'uncovered-sessions',
      type: 'unassigned-session',
      severity: 'urgent',
      title: `${countLabel(uncoveredSessions.length, 'upcoming session')} without a tutor`,
      detail: `Next: ${next.courseSlot.course.courseCode} on ${isoDate(next.date)}`,
      at: null,
    });
  }

  if (submittedTimesheets > 0) {
    items.push({
      id: 'timesheet-review',
      type: 'timesheet-review',
      severity: 'urgent',
      title: `${countLabel(submittedTimesheets, 'timesheet')} awaiting review`,
      detail: 'Submitted by tutors and waiting on supervisor approval',
      at: null,
    });
  }

  if (agreedSwaps > 0) {
    items.push({
      id: 'swap-review',
      type: 'swap-review',
      severity: 'urgent',
      title: `${countLabel(agreedSwaps, 'swap request')} awaiting approval`,
      detail: 'Both tutors have agreed — approving moves the session claims',
      at: null,
    });
  }

  if (pendingRoleApplications > 0) {
    items.push({
      id: 'role-applications',
      type: 'role-application',
      severity: 'info',
      title: `${countLabel(pendingRoleApplications, 'role application')} to review`,
      detail: 'Tutor and lecturer onboarding requests',
      at: null,
    });
  }

  if (pendingCourseApplications > 0) {
    items.push({
      id: 'course-applications',
      type: 'course-application',
      severity: 'info',
      title: `${countLabel(pendingCourseApplications, 'tutor application')} pending`,
      detail: 'Applicants waiting to join a course tutor pool',
      at: null,
    });
  }

  return items;
}

// ── Controller ───────────────────────────────────────────────────────────────

exports.getDashboard = catchAsync(async (req, res, next) => {
  const user = await prisma.user.findUnique({ where: { firebaseUid: req.user.user_id } });
  if (!user) {
    const error = new Error('User not found. Please check if the user exists');
    error.statusCode = 404;
    return next(error);
  }

  const role = user.role.toUpperCase();
  const todayStart = new Date();
  todayStart.setUTCHours(0, 0, 0, 0);

  let items = [];
  if (role === 'TUTOR') {
    items = await tutorItems(user, todayStart);
  } else if (role === 'LECTURER') {
    items = await lecturerItems(user, todayStart);
  } else if (role === 'ORGANISER' || role === 'ADMIN') {
    items = await organiserItems(todayStart);
  }

  res.status(200).json({ role, items: sortItems(items) });
});
