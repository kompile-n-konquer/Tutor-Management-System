const express = require('express');
const router = express.Router();
const { authenticateFirebaseToken } = require('../middleware/auth');
const { getOrganiserAnalytics } = require('../controllers/analytics');

// Aggregate KPIs for the organiser analytics page. Organiser/admin only —
// enforced inside the controller like the other staff-facing endpoints.
router.get('/organiser', authenticateFirebaseToken, getOrganiserAnalytics);

module.exports = router;
