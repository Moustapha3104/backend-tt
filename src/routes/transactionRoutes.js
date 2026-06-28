const express = require('express');
const router = express.Router();
const transactionController = require('../controllers/transactionController');
const { authenticate, requireGerant } = require('../middlewares/auth');

router.get('/', authenticate, transactionController.getAll);
router.post('/cotiser', authenticate, transactionController.cotiser);
router.post('/cotiser-batch', authenticate, requireGerant, transactionController.cotiserBatch);

module.exports = router;
