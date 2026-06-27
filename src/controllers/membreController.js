const db = require('../config/db');
const { sendEmail } = require('../config/mailer');
const { logAction, getCurrentTontine } = require('../utils/helpers');

exports.getAll = async (req, res) => {
  const tontine = await getCurrentTontine(req);
  if (!tontine) return res.json({ success: true, data: [], stats: { total: 0, payes: 0, enAttente: 0 } });
  const [membres] = await db.query(`
    SELECT m.*, u.email FROM membres m LEFT JOIN users u ON m.user_id = u.id WHERE m.tontine_id = ? ORDER BY m.turn_number
  `, [tontine.id]);
  const stats = {
    total: membres.length,
    payes: membres.filter(m => m.paid).length,
    enAttente: membres.filter(m => !m.paid).length,
  };
  res.json({ success: true, data: membres, stats });
};

exports.getMyStatus = async (req, res) => {
  const [[membership]] = await db.query(`
    SELECT m.id as membre_id, m.tontine_id, t.nom as tontine_nom
    FROM membres m
    JOIN tontine t ON t.id = m.tontine_id
    WHERE m.user_id = ?
    ORDER BY m.id DESC
    LIMIT 1
  `, [req.user.id]);
  res.json({
    success: true,
    data: {
      is_member: !!membership,
      membership: membership || null,
    },
  });
};

exports.getMyDashboard = async (req, res) => {
  const tontine = await getCurrentTontine(req);
  let membre = null;
  if(tontine) {
    const [[m]] = await db.query('SELECT m.*, u.email FROM membres m LEFT JOIN users u ON m.user_id = u.id WHERE m.user_id = ? AND m.tontine_id = ?', [req.user.id, tontine.id]);
    membre = m;
  }
  if (!membre) return res.status(404).json({ success: false, message: 'Membre introuvable' });
  const [[{total}]] = await db.query("SELECT COALESCE(SUM(amount), 0) as total FROM transactions WHERE membre_id = ? AND tontine_id = ? AND type = 'cotisation'", [membre.id, tontine.id]);
  const [[nextTour]] = await db.query("SELECT * FROM tours WHERE membre_id = ? AND tontine_id = ? AND statut = 'en_attente' ORDER BY ordre LIMIT 1", [membre.id, tontine.id]);
  const [history] = await db.query('SELECT * FROM transactions WHERE membre_id = ? AND tontine_id = ? ORDER BY created_at DESC LIMIT 10', [membre.id, tontine.id]);
  res.json({ success: true, data: { membre, stats: { totalCotisations: Number(total), nextTourOrder: nextTour?.ordre }, history } });
};

exports.appliquerPenalite = async (req, res) => {
  const [[membre]] = await db.query('SELECT * FROM membres WHERE id = ?', [req.params.id]);
  if (!membre) return res.status(404).json({ success: false, message: 'Membre introuvable' });
  const penalite = 5000;
  await db.query("INSERT INTO transactions (membre_id, type, amount, name, initials, color, tontine_id) VALUES (?, 'penalite', ?, ?, ?, ?, ?)", [membre.id, penalite, membre.name, membre.initials, membre.color, membre.tontine_id]);
  await db.query('UPDATE tontine SET cagnotte = cagnotte + ? WHERE id = ?', [penalite, membre.tontine_id]);
  await logAction(req.user.id, 'PENALITE', `Pénalité de ${penalite} F pour ${membre.name}`);
  res.json({ success: true, message: `Pénalité de ${penalite.toLocaleString('fr-FR')} F appliquée à ${membre.name}`, data: penalite });
};

exports.sendMessage = async (req, res) => {
  const { sujet, contenu } = req.body;
  if (!sujet || !contenu) return res.status(400).json({ success: false, message: 'Sujet et contenu requis' });
  const [[membre]] = await db.query('SELECT m.*, u.email FROM membres m LEFT JOIN users u ON m.user_id = u.id WHERE m.id = ?', [req.params.id]);
  if (!membre) return res.status(404).json({ success: false, message: 'Membre introuvable' });
  if (!membre.email) return res.status(400).json({ success: false, message: "Ce membre n'a pas d'adresse email" });
  const html = `
    <div style="font-family:sans-serif;max-width:600px;margin:auto;padding:24px;">
      <h2 style="color:#7C3AED;">🔮 Tontine Nataal</h2>
      <p>Bonjour <strong>${membre.name}</strong>,</p>
      <div style="background:#f9f9f9;border-radius:12px;padding:16px;margin:16px 0;">${contenu.replace(/\\n/g, '<br>')}</div>
      <p style="color:#888;font-size:12px;">Tontine Nataal — Gestion multi-tontines</p>
    </div>`;
  try {
    await sendEmail(membre.email, sujet, html);
    await logAction(req.user.id, 'MESSAGE', `Message à ${membre.name}: ${sujet}`);
    res.json({ success: true, message: `Message envoyé à ${membre.name}` });
  } catch (e) {
    res.status(500).json({ success: false, message: "Erreur d'envoi: " + e.message });
  }
};
