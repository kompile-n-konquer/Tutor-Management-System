// Mock the Prisma client before requiring the controller
jest.mock('../prisma/client', () => ({
  course: { findMany: jest.fn() },
}));

const prisma = require('../prisma/client');
const { getAllCourses } = require('../controllers/courses');

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

describe('getAllCourses', () => {
  test('returns courses mapped to the expected shape', async () => {
    prisma.course.findMany.mockResolvedValue([
      {
        id: 1,
        courseCode: 'CS101',
        courseName: 'Intro to Programming',
        minimumMark: 50,
        requiredTutors: 5,
        budgetHours: 40,
        hourlyRate: 150,
        lecturerId: 10,
        _count: { assignments: 3 },
        lecturer: { user: { firstName: 'Kgaogelo', lastName: 'Mabuza' } },
      },
      {
        id: 2,
        courseCode: 'MATH202',
        courseName: 'Discrete Mathematics',
        minimumMark: 60,
        requiredTutors: 2,
        budgetHours: 20,
        hourlyRate: 160,
        lecturerId: 11,
        _count: { assignments: 0 },
        lecturer: { user: { firstName: 'Alice', lastName: 'Smith' } },
      },
    ]);

    const req = {};
    const res = mockRes();
    const next = jest.fn();

    await getAllCourses(req, res, next);
    await flushMicrotasks();

    expect(prisma.course.findMany).toHaveBeenCalledTimes(1);

    // Verify ordering and include shape
    const callArgs = prisma.course.findMany.mock.calls[0][0];
    expect(callArgs.orderBy).toEqual({ courseCode: 'asc' });
    expect(callArgs.include._count).toEqual({ select: { assignments: true } });

    expect(res.json).toHaveBeenCalledWith({
      courses: [
        expect.objectContaining({
          id: 1,
          courseCode: 'CS101',
          courseName: 'Intro to Programming',
          requiredTutors: 5,
          budgetHours: 40,
          hourlyRate: 150,
          assignedCount: 3,
          lecturer: 'Kgaogelo Mabuza',
        }),
        expect.objectContaining({
          id: 2,
          courseCode: 'MATH202',
          assignedCount: 0,
          lecturer: 'Alice Smith',
        }),
      ],
    });
    expect(next).not.toHaveBeenCalled();
  });

  test('handles null lecturer gracefully', async () => {
    prisma.course.findMany.mockResolvedValue([
      {
        id: 3,
        courseCode: 'CS305',
        courseName: 'Database Systems',
        minimumMark: 55,
        requiredTutors: 4,
        budgetHours: 35,
        hourlyRate: 155,
        lecturerId: 99,
        _count: { assignments: 1 },
        lecturer: null,
      },
    ]);

    const res = mockRes();
    const next = jest.fn();

    await getAllCourses({}, res, next);
    await flushMicrotasks();

    const body = res.json.mock.calls[0][0];
    expect(body.courses[0].lecturer).toBeNull();
    expect(next).not.toHaveBeenCalled();
  });

  test('returns empty array when no courses exist', async () => {
    prisma.course.findMany.mockResolvedValue([]);

    const res = mockRes();
    const next = jest.fn();

    await getAllCourses({}, res, next);
    await flushMicrotasks();

    expect(res.json).toHaveBeenCalledWith({ courses: [] });
    expect(next).not.toHaveBeenCalled();
  });
});
