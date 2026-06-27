const db = require('../config/db');
const { logAction, getCurrentTontine } = require('../utils/helpers');

exports.getAll = async (req, res) => {
  const tontine = await getCurrentTontine(req);
  if (!tontine) return res.status(404).json({ success: false, message: 'Tontine introuvable' });
  const [transactions] = await db.query('SELECT * FROM transactions WHERE tontine_id = ? ORDER BY created_at DESC', [tontine.id]);
  
  const [[{ v: total }]] = await db.query("SELECT COALESCE(SUM(amount),0) as v FROM transactions WHERE tontine_id = ? AND type='cotisation'", [tontine.id]);
  const [[{ v: decaisse }]] = await db.query("SELECT COALESCE(SUM(amount),0) as v FROM transactions WHERE tontine_id = ? AND type != 'cotisation'", [tontine.id]);
  
  res.json({ success: true, data: transactions, stats: { totalCollecte: Number(total), totalDecaisse: Number(decaisse), enCaisse: Number(total) - Number(decaisse) } });
};

exports.cotiser = async (req, res) => {
  if (req.user.role === 'gerant' || req.user.role === 'admin') return res.status(403).json({ success: false, message: "L'administrateur ne peut pas cotiser" });
  const { amount, method, name, membre_id } = req.body;
  if (!amount) return res.status(400).json({ success: false, message: 'Montant requis' });
  const tontine = await getCurrentTontine(req);
  if (!tontine) return res.status(404).json({ success: false, message: 'Tontine introuvable' });
  
  const [membres] = await db.query('SELECT * FROM membres WHERE tontine_id = ? AND (id = ? OR user_id = ?)', [tontine.id, membre_id || 0, req.user.id]);
  const membre = membres[0];
  if (!membre) return res.status(404).json({ success: false, message: 'Membre introuvable' });
  
  const [tx] = await db.query("INSERT INTO transactions (membre_id, type, amount, method, name, initials, color, tontine_id) VALUES (?, 'cotisation', ?, ?, ?, ?, ?, ?)", [membre.id, amount, method, name || membre.name, membre.initials, membre.color, tontine.id]);
  
  await db.query('UPDATE membres SET paid = 1 WHERE id = ?', [membre.id]);
  await db.query('UPDATE tontine SET cagnotte = cagnotte + ? WHERE id = ?', [amount, tontine.id]);
  
  await logAction(req.user.id, 'COTISATION', `Cotisation ${amount} F via ${method || 'N/A'} pour ${membre.name}`);
  res.status(201).json({ success: true, message: 'Cotisation enregistrée', data: { id: tx.insertId } });
};

exports.cotiserBatch = async (req, res) => {
  const { method, membresIds } = req.body;
  if (!membresIds || membresIds.length === 0) return res.status(400).json({ success: false, message: 'Aucun membre sélectionné' });
  
  const tontine = await getCurrentTontine(req);
  if (!tontine) return res.status(404).json({ success: false, message: 'Tontine introuvable' });
  const amount = tontine.cotisation_mensuelle || 50000;
  
  const connection = await db.getConnection();
  try {
    await connection.beginTransaction();
    for (const id of membresIds) {
      const [membres] = await connection.query('SELECT * FROM membres WHERE id = ? AND tontine_id = ?', [id, tontine.id]);
      const m = membres[0];
      if (m) {
        await connection.query("INSERT INTO transactions (membre_id, type, amount, method, name, initials, color, tontine_id) VALUES (?, 'cotisation', ?, ?, ?, ?, ?, ?)", [m.id, amount, method, m.name, m.initials, m.color, tontine.id]);
        await connection.query('UPDATE membres SET paid = 1 WHERE id = ?', [m.id]);
      }
    }
    await connection.query('UPDATE tontine SET cagnotte = cagnotte + ? WHERE id = ?', [amount * membresIds.length, tontine.id]);
    await connection.commit();
  } catch (err) {
    await connection.rollback();
    throw err;
  } finally {
    connection.release();
  }
  
  await logAction(req.user.id, 'BATCH_COTISATION', `${membresIds.length} cotisations via ${method}`);
  res.status(201).json({ success: true, message: `${membresIds.length} cotisation(s) enregistrée(s)` });
};
