const express = require('express');
const router = express.Router();
const { authenticateFirebaseToken } = require('../middleware/auth');
const { requireRole } = require('../utils/roles');
const {
  getAvailableTutors,
  autoAssignTutors,
  assignTutor,
  getAssignedTutors,
  unassignTutor,
  removeTutor,
} = require('../controllers/allocation');

// Every allocation route exposes applicant personal data or mutates tutor
// assignments — organiser/admin territory only.
router.get('/available-tutors', authenticateFirebaseToken, requireRole('ORGANISER', 'ADMIN'), getAvailableTutors);

// Auto-Assign – fill a course's remaining slots from the ranked pool
router.post('/auto-assign', authenticateFirebaseToken, requireRole('ORGANISER', 'ADMIN'), autoAssignTutors);

// Assigned Tutors – CRUD on tutor assignments
router.get('/assignments', authenticateFirebaseToken, requireRole('ORGANISER', 'ADMIN'), getAssignedTutors);
router.post('/assignments', authenticateFirebaseToken, requireRole('ORGANISER', 'ADMIN'), assignTutor);
router.delete('/assignments/:applicantId', authenticateFirebaseToken, requireRole('ORGANISER', 'ADMIN'), unassignTutor);
router.delete('/assignments/:applicantId/remove', authenticateFirebaseToken, requireRole('ORGANISER', 'ADMIN'), removeTutor);

module.exports = router;
