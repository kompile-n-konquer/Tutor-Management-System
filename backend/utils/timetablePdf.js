// Extracts availability from an uploaded timetable PDF.
//
// The PDF is the official Wits weekly timetable export (verified against a
// real one): a label column of "HH:MM-HH:MM" period rows (some emitted with
// a colon instead of a dash, e.g. "8:00: 8:45"), a MONDAY-FRIDAY header row,
// and BREAK/LUNCH rows between the teaching periods. Rows are uniform, so a
// cell is matched purely by geometry and any cell left EMPTY is an available
// slot — text inside a cell (a class like "COMS3005A(SM2) - C", a venue)
// means the user is busy there.
//
// The grid math below is pure and unit-tested in __tests__/timetablePdf.test.js;
// reading the text items out of the PDF lives in pdfTextReader.js.

// Accepted day header tokens per dayOfWeek (0-4), matched case-insensitively —
// short and long forms, with the plural tolerated ("Mondays").
const DAY_TOKENS = [
  ['mon', 'monday'],
  ['tue', 'tues', 'tuesday'],
  ['wed', 'weds', 'wednesday'],
  ['thu', 'thur', 'thurs', 'thursday'],
  ['fri', 'friday'],
];

// Matches "08:00-08:45", "8:00 - 8:45", en/em-dashed variants and the two
// colon-typo rows the official Wits timetable export emits ("8:00: 8:45",
// "14:15:15:00")
const TIME_RANGE_REGEX = /(\d{1,2})[:.](\d{2})\s*[-\u2013\u2014:]\s*(\d{1,2})[:.](\d{2})/g;

// Items whose baselines differ by at most this many points sit on one line
const LINE_Y_TOLERANCE = 3;
// A PDF time label matches a system time slot within this many minutes
const MINUTE_TOLERANCE = 1;
// Fallback half-height for the first/last row band when only one row matched
const EDGE_BAND_HEIGHT = 10;

const toMinutes = (hours, minutes) => (Number(hours) % 24) * 60 + Number(minutes);

// Groups items into visual lines (chained on baseline gaps) sorted top-down
const groupIntoLines = (items) => {
  const sorted = [...items].sort((a, b) => b.y - a.y);
  const lines = [];
  let current = null;
  for (const item of sorted) {
    if (current && current.y - item.y <= LINE_Y_TOLERANCE) {
      current.items.push(item);
    } else {
      current = { y: item.y, items: [item] };
      lines.push(current);
    }
  }
  lines.forEach((line) => line.items.sort((a, b) => a.x - b.x));
  return lines;
};

// Estimates per-token x positions inside an item (some producers emit a whole
// line as one item, so day tokens must be split out with approximate centers)
const tokensFromItem = function* (item) {
  const text = item.str.trim();
  const regex = /\S+/g;
  let match;
  while ((match = regex.exec(text)) !== null) {
    const startFraction = match.index / text.length;
    const endFraction = (match.index + match[0].length) / text.length;
    const center = item.x + item.width * ((startFraction + endFraction) / 2);
    yield { token: match[0].toLowerCase().replace(/[^a-z]/g, ''), center };
  }
};

// Maps dayOfWeek -> header x center; first occurrence per day wins
const findDayColumns = (lines) => {
  const columns = {};
  for (const line of lines) {
    for (const item of line.items) {
      for (const { token, center } of tokensFromItem(item)) {
        const dayIndex = DAY_TOKENS.findIndex(
          (tokens) => tokens.includes(token) || tokens.includes(token.replace(/s$/, '')),
        );
        if (dayIndex !== -1 && columns[dayIndex] === undefined) {
          columns[dayIndex] = center;
        }
      }
    }
    if (Object.keys(columns).length === DAY_TOKENS.length) break;
  }
  return columns;
};

// Converts column centers into per-day { left, right } x ranges using the
// midpoints between adjacent headers (edge columns mirror their inner gap)
const columnRanges = (dayColumns) => {
  const byX = Object.keys(dayColumns).map(Number).sort((a, b) => dayColumns[a] - dayColumns[b]);
  const ranges = {};
  for (let i = 0; i < byX.length; i++) {
    const day = byX[i];
    const center = dayColumns[day];
    const leftNeighbor = i > 0 ? dayColumns[byX[i - 1]] : null;
    const rightNeighbor = i < byX.length - 1 ? dayColumns[byX[i + 1]] : null;
    const halfGap =
      leftNeighbor !== null && rightNeighbor !== null
        ? (rightNeighbor - leftNeighbor) / 4
        : leftNeighbor !== null
          ? (center - leftNeighbor) / 2
          : (rightNeighbor - center) / 2;
    ranges[day] = { left: center - halfGap, right: center + halfGap };
  }
  return ranges;
};

// Finds the time-label rows that match system time slots, top-down
const findTimeRows = (lines, timeSlots) => {
  const rows = [];
  for (const line of lines) {
    const text = line.items.map((item) => item.str).join(' ');
    TIME_RANGE_REGEX.lastIndex = 0;
    let match;
    while ((match = TIME_RANGE_REGEX.exec(text)) !== null) {
      const start = toMinutes(match[1], match[2]);
      const end = toMinutes(match[3], match[4]);
      const slot = timeSlots.find(
        (candidate) =>
          Math.abs(candidate.startMinute - start) <= MINUTE_TOLERANCE &&
          Math.abs(candidate.endMinute - end) <= MINUTE_TOLERANCE,
      );
      if (slot && !rows.some((row) => row.timeSlotId === slot.id)) {
        rows.push({ timeSlotId: slot.id, y: line.y });
      }
    }
  }
  return rows.sort((a, b) => b.y - a.y);
};

// Turns row baselines into [bottom, top] y bands via midpoints between rows.
// y grows upwards, so the row above always has the larger y.
const rowBands = (rows) =>
  rows.map((row, index) => {
    const above = rows[index - 1];
    const below = rows[index + 1];
    const halfGapUp = above ? (above.y - row.y) / 2 : below ? (row.y - below.y) / 2 : EDGE_BAND_HEIGHT;
    const halfGapDown = below ? (row.y - below.y) / 2 : halfGapUp;
    return { ...row, top: row.y + halfGapUp, bottom: row.y - halfGapDown };
  });

// Collects the text inside every (day column x row band) cell. Items left of
// the first day column are time labels; day headers sit above all row bands,
// so both are excluded by geometry rather than by tracking consumed items.
const buildCells = (lines, ranges, bands) => {
  const firstColumnLeft = Math.min(...Object.values(ranges).map((range) => range.left));
  const cells = [];
  for (const band of bands) {
    for (const dayKey of Object.keys(ranges)) {
      const range = ranges[dayKey];
      const contents = [];
      for (const line of lines) {
        for (const item of line.items) {
          const centerX = item.x + item.width / 2;
          if (centerX < firstColumnLeft || centerX < range.left || centerX >= range.right) continue;
          if (item.y > band.top || item.y < band.bottom) continue;
          contents.push(item.str.trim());
        }
      }
      cells.push({
        dayOfWeek: Number(dayKey),
        timeSlotId: band.timeSlotId,
        text: contents.join(' ').trim(),
      });
    }
  }
  return cells;
};

// Lines whose joined text contains a time-range token are grid label lines —
// the period labels themselves, plus the BREAK/LUNCH rows whose side text
// rides on the same baseline as their unmatched label. They must never count
// as cell content, or break-row text leaks into the neighbouring row band.
const isLabelLine = (line) => {
  const text = line.items.map((item) => item.str).join(' ');
  TIME_RANGE_REGEX.lastIndex = 0;
  return TIME_RANGE_REGEX.test(text);
};

// Pure entry point: positioned text items + system time slots -> availability
const parseAvailabilityFromTextItems = (items, timeSlots) => {
  if (!items.length) {
    return {
      slots: [],
      cells: [],
      warnings: ['The PDF contains no readable text — it may be a scanned image.'],
    };
  }

  const lines = groupIntoLines(items);
  const dayColumns = findDayColumns(lines);
  if (Object.keys(dayColumns).length < 2) {
    return {
      slots: [],
      cells: [],
      warnings: ['Could not find the day columns (Mon-Fri) in the PDF.'],
    };
  }

  const rows = findTimeRows(lines, timeSlots);
  if (!rows.length) {
    return {
      slots: [],
      cells: [],
      warnings: ['None of the time ranges in the PDF match the system time slots.'],
    };
  }

  const cells = buildCells(
    lines.filter((line) => !isLabelLine(line)),
    columnRanges(dayColumns),
    rowBands(rows),
  );
  const slots = cells.filter((cell) => !cell.text).map((cell) => ({ dayOfWeek: cell.dayOfWeek, timeSlotId: cell.timeSlotId }));
  return { slots, cells, warnings: [] };
};

// Reads the PDF (via the injected or default reader) and parses its grid
const extractAvailabilityFromPdf = async (buffer, timeSlots, reader) => {
  const { readTextItems } = reader || require('./pdfTextReader');
  const items = await readTextItems(buffer);
  return parseAvailabilityFromTextItems(items, timeSlots);
};

module.exports = { extractAvailabilityFromPdf, parseAvailabilityFromTextItems };
