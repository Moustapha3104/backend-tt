const express = require('express');
const router = express.Router();
const authController = require('../controllers/authController');
const { authenticate } = require('../middlewares/auth');
const { loginLimiter } = require('../middlewares/rateLimiter');

router.post('/register', authController.register);
router.post('/login', loginLimiter, authController.login);
router.get('/me', authenticate, authController.me);
router.put('/profile', authenticate, authController.updateProfile);
router.post('/update-password', authenticate, authController.updatePassword);

module.exports = router;
