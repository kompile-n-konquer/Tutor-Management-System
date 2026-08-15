require("dotenv/config");
const { PrismaClient } = require("@prisma/client");
const prisma = new PrismaClient();

async function main() {
  const user1 = await prisma.user.upsert({
    where: { email: "kaygee@wits.ac.za" },
    update: {},
    create: {
      firstName: "Kaygee",
      lastName: "Mogomotsi",
      email: "kaygee@wits.ac.za",
      password: "placeholder123",
      role: "STUDENT",
      studentNumber: "2500000",
    },
  });

  const user2 = await prisma.user.upsert({
    where: { email: "testtutor@wits.ac.za" },
    update: {},
    create: {
      firstName: "Test",
      lastName: "Tutor",
      email: "testtutor@wits.ac.za",
      password: "placeholder123",
      role: "TUTOR",
      employeeNumber: "EMP001",
    },
  });

  console.log("Seeded users:", user1, user2);
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
