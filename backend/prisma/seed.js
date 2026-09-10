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
      firebaseUid: "DummyUID"
    },
  });

  const timeSlots = [
    { startMinute: 480, endMinute: 525 },  // 08:00-08:45
    { startMinute: 540, endMinute: 585 },  // 09:00-09:45
    { startMinute: 615, endMinute: 660 },  // 10:15-11:00
    { startMinute: 675, endMinute: 720 },  // 11:15-12:00
    { startMinute: 750, endMinute: 795 },  // 12:30-13:15
    { startMinute: 855, endMinute: 900 },  // 14:15-15:00
    { startMinute: 915, endMinute: 960 },  // 15:15-16:00
    { startMinute: 975, endMinute: 1020 }, // 16:15-17:00
  ];

  for (const slot of timeSlots) {
    await prisma.timeSlot.upsert({
      where: { startMinute_endMinute: { startMinute: slot.startMinute, endMinute: slot.endMinute } },
      update: {},
      create: slot,
    });
  }

  console.log(`Seeded ${timeSlots.length} time slots`);
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
