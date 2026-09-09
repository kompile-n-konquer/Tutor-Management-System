// Tests for the email notification orchestrator: duplicate prevention,
// dispatch logging and graceful failure handling. The Prisma client and the
// Resend client are both mocked — these tests must never hit a real database
// or send real emails.

const mockEmailLog = {
  findFirst: jest.fn(),
  create: jest.fn(),
  update: jest.fn(),
};

jest.mock('@prisma/client', () => ({
  PrismaClient: class {
    constructor() {
      this.emailLog = mockEmailLog;
    }
  },
}));

const mockSend = jest.fn();

jest.mock('../email/resend', () => ({
  getResendClient: () => ({ emails: { send: mockSend } }),
  isResendConfigured: () => true,
  getFromAddress: () => 'Tutor Management System <noreply@test.dev>',
}));

const {
  EVENT_TYPES,
  buildDedupeKey,
  sendNotification,
  notifyAssignmentAdded,
  notifyAssignmentRemoved,
  notifyTimesheetApproved,
  notifyTimesheetRejected,
} = require('../email/notifier');

const RECIPIENT = { userId: 7, email: 'tutor@example.com', name: 'Thabo Mokoena' };

const NOTIFICATION = {
  eventType: EVENT_TYPES.ASSIGNMENT_ADDED,
  entityType: 'TutorAssignment',
  entityId: 12,
  recipient: RECIPIENT,
  subject: 'You have been assigned to COMS3007',
  html: '<p>Assigned</p>',
  text: 'Assigned',
};

function mockNoPriorLogs() {
  mockEmailLog.findFirst.mockResolvedValue(null); // no SENT row, no in-flight PENDING row
}

function mockLogCreated() {
  mockEmailLog.create.mockResolvedValue({ id: 99 });
}

beforeEach(() => {
  jest.clearAllMocks();
  mockNoPriorLogs();
  mockLogCreated();
  mockSend.mockResolvedValue({ data: { id: 'resend-message-id' }, error: null });
});

describe('buildDedupeKey', () => {
  test('composes eventType, entityType, entityId and recipient email', () => {
    expect(buildDedupeKey('E', 'T', 1, null, 'a@b.c')).toBe('E:T:1:a@b.c');
  });

  test('inserts the suffix between the entity id and the recipient email', () => {
    expect(buildDedupeKey('E', 'T', 1, '2026-W37', 'a@b.c')).toBe('E:T:1:2026-W37:a@b.c');
  });
});

describe('sendNotification', () => {
  test('sends the email through Resend and logs the attempt as SENT', async () => {
    const result = await sendNotification(NOTIFICATION);

    expect(result.sent).toBe(true);
    expect(result.messageId).toBe('resend-message-id');

    // The attempt is recorded before sending, with the full dedupe key.
    expect(mockEmailLog.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        eventType: EVENT_TYPES.ASSIGNMENT_ADDED,
        entityType: 'TutorAssignment',
        entityId: 12,
        dedupeKey: 'ASSIGNMENT_ADDED:TutorAssignment:12:tutor@example.com',
        recipientEmail: 'tutor@example.com',
        recipientUserId: 7,
        status: 'PENDING',
        subject: 'You have been assigned to COMS3007',
      }),
    });

    expect(mockSend).toHaveBeenCalledWith({
      from: 'Tutor Management System <noreply@test.dev>',
      to: ['tutor@example.com'],
      subject: 'You have been assigned to COMS3007',
      html: '<p>Assigned</p>',
      text: 'Assigned',
    });

    expect(mockEmailLog.update).toHaveBeenCalledWith({
      where: { id: 99 },
      data: expect.objectContaining({ status: 'SENT', sentAt: expect.any(Date) }),
    });
  });

  test('skips sending when the same event was already successfully sent', async () => {
    mockEmailLog.findFirst.mockResolvedValueOnce({ id: 5 }); // prior SENT row

    const result = await sendNotification(NOTIFICATION);

    expect(result).toMatchObject({ sent: false, skipped: true, reason: 'ALREADY_SENT' });
    expect(mockEmailLog.create).not.toHaveBeenCalled();
    expect(mockSend).not.toHaveBeenCalled();
    expect(mockEmailLog.update).not.toHaveBeenCalled();
  });

  test('skips sending while a recent PENDING attempt for the same event is in flight', async () => {
    // First findFirst call (SENT check): none. Second call (in-flight check): recent PENDING.
    mockEmailLog.findFirst
      .mockResolvedValueOnce(null)
      .mockResolvedValueOnce({ id: 6 });

    const result = await sendNotification(NOTIFICATION);

    expect(result).toMatchObject({ sent: false, skipped: true, reason: 'IN_FLIGHT' });
    expect(mockSend).not.toHaveBeenCalled();
  });

  test('a stale PENDING row (crashed attempt) does not block a retry', async () => {
    // First findFirst call (SENT check): none. Second call (in-flight check): stale PENDING
    // is filtered out by the attemptedAt window in the query, so Prisma returns null.
    mockEmailLog.findFirst.mockResolvedValue(null);

    const result = await sendNotification(NOTIFICATION);

    expect(result.sent).toBe(true);
    const inFlightQuery = mockEmailLog.findFirst.mock.calls[1][0];
    expect(inFlightQuery.where.status).toBe('PENDING');
    expect(inFlightQuery.where.attemptedAt.gte).toBeInstanceOf(Date);
  });

  test('a different recipient is a different dedupe key and still gets notified', async () => {
    const first = await sendNotification(NOTIFICATION);
    const second = await sendNotification({
      ...NOTIFICATION,
      recipient: { userId: 8, email: 'other@example.com', name: 'Other' },
    });

    expect(first.sent).toBe(true);
    expect(second.sent).toBe(true);
    expect(mockSend).toHaveBeenCalledTimes(2);
  });

  test('logs FAILED (without throwing) when Resend returns an API error', async () => {
    mockSend.mockResolvedValue({
      data: null,
      error: { message: 'Invalid from address', statusCode: 400, name: 'validation_error' },
    });

    const result = await sendNotification(NOTIFICATION);

    expect(result).toMatchObject({ sent: false, skipped: false, reason: 'SEND_FAILED' });
    expect(result.error).toContain('Resend API error');
    expect(mockEmailLog.update).toHaveBeenCalledWith({
      where: { id: 99 },
      data: expect.objectContaining({ status: 'FAILED', errorMessage: expect.stringContaining('Resend API error') }),
    });
  });

  test('logs FAILED (without throwing) when Resend throws a network error', async () => {
    mockSend.mockRejectedValue(new Error('socket hang up'));

    const result = await sendNotification(NOTIFICATION);

    expect(result).toMatchObject({ sent: false, reason: 'SEND_FAILED' });
    expect(result.error).toBe('socket hang up');
    expect(mockEmailLog.update).toHaveBeenCalledWith({
      where: { id: 99 },
      data: expect.objectContaining({ status: 'FAILED', errorMessage: 'socket hang up' }),
    });
  });

  test('does not send at all when the dispatch attempt cannot be logged', async () => {
    mockEmailLog.create.mockRejectedValue(new Error('database is down'));

    const result = await sendNotification(NOTIFICATION);

    expect(result).toMatchObject({ sent: false, skipped: false, reason: 'LOG_FAILED' });
    expect(mockSend).not.toHaveBeenCalled();
  });

  test('skips without logging when the recipient has no email', async () => {
    const result = await sendNotification({ ...NOTIFICATION, recipient: null });

    expect(result).toMatchObject({ sent: false, skipped: true, reason: 'NO_RECIPIENT' });
    expect(mockEmailLog.findFirst).not.toHaveBeenCalled();
    expect(mockSend).not.toHaveBeenCalled();
  });

  test('uses the dedupe suffix to allow a new notification after a resubmission', async () => {
    const first = await sendNotification({
      ...NOTIFICATION,
      eventType: EVENT_TYPES.TIMESHEET_APPROVED,
      entityType: 'Timesheet',
      entityId: 33,
      dedupeSuffix: '2026-08-29T10:00:00.000Z',
    });
    const second = await sendNotification({
      ...NOTIFICATION,
      eventType: EVENT_TYPES.TIMESHEET_APPROVED,
      entityType: 'Timesheet',
      entityId: 33,
      dedupeSuffix: '2026-09-05T10:00:00.000Z', // resubmitted -> new event
    });

    expect(first.sent).toBe(true);
    expect(second.sent).toBe(true); // same timesheet, different submission -> allowed
  });
});

describe('notifyAssignmentAdded', () => {
  test('notifies the assigned tutor with the assignment details', async () => {
    await notifyAssignmentAdded({
      id: 12,
      allocatedHours: 40,
      semester: '2026-S1',
      status: 'ACTIVE',
      course: { courseCode: 'COMS3007', courseName: 'Machine Learning' },
      tutor: { user: { id: 7, firstName: 'Thabo', lastName: 'Mokoena', email: 'tutor@example.com' } },
    });

    const createData = mockEmailLog.create.mock.calls[0][0].data;
    expect(createData.eventType).toBe('ASSIGNMENT_ADDED');
    expect(createData.dedupeKey).toBe('ASSIGNMENT_ADDED:TutorAssignment:12:tutor@example.com');
    const sendPayload = mockSend.mock.calls[0][0];
    expect(sendPayload.subject).toContain('COMS3007');
    expect(sendPayload.to).toEqual(['tutor@example.com']);
  });
});

describe('notifyAssignmentRemoved', () => {
  test('notifies the tutor that the assignment has been removed (different event type than added)', async () => {
    await notifyAssignmentRemoved({
      id: 12,
      semester: '2026-S1',
      course: { courseCode: 'COMS3007', courseName: 'Machine Learning' },
      tutor: { user: { id: 7, firstName: 'Thabo', lastName: 'Mokoena', email: 'tutor@example.com' } },
    });

    const createData = mockEmailLog.create.mock.calls[0][0].data;
    expect(createData.eventType).toBe('ASSIGNMENT_REMOVED');
    expect(createData.dedupeKey).toBe('ASSIGNMENT_REMOVED:TutorAssignment:12:tutor@example.com');
    expect(mockSend.mock.calls[0][0].subject).toContain('has been removed');
  });
});

describe('notifyTimesheetApproved', () => {
  test('notifies the tutor and scopes the dedupe key to the submission', async () => {
    await notifyTimesheetApproved({
      id: 33,
      totalHours: 8.5,
      submittedAt: new Date('2026-08-29T10:00:00Z'),
      approvedAt: new Date('2026-09-09T10:00:00Z'),
      tutor: { user: { id: 7, firstName: 'Thabo', lastName: 'Mokoena', email: 'tutor@example.com' } },
    });

    const createData = mockEmailLog.create.mock.calls[0][0].data;
    expect(createData.eventType).toBe('TIMESHEET_APPROVED');
    expect(createData.dedupeKey).toBe(
      'TIMESHEET_APPROVED:Timesheet:33:2026-08-29T10:00:00.000Z:tutor@example.com',
    );
    expect(mockSend.mock.calls[0][0].subject).toContain('#33');
  });
});

describe('notifyTimesheetRejected', () => {
  test('includes the recorded rejection reason in the email', async () => {
    await notifyTimesheetRejected({
      id: 33,
      totalHours: 8.5,
      submittedAt: new Date('2026-08-29T10:00:00Z'),
      rejectionReason: 'Duplicate entry',
      tutor: { user: { id: 7, firstName: 'Thabo', lastName: 'Mokoena', email: 'tutor@example.com' } },
    });

    expect(mockSend.mock.calls[0][0].subject).toContain('rejected');
    expect(mockSend.mock.calls[0][0].html).toContain('Duplicate entry');
  });
});
