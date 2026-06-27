const express = require('express');
const router = express.Router();
const tourController = require('../controllers/tourController');
const { authenticate, requireGerant } = require('../middlewares/auth');

router.get('/', authenticate, tourController.getAll);
router.put('/:id/complete', authenticate, requireGerant, tourController.complete);

module.exports = router;
