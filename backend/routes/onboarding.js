const express = require('express');
const router = express.Router();
const authenticateFirebaseToken = require('../middleware/auth');
const { requireRole } = require('../utils/roles');
const {
  submitApplication,
  getMyApplications,
  getPendingApplications,
  getApplicationById,
  getApplicantRank,
  reviewApplication,
} = require('../controllers/onboarding');

// ── Student routes ───────────────────────────────────────────────────────
// Submit a role application (TUTOR or LECTURER)
router.post('/apply', authenticateFirebaseToken, submitApplication);

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
