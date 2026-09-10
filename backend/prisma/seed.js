require("dotenv/config");
const { PrismaClient } = require("@prisma/client");
const prisma = new PrismaClient();

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
  const lecturerUser = await prisma.user.upsert({
    where: { email: "kg.newuser@wits.ac.za" },
    update: {},
    create: {
      firstName: "Kgaogelo",
      lastName: "Testuser",
      email: "kg.newuser@wits.ac.za",
      firebaseUid: "seed-lecturer-uid",
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
  const tutorUser = await prisma.user.upsert({
    where: { email: "tutor.demo@wits.ac.za" },
    update: {},
    create: {
      firstName: "Thabo",
      lastName: "Demotutor",
      email: "tutor.demo@wits.ac.za",
      firebaseUid: "seed-tutor-uid",
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
  const studentUser = await prisma.user.upsert({
    where: { email: "student.demo@wits.ac.za" },
    update: {},
    create: {
      firstName: "Lerato",
      lastName: "Demostudent",
      email: "student.demo@wits.ac.za",
      firebaseUid: "seed-student-uid",
      role: "STUDENT",
      studentNumber: "7654321",
    },
  });

  // A second student who already volunteered — used to test the "another student
  // has already volunteered" error path.
  const busyStudent = await prisma.user.upsert({
    where: { email: "nduvo.demo@wits.ac.za" },
    update: {},
    create: {
      firstName: "Nduvho",
      lastName: "Demovolunteer",
      email: "nduvo.demo@wits.ac.za",
      firebaseUid: "seed-volunteer-uid",
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
  // CS101 Monday 10:00–12:00
  let cs101Mon = await prisma.courseSlot.findFirst({ where: { courseId: cs101.id, dayOfWeek: 1 } });
  if (!cs101Mon) {
    cs101Mon = await prisma.courseSlot.create({
      data: { courseId: cs101.id, dayOfWeek: 1, timeSlotId: ts10to12.id, venue: "Lab 3B", sessionType: "TUTORIAL" },
    });
  }

  // CS101 Wednesday 14:00–16:00
  let cs101Wed = await prisma.courseSlot.findFirst({ where: { courseId: cs101.id, dayOfWeek: 3 } });
  if (!cs101Wed) {
    cs101Wed = await prisma.courseSlot.create({
      data: { courseId: cs101.id, dayOfWeek: 3, timeSlotId: ts14to16.id, venue: "Lab 1A", sessionType: "TUTORIAL" },
    });
  }

  // CS305 Friday 09:00–10:00
  let cs305Fri = await prisma.courseSlot.findFirst({ where: { courseId: cs305.id, dayOfWeek: 5 } });
  if (!cs305Fri) {
    cs305Fri = await prisma.courseSlot.create({
      data: { courseId: cs305.id, dayOfWeek: 5, timeSlotId: ts9to10.id, venue: "Lab 2C", sessionType: "TUTORIAL" },
    });
  }

  // ── Sessions ───────────────────────────────────────────────────────
  // Guard with a count check so re-running the seed is idempotent.
  const cs101SessionCount = await prisma.session.count({ where: { assignmentId: cs101Assignment.id } });
  if (cs101SessionCount === 0) {
    await prisma.session.createMany({
      data: [
        // SCHEDULED — tutor can excuse from these
        { assignmentId: cs101Assignment.id, courseSlotId: cs101Mon.id, date: nextWeekdayAt(1, 0, 0), status: "SCHEDULED" },
        { assignmentId: cs101Assignment.id, courseSlotId: cs101Wed.id, date: nextWeekdayAt(3, 0, 0), status: "SCHEDULED" },
        // UNASSIGNED — student can volunteer for this one
        { assignmentId: cs101Assignment.id, courseSlotId: cs101Mon.id, date: nextWeekdayAt(1, 0, 0), status: "UNASSIGNED", excuseReason: "Medical appointment I could not move" },
      ],
    });
  }

  const cs305SessionCount = await prisma.session.count({ where: { assignmentId: cs305Assignment.id } });
  if (cs305SessionCount === 0) {
    const cs305Sessions = await Promise.all([
      // SCHEDULED
      prisma.session.create({
        data: { assignmentId: cs305Assignment.id, courseSlotId: cs305Fri.id, date: nextWeekdayAt(5, 0, 0), status: "SCHEDULED" },
      }),
      // PENDING — Nduvho already volunteered (tests the "already volunteered" error path)
      prisma.session.create({
        data: { assignmentId: cs305Assignment.id, courseSlotId: cs305Fri.id, date: nextWeekdayAt(5, 0, 0), status: "UNASSIGNED", excuseReason: "Conference travel" },
      }),
    ]);

    // Create a pending volunteer for the second CS305 session
    await prisma.sessionVolunteer.create({
      data: { sessionId: cs305Sessions[1].id, userId: busyStudent.id, status: "PENDING" },
    });
    // Flip it to PENDING so it no longer appears in the volunteer view
    await prisma.session.update({
      where: { id: cs305Sessions[1].id },
      data: { status: "PENDING" },
    });
  }

  // ── Summary ────────────────────────────────────────────────────────
  const allSessions = await prisma.session.findMany({
    include: { assignment: { include: { course: true } }, courseSlot: { include: { timeSlot: true } } },
  });

  console.log("\n═══════════════════════════════════════════════════════════");
  console.log("  Seed complete — Excuse + Volunteer feature test data");
  console.log("═══════════════════════════════════════════════════════════\n");
  console.log("Users seeded:");
  console.log(`  Tutor:    ${tutorUser.email}  (firebaseUid: ${tutorUser.firebaseUid})`);
  console.log(`  Student:  ${studentUser.email}  (firebaseUid: ${studentUser.firebaseUid})`);
  console.log(`  Student2: ${busyStudent.email}  (firebaseUid: ${busyStudent.firebaseUid})`);
  console.log(`  Lecturer: ${lecturerUser.email}  (firebaseUid: ${lecturerUser.firebaseUid})`);
  console.log(`\nSessions seeded: ${allSessions.length}`);
  allSessions.forEach((s) => {
    const ts = s.courseSlot?.timeSlot;
    const timeRange = ts
      ? `${Math.floor(ts.startMinute / 60)}:${String(ts.startMinute % 60).padStart(2, "0")}–${Math.floor(ts.endMinute / 60)}:${String(ts.endMinute % 60).padStart(2, "0")}`
      : "no slot";
    console.log(`  [${s.status.padEnd(10)}] ${s.assignment.course.courseCode} ${timeRange}  ${s.excuseReason || ""}`);
  });

  console.log("\n── To test the excuse + volunteer flow ──────────────────\n");
  console.log("1. Sign up or log in with a real Firebase account.");
  console.log("   Then update that user's firebaseUid to match a seeded user:");
  console.log(`     UPDATE "User" SET "firebaseUid" = 'seed-tutor-uid' WHERE email = 'your-email@wits.ac.za';`);
  console.log("   (Or vice versa — update the seeded user's firebaseUid to your real UID.)");
  console.log("");
  console.log("2. As the TUTOR:  Visit Tutor Dashboard → click 'Excuse Myself' on any Active session.");
  console.log("3. As a STUDENT:  Visit Volunteer View → the excused session appears → click 'Apply to Volunteer'.");
  console.log("4. Conflict test: As the STUDENT, try volunteering for the CS305 PENDING session");
  console.log("   (it should be invisible — only UNASSIGNED sessions show up).");
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
