const express = require('express');
const router = express.Router();
const { authenticateFirebaseToken } = require('../middleware/auth');
const {
  getUnassignedSessions,
  getMySessions,
  excuseSession,
  volunteerForSession,
} = require('../controllers/sessions');

// Sessions that a tutor excused themselves from and are open for student volunteers.
router.get('/unassigned', authenticateFirebaseToken, getUnassignedSessions);
// The signed-in tutor's own sessions, used by the tutor dashboard.
router.get('/mine', authenticateFirebaseToken, getMySessions);
// A tutor excuses themselves from a session, returning it to the unassigned state.
router.patch('/:id/excuse', authenticateFirebaseToken, excuseSession);
// A student volunteers for an unassigned session, creating a pending assignment.
router.post('/:id/volunteer', authenticateFirebaseToken, volunteerForSession);

module.exports = router;
