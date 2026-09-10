const express = require('express');
const router = express.Router();
const authenticateFirebaseToken = require('../middleware/auth');
const { getAllUsers, getUser, createUser, deleteUser } = require('../controllers/auth');

router.get('/', getAllUsers);
router.get('/:firebaseUid', authenticateFirebaseToken, getUser);
router.post('/', createUser);
router.delete('/', authenticateFirebaseToken, deleteUser);

module.exports = router;
