const express = require('express');
const router = express.Router();
const authenticateFirebaseToken = require('../middleware/auth');
const { requireRole } = require('../utils/roles');
const {
  submitApplication,
  getTutorEligibleCourses,
  getMyApplications,
  getPendingApplications,
  getApplicationById,
  getApplicantRank,
  reviewApplication,
} = require('../controllers/onboarding');

// ── Student routes ───────────────────────────────────────────────────────
// Submit a role application (TUTOR or LECTURER)
router.post('/apply', authenticateFirebaseToken, submitApplication);

// Courses the current user can tutor without their availability clashing
// with the course's session slots (used by the tutor application form)
router.get('/tutor-eligible-courses', authenticateFirebaseToken, getTutorEligibleCourses);

// View own applications
router.get('/my-applications', authenticateFirebaseToken, getMyApplications);

// ── Organiser routes ─────────────────────────────────────────────────────
// List pending applications (organiser only)
router.get(
  '/applications',
  authenticateFirebaseToken,
  requireRole('ORGANISER'),
  getPendingApplications,
);

// View a single application with full details (organiser or owner)
router.get(
  '/applications/:id',
  authenticateFirebaseToken,
  getApplicationById,
);

// Get rank suggestion for a tutor applicant (organiser only)
router.get(
  '/applications/:id/rank',
  authenticateFirebaseToken,
  requireRole('ORGANISER'),
  getApplicantRank,
);

// Approve or reject an application (organiser only)
router.patch(
  '/applications/:id/review',
  authenticateFirebaseToken,
  requireRole('ORGANISER'),
  reviewApplication,
);

module.exports = router;
