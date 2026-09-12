const router = require('express').Router();
const authenticateFirebaseToken = require('../middleware/auth');
const { getSettings, updateTutorMonthlyHours, updateTutorEventClaimMonths } = require('../controllers/settings');

router.get('/', authenticateFirebaseToken, getSettings);
router.put('/tutor-monthly-hours', authenticateFirebaseToken, updateTutorMonthlyHours);
router.put('/tutor-event-claim-months', authenticateFirebaseToken, updateTutorEventClaimMonths);

module.exports = router;
