const router = require('express').Router();
const authenticateFirebaseToken = require('../middleware/auth');
const { getSettings, updateTutorMonthlyHours } = require('../controllers/settings');

router.get('/', authenticateFirebaseToken, getSettings);
router.put('/tutor-monthly-hours', authenticateFirebaseToken, updateTutorMonthlyHours);

module.exports = router;
