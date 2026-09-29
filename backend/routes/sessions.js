const express = require('express');
const router = express.Router();
const { authenticateFirebaseToken } = require('../middleware/auth');
const { requireRole } = require('../utils/roles');
const {
  getUnassignedSessions,
  getMySessions,
  getMyVolunteeredSessions,
  getLecturerSessions,
  excuseSession,
  volunteerForSession,
  decideVolunteerRequest,
} = require('../controllers/sessions');

// Excused sessions open for cover, filtered to courses where the signed-in tutor's mark qualifies.
router.get('/unassigned', authenticateFirebaseToken, getUnassignedSessions);
// The signed-in tutor's own sessions — events on their assigned courses
// merged with their excuse / volunteer lifecycle rows, never another
// tutor's rows.
router.get('/mine', authenticateFirebaseToken, getMySessions);
// Sessions the signed-in student has volunteered for (PENDING or APPROVED).
router.get('/volunteered', authenticateFirebaseToken, getMyVolunteeredSessions);
// The lecturer's own courses with their slots, tutors, upcoming events and
// the sessions in the excuse / volunteer lifecycle.
router.get('/lecturer', authenticateFirebaseToken, requireRole('LECTURER'), getLecturerSessions);
// A tutor excuses themselves from a session, returning it to the unassigned state.
router.patch('/:id/excuse', authenticateFirebaseToken, excuseSession);
// A qualifying tutor requests cover for an unassigned session (goes PENDING for the lecturer).
router.post('/:id/volunteer', authenticateFirebaseToken, volunteerForSession);
// The course's lecturer approves or rejects a pending cover request.
router.patch('/:id/volunteer', authenticateFirebaseToken, requireRole('LECTURER'), decideVolunteerRequest);

module.exports = router;
