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
  await prisma.tutorAssignment.deleteMany({
    where: { applicant: { user: { email: { in: testEmails } } } },
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

  // ── 5. Create CourseSlots (timetable) ───────────────────────────────
  console.log("\n📅 Creating CourseSlots...\n");

  const slots = [
    { code: "COMS1015", day: 1, start: 8 * 60,       end: 9 * 60 + 30  }, // Mon 08:00–09:30
    { code: "COMS1015", day: 3, start: 10 * 60,      end: 11 * 60 + 30 }, // Wed 10:00–11:30
    { code: "MATH2002", day: 2, start: 11 * 60,      end: 12 * 60 + 30 }, // Tue 11:00–12:30
    { code: "MATH2002", day: 4, start: 14 * 60,      end: 15 * 60 + 30 }, // Thu 14:00–15:30
    { code: "COMS3055", day: 1, start: 13 * 60,      end: 14 * 60 + 30 }, // Mon 13:00–14:30
    { code: "COMS3055", day: 5, start: 9 * 60,       end: 10 * 60 + 30 }, // Fri 09:00–10:30
  ];

  for (const s of slots) {
    await prisma.courseSlot.create({
      data: {
        courseId: courses[s.code].id,
        dayOfWeek: s.day,
        startMinute: s.start,
        endMinute: s.end,
      },
    });
  }
  console.log(`  ✓ ${slots.length} course slots created`);

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

  // ── 8. Mark Alex as ACCEPTED for COMS1015 ───────────────────────────
  // Already done above via the applicant update
  console.log("  ✓ Alex's application status set to ASSIGNED (verified badge)");

  // ── Done! ───────────────────────────────────────────────────────────
  console.log("\n" + "═".repeat(60));
  console.log("✅  Seed complete!\n");
  console.log("  Loggable accounts (password: " + PASSWORD + "):\n");
  console.log("    🏢 Organiser  →  organiser@tutorflow.test");
  console.log("    🎓 Lecturer   →  lecturer@tutorflow.test");
  console.log("    🧑 Student    →  alex@tutorflow.test");
  console.log("");
  console.log("  Board state after seed:\n");
  console.log("    COMS1015 (Intro to Programming):");
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
