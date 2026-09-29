const express = require('express');
const router = express.Router();
const { authenticateFirebaseToken } = require('../middleware/auth');
const { requireRole } = require('../utils/roles');
const {
  getMySessions,
  getCandidates,
  getSwaps,
  createSwap,
  acceptSwap,
  declineSwap,
  cancelSwap,
  approveSwap,
  rejectSwap,
} = require('../controllers/swaps');

// Literal paths are registered before /:id so they are not matched as an id
router.get('/my-sessions', authenticateFirebaseToken, requireRole('TUTOR'), getMySessions);
router.get('/candidates/:eventId', authenticateFirebaseToken, requireRole('TUTOR'), getCandidates);
router.get('/', authenticateFirebaseToken, getSwaps);
router.post('/', authenticateFirebaseToken, requireRole('TUTOR'), createSwap);

// Tutor actions on a single request
router.post('/:id/accept', authenticateFirebaseToken, requireRole('TUTOR'), acceptSwap);
router.post('/:id/decline', authenticateFirebaseToken, requireRole('TUTOR'), declineSwap);
router.post('/:id/cancel', authenticateFirebaseToken, requireRole('TUTOR'), cancelSwap);

// Organiser review — the same approval authority as a tutor being allocated
router.post('/:id/approve', authenticateFirebaseToken, requireRole('ORGANISER', 'ADMIN'), approveSwap);
router.post('/:id/reject', authenticateFirebaseToken, requireRole('ORGANISER', 'ADMIN'), rejectSwap);

module.exports = router;
