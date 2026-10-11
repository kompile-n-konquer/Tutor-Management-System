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

// Hourly-rate keys — one per year of study.
// The value stored is a stringified number representing ZAR per hour.
const HOURLY_RATE_KEYS = {
  '3rd year': 'HOURLY_RATE_3RD_YEAR',
  honours:   'HOURLY_RATE_HONOURS',
  masters:   'HOURLY_RATE_MASTERS',
  phd:       'HOURLY_RATE_PHD',
};

// Key for the uploaded PDF template filename (stored on disk in backend/uploads/)
const PDF_TEMPLATE_KEY = 'PDF_TEMPLATE_FILENAME';

// This key holds the monthly budget — the amount (in ZAR) the school plans to
// spend per month on all tutors and courses.
const MONTHLY_BUDGET = 'MONTHLY_BUDGET';

// Returns the stored budget as a number, or null while the organiser has not set one
const getMonthlyBudget = async () => {
  const setting = await prisma.systemSetting.findUnique({
    where: { key: MONTHLY_BUDGET },
  });
  return setting ? Number(setting.value) : null;
};

// All hourly rates keyed by year of study (null where unset) in one query — the
// same rates the timesheet PDF export reads one at a time
const getHourlyRates = async () => {
  const settings = await prisma.systemSetting.findMany({
    where: { key: { in: Object.values(HOURLY_RATE_KEYS) } },
  });
  const byKey = Object.fromEntries(settings.map((setting) => [setting.key, Number(setting.value)]));
  const rates = {};
  for (const [year, key] of Object.entries(HOURLY_RATE_KEYS)) {
    rates[year] = byKey[key] ?? null;
  }
  return rates;
};

module.exports = {
  TUTOR_MONTHLY_CLAIMABLE_HOURS,
  getTutorMonthlyClaimableHours,
  TUTOR_EVENT_CLAIM_MONTHS,
  getTutorEventClaimMonths,
  HOURLY_RATE_KEYS,
  PDF_TEMPLATE_KEY,
  MONTHLY_BUDGET,
  getMonthlyBudget,
  getHourlyRates,
};
