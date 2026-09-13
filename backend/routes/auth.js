const express = require('express');
const router = express.Router();
const authenticateFirebaseToken = require('../middleware/auth');
const { getAllUsers, getUser, getUserMe, createUser, updateUser, deleteUser, verifyRole } = require('../controllers/auth');

router.get('/', getAllUsers);
router.get('/me', authenticateFirebaseToken, getUserMe);
router.get('/verify-role', authenticateFirebaseToken, verifyRole);
router.get('/:firebaseUid', authenticateFirebaseToken, getUser);
router.post('/', createUser);
router.put('/', authenticateFirebaseToken, updateUser);
router.delete('/', authenticateFirebaseToken, deleteUser);

module.exports = router;
