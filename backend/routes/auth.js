const express = require('express');
const router = express.Router();
const { getAllUsers } = require('../controllers/auth');

router.get('/', getAllUsers);

module.exports = router;
