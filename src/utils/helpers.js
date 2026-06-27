const crypto = require('crypto');
const db = require('../config/db');

async function logAction(userId, action, details) {
  try { await db.query('INSERT INTO audit_logs (user_id, action, details) VALUES (?, ?, ?)', [userId, action, details]); } catch { }
}

async function generateInvitationCode(reservedCodes = new Set()) {
  let code;
  let exists = true;
  while(exists) {
    code = crypto.randomBytes(4).toString('hex').slice(0, 6).toUpperCase();
    if(reservedCodes.has(code)) continue;
    try {
        const [rows] = await db.query('SELECT id FROM tontine WHERE UPPER(code_invitation) = ?', [code]);
        if(rows.length === 0) exists = false;
    } catch(e) { exists = false; }
  }
  return code;
}

async function getMemberTontine(userId, preferredId) {
  if (preferredId) {
    const [rows] = await db.query(`
      SELECT t.* FROM tontine t
      JOIN membres m ON m.tontine_id = t.id
      WHERE t.id = ? AND m.user_id = ?
    `, [preferredId, userId]);
    if (rows.length > 0) return rows[0];
  }
  const [rows] = await db.query(`
    SELECT t.* FROM tontine t
    JOIN membres m ON m.tontine_id = t.id
    WHERE m.user_id = ?
    ORDER BY m.id DESC
    LIMIT 1
  `, [userId]);
  return rows[0];
}

async function getCurrentTontine(req) {
  const tontineId = req.query?.tontine_id || req.headers['x-tontine-id'];

  let t = null;
  if (req.user?.role !== 'gerant' && req.user?.role !== 'admin') {
    t = await getMemberTontine(req.user.id, tontineId ? Number(tontineId) : null) || null;
  } else if (tontineId) {
    const [rows] = await db.query('SELECT * FROM tontine WHERE id = ?', [tontineId]);
    t = rows[0];
  } else {
    const [rows] = await db.query(`
      SELECT t.* FROM tontine t 
      LEFT JOIN membres m ON m.tontine_id = t.id 
      GROUP BY t.id 
      ORDER BY COUNT(m.id) DESC, t.id ASC 
      LIMIT 1
    `);
    t = rows[0];
  }

  if (t) {
    const [cRows] = await db.query(`
      SELECT COALESCE(SUM(
        CASE 
          WHEN type IN ('cotisation', 'penalite', 'remboursement') THEN amount 
          WHEN type IN ('pret', 'decaissement', 'tirage') THEN -amount 
          ELSE 0 
        END
      ), 0) as cagnotte 
      FROM transactions WHERE tontine_id = ?
    `, [t.id]);
    t.cagnotte = cRows[0].cagnotte;

    const [totalRows] = await db.query("SELECT COALESCE(SUM(amount), 0) as total FROM transactions WHERE type = 'cotisation' AND tontine_id = ?", [t.id]);
    const totalCotisations = totalRows[0].total;
    const objectivTotal = (t.cotisation_mensuelle * t.nombre_places * t.tour_total) || 1;
    let prog = Math.round((totalCotisations / objectivTotal) * 100);
    if (prog > 100) prog = 100;
    t.progression = prog;
  }

  return t;
}

module.exports = { logAction, generateInvitationCode, getMemberTontine, getCurrentTontine };
