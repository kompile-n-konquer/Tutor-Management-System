const prisma = require('../prisma/client');
const catchAsync = require('../utils/catchAsync');
const getFirebaseAdmin = require('../firebase/admin');

exports.getAllUsers = catchAsync(async (req, res, next) => {
  const users = await prisma.user.findMany();
  res.json(users);
});

exports.getUser = catchAsync(async (req, res, next) => {
  const firebaseUid = req.params.firebaseUid;

  const user = await prisma.user.findUnique({ where: { firebaseUid } });
  if (!user) {
    const error = new Error('User not found. Please check if the user exists');
    error.statusCode = 404;
    return next(error);
  }

  res.status(200).json(user);
});

exports.createUser = catchAsync(async (req, res, next) => {
  const { firstName, lastName, email, firebaseUid } = req.body;

  if (!firstName || !lastName || !email || !firebaseUid) {
    const error = new Error('All fields are required. Please provide all fields');
    error.statusCode = 400;
    return next(error);
  }

  const userDetails = { firstName, lastName, email, firebaseUid, role: 'STUDENT' };
  const user = await prisma.user.create({ data: userDetails });

  res.status(201).json(user);
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

  const updated = await prisma.user.update({ where: { firebaseUid }, data });
  res.status(200).json(updated);
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
