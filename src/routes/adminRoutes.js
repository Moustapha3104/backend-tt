const express = require('express');
const router = express.Router();
const adminController = require('../controllers/adminController');
const { authenticate, requireGerant } = require('../middlewares/auth');

router.post('/create-member', authenticate, requireGerant, adminController.createMember);
router.put('/membres/:id', authenticate, requireGerant, adminController.updateMember);
router.delete('/membres/:id', authenticate, requireGerant, adminController.deleteMember);
router.get('/audit', authenticate, requireGerant, adminController.getAuditLogs);

module.exports = router;
