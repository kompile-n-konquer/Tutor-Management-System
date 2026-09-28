const { getAvailability, updateAvailability } = require('../controllers/availability');
const prisma = require('../prisma/client');
const getLockedSlots = require('../utils/availabilityLocks');

jest.mock('../prisma/client', () => ({
  user: { findUnique: jest.fn() },
  timeSlot: { findMany: jest.fn() },
  availability: { findMany: jest.fn(), deleteMany: jest.fn(), createMany: jest.fn() },
  $transaction: jest.fn(),
}));
// Slots locked by a submitted application — mocked so tests control them per case.
jest.mock('../utils/availabilityLocks', () => jest.fn());

describe('availability controller', () => {
  let req, res, next;

  beforeEach(() => {
    jest.clearAllMocks();
    req = { body: {}, user: { user_id: 'firebase-uid-1' } };
    res = { json: jest.fn(), status: jest.fn().mockReturnThis() };
    next = jest.fn();

    prisma.user.findUnique.mockResolvedValue({ id: 7, firebaseUid: 'firebase-uid-1' });
    prisma.timeSlot.findMany.mockResolvedValue([
      { id: 1, startMinute: 480, endMinute: 525 },
      { id: 2, startMinute: 540, endMinute: 585 },
    ]);
    getLockedSlots.mockResolvedValue([]);
  });

  describe('getAvailability', () => {
    test('returns the time-slot catalogue, the users availability entries and locked slots', async () => {
      const timeSlots = [{ id: 1, startMinute: 480, endMinute: 525 }];
      const availability = [{ dayOfWeek: 1, timeSlotId: 1 }];
      const lockedSlots = [{ dayOfWeek: 2, timeSlotId: 2 }];
      prisma.timeSlot.findMany.mockResolvedValue(timeSlots);
      prisma.availability.findMany.mockResolvedValue(availability);
      getLockedSlots.mockResolvedValue(lockedSlots);

      await getAvailability(req, res, next);

      expect(prisma.availability.findMany).toHaveBeenCalledWith({
        where: { userId: 7 },
        select: { dayOfWeek: true, timeSlotId: true },
      });
      expect(getLockedSlots).toHaveBeenCalledWith(7);
      expect(res.status).toHaveBeenCalledWith(200);
      expect(res.json).toHaveBeenCalledWith({ timeSlots, availability, lockedSlots });
      expect(next).not.toHaveBeenCalled();
    });

    test('404s when the requesting user does not exist', async () => {
      prisma.user.findUnique.mockResolvedValue(null);

      await getAvailability(req, res, next);

      expect(next.mock.calls[0][0].statusCode).toBe(404);
      expect(next.mock.calls[0][0].message).toBe('User not found. Please check if the user exists');
    });
  });

  describe('updateAvailability', () => {
    test('replaces the users availability in a single transaction', async () => {
      const entries = [
        { dayOfWeek: 0, timeSlotId: 1 },
        { dayOfWeek: 2, timeSlotId: 2 },
      ];
      req.body = { availability: entries };
      prisma.availability.deleteMany.mockResolvedValue({ count: 1 });
      prisma.availability.createMany.mockResolvedValue({ count: 2 });
      const saved = entries.map((entry) => ({ ...entry }));
      prisma.availability.findMany.mockResolvedValue(saved);

      await updateAvailability(req, res, next);

      // Replace strategy: every existing entry is deleted before the new set is created.
      expect(prisma.availability.deleteMany).toHaveBeenCalledWith({ where: { userId: 7 } });
      expect(prisma.availability.createMany).toHaveBeenCalledWith({
        data: entries.map((entry) => ({ ...entry, userId: 7 })),
      });
      expect(prisma.$transaction).toHaveBeenCalledTimes(1);
      expect(prisma.$transaction.mock.calls[0][0]).toHaveLength(2);
      expect(res.status).toHaveBeenCalledWith(200);
      expect(res.json).toHaveBeenCalledWith(saved);
      expect(next).not.toHaveBeenCalled();
    });

    test('404s when the requesting user does not exist', async () => {
      prisma.user.findUnique.mockResolvedValue(null);
      req.body = { availability: [] };

      await updateAvailability(req, res, next);

      expect(next.mock.calls[0][0].statusCode).toBe(404);
    });

    test('400s when availability is not an array', async () => {
      req.body = { availability: 'monday-morning' };

      await updateAvailability(req, res, next);

      expect(next.mock.calls[0][0].statusCode).toBe(400);
      expect(next.mock.calls[0][0].message).toBe(
        'availability must be an array of { dayOfWeek, timeSlotId } entries',
      );
    });

    test('400s on an out-of-range dayOfWeek', async () => {
      req.body = { availability: [{ dayOfWeek: 9, timeSlotId: 1 }] };

      await updateAvailability(req, res, next);

      expect(next.mock.calls[0][0].statusCode).toBe(400);
      expect(next.mock.calls[0][0].message).toBe(
        'Invalid availability entry. Each entry needs a valid dayOfWeek (0-4) and timeSlotId',
      );
    });

    test('400s on an unknown timeSlotId', async () => {
      req.body = { availability: [{ dayOfWeek: 1, timeSlotId: 999 }] };

      await updateAvailability(req, res, next);

      expect(next.mock.calls[0][0].statusCode).toBe(400);
    });

    test('400s on a null entry', async () => {
      req.body = { availability: [null] };

      await updateAvailability(req, res, next);

      expect(next.mock.calls[0][0].statusCode).toBe(400);
    });

    test('validates every entry before writing anything to the database', async () => {
      req.body = {
        availability: [{ dayOfWeek: 1, timeSlotId: 1 }, { dayOfWeek: 1, timeSlotId: 999 }],
      };

      await updateAvailability(req, res, next);

      expect(next).toHaveBeenCalledTimes(1);
      expect(prisma.availability.deleteMany).not.toHaveBeenCalled();
      expect(prisma.availability.createMany).not.toHaveBeenCalled();
      expect(prisma.$transaction).not.toHaveBeenCalled();
    });

    test('400s when the submitted set drops a slot locked by a submitted application', async () => {
      getLockedSlots.mockResolvedValue([{ dayOfWeek: 2, timeSlotId: 2 }]);
      req.body = { availability: [{ dayOfWeek: 0, timeSlotId: 1 }] };

      await updateAvailability(req, res, next);

      expect(next).toHaveBeenCalledTimes(1);
      expect(next.mock.calls[0][0].statusCode).toBe(400);
      expect(next.mock.calls[0][0].message).toBe(
        'Availability for slots locked by a submitted application cannot be removed. Keep the locked slots selected.'
      );
      expect(prisma.$transaction).not.toHaveBeenCalled();
    });

    test('keeps locked slots that are still selected', async () => {
      getLockedSlots.mockResolvedValue([{ dayOfWeek: 2, timeSlotId: 2 }]);
      req.body = { availability: [{ dayOfWeek: 2, timeSlotId: 2 }] };
      prisma.availability.findMany.mockResolvedValue([{ dayOfWeek: 2, timeSlotId: 2 }]);

      await updateAvailability(req, res, next);

      expect(prisma.$transaction).toHaveBeenCalledTimes(1);
      expect(res.status).toHaveBeenCalledWith(200);
      expect(next).not.toHaveBeenCalled();
    });
  });
});
