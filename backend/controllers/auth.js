const { PrismaClient } = require('@prisma/client');
const catchAsync = require('../utils/catchAsync');
const getFirebaseAdmin = require('../firebase/admin');

const prisma = new PrismaClient();

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
