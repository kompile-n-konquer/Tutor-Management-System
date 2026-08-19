const { notFoundErrorHandler, globalErrorHandler } = require('../controllers/error');

describe('notFoundErrorHandler', () => {
  let req, res, next;

  beforeEach(() => {
    req = { originalUrl: '/api/nonexistent-route' };
    res = {};
    next = jest.fn();
  });

  test('creates an Error with 404 status code', () => {
    notFoundErrorHandler(req, res, next);

    expect(next).toHaveBeenCalledTimes(1);
    const error = next.mock.calls[0][0];
    expect(error).toBeInstanceOf(Error);
    expect(error.statusCode).toBe(404);
  });

  test('error message includes the requested URL', () => {
    notFoundErrorHandler(req, res, next);

    const error = next.mock.calls[0][0];
    expect(error.message).toContain('/api/nonexistent-route');
    expect(error.message).toContain('Could not find');
  });

  test('passes the error to the next middleware via next()', () => {
    notFoundErrorHandler(req, res, next);

    expect(next).toHaveBeenCalledWith(expect.any(Error));
  });
});

describe('globalErrorHandler', () => {
  let req, res;

  beforeEach(() => {
    req = { originalUrl: '/api/users' };
    res = {
      status: jest.fn().mockReturnThis(),
      json: jest.fn().mockReturnThis(),
    };
  });

  test('responds with the error statusCode when present', () => {
    const error = new Error('Bad request');
    error.statusCode = 400;

    globalErrorHandler(error, req, res, jest.fn());

    expect(res.status).toHaveBeenCalledWith(400);
  });

  test('responds with the error message when present', () => {
    const error = new Error('Email already exists');
    error.statusCode = 409;

    globalErrorHandler(error, req, res, jest.fn());

    expect(res.json).toHaveBeenCalledWith(
      expect.objectContaining({ message: 'Email already exists' }),
    );
  });

  test('defaults to 500 when no statusCode is set', () => {
    const error = new Error('Unexpected failure');

    globalErrorHandler(error, req, res, jest.fn());

    expect(res.status).toHaveBeenCalledWith(500);
  });

  test('defaults to generic message when error has no message', () => {
    const error = { statusCode: 503 };

    globalErrorHandler(error, req, res, jest.fn());

    expect(res.json).toHaveBeenCalledWith(
      expect.objectContaining({
        message: 'Something went wrong. Please try again later',
      }),
    );
  });

  test('includes path and timestamp in the response body', () => {
    const error = new Error('Not found');
    error.statusCode = 404;

    globalErrorHandler(error, req, res, jest.fn());

    const body = res.json.mock.calls[0][0];
    expect(body.path).toBe('/api/users');
    expect(body.timestamp).toBeDefined();
    // Verify timestamp is a valid ISO date string
    expect(new Date(body.timestamp).toISOString()).toBe(body.timestamp);
  });

  test('handles Prisma-style validation errors (400)', () => {
    const error = new Error('All fields are required. Please provide all fields');
    error.statusCode = 400;

    globalErrorHandler(error, req, res, jest.fn());

    expect(res.status).toHaveBeenCalledWith(400);
    expect(res.json).toHaveBeenCalledWith(
      expect.objectContaining({
        message: 'All fields are required. Please provide all fields',
      }),
    );
  });
});
