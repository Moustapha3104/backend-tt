const db = require('../config/db');
const { logAction, getCurrentTontine } = require('../utils/helpers');

exports.getAll = async (req, res) => {
  const tontine = await getCurrentTontine(req);
  const [prets] = await db.query(`
    SELECT p.*, m.name as membre_name, m.initials, m.color
    FROM prets p LEFT JOIN membres m ON p.membre_id = m.id
    WHERE p.tontine_id = ?
    ORDER BY p.created_at DESC
  `, [tontine.id]);
  const stats = {
    total: prets.length,
    totalMontant: prets.reduce((a, b) => a + b.montant, 0),
    enAttente: prets.filter(p => p.status === 'En attente').length,
  };
  res.json({ success: true, data: prets, stats });
};

exports.create = async (req, res) => {
  const { montant, motif, membre_id } = req.body;
  if (!montant) return res.status(400).json({ success: false, message: 'Montant requis' });
  if (!motif) return res.status(400).json({ success: false, message: 'Motif requis' });
  const tontine = await getCurrentTontine(req);
  const [[{ c: membresCount }]] = await db.query('SELECT COUNT(*) as c FROM membres WHERE tontine_id = ?', [tontine.id]);
  const cagnotteReference = tontine.cagnotte || ((tontine.cotisation_mensuelle || 0) * membresCount);
  if (montant > cagnotteReference * 0.3) return res.status(400).json({ success: false, message: 'Le montant dépasse 30% de la cagnotte' });
  
  const [membreRows1] = await db.query('SELECT * FROM membres WHERE user_id = ? AND tontine_id = ?', [req.user.id, tontine.id]);
  const [membreRows2] = await db.query('SELECT * FROM membres WHERE id = ? AND tontine_id = ?', [membre_id, tontine.id]);
  const membre = membreRows1[0] || membreRows2[0];
  
  if (!membre) return res.status(404).json({ success: false, message: 'Membre introuvable' });
  const [result] = await db.query("INSERT INTO prets (user_id, membre_id, montant, motif, tontine_id) VALUES (?, ?, ?, ?, ?)", [req.user.id, membre.id, montant, motif, tontine.id]);
  await logAction(req.user.id, 'LOAN_REQUEST', `Demande prêt ${montant} F: ${motif}`);
  res.status(201).json({ success: true, data: { id: result.insertId, montant, motif, status: 'En attente' } });
};

exports.approuver = async (req, res) => {
  const [[pret]] = await db.query('SELECT * FROM prets WHERE id = ?', [req.params.id]);
  if (!pret) return res.status(404).json({ success: false, message: 'Prêt introuvable' });
  const approbations = JSON.parse(pret.approbations || '[]');
  if (!approbations.includes(req.user.id)) approbations.push(req.user.id);
  if (approbations.length >= 2) {
    await db.query("UPDATE prets SET status = 'Approuvé', approbations = ? WHERE id = ?", [JSON.stringify(approbations), pret.id]);
    await db.query("INSERT INTO transactions (membre_id, type, amount, name, tontine_id) VALUES (?, 'pret', ?, ?, ?)", [pret.membre_id, pret.montant, `Prêt approuvé`, pret.tontine_id]);
    await db.query('UPDATE tontine SET cagnotte = cagnotte - ? WHERE id = ?', [pret.montant, pret.tontine_id]);
    await logAction(req.user.id, 'APPROVE_LOAN', `Prêt #${pret.id} approuvé (${pret.montant} F)`);
    
    const [[user]] = await db.query('SELECT user_id FROM membres WHERE id = ?', [pret.membre_id]);
    if (user && user.user_id) {
      await db.query("INSERT INTO notifications (user_id, texte, icon, type) VALUES (?, ?, 'success', 'success')", [user.user_id, "Votre demande de prêt a été approuvée."]);
    }
    
    return res.json({ success: true, message: 'Prêt approuvé et décaissé' });
  }
  await db.query('UPDATE prets SET approbations = ? WHERE id = ?', [JSON.stringify(approbations), pret.id]);
  res.json({ success: true, message: `Signature enregistrée (${approbations.length}/2)` });
};

exports.rejeter = async (req, res) => {
  const [[pret]] = await db.query('SELECT * FROM prets WHERE id = ?', [req.params.id]);
  if (!pret) return res.status(404).json({ success: false, message: 'Prêt introuvable' });
  await db.query("UPDATE prets SET status = 'Rejeté' WHERE id = ?", [pret.id]);
  await logAction(req.user.id, 'REJECT_LOAN', `Prêt #${pret.id} rejeté`);
  
  const [[user]] = await db.query('SELECT user_id FROM membres WHERE id = ?', [pret.membre_id]);
  if (user && user.user_id) {
    await db.query("INSERT INTO notifications (user_id, texte, icon, type) VALUES (?, ?, 'error', 'error')", [user.user_id, "Votre demande de prêt a été rejetée."]);
  }
  
  res.json({ success: true, message: 'Prêt rejeté' });
};

exports.getEcheancier = async (req, res) => {
  const [echeances] = await db.query('SELECT * FROM echeances WHERE pret_id = ? ORDER BY echeance_date', [req.params.id]);
  res.json({ success: true, data: echeances });
};

exports.rembourserEcheance = async (req, res) => {
  const [[ech]] = await db.query('SELECT * FROM echeances WHERE id = ?', [req.params.id]);
  if (!ech) return res.status(404).json({ success: false, message: 'Échéance introuvable' });
  await db.query('UPDATE echeances SET paid = 1, paid_at = CURRENT_TIMESTAMP WHERE id = ?', [ech.id]);
  const [[pret]] = await db.query('SELECT * FROM prets WHERE id = ?', [ech.pret_id]);
  await db.query('UPDATE tontine SET cagnotte = cagnotte + ? WHERE id = ?', [ech.montant, pret.tontine_id]);
  const [[{ t: totalPaid }]] = await db.query('SELECT COALESCE(SUM(montant),0) as t FROM echeances WHERE pret_id = ? AND paid = 1', [ech.pret_id]);
  if (totalPaid >= pret.montant) {
    await db.query("UPDATE prets SET status = 'Remboursé' WHERE id = ?", [pret.id]);
  }
  await logAction(req.user.id, 'PAY_INSTALLMENT', `Remboursement échéance #${ech.id}`);
  res.json({ success: true, message: 'Remboursement enregistré' });
};
