const prisma = require('../prisma/client');

// Organiser-managed policy values live in the SystemSetting key-value table.
// This key holds the cap on the hours a tutor may be assigned/claim.
const TUTOR_MONTHLY_CLAIMABLE_HOURS = 'TUTOR_MONTHLY_CLAIMABLE_HOURS';

// Returns the stored hours as a number, or null while the organiser has not set the cap
const getTutorMonthlyClaimableHours = async () => {
  const setting = await prisma.systemSetting.findUnique({
    where: { key: TUTOR_MONTHLY_CLAIMABLE_HOURS },
  });
  return setting ? Number(setting.value) : null;
};

module.exports = {
  TUTOR_MONTHLY_CLAIMABLE_HOURS,
  getTutorMonthlyClaimableHours,
};
