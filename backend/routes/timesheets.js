const express = require('express');
const router = express.Router();
const { authenticateFirebaseToken, requireRole } = require('../middleware/auth');
const {
  submitTimesheet,
  approveTimesheet,
  rejectTimesheet,
} = require('../controllers/timesheets');

router.post('/:id/submit', authenticateFirebaseToken, requireRole('TUTOR'), submitTimesheet);
router.post('/:id/approve', authenticateFirebaseToken, requireRole('LECTURER'), approveTimesheet);
router.post('/:id/reject', authenticateFirebaseToken, requireRole('LECTURER'), rejectTimesheet);

module.exports = router;
