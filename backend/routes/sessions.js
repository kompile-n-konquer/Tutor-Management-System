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
  getCoverCandidates,
  createCoverOffer,
  respondToCoverOffer,
  cancelCoverOffer,
} = require('../controllers/sessions');

// Excused sessions open for cover, filtered to courses where the signed-in tutor's mark qualifies.
router.get('/unassigned', authenticateFirebaseToken, getUnassignedSessions);
// The signed-in tutor's own sessions — events on their assigned courses
// merged with their excuse / volunteer lifecycle rows, never another
// tutor's rows.
router.get('/mine', authenticateFirebaseToken, getMySessions);
// Sessions the signed-in tutor volunteered for or was offered as a directed
// cover (OFFERED, PENDING or APPROVED).
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
// Directed cover offers: the excusing tutor points the cover at one appointed,
// validated tutor (candidates first), the nominee accepts or declines, and the
// excuser can withdraw the offer while it still waits on the nominee.
router.get('/:id/cover-candidates', authenticateFirebaseToken, getCoverCandidates);
router.post('/:id/cover-offer', authenticateFirebaseToken, createCoverOffer);
router.patch('/:id/cover-offer', authenticateFirebaseToken, respondToCoverOffer);
router.delete('/:id/cover-offer', authenticateFirebaseToken, cancelCoverOffer);

module.exports = router;
