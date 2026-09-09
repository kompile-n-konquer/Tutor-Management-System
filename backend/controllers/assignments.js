const { PrismaClient } = require('@prisma/client');
const catchAsync = require('../utils/catchAsync');
const { notifyAssignmentAdded, notifyAssignmentRemoved } = require('../email/notifier');

const prisma = new PrismaClient();

// Shape returned to the frontend. The tutor's user record is included so the
// same query result can be handed straight to the notification helpers.
const ASSIGNMENT_SELECT = {
  id: true,
  tutorId: true,
  courseId: true,
  allocatedHours: true,
  semester: true,
  status: true,
  course: {
    select: {
      courseCode: true,
      courseName: true,
    },
  },
  tutor: {
    select: {
      id: true,
      status: true,
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

exports.getAllAssignments = catchAsync(async (req, res, next) => {
  const uid = req.user && req.user.uid;

  if (!uid) {
    const error = new Error('Not authenticated');
    error.statusCode = 401;
    return next(error);
  }

  const user = await prisma.user.findUnique({
    where: { firebaseUid: uid },
    include: { tutor: true },
  });

  if (!user) {
    const error = new Error('User not found');
    error.statusCode = 404;
    return next(error);
  }

  // Strictly tutor-scoped: a valid tutor profile is always required and only
  // that tutor's assignments are returned (no admin fallback).
  if (user.role !== 'TUTOR' || !user.tutor) {
    const error = new Error('Only tutors can view their assignments');
    error.statusCode = 403;
    return next(error);
  }

  const assignments = await prisma.tutorAssignment.findMany({
    where: { tutorId: user.tutor.id },
    select: ASSIGNMENT_SELECT,
    orderBy: {
      id: 'asc',
    },
  });

  res.json(assignments);
});

/**
 * POST /api/assignments
 *
 * Create a new tutor-to-course assignment and notify the tutor by email.
 *
 * Required body fields:
 *   tutorId        – ID of the tutor to assign
 *   courseId       – ID of the course to assign them to
 *   allocatedHours – number of hours allocated
 *   semester       – semester identifier (e.g. "2026-S1")
 *   status         – assignment status (e.g. "ACTIVE")
 */
exports.createAssignment = catchAsync(async (req, res, next) => {
  const { tutorId, courseId, allocatedHours, semester, status } = req.body;

  if (
    tutorId == null ||
    courseId == null ||
    allocatedHours == null ||
    !semester ||
    !status
  ) {
    const error = new Error(
      'Missing required fields: tutorId, courseId, allocatedHours, semester, status'
    );
    error.statusCode = 400;
    return next(error);
  }

  if (
    typeof allocatedHours !== 'number' ||
    allocatedHours < 0 ||
    !Number.isInteger(allocatedHours)
  ) {
    const error = new Error('allocatedHours must be a non-negative integer');
    error.statusCode = 400;
    return next(error);
  }

  const tutor = await prisma.tutor.findUnique({ where: { id: tutorId } });
  if (!tutor) {
    const error = new Error('Tutor not found');
    error.statusCode = 404;
    return next(error);
  }

  const course = await prisma.course.findUnique({ where: { id: courseId } });
  if (!course) {
    const error = new Error('Course not found');
    error.statusCode = 404;
    return next(error);
  }

  // Require the tutor to have an approved application for this course
  // before a lecturer can create an assignment for them.
  const approvedApplication = await prisma.applicant.findFirst({
    where: {
      userId: tutor.userId,
      courseId,
      status: 'APPROVED',
    },
  });

  if (!approvedApplication) {
    const error = new Error(
      'This tutor does not have an approved application for this course'
    );
    error.statusCode = 400;
    return next(error);
  }

  // Prevent the same tutor from being assigned to the same course in
  // the same semester more than once.
  const existing = await prisma.tutorAssignment.findFirst({
    where: { tutorId, courseId, semester },
  });
  if (existing) {
    const error = new Error(
      'This tutor is already assigned to this course for the given semester'
    );
    error.statusCode = 409;
    return next(error);
  }

  const assignment = await prisma.tutorAssignment.create({
    data: {
      tutorId,
      courseId,
      allocatedHours,
      semester,
      status,
    },
    select: ASSIGNMENT_SELECT,
  });

  // Trigger: notify the tutor that they have been assigned. The notifier
  // never throws and logs the attempt in EmailLog, so a Resend outage
  // cannot fail the assignment creation itself.
  await notifyAssignmentAdded(assignment);

  res.status(201).json(assignment);
});

/**
 * DELETE /api/assignments/:id
 *
 * Remove a tutor's assignment and notify the tutor by email. The assignment
 * (with the tutor's user record and course details) is loaded before the
 * deletion so the notification can still reference it afterwards — the
 * EmailLog stores the entity as plain type/id columns for exactly this reason.
 * Sessions belong to their assignment, so removing an assignment removes its
 * sessions as well; without this the FK on Session would block the deletion.
 */
exports.deleteAssignment = catchAsync(async (req, res, next) => {
  const assignmentId = Number(req.params.id);

  if (!Number.isInteger(assignmentId)) {
    const error = new Error('Invalid assignment id');
    error.statusCode = 400;
    return next(error);
  }

  const assignment = await prisma.tutorAssignment.findUnique({
    where: { id: assignmentId },
    select: ASSIGNMENT_SELECT,
  });

  if (!assignment) {
    const error = new Error('Assignment not found');
    error.statusCode = 404;
    return next(error);
  }

  await prisma.session.deleteMany({ where: { assignmentId } });
  await prisma.tutorAssignment.delete({ where: { id: assignmentId } });

  // Trigger: notify the tutor that the assignment has been removed. Sent
  // after the deletion succeeded, so the email never announces a removal
  // that did not happen. notifyAssignmentRemoved never throws.
  await notifyAssignmentRemoved(assignment);

  res.status(204).end();
});
