require("dotenv/config");
const { PrismaClient } = require("@prisma/client");
const prisma = new PrismaClient();

async function main() {
  const user1 = await prisma.user.upsert({
    where: { email: "master@wits.ac.za" },
    update: {},
    create: {
      firstName: "Tlhalefo",
      lastName: "The_master",
      email: "master@wits.ac.za",
      password: "placeholder123",
      role: "STUDENT",
      studentNumber: "2500000",
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
