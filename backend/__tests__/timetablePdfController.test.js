const {
  getTimetablePdf,
  uploadTimetablePdf,
  downloadTimetablePdf,
  deleteTimetablePdf,
  timetableUploadError,
} = require('../controllers/timetablePdf');
const prisma = require('../prisma/client');
const fsp = require('fs/promises');
const fs = require('fs');
const { extractAvailabilityFromPdf } = require('../utils/timetablePdf');

jest.mock('../prisma/client', () => ({
  user: { findUnique: jest.fn() },
  timeSlot: { findMany: jest.fn() },
  timetablePdf: { findUnique: jest.fn(), upsert: jest.fn(), delete: jest.fn() },
}));
jest.mock('fs', () => ({ existsSync: jest.fn() }));
jest.mock('fs/promises', () => ({ readFile: jest.fn(), unlink: jest.fn() }));
jest.mock('../utils/timetablePdf', () => ({ extractAvailabilityFromPdf: jest.fn() }));

describe('timetable PDF controller', () => {
  let req, res, next;

  beforeEach(() => {
    jest.clearAllMocks();
    req = { body: {}, user: { user_id: 'firebase-uid-1' } };
    res = { json: jest.fn(), status: jest.fn().mockReturnThis(), download: jest.fn() };
    next = jest.fn();

    prisma.user.findUnique.mockResolvedValue({ id: 7, firebaseUid: 'firebase-uid-1' });
    prisma.timeSlot.findMany.mockResolvedValue([{ id: 1, startMinute: 480, endMinute: 525 }]);
    extractAvailabilityFromPdf.mockResolvedValue({
      slots: [{ dayOfWeek: 0, timeSlotId: 1 }],
      cells: [{ dayOfWeek: 0, timeSlotId: 1, text: 'CS301' }],
      warnings: [],
    });
    fs.existsSync.mockReturnValue(true);
  });

  const storedRow = () => ({
    filename: 'old-timetable.pdf',
    originalName: 'timetable.pdf',
    sizeBytes: 1234,
    uploadedAt: new Date('2026-10-01T10:00:00Z'),
    extractedSlots: '[{"dayOfWeek":0,"timeSlotId":1}]',
  });

  describe('getTimetablePdf', () => {
    test('returns the stored metadata with the parsed extraction', async () => {
      prisma.timetablePdf.findUnique.mockResolvedValue(storedRow());

      await getTimetablePdf(req, res, next);

      expect(prisma.timetablePdf.findUnique).toHaveBeenCalledWith({ where: { userId: 7 } });
      expect(res.status).toHaveBeenCalledWith(200);
      expect(res.json).toHaveBeenCalledWith({
        timetablePdf: {
          filename: 'old-timetable.pdf',
          originalName: 'timetable.pdf',
          sizeBytes: 1234,
          uploadedAt: new Date('2026-10-01T10:00:00Z'),
          extractedSlots: [{ dayOfWeek: 0, timeSlotId: 1 }],
        },
      });
      expect(next).not.toHaveBeenCalled();
    });

    test('404s when nothing has been uploaded', async () => {
      prisma.timetablePdf.findUnique.mockResolvedValue(null);

      await getTimetablePdf(req, res, next);

      expect(next.mock.calls[0][0].statusCode).toBe(404);
    });

    test('serialises a row without stored extraction as an empty slot list', async () => {
      prisma.timetablePdf.findUnique.mockResolvedValue({ ...storedRow(), extractedSlots: null });

      await getTimetablePdf(req, res, next);

      expect(res.json.mock.calls[0][0].timetablePdf.extractedSlots).toEqual([]);
    });

    test('404s when the requesting user does not exist', async () => {
      prisma.user.findUnique.mockResolvedValue(null);

      await getTimetablePdf(req, res, next);

      expect(next.mock.calls[0][0].statusCode).toBe(404);
      expect(prisma.timetablePdf.findUnique).not.toHaveBeenCalled();
    });
  });

  describe('uploadTimetablePdf', () => {
    const uploadedFile = () => ({
      filename: 'new-timetable-123.pdf',
      originalname: 'my timetable.pdf',
      size: 4321,
      path: 'uploads/new-timetable-123.pdf',
    });

    test('parses the upload, replaces the old file and stores the extraction', async () => {
      req.file = uploadedFile();
      prisma.timetablePdf.findUnique.mockResolvedValue(storedRow());
      prisma.timetablePdf.upsert.mockResolvedValue({
        ...storedRow(),
        filename: 'new-timetable-123.pdf',
        originalName: 'my timetable.pdf',
        sizeBytes: 4321,
      });
      fsp.readFile.mockResolvedValue(Buffer.from('pdf-bytes'));

      await uploadTimetablePdf(req, res, next);

      expect(fsp.readFile).toHaveBeenCalledWith('uploads/new-timetable-123.pdf');
      expect(extractAvailabilityFromPdf).toHaveBeenCalledWith(Buffer.from('pdf-bytes'), [
        { id: 1, startMinute: 480, endMinute: 525 },
      ]);
      // The previous upload is removed from disk before the new row lands
      expect(fsp.unlink).toHaveBeenCalledWith(expect.stringContaining('old-timetable.pdf'));
      expect(prisma.timetablePdf.upsert).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { userId: 7 },
          update: expect.objectContaining({
            filename: 'new-timetable-123.pdf',
            originalName: 'my timetable.pdf',
            sizeBytes: 4321,
            extractedSlots: '[{"dayOfWeek":0,"timeSlotId":1}]',
          }),
        }),
      );
      expect(res.status).toHaveBeenCalledWith(200);
      expect(res.json.mock.calls[0][0].extractionMessage).toBe('Detected 1 available slot in your timetable.');
      expect(next).not.toHaveBeenCalled();
    });

    test('404s when the requesting user does not exist', async () => {
      prisma.user.findUnique.mockResolvedValue(null);

      await uploadTimetablePdf(req, res, next);

      expect(next.mock.calls[0][0].statusCode).toBe(404);
      expect(fsp.readFile).not.toHaveBeenCalled();
    });

    test('400s when no file was provided', async () => {
      await uploadTimetablePdf(req, res, next);

      expect(next.mock.calls[0][0].statusCode).toBe(400);
      expect(fsp.readFile).not.toHaveBeenCalled();
      expect(prisma.timetablePdf.upsert).not.toHaveBeenCalled();
    });

    test('400s and removes the new file when the PDF cannot be parsed', async () => {
      req.file = uploadedFile();
      fsp.readFile.mockResolvedValue(Buffer.from('not-a-pdf'));
      extractAvailabilityFromPdf.mockRejectedValue(new Error('bad pdf'));

      await uploadTimetablePdf(req, res, next);

      expect(next.mock.calls[0][0].statusCode).toBe(400);
      expect(next.mock.calls[0][0].message).toBe('The file could not be read as a PDF timetable');
      expect(fsp.unlink).toHaveBeenCalledWith(expect.stringContaining('new-timetable-123.pdf'));
      expect(prisma.timetablePdf.upsert).not.toHaveBeenCalled();
    });

    test('reports the extraction warnings when no slots match', async () => {
      req.file = uploadedFile();
      prisma.timetablePdf.findUnique.mockResolvedValue(null);
      prisma.timetablePdf.upsert.mockResolvedValue(storedRow());
      fsp.readFile.mockResolvedValue(Buffer.from('pdf-bytes'));
      extractAvailabilityFromPdf.mockResolvedValue({ slots: [], cells: [], warnings: ['Could not find the day columns (Mon-Fri) in the PDF.'] });

      await uploadTimetablePdf(req, res, next);

      expect(fsp.unlink).not.toHaveBeenCalled(); // no previous upload to remove
      expect(res.json.mock.calls[0][0].extractionMessage).toBe(
        'No available slots could be detected. Could not find the day columns (Mon-Fri) in the PDF.',
      );
    });

    test('falls back to a plain message when a grid was parsed but every cell is busy', async () => {
      req.file = uploadedFile();
      prisma.timetablePdf.findUnique.mockResolvedValue(null);
      prisma.timetablePdf.upsert.mockResolvedValue(storedRow());
      fsp.readFile.mockResolvedValue(Buffer.from('pdf-bytes'));
      extractAvailabilityFromPdf.mockResolvedValue({ slots: [], cells: [{ dayOfWeek: 0, timeSlotId: 1, text: 'CS301' }], warnings: [] });

      await uploadTimetablePdf(req, res, next);

      expect(res.json.mock.calls[0][0].extractionMessage).toBe('No available slots could be detected in this PDF.');
    });

    test('pluralises the detected-slot message', async () => {
      req.file = uploadedFile();
      prisma.timetablePdf.findUnique.mockResolvedValue(null);
      prisma.timetablePdf.upsert.mockResolvedValue(storedRow());
      fsp.readFile.mockResolvedValue(Buffer.from('pdf-bytes'));
      extractAvailabilityFromPdf.mockResolvedValue({
        slots: [{ dayOfWeek: 0, timeSlotId: 1 }, { dayOfWeek: 1, timeSlotId: 1 }],
        cells: [],
        warnings: [],
      });

      await uploadTimetablePdf(req, res, next);

      expect(res.json.mock.calls[0][0].extractionMessage).toBe('Detected 2 available slots in your timetable.');
    });
  });

  describe('downloadTimetablePdf', () => {
    test('streams the stored file under its original name', async () => {
      prisma.timetablePdf.findUnique.mockResolvedValue(storedRow());

      await downloadTimetablePdf(req, res, next);

      expect(res.download).toHaveBeenCalledWith(
        expect.stringContaining('old-timetable.pdf'),
        'timetable.pdf',
      );
      expect(next).not.toHaveBeenCalled();
    });

    test('404s when the requesting user does not exist', async () => {
      prisma.user.findUnique.mockResolvedValue(null);

      await downloadTimetablePdf(req, res, next);

      expect(next.mock.calls[0][0].statusCode).toBe(404);
      expect(res.download).not.toHaveBeenCalled();
    });

    test('404s when nothing has been uploaded', async () => {
      prisma.timetablePdf.findUnique.mockResolvedValue(null);

      await downloadTimetablePdf(req, res, next);

      expect(next.mock.calls[0][0].statusCode).toBe(404);
      expect(res.download).not.toHaveBeenCalled();
    });

    test('404s when the file is missing on disk', async () => {
      prisma.timetablePdf.findUnique.mockResolvedValue(storedRow());
      fs.existsSync.mockReturnValue(false);

      await downloadTimetablePdf(req, res, next);

      expect(next.mock.calls[0][0].statusCode).toBe(404);
      expect(res.download).not.toHaveBeenCalled();
    });
  });

  describe('deleteTimetablePdf', () => {
    test('removes the file and the stored row', async () => {
      prisma.timetablePdf.findUnique.mockResolvedValue(storedRow());

      await deleteTimetablePdf(req, res, next);

      expect(fsp.unlink).toHaveBeenCalledWith(expect.stringContaining('old-timetable.pdf'));
      expect(prisma.timetablePdf.delete).toHaveBeenCalledWith({ where: { userId: 7 } });
      expect(res.status).toHaveBeenCalledWith(200);
      expect(res.json).toHaveBeenCalledWith({ timetablePdf: null });
    });

    test('still deletes the stored row when the file is already gone from disk', async () => {
      prisma.timetablePdf.findUnique.mockResolvedValue(storedRow());
      fs.existsSync.mockReturnValue(false);

      await deleteTimetablePdf(req, res, next);

      expect(fsp.unlink).not.toHaveBeenCalled();
      expect(prisma.timetablePdf.delete).toHaveBeenCalledWith({ where: { userId: 7 } });
      expect(res.status).toHaveBeenCalledWith(200);
    });

    test('responds successfully even when there is nothing to remove', async () => {
      prisma.timetablePdf.findUnique.mockResolvedValue(null);

      await deleteTimetablePdf(req, res, next);

      expect(prisma.timetablePdf.delete).not.toHaveBeenCalled();
      expect(res.status).toHaveBeenCalledWith(200);
      expect(res.json).toHaveBeenCalledWith({ timetablePdf: null });
    });

    test('404s when the requesting user does not exist', async () => {
      prisma.user.findUnique.mockResolvedValue(null);

      await deleteTimetablePdf(req, res, next);

      expect(next.mock.calls[0][0].statusCode).toBe(404);
      expect(prisma.timetablePdf.delete).not.toHaveBeenCalled();
    });
  });

  describe('timetableUploadError middleware', () => {
    test('passes through when multer reported no error', () => {
      timetableUploadError(null, req, res, next);

      expect(next).toHaveBeenCalled();
      expect(res.status).not.toHaveBeenCalled();
    });

    test('413s with a friendly message when the PDF is over 500KB', () => {
      timetableUploadError({ code: 'LIMIT_FILE_SIZE' }, req, res, next);

      expect(res.status).toHaveBeenCalledWith(413);
      expect(res.json).toHaveBeenCalledWith({ message: 'The timetable PDF must be 500KB or smaller' });
    });

    test('400s with the multer message for other upload failures', () => {
      timetableUploadError(new Error('Only PDF files are allowed'), req, res, next);

      expect(res.status).toHaveBeenCalledWith(400);
      expect(res.json).toHaveBeenCalledWith({ message: 'Only PDF files are allowed' });
    });
  });
});
