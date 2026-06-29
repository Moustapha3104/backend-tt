const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const db = require('../config/db');
const { JWT_SECRET } = require('../config/env');
const { logAction } = require('../utils/helpers');
const fs = require('fs');
const path = require('path');

const UPLOADS_DIR = path.join(__dirname, '../../uploads');
if (!fs.existsSync(UPLOADS_DIR)) fs.mkdirSync(UPLOADS_DIR, { recursive: true });

exports.register = async (req, res) => {
  const { name, email, password } = req.body;
  if (!name || !email || !password) return res.status(400).json({ success: false, message: 'Champs manquants' });
  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  if (!emailRegex.test(email.trim())) return res.status(400).json({ success: false, message: "Format d'email invalide" });
  if (password.length < 6) return res.status(400).json({ success: false, message: 'Le mot de passe doit contenir au moins 6 caractères' });
  try {
    const trimmedName = name.trim();
    const trimmedEmail = email.trim().toLowerCase();
    const hashed = bcrypt.hashSync(password, 10);
    const result = ((await db.query('INSERT INTO users (name, email, password) VALUES (?, ?, ?)', [trimmedName, trimmedEmail, hashed]))[0]);
    const token = jwt.sign({ id: result.insertId, email: trimmedEmail, name: trimmedName, role: 'membre' }, JWT_SECRET, { expiresIn: '7d' });
    res.status(201).json({ success: true, token });
  } catch (e) {
    if (e.message.includes('UNIQUE')) return res.status(409).json({ success: false, message: 'Email déjà utilisé' });
    res.status(500).json({ success: false, message: e.message });
  }
};

exports.login = async (req, res) => {
  const { email, password } = req.body;
  if (!email || !password) return res.status(400).json({ success: false, message: 'Champs manquants' });
  const user = ((await db.query('SELECT * FROM users WHERE email = ?', [email]))[0][0]);
  if (!user || !bcrypt.compareSync(password, user.password)) return res.status(401).json({ success: false, message: 'Identifiants invalides' });
  const token = jwt.sign({ id: user.id, email: user.email, name: user.name, role: user.role }, JWT_SECRET, { expiresIn: '7d' });
  await logAction(user.id, 'LOGIN', `Connexion de ${user.email}`);
  res.json({ success: true, token, user: { id: user.id, name: user.name, email: user.email, role: user.role } });
};

exports.me = async (req, res) => {
  const user = ((await db.query('SELECT id, name, email, role, photo FROM users WHERE id = ?', [req.user.id]))[0][0]);
  if (!user) return res.status(404).json({ success: false, message: 'Utilisateur introuvable' });
  res.json({ success: true, user });
};

exports.updateProfile = async (req, res) => {
  const { name, email, photo } = req.body;
  if (!name || !email) return res.status(400).json({ success: false, message: 'Nom et email requis' });

  try {
    const user = ((await db.query('SELECT photo FROM users WHERE id = ?', [req.user.id]))[0][0]);
    let photoPath = user ? user.photo : '';

    if (photo && photo.startsWith('data:image')) {
      if (photoPath) {
        const oldPath = path.join(__dirname, '../../', photoPath);
        if (fs.existsSync(oldPath)) fs.unlinkSync(oldPath);
      }
      const matches = photo.match(/^data:image\/(\w+);base64,(.+)$/);
      if (matches) {
        const ext = matches[1];
        const filename = `user_${req.user.id}_${Date.now()}.${ext}`;
        fs.writeFileSync(path.join(UPLOADS_DIR, filename), Buffer.from(matches[2], 'base64'));
        photoPath = `/uploads/${filename}`;
      }
    } else if (photo === '') {
      if (photoPath) {
        const oldPath = path.join(__dirname, '../../', photoPath);
        if (fs.existsSync(oldPath)) fs.unlinkSync(oldPath);
      }
      photoPath = '';
    }

    ((await db.query('UPDATE users SET name = ?, email = ?, photo = ? WHERE id = ?', [name, email, photoPath, req.user.id]))[0]);
    ((await db.query('UPDATE membres SET name = ?, photo = ? WHERE user_id = ?', [name, photoPath, req.user.id]))[0]);

    res.json({ success: true, message: "Profil mis à jour", photo: photoPath });
  } catch (e) {
    res.status(500).json({ success: false, message: e.message });
  }
};

exports.updatePassword = async (req, res) => {
  const { oldPass, newPass } = req.body;
  const user = ((await db.query('SELECT password FROM users WHERE id = ?', [req.user.id]))[0][0]);
  if (!bcrypt.compareSync(oldPass, user.password)) return res.status(400).json({ success: false, message: "Ancien mot de passe incorrect" });
  const hashed = bcrypt.hashSync(newPass, 10);
  ((await db.query('UPDATE users SET password = ? WHERE id = ?', [hashed, req.user.id]))[0]);
  res.json({ success: true, message: "Mot de passe modifié" });
};
