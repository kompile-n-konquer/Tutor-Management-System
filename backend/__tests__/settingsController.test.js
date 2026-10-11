jest.mock('../prisma/client', () => ({
  user: { findUnique: jest.fn() },
  systemSetting: { findMany: jest.fn(), findUnique: jest.fn(), upsert: jest.fn(), delete: jest.fn(), deleteMany: jest.fn() },
}));

const prisma = require('../prisma/client');
const { getSettings, updateMonthlyBudget } = require('../controllers/settings');

// catchAsync does not `return` the inner promise — flushMicrotasks waits
// for the background async work to settle before assertions run.
function flushMicrotasks() {
  return new Promise((resolve) => setImmediate(resolve));
}

function mockReq(body = {}) {
  return { user: { user_id: 'uid-123' }, body };
}

function mockRes() {
  const res = {};
  res.status = jest.fn().mockReturnValue(res);
  res.json = jest.fn().mockReturnValue(res);
  res.end = jest.fn().mockReturnValue(res);
  return res;
}

beforeEach(() => {
  jest.clearAllMocks();
  // Most tests exercise the organiser path; role and user tests override this.
  prisma.user.findUnique.mockResolvedValue({ id: 1, role: 'ORGANISER' });
  // No settings stored by default — every value reads back as null.
  prisma.systemSetting.findMany.mockResolvedValue([]);
});

describe('getSettings', () => {
  test('returns the monthly budget alongside the other settings', async () => {
    prisma.systemSetting.findMany.mockResolvedValue([
      { key: 'TUTOR_MONTHLY_CLAIMABLE_HOURS', value: '60' },
      { key: 'MONTHLY_BUDGET', value: '150000' },
      { key: 'HOURLY_RATE_3RD_YEAR', value: '150' },
    ]);

    const res = mockRes();
    const next = jest.fn();

    await getSettings(mockReq(), res, next);
    await flushMicrotasks();

    expect(res.status).toHaveBeenCalledWith(200);
    expect(next).not.toHaveBeenCalled();

    const body = res.json.mock.calls[0][0];
    expect(body.monthlyBudget).toBe(150000);
    expect(body.tutorMonthlyClaimableHours).toBe(60);
    expect(body.hourlyRates).toEqual({
      '3rd year': 150,
      honours: null,
      masters: null,
      phd: null,
    });
  });

  test('reports a null monthly budget while the organiser has not set one', async () => {
    const res = mockRes();
    const next = jest.fn();

    await getSettings(mockReq(), res, next);
    await flushMicrotasks();

    const body = res.json.mock.calls[0][0];
    expect(body.monthlyBudget).toBeNull();
  });

  test('returns 404 when the requesting user does not exist', async () => {
    prisma.user.findUnique.mockResolvedValue(null);

    const res = mockRes();
    const next = jest.fn();

    await getSettings(mockReq(), res, next);
    await flushMicrotasks();

    expect(next).toHaveBeenCalledWith(
      expect.objectContaining({ statusCode: 404 }),
    );
    expect(res.json).not.toHaveBeenCalled();
  });
});

describe('updateMonthlyBudget', () => {
  test('upserts the budget for an organiser and echoes the parsed value', async () => {
    const res = mockRes();
    const next = jest.fn();

    await updateMonthlyBudget(mockReq({ monthlyBudget: '150000' }), res, next);
    await flushMicrotasks();

    expect(prisma.systemSetting.upsert).toHaveBeenCalledWith({
      where: { key: 'MONTHLY_BUDGET' },
      update: { value: '150000' },
      create: { key: 'MONTHLY_BUDGET', value: '150000' },
    });
    expect(res.status).toHaveBeenCalledWith(200);
    expect(res.json).toHaveBeenCalledWith({ monthlyBudget: 150000 });
    expect(next).not.toHaveBeenCalled();
  });

  test('an admin may set the budget too', async () => {
    prisma.user.findUnique.mockResolvedValue({ id: 9, role: 'ADMIN' });

    const res = mockRes();
    const next = jest.fn();

    await updateMonthlyBudget(mockReq({ monthlyBudget: 0 }), res, next);
    await flushMicrotasks();

    expect(prisma.systemSetting.upsert).toHaveBeenCalledTimes(1);
    expect(res.json).toHaveBeenCalledWith({ monthlyBudget: 0 });
  });

  test.each(['TUTOR', 'LECTURER', 'STUDENT'])(
    'rejects a %s with 403 without touching the settings table',
    async (role) => {
      prisma.user.findUnique.mockResolvedValue({ id: 5, role });

      const res = mockRes();
      const next = jest.fn();

      await updateMonthlyBudget(mockReq({ monthlyBudget: 100 }), res, next);
      await flushMicrotasks();

      expect(next).toHaveBeenCalledWith(
        expect.objectContaining({ statusCode: 403 }),
      );
      expect(prisma.systemSetting.upsert).not.toHaveBeenCalled();
      expect(res.json).not.toHaveBeenCalled();
    },
  );

  test.each([
    ['a negative amount', -1],
    ['a non-numeric string', 'not-a-number'],
    ['a value above the sanity bound', 100000001],
    ['an empty string', ''],
  ])('rejects %s with 400', async (_label, monthlyBudget) => {
    const res = mockRes();
    const next = jest.fn();

    await updateMonthlyBudget(mockReq({ monthlyBudget }), res, next);
    await flushMicrotasks();

    expect(next).toHaveBeenCalledWith(
      expect.objectContaining({ statusCode: 400 }),
    );
    expect(prisma.systemSetting.upsert).not.toHaveBeenCalled();
  });

  test('rejects a missing body value with 400', async () => {
    const res = mockRes();
    const next = jest.fn();

    await updateMonthlyBudget(mockReq(), res, next);
    await flushMicrotasks();

    expect(next).toHaveBeenCalledWith(
      expect.objectContaining({ statusCode: 400 }),
    );
  });

  test('returns 404 when the requesting user does not exist', async () => {
    prisma.user.findUnique.mockResolvedValue(null);

    const res = mockRes();
    const next = jest.fn();

    await updateMonthlyBudget(mockReq({ monthlyBudget: 100 }), res, next);
    await flushMicrotasks();

    expect(next).toHaveBeenCalledWith(
      expect.objectContaining({ statusCode: 404 }),
    );
    expect(prisma.systemSetting.upsert).not.toHaveBeenCalled();
  });
});
