// Full-suite coverage for the organiser settings controller: the settings
// read-back, the policy validations (hours cap, claim window, budget, hourly
// rates) and the PDF-template lifecycle (upload, download, delete).
jest.mock('../prisma/client', () => ({
  user: { findUnique: jest.fn() },
  systemSetting: {
    findMany: jest.fn(),
    findUnique: jest.fn(),
    upsert: jest.fn(),
    deleteMany: jest.fn(),
    delete: jest.fn(),
  },
}));

// The PDF-template endpoints probe the uploads directory on disk. Mock the fs
// calls so tests never read or unlink real files.
jest.mock('fs', () => ({ existsSync: jest.fn(), unlinkSync: jest.fn() }));

const prisma = require('../prisma/client');
const fs = require('fs');
const {
  getSettings,
  updateTutorMonthlyHours,
  updateTutorEventClaimMonths,
  updateMonthlyBudget,
  updateHourlyRates,
  uploadPdfTemplate,
  getPdfTemplate,
  deletePdfTemplate,
} = require('../controllers/settings');

// catchAsync does not `return` the inner promise — flushMicrotasks waits
// for the background async work to settle before assertions run.
function flushMicrotasks() {
  return new Promise((resolve) => setImmediate(resolve));
}

// Asserts next() received a single http-style error with the expected code + message.
const expectHttpError = (next, statusCode, message) => {
  expect(next).toHaveBeenCalledTimes(1);
  const error = next.mock.calls[0][0];
  expect(error.statusCode).toBe(statusCode);
  expect(error.message).toBe(message);
};

function mockReq(body = {}) {
  return { user: { user_id: 'uid-123' }, body };
}

function mockRes() {
  const res = {};
  res.status = jest.fn().mockReturnValue(res);
  res.json = jest.fn().mockReturnValue(res);
  res.download = jest.fn().mockReturnValue(res);
  res.end = jest.fn().mockReturnValue(res);
  return res;
}

beforeEach(() => {
  jest.clearAllMocks();
  prisma.user.findUnique.mockResolvedValue({ id: 5, role: 'ORGANISER' });
  fs.existsSync.mockReturnValue(false);
});

describe('getSettings', () => {
  test('returns 404 when the caller has no profile yet', async () => {
    prisma.user.findUnique.mockResolvedValue(null);

    const next = jest.fn();

    await getSettings(mockReq(), mockRes(), next);
    await flushMicrotasks();

    expectHttpError(next, 404, 'User not found. Please check if the user exists');
    expect(prisma.systemSetting.findMany).not.toHaveBeenCalled();
  });

  test('serialises stored settings with nulls for unset keys', async () => {
    prisma.systemSetting.findMany.mockResolvedValue([
      { key: 'TUTOR_MONTHLY_CLAIMABLE_HOURS', value: '10' },
      { key: 'TUTOR_EVENT_CLAIM_MONTHS', value: '6' },
      { key: 'HOURLY_RATE_3RD_YEAR', value: '250.75' },
      { key: 'HOURLY_RATE_PHD', value: '400' },
      { key: 'PDF_TEMPLATE_FILENAME', value: 'claim-form.pdf' },
      { key: 'MONTHLY_BUDGET', value: '50000' },
    ]);

    const res = mockRes();
    const next = jest.fn();

    await getSettings(mockReq(), res, next);
    await flushMicrotasks();

    expect(res.status).toHaveBeenCalledWith(200);
    expect(res.json).toHaveBeenCalledWith({
      tutorMonthlyClaimableHours: 10,
      tutorEventClaimMonths: 6,
      hourlyRates: { '3rd year': 250.75, honours: null, masters: null, phd: 400 },
      pdfTemplateFilename: 'claim-form.pdf',
      monthlyBudget: 50000,
    });
    expect(next).not.toHaveBeenCalled();
  });

  test('returns nulls everywhere when nothing has been stored', async () => {
    prisma.systemSetting.findMany.mockResolvedValue([]);

    const res = mockRes();

    await getSettings(mockReq(), res, jest.fn());
    await flushMicrotasks();

    expect(res.json).toHaveBeenCalledWith({
      tutorMonthlyClaimableHours: null,
      tutorEventClaimMonths: null,
      hourlyRates: { '3rd year': null, honours: null, masters: null, phd: null },
      pdfTemplateFilename: null,
      monthlyBudget: null,
    });
  });
});

describe('updateTutorMonthlyHours', () => {
  test('guards the profile and rejects non-staff callers', async () => {
    prisma.user.findUnique.mockResolvedValue(null);
    let next = jest.fn();
    await updateTutorMonthlyHours(mockReq({ tutorMonthlyClaimableHours: 10 }), mockRes(), next);
    await flushMicrotasks();
    expectHttpError(next, 404, 'User not found. Please check if the user exists');

    prisma.user.findUnique.mockResolvedValue({ id: 9, role: 'STUDENT' });
    next = jest.fn();
    await updateTutorMonthlyHours(mockReq({ tutorMonthlyClaimableHours: 10 }), mockRes(), next);
    await flushMicrotasks();
    expectHttpError(next, 403, 'Only an organiser or admin can set the tutor monthly claimable hours');
    expect(prisma.systemSetting.upsert).not.toHaveBeenCalled();
  });

  test('rejects missing, non-numeric, fractional and out-of-range hours', async () => {
    for (const body of [
      {},
      { tutorMonthlyClaimableHours: 'abc' },
      { tutorMonthlyClaimableHours: 0 },
      { tutorMonthlyClaimableHours: 2.5 },
      { tutorMonthlyClaimableHours: 745 },
    ]) {
      const next = jest.fn();
      await updateTutorMonthlyHours(mockReq(body), mockRes(), next);
      await flushMicrotasks();
      expectHttpError(
        next,
        400,
        'tutorMonthlyClaimableHours must be a whole number between 1 and 744',
      );
    }
    expect(prisma.systemSetting.upsert).not.toHaveBeenCalled();
  });

  test('stores a valid cap as a stringified number', async () => {
    const res = mockRes();
    const next = jest.fn();

    await updateTutorMonthlyHours(mockReq({ tutorMonthlyClaimableHours: '12' }), res, next);
    await flushMicrotasks();

    expect(prisma.systemSetting.upsert).toHaveBeenCalledWith({
      where: { key: 'TUTOR_MONTHLY_CLAIMABLE_HOURS' },
      update: { value: '12' },
      create: { key: 'TUTOR_MONTHLY_CLAIMABLE_HOURS', value: '12' },
    });
    expect(res.status).toHaveBeenCalledWith(200);
    expect(res.json).toHaveBeenCalledWith({ tutorMonthlyClaimableHours: 12 });
  });
});

describe('updateTutorEventClaimMonths', () => {
  test('rejects non-staff callers', async () => {
    prisma.user.findUnique.mockResolvedValue({ id: 9, role: 'TUTOR' });

    const next = jest.fn();

    await updateTutorEventClaimMonths(mockReq({ tutorEventClaimMonths: 3 }), mockRes(), next);
    await flushMicrotasks();

    expectHttpError(next, 403, 'Only an organiser or admin can set the tutor event claim window');
  });

  test('rejects invalid windows and stores valid ones', async () => {
    for (const body of [{}, { tutorEventClaimMonths: 0 }, { tutorEventClaimMonths: 25 }]) {
      const next = jest.fn();
      await updateTutorEventClaimMonths(mockReq(body), mockRes(), next);
      await flushMicrotasks();
      expectHttpError(next, 400, 'tutorEventClaimMonths must be a whole number between 1 and 24');
    }

    const res = mockRes();
    const next = jest.fn();
    await updateTutorEventClaimMonths(mockReq({ tutorEventClaimMonths: 3 }), res, next);
    await flushMicrotasks();

    expect(prisma.systemSetting.upsert).toHaveBeenCalledWith({
      where: { key: 'TUTOR_EVENT_CLAIM_MONTHS' },
      update: { value: '3' },
      create: { key: 'TUTOR_EVENT_CLAIM_MONTHS', value: '3' },
    });
    expect(res.json).toHaveBeenCalledWith({ tutorEventClaimMonths: 3 });
  });
});

describe('updateMonthlyBudget', () => {
  test('guards the profile and rejects non-staff callers', async () => {
    prisma.user.findUnique.mockResolvedValue(null);
    let next = jest.fn();
    await updateMonthlyBudget(mockReq({ monthlyBudget: 1000 }), mockRes(), next);
    await flushMicrotasks();
    expectHttpError(next, 404, 'User not found. Please check if the user exists');

    prisma.user.findUnique.mockResolvedValue({ id: 9, role: 'LECTURER' });
    next = jest.fn();
    await updateMonthlyBudget(mockReq({ monthlyBudget: 1000 }), mockRes(), next);
    await flushMicrotasks();
    expectHttpError(next, 403, 'Only an organiser or admin can set the monthly budget');
    expect(prisma.systemSetting.upsert).not.toHaveBeenCalled();
  });

  test('rejects empty, negative and oversized budgets', async () => {
    for (const body of [{}, { monthlyBudget: '' }, { monthlyBudget: -1 }, { monthlyBudget: 100000001 }]) {
      const next = jest.fn();
      await updateMonthlyBudget(mockReq(body), mockRes(), next);
      await flushMicrotasks();
      expectHttpError(next, 400, 'monthlyBudget must be a number between 0 and 100000000');
    }
    expect(prisma.systemSetting.upsert).not.toHaveBeenCalled();
  });

  test('accepts zero and stores the budget for an admin too', async () => {
    prisma.user.findUnique.mockResolvedValue({ id: 9, role: 'ADMIN' });

    const res = mockRes();
    const next = jest.fn();

    await updateMonthlyBudget(mockReq({ monthlyBudget: 0 }), res, next);
    await flushMicrotasks();

    expect(prisma.systemSetting.upsert).toHaveBeenCalledWith({
      where: { key: 'MONTHLY_BUDGET' },
      update: { value: '0' },
      create: { key: 'MONTHLY_BUDGET', value: '0' },
    });
    expect(res.json).toHaveBeenCalledWith({ monthlyBudget: 0 });
  });
});

describe('updateHourlyRates', () => {
  test('rejects non-object payloads, unknown years and bad rates', async () => {
    let next = jest.fn();
    await updateHourlyRates(mockReq({}), mockRes(), next);
    await flushMicrotasks();
    expectHttpError(next, 400, 'hourlyRates must be an object with year-of-study keys');

    next = jest.fn();
    await updateHourlyRates(mockReq({ hourlyRates: { '1st year': 100 } }), mockRes(), next);
    await flushMicrotasks();
    expectHttpError(next, 400, 'Unknown year of study: 1st year. Valid values: 3rd year, honours, masters, phd');

    for (const hourlyRates of [{ honours: 'abc' }, { masters: 5001 }]) {
      next = jest.fn();
      await updateHourlyRates(mockReq({ hourlyRates }), mockRes(), next);
      await flushMicrotasks();
      expectHttpError(
        next,
        400,
        `Rate for "${Object.keys(hourlyRates)[0]}" must be a number between 0 and 5000`,
      );
    }
    expect(prisma.systemSetting.upsert).not.toHaveBeenCalled();
  });

  test('upserts provided rates, clears null ones and returns the stored map', async () => {
    // The read-back query resolves per key: only the 3rd-year rate is stored
    prisma.systemSetting.findUnique.mockImplementation(({ where: { key } }) =>
      Promise.resolve(key === 'HOURLY_RATE_3RD_YEAR' ? { value: '250' } : null),
    );

    const res = mockRes();
    const next = jest.fn();

    await updateHourlyRates(mockReq({ hourlyRates: { phd: '450', honours: null } }), res, next);
    await flushMicrotasks();

    expect(prisma.systemSetting.upsert).toHaveBeenCalledWith({
      where: { key: 'HOURLY_RATE_PHD' },
      update: { value: '450' },
      create: { key: 'HOURLY_RATE_PHD', value: '450' },
    });
    // null clears the rate instead of storing "null"
    expect(prisma.systemSetting.deleteMany).toHaveBeenCalledWith({
      where: { key: 'HOURLY_RATE_HONOURS' },
    });
    expect(res.json).toHaveBeenCalledWith({
      hourlyRates: { '3rd year': 250, honours: null, masters: null, phd: null },
    });
    expect(next).not.toHaveBeenCalled();
  });
});

describe('uploadPdfTemplate', () => {
  test('guards the profile, role and the missing file', async () => {
    prisma.user.findUnique.mockResolvedValue(null);
    let next = jest.fn();
    await uploadPdfTemplate(mockReq(), mockRes(), next);
    await flushMicrotasks();
    expectHttpError(next, 404, 'User not found. Please check if the user exists');

    prisma.user.findUnique.mockResolvedValue({ id: 9, role: 'TUTOR' });
    next = jest.fn();
    await uploadPdfTemplate(mockReq(), mockRes(), next);
    await flushMicrotasks();
    expectHttpError(next, 403, 'Only an organiser or admin can upload a PDF template');

    prisma.user.findUnique.mockResolvedValue({ id: 5, role: 'ORGANISER' });
    next = jest.fn();
    await uploadPdfTemplate(mockReq(), mockRes(), next);
    await flushMicrotasks();
    expectHttpError(next, 400, 'No PDF file was provided');
  });

  test('stores the new filename and deletes the previous template from disk', async () => {
    prisma.systemSetting.findUnique.mockResolvedValue({ key: 'PDF_TEMPLATE_FILENAME', value: 'old.pdf' });
    fs.existsSync.mockReturnValue(true);

    const res = mockRes();
    const next = jest.fn();
    const req = { ...mockReq(), file: { filename: 'claim-form-123.pdf' } };

    await uploadPdfTemplate(req, res, next);
    await flushMicrotasks();

    expect(fs.unlinkSync).toHaveBeenCalledWith(expect.stringContaining('old.pdf'));
    expect(prisma.systemSetting.upsert).toHaveBeenCalledWith({
      where: { key: 'PDF_TEMPLATE_FILENAME' },
      update: { value: 'claim-form-123.pdf' },
      create: { key: 'PDF_TEMPLATE_FILENAME', value: 'claim-form-123.pdf' },
    });
    expect(res.json).toHaveBeenCalledWith({ pdfTemplateFilename: 'claim-form-123.pdf' });
  });

  test('stores the first template without touching disk', async () => {
    prisma.systemSetting.findUnique.mockResolvedValue(null);

    const res = mockRes();
    const next = jest.fn();
    const req = { ...mockReq(), file: { filename: 'first.pdf' } };

    await uploadPdfTemplate(req, res, next);
    await flushMicrotasks();

    expect(fs.unlinkSync).not.toHaveBeenCalled();
    expect(res.json).toHaveBeenCalledWith({ pdfTemplateFilename: 'first.pdf' });
  });
});

describe('getPdfTemplate', () => {
  test('returns 404 when nothing is stored, the file is gone, or downloads it otherwise', async () => {
    prisma.systemSetting.findUnique.mockResolvedValue(null);
    let next = jest.fn();
    await getPdfTemplate(mockReq(), mockRes(), next);
    await flushMicrotasks();
    expectHttpError(next, 404, 'No PDF template has been uploaded');

    prisma.systemSetting.findUnique.mockResolvedValue({ key: 'PDF_TEMPLATE_FILENAME', value: 'gone.pdf' });
    fs.existsSync.mockReturnValue(false);
    next = jest.fn();
    await getPdfTemplate(mockReq(), mockRes(), next);
    await flushMicrotasks();
    expectHttpError(next, 404, 'The PDF template file was not found on disk');

    fs.existsSync.mockReturnValue(true);
    const res = mockRes();
    next = jest.fn();
    await getPdfTemplate(mockReq(), res, next);
    await flushMicrotasks();
    expect(res.download).toHaveBeenCalledWith(expect.stringContaining('gone.pdf'), 'gone.pdf');
    expect(next).not.toHaveBeenCalled();
  });
});

describe('deletePdfTemplate', () => {
  test('guards the profile and role', async () => {
    prisma.user.findUnique.mockResolvedValue(null);
    let next = jest.fn();
    await deletePdfTemplate(mockReq(), mockRes(), next);
    await flushMicrotasks();
    expectHttpError(next, 404, 'User not found. Please check if the user exists');

    prisma.user.findUnique.mockResolvedValue({ id: 9, role: 'STUDENT' });
    next = jest.fn();
    await deletePdfTemplate(mockReq(), mockRes(), next);
    await flushMicrotasks();
    expectHttpError(next, 403, 'Only an organiser or admin can remove a PDF template');
  });

  test('removes the stored template file and setting', async () => {
    prisma.systemSetting.findUnique.mockResolvedValue({ key: 'PDF_TEMPLATE_FILENAME', value: 'form.pdf' });
    fs.existsSync.mockReturnValue(true);

    const res = mockRes();
    const next = jest.fn();

    await deletePdfTemplate(mockReq(), res, next);
    await flushMicrotasks();

    expect(fs.unlinkSync).toHaveBeenCalledWith(expect.stringContaining('form.pdf'));
    expect(prisma.systemSetting.delete).toHaveBeenCalledWith({ where: { key: 'PDF_TEMPLATE_FILENAME' } });
    expect(res.json).toHaveBeenCalledWith({ pdfTemplateFilename: null });
  });

  test('is a no-op when no template is stored', async () => {
    prisma.systemSetting.findUnique.mockResolvedValue(null);

    const res = mockRes();

    await deletePdfTemplate(mockReq(), res, jest.fn());
    await flushMicrotasks();

    expect(prisma.systemSetting.delete).not.toHaveBeenCalled();
    expect(fs.unlinkSync).not.toHaveBeenCalled();
    expect(res.json).toHaveBeenCalledWith({ pdfTemplateFilename: null });
  });
});
