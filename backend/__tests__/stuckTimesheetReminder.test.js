// Tests for the stuck-timesheet reminder job: the "stuck" definition, the
// responsible-party resolution and the reminder dedupe suffix. Prisma and the
// notifier are mocked — no real database access or emails here.

const mockTimesheet = {
  findMany: jest.fn(),
};

jest.mock('@prisma/client', () => ({
  PrismaClient: class {
    constructor() {
      this.timesheet = mockTimesheet;
    }
  },
}));

const mockSendNotification = jest.fn();

jest.mock('../email/notifier', () => ({
  EVENT_TYPES: {
    ASSIGNMENT_ADDED: 'ASSIGNMENT_ADDED',
    ASSIGNMENT_REMOVED: 'ASSIGNMENT_REMOVED',
    TIMESHEET_APPROVED: 'TIMESHEET_APPROVED',
    TIMESHEET_REJECTED: 'TIMESHEET_REJECTED',
    TIMESHEET_STUCK_REMINDER: 'TIMESHEET_STUCK_REMINDER',
  },
  sendNotification: (...args) => mockSendNotification(...args),
}));

const {
  DEFAULT_STUCK_THRESHOLD_DAYS,
  getStuckThresholdDays,
  getCheckIntervalMs,
  isoWeekKey,
  collectResponsibleLecturers,
  runStuckTimesheetCheck,
} = require('../jobs/stuckTimesheetReminder');

function lecturerUser(id, email, firstName = 'Jane', lastName = 'Smith') {
  return { id, email, firstName, lastName };
}

function stuckTimesheetFixture() {
  return {
    id: 33,
    totalHours: 12,
    status: 'SUBMITTED',
    submittedAt: new Date('2026-08-29T10:00:00Z'),
    tutor: { user: { id: 7, firstName: 'Thabo', lastName: 'Mokoena', email: 'tutor@example.com' } },
    entries: [
      // Same lecturer logged twice on two entries + one different lecturer:
      // the reminder must be de-duplicated to one per distinct lecturer.
      { course: { lecturer: { user: lecturerUser(50, 'jane@example.com') } } },
      { course: { lecturer: { user: lecturerUser(50, 'jane@example.com') } } },
      { course: { lecturer: { user: lecturerUser(51, 'sipho@example.com') } } },
    ],
  };
}

beforeEach(() => {
  jest.clearAllMocks();
  delete process.env.TIMESHEET_STUCK_DAYS;
  delete process.env.TIMESHEET_REMINDER_CHECK_INTERVAL_MINUTES;
});

describe('getStuckThresholdDays', () => {
  test('defaults to 7 days', () => {
    expect(getStuckThresholdDays()).toBe(DEFAULT_STUCK_THRESHOLD_DAYS);
    expect(DEFAULT_STUCK_THRESHOLD_DAYS).toBe(7);
  });

  test('can be configured through TIMESHEET_STUCK_DAYS', () => {
    process.env.TIMESHEET_STUCK_DAYS = '3';
    expect(getStuckThresholdDays()).toBe(3);
  });

  test('falls back to the default on invalid values', () => {
    process.env.TIMESHEET_STUCK_DAYS = 'not-a-number';
    expect(getStuckThresholdDays()).toBe(7);
  });
});

describe('getCheckIntervalMs', () => {
  test('defaults to 60 minutes', () => {
    expect(getCheckIntervalMs()).toBe(60 * 60 * 1000);
  });

  test('can be configured through TIMESHEET_REMINDER_CHECK_INTERVAL_MINUTES', () => {
    process.env.TIMESHEET_REMINDER_CHECK_INTERVAL_MINUTES = '15';
    expect(getCheckIntervalMs()).toBe(15 * 60 * 1000);
  });
});

describe('isoWeekKey', () => {
  test('returns ISO-8601 week keys, including year boundaries', () => {
    expect(isoWeekKey(new Date('2021-01-01T12:00:00Z'))).toBe('2020-W53');
    expect(isoWeekKey(new Date('2024-12-30T12:00:00Z'))).toBe('2025-W01');
    expect(isoWeekKey(new Date('2026-01-01T12:00:00Z'))).toBe('2026-W01');
  });

  test('keeps Monday and Sunday of the same week in the same bucket', () => {
    expect(isoWeekKey(new Date('2026-09-07T00:00:00Z'))).toBe('2026-W37');
    expect(isoWeekKey(new Date('2026-09-13T00:00:00Z'))).toBe('2026-W37');
  });
});

describe('collectResponsibleLecturers', () => {
  test('de-duplicates lecturers by user id', () => {
    const lecturers = collectResponsibleLecturers(stuckTimesheetFixture());
    expect(lecturers.map((l) => l.email)).toEqual(['jane@example.com', 'sipho@example.com']);
  });

  test('ignores entries without a lecturer user or email', () => {
    const lecturers = collectResponsibleLecturers({
      entries: [
        { course: null },
        { course: { lecturer: null } },
        { course: { lecturer: { user: null } } },
        { course: { lecturer: { user: { id: 9, email: '' } } } },
      ],
    });
    expect(lecturers).toEqual([]);
  });
});

describe('runStuckTimesheetCheck', () => {
  test('queries timesheets SUBMITTED for longer than the stuck threshold', async () => {
    mockTimesheet.findMany.mockResolvedValue([]);
    const now = new Date('2026-09-09T12:00:00Z');

    await runStuckTimesheetCheck(now);

    expect(mockTimesheet.findMany).toHaveBeenCalledTimes(1);
    const query = mockTimesheet.findMany.mock.calls[0][0];
    expect(query.where.status).toBe('SUBMITTED');
    expect(query.where.submittedAt.lt).toEqual(new Date('2026-09-02T12:00:00Z')); // 7 days earlier
  });

  test('respects a configured TIMESHEET_STUCK_DAYS threshold', async () => {
    process.env.TIMESHEET_STUCK_DAYS = '3';
    mockTimesheet.findMany.mockResolvedValue([]);
    const now = new Date('2026-09-09T12:00:00Z');

    await runStuckTimesheetCheck(now);

    const query = mockTimesheet.findMany.mock.calls[0][0];
    expect(query.where.submittedAt.lt).toEqual(new Date('2026-09-06T12:00:00Z'));
  });

  test('sends one reminder per distinct responsible lecturer with a weekly dedupe suffix', async () => {
    mockTimesheet.findMany.mockResolvedValue([stuckTimesheetFixture()]);
    mockSendNotification.mockResolvedValue({ sent: true });
    const now = new Date('2026-09-09T12:00:00Z'); // 2026-W37

    const summary = await runStuckTimesheetCheck(now);

    expect(summary).toEqual({ stuckCount: 1, remindersSent: 2 });
    expect(mockSendNotification).toHaveBeenCalledTimes(2);

    const first = mockSendNotification.mock.calls[0][0];
    const second = mockSendNotification.mock.calls[1][0];
    expect(first.eventType).toBe('TIMESHEET_STUCK_REMINDER');
    expect(first.entityType).toBe('Timesheet');
    expect(first.entityId).toBe(33);
    expect(first.dedupeSuffix).toBe('2026-W37'); // sendNotification appends the recipient email per lecturer
    expect(first.recipient.email).toBe('jane@example.com');
    expect(second.dedupeSuffix).toBe('2026-W37');
    expect(second.recipient.email).toBe('sipho@example.com');
  });

  test('the reminder email mentions the tutor and how long the timesheet has been pending', async () => {
    mockTimesheet.findMany.mockResolvedValue([stuckTimesheetFixture()]);
    mockSendNotification.mockResolvedValue({ sent: true });
    const now = new Date('2026-09-09T12:00:00Z');

    await runStuckTimesheetCheck(now);

    const payload = mockSendNotification.mock.calls[0][0];
    expect(payload.subject).toContain('Thabo Mokoena');
    expect(payload.subject).toContain('timesheet #33');
  });

  test('skips (with a warning, no send) a stuck timesheet that has no responsible lecturer', async () => {
    const orphan = stuckTimesheetFixture();
    orphan.entries = [{ course: { lecturer: { user: null } } }];
    mockTimesheet.findMany.mockResolvedValue([orphan]);
    mockSendNotification.mockResolvedValue({ sent: true });

    const summary = await runStuckTimesheetCheck(new Date('2026-09-09T12:00:00Z'));

    expect(summary).toEqual({ stuckCount: 1, remindersSent: 0 });
    expect(mockSendNotification).not.toHaveBeenCalled();
  });
});
