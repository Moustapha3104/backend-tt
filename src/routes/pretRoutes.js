const express = require('express');
const router = express.Router();
const pretController = require('../controllers/pretController');
const { authenticate, requireGerant } = require('../middlewares/auth');

router.get('/', authenticate, pretController.getAll);
router.post('/', authenticate, pretController.create);
router.post('/:id/approuver', authenticate, requireGerant, pretController.approuver);
router.post('/:id/rejeter', authenticate, requireGerant, pretController.rejeter);
router.get('/:id/echeancier', authenticate, pretController.getEcheancier);
router.post('/echeance/:id/rembourser', authenticate, pretController.rembourserEcheance);

module.exports = router;
