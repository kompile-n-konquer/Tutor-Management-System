require("dotenv/config");
const { PrismaClient } = require("@prisma/client");
const prisma = new PrismaClient();
const getFirebaseAdmin = require("../firebase/admin");

/**
 * Seed the initial organiser account.
 *
 * Credentials are read from environment variables so that no real email or
 * password is ever committed to source control:
 *
 *   ORGANISER_EMAIL       – the organiser's login email
 *   ORGANISER_PASSWORD    – the organiser's Firebase password
 *   ORGANISER_FIRST_NAME  – (optional, defaults to "System")
 *   ORGANISER_LAST_NAME   – (optional, defaults to "Organiser")
 *   ORGANISER_EMPLOYEE_NO – (optional) employee/staff number
 *
 * The seed is idempotent: running it multiple times will NOT create duplicate
 * organisers.  If a user with the given email already exists and already has
 * the ORGANISER role the seed exits early.  If the user exists but has a
 * different role the role is promoted to ORGANISER.
 */
async function seedOrganiser() {
  const email = process.env.ORGANISER_EMAIL;
  const password = process.env.ORGANISER_PASSWORD;
  const firstName = process.env.ORGANISER_FIRST_NAME || "System";
  const lastName = process.env.ORGANISER_LAST_NAME || "Organiser";
  const employeeNumber = process.env.ORGANISER_EMPLOYEE_NO || null;

  if (!email || !password) {
    console.error(
      "❌ ORGANISER_EMAIL and ORGANISER_PASSWORD must be set in environment variables.\n" +
        "   Add them to your .env file before running: node prisma/seedOrganiser.js",
    );
    process.exit(1);
  }

  const { getAuth } = getFirebaseAdmin();
  const auth = getAuth();

  // ── 1. Ensure the Firebase account exists ──────────────────────────
  let firebaseUid;
  try {
    const existing = await auth.getUserByEmail(email);
    // Update the password so the seed can be used to reset it
    await auth.updateUser(existing.uid, { password });
    firebaseUid = existing.uid;
    console.log(`✓ Firebase account exists: ${email} (${firebaseUid})`);
  } catch (err) {
    if (err.code === "auth/user-not-found") {
      const created = await auth.createUser({
        email,
        password,
        displayName: `${firstName} ${lastName}`,
      });
      firebaseUid = created.uid;
      console.log(`+ Firebase account created: ${email} (${firebaseUid})`);
    } else {
      throw err;
    }
  }

  // ── 2. Upsert the User row with ORGANISER role ─────────────────────
  const user = await prisma.user.upsert({
    where: { email },
    // If the user already exists, ensure they have the ORGANISER role
    update: {
      role: "ORGANISER",
      firebaseUid, // keep UID in sync in case of re-creation
      firstName,
      lastName,
      employeeNumber,
    },
    create: {
      email,
      firebaseUid,
      firstName,
      lastName,
      role: "ORGANISER",
      employeeNumber,
    },
  });

  console.log(`✓ Organiser user ready (id: ${user.id}, role: ${user.role})`);
  console.log("\n✅ Organiser seed complete.\n");
}

seedOrganiser()
  .catch((e) => {
    console.error("\n❌ Organiser seed failed:\n", e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
