const prisma = require('../prisma/client');
const catchAsync = require('../utils/catchAsync');
const getLockedSlots = require('../utils/availabilityLocks');
const { getTutorMonthlyClaimableHours } = require('../utils/systemSettings');
const { slotHours } = require('../utils/claimRules');
const { parseTranscriptPdf, buildMarkLookup, lookupMark } = require('../utils/transcriptParser');
const fs = require('fs');
const path = require('path');

// Uploaded transcripts live in the same uploads directory as the claim template
const UPLOADS_DIR = path.join(__dirname, '..', 'uploads');

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

// The user's verified transcript marks indexed for registry-code lookup, or
// null when no transcript has been uploaded or its stored JSON is unreadable
const getTranscriptLookup = async (userId) => {
  const transcript = await prisma.transcript.findUnique({ where: { userId } });
  if (!transcript) return null;
  try {
    return buildMarkLookup(JSON.parse(transcript.coursesJson));
  } catch (error) {
    return null;
  }
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

  const [courses, availability, applications, transcriptLookup] = await Promise.all([
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
    getTranscriptLookup(user.id),
  ]);

  // Only courses whose tutoring slots all fall inside the user's availability are returned,
  // and courses already applied to are excluded — they count as applications, not opportunities.
  // Each opportunity carries the user's verified transcript mark for the course so the
  // qualification against the minimum mark can be shown (null = not on the transcript)
  const appliedCourseIds = new Set(applications.map((application) => application.courseId));
  let opportunities = courses
    .filter((course) => coversAllSlots(course.slots, availability) && !appliedCourseIds.has(course.id))
    .map((course) => {
      const transcriptMark = transcriptLookup ? lookupMark(transcriptLookup, course.courseCode) : null;
      return {
        ...serializeOpportunity(course),
        transcriptMark,
        qualified: transcriptMark === null ? null : transcriptMark >= course.minimumMark,
      };
    });

  // ?qualifiedOnly=true narrows the list to the courses whose minimum mark the
  // verified transcript marks already meet
  if (req.query.qualifiedOnly === 'true' && transcriptLookup) {
    opportunities = opportunities.filter((opportunity) => opportunity.qualified === true);
  }

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
  const [maxClaimableHours, assignedHours, transcriptLookup] = await Promise.all([
    getTutorMonthlyClaimableHours(),
    assignedWeeklyHours(user.id),
    getTranscriptLookup(user.id),
  ]);
  const hoursExceeded =
    maxClaimableHours !== null && assignedHours + weeklyClaimableHours(course.slots) > maxClaimableHours;

  const transcriptMark = transcriptLookup ? lookupMark(transcriptLookup, course.courseCode) : null;

  res.status(200).json({
    ...serializeOpportunity(course),
    assignedHours,
    maxClaimableHours,
    hoursExceeded,
    transcriptMark,
    qualified: transcriptMark === null ? null : transcriptMark >= course.minimumMark,
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

  // A verified transcript mark, when the transcript covers this course, replaces
  // the self-declared one — a typed-in mark cannot override the official record
  const transcriptLookup = await getTranscriptLookup(user.id);
  const verifiedMark = transcriptLookup ? lookupMark(transcriptLookup, course.courseCode) : null;
  const finalMark = verifiedMark ?? parsedCourseMark;

  if (finalMark < course.minimumMark) {
    const error = new Error(
      verifiedMark === null
        ? `Your mark does not meet the minimum mark of ${course.minimumMark} required for this course`
        : `Your verified transcript mark (${verifiedMark}) does not meet the minimum mark of ${course.minimumMark} required for this course`
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
      courseMark: finalMark,
    },
  });

  res.status(201).json({
    id: application.id,
    courseId: application.courseId,
    courseMark: application.courseMark,
    markVerified: verifiedMark !== null,
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

// --- Academic transcript upload and verification ---

// Accepts a transcript PDF, parses the completed courses and their final marks
// out of it, and stores them as the user's verified marks. Uploading again
// replaces the previous transcript (and deletes its file from disk).
exports.uploadTranscript = catchAsync(async (req, res, next) => {
  const firebaseUid = req.user.user_id;

  const user = await prisma.user.findUnique({ where: { firebaseUid } });
  if (!user) {
    const error = new Error('User not found. Please check if the user exists');
    error.statusCode = 404;
    return next(error);
  }

  const role = user.role.toUpperCase();
  if (!isApplicantRole(role)) {
    const error = new Error('Only students and tutors can upload an academic transcript');
    error.statusCode = 403;
    return next(error);
  }

  if (!req.file) {
    const error = new Error('No PDF file was provided');
    error.statusCode = 400;
    return next(error);
  }

  let parsed;
  try {
    parsed = await parseTranscriptPdf(fs.readFileSync(req.file.path));
  } catch (parseError) {
    fs.unlink(req.file.path, () => {}); // never keep a file we could not read
    const error = new Error('The PDF could not be read. Please upload a valid academic transcript');
    error.statusCode = 400;
    return next(error);
  }

  if (parsed.courses.length === 0) {
    fs.unlink(req.file.path, () => {}); // nothing verifiable — do not keep the file
    const error = new Error('No completed courses with final marks could be read from this transcript');
    error.statusCode = 400;
    return next(error);
  }

  // The new upload replaces the previous one — remove the old file from disk
  const existing = await prisma.transcript.findUnique({ where: { userId: user.id } });
  if (existing) {
    const oldPath = path.join(UPLOADS_DIR, existing.fileName);
    if (fs.existsSync(oldPath)) fs.unlinkSync(oldPath);
  }

  const transcript = await prisma.transcript.upsert({
    where: { userId: user.id },
    update: {
      fileName: req.file.filename,
      studentNumber: parsed.studentNumber,
      coursesJson: JSON.stringify(parsed.courses),
      parsedAt: new Date(),
    },
    create: {
      userId: user.id,
      fileName: req.file.filename,
      studentNumber: parsed.studentNumber,
      coursesJson: JSON.stringify(parsed.courses),
    },
  });

  res.status(201).json({
    id: transcript.id,
    fileName: transcript.fileName,
    studentNumber: transcript.studentNumber,
    parsedAt: transcript.parsedAt,
    courses: parsed.courses,
  });
});

// Returns the marks parsed from the user's currently uploaded transcript
exports.getMyTranscript = catchAsync(async (req, res, next) => {
  const firebaseUid = req.user.user_id;

  const user = await prisma.user.findUnique({ where: { firebaseUid } });
  if (!user) {
    const error = new Error('User not found. Please check if the user exists');
    error.statusCode = 404;
    return next(error);
  }

  const role = user.role.toUpperCase();
  if (!isApplicantRole(role)) {
    const error = new Error('Only students and tutors can view their academic transcript');
    error.statusCode = 403;
    return next(error);
  }

  const transcript = await prisma.transcript.findUnique({ where: { userId: user.id } });
  if (!transcript) {
    const error = new Error('No transcript has been uploaded yet');
    error.statusCode = 404;
    return next(error);
  }

  let courses;
  try {
    courses = JSON.parse(transcript.coursesJson);
  } catch (parseError) {
    const error = new Error('The stored transcript could not be read. Please upload it again');
    error.statusCode = 500;
    return next(error);
  }

  res.status(200).json({
    id: transcript.id,
    fileName: transcript.fileName,
    studentNumber: transcript.studentNumber,
    parsedAt: transcript.parsedAt,
    courses,
  });
});
