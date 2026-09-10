const express = require('express');
const router = express.Router();
const authenticateFirebaseToken = require('../middleware/auth');
const { getTimeSlots, createCourse } = require('../controllers/courses');

router.get('/time-slots', authenticateFirebaseToken, getTimeSlots);
router.post('/', authenticateFirebaseToken, createCourse);

module.exports = router;
