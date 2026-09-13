const express = require('express');
const router = express.Router();
const authenticateFirebaseToken = require('../middleware/auth');
const { getAllUsers, getUser, createUser, updateUser, deleteUser } = require('../controllers/auth');

router.get('/', getAllUsers);
router.get('/:firebaseUid', authenticateFirebaseToken, getUser);
router.post('/', createUser);
router.put('/', authenticateFirebaseToken, updateUser);
router.get('/me', authenticateFirebaseToken, getUserMe);
router.get('/verify-role', authenticateFirebaseToken, verifyRole);
router.delete('/', authenticateFirebaseToken, deleteUser);

module.exports = router;
