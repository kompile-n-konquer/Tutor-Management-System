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

  // Demo tutor, student, course, assignment and sessions so the excuse/volunteer
  // flow can be exercised end to end.
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
    create: { userId: tutorUser.id, maxHoursPerWeek: 20, availableHours: 20, status: "APPROVED" },
  });

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

  const course = await prisma.course.upsert({
    where: { courseCode: "CS101" },
    update: {},
    create: {
      courseCode: "CS101",
      courseName: "Intro Programming",
      minimumMark: 70,
      lecturerId: lecturer.id,
    },
  });

  // TutorAssignment has no natural unique key, so guard with a lookup instead of an upsert.
  let assignment = await prisma.tutorAssignment.findFirst({
    where: { tutorId: tutor.id, courseId: course.id, semester: "2026-S2" },
  });
  if (!assignment) {
    assignment = await prisma.tutorAssignment.create({
      data: { tutorId: tutor.id, courseId: course.id, allocatedHours: 6, semester: "2026-S2", status: "ACTIVE" },
    });
  }

  const existingSession = await prisma.session.findFirst({ where: { assignmentId: assignment.id } });
  if (!existingSession) {
    await prisma.session.createMany({
      data: [
        {
          assignmentId: assignment.id,
          date: nextWeekdayAt(1, 10, 0),
          startTime: nextWeekdayAt(1, 10, 0),
          endTime: nextWeekdayAt(1, 12, 0),
          status: "SCHEDULED",
        },
        {
          assignmentId: assignment.id,
          date: nextWeekdayAt(3, 14, 0),
          startTime: nextWeekdayAt(3, 14, 0),
          endTime: nextWeekdayAt(3, 16, 0),
          status: "SCHEDULED",
        },
        {
          assignmentId: assignment.id,
          date: nextWeekdayAt(5, 9, 0),
          startTime: nextWeekdayAt(5, 9, 0),
          endTime: nextWeekdayAt(5, 10, 0),
          status: "UNASSIGNED",
          excuseReason: "Seeded example — tutor excused themselves",
        },
      ],
    });
  }

  console.log("Seeded users:", lecturerUser.email, tutorUser.email, studentUser.email);
  console.log("Seeded course + assignment:", course.courseCode, assignment.id);
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
