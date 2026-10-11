const {
  parseTranscriptText,
  parseTranscriptPdf,
  normaliseCode,
  buildMarkLookup,
  lookupMark,
} = require('../utils/transcriptParser');
const { PDFDocument, StandardFonts } = require('pdf-lib');

// Mirrors the text pdf-parse extracts from a Wits self-service transcript:
// completed rows are one concatenated blob, in-progress courses have their mark
// masked with asterisks, and the prizes/scholarship sections mention course
// codes without a final mark.
const TRANSCRIPT_TEXT = `UNIVERSITY OF THE
WITWATERSRAND
This is to certify that Mr. Test Student was registered as detailed below:
Student ID: 2898909
2024
Bachelor of Science  (Full-Time) Year of Study 1
Program/CourseFinal
Marks
COMS1015ABasic Computer Organisation I66CPASS59
COMS1016ADiscrete Computational Structures I75APASS59
MATH1034AAlgebra I70BPASS515
PHYS1000APhysics I (Major)60CPASS536
OUTCOME:  Permitted to proceed
2025
Bachelor of Science  (Full-Time) Year of Study 2
COMS2013AMobile Computing II94APASS612
COMS2014AComputer Networks II56DPASS612
MATH2007AMultivariable Calculus75APASS68
OUTCOME:  Permitted to proceed
2026
Bachelor of Science  (Full-Time) Year of Study 3
COMS3003AFormal Languages and Automata*********7
COMS3005AAdvanced Analysis of Algorithms III*********7
OUTCOME:  ***
Prizes & Awards:
2025Certificate of Merit
  COMS2013A
Mobile Computing II
Scholarships:
2024UNIVERSITY ENTRANCE SCHOL
This document may not be altered.`;

describe('parseTranscriptText', () => {
  test('parses completed courses with their codes, names and final marks', () => {
    const { courses } = parseTranscriptText(TRANSCRIPT_TEXT);

    expect(courses).toEqual(
      expect.arrayContaining([
        { courseCode: 'COMS1015A', courseName: 'Basic Computer Organisation I', mark: 66 },
        { courseCode: 'COMS1016A', courseName: 'Discrete Computational Structures I', mark: 75 },
        { courseCode: 'PHYS1000A', courseName: 'Physics I (Major)', mark: 60 },
        { courseCode: 'MATH2007A', courseName: 'Multivariable Calculus', mark: 75 },
      ])
    );
    // 7 completed rows, not the 2 masked ones and not the prize mention
    expect(courses).toHaveLength(7);
  });

  test('excludes in-progress courses whose final mark is masked', () => {
    const { courses } = parseTranscriptText(TRANSCRIPT_TEXT);

    expect(courses.map((course) => course.courseCode)).not.toContain('COMS3003A');
    expect(courses.map((course) => course.courseCode)).not.toContain('COMS3005A');
  });

  test('extracts the printed student number', () => {
    const { studentNumber } = parseTranscriptText(TRANSCRIPT_TEXT);

    expect(studentNumber).toBe('2898909');
  });

  test('returns no student number when the header is absent', () => {
    const { studentNumber } = parseTranscriptText('COMS1015ABasic Computer Organisation I66CPASS59');

    expect(studentNumber).toBeNull();
  });

  test('keeps the most recent attempt when a course appears more than once', () => {
    const { courses } = parseTranscriptText(
      'COMS1015ABasic Computer Organisation I50CPASS59\n' +
        'COMS1015ABasic Computer Organisation I72BPASS59'
    );

    expect(courses).toHaveLength(1);
    expect(courses[0].mark).toBe(72);
  });

  test('ignores rows whose parsed mark exceeds 100', () => {
    const { courses } = parseTranscriptText('COMS1015ABasic Computer Organisation I1000APASS59');

    expect(courses).toHaveLength(0);
  });

  test('finds no courses in unrelated text', () => {
    const { courses, studentNumber } = parseTranscriptText('Prizes & Awards:\n2025Certificate of Merit');

    expect(courses).toHaveLength(0);
    expect(studentNumber).toBeNull();
  });
});

describe('normaliseCode', () => {
  test('uppercases and drops spaces and dashes', () => {
    expect(normaliseCode('coms 1015')).toBe('COMS1015');
    expect(normaliseCode('MATH-1034A')).toBe('MATH1034A');
  });
});

describe('buildMarkLookup and lookupMark', () => {
  const courses = [
    { courseCode: 'COMS1015A', courseName: 'Basic Computer Organisation I', mark: 66 },
    { courseCode: 'MATH1034A', courseName: 'Algebra I', mark: 70 },
  ];

  test('resolves database-style codes without the trailing campus letter', () => {
    const lookup = buildMarkLookup(courses);

    expect(lookupMark(lookup, 'COMS1015')).toBe(66);
    expect(lookupMark(lookup, 'MATH1034')).toBe(70);
  });

  test('resolves transcript-style codes with the trailing campus letter', () => {
    const lookup = buildMarkLookup(courses);

    expect(lookupMark(lookup, 'COMS1015A')).toBe(66);
  });

  test('ignores case and spacing in the registry code', () => {
    const lookup = buildMarkLookup(courses);

    expect(lookupMark(lookup, 'coms 1015')).toBe(66);
  });

  test('returns null for a course the transcript does not cover', () => {
    const lookup = buildMarkLookup(courses);

    expect(lookupMark(lookup, 'COMS2014')).toBeNull();
  });

  test('keeps the last course when stripped keys collide', () => {
    const lookup = buildMarkLookup([
      { courseCode: 'COMS1015A', courseName: 'Basic Computer Organisation I', mark: 50 },
      { courseCode: 'COMS1015B', courseName: 'Basic Computer Organisation I', mark: 72 },
    ]);

    expect(lookupMark(lookup, 'COMS1015')).toBe(72);
  });
});

describe('parseTranscriptPdf', () => {
  // Builds a small single-page PDF whose lines mimic the transcript layout
  const buildTranscriptPdf = async (lines) => {
    const pdf = await PDFDocument.create();
    const font = await pdf.embedFont(StandardFonts.Helvetica);
    const page = pdf.addPage([595, 842]);
    lines.forEach((line, index) => {
      page.drawText(line, { x: 50, y: 780 - index * 20, size: 10, font });
    });
    return pdf.save();
  };

  test('extracts and parses the courses from a real PDF buffer', async () => {
    const pdfBytes = await buildTranscriptPdf([
      'Student ID: 2898909',
      'COMS1015ABasic Computer Organisation I66CPASS59',
      'COMS3003AFormal Languages and Automata*********7',
    ]);

    const parsed = await parseTranscriptPdf(Buffer.from(pdfBytes));

    expect(parsed.studentNumber).toBe('2898909');
    expect(parsed.courses).toEqual([
      { courseCode: 'COMS1015A', courseName: 'Basic Computer Organisation I', mark: 66 },
    ]);
  });
});
