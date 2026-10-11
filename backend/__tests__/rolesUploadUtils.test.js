// Direct unit tests for the role guard and the multer upload configuration —
// both are wired into every route file, but their callback bodies only run
// when a request actually flows through them.
jest.mock('multer', () => {
  const multer = jest.fn((options) => Object.assign(jest.fn(), options));
  multer.diskStorage = jest.fn((options) => options);
  return multer;
});

const multer = require('multer');
const { normaliseRole, requireRole, ROLES } = require('../utils/roles');
const upload = require('../middleware/upload');

describe('roles', () => {
  test('normaliseRole trims and uppercases known roles only', () => {
    expect(normaliseRole(' lecturer ')).toBe('LECTURER');
    expect(normaliseRole('organiser')).toBe('ORGANISER');
    expect(normaliseRole('wizard')).toBeNull();
    expect(normaliseRole(undefined)).toBeNull();
    expect(ROLES.ADMIN).toBe('ADMIN');
  });

  test('requireRole lets allowed roles through and rejects everyone else', () => {
    // Unknown names are dropped from the allow-list instead of crashing
    const middleware = requireRole('organiser', 'not-a-role');

    const next = jest.fn();
    middleware({ user: { role: 'ORGANISER' } }, {}, next);
    expect(next).toHaveBeenCalledWith();

    const blocked = jest.fn();
    middleware({ user: { role: 'tutor' } }, {}, blocked);
    expect(blocked).toHaveBeenCalledTimes(1);
    expect(blocked.mock.calls[0][0]).toMatchObject({ statusCode: 403 });

    const anonymous = jest.fn();
    middleware({}, {}, anonymous);
    expect(anonymous).toHaveBeenCalledTimes(1);
    expect(anonymous.mock.calls[0][0]).toMatchObject({ statusCode: 403 });
  });
});

describe('upload middleware', () => {
  test('builds timestamped, space-free filenames', () => {
    const { filename } = multer.diskStorage.mock.calls[0][0];
    const cb = jest.fn();

    filename(null, { originalname: 'My Claim Form.pdf' }, cb);

    expect(cb).toHaveBeenCalledTimes(1);
    const [error, name] = cb.mock.calls[0];
    expect(error).toBeNull();
    expect(name).toMatch(/^My_Claim_Form-\d+\.pdf$/);
  });

  test('accepts only application/pdf uploads', () => {
    const { fileFilter } = multer.mock.calls[0][0];

    const accepted = jest.fn();
    fileFilter(null, { mimetype: 'application/pdf' }, accepted);
    expect(accepted).toHaveBeenCalledWith(null, true);

    const rejected = jest.fn();
    fileFilter(null, { mimetype: 'image/png' }, rejected);
    expect(rejected).toHaveBeenCalledTimes(1);
    expect(rejected.mock.calls[0][0]).toBeInstanceOf(Error);
    expect(rejected.mock.calls[0][0].message).toBe('Only PDF files are allowed');
  });

  test('exposes the timetable upload with its own size limit', () => {
    expect(upload.limits.fileSize).toBe(10 * 1024 * 1024);
    expect(upload.timetableUpload.limits.fileSize).toBe(500 * 1024);
    // Both uploaders share the same PDF-only filter
    expect(multer.mock.calls[1][0].fileFilter).toBe(multer.mock.calls[0][0].fileFilter);
  });
});
