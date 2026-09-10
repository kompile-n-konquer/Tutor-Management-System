require("dotenv/config");
const { PrismaClient } = require("@prisma/client");
const prisma = new PrismaClient();

const getFirebaseAdmin = require("../firebase/admin");

async function main() {
  const { getAuth } = getFirebaseAdmin();
  const auth = getAuth();

  const organiserEmail = "organiser@test.com";
  const organiserPassword = "Password@123";
  let firebaseUser;

  try {
    firebaseUser = await auth.getUserByEmail(organiserEmail);
    console.log("Firebase user already exists, updating password...");
    await auth.updateUser(firebaseUser.uid, { password: organiserPassword });
  } catch (err) {
    if (err.code === "auth/user-not-found") {
      console.log("Creating new Firebase user...");
      firebaseUser = await auth.createUser({
        email: organiserEmail,
        password: organiserPassword,
        displayName: "Test Organiser",
      });
    } else {
      throw err;
    }
  }

  const user = await prisma.user.upsert({
    where: { email: organiserEmail },
    update: { firebaseUid: firebaseUser.uid },
    create: {
      firstName: "Kgaogelo",
      lastName: "Testuser",
      email: "kg.newuser@wits.ac.za",
      role: "LECTURER",
      employeeNumber: "KG-EMP003",
      studentNumber: "N/A-KG003",
      firebaseUid: firebaseUser.uid,
      firstName: "Test",
      lastName: "Organiser",
      email: organiserEmail,
      role: "ORGANISER",
      employeeNumber: "ORG-001",
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
