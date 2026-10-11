const prisma = require('../prisma/client');
const catchAsync = require('../utils/catchAsync');
const { getTutorMonthlyClaimableHours } = require('../utils/systemSettings');
const { findExcessiveWindow, dayOfWeekFor, timesTotalHours } = require('../utils/claimRules');
const {
  notifySwapRequested,
  notifySwapResponded,
  notifySwapReviewed,
} = require('../email/notifier');

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

const parseIdParam = (value, name) => {
  const parsed = Number(value);
  if (!Number.isInteger(parsed)) {
    const error = new Error(`${name} must be a valid integer`);
    error.statusCode = 400;
    return { error };
  }
  return { parsed };
};

// Everything needed to derive a session's day/time and serialize it. Times are
// never stored on events — they derive from the course's tutoring slots on the
// event date's weekday (same approach as the timesheet claim flow).
const EVENT_INCLUDE = {
  course: {
    select: {
      id: true,
      courseCode: true,
      courseName: true,
      userId: true,
      slots: {
        include: { timeSlot: true },
        orderBy: [{ dayOfWeek: 'asc' }, { timeSlot: { startMinute: 'asc' } }],
      },
    },
  },
};

// The concrete day+time ranges a session runs at, derived like deriveTimes in
// claimRules but keeping timeSlotId so availability can be checked slot-by-slot.
const sessionSlots = (event) => {
  const dayOfWeek = dayOfWeekFor(event.date);
  if (dayOfWeek === null) return [];
  return event.course.slots
    .filter((slot) => slot.dayOfWeek === dayOfWeek)
    .map((slot) => ({
      dayOfWeek: slot.dayOfWeek,
      timeSlotId: slot.timeSlotId,
      startMinute: slot.timeSlot.startMinute,
      endMinute: slot.timeSlot.endMinute,
    }))
    .sort((a, b) => a.startMinute - b.startMinute);
};

const sessionDuration = (event) => timesTotalHours(sessionSlots(event));

const formatDate = (date) => new Date(date).toISOString().split('T')[0];

const rangesOverlap = (a, b) => a.startMinute < b.endMinute && b.startMinute < a.endMinute;

const nameOf = (user) =>
  user ? [user.firstName, user.lastName].filter(Boolean).join(' ') || user.email : 'Unknown tutor';

const serializeSession = (event) => ({
  eventId: event.id,
  courseId: event.courseId,
  courseCode: event.course?.courseCode || null,
  courseName: event.course?.courseName || null,
  date: event.date,
  description: event.description,
  slots: sessionSlots(event),
  duration: sessionDuration(event),
});

const TUTOR_SELECT = { select: { id: true, firstName: true, lastName: true, email: true } };

const SWAP_INCLUDE = {
  requester: TUTOR_SELECT,
  recipient: TUTOR_SELECT,
  requesterEvent: { include: EVENT_INCLUDE },
  recipientEvent: { include: EVENT_INCLUDE },
};

const serializeSwap = (swap) => ({
  id: swap.id,
  status: swap.status,
  reason: swap.reason ?? null,
  requestedAt: swap.requestedAt,
  respondedAt: swap.respondedAt ?? null,
  reviewedAt: swap.reviewedAt ?? null,
  rejectionReason: swap.rejectionReason ?? null,
  requester: {
    userId: swap.requester.id,
    name: nameOf(swap.requester),
    email: swap.requester.email,
  },
  recipient: {
    userId: swap.recipient.id,
    name: nameOf(swap.recipient),
    email: swap.recipient.email,
  },
  offeredSession: serializeSession(swap.requesterEvent),
  requestedSession: swap.recipientEvent ? serializeSession(swap.recipientEvent) : null,
});

// A tutor's swappable sessions: every PENDING claimed event on their timesheets.
// Approved/rejected claims are excluded — an approved claim belongs to a
// submitted pay record and must not move between tutors.
const getSwappableEntries = (userId) =>
  prisma.timesheetEntry.findMany({
    where: { timesheet: { userId }, eventId: { not: null }, status: 'PENDING' },
    include: { event: { include: EVENT_INCLUDE } },
    orderBy: { workDate: 'desc' },
  });

// Validates that `tutor` could take over `event`, enforcing the same
// constraints checked when a tutor is allocated to a course, plus swap-specific
// double-booking protection:
//   1. the tutor is allocated to the course (TutorAssignment)
//   2. the tutor's weekly availability covers every session slot
//   3. none of the tutor's BusyBlock ranges overlap the session
//   4. the tutor does not already hold the session's claim
//   5. the tutor holds no other claim double-booking the session's date+times
//   6. the session keeps every 31-day window within the claimable-hours cap
// `excludeEventIds` skips sessions the swap itself moves (a two-way trade),
// so the checks always reflect the post-swap state. Returns an array of
// human-readable failure reasons — empty means eligible.
const validateSwapSide = async (tutor, event, excludeEventIds = []) => {
  const reasons = [];
  const course = event.course;
  const excluded = new Set(excludeEventIds);

  const slots = sessionSlots(event);
  if (slots.length === 0) {
    reasons.push(`${course.courseCode} no longer has tutoring timeslots on the session's day`);
    return reasons; // every check below needs the session slots
  }

  // 1. allocated to the course — same gate as a tutor being allocated
  const assignment = await prisma.tutorAssignment.findFirst({
    where: { userId: tutor.id, courseId: course.id },
  });
  if (!assignment) {
    reasons.push(`not allocated to ${course.courseCode}`);
  }

  // 2. availability covers every session slot
  const availability = await prisma.availability.findMany({
    where: { userId: tutor.id },
    select: { dayOfWeek: true, timeSlotId: true },
  });
  const availabilityKeys = new Set(availability.map((entry) => `${entry.dayOfWeek}-${entry.timeSlotId}`));
  if (!slots.every((slot) => availabilityKeys.has(`${slot.dayOfWeek}-${slot.timeSlotId}`))) {
    reasons.push('the session falls outside their weekly availability');
  }

  // 3. busy blocks
  const busyBlocks = await prisma.busyBlock.findMany({
    where: { userId: tutor.id, dayOfWeek: slots[0].dayOfWeek },
  });
  if (busyBlocks.some((block) => slots.some((slot) => rangesOverlap(block, slot)))) {
    reasons.push('the session clashes with one of their busy blocks');
  }

  // 4. already holds the session's claim (an event has exactly one claim row)
  const existingClaim = await prisma.timesheetEntry.findFirst({
    where: { eventId: event.id, timesheet: { userId: tutor.id } },
  });
  if (existingClaim) {
    reasons.push('they already hold this session');
  }

  // 5. double-booking against their other claimed sessions on the same date
  const otherClaims = await prisma.timesheetEntry.findMany({
    where: {
      timesheet: { userId: tutor.id },
      eventId: { not: null, notIn: [event.id, ...excluded] },
      status: { not: 'REJECTED' },
    },
    include: { event: { include: EVENT_INCLUDE } },
  });
  const clash = otherClaims
    .filter(
      (entry) =>
        entry.event &&
        !excluded.has(entry.eventId) &&
        entry.event.date.getTime() === event.date.getTime()
    )
    .find((entry) =>
      sessionSlots(entry.event).some((other) => slots.some((slot) => rangesOverlap(other, slot)))
    );
  if (clash) {
    reasons.push(
      `it double-books them against ${clash.event.course.courseCode} on ${formatDate(event.date)}`
    );
  }

  // 6. claimable-hours cap over every 31-day window (sessions the swap moves
  // away from them are excluded so the check reflects the post-swap load)
  const maxClaimableHours = await getTutorMonthlyClaimableHours();
  if (maxClaimableHours !== null) {
    const entries = await prisma.timesheetEntry.findMany({
      where: {
        timesheet: { userId: tutor.id },
        status: { not: 'REJECTED' },
        eventId: { notIn: [...excluded] },
      },
      select: { workDate: true, duration: true },
    });
    const hypothetical = [
      ...entries.map((entry) => ({ workDate: entry.workDate, duration: Number(entry.duration) })),
      { workDate: event.date, duration: sessionDuration(event) },
    ];
    const excessive = findExcessiveWindow(hypothetical, maxClaimableHours);
    if (excessive) {
      reasons.push(
        `it would push them above the ${maxClaimableHours} claimable-hours limit for the window ${formatDate(excessive.start)} to ${formatDate(excessive.end)}`
      );
    }
  }

  return reasons;
};

// Loads a swap or fails with 404; used by every state-transition endpoint.
const loadSwap = async (id) => {
  const swap = await prisma.swapRequest.findUnique({ where: { id }, include: SWAP_INCLUDE });
  if (!swap) {
    const error = new Error('Swap request not found');
    error.statusCode = 404;
    throw error;
  }
  return swap;
};

// ── GET /swaps/my-sessions ── The sessions a tutor can offer in a swap ───────

exports.getMySessions = catchAsync(async (req, res, next) => {
  const user = await getUser(req.user.user_id);
  if (user.role.toUpperCase() !== 'TUTOR') {
    const error = new Error('Only tutors can offer their sessions for swapping');
    error.statusCode = 403;
    return next(error);
  }

  const entries = await getSwappableEntries(user.id);
  res.status(200).json(
    entries.map((entry) => ({
      entryId: entry.id,
      timesheetId: entry.timesheetId,
      ...serializeSession(entry.event),
    }))
  );
});

// ── GET /swaps/candidates/:eventId ── Eligible swap partners for a session ───

exports.getCandidates = catchAsync(async (req, res, next) => {
  const user = await getUser(req.user.user_id);
  if (user.role.toUpperCase() !== 'TUTOR') {
    const error = new Error('Only tutors can view swap candidates');
    error.statusCode = 403;
    return next(error);
  }

  const { parsed: eventId, error } = parseIdParam(req.params.eventId, 'eventId');
  if (error) return next(error);

  // The session must be one of the tutor's own claimed (and still pending) sessions
  const ownEntry = await prisma.timesheetEntry.findFirst({
    where: {
      eventId,
      timesheet: { userId: user.id },
      status: 'PENDING',
    },
    include: { event: { include: EVENT_INCLUDE } },
  });
  if (!ownEntry) {
    const error = new Error('Session not found among your claimed sessions');
    error.statusCode = 404;
    return next(error);
  }

  // Every other active tutor allocated to the same course is a potential partner
  const assignments = await prisma.tutorAssignment.findMany({
    where: {
      courseId: ownEntry.event.courseId,
      userId: { not: user.id },
      user: { role: 'TUTOR', isActive: true },
    },
    include: { user: true },
  });

  const candidates = [];
  for (const assignment of assignments) {
    const tutor = assignment.user;
    const reasons = await validateSwapSide(tutor, ownEntry.event);

    // Sessions that could come back the other way must sit on a course the
    // requester is allocated to — each side of the trade is validated independently
    const theirEntries = await getSwappableEntries(tutor.id);
    const sessions = [];
    for (const entry of theirEntries) {
      const requesterAssigned = await prisma.tutorAssignment.findFirst({
        where: { userId: user.id, courseId: entry.event.courseId },
      });
      if (!requesterAssigned) continue;
      const sessionReasons = await validateSwapSide(user, entry.event);
      sessions.push({
        entryId: entry.id,
        ...serializeSession(entry.event),
        eligible: sessionReasons.length === 0,
        reasons: sessionReasons,
      });
    }

    candidates.push({
      userId: tutor.id,
      name: nameOf(tutor),
      email: tutor.email,
      eligible: reasons.length === 0,
      reasons,
      sessions,
    });
  }

  res.status(200).json({
    session: { entryId: ownEntry.id, ...serializeSession(ownEntry.event) },
    candidates,
  });
});

// ── POST /swaps ── Create a swap request ─────────────────────────────────────

exports.createSwap = catchAsync(async (req, res, next) => {
  const user = await getUser(req.user.user_id);
  if (user.role.toUpperCase() !== 'TUTOR') {
    const error = new Error('Only tutors can request a session swap');
    error.statusCode = 403;
    return next(error);
  }

  const { recipientId, requesterEventId, recipientEventId, reason } = req.body || {};

  const recipientCheck = parseIdParam(recipientId, 'recipientId');
  if (recipientCheck.error) return next(recipientCheck.error);
  const eventCheck = parseIdParam(requesterEventId, 'requesterEventId');
  if (eventCheck.error) return next(eventCheck.error);

  let parsedRecipientEventId = null;
  if (recipientEventId !== undefined && recipientEventId !== null) {
    const backCheck = parseIdParam(recipientEventId, 'recipientEventId');
    if (backCheck.error) return next(backCheck.error);
    parsedRecipientEventId = backCheck.parsed;
    if (parsedRecipientEventId === eventCheck.parsed) {
      const error = new Error('A two-way swap needs two different sessions');
      error.statusCode = 400;
      return next(error);
    }
  }

  const recipient = await prisma.user.findUnique({ where: { id: recipientCheck.parsed } });
  if (!recipient || recipient.role.toUpperCase() !== 'TUTOR' || !recipient.isActive) {
    const error = new Error('The swap partner must be an active tutor');
    error.statusCode = 404;
    return next(error);
  }
  if (recipient.id === user.id) {
    const error = new Error('You cannot swap a session with yourself');
    error.statusCode = 400;
    return next(error);
  }

  // The offered session must be a pending claim of the requester
  const ownEntry = await prisma.timesheetEntry.findFirst({
    where: {
      eventId: eventCheck.parsed,
      timesheet: { userId: user.id },
      status: 'PENDING',
    },
    include: { event: { include: EVENT_INCLUDE } },
  });
  if (!ownEntry) {
    const error = new Error('Session not found among your claimed sessions');
    error.statusCode = 404;
    return next(error);
  }

  // One live swap per offered session — a second request must wait for a terminal state
  const activeSwap = await prisma.swapRequest.findFirst({
    where: { requesterEventId: eventCheck.parsed, status: { in: ['PENDING', 'ACCEPTED'] } },
  });
  if (activeSwap) {
    const error = new Error('This session already has a swap request awaiting a decision');
    error.statusCode = 409;
    return next(error);
  }

  // Automated constraints validation, same checks as a tutor being allocated
  const recipientReasons = await validateSwapSide(recipient, ownEntry.event);
  if (recipientReasons.length > 0) {
    const error = new Error(
      `${nameOf(recipient)} cannot take over this session: ${recipientReasons.join('; ')}`
    );
    error.statusCode = 403;
    return next(error);
  }

  // Optional two-way leg: the recipient's session coming back to the requester
  let recipientEvent = null;
  if (parsedRecipientEventId !== null) {
    const theirEntry = await prisma.timesheetEntry.findFirst({
      where: {
        eventId: parsedRecipientEventId,
        timesheet: { userId: recipient.id },
        status: 'PENDING',
      },
      include: { event: { include: EVENT_INCLUDE } },
    });
    if (!theirEntry) {
      const error = new Error('The requested session was not found among the partner\'s claimed sessions');
      error.statusCode = 404;
      return next(error);
    }

    const requesterReasons = await validateSwapSide(user, theirEntry.event, [ownEntry.eventId]);
    if (requesterReasons.length > 0) {
      const error = new Error(
        `You cannot take over the requested session: ${requesterReasons.join('; ')}`
      );
      error.statusCode = 403;
      return next(error);
    }
    recipientEvent = theirEntry.event;
  }

  const swap = await prisma.swapRequest.create({
    data: {
      requesterId: user.id,
      recipientId: recipient.id,
      requesterEventId: ownEntry.eventId,
      recipientEventId: recipientEvent ? recipientEvent.id : null,
      reason: typeof reason === 'string' && reason.trim() ? reason.trim() : null,
    },
    include: SWAP_INCLUDE,
  });

  // Fire-and-forget: the partner is told a swap request is waiting for them
  notifySwapRequested(swap).catch(() => {});

  res.status(201).json(serializeSwap(swap));
});

// ── GET /swaps ── Swap requests involving the caller (all for organisers) ────

exports.getSwaps = catchAsync(async (req, res, next) => {
  const user = await getUser(req.user.user_id);
  const role = user.role.toUpperCase();

  const where = {};
  if (role === 'ORGANISER' || role === 'ADMIN') {
    // Organisers see the full queue, optionally filtered by status
    if (req.query.status) {
      where.status = String(req.query.status).toUpperCase();
    }
  } else if (role === 'TUTOR') {
    where.OR = [{ requesterId: user.id }, { recipientId: user.id }];
    if (req.query.status) {
      where.status = String(req.query.status).toUpperCase();
    }
  } else {
    const error = new Error('Only tutors and organisers can view swap requests');
    error.statusCode = 403;
    return next(error);
  }

  const swaps = await prisma.swapRequest.findMany({
    where,
    include: SWAP_INCLUDE,
    orderBy: { requestedAt: 'desc' },
  });

  res.status(200).json(swaps.map(serializeSwap));
});

// ── POST /swaps/:id/accept ── The recipient agrees to the trade ──────────────

exports.acceptSwap = catchAsync(async (req, res, next) => {
  const user = await getUser(req.user.user_id);
  const { parsed: id, error } = parseIdParam(req.params.id, 'Swap request ID');
  if (error) return next(error);

  const swap = await loadSwap(id);
  if (swap.recipientId !== user.id) {
    const error = new Error('Only the tutor the swap was offered to can respond to it');
    error.statusCode = 403;
    return next(error);
  }
  if (swap.status !== 'PENDING') {
    const error = new Error(`Only pending swap requests can be accepted (current status: ${swap.status})`);
    error.statusCode = 409;
    return next(error);
  }

  const updated = await prisma.swapRequest.update({
    where: { id: swap.id },
    data: { status: 'ACCEPTED', respondedAt: new Date() },
    include: SWAP_INCLUDE,
  });

  // The requester learns the trade is agreed and now awaits organiser approval
  notifySwapResponded(updated).catch(() => {});

  res.status(200).json(serializeSwap(updated));
});

// ── POST /swaps/:id/decline ── The recipient turns the trade down ────────────

exports.declineSwap = catchAsync(async (req, res, next) => {
  const user = await getUser(req.user.user_id);
  const { parsed: id, error } = parseIdParam(req.params.id, 'Swap request ID');
  if (error) return next(error);

  const swap = await loadSwap(id);
  if (swap.recipientId !== user.id) {
    const error = new Error('Only the tutor the swap was offered to can respond to it');
    error.statusCode = 403;
    return next(error);
  }
  if (swap.status !== 'PENDING') {
    const error = new Error(`Only pending swap requests can be declined (current status: ${swap.status})`);
    error.statusCode = 409;
    return next(error);
  }

  const { reason } = req.body || {};
  const updated = await prisma.swapRequest.update({
    where: { id: swap.id },
    data: {
      status: 'REJECTED',
      respondedAt: new Date(),
      rejectionReason: typeof reason === 'string' && reason.trim() ? reason.trim() : null,
    },
    include: SWAP_INCLUDE,
  });

  notifySwapResponded(updated).catch(() => {});

  res.status(200).json(serializeSwap(updated));
});

// ── POST /swaps/:id/cancel ── The requester withdraws before a response ──────

exports.cancelSwap = catchAsync(async (req, res, next) => {
  const user = await getUser(req.user.user_id);
  const { parsed: id, error } = parseIdParam(req.params.id, 'Swap request ID');
  if (error) return next(error);

  const swap = await loadSwap(id);
  if (swap.requesterId !== user.id) {
    const error = new Error('Only the tutor who requested the swap can cancel it');
    error.statusCode = 403;
    return next(error);
  }
  if (swap.status !== 'PENDING') {
    const error = new Error(`Only pending swap requests can be cancelled (current status: ${swap.status})`);
    error.statusCode = 409;
    return next(error);
  }

  const updated = await prisma.swapRequest.update({
    where: { id: swap.id },
    data: { status: 'CANCELLED' },
    include: SWAP_INCLUDE,
  });

  res.status(200).json(serializeSwap(updated));
});

// Moves one session's claim to another tutor inside the approval transaction.
// The claim row itself is reused (TimesheetEntry.eventId is unique) — only its
// timesheet changes, so a session always has at most one claim in the system.
const transferClaim = async (tx, { fromUserId, toUserId, event }) => {
  const entry = await tx.timesheetEntry.findFirst({
    where: { eventId: event.id, timesheet: { userId: fromUserId } },
  });

  // The receiving tutor gets the entry on their newest draft timesheet; a fresh
  // one is opened when they have none, mirroring how event claims are recorded
  let target = await tx.timesheet.findFirst({
    where: { userId: toUserId, status: 'DRAFT' },
    orderBy: { createdAt: 'desc' },
  });
  if (!target) {
    target = await tx.timesheet.create({
      data: {
        userId: toUserId,
        name: `Swap ${formatDate(event.date)}`,
        status: 'DRAFT',
      },
    });
  }

  await tx.timesheetEntry.update({
    where: { id: entry.id },
    data: { timesheetId: target.id },
  });

  // Keep both affected timesheet totals in sync with their entries
  for (const timesheetId of [entry.timesheetId, target.id]) {
    const entries = await tx.timesheetEntry.findMany({
      where: { timesheetId },
      select: { duration: true },
    });
    const totalHours = entries.reduce((sum, e) => sum + Number(e.duration), 0);
    await tx.timesheet.update({ where: { id: timesheetId }, data: { totalHours } });
  }
};

// ── POST /swaps/:id/approve ── Organiser approval executes the trade ─────────

exports.approveSwap = catchAsync(async (req, res, next) => {
  const user = await getUser(req.user.user_id);
  const role = user.role.toUpperCase();
  if (role !== 'ORGANISER' && role !== 'ADMIN') {
    const error = new Error('Only organisers can approve swap requests');
    error.statusCode = 403;
    return next(error);
  }

  const { parsed: id, error } = parseIdParam(req.params.id, 'Swap request ID');
  if (error) return next(error);

  const swap = await loadSwap(id);
  if (swap.status !== 'ACCEPTED') {
    const error = new Error(
      `Only swaps both tutors have agreed to can be approved — the requester and recipient must accept first (current status: ${swap.status})`
    );
    error.statusCode = 409;
    return next(error);
  }

  // Both tutors must still hold the claims being traded
  const blockers = [];
  for (const [holder, event, label] of [
    [swap.requester, swap.requesterEvent, nameOf(swap.requester)],
    ...(swap.recipientEvent ? [[swap.recipient, swap.recipientEvent, nameOf(swap.recipient)]] : []),
  ]) {
    const entry = await prisma.timesheetEntry.findFirst({
      where: { eventId: event.id, timesheet: { userId: holder.id } },
    });
    if (!entry) {
      blockers.push(`${label} no longer holds the claim for ${event.course.courseCode} on ${formatDate(event.date)}`);
    } else if (entry.status !== 'PENDING') {
      blockers.push(
        `the claim ${label} holds for ${event.course.courseCode} on ${formatDate(event.date)} is no longer pending`
      );
    }
  }

  // Constraints are re-validated at approval time — availability, allocations
  // and hour loads may have changed since the request was created
  const movedEventIds = [swap.requesterEventId, swap.recipientEventId].filter(Boolean);
  const recipientReasons = await validateSwapSide(swap.recipient, swap.requesterEvent, movedEventIds);
  recipientReasons.forEach((r) => blockers.push(`${nameOf(swap.recipient)}: ${r}`));
  if (swap.recipientEvent) {
    const requesterReasons = await validateSwapSide(swap.requester, swap.recipientEvent, movedEventIds);
    requesterReasons.forEach((r) => blockers.push(`${nameOf(swap.requester)}: ${r}`));
  }

  if (blockers.length > 0) {
    const error = new Error(`This swap no longer passes validation: ${blockers.join('; ')}`);
    error.statusCode = 409;
    return next(error);
  }

  await prisma.$transaction(async (tx) => {
    await transferClaim(tx, {
      fromUserId: swap.requesterId,
      toUserId: swap.recipientId,
      event: swap.requesterEvent,
    });
    if (swap.recipientEvent) {
      await transferClaim(tx, {
        fromUserId: swap.recipientId,
        toUserId: swap.requesterId,
        event: swap.recipientEvent,
      });
    }
    await tx.swapRequest.update({
      where: { id: swap.id },
      data: { status: 'APPROVED', reviewedAt: new Date(), reviewedById: user.id },
    });
  });

  const updated = await prisma.swapRequest.findUnique({ where: { id: swap.id }, include: SWAP_INCLUDE });

  // Both tutors are told the organiser approved and the sessions moved
  notifySwapReviewed(updated).catch(() => {});

  res.status(200).json(serializeSwap(updated));
});

// ── POST /swaps/:id/reject ── Organiser rejection after both tutors agreed ───

exports.rejectSwap = catchAsync(async (req, res, next) => {
  const user = await getUser(req.user.user_id);
  const role = user.role.toUpperCase();
  if (role !== 'ORGANISER' && role !== 'ADMIN') {
    const error = new Error('Only organisers can reject swap requests');
    error.statusCode = 403;
    return next(error);
  }

  const { parsed: id, error } = parseIdParam(req.params.id, 'Swap request ID');
  if (error) return next(error);

  const swap = await loadSwap(id);
  if (swap.status !== 'ACCEPTED') {
    const error = new Error(
      `Only swaps both tutors have agreed to can be rejected (current status: ${swap.status})`
    );
    error.statusCode = 409;
    return next(error);
  }

  const { reason } = req.body || {};
  const updated = await prisma.swapRequest.update({
    where: { id: swap.id },
    data: {
      status: 'REJECTED',
      reviewedAt: new Date(),
      reviewedById: user.id,
      rejectionReason: typeof reason === 'string' && reason.trim() ? reason.trim() : null,
    },
    include: SWAP_INCLUDE,
  });

  notifySwapReviewed(updated).catch(() => {});

  res.status(200).json(serializeSwap(updated));
});
