require("dotenv/config");
const { PrismaClient } = require("@prisma/client");
const prisma = new PrismaClient();
const getFirebaseAdmin = require("../firebase/admin");

// ────────────────────────────────────────────────────────────────────────
// Test accounts that get real Firebase credentials (loggable in the app)
// ────────────────────────────────────────────────────────────────────────
const PASSWORD = "Test@1234";

// The real inbox used to verify notification emails: this account is seeded
// as a loggable student with applicants in two courses so the organiser can
// test both the assignment email and the max-reached guard.
const TEST_EMAIL = process.env.TEST_EMAIL || "2898909@students.wits.ac.za";

const ACCOUNTS = [
  { email: "organiser@tutorflow.test", first: "Kgaogelo", last: "Molefe",  role: "ORGANISER", empNo: "ORG-001" },
  { email: "lecturer@tutorflow.test",  first: "Sarah",    last: "Van Wyk", role: "LECTURER",  empNo: "EMP-L001" },
  { email: "alex@tutorflow.test",      first: "Alex",     last: "Mercer",  role: "STUDENT",   stuNo: "STU-001" },
  { email: TEST_EMAIL,                  first: "Test",     last: "Student", role: "STUDENT",   stuNo: "STU-TEST" },
];

// ────────────────────────────────────────────────────────────────────────
// Non-loginable users (fake UIDs) — just need DB rows for applicants/tutors
// ────────────────────────────────────────────────────────────────────────
const SYNTHETIC_USERS = [
  { firebaseUid: "seed-sarah-j",   email: "sarah.j@wits.ac.za",      first: "Sarah",   last: "Jenkins", role: "STUDENT", stuNo: "STU-002" },
  { firebaseUid: "seed-david-k",   email: "david.k@wits.ac.za",      first: "David",   last: "Kim",     role: "STUDENT", stuNo: "STU-003" },
  { firebaseUid: "seed-priya-n",   email: "priya.n@wits.ac.za",      first: "Priya",   last: "Nair",    role: "STUDENT", stuNo: "STU-004" },
  { firebaseUid: "seed-marcus-w",  email: "marcus.w@wits.ac.za",     first: "Marcus",  last: "Webb",    role: "STUDENT", stuNo: "STU-005" },
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

  // Delete in reverse-dependency order
  await prisma.roleApplication.deleteMany({
    where: { user: { email: { in: testEmails } } },
  });
  await prisma.tutorAssignment.deleteMany({
    where: { applicant: { user: { email: { in: testEmails } } } },
  });
  await prisma.applicant.deleteMany({
    where: { user: { email: { in: testEmails } } },
  });
  await prisma.availability.deleteMany({
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
  await prisma.timeSlot.deleteMany();
  await prisma.lecturer.deleteMany({
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

  // ── 5. Create TimeSlots (availability grid) ───────────────────────
  console.log("\n\u23f0 Creating TimeSlots...\n");

  const timeSlotDefs = [
    { start: 8 * 60,  end: 9 * 60  },
    { start: 9 * 60,  end: 10 * 60 },
    { start: 10 * 60, end: 11 * 60 },
    { start: 11 * 60, end: 12 * 60 },
    { start: 12 * 60, end: 13 * 60 },
    { start: 13 * 60, end: 14 * 60 },
    { start: 14 * 60, end: 15 * 60 },
    { start: 15 * 60, end: 16 * 60 },
    { start: 16 * 60, end: 17 * 60 },
  ];

  const timeSlots = {};
  for (const ts of timeSlotDefs) {
    const created = await prisma.timeSlot.upsert({
      where: { startMinute_endMinute: { startMinute: ts.start, endMinute: ts.end } },
      update: {},
      create: { startMinute: ts.start, endMinute: ts.end },
    });
    timeSlots[`${ts.start}`] = created;
  }
  console.log(`  \u2713 ${timeSlotDefs.length} time slots created`);

  // ── 6. Create CourseSlots (timetable) ───────────────────────────────
  console.log("\n📅 Creating CourseSlots...\n");

  const courseSlotDefs = [
    { code: "COMS1015", day: 1, start: 8 * 60  }, // Mon 08:00
    { code: "COMS1015", day: 3, start: 10 * 60 }, // Wed 10:00
    { code: "MATH2002", day: 2, start: 11 * 60 }, // Tue 11:00
    { code: "MATH2002", day: 4, start: 14 * 60 }, // Thu 14:00
    { code: "COMS3055", day: 1, start: 13 * 60 }, // Mon 13:00
    { code: "COMS3055", day: 5, start: 9 * 60  }, // Fri 09:00
  ];

  for (const s of courseSlotDefs) {
    await prisma.courseSlot.create({
      data: {
        courseId: courses[s.code].id,
        dayOfWeek: s.day,
        timeSlotId: timeSlots[`${s.start}`].id,
      },
    });
  }
  console.log(`  ✓ ${courseSlotDefs.length} course slots created`);

  // ── 7. Availability for the TEST_EMAIL user ─────────────────────
  // Covers every seeded course slot, so all courses show up as eligible
  // (non-clashing) if the user applies through the tutor application form.
  console.log(`\n📅 Creating availability for ${TEST_EMAIL}...\n`);

  const testUserAvailability = [
    { day: 1, start: 8 * 60 },  // Mon 08:00 (COMS1015)
    { day: 3, start: 10 * 60 }, // Wed 10:00 (COMS1015)
    { day: 2, start: 11 * 60 }, // Tue 11:00 (MATH2002)
    { day: 4, start: 14 * 60 }, // Thu 14:00 (MATH2002)
    { day: 1, start: 13 * 60 }, // Mon 13:00 (COMS3055)
    { day: 5, start: 9 * 60 },  // Fri 09:00 (COMS3055)
  ];

  for (const a of testUserAvailability) {
    await prisma.availability.create({
      data: {
        userId: users[TEST_EMAIL].id,
        dayOfWeek: a.day,
        timeSlotId: timeSlots[`${a.start}`].id,
      },
    });
  }
  console.log(`  ✓ ${testUserAvailability.length} availability slots for the test email user`);

  // ── 8. Create Applicants (Available Tutors pool) ────────────────────
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
    // TEST_EMAIL user — applicant in two courses so both new features can
    // be exercised: assign them on COMS1015 (below cap → email fires) and
    // try to add them on MATH2002 (at cap → max-reached popup).
    { email: TEST_EMAIL, code: "COMS1015", mark: 90 },
    { email: TEST_EMAIL, code: "MATH2002", mark: 80 },
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

  // ── 9. Pre-assign tutors (Assigned Tutors pool) ───────────────────
  console.log("\n📌 Pre-assigning tutors (TutorAssignments)...\n");

  // Create Tutor rows for the pre-assigned students first
  const preassignedEmails = [
    "alex@tutorflow.test",
    "sarah.j@wits.ac.za",
    "priya.n@wits.ac.za",
    "marcus.w@wits.ac.za",
  ];
  const tutorRows = {};

  for (const email of preassignedEmails) {
    tutorRows[email] = await prisma.tutor.create({
      data: {
        userId: users[email].id,
        hourlyRate: null,
        maxHoursPerWeek: 10,
        status: "ACTIVE",
      },
    });
  }

  // Helper — assign one seeded applicant to a course and mark them ASSIGNED
  async function preassign(email, code) {
    const applicant = await prisma.applicant.findFirst({
      where: {
        userId: users[email].id,
        courseId: courses[code].id,
      },
    });

    await prisma.tutorAssignment.create({
      data: {
        tutorId: tutorRows[email].id,
        courseId: courses[code].id,
        applicantId: applicant.id,
        allocatedHours: 5,
        semester: "2026-S2",
        status: "ACTIVE",
      },
    });
    await prisma.applicant.update({
      where: { id: applicant.id },
      data: { status: "ASSIGNED", reviewedAt: new Date() },
    });
    console.log(`  ✓ ${email.padEnd(28)} → ${code}`);
  }

  // COMS1015 — Alex assigned (mark 92) → 1/5 filled
  await preassign("alex@tutorflow.test", "COMS1015");

  // MATH2002 — all three applicants assigned → 3/3 filled (AT CAPACITY).
  // The TEST_EMAIL applicant stays in this course's available pool, so
  // trying to assign them triggers the max-reached guard + popup.
  await preassign("sarah.j@wits.ac.za", "MATH2002");
  await preassign("priya.n@wits.ac.za", "MATH2002");
  await preassign("marcus.w@wits.ac.za", "MATH2002");

  // COMS3055 — Priya assigned (mark 95) → 1/4 filled
  await preassign("priya.n@wits.ac.za", "COMS3055");

  // ── 10. Alex's verified badge ──────────────────────────────────────
  // Alex's applicant status is ASSIGNED from the preassign helper above,
  // which the board renders as the verified badge.
  console.log("  \u2713 Alex's application status set to ASSIGNED (verified badge)");

  // ── Done! ───────────────────────────────────────────────────────
  console.log("\n" + "═".repeat(60));
  console.log("✅  Seed complete!\n");
  console.log("  Loggable accounts (password: " + PASSWORD + "):\n");
  console.log("    🏢 Organiser  →  organiser@tutorflow.test");
  console.log("    🎓 Lecturer   →  lecturer@tutorflow.test");
  console.log("    🧑 Student    →  alex@tutorflow.test");
  console.log(`    🧪 Test email →  ${TEST_EMAIL} (receives assignment notifications)`);
  console.log("");
  console.log("  Board state after seed:\n");
  console.log("    COMS1015 (Intro to Programming) — 1/5 filled:");
  console.log("      Assigned:  Alex Mercer (verified/ASSIGNED)");
  console.log("      Available: Sarah Jenkins, David Kim, Thabo Mokoena, Lerato Khumalo, Test Student");
  console.log("");
  console.log("    MATH2002 (Discrete Mathematics) — 3/3 filled (AT CAPACITY):");
  console.log("      Assigned:  Sarah Jenkins, Priya Nair, Marcus Webb");
  console.log("      Available: Test Student (assigning them shows the max-reached popup)");
  console.log("");
  console.log("    COMS3055 (Database Systems) — 1/4 filled:");
  console.log("      Assigned:  Priya Nair");
  console.log("      Available: Marcus Webb, Thabo Mokoena, Lerato Khumalo");
  console.log("");
  console.log("  How to test the new features:");
  console.log("    1. Assignment email: as organiser, open COMS1015 and assign");
  console.log(`       'Test Student' (${TEST_EMAIL}) — they receive an email.`);
  console.log("    2. Max-reached popup: as organiser, open MATH2002 (3/3 full)");
  console.log("       and try to assign 'Test Student' — a dialog explains the");
  console.log("       course is fully staffed and they stay in the pool.");
  console.log("    3. Course-specific pool: each course now only lists the");
  console.log("       applicants who applied to tutor THAT course.");
  console.log("");
  console.log("  Run with:  cd backend && node prisma/seed.js");
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
