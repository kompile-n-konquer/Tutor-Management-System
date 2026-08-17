const catchAsync = require('../utils/catchAsync');

describe('catchAsync — async error wrapper for Express controllers', () => {
  let req, res, next;

  beforeEach(() => {
    req = { body: {} };
    res = { json: jest.fn(), status: jest.fn().mockReturnThis() };
    next = jest.fn();
  });

  test('returns a function (middleware wrapper)', () => {
    const wrapped = catchAsync(async () => {});
    expect(typeof wrapped).toBe('function');
  });

  test('calls the original async function with req, res, next', async () => {
    const handler = jest.fn().mockResolvedValue(undefined);
    const wrapped = catchAsync(handler);

    await wrapped(req, res, next);

    expect(handler).toHaveBeenCalledWith(req, res, next);
  });

  test('forwards resolved data — successful controller completes without calling next(error)', async () => {
    const handler = jest.fn().mockImplementation(async (_req, res) => {
      res.status(201).json({ id: 1, firstName: 'Kgaogelo' });
    });
    const wrapped = catchAsync(handler);

    await wrapped(req, res, next);

    expect(res.status).toHaveBeenCalledWith(201);
    expect(res.json).toHaveBeenCalledWith({ id: 1, firstName: 'Kgaogelo' });
    expect(next).not.toHaveBeenCalled();
  });

  test('passes rejected errors to next() for global error handler', async () => {
    const prismaError = new Error('Unique constraint failed on the fields: (`email`)');
    prismaError.code = 'P2002';

    const handler = jest.fn().mockRejectedValue(prismaError);
    const wrapped = catchAsync(handler);

    await wrapped(req, res, next);

    expect(next).toHaveBeenCalledWith(prismaError);
    expect(next).toHaveBeenCalledTimes(1);
  });

  test('passes network/database errors to next()', async () => {
    const dbError = new Error('ECONNREFUSED: connection to database refused');
    const handler = jest.fn().mockRejectedValue(dbError);
    const wrapped = catchAsync(handler);

    await wrapped(req, res, next);

    expect(next).toHaveBeenCalledWith(dbError);
  });

  test('does not swallow errors — next() is called even if error is a string', async () => {
    const handler = jest.fn().mockRejectedValue('string error');
    const wrapped = catchAsync(handler);

    await wrapped(req, res, next);

    expect(next).toHaveBeenCalledWith('string error');
  });

  test('handles controller that calls next() directly for custom errors', async () => {
    const handler = jest.fn().mockImplementation(async (_req, _res, next) => {
      const error = new Error('Missing required field');
      error.statusCode = 400;
      next(error);
    });
    const wrapped = catchAsync(handler);

    await wrapped(req, res, next);

    expect(next).toHaveBeenCalledWith(
      expect.objectContaining({
        message: 'Missing required field',
        statusCode: 400,
      }),
    );
  });
});
