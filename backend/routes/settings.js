const router = require('express').Router();
const authenticateFirebaseToken = require('../middleware/auth');
const upload = require('../middleware/upload');
const { getSettings, updateTutorMonthlyHours, updateTutorEventClaimMonths, updateHourlyRates, uploadPdfTemplate, getPdfTemplate, deletePdfTemplate } = require('../controllers/settings');

router.get('/', authenticateFirebaseToken, getSettings);
router.put('/tutor-monthly-hours', authenticateFirebaseToken, updateTutorMonthlyHours);
router.put('/tutor-event-claim-months', authenticateFirebaseToken, updateTutorEventClaimMonths);
router.put('/hourly-rates', authenticateFirebaseToken, updateHourlyRates);
router.put('/pdf-template', authenticateFirebaseToken, upload.single('template'), uploadPdfTemplate);
router.get('/pdf-template', getPdfTemplate);
router.delete('/pdf-template', authenticateFirebaseToken, deletePdfTemplate);

module.exports = router;
