const express = require('express');
const router = express.Router();
const statsController = require('../controllers/statsController');
const { authenticate } = require('../middlewares/auth');

router.get('/evolution-mensuelle', authenticate, statsController.getEvolutionMensuelle);
router.get('/finance-dashboard', authenticate, statsController.getFinanceDashboard);

module.exports = router;
