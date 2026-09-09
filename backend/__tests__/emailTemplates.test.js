const {
  escapeHtml,
  assignmentAddedEmail,
  assignmentRemovedEmail,
  timesheetApprovedEmail,
  timesheetRejectedEmail,
  stuckTimesheetReminderEmail,
} = require('../email/templates');

describe('escapeHtml', () => {
  test('escapes HTML special characters', () => {
    expect(escapeHtml('<script>alert("x")</script>')).toBe(
      '&lt;script&gt;alert(&quot;x&quot;)&lt;/script&gt;',
    );
  });

  test('renders null and undefined as empty strings', () => {
    expect(escapeHtml(null)).toBe('');
    expect(escapeHtml(undefined)).toBe('');
  });
});

describe('assignmentAddedEmail', () => {
  const email = assignmentAddedEmail({
    recipientName: 'Thabo Mokoena',
    courseCode: 'COMS3007',
    courseName: 'Machine Learning',
    allocatedHours: 40,
    semester: '2026-S1',
    status: 'ACTIVE',
  });

  test('subject mentions the course', () => {
    expect(email.subject).toContain('You have been assigned to COMS3007');
    expect(email.subject).toContain('Machine Learning');
  });

  test('html clearly states the person has been assigned and includes the assignment details', () => {
    expect(email.html).toContain('You have been assigned as a tutor');
    expect(email.html).toContain('COMS3007 - Machine Learning');
    expect(email.html).toContain('40 h');
    expect(email.html).toContain('2026-S1');
    expect(email.html).toContain('ACTIVE');
  });

  test('text body includes the assignment details', () => {
    expect(email.text).toContain('Course: COMS3007 - Machine Learning');
    expect(email.text).toContain('Allocated hours: 40 h');
  });

  test('escapes HTML in dynamic values', () => {
    const unsafe = assignmentAddedEmail({
      recipientName: 'Thabo',
      courseCode: '<b>X</b>',
      courseName: 'Evil <script>',
      allocatedHours: 1,
      semester: 'S1',
      status: 'ACTIVE',
    });
    expect(unsafe.html).not.toContain('<script>');
    expect(unsafe.html).not.toContain('<b>X</b>');
  });
});

describe('assignmentRemovedEmail', () => {
  const email = assignmentRemovedEmail({
    recipientName: 'Thabo Mokoena',
    courseCode: 'COMS3007',
    courseName: 'Machine Learning',
    semester: '2026-S1',
  });

  test('subject clearly states the assignment has been removed', () => {
    expect(email.subject).toContain('has been removed');
    expect(email.subject).toContain('COMS3007');
  });

  test('html clearly states the assignment has been removed', () => {
    expect(email.html).toContain('Your tutoring assignment has been removed');
    expect(email.html).toContain('COMS3007 - Machine Learning');
  });

  test('text body includes the course details', () => {
    expect(email.text).toContain('Course: COMS3007 - Machine Learning');
  });
});

describe('timesheetApprovedEmail', () => {
  const email = timesheetApprovedEmail({
    recipientName: 'Thabo Mokoena',
    timesheetId: 12,
    totalHours: 8.5,
    approvedAt: new Date('2026-09-09T10:00:00Z'),
  });

  test('subject states the timesheet has been approved', () => {
    expect(email.subject).toBe('Your timesheet #12 has been approved');
  });

  test('html includes the timesheet details', () => {
    expect(email.html).toContain('Your timesheet has been approved');
    expect(email.html).toContain('#12');
    expect(email.html).toContain('8.5 h');
  });
});

describe('timesheetRejectedEmail', () => {
  test('includes the rejection reason when one exists', () => {
    const email = timesheetRejectedEmail({
      recipientName: 'Thabo Mokoena',
      timesheetId: 12,
      totalHours: 8.5,
      rejectionReason: 'Hours logged for a public holiday',
    });

    expect(email.subject).toBe('Your timesheet #12 has been rejected');
    expect(email.html).toContain('Your timesheet has been rejected');
    expect(email.html).toContain('Hours logged for a public holiday');
    expect(email.text).toContain('Reason: Hours logged for a public holiday');
  });

  test('omits the reason section when no reason exists', () => {
    const email = timesheetRejectedEmail({
      recipientName: 'Thabo Mokoena',
      timesheetId: 12,
      totalHours: 8.5,
      rejectionReason: null,
    });

    expect(email.subject).toContain('rejected');
    expect(email.html).not.toContain('Reason:');
    expect(email.text).not.toContain('Reason:');
  });

  test('escapes HTML in the rejection reason', () => {
    const email = timesheetRejectedEmail({
      recipientName: 'Thabo',
      timesheetId: 1,
      totalHours: 1,
      rejectionReason: '<img src=x onerror=alert(1)>',
    });
    expect(email.html).not.toContain('<img');
  });
});

describe('stuckTimesheetReminderEmail', () => {
  const email = stuckTimesheetReminderEmail({
    recipientName: 'Dr. Jane Smith',
    tutorName: 'Thabo Mokoena',
    timesheetId: 33,
    totalHours: 12,
    submittedAt: new Date('2026-08-29T10:00:00Z'),
    daysPending: 11,
    stuckThresholdDays: 7,
  });

  test('subject mentions the pending timesheet and how long it has been waiting', () => {
    expect(email.subject).toContain('timesheet #33');
    expect(email.subject).toContain('Thabo Mokoena');
    expect(email.subject).toContain('11 days');
  });

  test('html asks the lecturer to review the stuck timesheet', () => {
    expect(email.html).toContain('Reminder: a timesheet is awaiting your approval');
    expect(email.html).toContain('Thabo Mokoena');
    expect(email.html).toContain('more than 7 days');
    expect(email.html).toContain('11 days');
  });

  test('text body includes the pending details', () => {
    expect(email.text).toContain('Pending for: 11 days');
  });
});
