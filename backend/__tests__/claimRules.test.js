const {
  slotHours,
  timesTotalHours,
  monthsBefore,
  findExcessiveWindow,
  dayOfWeekFor,
  deriveEventEntry,
} = require('../utils/claimRules');

describe('slotHours (round-up rule)', () => {
  test('a 45-minute slot counts as one hour', () => {
    expect(slotHours(855, 900)).toBe(1); // 14:15-15:00
  });

  test('two 45-minute slots are two hours, not 1.5', () => {
    expect(
      timesTotalHours([
        { startMinute: 855, endMinute: 900 }, // 14:15-15:00
        { startMinute: 915, endMinute: 960 }, // 15:15-16:00
      ])
    ).toBe(2);
  });

  test('a 90-minute slot rounds up to two hours', () => {
    expect(slotHours(540, 630)).toBe(2); // 09:00-10:30
  });
});

describe('monthsBefore', () => {
  test('subtracts calendar months in UTC', () => {
    const from = new Date('2026-09-12T00:00:00.000Z');
    expect(monthsBefore(from, 3).toISOString().split('T')[0]).toBe('2026-06-12');
  });

  test('does not mutate the original date', () => {
    const from = new Date('2026-09-12T00:00:00.000Z');
    monthsBefore(from, 3);
    expect(from.toISOString().split('T')[0]).toBe('2026-09-12');
  });
});

describe('findExcessiveWindow (a month is 30-31 days)', () => {
  const entry = (date, hours) => ({ workDate: date, duration: hours });

  test('totals above the cap are fine when every 31-day window fits', () => {
    // Three 10-hour entries, more than a month apart: 30 total hours is above
    // the 20-hour cap but no 31-day window holds more than 10
    const entries = [
      entry('2026-07-01', 10),
      entry('2026-08-02', 10),
      entry('2026-09-03', 10),
    ];
    expect(findExcessiveWindow(entries, 20)).toBeNull();
  });

  test('entries squeezed inside one 31-day window above the cap are blocked', () => {
    // 07-01 + 30 days = 07-31, so all three entries fall in the window anchored
    // at the first one: 30 hours against a cap of 20
    const entries = [
      entry('2026-07-01', 10),
      entry('2026-07-15', 10),
      entry('2026-07-31', 10),
    ];
    const excessive = findExcessiveWindow(entries, 20);
    expect(excessive).not.toBeNull();
    expect(excessive.hours).toBe(30);
    expect(excessive.start.toISOString().split('T')[0]).toBe('2026-07-01');
    expect(excessive.end.toISOString().split('T')[0]).toBe('2026-07-31');
  });

  test('hours exactly at the cap are allowed', () => {
    const entries = [entry('2026-07-01', 10), entry('2026-07-31', 10)];
    expect(findExcessiveWindow(entries, 20)).toBeNull();
  });

  test('returns null for an empty timesheet', () => {
    expect(findExcessiveWindow([], 20)).toBeNull();
  });
});

describe('dayOfWeekFor', () => {
  test('maps Monday to 0 and Saturday to null', () => {
    expect(dayOfWeekFor(new Date('2026-09-14T00:00:00.000Z'))).toBe(0);
    expect(dayOfWeekFor(new Date('2026-09-12T00:00:00.000Z'))).toBeNull();
  });
});

describe('deriveEventEntry', () => {
  const slot = (dayOfWeek, startMinute, endMinute) => ({
    dayOfWeek,
    timeSlot: { startMinute, endMinute },
  });

  test('derives every entry field from the event', () => {
    const event = {
      id: 3,
      courseId: 11,
      date: new Date('2026-09-14T00:00:00.000Z'), // a Monday
      description: 'tutoring',
      course: {
        userId: 7,
        slots: [slot(0, 855, 900), slot(0, 915, 960), slot(2, 540, 585)],
      },
    };
    expect(deriveEventEntry(event)).toEqual({
      eventId: 3,
      courseId: 11,
      supervisorId: 7,
      workDate: event.date,
      duration: 2, // two 45-minute Monday slots, rounded up per slot
      description: 'tutoring',
    });
  });

  test('returns null when the weekday no longer has slots', () => {
    const event = {
      id: 3,
      courseId: 11,
      date: new Date('2026-09-14T00:00:00.000Z'),
      description: 'tutoring',
      course: { userId: 7, slots: [slot(2, 540, 585)] },
    };
    expect(deriveEventEntry(event)).toBeNull();
  });
});
