const express = require('express');
const router = express.Router();
const notificationController = require('../controllers/notificationController');
const { authenticate, requireGerant } = require('../middlewares/auth');

router.post('/send-manual', authenticate, requireGerant, notificationController.sendManual);
router.post('/send-reminders', authenticate, requireGerant, notificationController.sendReminders);
router.post('/send-inapp-reminders', authenticate, requireGerant, notificationController.sendInAppReminders);

router.post('/', authenticate, notificationController.create);
router.get('/', authenticate, notificationController.getAll);
router.get('/count', authenticate, notificationController.getCount);
router.put('/read-all', authenticate, notificationController.markAllRead);
router.put('/:id/read', authenticate, notificationController.markRead);

module.exports = router;
