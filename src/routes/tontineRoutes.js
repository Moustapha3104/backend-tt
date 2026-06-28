const express = require('express');
const router = express.Router();
const tontineController = require('../controllers/tontineController');
const { authenticate, requireGerant } = require('../middlewares/auth');

router.get('/tontines', authenticate, tontineController.getAll);
router.get('/tontine', authenticate, tontineController.getCurrent);
router.post('/tontine', authenticate, requireGerant, tontineController.create);
router.put('/tontine', authenticate, requireGerant, tontineController.update);
router.delete('/tontine/:id', authenticate, requireGerant, tontineController.deleteTontine);
router.post('/tontine/:id/regenerate-code', authenticate, requireGerant, tontineController.regenerateCode);

router.get('/tontine/code', authenticate, tontineController.getCode);
router.post('/tontine/rejoindre', authenticate, tontineController.join);

module.exports = router;
