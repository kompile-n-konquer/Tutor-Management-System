// Locks the events controller's visibility rules: tutors see events for the
// courses they are allocated to, lecturers only the events of the courses
// they created, organisers/admins everything, students nothing.
jest.mock('../prisma/client', () => ({
  user: { findUnique: jest.fn() },
  event: { findMany: jest.fn(), findUnique: jest.fn() },
  course: { findMany: jest.fn() },
  tutorAssignment: { findFirst: jest.fn(), findMany: jest.fn() },
  eventRegister: { findMany: jest.fn(), deleteMany: jest.fn(), createMany: jest.fn() },
  $transaction: jest.fn(),
}));

const prisma = require('../prisma/client');
const {
  getEvents,
  getEvent,
  getMyCourses,
  getEventRegister,
  updateEventRegister,
} = require('../controllers/events');

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

function mockReq(query = {}) {
  return { user: { user_id: 'uid-123' }, params: {}, query };
}

function mockRes() {
  const res = {};
  res.status = jest.fn().mockReturnValue(res);
  res.json = jest.fn().mockReturnValue(res);
  res.end = jest.fn().mockReturnValue(res);
  return res;
}

const serialisedEvent = {
  id: 1,
  courseId: 5,
  courseCode: 'CS101',
  courseName: 'Intro to Programming',
  date: new Date('2026-09-15T00:00:00.000Z'),
  description: 'tutoring',
  lecturer: 'Kgaogelo Mabuza',
  times: [],
  courseSlots: [],
  canEdit: true,
};

beforeEach(() => {
  jest.clearAllMocks();
});

describe('getEvents', () => {
  test('scopes the list to the lecturer’s own courses', async () => {
    prisma.user.findUnique.mockResolvedValue({ id: 7, role: 'LECTURER' });
    prisma.event.findMany.mockResolvedValue([
      {
        id: 1,
        courseId: 5,
        date: new Date('2026-09-15T00:00:00.000Z'),
        description: 'tutoring',
        createdAt: new Date(),
        updatedAt: new Date(),
        course: {
          id: 5,
          courseCode: 'CS101',
          courseName: 'Intro to Programming',
          userId: 7,
          user: { firstName: 'Kgaogelo', lastName: 'Mabuza' },
          slots: [],
        },
      },
    ]);

    const res = mockRes();
    const next = jest.fn();

    await getEvents(mockReq(), res, next);
    await flushMicrotasks();

    // The where clause is the ownership gate.
    expect(prisma.event.findMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: { course: { userId: 7 } } }),
    );
    expect(res.status).toHaveBeenCalledWith(200);
    expect(res.json).toHaveBeenCalledWith([expect.objectContaining({ id: 1, canEdit: true })]);
    expect(next).not.toHaveBeenCalled();
  });

  test('scopes the list to the tutor’s allocated courses', async () => {
    prisma.user.findUnique.mockResolvedValue({ id: 9, role: 'TUTOR' });
    prisma.event.findMany.mockResolvedValue([]);

    const res = mockRes();
    const next = jest.fn();

    await getEvents(mockReq(), res, next);
    await flushMicrotasks();

    expect(prisma.event.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { course: { assignments: { some: { userId: 9 } } } },
      }),
    );
    expect(next).not.toHaveBeenCalled();
  });

  test('rejects a student — events are staff/tutor data', async () => {
    prisma.user.findUnique.mockResolvedValue({ id: 5, role: 'STUDENT' });

    const res = mockRes();
    const next = jest.fn();

    await getEvents(mockReq(), res, next);
    await flushMicrotasks();

    expect(next).toHaveBeenCalledWith(expect.objectContaining({ statusCode: 403 }));
    expect(prisma.event.findMany).not.toHaveBeenCalled();
  });

  test('combines a tutor scope with an inclusive date range', async () => {
    prisma.user.findUnique.mockResolvedValue({ id: 9, role: 'TUTOR' });
    prisma.event.findMany.mockResolvedValue([]);

    await getEvents(mockReq({ from: '2026-03-01', to: '2026-03-31' }), mockRes(), jest.fn());

    expect(prisma.event.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: {
          course: { assignments: { some: { userId: 9 } } },
          date: {
            gte: new Date('2026-03-01T00:00:00.000Z'),
            lte: new Date('2026-03-31T00:00:00.000Z'),
          },
        },
      }),
    );
  });

  test.each([
    ['after', { from: '2026-03-01' }, { gte: new Date('2026-03-01T00:00:00.000Z') }],
    ['before', { to: '2026-03-31' }, { lte: new Date('2026-03-31T00:00:00.000Z') }],
  ])('filters events %s a selected date', async (_label, query, date) => {
    prisma.user.findUnique.mockResolvedValue({ id: 7, role: 'ORGANISER' });
    prisma.event.findMany.mockResolvedValue([]);

    await getEvents(mockReq(query), mockRes(), jest.fn());

    expect(prisma.event.findMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: { date } }),
    );
  });

  test.each([
    [{ from: '2026-02-30' }, 'from and to must be valid dates in YYYY-MM-DD format'],
    [{ to: 'not-a-date' }, 'from and to must be valid dates in YYYY-MM-DD format'],
    [{ from: '2026-04-01', to: '2026-03-31' }, 'from must be on or before to'],
  ])('rejects invalid date filter input', async (query, message) => {
    prisma.user.findUnique.mockResolvedValue({ id: 7, role: 'ORGANISER' });
    const next = jest.fn();

    await getEvents(mockReq(query), mockRes(), next);

    expect(prisma.event.findMany).not.toHaveBeenCalled();
    expect(next).toHaveBeenCalledWith(expect.objectContaining({ statusCode: 400, message }));
  });
});

describe('getEvent', () => {
  const ownedEvent = {
    id: 1,
    courseId: 5,
    date: new Date('2026-09-15T00:00:00.000Z'),
    description: 'tutoring',
    createdAt: new Date(),
    updatedAt: new Date(),
    course: {
      id: 5,
      courseCode: 'CS101',
      courseName: 'Intro to Programming',
      userId: 7,
      user: { firstName: 'Kgaogelo', lastName: 'Mabuza' },
      slots: [],
    },
  };

  test('rejects a lecturer opening an event on a course they did not create', async () => {
    prisma.user.findUnique.mockResolvedValue({ id: 8, role: 'LECTURER' });
    prisma.event.findUnique.mockResolvedValue(ownedEvent); // course owned by user 7

    const req = { ...mockReq(), params: { id: '1' } };
    const res = mockRes();
    const next = jest.fn();

    await getEvent(req, res, next);
    await flushMicrotasks();

    expect(next).toHaveBeenCalledWith(expect.objectContaining({ statusCode: 403 }));
    expect(res.json).not.toHaveBeenCalled();
  });

  test('lets the owning lecturer open their own event', async () => {
    prisma.user.findUnique.mockResolvedValue({ id: 7, role: 'LECTURER' });
    prisma.event.findUnique.mockResolvedValue(ownedEvent);

    const req = { ...mockReq(), params: { id: '1' } };
    const res = mockRes();
    const next = jest.fn();

    await getEvent(req, res, next);
    await flushMicrotasks();

    expect(res.status).toHaveBeenCalledWith(200);
    expect(res.json).toHaveBeenCalledWith(expect.objectContaining(serialisedEvent));
    expect(next).not.toHaveBeenCalled();
  });

  test('rejects a tutor allocated to a different course', async () => {
    prisma.user.findUnique.mockResolvedValue({ id: 9, role: 'TUTOR' });
    prisma.event.findUnique.mockResolvedValue(ownedEvent);
    prisma.tutorAssignment.findFirst.mockResolvedValue(null);

    const req = { ...mockReq(), params: { id: '1' } };
    const res = mockRes();
    const next = jest.fn();

    await getEvent(req, res, next);
    await flushMicrotasks();

    expect(next).toHaveBeenCalledWith(expect.objectContaining({ statusCode: 403 }));
  });
});

describe('getMyCourses', () => {
  test('only lecturers may list their event-eligible courses', async () => {
    prisma.user.findUnique.mockResolvedValue({ id: 5, role: 'ORGANISER' });

    const res = mockRes();
    const next = jest.fn();

    await getMyCourses(mockReq(), res, next);
    await flushMicrotasks();

    expect(next).toHaveBeenCalledWith(expect.objectContaining({ statusCode: 403 }));
    expect(prisma.course.findMany).not.toHaveBeenCalled();
  });

  test('returns only the lecturer’s own courses with their slots', async () => {
    prisma.user.findUnique.mockResolvedValue({ id: 7, role: 'LECTURER' });
    prisma.course.findMany.mockResolvedValue([
      {
        id: 5,
        courseCode: 'CS101',
        courseName: 'Intro to Programming',
        slots: [
          {
            dayOfWeek: 0,
            timeSlotId: 2,
            timeSlot: { startMinute: 480, endMinute: 570 },
          },
        ],
      },
    ]);

    const res = mockRes();
    const next = jest.fn();

    await getMyCourses(mockReq(), res, next);
    await flushMicrotasks();

    expect(prisma.course.findMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: { userId: 7 } }),
    );
    expect(res.status).toHaveBeenCalledWith(200);
    expect(res.json).toHaveBeenCalledWith([
      {
        id: 5,
        courseCode: 'CS101',
        courseName: 'Intro to Programming',
        slots: [{ dayOfWeek: 0, timeSlotId: 2, startMinute: 480, endMinute: 570 }],
      },
    ]);
    expect(next).not.toHaveBeenCalled();
  });
});

// ── Event register ──────────────────────────────────────────────────────

describe('event register', () => {
  // 2026-09-15 is a Tuesday → dayOfWeek 1; the course tutors Monday 08:00-09:00
  const registerEvent = {
    id: 1,
    courseId: 5,
    date: new Date('2026-09-15T00:00:00.000Z'),
    description: 'tutoring',
    course: {
      id: 5,
      courseCode: 'CS101',
      courseName: 'Intro to Programming',
      userId: 7,
      slots: [
        { dayOfWeek: 1, timeSlotId: 2, timeSlot: { startMinute: 480, endMinute: 540 } },
      ],
    },
  };
  const tutorsFixture = [
    {
      user: {
        id: 9,
        firstName: 'Thabo',
        lastName: 'Nkosi',
        email: 'thabo@wits.ac.za',
      },
    },
    {
      user: {
        id: 11,
        firstName: 'Ana',
        lastName: 'Botha',
        email: 'ana@wits.ac.za',
      },
    },
  ];

  test('getEventRegister rejects non-lecturers and non-owners', async () => {
    prisma.user.findUnique.mockResolvedValue({ id: 9, role: 'TUTOR' });

    const res = mockRes();
    const next = jest.fn();

    await getEventRegister({ ...mockReq(), params: { id: '1' } }, res, next);
    await flushMicrotasks();

    expect(next).toHaveBeenCalledWith(expect.objectContaining({ statusCode: 403 }));
    expect(prisma.event.findUnique).not.toHaveBeenCalled();
  });

  test('getEventRegister lists allocated tutors with availability and present flags', async () => {
    prisma.user.findUnique.mockResolvedValue({ id: 7, role: 'LECTURER' });
    prisma.event.findUnique.mockResolvedValue(registerEvent);
    prisma.tutorAssignment.findMany.mockResolvedValue(tutorsFixture);
    // Thabo was marked present; Ana was not
    prisma.eventRegister.findMany.mockResolvedValue([{ eventId: 1, userId: 9 }]);

    const res = mockRes();
    const next = jest.fn();

    await getEventRegister({ ...mockReq(), params: { id: '1' } }, res, next);
    await flushMicrotasks();

    expect(next).not.toHaveBeenCalled();
    expect(res.status).toHaveBeenCalledWith(200);
    const payload = res.json.mock.calls[0][0];
    expect(payload).toEqual(
      expect.objectContaining({ eventId: 1, courseCode: 'CS101', times: [{ startMinute: 480, endMinute: 540 }] }),
    );
    // Sorted by name: Ana (absent) before Thabo (present)
    expect(payload.tutors).toEqual([
      expect.objectContaining({ id: 11, present: false }),
      expect.objectContaining({ id: 9, present: true }),
    ]);
  });

  test('updateEventRegister validates the payload shape', async () => {
    prisma.user.findUnique.mockResolvedValue({ id: 7, role: 'LECTURER' });
    prisma.event.findUnique.mockResolvedValue(registerEvent);

    const res = mockRes();
    const next = jest.fn();

    await updateEventRegister({ ...mockReq(), params: { id: '1' }, body: {} }, res, next);
    await flushMicrotasks();

    expectHttpError(next, 400, 'presentIds must be an array of tutor ids');
  });

  test('updateEventRegister rejects tutors not allocated to the course', async () => {
    prisma.user.findUnique.mockResolvedValue({ id: 7, role: 'LECTURER' });
    prisma.event.findUnique.mockResolvedValue(registerEvent);
    // Only tutor 9 is allocated, but the payload also marks 11
    prisma.tutorAssignment.findMany.mockResolvedValue([{ userId: 9 }]);

    const res = mockRes();
    const next = jest.fn();

    await updateEventRegister(
      { ...mockReq(), params: { id: '1' }, body: { presentIds: [9, 11] } },
      res,
      next,
    );
    await flushMicrotasks();

    expectHttpError(next, 400, 'All tutors must be allocated to the course');
    expect(prisma.$transaction).not.toHaveBeenCalled();
  });

  test('updateEventRegister replaces the present list in one transaction', async () => {
    prisma.user.findUnique.mockResolvedValue({ id: 7, role: 'LECTURER' });
    prisma.event.findUnique.mockResolvedValue(registerEvent);
    prisma.tutorAssignment.findMany.mockResolvedValue([{ userId: 9 }, { userId: 11 }]);
    prisma.$transaction.mockResolvedValue([]);

    const res = mockRes();
    const next = jest.fn();

    await updateEventRegister(
      { ...mockReq(), params: { id: '1' }, body: { presentIds: [9, 11] } },
      res,
      next,
    );
    await flushMicrotasks();

    expect(prisma.eventRegister.deleteMany).toHaveBeenCalledWith({ where: { eventId: 1 } });
    expect(prisma.eventRegister.createMany).toHaveBeenCalledWith({
      data: [{ eventId: 1, userId: 9 }, { eventId: 1, userId: 11 }],
    });
    expect(res.json).toHaveBeenCalledWith({ message: 'Register saved', presentIds: [9, 11] });
    expect(next).not.toHaveBeenCalled();
  });

  test('register guards reject invalid ids, missing events and non-owners', async () => {
    prisma.user.findUnique.mockResolvedValue({ id: 7, role: 'LECTURER' });

    // Non-integer id never reaches the database
    let next = jest.fn();
    await getEventRegister({ ...mockReq(), params: { id: 'abc' } }, mockRes(), next);
    await flushMicrotasks();
    expectHttpError(next, 400, 'Event ID must be a number');
    expect(prisma.event.findUnique).not.toHaveBeenCalled();

    // Unknown event
    prisma.event.findUnique.mockResolvedValue(null);
    next = jest.fn();
    await getEventRegister({ ...mockReq(), params: { id: '99' } }, mockRes(), next);
    await flushMicrotasks();
    expectHttpError(next, 404, 'Event not found');

    // Lecturer who does not own the course
    prisma.event.findUnique.mockResolvedValue({
      ...registerEvent,
      course: { ...registerEvent.course, userId: 8 },
    });
    next = jest.fn();
    await getEventRegister({ ...mockReq(), params: { id: '1' } }, mockRes(), next);
    await flushMicrotasks();
    expectHttpError(next, 403, 'You can only manage the register for events on courses you have created');
  });

  test('updateEventRegister rejects non-numeric and duplicate tutor ids', async () => {
    prisma.user.findUnique.mockResolvedValue({ id: 7, role: 'LECTURER' });
    prisma.event.findUnique.mockResolvedValue(registerEvent);

    let next = jest.fn();
    await updateEventRegister(
      { ...mockReq(), params: { id: '1' }, body: { presentIds: ['x'] } },
      mockRes(),
      next,
    );
    await flushMicrotasks();
    expectHttpError(next, 400, 'Every tutor id must be a number');

    next = jest.fn();
    await updateEventRegister(
      { ...mockReq(), params: { id: '1' }, body: { presentIds: [9, 9] } },
      mockRes(),
      next,
    );
    await flushMicrotasks();
    expectHttpError(next, 400, 'Each tutor can only appear once on the register');
    expect(prisma.$transaction).not.toHaveBeenCalled();
  });

  test('updateEventRegister accepts an empty list and only clears the register', async () => {
    prisma.user.findUnique.mockResolvedValue({ id: 7, role: 'LECTURER' });
    prisma.event.findUnique.mockResolvedValue(registerEvent);
    prisma.$transaction.mockResolvedValue([]);

    const res = mockRes();
    const next = jest.fn();

    await updateEventRegister(
      { ...mockReq(), params: { id: '1' }, body: { presentIds: [] } },
      res,
      next,
    );
    await flushMicrotasks();

    // Nobody marked present: the register is cleared, no tutor lookup or insert
    expect(prisma.tutorAssignment.findMany).not.toHaveBeenCalled();
    expect(prisma.eventRegister.createMany).not.toHaveBeenCalled();
    expect(prisma.eventRegister.deleteMany).toHaveBeenCalledWith({ where: { eventId: 1 } });
    expect(res.json).toHaveBeenCalledWith({ message: 'Register saved', presentIds: [] });
    expect(next).not.toHaveBeenCalled();
  });
});
