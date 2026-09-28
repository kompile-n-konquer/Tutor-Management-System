const express = require('express');
const router = express.Router();
const { authenticateFirebaseToken } = require('../middleware/auth');
const { getAvailability, updateAvailability } = require('../controllers/availability');

router.get('/', authenticateFirebaseToken, getAvailability);
router.put('/', authenticateFirebaseToken, updateAvailability);

module.exports = router;
