const express = require('express');
const router = express.Router();
const { authenticateFirebaseToken, requireRole } = require('../middleware/auth');
const {
  getAllAssignments,
  createAssignment,
  deleteAssignment,
} = require('../controllers/assignments');

router.get('/', authenticateFirebaseToken, getAllAssignments);
router.post('/', authenticateFirebaseToken, requireRole('LECTURER'), createAssignment);
router.delete('/:id', authenticateFirebaseToken, requireRole('LECTURER'), deleteAssignment);

module.exports = router;
