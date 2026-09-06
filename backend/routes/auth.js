const express = require('express');
const router = express.Router();
const authenticateFirebaseToken = require('../middleware/auth');
const { getAllUsers, createUser, deleteUser } = require('../controllers/auth');

router.get('/', getAllUsers);
router.post('/', createUser);
router.delete('/', authenticateFirebaseToken, deleteUser);

module.exports = router;
