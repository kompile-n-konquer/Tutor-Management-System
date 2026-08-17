exports.notFoundErrorHandler = (req, res, next) => {
  const error = new Error(`Could not find ${req.originalUrl} on this server`);
  error.statusCode = 404;
  next(error); // Send the error to the error handling middleware
};

// This remove the need for all the res.json calls whenver there is an error
exports.globalErrorHandler = (error, req, res, next) => {
  const errorCode = error.statusCode || 500;
  const errorMessage = error.message || 'Something went wrong. Please try again later';

  if (errorCode === 500 || process.env.SERVER_ENV === 'development') {
    console.log(error);
  }

  res.status(errorCode).json({
    message: errorMessage,
    path: req.originalUrl,
    timestamp: new Date().toISOString(),
  });
};
