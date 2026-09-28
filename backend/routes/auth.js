const express = require('express');
const router = express.Router();
const { authenticateFirebaseToken, verifyFirebaseTokenOnly } = require('../middleware/auth');
const { requireRole } = require('../utils/roles');
const { getAllUsers, getUser, getUserMe, createUser, updateUser, deleteUser, verifyRole } = require('../controllers/auth');

// Literal routes must stay registered before GET /:firebaseUid so they are
// not matched as a firebaseUid value.

// User directory — organiser/admin only, returns no authentication identifiers
router.get('/', authenticateFirebaseToken, requireRole('ORGANISER', 'ADMIN'), getAllUsers);

router.get('/me', authenticateFirebaseToken, getUserMe);
router.get('/verify-role', authenticateFirebaseToken, verifyRole);

// Single profile — the controller additionally restricts access to the
// caller's own record (organisers and admins excepted)
router.get('/:firebaseUid', authenticateFirebaseToken, getUser);

// Signup — the Firebase token is verified but no User row is required yet;
// the controller enforces that the token matches the identity being created
router.post('/', verifyFirebaseTokenOnly, createUser);

router.put('/', authenticateFirebaseToken, updateUser);
router.delete('/', authenticateFirebaseToken, deleteUser);

module.exports = router;
