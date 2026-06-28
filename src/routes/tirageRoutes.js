const express = require('express');
const router = express.Router();
const tirageController = require('../controllers/tirageController');
const { authenticate, requireGerant } = require('../middlewares/auth');

router.get('/tirage', authenticate, tirageController.getTirage);
router.post('/tirage/effectuer', authenticate, requireGerant, tirageController.effectuer);
router.post('/tirage/:id/envoyer', authenticate, requireGerant, tirageController.envoyer);
router.post('/tirages', authenticate, requireGerant, tirageController.deterministicTirage);

module.exports = router;
