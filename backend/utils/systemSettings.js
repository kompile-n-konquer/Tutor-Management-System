const prisma = require('../prisma/client');

// Organiser-managed policy values live in the SystemSetting key-value table.
// This key holds the cap on the hours a tutor may be assigned/claim.
const TUTOR_MONTHLY_CLAIMABLE_HOURS = 'TUTOR_MONTHLY_CLAIMABLE_HOURS';

// This key holds how many months back a tutor may claim an event (e.g. 3 means
// events whose date is more than 3 months in the past can no longer be claimed).
const TUTOR_EVENT_CLAIM_MONTHS = 'TUTOR_EVENT_CLAIM_MONTHS';

// Returns the stored hours as a number, or null while the organiser has not set the cap
const getTutorMonthlyClaimableHours = async () => {
  const setting = await prisma.systemSetting.findUnique({
    where: { key: TUTOR_MONTHLY_CLAIMABLE_HOURS },
  });
  return setting ? Number(setting.value) : null;
};

// Returns the stored months as a number, or null while the organiser has not set a window
const getTutorEventClaimMonths = async () => {
  const setting = await prisma.systemSetting.findUnique({
    where: { key: TUTOR_EVENT_CLAIM_MONTHS },
  });
  return setting ? Number(setting.value) : null;
};

module.exports = {
  TUTOR_MONTHLY_CLAIMABLE_HOURS,
  getTutorMonthlyClaimableHours,
  TUTOR_EVENT_CLAIM_MONTHS,
  getTutorEventClaimMonths,
};
