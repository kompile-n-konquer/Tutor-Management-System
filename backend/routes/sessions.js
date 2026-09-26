const express = require('express');
const router = express.Router();
const { authenticateFirebaseToken } = require('../middleware/auth');
const { requireRole } = require('../utils/roles');
const {
  getUnassignedSessions,
  getMySessions,
  getMyVolunteeredSessions,
  getLecturerSessions,
  scheduleSession,
  excuseSession,
  volunteerForSession,
} = require('../controllers/sessions');

// Sessions that a tutor excused themselves from and are open for student volunteers.
router.get('/unassigned', authenticateFirebaseToken, getUnassignedSessions);
// Every session scheduled for the signed-in tutor's assigned courses, used by the tutor dashboard.
router.get('/mine', authenticateFirebaseToken, getMySessions);
// Sessions the signed-in student has volunteered for (PENDING or APPROVED).
router.get('/volunteered', authenticateFirebaseToken, getMyVolunteeredSessions);
// The lecturer's own courses with their slots, tutors and scheduled sessions.
router.get('/lecturer', authenticateFirebaseToken, requireRole('LECTURER'), getLecturerSessions);
// A lecturer schedules a session for one of their courses, attached to a tutor assignment.
router.post('/', authenticateFirebaseToken, requireRole('LECTURER'), scheduleSession);
// A tutor excuses themselves from a session, returning it to the unassigned state.
router.patch('/:id/excuse', authenticateFirebaseToken, excuseSession);
// A student volunteers for an unassigned session, creating a pending assignment.
router.post('/:id/volunteer', authenticateFirebaseToken, volunteerForSession);

module.exports = router;
