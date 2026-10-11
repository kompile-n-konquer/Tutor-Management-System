const express = require('express');
const router = express.Router();
const { authenticateFirebaseToken } = require('../middleware/auth');
const upload = require('../middleware/upload');
const {
  getOpportunities,
  getOpportunity,
  createApplication,
  getMyApplications,
  uploadTranscript,
  getMyTranscript,
} = require('../controllers/applications');

// Literal paths are registered before /:courseId so they are not matched as an id
router.get('/', authenticateFirebaseToken, getOpportunities);
router.get('/mine', authenticateFirebaseToken, getMyApplications);
router.get('/transcript', authenticateFirebaseToken, getMyTranscript);
router.post('/transcript', authenticateFirebaseToken, upload.single('transcript'), uploadTranscript);
router.get('/:courseId', authenticateFirebaseToken, getOpportunity);
router.post('/:courseId/apply', authenticateFirebaseToken, createApplication);

module.exports = router;
