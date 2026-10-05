const router = require('express').Router();
const { authenticateFirebaseToken } = require('../middleware/auth');
const { requireRole } = require('../utils/roles');
const upload = require('../middleware/upload');
const { getSettings, updateTutorMonthlyHours, updateTutorEventClaimMonths, updateHourlyRates, updateMonthlyBudget, uploadPdfTemplate, getPdfTemplate, deletePdfTemplate } = require('../controllers/settings');

router.get('/', authenticateFirebaseToken, getSettings);
router.put('/tutor-monthly-hours', authenticateFirebaseToken, updateTutorMonthlyHours);
router.put('/tutor-event-claim-months', authenticateFirebaseToken, updateTutorEventClaimMonths);
router.put('/hourly-rates', authenticateFirebaseToken, updateHourlyRates);
router.put('/monthly-budget', authenticateFirebaseToken, updateMonthlyBudget);
router.put('/pdf-template', authenticateFirebaseToken, upload.single('template'), uploadPdfTemplate);
// The template is organiser-managed configuration — its upload/delete routes
// already enforce the same role inside the controller
router.get('/pdf-template', authenticateFirebaseToken, requireRole('ORGANISER', 'ADMIN'), getPdfTemplate);
router.delete('/pdf-template', authenticateFirebaseToken, deletePdfTemplate);

module.exports = router;
