// Catch all async errors. This removes the need for try-catch blocks
// All controller functions should be wrapped with this functions
module.exports = catchAsync = (func) => {
  // Controller variables should be functions and not the result of calling functions. Hence a function is returned here
  return (req, res, next) => {
    // Async functions return a promise. So all errors are caught using the catch() method
    // The catch() method takes a function with an error parameter. This function then passes the error to the global handling middleware
    func(req, res, next).catch((error) => next(error));
  };
};
