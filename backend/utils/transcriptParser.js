// Parses uploaded academic transcript PDFs into course marks.
//
// Transcripts from the student self-service portal render each completed course
// as one concatenated blob with no separators, e.g.:
//
//   COMS1015ABasic Computer Organisation I66CPASS59
//   ^code     ^name                             ^mark grade PASS  NQF level + credits
//
// Courses still in progress have their final mark masked on the transcript
// (COMS3003AMachine Learning III*********7), so they never match and are
// excluded — a masked mark is not a verified mark. The prizes and scholarships
// sections mention course codes too, but never as code + name + mark + decision
// word, so those rows are ignored as well.

const pdfParse = require('pdf-parse');

// One completed course row: code, name (no digits), final mark, single-letter
// result code and the decision word. The mark/grade/decision tail is required so
// masked and non-course rows cannot match.
const COURSE_ROW = /([A-Z]{4}\d{4}[A-Z])([A-Za-z&(),.'’\- ]+?)(\d{1,3})([A-Z])(?:PASS|FAIL|DISTINCTION)/g;

const STUDENT_ID = /Student ID:\s*(\d+)/;

// Extracts the completed courses and the printed student number from the raw
// text of a transcript. Where a course appears more than once (e.g. a retake in
// a later year), the last occurrence — the most recent attempt — wins.
const parseTranscriptText = (text) => {
  const courses = new Map();
  for (const match of text.matchAll(COURSE_ROW)) {
    const [, code, rawName, rawMark] = match;
    const mark = Number(rawMark);
    if (mark > 100) continue; // a mis-split row, not a real final mark
    courses.set(code, { courseCode: code, courseName: rawName.trim(), mark });
  }

  const studentNumber = text.match(STUDENT_ID)?.[1] || null;
  return { courses: [...courses.values()], studentNumber };
};

// Extracts the transcript text from a PDF buffer and parses it
const parseTranscriptPdf = async (buffer) => {
  const { text } = await pdfParse(buffer);
  return parseTranscriptText(text);
};

// Uppercase, no spaces or dashes — the loosest form that still identifies a course
const normaliseCode = (courseCode) => courseCode.replace(/[\s-]/g, '').toUpperCase();

// Indexes parsed courses for lookup against the course registry. Transcript
// codes carry a trailing campus letter (COMS1015A) while course codes in the
// database usually do not (COMS1015), so every course is indexed under both
// spellings. Iteration order is transcript order, so for stripped-key
// collisions (COMS1015A vs COMS1015B) the later, most recent attempt wins.
const buildMarkLookup = (courses) => {
  const lookup = new Map();
  for (const course of courses) {
    const code = normaliseCode(course.courseCode);
    lookup.set(code, course.mark);
    if (/[A-Z]$/.test(code)) {
      lookup.set(code.slice(0, -1), course.mark);
    }
  }
  return lookup;
};

// Returns the verified mark for a registry course code, or null when the
// transcript does not cover it
const lookupMark = (lookup, courseCode) => lookup.get(normaliseCode(courseCode)) ?? null;

module.exports = {
  parseTranscriptText,
  parseTranscriptPdf,
  normaliseCode,
  buildMarkLookup,
  lookupMark,
};
