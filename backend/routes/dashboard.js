const express = require('express');
const router = express.Router();
const { authenticateFirebaseToken } = require('../middleware/auth');
const { getDashboard } = require('../controllers/dashboard');

// Priority items for the unified dashboard. Every authenticated role gets a
// payload — the controller branches on the caller's role.
router.get('/', authenticateFirebaseToken, getDashboard);

module.exports = router;
