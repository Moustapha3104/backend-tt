const express = require('express');
const router = express.Router();
const exportController = require('../controllers/exportController');
const { authenticate, requireGerant } = require('../middlewares/auth');

router.get('/rapport-mensuel.xlsx', authenticate, requireGerant, exportController.exportExcel);
router.get('/rapport-mensuel.pdf', authenticate, requireGerant, exportController.exportPDF);

module.exports = router;
