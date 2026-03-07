const express = require('express');
const router = express.Router();
const { searchCase } = require('../controllers/caseController');
const { protect } = require('../middleware/authMiddleware');

// In production, uncomment .protect to ensure only authenticated lawyers can search
router.post('/search', searchCase);

module.exports = router;
