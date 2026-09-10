require("dotenv/config");
const { PrismaClient } = require("@prisma/client");
const prisma = new PrismaClient();
const getFirebaseAdmin = require("../firebase/admin");

// ────────────────────────────────────────────────────────────────────────
// Test accounts that get real Firebase credentials (loggable in the app)
// ────────────────────────────────────────────────────────────────────────
const PASSWORD = "Test@1234";

const ACCOUNTS = [
  { email: "organiser@tutorflow.test", first: "Kgaogelo", last: "Molefe",  role: "ORGANISER", empNo: "ORG-001" },
  { email: "lecturer@tutorflow.test",  first: "Sarah",    last: "Van Wyk", role: "LECTURER",  empNo: "EMP-L001" },
  { email: "alex@tutorflow.test",      first: "Alex",     last: "Mercer",  role: "STUDENT",   stuNo: "STU-001" },
  // Excuse / volunteer feature accounts (issue #37):
  //   tutor.demo   → signs in, sees the Tutor Dashboard, can excuse a session
  //   student.demo → signs in, sees the Volunteer View, can apply to volunteer
  //   nduvo.demo   → pre-loads a PENDING volunteer request (conflict path)
  { email: "tutor.demo@wits.ac.za",   first: "Thabo",  last: "Demotutor",    role: "TUTOR",   stuNo: "1234567" },
  { email: "student.demo@wits.ac.za", first: "Lerato", last: "Demostudent",  role: "STUDENT", stuNo: "7654321" },
  { email: "nduvo.demo@wits.ac.za",   first: "Nduvho", last: "Demovolunteer", role: "STUDENT", stuNo: "9876543" },
];

// ────────────────────────────────────────────────────────────────────────
// Non-loginable users (fake UIDs) — just need DB rows for applicants/tutors
// ────────────────────────────────────────────────────────────────────────
const SYNTHETIC_USERS = [
  { firebaseUid: "seed-sarah-j",   email: "sarah.j@wits.ac.za",      first: "Sarah",   last: "Jenkins", role: "STUDENT", stuNo: "STU-002" },
  { firebaseUid: "seed-david-k",   email: "david.k@wits.ac.za",      first: "David",   last: "Kim",     role: "STUDENT", stuNo: "STU-003" },
  { firebaseUid: "seed-priya-n",   email: "priya.n@wits.ac.za",      first: "Priya",   last: "Nair",    role: "STUDENT", stuNo: "STU-004" },
  { firebaseUid: "seed-marcus-w",  email: "marcus.w@wits.ac.za",     first: "Marcus", last: "Webb",    role: "STUDENT", stuNo: "STU-005" },
  { firebaseUid: "seed-thabo-m",   email: "thabo.m@wits.ac.za",      first: "Thabo",   last: "Mokoena", role: "STUDENT", stuNo: "STU-006" },
  { firebaseUid: "seed-lerato-k",  email: "lerato.k@wits.ac.za",     first: "Lerato",  last: "Khumalo", role: "STUDENT", stuNo: "STU-007" },
];

// ────────────────────────────────────────────────────────────────────────
// Course definitions
// ────────────────────────────────────────────────────────────────────────
const COURSES = [
  { courseCode: "COMS1015", courseName: "Introduction to Programming",  minimumMark: 65, requiredTutors: 5, budgetHours: 40, hourlyRate: 150 },
  { courseCode: "MATH2002", courseName: "Discrete Mathematics",         minimumMark: 60, requiredTutors: 3, budgetHours: 25, hourlyRate: 160 },
  { courseCode: "COMS3055", courseName: "Database Systems",             minimumMark: 65, requiredTutors: 4, budgetHours: 35, hourlyRate: 155 },
];

// The tutor whose sessions exercise the excuse flow (issue #37).
const FEATURE_TUTOR_EMAIL = "tutor.demo@wits.ac.za";

// ────────────────────────────────────────────────────────────────────────
// Helper — create or fetch a Firebase user
// ────────────────────────────────────────────────────────────────────────
async function ensureFirebaseUser(auth, email, displayName) {
  try {
    const existing = await auth.getUserByEmail(email);
    await auth.updateUser(existing.uid, { password: PASSWORD });
    console.log(`  ✓ Firebase user exists: ${email}`);
    return existing.uid;
  } catch (err) {
    if (err.code === "auth/user-not-found") {
      const created = await auth.createUser({ email, password: PASSWORD, displayName });
      console.log(`  + Firebase user created: ${email}`);
      return created.uid;
    }
    throw err;
  }
}

// Returns the next occurrence of a weekday (0 = Sunday) at the given time.
const nextWeekdayAt = (weekday, hour, minute) => {
  const date = new Date();
  const daysAhead = (weekday - date.getDay() + 7) % 7 || 7;
  date.setDate(date.getDate() + daysAhead);
  date.setHours(hour, minute, 0, 0);
  return date;
};

// ────────────────────────────────────────────────────────────────────────
// Time slots (minutes since midnight)
// ────────────────────────────────────────────────────────────────────────
// Availability timetable slots — the grid used by Profile / Edit Timetable.
const AVAILABILITY_TIME_SLOTS = [
  { startMinute: 480,  endMinute: 525  }, // 08:00-08:45
  { startMinute: 540,  endMinute: 585  }, // 09:00-09:45
  { startMinute: 615,  endMinute: 660  }, // 10:15-11:00
  { startMinute: 675,  endMinute: 720  }, // 11:15-12:00
  { startMinute: 750,  endMinute: 795  }, // 12:30-13:15
  { startMinute: 855,  endMinute: 900  }, // 14:15-15:00
  { startMinute: 915,  endMinute: 960  }, // 15:15-16:00
  { startMinute: 975,  endMinute: 1020 }, // 16:15-17:00
];

// Course-timing slots — the ranges the course slots below are taught in.
// (CourseSlot references a TimeSlot via timeSlotId, so these must exist first.)
const COURSE_TIME_SLOTS = [
  { startMinute: 480, endMinute: 570 }, // 08:00-09:30
  { startMinute: 540, endMinute: 630 }, // 09:00-10:30
  { startMinute: 600, endMinute: 690 }, // 10:00-11:30
  { startMinute: 660, endMinute: 750 }, // 11:00-12:30
  { startMinute: 780, endMinute: 870 }, // 13:00-14:30
  { startMinute: 840, endMinute: 930 }, // 14:00-15:30
];

// ────────────────────────────────────────────────────────────────────────
// Course slot definitions (course + weekday + the time range above)
// ────────────────────────────────────────────────────────────────────────
const COURSE_SLOT_DEFS = [
  { code: "COMS1015", day: 1, start: 8 * 60,      end: 9 * 60 + 30  }, // Mon 08:00–09:30
  { code: "COMS1015", day: 3, start: 10 * 60,     end: 11 * 60 + 30 }, // Wed 10:00–11:30
  { code: "MATH2002", day: 2, start: 11 * 60,     end: 12 * 60 + 30 }, // Tue 11:00–12:30
  { code: "MATH2002", day: 4, start: 14 * 60,     end: 15 * 60 + 30 }, // Thu 14:00–15:30
  { code: "COMS3055", day: 1, start: 13 * 60,     end: 14 * 60 + 30 }, // Mon 13:00–14:30
  { code: "COMS3055", day: 5, start: 9 * 60,      end: 10 * 60 + 30 }, // Fri 09:00–10:30
];

// ────────────────────────────────────────────────────────────────────────
// Clean up previous seed runs (safe — only removes seed-generated data)
// ────────────────────────────────────────────────────────────────────────
async function cleanup() {
  console.log("\n🧹 Cleaning up previous seed data...\n");

  const testEmails = [
    ...ACCOUNTS.map((a) => a.email),
    ...SYNTHETIC_USERS.map((u) => u.email),
  ];
  const seedUids = SYNTHETIC_USERS.map((u) => u.firebaseUid);
  const tutorEmails = [FEATURE_TUTOR_EMAIL];

  // Delete in reverse-dependency order.
  // Volunteers and sessions first — they reference assignments and course slots.
  await prisma.sessionVolunteer.deleteMany({
    where: { user: { email: { in: testEmails } } },
  });
  await prisma.session.deleteMany({
    where: {
      assignment: {
        OR: [
          { tutor: { user: { email: { in: tutorEmails } } } },
          { applicant: { user: { email: { in: testEmails } } } },
        ],
      },
    },
  });
  await prisma.tutorAssignment.deleteMany({
    where: {
      OR: [
        { applicant: { user: { email: { in: testEmails } } } },
        { tutor: { user: { email: { in: tutorEmails } } } },
      ],
    },
  });
  await prisma.applicant.deleteMany({
    where: { user: { email: { in: testEmails } } },
  });
  await prisma.tutor.deleteMany({
    where: { user: { email: { in: testEmails } } },
  });
  await prisma.courseSlot.deleteMany({
    where: { course: { courseCode: { in: COURSES.map((c) => c.courseCode) } } },
  });
  await prisma.course.deleteMany({
    where: { courseCode: { in: COURSES.map((c) => c.courseCode) } },
  });
  await prisma.lecturer.deleteMany({
    where: { user: { email: { in: testEmails } } },
  });
  await prisma.availability.deleteMany({
    where: { user: { email: { in: testEmails } } },
  });
  await prisma.user.deleteMany({
    where: { OR: [{ email: { in: testEmails } }, { firebaseUid: { in: seedUids } }] },
  });

  console.log("  Cleanup complete.\n");
}

// ────────────────────────────────────────────────────────────────────────
// Main seed
// ────────────────────────────────────────────────────────────────────────
async function main() {
  const { getAuth } = getFirebaseAdmin();
  const auth = getAuth();

  await cleanup();

  // ── 1. Create loggable Firebase accounts ────────────────────────────
  console.log("👤 Creating Firebase accounts...\n");

  const firebaseUids = {};
  for (const acct of ACCOUNTS) {
    firebaseUids[acct.email] = await ensureFirebaseUser(
      auth,
      acct.email,
      `${acct.first} ${acct.last}`
    );
  }

  // ── 2. Create all User rows ─────────────────────────────────────────
  console.log("👤 Creating User records...\n");

  const users = {};

  // Loggable accounts
  for (const acct of ACCOUNTS) {
    users[acct.email] = await prisma.user.create({
      data: {
        firebaseUid: firebaseUids[acct.email],
        firstName: acct.first,
        lastName: acct.last,
        email: acct.email,
        role: acct.role,
        employeeNumber: acct.empNo ?? null,
        studentNumber: acct.stuNo ?? null,
      },
    });
  }

  // Synthetic (non-loginable) users
  for (const u of SYNTHETIC_USERS) {
    users[u.email] = await prisma.user.create({
      data: {
        firebaseUid: u.firebaseUid,
        firstName: u.first,
        lastName: u.last,
        email: u.email,
        role: u.role,
        studentNumber: u.stuNo ?? null,
      },
    });
  }

  // ── 3. Create the Lecturer profile ──────────────────────────────────
  console.log("🎓 Creating Lecturer profile...\n");

  const lecturer = await prisma.lecturer.create({
    data: {
      userId: users["lecturer@tutorflow.test"].id,
      department: "Computer Science and Applied Mathematics",
      officeLocation: "Maths Building, Room 204",
      officeHours: "Mon/Wed 14:00–16:00",
    },
  });

  console.log(`  ✓ Lecturer "${lecturer.id}" linked to user ${users["lecturer@tutorflow.test"].id}`);

  // ── 4. Create Courses ───────────────────────────────────────────────
  console.log("\n📚 Creating Courses...\n");

  const courses = {};
  for (const c of COURSES) {
    courses[c.courseCode] = await prisma.course.create({
      data: {
        ...c,
        lecturerId: lecturer.id,  // Lecturer table id, NOT user id
      },
    });
    console.log(`  ✓ ${c.courseCode} – ${c.courseName}`);
  }

  // ── 5. Create TimeSlots + CourseSlots (timetable) ───────────────────
  console.log("\n📅 Creating TimeSlots and CourseSlots...\n");

  const timeSlots = {};
  for (const slot of [...AVAILABILITY_TIME_SLOTS, ...COURSE_TIME_SLOTS]) {
    timeSlots[`${slot.startMinute}-${slot.endMinute}`] = await prisma.timeSlot.upsert({
      where: { startMinute_endMinute: { startMinute: slot.startMinute, endMinute: slot.endMinute } },
      update: {},
      create: slot,
    });
  }

  const courseSlots = {};
  for (const s of COURSE_SLOT_DEFS) {
    // A course slot is identified by course + weekday; reuse it if a previous
    // run left one behind, otherwise create it against its TimeSlot.
    let slot = await prisma.courseSlot.findFirst({
      where: { courseId: courses[s.code].id, dayOfWeek: s.day },
    });
    if (!slot) {
      slot = await prisma.courseSlot.create({
        data: {
          courseId: courses[s.code].id,
          dayOfWeek: s.day,
          timeSlotId: timeSlots[`${s.start}-${s.end}`].id,
        },
      });
    }
    courseSlots[`${s.code}-${s.day}`] = slot;
  }
  console.log(`  ✓ ${COURSE_SLOT_DEFS.length} course slots created`);

  // ── 6. Create Applicants (Available Tutors pool) ────────────────────
  console.log("\n📋 Creating Applicants (available tutors)...\n");

  const applicantData = [
    // COMS1015 applicants — varied marks for ranking
    { email: "alex@tutorflow.test",    code: "COMS1015", mark: 92 },
    { email: "sarah.j@wits.ac.za",     code: "COMS1015", mark: 88 },
    { email: "david.k@wits.ac.za",     code: "COMS1015", mark: 85 },
    { email: "thabo.m@wits.ac.za",     code: "COMS1015", mark: 78 },
    { email: "lerato.k@wits.ac.za",    code: "COMS1015", mark: 74 },
    // MATH2002 applicants
    { email: "sarah.j@wits.ac.za",     code: "MATH2002", mark: 91 },
    { email: "priya.n@wits.ac.za",     code: "MATH2002", mark: 84 },
    { email: "marcus.w@wits.ac.za",    code: "MATH2002", mark: 72 },
    // COMS3055 applicants
    { email: "priya.n@wits.ac.za",     code: "COMS3055", mark: 95 },
    { email: "marcus.w@wits.ac.za",    code: "COMS3055", mark: 81 },
    { email: "thabo.m@wits.ac.za",     code: "COMS3055", mark: 77 },
    { email: "lerato.k@wits.ac.za",    code: "COMS3055", mark: 70 },
  ];

  for (const a of applicantData) {
    await prisma.applicant.create({
      data: {
        userId: users[a.email].id,
        courseId: courses[a.code].id,
        courseMark: a.mark,
        status: "PENDING",
        availability: "Mon–Fri afternoons",
      },
    });
    console.log(`  ✓ ${a.email.padEnd(28)} → ${a.code}  (mark: ${a.mark}%)`);
  }

  // ── 7. Pre-assign 2 tutors (Assigned Tutors pool) ───────────────────
  console.log("\n📌 Pre-assigning tutors (TutorAssignments)...\n");

  // Create Tutor rows for the pre-assigned students first
  const assignedUsers = ["alex@tutorflow.test", "david.k@wits.ac.za"];
  const tutorRows = {};

  for (const email of assignedUsers) {
    tutorRows[email] = await prisma.tutor.create({
      data: {
        userId: users[email].id,
        hourlyRate: null,
        maxHoursPerWeek: 10,
        availableHours: 10,
        currentHours: 0,
        status: "ACTIVE",
      },
    });
  }

  // COMS1015 — Alex assigned (mark 92, ACCEPTED)
  const alexApplicant = await prisma.applicant.findFirst({
    where: {
      userId: users["alex@tutorflow.test"].id,
      courseId: courses["COMS1015"].id,
    },
  });

  await prisma.tutorAssignment.create({
    data: {
      tutorId: tutorRows["alex@tutorflow.test"].id,
      courseId: courses["COMS1015"].id,
      applicantId: alexApplicant.id,
      allocatedHours: 5,
      semester: "2026-S2",
      status: "ACTIVE",
    },
  });
  await prisma.applicant.update({
    where: { id: alexApplicant.id },
    data: { status: "ASSIGNED", reviewedAt: new Date() },
  });
  console.log("  ✓ Alex Mercer → COMS1015 (ACCEPTED & assigned)");

  // COMS3055 — Priya assigned (mark 95, ASSIGNED)
  const priyaApplicant = await prisma.applicant.findFirst({
    where: {
      userId: users["priya.n@wits.ac.za"].id,
      courseId: courses["COMS3055"].id,
    },
  });

  await prisma.tutorAssignment.create({
    data: {
      courseId: courses["COMS3055"].id,
      applicantId: priyaApplicant.id,
      allocatedHours: 5,
      semester: "2026-S2",
      status: "ACTIVE",
    },
  });
  await prisma.applicant.update({
    where: { id: priyaApplicant.id },
    data: { status: "ASSIGNED", reviewedAt: new Date() },
  });
  console.log("  ✓ Priya Nair  → COMS3055 (assigned, no Tutor row yet)");

  // ── 8. Excuse / volunteer feature data (issue #37) ──────────────────
  console.log("\n🎯 Creating excuse / volunteer feature data...\n");

  // The feature tutor gets a Tutor row and one assignment per course, so the
  // Tutor Dashboard has sessions to excuse.
  const featureTutor = await prisma.tutor.create({
    data: {
      userId: users[FEATURE_TUTOR_EMAIL].id,
      maxHoursPerWeek: 20,
      status: "APPROVED",
    },
  });

  const featureAssignments = {};
  for (const code of ["COMS1015", "COMS3055"]) {
    featureAssignments[code] = await prisma.tutorAssignment.create({
      data: {
        tutorId: featureTutor.id,
        courseId: courses[code].id,
        allocatedHours: code === "COMS1015" ? 6 : 4,
        semester: "2026-S2",
        status: "ACTIVE",
      },
    });
  }

  // COMS1015 — two SCHEDULED sessions plus one already excused (UNASSIGNED).
  await prisma.session.createMany({
    data: [
      { assignmentId: featureAssignments["COMS1015"].id, courseSlotId: courseSlots["COMS1015-1"].id, date: nextWeekdayAt(1, 0, 0), status: "SCHEDULED" },
      { assignmentId: featureAssignments["COMS1015"].id, courseSlotId: courseSlots["COMS1015-3"].id, date: nextWeekdayAt(3, 0, 0), status: "SCHEDULED" },
      { assignmentId: featureAssignments["COMS1015"].id, courseSlotId: courseSlots["COMS1015-1"].id, date: nextWeekdayAt(1, 0, 0), status: "UNASSIGNED", excuseReason: "Medical appointment I could not move" },
    ],
  });

  // COMS3055 — one SCHEDULED session plus one with a PENDING volunteer.
  const pendingSession = await prisma.session.create({
    data: {
      assignmentId: featureAssignments["COMS3055"].id,
      courseSlotId: courseSlots["COMS3055-5"].id,
      date: nextWeekdayAt(5, 0, 0),
      status: "UNASSIGNED",
      excuseReason: "Conference travel",
    },
  });
  await prisma.session.create({
    data: {
      assignmentId: featureAssignments["COMS3055"].id,
      courseSlotId: courseSlots["COMS3055-5"].id,
      date: nextWeekdayAt(5, 0, 0),
      status: "SCHEDULED",
    },
  });

  // Nduvho already volunteered — tests the "already volunteered" error path.
  await prisma.sessionVolunteer.create({
    data: { sessionId: pendingSession.id, userId: users["nduvo.demo@wits.ac.za"].id, status: "PENDING" },
  });
  await prisma.session.update({
    where: { id: pendingSession.id },
    data: { status: "PENDING" },
  });
  console.log("  ✓ 5 sessions across SCHEDULED / UNASSIGNED / PENDING states");
  console.log("  ✓ Nduvho Demovolunteer holds the pending volunteer request");

  // ── Done! ───────────────────────────────────────────────────────────
  console.log("\n" + "═".repeat(60));
  console.log("✅  Seed complete!\n");
  console.log("  Loggable accounts (password: " + PASSWORD + "):\n");
  console.log("    🏢 Organiser → organiser@tutorflow.test");
  console.log("    🎓 Lecturer  → lecturer@tutorflow.test");
  console.log("    🧑 Student   → alex@tutorflow.test");
  console.log("    🧑 Tutor     → tutor.demo@wits.ac.za        (excuse flow)");
  console.log("    🧑 Student   → student.demo@wits.ac.za      (volunteer flow)");
  console.log("    🧑 Student   → nduvo.demo@wits.ac.za        (pending volunteer)");
  console.log("");
  console.log("  Board state after seed:\n");
  console.log("    COMS1015 (Introduction to Programming):");
  console.log("      Assigned:  Alex Mercer (verified/ASSIGNED)");
  console.log("      Available: Sarah Jenkins, David Kim, Thabo Mokoena, Lerato Khumalo");
  console.log("");
  console.log("    MATH2002 (Discrete Mathematics):");
  console.log("      Assigned:  (none)");
  console.log("      Available: Sarah Jenkins, Priya Nair, Marcus Webb");
  console.log("");
  console.log("    COMS3055 (Database Systems):");
  console.log("      Assigned:  Priya Nair");
  console.log("      Available: Marcus Webb, Thabo Mokoena, Lerato Khumalo");
  console.log("");
  console.log("  Excuse / volunteer flow (issue #37):\n");
  console.log("    1. Log in as tutor.demo@wits.ac.za → Tutor Dashboard → 'Excuse Myself' on an Active session.");
  console.log("    2. Log in as student.demo@wits.ac.za → Volunteer View → the excused session appears.");
  console.log("    3. 'Apply to Volunteer' — the session leaves the list (now PENDING).");
  console.log("");
  console.log("  Run with:  cd backend && npm run seed");
  console.log("═".repeat(60) + "\n");
}

main()
  .catch((e) => {
    console.error("\n❌ Seed failed:\n", e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
