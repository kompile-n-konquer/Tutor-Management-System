const { PrismaClient } = require('@prisma/client');
const catchAsync = require('../utils/catchAsync');

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
