// Mock the Prisma client before requiring the controller
jest.mock('../prisma/client', () => ({
  course: { findMany: jest.fn() },
}));

const prisma = require('../prisma/client');
const { getCourses } = require('../controllers/courses');

// catchAsync does not `return` the inner promise — flushMicrotasks waits
// for the background async work to settle before assertions run.
function flushMicrotasks() {
  return new Promise((resolve) => setImmediate(resolve));
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
});

describe('getCourses', () => {
  test('returns a plain array of courses with allocation progress fields', async () => {
    prisma.course.findMany.mockResolvedValue([
      {
        id: 1,
        courseCode: 'CS101',
        courseName: 'Intro to Programming',
        minimumMark: 50,
        tutorsRequired: 5,
        createdAt: new Date('2026-09-10T00:00:00.000Z'),
        acceptingApplications: true,
        user: { id: 10, firstName: 'Kgaogelo', lastName: 'Mabuza', email: 'kgaogelo@wits.ac.za' },
        _count: { assignments: 2, slots: 4, applications: 7 },
      },
      {
        id: 2,
        courseCode: 'MATH202',
        courseName: 'Discrete Mathematics',
        minimumMark: 60,
        tutorsRequired: 3,
        createdAt: new Date('2026-09-11T00:00:00.000Z'),
        acceptingApplications: false,
        user: { id: 11, firstName: 'Alice', lastName: 'Smith', email: 'alice@wits.ac.za' },
        _count: { assignments: 0, slots: 2, applications: 1 },
      },
    ]);

    const res = mockRes();
    const next = jest.fn();

    await getCourses({}, res, next);
    await flushMicrotasks();

    expect(prisma.course.findMany).toHaveBeenCalledTimes(1);

    // Newest courses first, with the lecturer and per-relation counts included
    const callArgs = prisma.course.findMany.mock.calls[0][0];
    expect(callArgs.orderBy).toEqual({ createdAt: 'desc' });
    expect(callArgs.include.user).toEqual({ select: { id: true, firstName: true, lastName: true, email: true } });
    expect(callArgs.include._count).toEqual({ select: { assignments: true, slots: true, applications: true } });

    // The frontend (ViewAllCourses, Organiser board, global search) consumes a
    // plain array — not a { courses } wrapper.
    const body = res.json.mock.calls[0][0];
    expect(Array.isArray(body)).toBe(true);
    expect(body).toEqual([
      expect.objectContaining({
        id: 1,
        courseCode: 'CS101',
        courseName: 'Intro to Programming',
        minimumMark: 50,
        tutorsRequired: 5,
        acceptingApplications: true,
        lecturer: { id: 10, firstName: 'Kgaogelo', lastName: 'Mabuza', email: 'kgaogelo@wits.ac.za' },
        slotsCount: 4,
        applicationsCount: 7,
        assignedTutors: 2,
        tutorsMissing: 3,
        isAllocated: true,
      }),
      expect.objectContaining({
        id: 2,
        courseCode: 'MATH202',
        assignedTutors: 0,
        tutorsMissing: 3,
        isAllocated: false,
      }),
    ]);
    expect(res.status).toHaveBeenCalledWith(200);
    expect(next).not.toHaveBeenCalled();
  });

  test('never reports negative tutorsMissing when a course is overstaffed', async () => {
    prisma.course.findMany.mockResolvedValue([
      {
        id: 3,
        courseCode: 'CS305',
        courseName: 'Database Systems',
        minimumMark: 55,
        tutorsRequired: 1,
        createdAt: new Date('2026-09-12T00:00:00.000Z'),
        acceptingApplications: false,
        user: null,
        _count: { assignments: 3, slots: 2, applications: 4 },
      },
    ]);

    const res = mockRes();
    const next = jest.fn();

    await getCourses({}, res, next);
    await flushMicrotasks();

    const body = res.json.mock.calls[0][0];
    expect(body[0].assignedTutors).toBe(3);
    expect(body[0].tutorsMissing).toBe(0);
    expect(body[0].isAllocated).toBe(true);
    expect(next).not.toHaveBeenCalled();
  });

  test('returns an empty array when no courses exist', async () => {
    prisma.course.findMany.mockResolvedValue([]);

    const res = mockRes();
    const next = jest.fn();

    await getCourses({}, res, next);
    await flushMicrotasks();

    expect(res.status).toHaveBeenCalledWith(200);
    expect(res.json).toHaveBeenCalledWith([]);
    expect(next).not.toHaveBeenCalled();
  });
});
