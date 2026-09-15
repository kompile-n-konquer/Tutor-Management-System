const prisma = require('../prisma/client');
const catchAsync = require('../utils/catchAsync');
const getFirebaseAdmin = require('../firebase/admin');
const { normaliseRole } = require('../utils/roles');

// Fields every user endpoint may expose. firebaseUid is the Firebase subject
// identifier and never leaves the server — clients already know their own UID
// from the Firebase SDK, and other users' UIDs are nobody's business.
const USER_PUBLIC_SELECT = {
  id: true,
  studentNumber: true,
  employeeNumber: true,
  firstName: true,
  lastName: true,
  email: true,
  phoneNumber: true,
  yearOfStudy: true,
  role: true,
  isActive: true,
  createdAt: true,
  updatedAt: true,
};

// Organiser/admin view of every registered account (no authentication secrets).
// Route-level requireRole gates this to ORGANISER and ADMIN.
exports.getAllUsers = catchAsync(async (req, res, next) => {
  const users = await prisma.user.findMany({
    select: USER_PUBLIC_SELECT,
    orderBy: { id: 'asc' },
  });
  res.json(users);
});

exports.getUser = catchAsync(async (req, res, next) => {
  const firebaseUid = req.params.firebaseUid;

  // A user may only look up their own record; organisers and admins
  // administer everyone.
  const isSelf = req.user.user_id === firebaseUid;
  const isStaff = req.user.role === 'ORGANISER' || req.user.role === 'ADMIN';
  if (!isSelf && !isStaff) {
    const error = new Error('You can only view your own profile');
    error.statusCode = 403;
    return next(error);
  }

  const user = await prisma.user.findUnique({
    where: { firebaseUid },
    select: USER_PUBLIC_SELECT,
  });
  if (!user) {
    const error = new Error('User not found. Please check if the user exists');
    error.statusCode = 404;
    return next(error);
  }

  res.status(200).json(user);
});

exports.getUserMe = catchAsync(async (req, res, next) => {
  const user = await prisma.user.findUnique({
    where: { id: req.user.id },
    select: USER_PUBLIC_SELECT,
  });

  if (!user) {
    const error = new Error('User not found');
    error.statusCode = 404;
    return next(error);
  }

  res.json(user);
});

exports.createUser = catchAsync(async (req, res, next) => {
  const { firstName, lastName, email, firebaseUid } = req.body;

  if (!firstName || !lastName || !email || !firebaseUid) {
    const error = new Error('All fields are required. Please provide all fields');
    error.statusCode = 400;
    return next(error);
  }

  // Signup must prove ownership of the Firebase identity being registered: the
  // token's uid (set by verifyFirebaseTokenOnly) has to match the firebaseUid in
  // the body, so nobody can create a profile for someone else's account.
  const caller = req.firebaseUser;
  if (!caller || caller.uid !== firebaseUid) {
    const error = new Error('The Firebase ID token does not match the user being created');
    error.statusCode = 403;
    return next(error);
  }

  if (caller.email && String(email).trim().toLowerCase() !== String(caller.email).toLowerCase()) {
    const error = new Error('The email does not match the Firebase account');
    error.statusCode = 403;
    return next(error);
  }

  const userDetails = { firstName, lastName, email, firebaseUid, role: 'STUDENT' };
  try {
    const user = await prisma.user.create({
      data: userDetails,
      select: USER_PUBLIC_SELECT,
    });
    res.status(201).json(user);
  } catch (error) {
    // Unique violation: this email or Firebase account is already registered
    if (error.code === 'P2002') {
      const duplicate = new Error('A user with this email or Firebase account already exists');
      duplicate.statusCode = 409;
      return next(duplicate);
    }
    throw error;
  }
});

// Valid year-of-study values — kept in sync with the frontend select options
const VALID_YEARS_OF_STUDY = ['3rd year', 'honours', 'masters', 'phd'];

exports.updateUser = catchAsync(async (req, res, next) => {
  const firebaseUid = req.user.user_id;

  const user = await prisma.user.findUnique({ where: { firebaseUid } });
  if (!user) {
    const error = new Error('User not found. Please check if the user exists');
    error.statusCode = 404;
    return next(error);
  }

  // Only these fields are editable — department and email are read-only
  const { firstName, lastName, phoneNumber, yearOfStudy } = req.body;

  if (firstName !== undefined && !String(firstName).trim()) {
    const error = new Error('First name cannot be empty');
    error.statusCode = 400;
    return next(error);
  }
  if (lastName !== undefined && !String(lastName).trim()) {
    const error = new Error('Last name cannot be empty');
    error.statusCode = 400;
    return next(error);
  }
  if (yearOfStudy !== undefined && yearOfStudy !== null && !VALID_YEARS_OF_STUDY.includes(yearOfStudy)) {
    const error = new Error(`Year of study must be one of: ${VALID_YEARS_OF_STUDY.join(', ')}`);
    error.statusCode = 400;
    return next(error);
  }

  const data = {};
  if (firstName !== undefined) data.firstName = String(firstName).trim();
  if (lastName !== undefined) data.lastName = String(lastName).trim();
  if (phoneNumber !== undefined) data.phoneNumber = phoneNumber || null;
  if (yearOfStudy !== undefined) data.yearOfStudy = yearOfStudy || null;

  const updated = await prisma.user.update({
    where: { firebaseUid },
    data,
    select: USER_PUBLIC_SELECT,
  });
  res.status(200).json(updated);
});

exports.verifyRole = catchAsync(async (req, res, next) => {
  const userRole = req.user.role;
  const requestedRoles = String(req.query.roles || '')
    .split(',')
    .map((role) => role.trim())
    .filter(Boolean);

  const allowedRoles = requestedRoles.map(normaliseRole).filter(Boolean);

  if (allowedRoles.includes(userRole)) {
    return res.json({ role: userRole, allowed: true });
  }

  const error = new Error('You do not have permission to access this resource');
  error.statusCode = 403;
  return next(error);
});

exports.deleteUser = catchAsync(async (req, res, next) => {
  const firebaseUid = req.user.user_id;

  const user = await prisma.user.findUnique({ where: { firebaseUid } });
  if (!user) {
    const error = new Error('User not found. Please check if the user exists');
    error.statusCode = 404;
    return next(error);
  }

  if (!user.isActive) {
    const error = new Error('User already deleted');
    error.statusCode = 400;
    return next(error);
  }

  // This approach of awaiting one promise after the other leaves the data with inconsistant when the firebase operation fails
  const { getAuth } = getFirebaseAdmin(); // If this fails the db call will not happen
  await prisma.user.update({ where: { firebaseUid }, data: { isActive: false } });
  await getAuth().updateUser(firebaseUid, { disabled: true });

  res.status(204).end();
});
