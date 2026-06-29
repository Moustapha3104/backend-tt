const db = require('../config/db');
const { getCurrentTontine } = require('../utils/helpers');

exports.getEvolutionMensuelle = async (req, res) => {
  const data = ((await db.query(`
    SELECT DATE_FORMAT(created_at, '%m/%Y') as name,
           SUM(CASE WHEN type='cotisation' THEN amount ELSE 0 END) as entrees,
           SUM(CASE WHEN type!='cotisation' THEN amount ELSE 0 END) as sorties,
           DATE_FORMAT(created_at, '%Y-%m') as group_month
    FROM transactions 
    GROUP BY DATE_FORMAT(created_at, '%Y-%m'), DATE_FORMAT(created_at, '%m/%Y') 
    ORDER BY group_month ASC 
    LIMIT 12
  `, []))[0]);
  res.json({ success: true, data });
};

exports.getFinanceDashboard = async (req, res) => {
  try {
    const today = new Date().toISOString().slice(0, 10);
    const tontine = await getCurrentTontine(req);

    const cotisJour = ((await db.query(
      "SELECT COUNT(*) as count, COALESCE(SUM(amount), 0) as total FROM transactions WHERE tontine_id = ? AND type = 'cotisation' AND DATE(created_at) = ?"
    , [tontine.id, today]))[0][0]);

    const penalites = ((await db.query(
      "SELECT COUNT(*) as count, COALESCE(SUM(amount), 0) as total FROM transactions WHERE tontine_id = ? AND type = 'penalite'"
    , [tontine.id]))[0][0]);
    const membresEnRetard = ((await db.query('SELECT COUNT(*) as c FROM membres WHERE paid = 0 AND tontine_id = ?', [tontine.id]))[0][0]).c;

    const pretsEnCours = ((await db.query(
      "SELECT COUNT(*) as count, COALESCE(SUM(montant), 0) as total FROM prets WHERE tontine_id = ? AND (status = 'Approuvé' OR status = 'En attente')"
    , [tontine.id]))[0][0]);

    const topCotisants = ((await db.query(`
      SELECT m.name, m.color, COALESCE(SUM(t.amount), 0) as total
      FROM membres m
      LEFT JOIN transactions t ON t.membre_id = m.id AND t.type = 'cotisation' AND t.tontine_id = ?
      WHERE m.tontine_id = ?
      GROUP BY m.id
      ORDER BY total DESC
      LIMIT 4
    `, [tontine.id, tontine.id]))[0]);

    const totalCollecte = ((await db.query("SELECT COALESCE(SUM(amount), 0) as v FROM transactions WHERE tontine_id = ? AND type = 'cotisation'", [tontine.id]))[0][0]).v;
    const totalPenalites = ((await db.query("SELECT COALESCE(SUM(amount), 0) as v FROM transactions WHERE tontine_id = ? AND type = 'penalite'", [tontine.id]))[0][0]).v;
    const totalPretsDecaisses = ((await db.query("SELECT COALESCE(SUM(montant), 0) as v FROM prets WHERE tontine_id = ? AND status = 'Approuvé'", [tontine.id]))[0][0]).v;
    const totalMembres = ((await db.query('SELECT COUNT(*) as c FROM membres WHERE tontine_id = ?', [tontine.id]))[0][0]).c;
    const membresPaye = ((await db.query('SELECT COUNT(*) as c FROM membres WHERE paid = 1 AND tontine_id = ?', [tontine.id]))[0][0]).c;
    const tauxCotisation = totalMembres > 0 ? Math.round((membresPaye / totalMembres) * 100) : 0;

    const chartData = ((await db.query(`
      SELECT DATE_FORMAT(created_at, '%d/%m') as name,
             SUM(CASE WHEN type = 'cotisation' THEN amount ELSE 0 END) as cotisation,
             SUM(CASE WHEN type = 'penalite' THEN amount ELSE 0 END) as penalite,
             SUM(CASE WHEN type IN ('pret', 'decaissement', 'tirage') THEN amount ELSE 0 END) as pret,
             DATE_FORMAT(created_at, '%Y-%m-%d') as group_date
      FROM transactions
      WHERE tontine_id = ?
      GROUP BY DATE_FORMAT(created_at, '%Y-%m-%d'), DATE_FORMAT(created_at, '%d/%m')
      ORDER BY group_date DESC
      LIMIT 20
    `, [tontine.id]))[0]).reverse();

    const dernieres = ((await db.query(
      'SELECT * FROM transactions WHERE tontine_id = ? ORDER BY created_at DESC LIMIT 20'
    , [tontine.id]))[0]);

    res.json({
      success: true,
      data: {
        cotisationsJour: { count: cotisJour.count, total: cotisJour.total },
        penalites: { count: penalites.count, total: penalites.total, membresEnRetard },
        pretsEnCours: { count: pretsEnCours.count, total: pretsEnCours.total },
        topCotisants,
        resume: { totalCollecte, totalPenalites, totalPretsDecaisses, tauxCotisation },
        chartData,
        dernieresTransactions: dernieres,
        totalTransactions: ((await db.query('SELECT COUNT(*) as c FROM transactions WHERE tontine_id = ?', [tontine.id]))[0][0]).c
      }
    });
  } catch (e) {
    res.status(500).json({ success: false, message: e.message });
  }
};
