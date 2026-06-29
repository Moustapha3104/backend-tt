const db = require('../config/db');
const { sendEmail } = require('../config/mailer');
const { logAction, getCurrentTontine } = require('../utils/helpers');

exports.sendManual = async (req, res) => {
  const { message, members, type } = req.body;
  const tontine = await getCurrentTontine(req);
  if (!tontine) return res.status(404).json({ success: false, message: 'Tontine introuvable' });

  let targetMembers = [];
  if (members === 'all') {
    const [rows] = await db.query('SELECT m.user_id, m.name, u.email FROM membres m LEFT JOIN users u ON m.user_id = u.id WHERE m.tontine_id = ?' + (type === 'rappel' ? ' AND m.paid = 0' : ''), [tontine.id]);
    targetMembers = rows;
  } else {
    const placeholders = members.map(() => '?').join(',');
    const [rows] = await db.query(`SELECT m.user_id, m.name, u.email FROM membres m LEFT JOIN users u ON m.user_id = u.id WHERE m.id IN (${placeholders}) AND m.tontine_id = ?`, [...members, tontine.id]);
    targetMembers = rows;
  }

  const icon = type === 'rappel' ? '🔔' : 'ℹ️';
  const notifType = type === 'rappel' ? 'rappel' : 'info';
  const subject = type === 'rappel' ? 'Rappel de Cotisation' : 'Information Tontine Nataal';

  let sentEmails = 0;
  for (const m of targetMembers) {
    if (m.user_id) {
      await db.query('INSERT INTO notifications (user_id, texte, icon, type) VALUES (?, ?, ?, ?)', [m.user_id, message, icon, notifType]);
    }
    
    if (m.email) {
      const html = `<div style="font-family:sans-serif;padding:24px;">
        <h2 style="color:#7C3AED;">${icon} ${subject}</h2>
        <p>Bonjour <strong>${m.name}</strong>,</p>
        <div style="background:#f9f9f9;border-radius:12px;padding:16px;margin:16px 0;">${message.replace(/\\n/g, '<br>')}</div>
        <p style="color:#888;font-size:12px;">Tontine Nataal</p>
      </div>`;
      await sendEmail(m.email, subject, html).catch(() => { });
      sentEmails++;
    }
  }

  res.json({ success: true, message: `${targetMembers.length} notification(s) envoyée(s) et ${sentEmails} email(s).` });
};

exports.sendReminders = async (req, res) => {
  const tontine = await getCurrentTontine(req);
  if (!tontine) return res.status(404).json({ success: false, message: 'Tontine active introuvable' });
  const [unpaid] = await db.query('SELECT m.*, u.email FROM membres m LEFT JOIN users u ON m.user_id = u.id WHERE m.paid = 0 AND m.tontine_id = ? AND u.email IS NOT NULL', [tontine.id]);
  let sent = 0;
  for (const m of unpaid) {
    const html = `<div style="font-family:sans-serif;padding:24px;"><h2 style="color:#FF7900;">⚠️ Rappel de Cotisation</h2><p>Bonjour <strong>${m.name}</strong>,</p><p>Votre cotisation mensuelle est en attente. Merci de régulariser dès que possible.</p><p style="color:#888;font-size:12px;">Tontine Nataal</p></div>`;
    await sendEmail(m.email, 'Rappel : Votre cotisation est en attente', html).catch(() => { });
    sent++;
  }
  await logAction(req.user.id, 'REMINDERS', `${sent} rappels envoyés`);
  res.json({ success: true, message: `${sent} rappel(s) envoyé(s)` });
};

exports.sendInAppReminders = async (req, res) => {
  const { message, members } = req.body;
  let targetMembers = [];
  if (members === 'all') {
    const [rows] = await db.query('SELECT user_id FROM membres WHERE paid = 0', []);
    targetMembers = rows;
  } else {
    for (const id of members) {
      const [[m]] = await db.query('SELECT user_id FROM membres WHERE id = ?', [id]);
      if(m) targetMembers.push(m);
    }
  }

  for (const m of targetMembers) {
    if (m.user_id) {
      await db.query('INSERT INTO notifications (user_id, texte, icon, type) VALUES (?, ?, ?, ?)', [m.user_id, message, '🔔', 'rappel']);
    }
  }

  res.json({ success: true, message: `${targetMembers.length} notifications envoyées.` });
};

exports.create = async (req, res) => {
  const { user_id, texte, icon, type, global } = req.body;
  await db.query('INSERT INTO notifications (user_id, texte, icon, type, global_notif) VALUES (?, ?, ?, ?, ?)', [user_id, texte, icon, type, global ? 1 : 0]);
  res.json({ success: true });
};

exports.getAll = async (req, res) => {
  const [notifs] = await db.query('SELECT *, is_read AS `read` FROM notifications WHERE (user_id = ? OR global_notif = 1) ORDER BY created_at DESC LIMIT 50', [req.user.id]);
  res.json({ success: true, data: notifs });
};

exports.getCount = async (req, res) => {
  const [[row]] = await db.query('SELECT COUNT(*) as count FROM notifications WHERE (user_id = ? OR global_notif = 1) AND is_read = 0', [req.user.id]);
  res.json({ success: true, count: row.count });
};

exports.markRead = async (req, res) => {
  await db.query('UPDATE notifications SET is_read = 1 WHERE id = ? AND (user_id = ? OR global_notif = 1)', [req.params.id, req.user.id]);
  res.json({ success: true });
};

exports.markAllRead = async (req, res) => {
  await db.query('UPDATE notifications SET is_read = 1 WHERE (user_id = ? OR global_notif = 1)', [req.user.id]);
  res.json({ success: true });
};
