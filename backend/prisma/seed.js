require("dotenv/config");
const { PrismaClient } = require("@prisma/client");
const prisma = new PrismaClient();

// Firebase Admin SDK — used to create real login accounts for seeded users.
// Falls back to fake UIDs if the SDK is not configured.
let getFirebaseAdmin = null;
try {
  getFirebaseAdmin = require("../firebase/admin");
} catch {
  // Admin SDK not available — seed will use placeholder UIDs.
}

const TEST_PASSWORD = "Test1234!";

// Creates a Firebase Auth user (or retrieves the existing one) and returns the real UID.
// This lets you log in with the seeded email + TEST_PASSWORD.
async function ensureFirebaseUser(email, firstName, lastName) {
  if (!getFirebaseAdmin) {
    console.warn(`  ⚠  Firebase Admin SDK not configured — using placeholder UID for ${email}`);
    return `seed-${email.split("@")[0]}-uid`;
  }

  const { getAuth } = getFirebaseAdmin();
  const auth = getAuth();

  try {
    const existing = await auth.getUserByEmail(email);
    // Update password so it always matches TEST_PASSWORD (in case it was changed).
    await auth.updateUser(existing.uid, { password: TEST_PASSWORD });
    return existing.uid;
  } catch (error) {
    if (error.code === "auth/user-not-found") {
      const created = await auth.createUser({
        email,
        password: TEST_PASSWORD,
        displayName: `${firstName} ${lastName}`,
      });
      return created.uid;
    }
    throw error;
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

async function main() {
  // ── Lecturer ────────────────────────────────────────────────────────
  const lecturerUid = await ensureFirebaseUser("kg.newuser@wits.ac.za", "Kgaogelo", "Testuser");
  const lecturerUser = await prisma.user.upsert({
    where: { email: "kg.newuser@wits.ac.za" },
    update: { firebaseUid: lecturerUid },
    create: {
      firstName: "Kgaogelo",
      lastName: "Testuser",
      email: "kg.newuser@wits.ac.za",
      firebaseUid: lecturerUid,
      role: "LECTURER",
      employeeNumber: "KG-EMP003",
      studentNumber: "N/A-KG003",
    },
  });

  const lecturer = await prisma.lecturer.upsert({
    where: { userId: lecturerUser.id },
    update: {},
    create: { userId: lecturerUser.id, department: "Computer Science" },
  });

  // ── Tutor ───────────────────────────────────────────────────────────
  const tutorUid = await ensureFirebaseUser("tutor.demo@wits.ac.za", "Thabo", "Demotutor");
  const tutorUser = await prisma.user.upsert({
    where: { email: "tutor.demo@wits.ac.za" },
    update: { firebaseUid: tutorUid },
    create: {
      firstName: "Thabo",
      lastName: "Demotutor",
      email: "tutor.demo@wits.ac.za",
      firebaseUid: tutorUid,
      role: "TUTOR",
      studentNumber: "1234567",
    },
  });

  const tutor = await prisma.tutor.upsert({
    where: { userId: tutorUser.id },
    update: {},
    create: { userId: tutorUser.id, maxHoursPerWeek: 20, status: "APPROVED" },
  });

  // ── Students ────────────────────────────────────────────────────────
  const studentUid = await ensureFirebaseUser("student.demo@wits.ac.za", "Lerato", "Demostudent");
  const studentUser = await prisma.user.upsert({
    where: { email: "student.demo@wits.ac.za" },
    update: { firebaseUid: studentUid },
    create: {
      firstName: "Lerato",
      lastName: "Demostudent",
      email: "student.demo@wits.ac.za",
      firebaseUid: studentUid,
      role: "STUDENT",
      studentNumber: "7654321",
    },
  });

  // A second student who already volunteered — tests the "another student
  // has already volunteered" error path.
  const busyUid = await ensureFirebaseUser("nduvo.demo@wits.ac.za", "Nduvho", "Demovolunteer");
  const busyStudent = await prisma.user.upsert({
    where: { email: "nduvo.demo@wits.ac.za" },
    update: { firebaseUid: busyUid },
    create: {
      firstName: "Nduvho",
      lastName: "Demovolunteer",
      email: "nduvo.demo@wits.ac.za",
      firebaseUid: busyUid,
      role: "STUDENT",
      studentNumber: "9876543",
    },
  });

  // ── Courses ─────────────────────────────────────────────────────────
  const cs101 = await prisma.course.upsert({
    where: { courseCode: "CS101" },
    update: {},
    create: { courseCode: "CS101", courseName: "Intro Programming", minimumMark: 70, lecturerId: lecturer.id },
  });

  const cs305 = await prisma.course.upsert({
    where: { courseCode: "CS305" },
    update: {},
    create: { courseCode: "CS305", courseName: "Database Systems", minimumMark: 70, lecturerId: lecturer.id },
  });

  // ── Tutor Assignments ──────────────────────────────────────────────
  let cs101Assignment = await prisma.tutorAssignment.findFirst({
    where: { tutorId: tutor.id, courseId: cs101.id, semester: "2026-S2" },
  });
  if (!cs101Assignment) {
    cs101Assignment = await prisma.tutorAssignment.create({
      data: { tutorId: tutor.id, courseId: cs101.id, allocatedHours: 6, semester: "2026-S2", status: "ACTIVE" },
    });
  }

  let cs305Assignment = await prisma.tutorAssignment.findFirst({
    where: { tutorId: tutor.id, courseId: cs305.id, semester: "2026-S2" },
  });
  if (!cs305Assignment) {
    cs305Assignment = await prisma.tutorAssignment.create({
      data: { tutorId: tutor.id, courseId: cs305.id, allocatedHours: 4, semester: "2026-S2", status: "ACTIVE" },
    });
  }

  // ── Time Slots (minutes since midnight) ────────────────────────────
  // Availability timetable slots (from main — used by the profile timetable).
  const timetableSlots = [
    { startMinute: 480, endMinute: 525 },  // 08:00-08:45
    { startMinute: 540, endMinute: 585 },  // 09:00-09:45
    { startMinute: 615, endMinute: 660 },  // 10:15-11:00
    { startMinute: 675, endMinute: 720 },  // 11:15-12:00
    { startMinute: 750, endMinute: 795 },  // 12:30-13:15
    { startMinute: 855, endMinute: 900 },  // 14:15-15:00
    { startMinute: 915, endMinute: 960 },  // 15:15-16:00
    { startMinute: 975, endMinute: 1020 }, // 16:15-17:00
  ];

  for (const slot of timetableSlots) {
    await prisma.timeSlot.upsert({
      where: { startMinute_endMinute: { startMinute: slot.startMinute, endMinute: slot.endMinute } },
      update: {},
      create: slot,
    });
  }

  const ts10to12 = await prisma.timeSlot.upsert({
    where: { startMinute_endMinute: { startMinute: 600, endMinute: 720 } },
    update: {},
    create: { startMinute: 600, endMinute: 720 },
  });

  const ts14to16 = await prisma.timeSlot.upsert({
    where: { startMinute_endMinute: { startMinute: 840, endMinute: 960 } },
    update: {},
    create: { startMinute: 840, endMinute: 960 },
  });

  const ts9to10 = await prisma.timeSlot.upsert({
    where: { startMinute_endMinute: { startMinute: 540, endMinute: 600 } },
    update: {},
    create: { startMinute: 540, endMinute: 600 },
  });

  // ── Course Slots ───────────────────────────────────────────────────
  let cs101Mon = await prisma.courseSlot.findFirst({ where: { courseId: cs101.id, dayOfWeek: 1 } });
  if (!cs101Mon) {
    cs101Mon = await prisma.courseSlot.create({
      data: { courseId: cs101.id, dayOfWeek: 1, timeSlotId: ts10to12.id, venue: "Lab 3B", sessionType: "TUTORIAL" },
    });
  }

  let cs101Wed = await prisma.courseSlot.findFirst({ where: { courseId: cs101.id, dayOfWeek: 3 } });
  if (!cs101Wed) {
    cs101Wed = await prisma.courseSlot.create({
      data: { courseId: cs101.id, dayOfWeek: 3, timeSlotId: ts14to16.id, venue: "Lab 1A", sessionType: "TUTORIAL" },
    });
  }

  let cs305Fri = await prisma.courseSlot.findFirst({ where: { courseId: cs305.id, dayOfWeek: 5 } });
  if (!cs305Fri) {
    cs305Fri = await prisma.courseSlot.create({
      data: { courseId: cs305.id, dayOfWeek: 5, timeSlotId: ts9to10.id, venue: "Lab 2C", sessionType: "TUTORIAL" },
    });
  }

  // ── Sessions ───────────────────────────────────────────────────────
  const cs101SessionCount = await prisma.session.count({ where: { assignmentId: cs101Assignment.id } });
  if (cs101SessionCount === 0) {
    await prisma.session.createMany({
      data: [
        { assignmentId: cs101Assignment.id, courseSlotId: cs101Mon.id, date: nextWeekdayAt(1, 0, 0), status: "SCHEDULED" },
        { assignmentId: cs101Assignment.id, courseSlotId: cs101Wed.id, date: nextWeekdayAt(3, 0, 0), status: "SCHEDULED" },
        { assignmentId: cs101Assignment.id, courseSlotId: cs101Mon.id, date: nextWeekdayAt(1, 0, 0), status: "UNASSIGNED", excuseReason: "Medical appointment I could not move" },
      ],
    });
  }

  const cs305SessionCount = await prisma.session.count({ where: { assignmentId: cs305Assignment.id } });
  if (cs305SessionCount === 0) {
    const cs305Sessions = await Promise.all([
      prisma.session.create({
        data: { assignmentId: cs305Assignment.id, courseSlotId: cs305Fri.id, date: nextWeekdayAt(5, 0, 0), status: "SCHEDULED" },
      }),
      prisma.session.create({
        data: { assignmentId: cs305Assignment.id, courseSlotId: cs305Fri.id, date: nextWeekdayAt(5, 0, 0), status: "UNASSIGNED", excuseReason: "Conference travel" },
      }),
    ]);

    // Nduvho already volunteered — tests the "already volunteered" error path.
    await prisma.sessionVolunteer.create({
      data: { sessionId: cs305Sessions[1].id, userId: busyStudent.id, status: "PENDING" },
    });
    await prisma.session.update({
      where: { id: cs305Sessions[1].id },
      data: { status: "PENDING" },
    });
  }

  // ── Summary ────────────────────────────────────────────────────────
  const allSessions = await prisma.session.findMany({
    include: { assignment: { include: { course: true } }, courseSlot: { include: { timeSlot: true } } },
  });

  const firebaseReady = !!getFirebaseAdmin;

  console.log("\n═══════════════════════════════════════════════════════════");
  console.log("  Seed complete — Excuse + Volunteer feature test data");
  console.log("═══════════════════════════════════════════════════════════\n");
  console.log("Logins (password for all: " + TEST_PASSWORD + "):");
  console.log(`  Tutor:    tutor.demo@wits.ac.za`);
  console.log(`  Student:  student.demo@wits.ac.za`);
  console.log(`  Student2: nduvo.demo@wits.ac.za`);
  console.log(`  Lecturer: kg.newuser@wits.ac.za`);
  if (!firebaseReady) {
    console.log("\n  ⚠  Firebase Admin SDK was NOT configured.");
    console.log("     The accounts above do NOT have real Firebase logins.");
    console.log("     Set FIREBASE_PROJECT_ID + FIREBASE_CLIENT_EMAIL + FIREBASE_PRIVATE_KEY");
    console.log("     (or GOOGLE_APPLICATION_CREDENTIALS) in your .env and re-run.");
  }
  console.log(`\nSessions seeded: ${allSessions.length}`);
  allSessions.forEach((s) => {
    const ts = s.courseSlot?.timeSlot;
    const timeRange = ts
      ? `${Math.floor(ts.startMinute / 60)}:${String(ts.startMinute % 60).padStart(2, "0")}–${Math.floor(ts.endMinute / 60)}:${String(ts.endMinute % 60).padStart(2, "0")}`
      : "no slot";
    console.log(`  [${s.status.padEnd(10)}] ${s.assignment.course.courseCode} ${timeRange}  ${s.excuseReason || ""}`);
  });

  console.log("\n── How to test ────────────────────────────────────────────\n");
  if (firebaseReady) {
    console.log("1. Start the backend and frontend locally.");
    console.log("2. Log in as the TUTOR:   tutor.demo@wits.ac.za / " + TEST_PASSWORD);
    console.log("   → Go to Tutor Dashboard → click 'Excuse Myself' on an Active session.");
    console.log("3. Log out, then log in as a STUDENT:  student.demo@wits.ac.za / " + TEST_PASSWORD);
    console.log("   → Go to Volunteer View → the excused session appears → click 'Apply to Volunteer'.");
    console.log("4. The session disappears from the list (it is now PENDING, not UNASSIGNED).");
  } else {
    console.log("Firebase Admin SDK is not configured — cannot create real logins.");
    console.log("Add these to your backend/.env and re-run `npm run seed`:");
    console.log("  FIREBASE_PROJECT_ID=your-project-id");
    console.log("  FIREBASE_CLIENT_EMAIL=your-service-account@...gserviceaccount.com");
    console.log("  FIREBASE_PRIVATE_KEY=\"-----BEGIN PRIVATE KEY-----\\n...\\n-----END PRIVATE KEY-----\"");
  }
  console.log("═══════════════════════════════════════════════════════════\n");
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
