/**
 * Sample data for the landing page's DashboardPreview. Shapes match what the
 * real pages pass to their presentational components, so the preview renders
 * through exactly the same code as the app.
 */

// ── Tutor dashboard ────────────────────────────────────────────────────

export const TUTOR_COURSES = [
  {
    assignmentId: 1,
    courseCode: "COMS1018A",
    courseName: "Introduction to Data Structures",
    allocatedHours: 40,
    lecturerName: "Dr. Naidoo",
  },
  {
    assignmentId: 2,
    courseCode: "COMS2002A",
    courseName: "Algorithms and Complexity",
    allocatedHours: 24,
    lecturerName: "Prof. Mokoena",
  },
];

// Dates are generated relative to today so the preview always reads
// "Today" / "Tomorrow" instead of going stale.
export const buildTutorSessions = () => {
  const daysFromNow = (days) => {
    const date = new Date();
    date.setDate(date.getDate() + days);
    date.setHours(12, 0, 0, 0);
    return date.toISOString();
  };

  return [
    {
      id: "preview-1",
      date: daysFromNow(0),
      status: "SCHEDULED",
      timeLabel: "14:00 – 15:30",
      course: { courseCode: "COMS1018A", courseName: "Introduction to Data Structures" },
      courseSlot: { venue: "Lab 3", sessionType: "Tutorial" },
    },
    {
      id: "preview-2",
      date: daysFromNow(1),
      status: "SCHEDULED",
      timeLabel: "10:00 – 11:00",
      course: { courseCode: "COMS2002A", courseName: "Algorithms and Complexity" },
      courseSlot: { venue: "Room 402", sessionType: "Tutorial" },
    },
    {
      id: "preview-3",
      date: daysFromNow(1),
      status: "UNASSIGNED",
      timeLabel: "13:00 – 14:00",
      excuseReason: "Clashing exam invigilation",
      course: { courseCode: "COMS1018A", courseName: "Introduction to Data Structures" },
      courseSlot: { venue: "Lab 1", sessionType: "Practical" },
    },
    {
      id: "preview-4",
      date: daysFromNow(3),
      status: "SCHEDULED",
      timeLabel: "09:00 – 10:30",
      course: { courseCode: "COMS2002A", courseName: "Algorithms and Complexity" },
      courseSlot: { venue: "Room 402", sessionType: "Tutorial" },
    },
  ];
};

// ── Organiser allocation board ─────────────────────────────────────────

export const ORGANISER_COURSES = [
  { id: 1, code: "COMS1015", name: "Introduction to Programming", req: 5, assignedCount: 2 },
  { id: 2, code: "STATS2012", name: "Statistics", req: 10, assignedCount: 3 },
  { id: 3, code: "MATH2002", name: "Discrete Mathematics", req: 3, assignedCount: 3 },
  { id: 4, code: "COMS3055", name: "Database Systems", req: 4, assignedCount: 4 },
];

export const ORGANISER_AVAILABLE = [
  {
    id: "applicant-11",
    applicantId: 11,
    name: "Thandi Mokoena",
    courseMark: 84,
    applicationStatus: "ACCEPTED",
    verified: true,
    clash: false,
  },
  {
    id: "applicant-12",
    applicantId: 12,
    name: "Ryan Pillay",
    courseMark: 78,
    applicationStatus: "PENDING",
    verified: false,
    clash: true,
  },
  {
    id: "applicant-13",
    applicantId: 13,
    name: "Lerato Dlamini",
    courseMark: 91,
    applicationStatus: "ACCEPTED",
    verified: true,
    clash: false,
  },
];

export const ORGANISER_ASSIGNED = [
  {
    id: "assigned-21",
    applicantId: 21,
    name: "Sipho Nkosi",
    courseMark: null,
    applicationStatus: "ASSIGNED",
    verified: false,
    clash: false,
  },
  {
    id: "assigned-22",
    applicantId: 22,
    name: "Amira Patel",
    courseMark: null,
    applicationStatus: "ASSIGNED",
    verified: false,
    clash: false,
  },
];

// ── Lecturer timesheet review ──────────────────────────────────────────

export const LECTURER_TIMESHEETS = [
  {
    id: 1,
    name: "September 2026",
    tutorName: "Marcus Webb",
    tutorEmail: "marcus.webb@tutorflow.test",
    status: "SUBMITTED",
    entries: [{ duration: 4 }, { duration: 3.5 }],
  },
  {
    id: 2,
    name: "September 2026",
    tutorName: "Priya Naidoo",
    tutorEmail: "priya.naidoo@tutorflow.test",
    status: "SUBMITTED",
    entries: [{ duration: 6 }, { duration: 2 }, { duration: 3 }],
  },
  {
    id: 3,
    name: "September 2026",
    tutorName: "Kabelo Mahlangu",
    tutorEmail: "kabelo.mahlangu@tutorflow.test",
    status: "SUBMITTED",
    entries: [{ duration: 5 }],
  },
];
