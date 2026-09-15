const express = require('express');
const router = express.Router();
const authenticateFirebaseToken = require('../middleware/auth');
const {
  getEvents,
  getMyCourses,
  getClaimableEvents,
  createEvent,
  getEvent,
  updateEvent,
} = require('../controllers/events');

// Literal paths are registered before /:id so they are not matched as an id
router.get('/', authenticateFirebaseToken, getEvents);
router.get('/my-courses', authenticateFirebaseToken, getMyCourses);
router.get('/claimable', authenticateFirebaseToken, getClaimableEvents);
router.post('/', authenticateFirebaseToken, createEvent);
router.get('/:id', authenticateFirebaseToken, getEvent);
router.put('/:id', authenticateFirebaseToken, updateEvent);

module.exports = router;
