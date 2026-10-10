// Locks the events controller's visibility rules: tutors see events for the
// courses they are allocated to, lecturers only the events of the courses
// they created, organisers/admins everything, students nothing.
jest.mock('../prisma/client', () => ({
  user: { findUnique: jest.fn() },
  event: { findMany: jest.fn(), findUnique: jest.fn() },
  course: { findMany: jest.fn() },
  tutorAssignment: { findFirst: jest.fn() },
}));

const prisma = require('../prisma/client');
const { getEvents, getEvent, getMyCourses } = require('../controllers/events');

// catchAsync does not `return` the inner promise — flushMicrotasks waits
// for the background async work to settle before assertions run.
function flushMicrotasks() {
  return new Promise((resolve) => setImmediate(resolve));
}

function mockReq() {
  return { user: { user_id: 'uid-123' }, params: {}, query: {} };
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
