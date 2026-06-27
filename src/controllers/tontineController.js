const db = require('../config/db');
const { logAction, generateInvitationCode, getCurrentTontine } = require('../utils/helpers');

const hasColumn = async (table, column) => {
  const [rows] = await db.query(`SHOW COLUMNS FROM ?? LIKE ?`, [table, column]);
  return rows.length > 0;
};

exports.getAll = async (req, res) => {
  const isGerant = req.user.role === 'gerant';
  const isAdmin = req.user.role === 'admin';
  let query = `
    SELECT t.*, 
           EXISTS(SELECT 1 FROM membres m WHERE m.tontine_id = t.id AND m.user_id = ?) as is_joined
    FROM tontine t
  `;
  let params = [req.user.id];
  
  if (isGerant && !isAdmin && await hasColumn('tontine', 'gerant_id')) {
    query += ` WHERE t.gerant_id = ?`;
    params.push(req.user.id);
  }
  
  query += ` ORDER BY t.id DESC`;
  const [tontines] = await db.query(query, params);
  res.json({ success: true, data: tontines });
};

exports.getCurrent = async (req, res) => {
  const t = await getCurrentTontine(req);
  if (!t) return res.status(404).json({ success: false, message: 'Tontine introuvable' });
  res.json({ success: true, data: t });
};

exports.create = async (req, res) => {
  const { nom, description, cotisation_mensuelle, frequence, frais_gestion, nombre_places, date_debut, tour_total } = req.body;
  const code = await generateInvitationCode();
  const [result] = await db.query(`
    INSERT INTO tontine (gerant_id, nom, description, cotisation_mensuelle, frequence, frais_gestion, nombre_places, date_debut, tour_total, code_invitation)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `, [
    req.user.id,
    nom || 'Tontine Nataal',
    description || '',
    cotisation_mensuelle || 50000,
    frequence || 'mensuelle',
    frais_gestion || 0,
    nombre_places || 12,
    date_debut || '',
    tour_total || nombre_places || 12,
    code
  ]);
  const [[tontine]] = await db.query('SELECT * FROM tontine WHERE id = ?', [result.insertId]);
  await logAction(req.user.id, 'CREATE_TONTINE', `Création tontine ${tontine.nom} (${code})`);
  res.status(201).json({ success: true, message: 'Tontine créée avec succès', data: tontine, code });
};

exports.regenerateCode = async (req, res) => {
  const { id } = req.params;
  const [[tontine]] = await db.query('SELECT * FROM tontine WHERE id = ?', [id]);
  
  if (!tontine) {
    return res.status(404).json({ success: false, message: 'Tontine introuvable' });
  }
  if (tontine.gerant_id !== req.user.id) {
    return res.status(403).json({ success: false, message: 'Non autorisé' });
  }
  
  const newCode = await generateInvitationCode();
  await db.query('UPDATE tontine SET code_invitation = ? WHERE id = ?', [newCode, id]);
  await logAction(req.user.id, 'REGENERATE_CODE', `Nouveau code pour tontine ${tontine.nom}: ${newCode} (ancien: ${tontine.code_invitation})`);
  
  res.json({ success: true, message: 'Code d\'invitation régénéré', code: newCode });
};

exports.deleteTontine = async (req, res) => {
  const { id } = req.params;
  const [[tontine]] = await db.query('SELECT * FROM tontine WHERE id = ?', [id]);
  
  if (!tontine) {
    return res.status(404).json({ success: false, message: 'Tontine introuvable' });
  }
  if (tontine.gerant_id !== req.user.id) {
    return res.status(403).json({ success: false, message: 'Non autorisé - Cette tontine n\'appartient pas à cet utilisateur' });
  }
  
  const [[{ count: memberCount }]] = await db.query('SELECT COUNT(*) as count FROM membres WHERE tontine_id = ?', [id]);
  if (memberCount > 0) {
    return res.status(400).json({ success: false, message: 'Impossible de supprimer une tontine qui a des membres. Veuillez d\'abord retirer tous les membres.' });
  }
  
  await db.query('DELETE FROM tontine WHERE id = ?', [id]);
  await logAction(req.user.id, 'DELETE_TONTINE', `Suppression tontine "${tontine.nom}" (${tontine.code_invitation})`);
  res.json({ success: true, message: 'Tontine supprimée avec succès' });
};

exports.update = async (req, res) => {
  const { nom, description, cotisation_mensuelle, frequence, frais_gestion, nombre_places, date_debut, tour_total } = req.body;
  const current = await getCurrentTontine(req);
  if (!current) return res.status(404).json({ success: false, message: 'Tontine introuvable' });
  if (current.gerant_id !== req.user.id) {
    return res.status(403).json({ success: false, message: 'Non autorisé' });
  }
  
  await db.query(`
    UPDATE tontine SET
      nom = ?, description = ?, cotisation_mensuelle = ?,
      frequence = ?, frais_gestion = ?, nombre_places = ?,
      date_debut = ?, tour_total = ?
    WHERE id = ?
  `, [
    nom || 'Tontine Nataal',
    description || '',
    cotisation_mensuelle || 50000,
    frequence || 'mensuelle',
    frais_gestion || 0,
    nombre_places || 12,
    date_debut || '',
    tour_total || 12,
    current.id
  ]);
  await logAction(req.user.id, 'UPDATE_TONTINE', JSON.stringify(req.body));
  res.json({ success: true, message: 'Tontine mise à jour' });
};

exports.getCode = async (req, res) => {
  let t = await getCurrentTontine(req);
  if (!t) return res.status(404).json({ success: false, message: 'Tontine introuvable' });
  if (!t.code_invitation) {
    const code = await generateInvitationCode();
    await db.query('UPDATE tontine SET code_invitation = ? WHERE id = ?', [code, t.id]);
    t.code_invitation = code;
  }
  res.json({ success: true, code: t.code_invitation });
};

exports.join = async (req, res) => {
  const { code } = req.body;
  const [rows] = await db.query('SELECT id, code_invitation, nom FROM tontine WHERE code_invitation = ?', [code]);
  const t = rows[0];
  if (!t) return res.status(404).json({ success: false, message: "Code invalide" });

  const [existsRows] = await db.query('SELECT id FROM membres WHERE user_id = ? AND tontine_id = ?', [req.user.id, t.id]);
  if (existsRows.length > 0) return res.status(400).json({ success: false, message: "Vous êtes déjà membre" });

  const [[user]] = await db.query('SELECT name, photo FROM users WHERE id = ?', [req.user.id]);
  const initials = user.name.split(' ').map(n => n[0]).join('').toUpperCase();
  const [[{ m }]] = await db.query('SELECT MAX(turn_number) as m FROM membres WHERE tontine_id = ?', [t.id]);
  const nextTurn = (m || 0) + 1;

  await db.query('INSERT INTO membres (user_id, name, photo, turn_number, initials, tontine_id) VALUES (?, ?, ?, ?, ?, ?)', [req.user.id, user.name, user.photo, nextTurn, initials, t.id]);

  res.json({ success: true, message: "Bienvenue dans la tontine !", tontine_id: t.id, tontine_nom: t.nom });
};
