const express = require('express');
const router = express.Router();
const authenticateFirebaseToken = require('../middleware/auth');
const { getAllUsers, createUser, getUserMe, verifyRole, deleteUser } = require('../controllers/auth');

router.get('/', getAllUsers);
router.post('/', createUser);
router.get('/me', authenticateFirebaseToken, getUserMe);
router.get('/verify-role', authenticateFirebaseToken, verifyRole);
router.delete('/', authenticateFirebaseToken, deleteUser);

module.exports = router;
