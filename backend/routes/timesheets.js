const express = require('express');
const router = express.Router();
const authenticateFirebaseToken = require('../middleware/auth');
const {
  getMyTimesheets,
  getPendingReview,
  getSupervisors,
  createTimesheet,
  getTimesheet,
  updateTimesheet,
  deleteTimesheet,
  submitTimesheet,
  approveEntry,
  rejectTimesheet,
} = require('../controllers/timesheets');

// Literal paths before parameterized ones
router.get('/', authenticateFirebaseToken, getMyTimesheets);
router.get('/pending-review', authenticateFirebaseToken, getPendingReview);
router.get('/supervisors', authenticateFirebaseToken, getSupervisors);
router.post('/', authenticateFirebaseToken, createTimesheet);
router.get('/:id', authenticateFirebaseToken, getTimesheet);
router.put('/:id', authenticateFirebaseToken, updateTimesheet);
router.delete('/:id', authenticateFirebaseToken, deleteTimesheet);
router.post('/:id/submit', authenticateFirebaseToken, submitTimesheet);
router.put('/:id/entries/:entryId/approve', authenticateFirebaseToken, approveEntry);
router.put('/:id/reject', authenticateFirebaseToken, rejectTimesheet);

module.exports = router;
