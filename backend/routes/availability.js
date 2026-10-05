const express = require('express');
const router = express.Router();
const { authenticateFirebaseToken } = require('../middleware/auth');
const upload = require('../middleware/upload');
const { getAvailability, updateAvailability } = require('../controllers/availability');
const { getTimetablePdf, uploadTimetablePdf, downloadTimetablePdf, deleteTimetablePdf, timetableUploadError } = require('../controllers/timetablePdf');

router.get('/', authenticateFirebaseToken, getAvailability);
router.put('/', authenticateFirebaseToken, updateAvailability);

// Per-user uploaded timetable PDF — the availability extracted from it is
// applied manually from the Edit Timetable page
router.get('/timetable-pdf', authenticateFirebaseToken, getTimetablePdf);
router.put(
  '/timetable-pdf',
  authenticateFirebaseToken,
  upload.timetableUpload.single('timetable'),
  timetableUploadError,
  uploadTimetablePdf,
);
router.get('/timetable-pdf/download', authenticateFirebaseToken, downloadTimetablePdf);
router.delete('/timetable-pdf', authenticateFirebaseToken, deleteTimetablePdf);

module.exports = router;
