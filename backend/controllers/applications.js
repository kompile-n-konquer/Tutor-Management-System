const prisma = require('../prisma/client');
const catchAsync = require('../utils/catchAsync');
const getLockedSlots = require('../utils/availabilityLocks');
const { getTutorMonthlyClaimableHours } = require('../utils/systemSettings');
const { slotHours } = require('../utils/claimRules');

// Only students and tutors take part in the tutor application workflow
const isApplicantRole = (role) => role === 'STUDENT' || role === 'TUTOR';

// An opportunity is visible to a user only when their availability covers every
// tutoring slot of the course (day + time slot must both match)
const coversAllSlots = (courseSlots, availabilityEntries) => {
  const availableKeys = new Set(
    availabilityEntries.map((entry) => `${entry.dayOfWeek}-${entry.timeSlotId}`)
  );
  return courseSlots.every((slot) => availableKeys.has(`${slot.dayOfWeek}-${slot.timeSlotId}`));
};

// Weekly hours a tutor can claim on a course: every tutoring slot counts as at least
// one full hour, rounded up to whole hours (08:00-08:45 -> 1 hour), summed over the Mon-Fri slots
const weeklyClaimableHours = (courseSlots) =>
  courseSlots.reduce(
    (total, slot) => total + slotHours(slot.timeSlot.startMinute, slot.timeSlot.endMinute),
    0
  );

// Weekly hours the user is already committed to through their assigned courses,
// using the same round-up rule as the opportunity serializer
const assignedWeeklyHours = async (userId) => {
  const assignments = await prisma.tutorAssignment.findMany({
    where: { userId },
    include: { course: { include: { slots: { include: { timeSlot: true } } } } },
  });
  return assignments.reduce(
    (total, assignment) => total + weeklyClaimableHours(assignment.course.slots),
    0
  );
};

// Shapes a course (with its slots + owner) into the opportunity payload for students
const serializeOpportunity = (course) => ({
  id: course.id,
  courseCode: course.courseCode,
  courseName: course.courseName,
  minimumMark: course.minimumMark,
  tutorsRequired: course.tutorsRequired,
  createdAt: course.createdAt,
  lecturer: course.user ? `${course.user.firstName} ${course.user.lastName}` : null,
  slots: course.slots.map((slot) => ({
    dayOfWeek: slot.dayOfWeek,
    timeSlotId: slot.timeSlotId,
    startMinute: slot.timeSlot.startMinute,
    endMinute: slot.timeSlot.endMinute,
  })),
  slotsCount: course.slots.length,
  weeklyHours: weeklyClaimableHours(course.slots),
  assignedTutors: course._count.assignments,
});

exports.getOpportunities = catchAsync(async (req, res, next) => {
  const firebaseUid = req.user.user_id;

  const user = await prisma.user.findUnique({ where: { firebaseUid } });
  if (!user) {
    const error = new Error('User not found. Please check if the user exists');
    error.statusCode = 404;
    return next(error);
  }

  const role = user.role.toUpperCase();
  if (!isApplicantRole(role)) {
    const error = new Error('Only students and tutors can view tutoring opportunities');
    error.statusCode = 403;
    return next(error);
  }

  const [courses, availability, applications] = await Promise.all([
    prisma.course.findMany({
      where: { acceptingApplications: true },
      include: {
        user: { select: { firstName: true, lastName: true } },
        slots: {
          include: { timeSlot: true },
          orderBy: [{ dayOfWeek: 'asc' }, { timeSlot: { startMinute: 'asc' } }],
        },
        _count: { select: { assignments: true } },
      },
      orderBy: { createdAt: 'desc' },
    }),
    prisma.availability.findMany({
      where: { userId: user.id },
      select: { dayOfWeek: true, timeSlotId: true },
    }),
    prisma.application.findMany({ where: { userId: user.id } }),
  ]);

  // Only courses whose tutoring slots all fall inside the user's availability are returned,
  // and courses already applied to are excluded — they count as applications, not opportunities
  const appliedCourseIds = new Set(applications.map((application) => application.courseId));
  const opportunities = courses
    .filter((course) => coversAllSlots(course.slots, availability) && !appliedCourseIds.has(course.id))
    .map((course) => serializeOpportunity(course));

  res.status(200).json(opportunities);
});

exports.getOpportunity = catchAsync(async (req, res, next) => {
  const firebaseUid = req.user.user_id;

  const user = await prisma.user.findUnique({ where: { firebaseUid } });
  if (!user) {
    const error = new Error('User not found. Please check if the user exists');
    error.statusCode = 404;
    return next(error);
  }

  const role = user.role.toUpperCase();
  if (!isApplicantRole(role)) {
    const error = new Error('Only students and tutors can view tutoring opportunities');
    error.statusCode = 403;
    return next(error);
  }

  const courseId = Number(req.params.courseId);
  if (!Number.isInteger(courseId)) {
    const error = new Error('courseId must be a number');
    error.statusCode = 400;
    return next(error);
  }

  const course = await prisma.course.findUnique({
    where: { id: courseId },
    include: {
      user: { select: { firstName: true, lastName: true } },
      slots: {
        include: { timeSlot: true },
        orderBy: [{ dayOfWeek: 'asc' }, { timeSlot: { startMinute: 'asc' } }],
      },
      _count: { select: { assignments: true } },
    },
  });
  if (!course || !course.acceptingApplications) {
    const error = new Error('Opportunity not found or no longer accepting applications');
    error.statusCode = 404;
    return next(error);
  }

  // An applied course no longer counts as an opportunity for this student
  const application = await prisma.application.findFirst({ where: { userId: user.id, courseId } });
  if (application) {
    const error = new Error('You have already applied for this opportunity. It is listed under My Applications');
    error.statusCode = 404;
    return next(error);
  }

  const availability = await prisma.availability.findMany({
    where: { userId: user.id },
    select: { dayOfWeek: true, timeSlotId: true },
  });
  if (!coversAllSlots(course.slots, availability)) {
    const error = new Error('You can only view opportunities whose tutoring slots fit your availability');
    error.statusCode = 403;
    return next(error);
  }

  // Slots of this course already held by the viewer's other submitted applications,
  // so the timetable grid can flag them as locked
  const lockedSlots = await getLockedSlots(user.id);
  const lockedKeys = new Set(lockedSlots.map((entry) => `${entry.dayOfWeek}-${entry.timeSlotId}`));

  // Hours cap: once the organiser has set a maximum, the page replaces the apply form with a
  // notice when accepting this course would push the student above it
  const [maxClaimableHours, assignedHours] = await Promise.all([
    getTutorMonthlyClaimableHours(),
    assignedWeeklyHours(user.id),
  ]);
  const hoursExceeded =
    maxClaimableHours !== null && assignedHours + weeklyClaimableHours(course.slots) > maxClaimableHours;

  res.status(200).json({
    ...serializeOpportunity(course),
    assignedHours,
    maxClaimableHours,
    hoursExceeded,
    lockedSlots: course.slots
      .filter((slot) => lockedKeys.has(`${slot.dayOfWeek}-${slot.timeSlotId}`))
      .map((slot) => ({ dayOfWeek: slot.dayOfWeek, timeSlotId: slot.timeSlotId })),
  });
});

exports.createApplication = catchAsync(async (req, res, next) => {
  const firebaseUid = req.user.user_id;

  const user = await prisma.user.findUnique({ where: { firebaseUid } });
  if (!user) {
    const error = new Error('User not found. Please check if the user exists');
    error.statusCode = 404;
    return next(error);
  }

  const role = user.role.toUpperCase();
  if (!isApplicantRole(role)) {
    const error = new Error('Only students and tutors can apply for tutoring opportunities');
    error.statusCode = 403;
    return next(error);
  }

  // courseId comes from the route param; only courseMark is read from the body
  const courseId = Number(req.params.courseId);
  if (!Number.isInteger(courseId)) {
    const error = new Error('courseId must be a number');
    error.statusCode = 400;
    return next(error);
  }

  const { courseMark } = req.body;

  const parsedCourseMark = Number(courseMark);
  if (
    courseMark === undefined ||
    courseMark === null ||
    Number.isNaN(parsedCourseMark) ||
    parsedCourseMark < 0 ||
    parsedCourseMark > 100
  ) {
    const error = new Error('courseMark must be a number between 0 and 100');
    error.statusCode = 400;
    return next(error);
  }

  const course = await prisma.course.findUnique({
    where: { id: courseId },
    include: {
      slots: { include: { timeSlot: true }, orderBy: [{ dayOfWeek: 'asc' }, { timeSlot: { startMinute: 'asc' } }] },
    },
  });
  if (!course) {
    const error = new Error('Course not found');
    error.statusCode = 404;
    return next(error);
  }

  if (!course.acceptingApplications) {
    const error = new Error('This course is not accepting applications');
    error.statusCode = 400;
    return next(error);
  }

  const existingApplication = await prisma.application.findFirst({
    where: { userId: user.id, courseId: course.id },
  });
  if (existingApplication) {
    const error = new Error('You have already applied for this opportunity');
    error.statusCode = 409;
    return next(error);
  }

  const availability = await prisma.availability.findMany({
    where: { userId: user.id },
    select: { dayOfWeek: true, timeSlotId: true },
  });
  if (!coversAllSlots(course.slots, availability)) {
    const error = new Error('You can only apply for opportunities whose tutoring slots fit your availability');
    error.statusCode = 403;
    return next(error);
  }

  if (parsedCourseMark < course.minimumMark) {
    const error = new Error(
      `Your mark does not meet the minimum mark of ${course.minimumMark} required for this course`
    );
    error.statusCode = 403;
    return next(error);
  }

  // Backstop for the hours cap the opportunity page warns about: an application that would
  // push the student above the organiser-set maximum claimable hours is rejected here too
  const maxClaimableHours = await getTutorMonthlyClaimableHours();
  if (maxClaimableHours !== null) {
    const courseHours = weeklyClaimableHours(course.slots);
    const assignedHours = await assignedWeeklyHours(user.id);
    if (assignedHours + courseHours > maxClaimableHours) {
      const error = new Error(
        `Tutoring this course would give you ${assignedHours + courseHours} hours, above the maximum of ${maxClaimableHours} claimable hours`
      );
      error.statusCode = 403;
      return next(error);
    }
  }

  const application = await prisma.application.create({
    data: {
      userId: user.id,
      courseId: course.id,
      courseMark: parsedCourseMark,
    },
  });

  res.status(201).json({
    id: application.id,
    courseId: application.courseId,
    courseMark: application.courseMark,
    status: application.status,
    appliedAt: application.appliedAt,
  });
});

exports.getMyApplications = catchAsync(async (req, res, next) => {
  const firebaseUid = req.user.user_id;

  const user = await prisma.user.findUnique({ where: { firebaseUid } });
  if (!user) {
    const error = new Error('User not found. Please check if the user exists');
    error.statusCode = 404;
    return next(error);
  }

  const applications = await prisma.application.findMany({
    where: { userId: user.id },
    include: {
      course: { select: { courseCode: true, courseName: true, minimumMark: true, acceptingApplications: true } },
    },
    orderBy: { appliedAt: 'desc' },
  });

  res.status(200).json(
    applications.map((application) => ({
      id: application.id,
      courseId: application.courseId,
      courseCode: application.course.courseCode,
      courseName: application.course.courseName,
      minimumMark: application.course.minimumMark,
      acceptingApplications: application.course.acceptingApplications,
      courseMark: application.courseMark,
      status: application.status,
      appliedAt: application.appliedAt,
    }))
  );
});
