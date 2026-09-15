const express = require('express');
const router = express.Router();
const { authenticateFirebaseToken } = require('../middleware/auth');
const { requireRole } = require('../utils/roles');
const {
  getAvailableTutors,
  assignTutor,
  getAssignedTutors,
  unassignTutor,
  removeTutor,
} = require('../controllers/allocation');

// Every allocation route exposes applicant personal data or mutates tutor
// assignments — organiser/admin territory only.
router.get('/available-tutors', authenticateFirebaseToken, requireRole('ORGANISER', 'ADMIN'), getAvailableTutors);

// Assigned Tutors – CRUD on tutor assignments
router.get('/assignments', authenticateFirebaseToken, requireRole('ORGANISER', 'ADMIN'), getAssignedTutors);
router.post('/assignments', authenticateFirebaseToken, requireRole('ORGANISER', 'ADMIN'), assignTutor);
router.delete('/assignments/:applicantId', authenticateFirebaseToken, requireRole('ORGANISER', 'ADMIN'), unassignTutor);
router.delete('/assignments/:applicantId/remove', authenticateFirebaseToken, requireRole('ORGANISER', 'ADMIN'), removeTutor);

module.exports = router;
