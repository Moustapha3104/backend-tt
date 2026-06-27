const rateLimit = require('express-rate-limit');

const globalLimiter = rateLimit({ windowMs: 15 * 60 * 1000, max: 5000 });

const loginLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 10,
  message: { success: false, message: 'Trop de tentatives de connexion. Réessayez dans 15 minutes.' },
  standardHeaders: true,
  legacyHeaders: false
});

module.exports = { globalLimiter, loginLimiter };
