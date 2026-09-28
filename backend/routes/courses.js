const express = require('express');
const router = express.Router();
const { authenticateFirebaseToken } = require('../middleware/auth');
const {
  getTimeSlots,
  createCourse,
  getCourses,
  getCourse,
  updateCourse,
  updateCourseSlots,
  startApplicationProcess,
} = require('../controllers/courses');

// Literal paths are registered before /:courseId so they are not matched as an id
router.get('/', authenticateFirebaseToken, getCourses);
router.get('/time-slots', authenticateFirebaseToken, getTimeSlots);
router.put('/open-applications', authenticateFirebaseToken, startApplicationProcess);
router.get('/:courseId', authenticateFirebaseToken, getCourse);
router.put('/:courseId', authenticateFirebaseToken, updateCourse);
router.put('/:courseId/slots', authenticateFirebaseToken, updateCourseSlots);
router.post('/', authenticateFirebaseToken, createCourse);

module.exports = router;
