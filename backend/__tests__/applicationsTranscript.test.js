// Mock the Prisma client before requiring the controller
jest.mock('../prisma/client', () => ({
  user: { findUnique: jest.fn() },
  course: { findMany: jest.fn(), findUnique: jest.fn() },
  availability: { findMany: jest.fn() },
  application: { findMany: jest.fn(), findFirst: jest.fn(), create: jest.fn() },
  tutorAssignment: { findMany: jest.fn() },
  transcript: { findUnique: jest.fn(), upsert: jest.fn() },
  systemSetting: { findUnique: jest.fn() },
}));

// The transcript parser touches the filesystem and a PDF library — mock the
// boundary and give the lookup a faithful in-memory implementation
jest.mock('../utils/transcriptParser', () => ({
  parseTranscriptPdf: jest.fn(),
  buildMarkLookup: jest.fn(() => mockLookup),
  lookupMark: jest.fn((lookup, courseCode) => {
    const key = courseCode.replace(/[\s-]/g, '').toUpperCase();
    return lookup.get(key) ?? null;
  }),
}));

const mockLookup = new Map([
  ['COMS1015', 66],
  ['COMS2014', 56],
]);

jest.mock('fs', () => ({
  readFileSync: jest.fn(() => Buffer.from('%PDF-fake')),
  unlink: jest.fn((_path, cb) => cb()),
  existsSync: jest.fn(() => true),
  unlinkSync: jest.fn(),
}));

const prisma = require('../prisma/client');
const fs = require('fs');
const { parseTranscriptPdf } = require('../utils/transcriptParser');
const {
  getOpportunities,
  getOpportunity,
  createApplication,
  uploadTranscript,
  getMyTranscript,
} = require('../controllers/applications');

// catchAsync does not `return` the inner promise — flushMicrotasks waits
// for the background async work to settle before assertions run.
function flushMicrotasks() {
  return new Promise((resolve) => setImmediate(resolve));
}

function mockReq(overrides = {}) {
  return {
    user: { user_id: 'uid-123' },
    params: {},
    body: {},
    query: {},
    ...overrides,
  };
}

function mockRes() {
  const res = {};
  res.status = jest.fn().mockReturnValue(res);
  res.json = jest.fn().mockReturnValue(res);
  res.end = jest.fn().mockReturnValue(res);
  return res;
}

// A student whose weekly availability covers the fixture course's Monday slot
const mockStudentUser = { id: 7, role: 'STUDENT' };

const mockCourse = (overrides = {}) => ({
  id: 1,
  courseCode: 'COMS1015',
  courseName: 'Basic Computer Organisation I',
  minimumMark: 65,
  tutorsRequired: 2,
  acceptingApplications: true,
  createdAt: new Date('2026-10-01T00:00:00.000Z'),
  user: { firstName: 'Lecturer', lastName: 'One' },
  slots: [{ dayOfWeek: 1, timeSlotId: 11, timeSlot: { startMinute: 480, endMinute: 525 } }],
  _count: { assignments: 1 },
  ...overrides,
});

// Points every prisma read used by the applicant endpoints at happy-path data
function mockApplicantQueries() {
  prisma.user.findUnique.mockResolvedValue(mockStudentUser);
  prisma.availability.findMany.mockResolvedValue([{ dayOfWeek: 1, timeSlotId: 11 }]);
  prisma.application.findMany.mockResolvedValue([]);
  prisma.systemSetting.findUnique.mockResolvedValue(null); // no organiser hours cap
  prisma.tutorAssignment.findMany.mockResolvedValue([]); // no assigned courses yet
  prisma.transcript.findUnique.mockResolvedValue({
    id: 3,
    userId: 7,
    fileName: 'transcript.pdf',
    studentNumber: '2898909',
    coursesJson: JSON.stringify([
      { courseCode: 'COMS1015A', courseName: 'Basic Computer Organisation I', mark: 66 },
      { courseCode: 'COMS2014A', courseName: 'Computer Networks II', mark: 56 },
    ]),
    parsedAt: new Date('2026-10-10T00:00:00.000Z'),
  });
}

beforeEach(() => {
  jest.clearAllMocks();
});

describe('getOpportunities transcript qualification', () => {
  test('annotates each opportunity with the verified transcript mark and qualification', async () => {
    mockApplicantQueries();
    prisma.course.findMany.mockResolvedValue([
      mockCourse(),
      mockCourse({ id: 2, courseCode: 'COMS2014', courseName: 'Computer Networks II', minimumMark: 70 }),
    ]);

    const res = mockRes();
    await getOpportunities(mockReq(), res, jest.fn());
    await flushMicrotasks();

    expect(res.status).toHaveBeenCalledWith(200);
    const [payload] = res.json.mock.calls[0];
    expect(payload[0].courseCode).toBe('COMS1015');
    expect(payload[0].transcriptMark).toBe(66);
    expect(payload[0].qualified).toBe(true);
    expect(payload[1].courseCode).toBe('COMS2014');
    expect(payload[1].transcriptMark).toBe(56);
    expect(payload[1].qualified).toBe(false);
  });

  test('reports no qualification when no transcript has been uploaded', async () => {
    mockApplicantQueries();
    prisma.transcript.findUnique.mockResolvedValue(null);
    prisma.course.findMany.mockResolvedValue([mockCourse()]);

    const res = mockRes();
    await getOpportunities(mockReq(), res, jest.fn());
    await flushMicrotasks();

    expect(res.status).toHaveBeenCalledWith(200);
    const [payload] = res.json.mock.calls[0];
    expect(payload[0].transcriptMark).toBeNull();
    expect(payload[0].qualified).toBeNull();
  });

  test('qualifiedOnly=true narrows the list to courses the transcript marks qualify for', async () => {
    mockApplicantQueries();
    prisma.course.findMany.mockResolvedValue([
      mockCourse(),
      mockCourse({ id: 2, courseCode: 'COMS2014', courseName: 'Computer Networks II', minimumMark: 70 }),
    ]);

    const res = mockRes();
    await getOpportunities(mockReq({ query: { qualifiedOnly: 'true' } }), res, jest.fn());
    await flushMicrotasks();

    const [payload] = res.json.mock.calls[0];
    expect(payload).toHaveLength(1);
    expect(payload[0].courseCode).toBe('COMS1015');
  });

  test('qualifiedOnly=true without a transcript still returns every opportunity', async () => {
    mockApplicantQueries();
    prisma.transcript.findUnique.mockResolvedValue(null);
    prisma.course.findMany.mockResolvedValue([mockCourse()]);

    const res = mockRes();
    await getOpportunities(mockReq({ query: { qualifiedOnly: 'true' } }), res, jest.fn());
    await flushMicrotasks();

    const [payload] = res.json.mock.calls[0];
    expect(payload).toHaveLength(1);
  });
});

describe('getOpportunity transcript payload', () => {
  test('includes the verified mark and qualification for the course', async () => {
    mockApplicantQueries();
    prisma.course.findUnique.mockResolvedValue(mockCourse());

    const res = mockRes();
    await getOpportunity(mockReq({ params: { courseId: '1' } }), res, jest.fn());
    await flushMicrotasks();

    expect(res.status).toHaveBeenCalledWith(200);
    const [payload] = res.json.mock.calls[0];
    expect(payload.transcriptMark).toBe(66);
    expect(payload.qualified).toBe(true);
  });
});

describe('createApplication with a verified transcript', () => {
  function mockApplyCourse(courseOverrides = {}) {
    mockApplicantQueries();
    prisma.course.findUnique.mockResolvedValue(
      mockCourse({ slots: mockCourse().slots, ...courseOverrides })
    );
    prisma.application.findFirst.mockResolvedValue(null);
    prisma.systemSetting.findUnique.mockResolvedValue(null);
    prisma.tutorAssignment.findMany.mockResolvedValue([]);
  }

  test('the verified transcript mark replaces a higher self-declared mark', async () => {
    mockApplyCourse();
    prisma.application.create.mockResolvedValue({
      id: 50,
      courseId: 1,
      courseMark: 66,
      status: 'PENDING',
      appliedAt: new Date('2026-10-11T00:00:00.000Z'),
    });

    const res = mockRes();
    await createApplication(mockReq({ params: { courseId: '1' }, body: { courseMark: 90 } }), res, jest.fn());
    await flushMicrotasks();

    expect(res.status).toHaveBeenCalledWith(201);
    expect(prisma.application.create).toHaveBeenCalledWith({
      data: { userId: 7, courseId: 1, courseMark: 66 },
    });
    const [payload] = res.json.mock.calls[0];
    expect(payload.courseMark).toBe(66);
    expect(payload.markVerified).toBe(true);
  });

  test('rejects with the verified mark when it is below the minimum', async () => {
    mockApplyCourse({ id: 2, courseCode: 'COMS2014', minimumMark: 70 });
    const next = jest.fn();

    await createApplication(mockReq({ params: { courseId: '2' }, body: { courseMark: 90 } }), mockRes(), next);
    await flushMicrotasks();

    expect(next).toHaveBeenCalledTimes(1);
    const [error] = next.mock.calls[0];
    expect(error.statusCode).toBe(403);
    expect(error.message).toContain('verified transcript mark (56)');
    expect(prisma.application.create).not.toHaveBeenCalled();
  });

  test('uses the self-declared mark when the transcript does not cover the course', async () => {
    mockApplyCourse({ id: 3, courseCode: 'MATH2002' });
    prisma.application.create.mockResolvedValue({
      id: 51,
      courseId: 3,
      courseMark: 75,
      status: 'PENDING',
      appliedAt: new Date('2026-10-11T00:00:00.000Z'),
    });

    const res = mockRes();
    await createApplication(mockReq({ params: { courseId: '3' }, body: { courseMark: 75 } }), res, jest.fn());
    await flushMicrotasks();

    expect(res.status).toHaveBeenCalledWith(201);
    expect(prisma.application.create).toHaveBeenCalledWith({
      data: { userId: 7, courseId: 3, courseMark: 75 },
    });
    const [payload] = res.json.mock.calls[0];
    expect(payload.markVerified).toBe(false);
  });
});

describe('uploadTranscript', () => {
  const mockFile = { path: 'uploads/Academic_Transcript-123.pdf', filename: 'Academic_Transcript-123.pdf' };

  test('parses the PDF, stores the marks and returns them', async () => {
    mockApplicantQueries();
    parseTranscriptPdf.mockResolvedValue({
      courses: [{ courseCode: 'COMS1015A', courseName: 'Basic Computer Organisation I', mark: 66 }],
      studentNumber: '2898909',
    });
    prisma.transcript.findUnique.mockResolvedValue(null);
    prisma.transcript.upsert.mockResolvedValue({
      id: 9,
      fileName: mockFile.filename,
      studentNumber: '2898909',
      parsedAt: new Date('2026-10-11T00:00:00.000Z'),
    });

    const res = mockRes();
    await uploadTranscript(mockReq({ file: mockFile }), res, jest.fn());
    await flushMicrotasks();

    expect(parseTranscriptPdf).toHaveBeenCalledWith(expect.any(Buffer));
    expect(prisma.transcript.upsert).toHaveBeenCalledWith(
      expect.objectContaining({ where: { userId: 7 } })
    );
    expect(res.status).toHaveBeenCalledWith(201);
    const [payload] = res.json.mock.calls[0];
    expect(payload.courses).toHaveLength(1);
    expect(payload.studentNumber).toBe('2898909');
  });

  test('deletes the previous transcript file when replacing it', async () => {
    mockApplicantQueries();
    parseTranscriptPdf.mockResolvedValue({
      courses: [{ courseCode: 'COMS1015A', courseName: 'Basic Computer Organisation I', mark: 66 }],
      studentNumber: '2898909',
    });
    prisma.transcript.findUnique.mockResolvedValue({ fileName: 'old-transcript.pdf' });
    prisma.transcript.upsert.mockResolvedValue({ id: 9, fileName: mockFile.filename, studentNumber: null });

    await uploadTranscript(mockReq({ file: mockFile }), mockRes(), jest.fn());
    await flushMicrotasks();

    expect(fs.unlinkSync).toHaveBeenCalledWith(expect.stringContaining('old-transcript.pdf'));
  });

  test('rejects the upload when no file was provided', async () => {
    mockApplicantQueries();
    const next = jest.fn();

    await uploadTranscript(mockReq(), mockRes(), next);
    await flushMicrotasks();

    expect(next).toHaveBeenCalledTimes(1);
    const [error] = next.mock.calls[0];
    expect(error.statusCode).toBe(400);
    expect(error.message).toBe('No PDF file was provided');
  });

  test('rejects an unreadable PDF and removes the stored file', async () => {
    mockApplicantQueries();
    parseTranscriptPdf.mockRejectedValue(new Error('Invalid PDF'));
    const next = jest.fn();

    await uploadTranscript(mockReq({ file: mockFile }), mockRes(), next);
    await flushMicrotasks();

    expect(next).toHaveBeenCalledTimes(1);
    const [error] = next.mock.calls[0];
    expect(error.statusCode).toBe(400);
    expect(fs.unlink).toHaveBeenCalledWith(mockFile.path, expect.any(Function));
  });

  test('rejects a PDF with no readable course marks and removes the stored file', async () => {
    mockApplicantQueries();
    parseTranscriptPdf.mockResolvedValue({ courses: [], studentNumber: null });
    const next = jest.fn();

    await uploadTranscript(mockReq({ file: mockFile }), mockRes(), next);
    await flushMicrotasks();

    expect(next).toHaveBeenCalledTimes(1);
    const [error] = next.mock.calls[0];
    expect(error.statusCode).toBe(400);
    expect(error.message).toContain('No completed courses');
    expect(fs.unlink).toHaveBeenCalledWith(mockFile.path, expect.any(Function));
  });

  test('only students and tutors can upload a transcript', async () => {
    prisma.user.findUnique.mockResolvedValue({ id: 7, role: 'LECTURER' });
    const next = jest.fn();

    await uploadTranscript(mockReq({ file: mockFile }), mockRes(), next);
    await flushMicrotasks();

    const [error] = next.mock.calls[0];
    expect(error.statusCode).toBe(403);
  });
});

describe('getMyTranscript', () => {
  test('returns the stored transcript courses', async () => {
    mockApplicantQueries();

    const res = mockRes();
    await getMyTranscript(mockReq(), res, jest.fn());
    await flushMicrotasks();

    expect(res.status).toHaveBeenCalledWith(200);
    const [payload] = res.json.mock.calls[0];
    expect(payload.fileName).toBe('transcript.pdf');
    expect(payload.studentNumber).toBe('2898909');
    expect(payload.courses).toHaveLength(2);
    expect(payload.courses[0]).toEqual({
      courseCode: 'COMS1015A',
      courseName: 'Basic Computer Organisation I',
      mark: 66,
    });
  });

  test('returns 404 when no transcript has been uploaded', async () => {
    mockApplicantQueries();
    prisma.transcript.findUnique.mockResolvedValue(null);
    const next = jest.fn();

    await getMyTranscript(mockReq(), mockRes(), next);
    await flushMicrotasks();

    const [error] = next.mock.calls[0];
    expect(error.statusCode).toBe(404);
  });
});
