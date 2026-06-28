const bcrypt = require('bcryptjs');
const db = require('../config/db');
const { generateInvitationCode } = require('../utils/helpers');

async function runSeeds() {
  const ADMIN_EMAIL = 'admin@tontine.sn';
  const ADMIN_PASS = 'admin123';
  const LEGACY_ADMIN_EMAIL = 'mba236106@gmail.com';
  const LEGACY_ADMIN_PASS = 'passer123';

  let [existingAdmins] = await db.query('SELECT id, role FROM users WHERE email = ?', [ADMIN_EMAIL]);
  let adminId = existingAdmins.length > 0 ? existingAdmins[0].id : null;
  if (!adminId) {
    const hashedPassword = bcrypt.hashSync(ADMIN_PASS, 10);
    const [adminResult] = await db.query('INSERT INTO users (name, email, password, role) VALUES (?, ?, ?, ?)', ['Moussa Diop', ADMIN_EMAIL, hashedPassword, 'gerant']);
    adminId = adminResult.insertId;
  }

  let [existingLegacyAdmins] = await db.query('SELECT id FROM users WHERE email = ?', [LEGACY_ADMIN_EMAIL]);
  if (existingLegacyAdmins.length === 0) {
    const hashedPassword = bcrypt.hashSync(LEGACY_ADMIN_PASS, 10);
    await db.query('INSERT INTO users (name, email, password, role) VALUES (?, ?, ?, ?)', ['Moussa Diop', LEGACY_ADMIN_EMAIL, hashedPassword, 'gerant']);
  }

  try {
    const [[{ c: tontineCount }]] = await db.query('SELECT COUNT(*) as c FROM tontine');
    const [[{ c: membresCountForSeed }]] = await db.query('SELECT COUNT(*) as c FROM membres');
    
    if (tontineCount === 0 && membresCountForSeed === 0) {
      const defaultTontineData = [
        { nom: 'Tontine Nataal', cotisation: 50000, places: 12, freq: 'mensuelle', desc: 'Notre tontine principale pour l\'investissement.' },
        { nom: 'Tontine Solidarité', cotisation: 25000, places: 10, freq: 'hebdomadaire', desc: 'Une tontine solidaire et rapide.' },
        { nom: 'Tontine Espoir', cotisation: 10000, places: 20, freq: 'mensuelle', desc: 'Idéale pour épargner à son rythme.' },
        { nom: 'Tontine Progrès', cotisation: 100000, places: 8, freq: 'mensuelle', desc: 'Pour financer des projets ambitieux.' },
        { nom: 'Tontine Diaspora', cotisation: 150000, places: 15, freq: 'mensuelle', desc: 'Destinée aux membres de la diaspora.' }
      ];

      for (let idx = 0; idx < defaultTontineData.length; idx++) {
        const tData = defaultTontineData[idx];
        const code = await generateInvitationCode();
        const [res] = await db.query(`
          INSERT INTO tontine (nom, description, cotisation_mensuelle, frequence, frais_gestion, nombre_places, date_debut, tour_total, code_invitation)
          VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
        `, [
          tData.nom,
          tData.desc,
          tData.cotisation,
          tData.freq,
          0, // frais_gestion
          tData.places,
          new Date().toISOString().slice(0, 10), // date_debut
          tData.places,
          code
        ]);
        const seedTontineId = res.insertId;

        if (idx === 0) {
          // Seed Moussa Diop + other members to the first tontine
          const memberNames = ['Moussa Diop', 'Fatou Ndiaye', 'Ibrahima Sow', 'Aminata Diallo', 'Omar Faye', 'Rokhaya Mbaye', 'Cheikh Fall', 'Aissatou Diop'];
          const colors = ['#FF6B6B', '#4ECDC4', '#45B7D1', '#F7DC6F', '#BB8FCE', '#82E0AA', '#F0B27A', '#AED6F1'];

          for (let i = 0; i < memberNames.length; i++) {
            const name = memberNames[i];
            const initials = name.split(' ').map(n => n[0]).join('').toUpperCase();
            const uid = i === 0 ? adminId : null;
            const [midRes] = await db.query('INSERT INTO membres (user_id, name, role, turn_number, color, initials, tontine_id) VALUES (?, ?, ?, ?, ?, ?, ?)', [uid, name, i === 0 ? 'Gérant' : 'Membre', i + 1, colors[i], initials, seedTontineId]);
            await db.query('INSERT INTO tours (membre_id, membre_name, ordre, montant, tontine_id) VALUES (?, ?, ?, ?, ?)', [midRes.insertId, name, i + 1, tData.cotisation * tData.places, seedTontineId]);
          }
        } else {
          // Seed Moussa Diop (Gérant) to the other tontines too so he can view/manage them
          const initials = 'MD';
          await db.query('INSERT INTO membres (user_id, name, role, turn_number, color, initials, tontine_id) VALUES (?, ?, ?, ?, ?, ?, ?)', [adminId, 'Moussa Diop', 'Gérant', 1, '#FF6B6B', initials, seedTontineId]);
        }
      }

      // Seed audit
      await db.query('INSERT INTO audit_logs (user_id, action, details) VALUES (?, ?, ?)', [adminId, 'INIT', 'Système initialisé avec 5 tontines par défaut']);
    }
  } catch (err) {
    // If schema not fully loaded yet, wait
    console.error("Erreur dans seeds: ", err.message);
  }

  // Seed simple users
  const SIMPLE_USERS = [
    { name: 'Awa', prenom: 'Ndiaye', email: 'awa.ndiaye@tontine.sn', password: 'awa2024!', color: '#E91E63' },
    { name: 'Mamadou', prenom: 'Ba', email: 'mamadou.ba@tontine.sn', password: 'mamadou2024!', color: '#3F51B5' },
  ];

  try {
    for(let u of SIMPLE_USERS) {
      const [existingUsers] = await db.query('SELECT id FROM users WHERE email = ?', [u.email]);
      if (existingUsers.length === 0) {
        const hashed = bcrypt.hashSync(u.password, 10);
        const fullName = `${u.name} ${u.prenom}`;
        const initials = `${u.name[0]}${u.prenom[0]}`.toUpperCase();
        const [userResult] = await db.query('INSERT INTO users (name, prenom, email, telephone, password, role) VALUES (?, ?, ?, ?, ?, \'membre\')', [u.name, u.prenom, u.email, '', hashed]);
        
        const [tontines] = await db.query('SELECT * FROM tontine ORDER BY id ASC LIMIT 1');
        if (tontines.length > 0) {
          const tontine = tontines[0];
          const [[{ c: membresCount }]] = await db.query('SELECT COUNT(*) as c FROM membres WHERE tontine_id = ?', [tontine.id]);
          const [membreResult] = await db.query(
            'INSERT INTO membres (user_id, name, prenom, role, turn_number, color, initials, tontine_id) VALUES (?, ?, ?, \'Membre\', ?, ?, ?, ?)',
            [userResult.insertId, fullName, u.prenom, membresCount + 1, u.color, initials, tontine.id]
          );
          await db.query('INSERT INTO tours (membre_id, membre_name, ordre, montant, tontine_id) VALUES (?, ?, ?, ?, ?)', [
            membreResult.insertId, fullName, membresCount + 1, tontine.cotisation_mensuelle * tontine.nombre_places, tontine.id
          ]);
          console.log(`👤 Utilisateur créé: ${fullName} (${u.email} / ${u.password})`);
        }
      }
    }
  } catch (err) {
    console.error("Erreur dans les users seeds: ", err.message);
  }
}

module.exports = { runSeeds };
