const prisma = require('../prisma/client');
const catchAsync = require('../utils/catchAsync');
const getFirebaseAdmin = require('../firebase/admin');
const { normaliseRole } = require('../utils/roles');

exports.getAllUsers = catchAsync(async (req, res, next) => {
  const users = await prisma.user.findMany();
  res.json(users);
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

exports.getUserMe = catchAsync(async (req, res, next) => {
  const user = await prisma.user.findUnique({ where: { id: req.user.id } });

  if (!user) {
    const error = new Error('User not found');
    error.statusCode = 404;
    return next(error);
  }

  res.json(user);
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
