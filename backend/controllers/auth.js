const { PrismaClient } = require('@prisma/client');
const catchAsync = require('../utils/catchAsync');

const prisma = new PrismaClient();

exports.getAllUsers = catchAsync(async (req, res, next) => {
  const users = await prisma.user.findMany();
  res.json(users);
});

exports.createUser = catchAsync(async (req, res, next) => {
  if (!req.body || !req.body.firstName || !req.body.lastName || !req.body.email) {
    const error = new Error('All fields are required. Please provide all fields');
    error.statusCode = 400;
    return next(error);
  }

  const userDetails = {
    firstName: req.body.firstName,
    lastName: req.body.lastName,
    email: req.body.email,
    role: 'STUDENT',
  };

  const user = await prisma.user.create({ data: userDetails });

  res.status(201).json(user);
});
