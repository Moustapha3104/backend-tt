const jwt = require('jsonwebtoken');
const { JWT_SECRET } = require('../config/env');

function authenticate(req, res, next) {
  const header = req.headers.authorization;
  if (!header || !header.startsWith('Bearer ')) return res.status(401).json({ success: false, message: 'Non authentifié' });
  try {
    req.user = jwt.verify(header.split(' ')[1], JWT_SECRET);
    next();
  } catch {
    return res.status(401).json({ success: false, message: 'Token invalide' });
  }
}

function requireGerant(req, res, next) {
  if (req.user.role !== 'gerant' && req.user.role !== 'admin') {
    return res.status(403).json({ success: false, message: 'Accès réservé au gérant et administrateur' });
  }
  next();
}

module.exports = { authenticate, requireGerant };
