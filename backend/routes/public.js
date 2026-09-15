const express = require('express');
const router = express.Router();
const {
  getPublicCourses,
  getPublicSchedule,
  getLiveSessions,
  getPublicStats,
  getPublicCalendar,
} = require('../controllers/public');

// The public API is deliberately unauthenticated: it serves non-users the same
// way a weather API does. Every handler reads only course/schedule/event data
// and aggregate counts — never user personal data — and each response is cached
// for a minute so the endpoints cannot be hammered.
router.get('/courses', getPublicCourses);
router.get('/courses/:courseCode/schedule', getPublicSchedule);
router.get('/sessions/live', getLiveSessions);
router.get('/stats', getPublicStats);
router.get('/calendar/:filename', getPublicCalendar);

module.exports = router;
