const express = require('express');
const router = express.Router();
const {
  getAvailableTutors,
  assignTutor,
  getAssignedTutors,
  unassignTutor,
} = require('../controllers/allocation');

// Available Tutors – applicants ranked by courseMark descending
router.get('/available-tutors', getAvailableTutors);

// Assigned Tutors – CRUD on tutor assignments
router.get('/assignments', getAssignedTutors);
router.post('/assignments', assignTutor);
router.delete('/assignments/:applicantId', unassignTutor);

module.exports = router;
