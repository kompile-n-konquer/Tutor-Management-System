require('dotenv/config');
const prisma = require('./client');
const getFirebaseAdmin = require('../firebase/admin');
const { dayOfWeekFor, deriveEventEntry } = require('../utils/claimRules');
const {
  TUTOR_MONTHLY_CLAIMABLE_HOURS,
  TUTOR_EVENT_CLAIM_MONTHS,
  HOURLY_RATE_KEYS,
  PDF_TEMPLATE_KEY,
} = require('../utils/systemSettings');

// ────────────────────────────────────────────────────────────────────────
// TutorFlow presentation seed
//
// Rewrites the database with a realistic, self-consistent demo dataset for
// the final presentation:
//   • every user role (ORGANISER, ADMIN, LECTURER, TUTOR, STUDENT) plus a
//     deactivated account
//   • every status the system defines — course applications (PENDING,
//     APPROVED, ASSIGNED, REJECTED), role applications (PENDING, APPROVED,
//     REJECTED), timesheets (DRAFT, SUBMITTED, APPROVED, REJECTED) and
//     entries (PENDING, APPROVED, REJECTED), sessions (UNASSIGNED — the
//     excuse/volunteer lifecycle; upcoming SCHEDULED occurrences are
//     derived from events and never stored), overflow work (OPEN, CLAIMED,
//     CLOSED) and the email log (PENDING, SENT, FAILED)
//   • capacity edge cases: a course at maximum tutors (MATH2002 3/3), a
//     closed fully-staffed course (MATH1014 2/2), a draft timesheet above
//     the monthly claimable-hours cap, and events older than the claim window
//
// Every account also gets a real Firebase login with the same password, so
// the whole cast can sign in live during the demo.
//
//   cd backend
//   npm run seed              (equivalent to: node prisma/seed.js)
//
// Requires DATABASE_URL plus Firebase Admin credentials (FIREBASE_PROJECT_ID,
// FIREBASE_CLIENT_EMAIL and FIREBASE_PRIVATE_KEY, or GOOGLE_APPLICATION_CREDENTIALS).
//
// ⚠  The cleanup step performs a FULL reset — every row in every table is
//    deleted (any manually created users and courses included). Only the
//    PDF template setting is preserved.
// ────────────────────────────────────────────────────────────────────────

const PASSWORD = process.env.SEED_PASSWORD || 'Test@1234';

// ── Date helpers (UTC throughout — events are stored at UTC midnight) ────

const DAY_MS = 24 * 60 * 60 * 1000;

const utcMidnight = (d) => new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()));
const addDays = (d, n) => new Date(d.getTime() + n * DAY_MS);
const daysAgo = (n) => new Date(Date.now() - n * DAY_MS);
const minutesAgo = (n) => new Date(Date.now() - n * 60 * 1000);

// Most recent strictly-past date whose weekday (Mon=0..Fri=4) matches weekDay,
// then stepped back `weeksBack` weeks.
const mostRecentWeekday = (weekDay, weeksBack = 0) => {
  let d = addDays(utcMidnight(new Date()), -1);
  while (dayOfWeekFor(d) !== weekDay) d = addDays(d, -1);
  return addDays(d, -7 * weeksBack);
};

// Next strictly-future date whose weekday matches weekDay, plus whole weeks.
const nextWeekday = (weekDay, weeksAhead = 1) => {
  let d = addDays(utcMidnight(new Date()), 1);
  while (dayOfWeekFor(d) !== weekDay) d = addDays(d, 1);
  return addDays(d, 7 * (weeksAhead - 1));
};

const semesterLabel = () => {
  const now = new Date();
  return `${now.getUTCFullYear()}-S${now.getUTCMonth() + 1 >= 7 ? 2 : 1}`;
};

const monthLabel = (offset = 0) => {
  const now = new Date();
  return new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() + offset, 1)).toLocaleString('en-US', {
    month: 'long',
    year: 'numeric',
    timeZone: 'UTC',
  });
};

// ────────────────────────────────────────────────────────────────────────
// The cast — every account is loggable via Firebase with PASSWORD
// ────────────────────────────────────────────────────────────────────────

const USERS = [
  { key: 'organiser', email: 'organiser@tutorflow.test', firstName: 'Nomvula', lastName: 'Dlamini', role: 'ORGANISER', employeeNumber: 'EMP-0001', phoneNumber: '+27 82 555 0101', createdDaysAgo: 120 },
  { key: 'admin', email: 'admin@tutorflow.test', firstName: 'Thandi', lastName: 'Mabaso', role: 'ADMIN', employeeNumber: 'EMP-ADMIN1', phoneNumber: '+27 82 555 0102', createdDaysAgo: 120 },
  { key: 'sarahV', email: 'lecturer@tutorflow.test', firstName: 'Sarah', lastName: 'van Wyk', role: 'LECTURER', employeeNumber: 'EMP-L101', phoneNumber: '+27 82 555 0103', createdDaysAgo: 90 },
  { key: 'james', email: 'james.okafor@tutorflow.test', firstName: 'James', lastName: 'Okafor', role: 'LECTURER', employeeNumber: 'EMP-L102', phoneNumber: '+27 82 555 0104', createdDaysAgo: 85 },
  { key: 'alex', email: 'alex.mercer@tutorflow.test', firstName: 'Alex', lastName: 'Mercer', role: 'TUTOR', studentNumber: 'STU-1001', yearOfStudy: '3rd year', phoneNumber: '+27 83 555 0201', createdDaysAgo: 45 },
  { key: 'sarahJ', email: 'sarah.jenkins@tutorflow.test', firstName: 'Sarah', lastName: 'Jenkins', role: 'TUTOR', studentNumber: 'STU-1002', yearOfStudy: 'honours', phoneNumber: '+27 83 555 0202', createdDaysAgo: 50 },
  { key: 'david', email: 'david.kim@tutorflow.test', firstName: 'David', lastName: 'Kim', role: 'TUTOR', studentNumber: 'STU-1003', yearOfStudy: 'masters', phoneNumber: '+27 83 555 0203', createdDaysAgo: 48 },
  { key: 'priya', email: 'priya.nair@tutorflow.test', firstName: 'Priya', lastName: 'Nair', role: 'TUTOR', studentNumber: 'STU-1004', yearOfStudy: '3rd year', phoneNumber: '+27 83 555 0204', createdDaysAgo: 46 },
  { key: 'marcus', email: 'marcus.webb@tutorflow.test', firstName: 'Marcus', lastName: 'Webb', role: 'TUTOR', studentNumber: 'STU-1005', yearOfStudy: 'honours', phoneNumber: '+27 83 555 0205', createdDaysAgo: 44 },
  { key: 'thabo', email: 'thabo.mokoena@tutorflow.test', firstName: 'Thabo', lastName: 'Mokoena', role: 'STUDENT', studentNumber: 'STU-1006', yearOfStudy: '3rd year', phoneNumber: '+27 83 555 0301', createdDaysAgo: 20 },
  { key: 'lerato', email: 'lerato.khumalo@tutorflow.test', firstName: 'Lerato', lastName: 'Khumalo', role: 'STUDENT', studentNumber: 'STU-1007', yearOfStudy: '3rd year', phoneNumber: '+27 83 555 0302', createdDaysAgo: 22 },
  { key: 'nomsa', email: 'nomsa.dube@tutorflow.test', firstName: 'Nomsa', lastName: 'Dube', role: 'STUDENT', studentNumber: 'STU-1008', yearOfStudy: 'honours', phoneNumber: '+27 83 555 0303', createdDaysAgo: 15 },
  { key: 'sipho', email: 'sipho.ndlovu@tutorflow.test', firstName: 'Sipho', lastName: 'Ndlovu', role: 'STUDENT', studentNumber: 'STU-1009', yearOfStudy: '3rd year', phoneNumber: '+27 83 555 0304', createdDaysAgo: 14 },
  { key: 'refilwe', email: 'refilwe.malatji@tutorflow.test', firstName: 'Refilwe', lastName: 'Malatji', role: 'STUDENT', studentNumber: 'STU-1010', yearOfStudy: '3rd year', phoneNumber: '+27 83 555 0305', createdDaysAgo: 10 },
  { key: 'kabelo', email: 'kabelo.mnguni@tutorflow.test', firstName: 'Kabelo', lastName: 'Mnguni', role: 'STUDENT', studentNumber: 'STU-1011', yearOfStudy: 'masters', phoneNumber: '+27 83 555 0306', createdDaysAgo: 8 },
  { key: 'sizwe', email: 'sizwe.mahlangu@tutorflow.test', firstName: 'Sizwe', lastName: 'Mahlangu', role: 'STUDENT', studentNumber: 'STU-1012', yearOfStudy: '3rd year', phoneNumber: '+27 83 555 0307', createdDaysAgo: 30 },
  // Deactivated account edge case: isActive = false in the DB and the
  // Firebase account is disabled, so signing in shows "account disabled".
  { key: 'zanele', email: 'zanele.mthembu@tutorflow.test', firstName: 'Zanele', lastName: 'Mthembu', role: 'STUDENT', studentNumber: 'STU-1013', yearOfStudy: '3rd year', phoneNumber: '+27 83 555 0308', createdDaysAgo: 25, inactive: true },
];

// ────────────────────────────────────────────────────────────────────────
// Courses — 5 courses across the two lecturers. MATH2002 is at maximum
// capacity (3/3) with a pending applicant, MATH1014 is closed and fully
// staffed (2/2), APHY1004 is freshly opened with no applicants yet.
// dayOfWeek: 0 = Monday … 4 = Friday.
// ────────────────────────────────────────────────────────────────────────

const COURSES = [
  {
    code: 'COMS1015', name: 'Introduction to Programming', minimumMark: 65, tutorsRequired: 5,
    accepting: true, lecturer: 'sarahV', createdDaysAgo: 70,
    slots: [
      { day: 0, start: 480, venue: 'CHW 3', sessionType: 'Tutorial' }, // Mon 08:00
      { day: 2, start: 600, venue: 'CB 24', sessionType: 'Lab' },      // Wed 10:00
    ],
  },
  {
    code: 'COMS3055', name: 'Database Systems', minimumMark: 70, tutorsRequired: 4,
    accepting: true, lecturer: 'sarahV', createdDaysAgo: 40,
    slots: [
      { day: 1, start: 540, venue: 'CHW 3', sessionType: 'Tutorial' }, // Tue 09:00
      { day: 3, start: 780, venue: 'FNB 110', sessionType: 'Lab' },    // Thu 13:00
    ],
  },
  {
    code: 'MATH2002', name: 'Discrete Mathematics', minimumMark: 60, tutorsRequired: 3,
    accepting: true, lecturer: 'james', createdDaysAgo: 60,
    slots: [
      { day: 0, start: 660, venue: 'MEB 302', sessionType: 'Tutorial' }, // Mon 11:00
      { day: 2, start: 840, venue: 'MEB 302', sessionType: 'Tutorial' }, // Wed 14:00
    ],
  },
  {
    code: 'MATH1014', name: 'Linear Algebra', minimumMark: 60, tutorsRequired: 2,
    accepting: false, lecturer: 'james', createdDaysAgo: 90, // fully staffed — process closed
    slots: [
      { day: 0, start: 540, venue: 'MEB 201', sessionType: 'Tutorial' }, // Mon 09:00
      { day: 3, start: 900, venue: 'MEB 201', sessionType: 'Tutorial' }, // Thu 15:00
    ],
  },
  {
    code: 'APHY1004', name: 'Physics for Engineers', minimumMark: 60, tutorsRequired: 2,
    accepting: true, lecturer: 'james', createdDaysAgo: 7, // freshly opened — 0 applicants, 0 tutors
    slots: [
      { day: 1, start: 480, venue: 'PHY LAB 1', sessionType: 'Lab' },  // Tue 08:00
      { day: 4, start: 600, venue: 'PHY 100', sessionType: 'Tutorial' }, // Fri 10:00
    ],
  },
];

// Hourly availability grid rows (minutes from midnight): 08:00 – 17:00
const TIME_SLOTS = [480, 540, 600, 660, 720, 780, 840, 900, 960];

// Weekly availability ([dayOfWeek, slot start minute]) — every applicant's
// availability covers all the tutoring slots of the courses they applied to,
// exactly like the real apply flow enforces.
const AVAILABILITY = {
  alex: [[0, 480], [0, 540], [0, 600], [1, 480], [2, 600], [3, 900], [4, 480]],
  marcus: [[0, 480], [0, 540], [1, 540], [2, 600], [2, 840], [3, 900]],
  sarahJ: [[0, 660], [0, 720], [2, 840], [3, 480]],
  david: [[0, 540], [0, 660], [1, 480], [2, 840], [3, 900], [4, 600]],
  priya: [[0, 660], [1, 540], [2, 840], [3, 780], [4, 480]],
  thabo: [[0, 480], [0, 660], [1, 480], [1, 540], [2, 600], [2, 840], [3, 780], [4, 600]],
  lerato: [[0, 660], [1, 480], [1, 540], [2, 840], [3, 780], [4, 600]],
  nomsa: [[1, 480], [1, 540], [3, 780], [4, 600]],
  sipho: [[0, 480], [1, 480], [2, 600], [4, 600]],
  refilwe: [[0, 480], [0, 660], [2, 600]], // just enough to apply as a tutor
  sizwe: [[0, 660], [2, 840]],
  // kabelo and zanele have no availability — the onboarding hub then shows the
  // "configure your availability first" prerequisite state.
};

// Free-form busy ranges for tutors (Issue 32) — arbitrary minute-of-day blocks.
const BUSY_BLOCKS = [
  { user: 'david', day: 2, start: 720, end: 840 }, // Wed 12:00–14:00
  { user: 'alex', day: 4, start: 780, end: 900 },  // Fri 13:00–15:00
];

// Course applications — all four statuses represented. Marks are all at or
// above each course's minimumMark, as the apply endpoint requires.
const COURSE_APPLICATIONS = [
  // COMS1015 — 2/5 assigned, two applicants still pending review
  { user: 'alex', course: 'COMS1015', mark: 92, status: 'ASSIGNED', appliedDaysAgo: 25, reviewedDaysAgo: 22 },
  { user: 'marcus', course: 'COMS1015', mark: 88, status: 'ASSIGNED', appliedDaysAgo: 25, reviewedDaysAgo: 22 },
  { user: 'thabo', course: 'COMS1015', mark: 78, status: 'PENDING', appliedDaysAgo: 6 },
  { user: 'sipho', course: 'COMS1015', mark: 81, status: 'PENDING', appliedDaysAgo: 4 },
  // MATH2002 — 3/3 assigned (AT CAPACITY); Lerato is the pending applicant
  // who demonstrates the "course is fully staffed" guard.
  { user: 'sarahJ', course: 'MATH2002', mark: 91, status: 'ASSIGNED', appliedDaysAgo: 30, reviewedDaysAgo: 27 },
  { user: 'david', course: 'MATH2002', mark: 84, status: 'ASSIGNED', appliedDaysAgo: 30, reviewedDaysAgo: 27 },
  { user: 'priya', course: 'MATH2002', mark: 89, status: 'ASSIGNED', appliedDaysAgo: 28, reviewedDaysAgo: 27 },
  { user: 'lerato', course: 'MATH2002', mark: 80, status: 'PENDING', appliedDaysAgo: 5 },
  // COMS3055 — 1/4 assigned, one approved-not-yet-assigned, one rejected
  { user: 'priya', course: 'COMS3055', mark: 95, status: 'ASSIGNED', appliedDaysAgo: 20, reviewedDaysAgo: 18 },
  { user: 'thabo', course: 'COMS3055', mark: 76, status: 'PENDING', appliedDaysAgo: 5 },
  { user: 'nomsa', course: 'COMS3055', mark: 74, status: 'APPROVED', appliedDaysAgo: 7, reviewedDaysAgo: 2 },
  { user: 'lerato', course: 'COMS3055', mark: 72, status: 'REJECTED', appliedDaysAgo: 12, reviewedDaysAgo: 9 },
  // MATH1014 — closed course, fully processed lifecycle
  { user: 'alex', course: 'MATH1014', mark: 90, status: 'ASSIGNED', appliedDaysAgo: 60, reviewedDaysAgo: 55 },
  { user: 'marcus', course: 'MATH1014', mark: 85, status: 'ASSIGNED', appliedDaysAgo: 58, reviewedDaysAgo: 55 },
  { user: 'david', course: 'MATH1014', mark: 79, status: 'REJECTED', appliedDaysAgo: 59, reviewedDaysAgo: 50 },
];

// Role applications (onboarding workflow) — PENDING for both requested roles,
// plus the APPROVED history behind every tutor/lecturer and one REJECTED.
const ROLE_APPLICATIONS = [
  { user: 'refilwe', requestedRole: 'TUTOR', status: 'PENDING', hourlyRate: 150, maxHoursPerWeek: 10, submittedDaysAgo: 3 },
  {
    user: 'kabelo', requestedRole: 'LECTURER', status: 'PENDING', submittedDaysAgo: 2,
    department: 'Computer Science and Applied Mathematics',
    officeLocation: 'Chamber of Mines, Room 214',
    officeHours: 'Tue/Thu 10:00-12:00',
  },
  {
    user: 'sizwe', requestedRole: 'TUTOR', status: 'REJECTED', hourlyRate: 140, maxHoursPerWeek: 15,
    submittedDaysAgo: 20, reviewedDaysAgo: 17,
    rejectionReason: 'Availability does not cover the tutoring slots for any course this semester',
  },
  { user: 'alex', requestedRole: 'TUTOR', status: 'APPROVED', hourlyRate: 150, maxHoursPerWeek: 12, submittedDaysAgo: 35, reviewedDaysAgo: 30 },
  { user: 'sarahJ', requestedRole: 'TUTOR', status: 'APPROVED', hourlyRate: 160, maxHoursPerWeek: 12, submittedDaysAgo: 40, reviewedDaysAgo: 36 },
  { user: 'david', requestedRole: 'TUTOR', status: 'APPROVED', hourlyRate: 175, maxHoursPerWeek: 10, submittedDaysAgo: 38, reviewedDaysAgo: 34 },
  { user: 'priya', requestedRole: 'TUTOR', status: 'APPROVED', hourlyRate: 150, maxHoursPerWeek: 12, submittedDaysAgo: 36, reviewedDaysAgo: 32 },
  { user: 'marcus', requestedRole: 'TUTOR', status: 'APPROVED', hourlyRate: 160, maxHoursPerWeek: 12, submittedDaysAgo: 34, reviewedDaysAgo: 30 },
  {
    user: 'sarahV', requestedRole: 'LECTURER', status: 'APPROVED', submittedDaysAgo: 90, reviewedDaysAgo: 88,
    department: 'Computer Science and Applied Mathematics',
    officeLocation: 'Maths Building, Room 204',
    officeHours: 'Mon/Wed 14:00-16:00',
  },
  {
    user: 'james', requestedRole: 'LECTURER', status: 'APPROVED', submittedDaysAgo: 85, reviewedDaysAgo: 83,
    department: 'School of Mathematics',
    officeLocation: 'MEB, Room 118',
    officeHours: 'Tue/Fri 09:00-11:00',
  },
];

// Pre-assigned tutors — MATH2002 ends up exactly at its requiredTutors cap.
const ASSIGNMENTS = [
  { user: 'alex', course: 'COMS1015' },
  { user: 'marcus', course: 'COMS1015' },
  { user: 'sarahJ', course: 'MATH2002' },
  { user: 'david', course: 'MATH2002' },
  { user: 'priya', course: 'MATH2002' },
  { user: 'priya', course: 'COMS3055' },
  { user: 'alex', course: 'MATH1014' },
  { user: 'marcus', course: 'MATH1014' },
];

// Past events (claimable once unclaimed, within the claim window). weekDay
// always matches one of the course's tutoring weekdays so the derived entry
// is valid. The "ancient" event is ~5 months back — outside the 3-month
// claim window, so it never shows up as claimable.
const PAST_EVENTS = [
  // COMS1015 (Mon/Wed)
  { key: 'c1015-mon-4', course: 'COMS1015', weekDay: 0, weeksBack: 4, description: 'tutoring' },
  { key: 'c1015-wed-4', course: 'COMS1015', weekDay: 2, weeksBack: 4, description: 'marking' },
  { key: 'c1015-mon-3', course: 'COMS1015', weekDay: 0, weeksBack: 3, description: 'tutoring' },
  { key: 'c1015-wed-3', course: 'COMS1015', weekDay: 2, weeksBack: 3, description: 'tutoring' },
  { key: 'c1015-mon-2', course: 'COMS1015', weekDay: 0, weeksBack: 2, description: 'tutoring' },
  { key: 'c1015-wed-2', course: 'COMS1015', weekDay: 2, weeksBack: 2, description: 'marking' },
  { key: 'c1015-mon-1', course: 'COMS1015', weekDay: 0, weeksBack: 1, description: 'tutoring' },
  { key: 'c1015-wed-1', course: 'COMS1015', weekDay: 2, weeksBack: 1, description: 'tutoring' }, // unclaimed
  { key: 'c1015-mon-0', course: 'COMS1015', weekDay: 0, weeksBack: 0, description: 'tutoring' }, // unclaimed
  { key: 'c1015-wed-ancient', course: 'COMS1015', weekDay: 2, weeksBack: 20, description: 'tutoring' }, // outside claim window
  // MATH2002 (Mon/Wed)
  { key: 'm2002-mon-6', course: 'MATH2002', weekDay: 0, weeksBack: 6, description: 'tutoring' },
  { key: 'm2002-wed-6', course: 'MATH2002', weekDay: 2, weeksBack: 6, description: 'tutoring' },
  { key: 'm2002-mon-5', course: 'MATH2002', weekDay: 0, weeksBack: 5, description: 'marking' },
  { key: 'm2002-wed-5', course: 'MATH2002', weekDay: 2, weeksBack: 5, description: 'tutoring' },
  { key: 'm2002-mon-4', course: 'MATH2002', weekDay: 0, weeksBack: 4, description: 'tutoring' },
  { key: 'm2002-wed-4', course: 'MATH2002', weekDay: 2, weeksBack: 4, description: 'tutoring' },
  { key: 'm2002-mon-3', course: 'MATH2002', weekDay: 0, weeksBack: 3, description: 'tutoring' },
  { key: 'm2002-wed-3', course: 'MATH2002', weekDay: 2, weeksBack: 3, description: 'tutoring' },
  { key: 'm2002-mon-2', course: 'MATH2002', weekDay: 0, weeksBack: 2, description: 'tutoring' },
  { key: 'm2002-wed-2', course: 'MATH2002', weekDay: 2, weeksBack: 2, description: 'marking' },
  { key: 'm2002-mon-1', course: 'MATH2002', weekDay: 0, weeksBack: 1, description: 'tutoring' },
  { key: 'm2002-wed-1', course: 'MATH2002', weekDay: 2, weeksBack: 1, description: 'tutoring' },
  { key: 'm2002-mon-0', course: 'MATH2002', weekDay: 0, weeksBack: 0, description: 'tutoring' },
  { key: 'm2002-wed-0', course: 'MATH2002', weekDay: 2, weeksBack: 0, description: 'tutoring' }, // unclaimed
  // COMS3055 (Tue/Thu)
  { key: 'c3055-tue-3', course: 'COMS3055', weekDay: 1, weeksBack: 3, description: 'tutoring' },
  { key: 'c3055-thu-3', course: 'COMS3055', weekDay: 3, weeksBack: 3, description: 'tutoring' },
  { key: 'c3055-tue-2', course: 'COMS3055', weekDay: 1, weeksBack: 2, description: 'tutoring' },
  { key: 'c3055-thu-2', course: 'COMS3055', weekDay: 3, weeksBack: 2, description: 'marking' },
  { key: 'c3055-tue-1', course: 'COMS3055', weekDay: 1, weeksBack: 1, description: 'tutoring' }, // unclaimed
  { key: 'c3055-thu-1', course: 'COMS3055', weekDay: 3, weeksBack: 1, description: 'tutoring' }, // unclaimed
  // MATH1014 (Mon/Thu)
  { key: 'm1014-mon-2', course: 'MATH1014', weekDay: 0, weeksBack: 2, description: 'tutoring' },
  { key: 'm1014-thu-2', course: 'MATH1014', weekDay: 3, weeksBack: 2, description: 'tutoring' }, // unclaimed
  { key: 'm1014-mon-1', course: 'MATH1014', weekDay: 0, weeksBack: 1, description: 'marking' },
  { key: 'm1014-thu-1', course: 'MATH1014', weekDay: 3, weeksBack: 1, description: 'tutoring' }, // unclaimed
  // APHY1004 (Tue/Fri) — no tutors assigned yet, so this one is never claimable
  { key: 'a1004-tue-1', course: 'APHY1004', weekDay: 1, weeksBack: 1, description: 'tutoring' },
];

// Upcoming events — visible on the Events page for the assigned tutors,
// the owning lecturer and the organiser.
const FUTURE_EVENTS = [
  { key: 'c1015-mon-next', course: 'COMS1015', weekDay: 0, weeksAhead: 1, description: 'tutoring' },
  { key: 'c1015-wed-next', course: 'COMS1015', weekDay: 2, weeksAhead: 1, description: 'invigilation' },
  { key: 'c1015-mon-next2', course: 'COMS1015', weekDay: 0, weeksAhead: 2, description: 'tutoring' },
  { key: 'm2002-mon-next', course: 'MATH2002', weekDay: 0, weeksAhead: 1, description: 'tutoring' },
  { key: 'm2002-wed-next', course: 'MATH2002', weekDay: 2, weeksAhead: 1, description: 'tutoring' },
  { key: 'c3055-tue-next', course: 'COMS3055', weekDay: 1, weeksAhead: 1, description: 'tutoring' },
  { key: 'c3055-thu-next', course: 'COMS3055', weekDay: 3, weeksAhead: 1, description: 'marking' },
  { key: 'm1014-mon-next', course: 'MATH1014', weekDay: 0, weeksAhead: 1, description: 'tutoring' },
  { key: 'a1004-tue-next', course: 'APHY1004', weekDay: 1, weeksAhead: 1, description: 'tutoring' },
  { key: 'a1004-fri-next', course: 'APHY1004', weekDay: 4, weeksAhead: 1, description: 'tutoring' },
];

// Timesheets — one of each status. Entry fields (course, supervisor, date,
// duration, description) are derived from the claimed event with the exact
// same helper the timesheets controller uses, and every event is claimed at
// most once across all sheets (the unique TimesheetEntry.eventId rule).
//
//   DRAFT      Alex — work in progress
//   SUBMITTED  Alex — mid-review: one APPROVED, one REJECTED, one PENDING entry
//   SUBMITTED  Marcus — fresh submission, entries PENDING (two supervisors)
//   APPROVED   Sarah Jenkins — fully approved, ready for PDF export
//   REJECTED   David — entries reset to PENDING, must edit and resubmit
//   DRAFT      Priya — 11 h claimed inside a 31-day window, above the 10 h
//              cap: submitting triggers the claimable-hours guard
const TIMESHEETS = [
  {
    tutor: 'alex', name: `${monthLabel(0)} (in progress)`, payrollNumber: 'PAY-2041',
    status: 'DRAFT', createdDaysAgo: 10,
    entries: [
      { event: 'c1015-mon-4', status: 'PENDING' },
      { event: 'c1015-wed-4', status: 'PENDING' },
      { event: 'c1015-mon-3', status: 'PENDING' },
      { event: 'm1014-mon-2', status: 'PENDING' },
    ],
  },
  {
    tutor: 'alex', name: `${monthLabel(0)} pay claim`, payrollNumber: 'PAY-2041',
    status: 'SUBMITTED', createdDaysAgo: 12, submittedDaysAgo: 2,
    entries: [
      { event: 'c1015-wed-3', status: 'APPROVED' },
      { event: 'c1015-mon-2', status: 'REJECTED' }, // supervisor flagged this entry
      { event: 'c1015-mon-1', status: 'PENDING' },
    ],
  },
  {
    tutor: 'marcus', name: `${monthLabel(0)}`, payrollNumber: 'PAY-2045',
    status: 'SUBMITTED', createdDaysAgo: 6, submittedDaysAgo: 1,
    entries: [
      { event: 'c1015-wed-2', status: 'PENDING' }, // supervised by Sarah van Wyk
      { event: 'm1014-mon-1', status: 'PENDING' }, // supervised by James Okafor
    ],
  },
  {
    tutor: 'sarahJ', name: `${monthLabel(-1)}`, payrollNumber: 'PAY-2042',
    status: 'APPROVED', createdDaysAgo: 32, submittedDaysAgo: 24, approvedDaysAgo: 22,
    entries: [
      { event: 'm2002-mon-6', status: 'APPROVED' },
      { event: 'm2002-wed-6', status: 'APPROVED' },
      { event: 'm2002-mon-5', status: 'APPROVED' },
      { event: 'm2002-wed-5', status: 'APPROVED' },
    ],
  },
  {
    tutor: 'david', name: `${monthLabel(-1)}`, payrollNumber: 'PAY-2043',
    status: 'REJECTED', createdDaysAgo: 30, submittedDaysAgo: 21,
    rejectionReason: 'Claimed hours do not match the signed lab register — please verify the entries and resubmit.',
    entries: [
      { event: 'm2002-mon-4', status: 'PENDING' }, // reset to PENDING by the reject action
      { event: 'm2002-wed-4', status: 'PENDING' },
    ],
  },
  {
    tutor: 'priya', name: `${monthLabel(0)}`, payrollNumber: 'PAY-2044',
    status: 'DRAFT', createdDaysAgo: 5, overCap: true,
    entries: [
      { event: 'm2002-mon-3', status: 'PENDING' },
      { event: 'm2002-wed-3', status: 'PENDING' },
      { event: 'm2002-mon-2', status: 'PENDING' },
      { event: 'm2002-wed-2', status: 'PENDING' },
      { event: 'm2002-mon-1', status: 'PENDING' },
      { event: 'm2002-wed-1', status: 'PENDING' },
      { event: 'm2002-mon-0', status: 'PENDING' },
      { event: 'c3055-tue-3', status: 'PENDING' },
      { event: 'c3055-thu-3', status: 'PENDING' },
      { event: 'c3055-tue-2', status: 'PENDING' },
      { event: 'c3055-thu-2', status: 'PENDING' },
    ],
  },
];

// Sessions — the excuse / volunteer lifecycle. Upcoming SCHEDULED occurrences
// are derived at read time from the events above and are never stored; a
// Session row only exists once a tutor excuses themselves from an occurrence
// (UNASSIGNED — open for student volunteers). The past rows keep teaching
// history for the lecturer view.
const SESSIONS = [
  // Marcus excused himself from next Monday's COMS1015 occurrence — the
  // c1015-mon-next event — so the Volunteer View has live cover to pick up.
  { user: 'marcus', course: 'COMS1015', day: 0, when: 'upcoming', weeks: 1, status: 'UNASSIGNED', excuseReason: 'Family commitment I could not move' },
  { user: 'alex', course: 'COMS1015', day: 0, when: 'past', weeks: 1, status: 'COMPLETED' },
  { user: 'marcus', course: 'COMS1015', day: 2, when: 'past', weeks: 1, status: 'CANCELLED' },
  { user: 'sarahJ', course: 'MATH2002', day: 2, when: 'past', weeks: 2, status: 'EXCUSED', excuseReason: 'Medical certificate submitted' },
  { user: 'alex', course: 'MATH1014', day: 0, when: 'past', weeks: 2, status: 'COMPLETED' },
];

// Overflow work (volunteering) — OPEN, CLAIMED and CLOSED.
const OVERFLOW_WORK = [
  { course: 'COMS1015', description: 'Invigilation support for the class test series', hours: 6, postedBy: 'sarahV', status: 'OPEN' },
  { course: 'MATH2002', description: 'Marking backlog — tutorial scripts for weeks 1-4', hours: 8, postedBy: 'james', status: 'OPEN' },
  { course: 'COMS3055', description: 'Tutorial replacement session for the databases practical', hours: 4, postedBy: 'sarahV', claimedBy: 'alex', status: 'CLAIMED' },
  { course: 'MATH1014', description: 'Exam preparation study desk', hours: 5, postedBy: 'james', claimedBy: 'marcus', status: 'CLOSED' },
];

// Organiser-managed policy values. The 10-hour cap is what makes Priya's
// 11-hour draft timesheet the over-cap edge case.
const SETTINGS = [
  [TUTOR_MONTHLY_CLAIMABLE_HOURS, '10'],
  [TUTOR_EVENT_CLAIM_MONTHS, '3'],
  [HOURLY_RATE_KEYS['3rd year'], '95'],
  [HOURLY_RATE_KEYS.honours, '110'],
  [HOURLY_RATE_KEYS.masters, '130'],
  [HOURLY_RATE_KEYS.phd, '150'],
];

// ────────────────────────────────────────────────────────────────────────
// Helpers
// ────────────────────────────────────────────────────────────────────────

// Create the Firebase account if missing, otherwise reset the password and
// re-enable it — re-running the seed is always safe. Inactive seed users get
// their Firebase account disabled, mirroring the real deactivation flow.
async function ensureFirebaseUser(auth, user) {
  const displayName = `${user.firstName} ${user.lastName}`;
  const props = { password: PASSWORD, displayName, emailVerified: true, disabled: Boolean(user.inactive) };
  try {
    const existing = await auth.getUserByEmail(user.email);
    await auth.updateUser(existing.uid, props);
    return existing.uid;
  } catch (err) {
    if (err.code === 'auth/user-not-found') {
      const created = await auth.createUser({ email: user.email, ...props });
      return created.uid;
    }
    throw err;
  }
}

// Full reset in reverse-dependency order. Only the PDF template setting is
// preserved (it points at a file on disk the organiser uploaded).
async function cleanup() {
  console.log('\n🧹  Cleaning up all previous data (full reset)...\n');

  await prisma.timesheetEntry.deleteMany({});
  await prisma.timesheet.deleteMany({});
  await prisma.session.deleteMany({});
  await prisma.tutorAssignment.deleteMany({});
  await prisma.application.deleteMany({});
  await prisma.roleApplication.deleteMany({});
  await prisma.availability.deleteMany({});
  await prisma.busyBlock.deleteMany({});
  await prisma.event.deleteMany({});
  await prisma.overflowWork.deleteMany({});
  await prisma.emailLog.deleteMany({});
  await prisma.courseSlot.deleteMany({});
  await prisma.course.deleteMany({});
  await prisma.timeSlot.deleteMany({});
  await prisma.user.deleteMany({});
  await prisma.systemSetting.deleteMany({
    where: {
      key: { in: SETTINGS.map(([key]) => key) },
    },
  });

  console.log('    All tables cleared (PDF template setting preserved).');
}

// ────────────────────────────────────────────────────────────────────────
// Main seed
// ────────────────────────────────────────────────────────────────────────

async function main() {
  let auth;
  try {
    auth = getFirebaseAdmin().getAuth();
  } catch (err) {
    console.error(
      '\n❌  Firebase Admin SDK is not configured — the seed cannot create loggable accounts.\n' +
        '    Set FIREBASE_PROJECT_ID, FIREBASE_CLIENT_EMAIL and FIREBASE_PRIVATE_KEY (or\n' +
        '    GOOGLE_APPLICATION_CREDENTIALS) in backend/.env, then re-run.\n\n' +
        `    Details: ${err.message}\n`,
    );
    process.exit(1);
  }

  // ── 1. Firebase accounts first — fail before touching the database ──
  console.log('👤  Ensuring Firebase accounts exist...\n');

  const firebaseUids = {};
  for (const user of USERS) {
    firebaseUids[user.key] = await ensureFirebaseUser(auth, user);
    console.log(`    ✓ ${user.email.padEnd(34)} (${user.role}${user.inactive ? ', disabled' : ''})`);
  }

  // ── 2. Wipe previous data ──
  await cleanup();

  // ── 3. Users ──
  console.log('\n👤  Creating users...\n');

  const users = {};
  for (const user of USERS) {
    users[user.key] = await prisma.user.create({
      data: {
        firebaseUid: firebaseUids[user.key],
        firstName: user.firstName,
        lastName: user.lastName,
        email: user.email,
        role: user.role,
        studentNumber: user.studentNumber ?? null,
        employeeNumber: user.employeeNumber ?? null,
        phoneNumber: user.phoneNumber ?? null,
        yearOfStudy: user.yearOfStudy ?? null,
        isActive: !user.inactive,
        createdAt: daysAgo(user.createdDaysAgo),
      },
    });
  }
  console.log(`    ✓ ${USERS.length} users (all five roles, one deactivated)`);

  // ── 4. Time slots (the availability grid) ──
  console.log('\n⏰  Creating time slots...\n');

  const timeSlots = {};
  for (const start of TIME_SLOTS) {
    const slot = await prisma.timeSlot.create({
      data: { startMinute: start, endMinute: start + 60 },
    });
    timeSlots[start] = slot;
  }
  console.log(`    ✓ ${TIME_SLOTS.length} hourly slots (08:00–17:00)`);

  // ── 5. Courses + course slots ──
  console.log('\n📚  Creating courses...\n');

  const courses = {};
  const courseSlotIds = {}; // `${courseCode}:${dayOfWeek}` → CourseSlot.id
  for (const course of COURSES) {
    courses[course.code] = await prisma.course.create({
      data: {
        courseCode: course.code,
        courseName: course.name,
        minimumMark: course.minimumMark,
        tutorsRequired: course.tutorsRequired,
        acceptingApplications: course.accepting,
        userId: users[course.lecturer].id,
        createdAt: daysAgo(course.createdDaysAgo),
        slots: {
          create: course.slots.map((slot) => ({
            dayOfWeek: slot.day,
            timeSlotId: timeSlots[slot.start].id,
            venue: slot.venue,
            sessionType: slot.sessionType,
          })),
        },
      },
    });
    course.slots.forEach((slot) => {
      courseSlotIds[`${course.code}:${slot.day}`] = null; // filled below
    });
    console.log(
      `    ✓ ${course.code.padEnd(9)} ${course.name.padEnd(32)} req ${course.tutorsRequired}  ${course.accepting ? 'accepting applications' : 'closed'}`,
    );
  }

  // Fetch the created slot ids for the sessions section
  const createdSlots = await prisma.courseSlot.findMany();
  for (const slot of createdSlots) {
    const code = Object.values(courses).find((c) => c.id === slot.courseId)?.courseCode;
    if (code) courseSlotIds[`${code}:${slot.dayOfWeek}`] = slot.id;
  }

  // ── 6. Availability + busy blocks ──
  console.log('\n📅  Creating availability...\n');

  const availabilityRows = Object.entries(AVAILABILITY).flatMap(([userKey, slots]) =>
    slots.map(([day, start]) => ({
      userId: users[userKey].id,
      dayOfWeek: day,
      timeSlotId: timeSlots[start].id,
    })),
  );
  await prisma.availability.createMany({ data: availabilityRows });
  console.log(`    ✓ ${availabilityRows.length} availability slots across ${Object.keys(AVAILABILITY).length} users`);

  await prisma.busyBlock.createMany({
    data: BUSY_BLOCKS.map((block) => ({
      userId: users[block.user].id,
      dayOfWeek: block.day,
      startMinute: block.start,
      endMinute: block.end,
    })),
  });
  console.log(`    ✓ ${BUSY_BLOCKS.length} busy blocks`);

  // ── 7. Role applications (onboarding) ──
  console.log('\n📝  Creating role applications...\n');

  for (const app of ROLE_APPLICATIONS) {
    await prisma.roleApplication.create({
      data: {
        userId: users[app.user].id,
        requestedRole: app.requestedRole,
        status: app.status,
        submittedAt: daysAgo(app.submittedDaysAgo),
        reviewedAt: app.reviewedDaysAgo != null ? daysAgo(app.reviewedDaysAgo) : null,
        reviewedById: app.reviewedDaysAgo != null ? users.organiser.id : null,
        hourlyRate: app.hourlyRate ?? null,
        maxHoursPerWeek: app.maxHoursPerWeek ?? null,
        department: app.department ?? null,
        officeLocation: app.officeLocation ?? null,
        officeHours: app.officeHours ?? null,
        rejectionReason: app.rejectionReason ?? null,
      },
    });
    console.log(`    ✓ ${app.status.padEnd(9)} ${app.requestedRole.padEnd(9)} ${users[app.user].email}`);
  }

  // ── 8. Course applications ──
  console.log('\n📋  Creating course applications...\n');

  for (const app of COURSE_APPLICATIONS) {
    await prisma.application.create({
      data: {
        userId: users[app.user].id,
        courseId: courses[app.course].id,
        courseMark: app.mark,
        status: app.status,
        appliedAt: daysAgo(app.appliedDaysAgo),
        reviewedAt: app.reviewedDaysAgo != null ? daysAgo(app.reviewedDaysAgo) : null,
      },
    });
    console.log(`    ✓ ${app.status.padEnd(9)} ${users[app.user].email.padEnd(34)} ${app.course} (${app.mark}%)`);
  }

  // ── 9. Pre-assigned tutors ──
  console.log('\n📌  Pre-assigning tutors...\n');

  const semester = semesterLabel();
  const assignmentIds = {}; // `${userKey}:${courseCode}` → TutorAssignment.id
  for (const assignment of ASSIGNMENTS) {
    const created = await prisma.tutorAssignment.create({
      data: {
        userId: users[assignment.user].id,
        courseId: courses[assignment.course].id,
        semester,
      },
    });
    assignmentIds[`${assignment.user}:${assignment.course}`] = created.id;
    console.log(`    ✓ ${users[assignment.user].email.padEnd(34)} ${assignment.course}`);
  }
  console.log(`    ✓ semester: ${semester} — MATH2002 is now at its 3/3 tutor cap`);

  // ── 10. Events ──
  console.log('\n🗓  ️Creating events...\n');

  const EVENT_INCLUDE = {
    course: {
      select: {
        id: true,
        userId: true,
        slots: { include: { timeSlot: true } },
      },
    },
  };

  const events = {};
  for (const spec of PAST_EVENTS) {
    events[spec.key] = await prisma.event.create({
      data: {
        courseId: courses[spec.course].id,
        date: mostRecentWeekday(spec.weekDay, spec.weeksBack),
        description: spec.description,
      },
      include: EVENT_INCLUDE,
    });
  }
  for (const spec of FUTURE_EVENTS) {
    events[spec.key] = await prisma.event.create({
      data: {
        courseId: courses[spec.course].id,
        date: nextWeekday(spec.weekDay, spec.weeksAhead),
        description: spec.description,
      },
      include: EVENT_INCLUDE,
    });
  }
  console.log(`    ✓ ${PAST_EVENTS.length} past events (one older than the claim window)`);
  console.log(`    ✓ ${FUTURE_EVENTS.length} upcoming events`);

  // ── 11. Timesheets + entries ──
  console.log('\n🧾  Creating timesheets...\n');

  let approvedSheetId = null;
  let rejectedSheetId = null;
  let submittedSheetId = null; // Alex's mid-review sheet — the stuck reminder targets it
  for (const spec of TIMESHEETS) {
    const resolved = spec.entries.map((entry) => {
      const derived = deriveEventEntry(events[entry.event]);
      if (!derived) {
        throw new Error(`Event ${entry.event} has no course slots on its weekday — cannot derive the entry`);
      }
      return { ...derived, status: entry.status };
    });
    const totalHours = resolved.reduce((sum, entry) => sum + entry.duration, 0);

    const sheet = await prisma.timesheet.create({
      data: {
        userId: users[spec.tutor].id,
        name: spec.name,
        payrollNumber: spec.payrollNumber,
        totalHours,
        status: spec.status,
        createdAt: daysAgo(spec.createdDaysAgo),
        ...(spec.submittedDaysAgo != null ? { submittedAt: daysAgo(spec.submittedDaysAgo) } : {}),
        ...(spec.approvedDaysAgo != null ? { approvedAt: daysAgo(spec.approvedDaysAgo) } : {}),
        ...(spec.rejectionReason ? { rejectionReason: spec.rejectionReason } : {}),
        entries: { create: resolved },
      },
    });

    if (spec.status === 'APPROVED') approvedSheetId = sheet.id;
    if (spec.status === 'REJECTED') rejectedSheetId = sheet.id;
    if (spec.status === 'SUBMITTED' && spec.tutor === 'alex') submittedSheetId = sheet.id;

    const entryStates = [...new Set(resolved.map((entry) => entry.status))].join('/');
    console.log(
      `    ✓ ${spec.status.padEnd(9)} ${users[spec.tutor].email.padEnd(34)} "${spec.name}" — ${resolved.length} entries (${entryStates}), ${totalHours}h`,
    );
    if (spec.overCap) {
      console.log(`      ⚠  above the ${SETTINGS.find(([key]) => key === TUTOR_MONTHLY_CLAIMABLE_HOURS)[1]}h monthly cap — submitting it triggers the guard`);
    }
  }

  // ── 12. Sessions (excuse / volunteer lifecycle + teaching history) ──
  console.log('\n📆  Creating sessions...\n');

  for (const session of SESSIONS) {
    await prisma.session.create({
      data: {
        assignmentId: assignmentIds[`${session.user}:${session.course}`],
        courseSlotId: courseSlotIds[`${session.course}:${session.day}`],
        date: session.when === 'upcoming' ? nextWeekday(session.day, session.weeks) : mostRecentWeekday(session.day, session.weeks),
        status: session.status,
        ...(session.excuseReason ? { excuseReason: session.excuseReason } : {}),
      },
    });
    console.log(`    ✓ ${session.status.padEnd(10)} ${session.course} (${session.user})`);
  }

  // ── 13. Overflow work ──
  console.log('\n🤝  Creating overflow work...\n');

  for (const work of OVERFLOW_WORK) {
    await prisma.overflowWork.create({
      data: {
        courseId: courses[work.course].id,
        description: work.description,
        hours: work.hours,
        postedBy: users[work.postedBy].id,
        claimedBy: work.claimedBy ? users[work.claimedBy].id : null,
        status: work.status,
      },
    });
    console.log(`    ✓ ${work.status.padEnd(8)} ${work.course} — ${work.description}`);
  }

  // ── 14. Email log ──
  console.log('\n✉️  Creating email log entries...\n');

  const emailLogs = [
    {
      eventType: 'ASSIGNMENT_ADDED', entityType: 'TutorAssignment',
      entityId: assignmentIds['alex:COMS1015'], recipient: 'alex',
      status: 'SENT', subject: 'You have been assigned to COMS1015 - Introduction to Programming',
      attemptedAt: daysAgo(22), sentAt: daysAgo(22),
    },
    {
      eventType: 'TIMESHEET_APPROVED', entityType: 'Timesheet',
      entityId: approvedSheetId, recipient: 'sarahJ',
      status: 'SENT', subject: `Your timesheet #${approvedSheetId} has been approved`,
      attemptedAt: daysAgo(22), sentAt: daysAgo(22),
    },
    {
      // David's rejection notification never went out — the sending domain was
      // not yet verified in Brevo at the time.
      eventType: 'TIMESHEET_REJECTED', entityType: 'Timesheet',
      entityId: rejectedSheetId, recipient: 'david',
      status: 'FAILED', subject: `Your timesheet #${rejectedSheetId} has been rejected`,
      attemptedAt: daysAgo(19), errorMessage: 'Brevo API returned 400 — sender email not verified',
    },
    {
      // Stuck-timesheet reminder to the supervising lecturer, in flight right now
      eventType: 'TIMESHEET_STUCK_REMINDER', entityType: 'Timesheet',
      entityId: submittedSheetId, recipient: 'sarahV',
      status: 'PENDING', subject: `Reminder: timesheet #${submittedSheetId} (Alex Mercer) has been awaiting approval for 2 days`,
      attemptedAt: minutesAgo(20),
    },
  ];

  for (const log of emailLogs) {
    const recipient = users[log.recipient];
    await prisma.emailLog.create({
      data: {
        eventType: log.eventType,
        entityType: log.entityType,
        entityId: log.entityId,
        dedupeKey: `${log.eventType}:${log.entityType}:${log.entityId}:${recipient.email}`,
        recipientEmail: recipient.email,
        recipientUserId: recipient.id,
        status: log.status,
        subject: log.subject,
        attemptedAt: log.attemptedAt,
        sentAt: log.sentAt ?? null,
        errorMessage: log.errorMessage ?? null,
      },
    });
    console.log(`    ✓ ${log.status.padEnd(8)} ${log.eventType} → ${recipient.email}`);
  }

  // ── 15. System settings ──
  console.log('\n⚙️  Creating system settings...\n');

  for (const [key, value] of SETTINGS) {
    await prisma.systemSetting.create({ data: { key, value } });
    console.log(`    ✓ ${key.padEnd(34)} = ${value}`);
  }
  console.log('    (PDF template setting is left untouched — upload one via Settings to enable PDF export)');

  // ── 16. Verify what was actually written ──
  await printStatusCoverage();

  printLoginInstructions();
}

// Queries the database back and prints the real status coverage, so the
// presenter can trust that every state exists.
async function printStatusCoverage() {
  const [
    usersByRole,
    inactiveCount,
    appStatuses,
    roleAppStatuses,
    sheetStatuses,
    entryStatuses,
    sessionStatuses,
    overflowStatuses,
    emailStatuses,
    courseList,
  ] = await Promise.all([
    prisma.user.groupBy({ by: ['role'], _count: { _all: true } }),
    prisma.user.count({ where: { isActive: false } }),
    prisma.application.groupBy({ by: ['status'], _count: { _all: true } }),
    prisma.roleApplication.groupBy({ by: ['status'], _count: { _all: true } }),
    prisma.timesheet.groupBy({ by: ['status'], _count: { _all: true } }),
    prisma.timesheetEntry.groupBy({ by: ['status'], _count: { _all: true } }),
    prisma.session.groupBy({ by: ['status'], _count: { _all: true } }),
    prisma.overflowWork.groupBy({ by: ['status'], _count: { _all: true } }),
    prisma.emailLog.groupBy({ by: ['status'], _count: { _all: true } }),
    prisma.course.findMany({
      include: { _count: { select: { assignments: true, applications: true } } },
      orderBy: { courseCode: 'asc' },
    }),
  ]);

  const tally = (rows) => rows.map((row) => `${row.status} ${row._count._all}`).join(' · ');
  const roleTally = usersByRole.map((row) => `${row.role} ${row._count._all}`).join(' · ');

  console.log('\n' + '═'.repeat(72));
  console.log('📊  Status coverage (verified from the database)\n');
  console.log(`    Users               : ${roleTally}${inactiveCount ? ` (${inactiveCount} deactivated)` : ''}`);
  console.log(`    Course applications : ${tally(appStatuses)}`);
  console.log(`    Role applications   : ${tally(roleAppStatuses)}`);
  console.log(`    Timesheets          : ${tally(sheetStatuses)}`);
  console.log(`    Timesheet entries   : ${tally(entryStatuses)}`);
  console.log(`    Sessions            : ${tally(sessionStatuses)}`);
  console.log(`    Overflow work       : ${tally(overflowStatuses)}`);
  console.log(`    Email log           : ${tally(emailStatuses)}`);
  console.log('\n    Course allocation:');

  for (const course of courseList) {
    const assigned = course._count.assignments;
    const capacity = `${assigned}/${course.tutorsRequired}`;
    const flags = [
      course.acceptingApplications ? 'accepting' : 'closed',
      assigned >= course.tutorsRequired ? 'AT CAPACITY' : null,
      course._count.applications ? `${course._count.applications} applications` : 'no applications yet',
    ].filter(Boolean);
    console.log(
      `      ${course.courseCode.padEnd(9)} ${course.courseName.padEnd(30)} ${capacity.padEnd(5)} ${flags.join(' · ')}`,
    );
  }
  console.log('═'.repeat(72));
}

function printLoginInstructions() {
  const line = '─'.repeat(72);

  console.log('\n' + '═'.repeat(72));
  console.log('✅  Seed complete — TutorFlow demo dataset is ready\n');
  console.log(`    Log in on the app's login page with any account below.`);
  console.log(`    Every account uses the same password: ${PASSWORD}\n`);
  console.log('    ROLE        EMAIL                              NOTE');
  console.log(`    ${'─'.repeat(68)}`);

  const notes = {
    organiser: 'reviews applications, assigns tutors, settings',
    admin: 'admin view',
    sarahV: 'lecturer — COMS1015, COMS3055',
    james: 'lecturer — MATH2002, MATH1014, APHY1004',
    alex: 'tutor — draft + submitted timesheets',
    sarahJ: 'tutor — approved timesheet (PDF export)',
    david: 'tutor — rejected timesheet to resubmit',
    priya: 'tutor — over-cap draft (hours guard)',
    marcus: 'tutor — fresh submitted timesheet',
    thabo: 'student — 2 pending applications, locked slots',
    lerato: 'student — pending on a FULL course',
    nomsa: 'student — approved, not yet assigned',
    sipho: 'student — pending application',
    refilwe: 'student — pending tutor role application',
    kabelo: 'student — pending lecturer role application',
    sizwe: 'student — rejected tutor role application',
    zanele: 'DEACTIVATED — login shows account disabled',
  };

  for (const user of USERS) {
    console.log(
      `    ${user.role.padEnd(11)} ${user.email.padEnd(34)} ${notes[user.key] || ''}`,
    );
  }

  console.log(`\n    ${line}`);
  console.log('    Suggested presentation walkthrough:\n');
  console.log('    1. Organiser (organiser@tutorflow.test): the course board shows');
  console.log('       COMS1015 2/5, MATH2002 3/3 (at capacity) and MATH1014 closed 2/2.');
  console.log('    2. Student (thabo.mokoena@tutorflow.test): Applications shows the open');
  console.log('       APHY1004 opportunity (0/2) — apply to it live. My Applications shows');
  console.log('       PENDING entries. Edit Timetable shows locked slots (Mon 08:00,');
  console.log('       Wed 10:00) held by the pending COMS1015 application.');
  console.log('    3. Tutor (alex.mercer@tutorflow.test): Timesheets — edit the draft by');
  console.log('       claiming unclaimed past events, then submit it.');
  console.log('    4. Tutor (priya.nair@tutorflow.test): her draft totals 11h inside a');
  console.log('       31-day window — submitting it triggers the 10h cap guard.');
  console.log('    5. Event-driven scheduling — Lecturer (lecturer@tutorflow.test): an');
  console.log("       event added on the Events page becomes every assigned tutor's");
  console.log('       next session. Tutor (marcus.webb@tutorflow.test): his dashboard');
  console.log('       derives those sessions from the events, and his excused Monday');
  console.log('       COMS1015 session is open for a student volunteer.');
  console.log('    6. Lecturer (lecturer@tutorflow.test): Timesheets → pending review —');
  console.log("       Alex's mid-review sheet (APPROVED/REJECTED/PENDING entries) and");
  console.log("       Marcus's fresh submission; approve entries one by one.");
  console.log('    7. Tutor (david.kim@tutorflow.test): the rejected timesheet shows the');
  console.log('       rejection reason; edit and resubmit it.');
  console.log('    8. Deactivated account (zanele.mthembu@tutorflow.test): login is');
  console.log('       refused because the Firebase account is disabled.');
  console.log('    9. Settings (organiser): the claimable-hours cap (10h), claim window');
  console.log('       (3 months) and hourly rates are pre-configured. Upload a PDF');
  console.log("       template there to unlock exporting Sarah Jenkins' approved sheet.");
  console.log(`\n    ${line}`);
  console.log('    Re-run any time — the seed is idempotent (full reset + recreate):');
  console.log('        cd backend');
  console.log('        npm run seed');
  console.log('═'.repeat(72) + '\n');
}

main()
  .catch((e) => {
    console.error('\n❌  Seed failed:\n', e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
