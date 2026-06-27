const fs = require('fs');
const path = require('path');
const bcrypt = require('bcryptjs');
const db = require('../config/db');
const { logAction, getCurrentTontine } = require('../utils/helpers');

const UPLOADS_DIR = path.join(__dirname, '../../uploads');
if (!fs.existsSync(UPLOADS_DIR)) fs.mkdirSync(UPLOADS_DIR, { recursive: true });

exports.createMember = async (req, res) => {
  const { nom, prenom, email, telephone, password, photo } = req.body;
  if (!nom || !email || !password) return res.status(400).json({ success: false, message: 'Nom, email et mot de passe requis' });
  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  if (!emailRegex.test(email.trim())) return res.status(400).json({ success: false, message: "Format d'email invalide" });
  if (password.length < 6) return res.status(400).json({ success: false, message: 'Le mot de passe doit contenir au moins 6 caractères' });

  try {
    let photoPath = '';
    if (photo && photo.startsWith('data:image')) {
      const matches = photo.match(/^data:image\/(\w+);base64,(.+)$/);
      if (matches) {
        const ext = matches[1];
        const base64Data = matches[2];
        const filename = `member_${Date.now()}.${ext}`;
        fs.writeFileSync(path.join(UPLOADS_DIR, filename), Buffer.from(base64Data, 'base64'));
        photoPath = `/uploads/${filename}`;
      }
    }

    const hashed = bcrypt.hashSync(password, 10);
    const fullName = prenom ? `${nom} ${prenom}` : nom;
    const initials = [nom[0], prenom ? prenom[0] : (nom[1] || '')].join('').toUpperCase();
    const colors = ['#FF6B6B', '#4ECDC4', '#45B7D1', '#F7DC6F', '#BB8FCE', '#82E0AA', '#F0B27A', '#AED6F1', '#C39BD3', '#7DCEA0'];
    const color = colors[Math.floor(Math.random() * colors.length)];

    const userResult = ((await db.query(
      'INSERT INTO users (name, prenom, email, telephone, password, photo, role) VALUES (?, ?, ?, ?, ?, ?, \'membre\')'
    , [nom, prenom || '', email, telephone || '', hashed, photoPath]))[0]);

    const tontine = await getCurrentTontine(req);
    const membresCount = ((await db.query('SELECT COUNT(*) as c FROM membres WHERE tontine_id = ?', [tontine.id]))[0][0]).c;
    const membreResult = ((await db.query(
      'INSERT INTO membres (user_id, name, prenom, telephone, photo, role, turn_number, color, initials, tontine_id) VALUES (?, ?, ?, ?, ?, \'Membre\', ?, ?, ?, ?)'
    , [userResult.insertId, fullName, prenom || '', telephone || '', photoPath, membresCount + 1, color, initials, tontine.id]))[0]);

    ((await db.query('INSERT INTO tours (membre_id, membre_name, ordre, montant, tontine_id) VALUES (?, ?, ?, ?, ?)', [
      membreResult.insertId, fullName, membresCount + 1, tontine ? tontine.cotisation_mensuelle * 12 : 400000, tontine.id
    ]))[0]);

    await logAction(req.user.id, 'CREATE_MEMBER', `Création du membre ${fullName} (${email})`);
    res.status(201).json({
      success: true,
      message: `Membre ${fullName} créé avec succès`,
      data: {
        id: membreResult.insertId,
        user_id: userResult.insertId,
        name: fullName, prenom, email, telephone, photo: photoPath, initials, color
      }
    });
  } catch (e) {
    if (e.message && e.message.includes('UNIQUE')) return res.status(409).json({ success: false, message: 'Cet email est déjà utilisé' });
    res.status(500).json({ success: false, message: e.message });
  }
};

exports.deleteMember = async (req, res) => {
  const membre = ((await db.query('SELECT * FROM membres WHERE id = ?', [req.params.id]))[0][0]);
  if (!membre) return res.status(404).json({ success: false, message: 'Membre introuvable' });
  if (membre.photo) {
    const filePath = path.join(__dirname, '../../', membre.photo);
    if (fs.existsSync(filePath)) fs.unlinkSync(filePath);
  }
  ((await db.query('DELETE FROM echeances WHERE pret_id IN (SELECT id FROM prets WHERE membre_id = ?)', [membre.id]))[0]);
  ((await db.query('DELETE FROM prets WHERE membre_id = ?', [membre.id]))[0]);
  ((await db.query('DELETE FROM tirages_mensuels WHERE membre_id = ?', [membre.id]))[0]);
  ((await db.query('DELETE FROM tours WHERE membre_id = ?', [membre.id]))[0]);
  ((await db.query('DELETE FROM transactions WHERE membre_id = ?', [membre.id]))[0]);

  ((await db.query('DELETE FROM membres WHERE id = ?', [membre.id]))[0]);

  if (membre.user_id) {
    ((await db.query('DELETE FROM notifications WHERE user_id = ?', [membre.user_id]))[0]);
    ((await db.query('DELETE FROM users WHERE id = ?', [membre.user_id]))[0]);
  }

  await logAction(req.user.id, 'DELETE_MEMBER', `Suppression du membre #${membre.id} (${membre.name})`);
  res.json({ success: true, message: `Membre ${membre.name} supprimé` });
};

exports.updateMember = async (req, res) => {
  const { nom, prenom, email, telephone, photo } = req.body;
  if (!nom || !email) return res.status(400).json({ success: false, message: 'Nom et email requis' });

  const membre = ((await db.query('SELECT * FROM membres WHERE id = ?', [req.params.id]))[0][0]);
  if (!membre) return res.status(404).json({ success: false, message: 'Membre introuvable' });

  try {
    let photoPath = membre.photo || '';
    if (photo && photo.startsWith('data:image')) {
      if (membre.photo) {
        const oldPath = path.join(__dirname, '../../', membre.photo);
        if (fs.existsSync(oldPath)) fs.unlinkSync(oldPath);
      }
      const matches = photo.match(/^data:image\/(\w+);base64,(.+)$/);
      if (matches) {
        const ext = matches[1];
        const filename = `member_${Date.now()}.${ext}`;
        fs.writeFileSync(path.join(UPLOADS_DIR, filename), Buffer.from(matches[2], 'base64'));
        photoPath = `/uploads/${filename}`;
      }
    } else if (photo === '') {
      if (membre.photo) {
        const oldPath = path.join(__dirname, '../../', membre.photo);
        if (fs.existsSync(oldPath)) fs.unlinkSync(oldPath);
      }
      photoPath = '';
    }

    const fullName = prenom ? `${nom} ${prenom}` : nom;
    const initials = [nom[0], prenom ? prenom[0] : (nom[1] || '')].join('').toUpperCase();

    ((await db.query(`
      UPDATE membres SET name = ?, prenom = ?, telephone = ?, photo = ?, initials = ? WHERE id = ?
    `, [fullName, prenom || '', telephone || '', photoPath, initials, membre.id]))[0]);

    if (membre.user_id) {
      const existingUser = ((await db.query('SELECT id, email FROM users WHERE email = ? AND id != ?', [email, membre.user_id]))[0][0]);
      if (existingUser) return res.status(409).json({ success: false, message: 'Cet email est déjà utilisé par un autre membre' });
      ((await db.query('UPDATE users SET name = ?, prenom = ?, email = ?, telephone = ?, photo = ? WHERE id = ?', [nom, prenom || '', email, telephone || '', photoPath, membre.user_id]))[0]);
    }

    ((await db.query('UPDATE tours SET membre_name = ? WHERE membre_id = ?', [fullName, membre.id]))[0]);

    await logAction(req.user.id, 'EDIT_MEMBER', `Modification du membre #${membre.id} → ${fullName}`);
    res.json({ success: true, message: `Membre ${fullName} mis à jour`, data: { id: membre.id, name: fullName, prenom, email, telephone, photo: photoPath, initials } });
  } catch (e) {
    if (e.message && e.message.includes('UNIQUE')) return res.status(409).json({ success: false, message: 'Cet email est déjà utilisé' });
    res.status(500).json({ success: false, message: e.message });
  }
};

exports.getAuditLogs = async (req, res) => {
  const logs = ((await db.query('SELECT a.*, u.name as user_name FROM audit_logs a LEFT JOIN users u ON a.user_id = u.id ORDER BY a.created_at DESC LIMIT 100', []))[0]);
  res.json({ success: true, data: logs });
};
