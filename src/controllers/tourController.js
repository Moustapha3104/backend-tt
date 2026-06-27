const db = require('../config/db');
const { logAction, getCurrentTontine } = require('../utils/helpers');

exports.getAll = async (req, res) => {
  const tontine = await getCurrentTontine(req);
  if (!tontine) return res.status(404).json({ success: false, message: 'Tontine introuvable' });
  const [tours] = await db.query('SELECT * FROM tours WHERE tontine_id = ? ORDER BY ordre', [tontine.id]);
  res.json({ success: true, data: tours });
};

exports.complete = async (req, res) => {
  const [[tour]] = await db.query('SELECT * FROM tours WHERE id = ?', [req.params.id]);
  if (!tour) return res.status(404).json({ success: false, message: 'Tour introuvable' });
  const approbations = JSON.parse(tour.approbations || '[]');
  if (!approbations.includes(req.user.id)) approbations.push(req.user.id);
  
  if (approbations.length >= 2) {
    await db.query("UPDATE tours SET statut = 'terminé', approbations = ?, date_effective = CURRENT_TIMESTAMP WHERE id = ?", [JSON.stringify(approbations), tour.id]);
    await db.query("INSERT INTO transactions (membre_id, type, amount, name, tontine_id) VALUES (?, 'decaissement', ?, ?, ?)", [tour.membre_id, tour.montant, `Tour #${tour.ordre} - ${tour.membre_name}`, tour.tontine_id]);
    await db.query('UPDATE tontine SET cagnotte = cagnotte - ?, tour_actuel = tour_actuel + 1 WHERE id = ?', [tour.montant, tour.tontine_id]);
    await logAction(req.user.id, 'COMPLETE_TOUR', `Tour #${tour.ordre} complété pour ${tour.membre_name}`);

    const [[user]] = await db.query('SELECT user_id FROM membres WHERE id = ?', [tour.membre_id]);
    if (user && user.user_id) {
      await db.query("INSERT INTO notifications (user_id, texte, icon, type) VALUES (?, ?, 'trophy', 'success')", [user.user_id, "Félicitations, vous avez été tiré pour ce tour et votre décaissement a été effectué !"]);
    }

    return res.json({ success: true, message: 'Tour complété et décaissé' });
  }
  
  await db.query('UPDATE tours SET approbations = ? WHERE id = ?', [JSON.stringify(approbations), tour.id]);
  res.json({ success: true, message: `Signature enregistrée (${approbations.length}/2)` });
};
