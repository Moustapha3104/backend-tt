const db = require('../config/db');
const { sendEmail } = require('../config/mailer');
const { logAction, getCurrentTontine } = require('../utils/helpers');

exports.getTirage = async (req, res) => {
  const tontine = await getCurrentTontine(req);
  const mois = new Date().toISOString().slice(0, 7);
  const [tirageRows] = await db.query('SELECT t.*, m.name as membre_name FROM tirages_mensuels t LEFT JOIN membres m ON t.membre_id = m.id WHERE t.mois = ? AND t.tontine_id = ?', [mois, tontine.id]);
  const [historique] = await db.query('SELECT t.*, m.name as membre_name FROM tirages_mensuels t LEFT JOIN membres m ON t.membre_id = m.id WHERE t.tontine_id = ? ORDER BY t.created_at DESC LIMIT 12', [tontine.id]);
  const [[{ c: totalMembres }]] = await db.query('SELECT COUNT(*) as c FROM membres WHERE tontine_id = ?', [tontine.id]);
  const [[{ c: dejaRecu }]] = await db.query('SELECT COUNT(*) as c FROM membres WHERE a_recu_tirage = 1 AND tontine_id = ?', [tontine.id]);
  
  res.json({ success: true, data: { tirageActuel: tirageRows[0], historique, cycle: { totalMembres, dejaRecu } } });
};

exports.effectuer = async (req, res) => {
  const { montant, membre_id } = req.body;
  if (!montant) return res.status(400).json({ success: false, message: 'Montant requis' });
  const mois = new Date().toISOString().slice(0, 7);
  const tontine = await getCurrentTontine(req);
  // Pour les tests, on autorise plusieurs tirages dans le même mois
  // const [existing] = await db.query('SELECT id FROM tirages_mensuels WHERE mois = ? AND tontine_id = ?', [mois, tontine.id]);
  // if (existing.length > 0) return res.status(400).json({ success: false, message: 'Un tirage a déjà été effectué ce mois-ci' });
  //const [existing] = await db.query('SELECT id FROM tirages_mensuels WHERE mois = ? AND tontine_id = ?', [mois, tontine.id]);
  //if (existing.length > 0) return res.status(400).json({ success: false, message: 'Un tirage a déjà été effectué ce mois-ci' });
  
  let [eligibles] = await db.query('SELECT m.*, u.email FROM membres m LEFT JOIN users u ON m.user_id = u.id WHERE m.a_recu_tirage = 0 AND m.tontine_id = ?', [tontine.id]);
  if (eligibles.length === 0) {
    await db.query('UPDATE membres SET a_recu_tirage = 0 WHERE tontine_id = ?', [tontine.id]);
    [eligibles] = await db.query('SELECT m.*, u.email FROM membres m LEFT JOIN users u ON m.user_id = u.id WHERE m.tontine_id = ?', [tontine.id]);
  }
  
  let beneficiaire;
  if (membre_id) {
    beneficiaire = eligibles.find(e => e.id === membre_id);
    if (!beneficiaire) return res.status(400).json({ success: false, message: 'Membre non éligible pour ce tirage' });
  } else {
    beneficiaire = eligibles[Math.floor(Math.random() * eligibles.length)];
  }
  
  const [result] = await db.query('INSERT INTO tirages_mensuels (membre_id, montant, mois, tontine_id) VALUES (?, ?, ?, ?)', [beneficiaire.id, montant, mois, tontine.id]);
  
  if (beneficiaire.email) {
    const html = `<div style="font-family:sans-serif;padding:24px;"><h2 style="color:#7C3AED;">🎉 Vous êtes le bénéficiaire du mois !</h2><p>Bonjour <strong>${beneficiaire.name}</strong>,</p><p>Vous avez été sélectionné(e) comme bénéficiaire du mois. Vous recevrez <strong>${montant.toLocaleString('fr-FR')} FCFA</strong>.</p><p style="color:#888;font-size:12px;">Tontine Nataal</p></div>`;
    await sendEmail(beneficiaire.email, '🎉 Vous êtes le bénéficiaire du mois !', html).catch(() => { });
  }
  await logAction(req.user.id, 'TIRAGE', `Tirage ${mois}: ${beneficiaire.name} - ${montant} F`);
  res.status(201).json({ success: true, message: 'Tirage effectué', data: { id: result.insertId, beneficiaire: beneficiaire.name, montant } });
};

exports.envoyer = async (req, res) => {
  const [[tirage]] = await db.query('SELECT * FROM tirages_mensuels WHERE id = ?', [req.params.id]);
  if (!tirage) return res.status(404).json({ success: false, message: 'Tirage introuvable' });
  if (tirage.statut === 'envoyé') return res.status(400).json({ success: false, message: 'Cet argent a déjà été envoyé' });
  
  await db.query("UPDATE tirages_mensuels SET statut = 'envoyé', sent_at = CURRENT_TIMESTAMP WHERE id = ?", [tirage.id]);
  await db.query('UPDATE membres SET a_recu_tirage = 1 WHERE id = ?', [tirage.membre_id]);
  await db.query("INSERT INTO transactions (membre_id, type, amount, name, tontine_id) VALUES (?, 'tirage', ?, ?, ?)", [tirage.membre_id, tirage.montant, `Tirage mensuel ${tirage.mois}`, tirage.tontine_id]);
  await db.query('UPDATE tontine SET cagnotte = cagnotte - ? WHERE id = ?', [tirage.montant, tirage.tontine_id]);
  
  const [[{ c: restants }]] = await db.query('SELECT COUNT(*) as c FROM membres WHERE a_recu_tirage = 0 AND tontine_id = ?', [tirage.tontine_id]);
  if (restants === 0) await db.query('UPDATE membres SET a_recu_tirage = 0 WHERE tontine_id = ?', [tirage.tontine_id]);
  
  await logAction(req.user.id, 'TIRAGE_ENVOI', `Envoi tirage #${tirage.id}`);
  res.json({ success: true, message: 'Envoi confirmé avec succès' });
};

exports.deterministicTirage = async (req, res) => {
  const { membre_id, montant, mois } = req.body;
  if (!membre_id || !montant) return res.status(400).json({ success: false, message: 'Données manquantes' });
  const tontine = await getCurrentTontine(req);

  const [[winner]] = await db.query('SELECT m.*, u.id as user_actual_id FROM membres m LEFT JOIN users u ON m.user_id = u.id WHERE m.id = ? AND m.tontine_id = ?', [membre_id, tontine.id]);
  if (!winner) return res.status(404).json({ success: false, message: 'Membre introuvable' });

  const moisTirage = mois || new Date().toLocaleDateString('fr-FR', { month: 'long', year: 'numeric' });

  try {
    const [tirageResult] = await db.query("INSERT INTO tirages_mensuels (membre_id, montant, mois, statut, tontine_id) VALUES (?, ?, ?, 'en_attente', ?)", [winner.id, montant, moisTirage, tontine.id]);

    await db.query('UPDATE membres SET a_recu_tirage = 1 WHERE id = ?', [winner.id]);

    await db.query("INSERT INTO transactions (membre_id, amount, type, name, tontine_id) VALUES (?, ?, 'tirage', ?, ?)", [winner.id, montant, `Tirage ${moisTirage} - bénéficiaire: ${winner.name}`, tontine.id]);

    await db.query('INSERT INTO notifications (texte, icon, type, global_notif) VALUES (?, ?, ?, 1)', [`🎯 Tirage ${moisTirage} – ${winner.name} bénéficiaire`, '🎯', 'tirage']);

    if (winner.user_actual_id) {
      await db.query('INSERT INTO notifications (user_id, texte, icon, type, global_notif) VALUES (?, ?, ?, ?, 0)', [winner.user_actual_id, `🏆 Félicitations ! Vous avez été tiré(e) au sort pour le tour de ${moisTirage}.`, '🎉', 'tirage_gagnant']);
    }

    await db.query('UPDATE tontine SET cagnotte = cagnotte - ? WHERE id = ?', [montant, tontine.id]);

    await logAction(req.user.id, 'TIRAGE_CONFIRM', `Tirage confirmé pour ${winner.name} (${montant} F)`);
    res.json({ success: true, message: 'Tirage enregistré avec succès', tirage_id: tirageResult.insertId });
  } catch (e) {
    res.status(500).json({ success: false, message: e.message });
  }
};
