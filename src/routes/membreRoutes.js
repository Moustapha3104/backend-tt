const express = require('express');
const router = express.Router();
const membreController = require('../controllers/membreController');
const { authenticate, requireGerant } = require('../middlewares/auth');

router.get('/', authenticate, membreController.getAll);
router.get('/me/status', authenticate, membreController.getMyStatus);
router.get('/me/dashboard', authenticate, membreController.getMyDashboard);
router.post('/:id/appliquer-penalite', authenticate, requireGerant, membreController.appliquerPenalite);
router.post('/:id/message', authenticate, requireGerant, membreController.sendMessage);

module.exports = router;
