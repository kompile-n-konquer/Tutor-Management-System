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
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
