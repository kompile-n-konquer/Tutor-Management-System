require("dotenv/config");
const { PrismaClient } = require("@prisma/client");
const prisma = new PrismaClient();

async function main() {
  const user = await prisma.user.upsert({
    where: { email: "kg.newuser@wits.ac.za" },
    update: {},
    create: {
      firstName: "Kgaogelo",
      lastName: "Testuser",
      email: "kg.newuser@wits.ac.za",
      role: "LECTURER",
      employeeNumber: "KG-EMP003",
      studentNumber: "N/A-KG003",
    },
  });

  console.log("Seeded user:", user);

  // --- Seed data for rank suggestions ---

  // 1. Create a dummy lecturer
  const lecturerUser = await prisma.user.upsert({
    where: { email: "lecturer@test.com" },
    update: {},
    create: {
      firebaseUid: "dummy-lecturer-uid",
      firstName: "Test",
      lastName: "Lecturer",
      email: "lecturer@test.com",
      role: "LECTURER",
      employeeNumber: "LEC-001",
    },
  });

  const lecturer = await prisma.lecturer.upsert({
    where: { userId: lecturerUser.id },
    update: {},
    create: {
      userId: lecturerUser.id,
      department: "Computer Science",
    },
  });

  // 2. Create a dummy course
  const course = await prisma.course.upsert({
    where: { courseCode: "COMS1000" },
    update: {},
    create: {
      courseCode: "COMS1000",
      courseName: "Introduction to CS",
      minimumMark: 60,
      requiredTutors: 5,
      budgetHours: 100,
      hourlyRate: 150,
      lecturerId: lecturer.id,
    },
  });

  // 3. Create dummy student users
  const students = [];
  for (let i = 1; i <= 5; i++) {
    const studentUser = await prisma.user.upsert({
      where: { email: `student${i}@test.com` },
      update: {},
      create: {
        firebaseUid: `dummy-student-uid-${i}`,
        firstName: `Student${i}`,
        lastName: "Test",
        email: `student${i}@test.com`,
        role: "STUDENT",
        studentNumber: `STU-00${i}`,
      },
    });
    students.push(studentUser);
  }

  // 4. Create applicants for the course with varying marks
  const marks = [55, 92, 78, 85, 61]; // Mix of marks, some below minimum, some high
  for (let i = 0; i < students.length; i++) {
    // Upsert by userId and courseId requires finding the existing one first if no unique constraint exists
    // Wait, applicant doesn't have a unique constraint on [userId, courseId] in the schema.
    // Let's find first to avoid duplicates
    let applicant = await prisma.applicant.findFirst({
      where: {
        userId: students[i].id,
        courseId: course.id,
      }
    });

    if (!applicant) {
      applicant = await prisma.applicant.create({
        data: {
          userId: students[i].id,
          courseId: course.id,
          courseMark: marks[i],
          status: "PENDING",
        }
      });
    } else {
      applicant = await prisma.applicant.update({
        where: { id: applicant.id },
        data: { courseMark: marks[i] }
      });
    }
  }

  console.log("Seeded course and applicants for rank suggestions testing.");
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
