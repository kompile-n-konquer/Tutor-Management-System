const { extractAvailabilityFromPdf, parseAvailabilityFromTextItems } = require('../utils/timetablePdf');

// System time slots mirroring the seed data (Mon-Fri, 08:00-17:00 range)
const TIME_SLOTS = [
  { id: 1, startMinute: 480, endMinute: 525 }, // 08:00-08:45
  { id: 2, startMinute: 540, endMinute: 585 }, // 09:00-09:45
  { id: 3, startMinute: 615, endMinute: 660 }, // 10:15-11:00
];

// Builds positioned text items for a grid PDF: day headers along the top, a
// time-label column on the left, and optional "class" text in busy cells.
// `busy` keys are "<rowIndex>-<dayIndex>". Like the real Wits export, class
// text sits on its own line slightly above the period label's baseline.
const buildGridItems = ({ rows, header = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri'], busy = {}, startX = 100, dayGap = 90, startY = 320, rowGap = 40 }) => {
  const items = [];
  header.forEach((day, dayIndex) => {
    items.push({ str: day, x: startX + dayIndex * dayGap, y: startY + 40, width: day.length * 7, height: 12 });
  });
  rows.forEach((label, rowIndex) => {
    items.push({ str: label, x: 20, y: startY - rowIndex * rowGap, width: 53, height: 10 });
  });
  Object.entries(busy).forEach(([key, text]) => {
    const [rowIndex, dayIndex] = key.split('-').map(Number);
    items.push({ str: text, x: startX + dayIndex * dayGap + 5, y: startY - rowIndex * rowGap + 8, width: 30, height: 10 });
  });
  return items;
};

const slotKeys = (result) =>
  result.slots.map((slot) => `${slot.dayOfWeek}-${slot.timeSlotId}`).sort();

describe('timetable PDF extraction', () => {
  test('extracts the empty cells as available slots and skips the busy ones', () => {
    const items = buildGridItems({
      rows: ['08:00-08:45', '09:00-09:45', '10:15-11:00'],
      busy: { '0-0': 'CS301', '1-2': 'CS450', '2-4': 'Lab' },
    });

    const result = parseAvailabilityFromTextItems(items, TIME_SLOTS);

    expect(result.warnings).toEqual([]);
    expect(slotKeys(result)).toEqual([
      '0-2',
      '0-3',
      '1-1',
      '1-2',
      '1-3',
      '2-1',
      '2-3',
      '3-1',
      '3-2',
      '3-3',
      '4-1',
      '4-2',
    ]);
    expect(result.cells).toHaveLength(15);
  });

  test('recognises full day names and tolerates spaces around the dash', () => {
    const items = buildGridItems({
      rows: ['08:00 - 08:45', '09:00 \u2013 09:45'],
      header: ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday'],
      busy: { '0-1': 'Tut' },
    });

    const result = parseAvailabilityFromTextItems(items, TIME_SLOTS);

    expect(result.warnings).toEqual([]);
    expect(slotKeys(result)).toEqual(['0-1', '0-2', '1-2', '2-1', '2-2', '3-1', '3-2', '4-1', '4-2']);
  });

  test('splits day headers emitted as one text item per line', () => {
    const items = buildGridItems({
      rows: ['08:00-08:45'],
      header: [],
    });
    items.push({ str: 'Mon Tue Wed Thu Fri', x: 100, y: 360, width: 430, height: 12 });

    const result = parseAvailabilityFromTextItems(items, TIME_SLOTS);

    expect(result.warnings).toEqual([]);
    expect(result.slots).toHaveLength(5);
  });

  test('treats multi-line cell content as busy', () => {
    const items = buildGridItems({
      rows: ['08:00-08:45'],
      busy: { '0-0': 'CS301' },
    });
    // A second line under the class code stays inside the same row band
    items.push({ str: 'Venue 101', x: 105, y: 312, width: 40, height: 10 });

    const result = parseAvailabilityFromTextItems(items, TIME_SLOTS);

    expect(slotKeys(result)).toEqual(['1-1', '2-1', '3-1', '4-1']);
  });

  test('matches a time label within the minute tolerance', () => {
    const items = buildGridItems({ rows: ['08:01-08:44'] });

    const result = parseAvailabilityFromTextItems(items, TIME_SLOTS);

    expect(result.slots).toHaveLength(5);
    expect(result.slots.every((slot) => slot.timeSlotId === 1)).toBe(true);
  });

  test('ignores time ranges that are not system time slots', () => {
    const items = buildGridItems({ rows: ['08:00-08:45', '12:00-13:00'] });

    const result = parseAvailabilityFromTextItems(items, TIME_SLOTS);

    expect(slotKeys(result)).toEqual(['0-1', '1-1', '2-1', '3-1', '4-1']);
  });

  test('never emits the same time slot row twice', () => {
    const items = buildGridItems({ rows: ['08:00-08:45'] });
    items.push({ str: '08:00-08:45', x: 20, y: 250, width: 53, height: 10 });

    const result = parseAvailabilityFromTextItems(items, TIME_SLOTS);

    expect(result.slots).toHaveLength(5);
  });

  test('parses the official Wits export: colon typos, BREAK/LUNCH rows ignored', () => {
    const slots = [
      { id: 1, startMinute: 480, endMinute: 525 }, // 08:00-08:45
      { id: 2, startMinute: 540, endMinute: 585 }, // 09:00-09:45
      { id: 3, startMinute: 615, endMinute: 660 }, // 10:15-11:00
      { id: 5, startMinute: 750, endMinute: 795 }, // 12:30-13:15
      { id: 6, startMinute: 855, endMinute: 900 }, // 14:15-15:00
    ];
    // Mirrors the real export: two period labels use a colon instead of a
    // dash, the 09:45-10:15 and 12:00-12:30 BREAK rows are not system slots,
    // and BREAK/LUNCH side text shares the label line it must not pollute.
    const items = [
      ...buildGridItems({
        rows: ['8:00: 8:45', '9:00-9:45', '9:45-10:15', '10:15-11:00', '12:30-13:15', '14:15:15:00'],
        busy: { '0-2': 'COMS3005A(SM2) - C' },
      }),
      { str: 'BREAK', x: 195, y: 240, width: 32, height: 10 },  // on the 09:45-10:15 line
      { str: 'BREAK', x: 195, y: 160, width: 32, height: 10 },  // on the 12:30-13:15 line
      { str: 'LUNCH', x: 195, y: 120, width: 34, height: 10 },  // on the 14:15:15:00 line
    ];

    const result = parseAvailabilityFromTextItems(items, slots);

    expect(result.warnings).toEqual([]);
    // 5 matched periods x 5 days = 25 cells, minus the one busy class.
    expect(result.slots).toHaveLength(24);
    expect(result.cells.some((cell) => /BREAK|LUNCH/i.test(cell.text))).toBe(false);
    expect(result.cells.filter((cell) => cell.text)).toEqual([
      { dayOfWeek: 2, timeSlotId: 1, text: 'COMS3005A(SM2) - C' },
    ]);
  });

  test('warns when the PDF has no readable text', () => {
    const result = parseAvailabilityFromTextItems([], TIME_SLOTS);

    expect(result.slots).toEqual([]);
    expect(result.warnings[0]).toMatch(/scanned image/i);
  });

  test('warns when no day columns can be found', () => {
    const items = buildGridItems({ rows: ['08:00-08:45'], header: [] });

    const result = parseAvailabilityFromTextItems(items, TIME_SLOTS);

    expect(result.slots).toEqual([]);
    expect(result.warnings[0]).toMatch(/day columns/i);
  });

  test('warns when no time range matches the system time slots', () => {
    const items = buildGridItems({ rows: ['18:00-19:00'] });

    const result = parseAvailabilityFromTextItems(items, TIME_SLOTS);

    expect(result.slots).toEqual([]);
    expect(result.warnings[0]).toMatch(/time ranges/i);
  });

  test('extractAvailabilityFromPdf feeds the reader output through the parser', async () => {
    const items = buildGridItems({ rows: ['08:00-08:45'], busy: { '0-0': 'CS301' } });
    const reader = { readTextItems: jest.fn().mockResolvedValue(items) };

    const result = await extractAvailabilityFromPdf(Buffer.from('pdf'), TIME_SLOTS, reader);

    expect(reader.readTextItems).toHaveBeenCalledWith(Buffer.from('pdf'));
    expect(slotKeys(result)).toEqual(['1-1', '2-1', '3-1', '4-1']);
  });
});
