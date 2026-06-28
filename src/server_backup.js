'use strict';

const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const rateLimit = require('express-rate-limit');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const Database = require('better-sqlite3');
const nodemailer = require('nodemailer');
const cron = require('node-cron');
const path = require('path');
const fs = require('fs');
const crypto = require('crypto');
const ExcelJS = require('exceljs');
const PDFDocument = require('pdfkit');

const app = express();
const PORT = process.env.PORT || 5000;
const JWT_SECRET = process.env.JWT_SECRET || 'tontine_nataal_secret_2024';
const IS_TEST = process.env.NODE_ENV === 'test';

// â”€â”€â”€ SECURITY WARNING â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
if (!IS_TEST && !process.env.JWT_SECRET) {
  console.warn('âš ï¸  SÃ‰CURITÃ‰: JWT_SECRET utilise la valeur par dÃ©faut. DÃ©finissez JWT_SECRET en variable d\'environnement en production.');
}

// â”€â”€â”€ DATABASE â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
const DB_PATH = IS_TEST ? ':memory:' : path.join(__dirname, '../tontine.db');
const db = new Database(DB_PATH);
db.pragma('journal_mode = WAL');
db.pragma('foreign_keys = ON');

// â”€â”€â”€ SCHEMA & SEED â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
db.exec(`
  CREATE TABLE IF NOT EXISTS users (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL,
    email TEXT UNIQUE NOT NULL,
    password TEXT NOT NULL,
    role TEXT NOT NULL DEFAULT 'membre',
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
  );

  CREATE TABLE IF NOT EXISTS tontine (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    gerant_id INTEGER REFERENCES users(id),
    nom TEXT DEFAULT 'Tontine Nataal',
    description TEXT DEFAULT '',
    cotisation_mensuelle INTEGER DEFAULT 50000,
    frequence TEXT DEFAULT 'mensuelle',
    frais_gestion FLOAT DEFAULT 0,
    nombre_places INTEGER DEFAULT 12,
    date_debut TEXT DEFAULT '',
    cagnotte INTEGER DEFAULT 0,
    tour_actuel INTEGER DEFAULT 1,
    tour_total INTEGER DEFAULT 12,
    progression INTEGER DEFAULT 0,
    taux_penalite FLOAT DEFAULT 5.0,
    code_invitation TEXT UNIQUE,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
  );

  CREATE TABLE IF NOT EXISTS membres (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id INTEGER REFERENCES users(id),
    name TEXT NOT NULL,
    prenom TEXT DEFAULT '',
    telephone TEXT DEFAULT '',
    photo TEXT DEFAULT '',
    role TEXT DEFAULT 'Membre',
    turn_number INTEGER NOT NULL,
    paid INTEGER DEFAULT 0,
    a_recu_tirage INTEGER DEFAULT 0,
    color TEXT,
    initials TEXT,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
  );

  CREATE TABLE IF NOT EXISTS transactions (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    membre_id INTEGER REFERENCES membres(id),
    type TEXT NOT NULL,
    amount INTEGER NOT NULL,
    method TEXT,
    name TEXT,
    color TEXT,
    initials TEXT,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
  );

  CREATE TABLE IF NOT EXISTS prets (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id INTEGER REFERENCES users(id),
    membre_id INTEGER REFERENCES membres(id),
    montant INTEGER NOT NULL,
    motif TEXT NOT NULL,
    status TEXT DEFAULT 'En attente',
    approbations TEXT DEFAULT '[]',
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
  );

  CREATE TABLE IF NOT EXISTS echeances (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    pret_id INTEGER REFERENCES prets(id),
    montant INTEGER NOT NULL,
    echeance_date TEXT,
    paid INTEGER DEFAULT 0,
    paid_at DATETIME,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
  );

  CREATE TABLE IF NOT EXISTS tours (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    membre_id INTEGER REFERENCES membres(id),
    membre_name TEXT,
    ordre INTEGER,
    montant INTEGER DEFAULT 0,
    statut TEXT DEFAULT 'en_attente',
    approbations TEXT DEFAULT '[]',
    date_effective DATETIME,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
  );

  CREATE TABLE IF NOT EXISTS audit_logs (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id INTEGER,
    action TEXT NOT NULL,
    details TEXT,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
  );

  CREATE TABLE IF NOT EXISTS tirages_mensuels (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    membre_id INTEGER REFERENCES membres(id),
    montant INTEGER NOT NULL,
    mois TEXT NOT NULL,
    statut TEXT DEFAULT 'en_attente',
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    sent_at DATETIME
  );

  CREATE TABLE IF NOT EXISTS notifications (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id INTEGER REFERENCES users(id),
    texte TEXT NOT NULL,
    icon TEXT,
    type TEXT,
    global INTEGER DEFAULT 0,
    read INTEGER DEFAULT 0,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
  );
`);

// â”€â”€â”€ MIGRATIONS (colonnes ajoutÃ©es aprÃ¨s coup) â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
const runMigration = (sql) => {
  try { db.exec(sql); } catch (e) {
    if (!IS_TEST) console.warn('Migration ignorée:', e.message);
  }
};
const hasColumn = (table, column) => {
  return db.prepare(`PRAGMA table_info(${table})`).all().some((c) => c.name === column);
};
runMigration('ALTER TABLE tontine ADD COLUMN description TEXT DEFAULT \'\'');
runMigration('ALTER TABLE tontine ADD COLUMN frequence TEXT DEFAULT \'mensuelle\'');
runMigration('ALTER TABLE tontine ADD COLUMN frais_gestion FLOAT DEFAULT 0');
runMigration('ALTER TABLE tontine ADD COLUMN nombre_places INTEGER DEFAULT 12');
runMigration('ALTER TABLE tontine ADD COLUMN date_debut TEXT DEFAULT \'\'');
runMigration('ALTER TABLE membres ADD COLUMN prenom TEXT DEFAULT \'\'');
runMigration('ALTER TABLE membres ADD COLUMN telephone TEXT DEFAULT \'\'');
runMigration('ALTER TABLE membres ADD COLUMN photo TEXT DEFAULT \'\'');
runMigration('ALTER TABLE users ADD COLUMN prenom TEXT DEFAULT \'\'');
runMigration('ALTER TABLE users ADD COLUMN telephone TEXT DEFAULT \'\'');
runMigration('ALTER TABLE users ADD COLUMN photo TEXT DEFAULT \'\'');
runMigration('ALTER TABLE tours ADD COLUMN membre_name TEXT DEFAULT \'\'');
runMigration('ALTER TABLE tours ADD COLUMN approbations TEXT DEFAULT \'[]\'');
runMigration('ALTER TABLE tontine ADD COLUMN code_invitation TEXT DEFAULT \'\'');
if (!hasColumn('tontine', 'gerant_id')) {
  runMigration('ALTER TABLE tontine ADD COLUMN gerant_id INTEGER REFERENCES users(id)');
  runMigration('UPDATE tontine SET gerant_id = COALESCE(gerant_id, (SELECT id FROM users WHERE role = \'gerant\' ORDER BY id ASC LIMIT 1)) WHERE gerant_id IS NULL');
}
if (!hasColumn('tontine', 'created_at')) {
  runMigration('ALTER TABLE tontine ADD COLUMN created_at DATETIME DEFAULT CURRENT_TIMESTAMP');
}
runMigration('ALTER TABLE membres ADD COLUMN tontine_id INTEGER REFERENCES tontine(id)');
runMigration('ALTER TABLE transactions ADD COLUMN tontine_id INTEGER REFERENCES tontine(id)');
runMigration('ALTER TABLE prets ADD COLUMN tontine_id INTEGER REFERENCES tontine(id)');
runMigration('ALTER TABLE tours ADD COLUMN tontine_id INTEGER REFERENCES tontine(id)');
runMigration('ALTER TABLE tirages_mensuels ADD COLUMN tontine_id INTEGER REFERENCES tontine(id)');

runMigration(`
  UPDATE tontine
  SET code_invitation = UPPER(SUBSTR(HEX(RANDOMBLOB(4)), 1, 6))
  WHERE code_invitation IS NULL OR code_invitation = ''
`);

function ensureUniqueInvitationCodes() {
  const rows = db.prepare('SELECT id, code_invitation FROM tontine ORDER BY id ASC').all();
  const usedCodes = new Set();
  const updateCode = db.prepare('UPDATE tontine SET code_invitation = ? WHERE id = ?');

  const repair = db.transaction(() => {
    rows.forEach((row) => {
      const currentCode = String(row.code_invitation || '').trim().toUpperCase();
      if (currentCode && !usedCodes.has(currentCode)) {
        usedCodes.add(currentCode);
        return;
      }

      const newCode = generateInvitationCode(usedCodes);
      usedCodes.add(newCode);
      updateCode.run(newCode, row.id);
    });
  });

  repair();
}

ensureUniqueInvitationCodes();
runMigration(`
  CREATE UNIQUE INDEX IF NOT EXISTS idx_tontine_code_invitation_unique
  ON tontine(code_invitation COLLATE NOCASE)
  WHERE code_invitation IS NOT NULL AND code_invitation <> ''
`);
runMigration('UPDATE membres SET tontine_id = COALESCE(tontine_id, (SELECT id FROM tontine ORDER BY id ASC LIMIT 1)) WHERE tontine_id IS NULL');
runMigration('UPDATE transactions SET tontine_id = COALESCE(tontine_id, (SELECT tontine_id FROM membres WHERE membres.id = transactions.membre_id), (SELECT id FROM tontine ORDER BY id ASC LIMIT 1)) WHERE tontine_id IS NULL');
runMigration('UPDATE prets SET tontine_id = COALESCE(tontine_id, (SELECT tontine_id FROM membres WHERE membres.id = prets.membre_id), (SELECT id FROM tontine ORDER BY id ASC LIMIT 1)) WHERE tontine_id IS NULL');
runMigration('UPDATE tours SET tontine_id = COALESCE(tontine_id, (SELECT tontine_id FROM membres WHERE membres.id = tours.membre_id), (SELECT id FROM tontine ORDER BY id ASC LIMIT 1)) WHERE tontine_id IS NULL');
runMigration('UPDATE tirages_mensuels SET tontine_id = COALESCE(tontine_id, (SELECT tontine_id FROM membres WHERE membres.id = tirages_mensuels.membre_id), (SELECT id FROM tontine ORDER BY id ASC LIMIT 1)) WHERE tontine_id IS NULL');

// Migration: ensure notifications table exists if not created by schema
runMigration(`
  CREATE TABLE IF NOT EXISTS notifications (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id INTEGER REFERENCES users(id),
    texte TEXT NOT NULL,
    icon TEXT,
    type TEXT,
    global INTEGER DEFAULT 0,
    read INTEGER DEFAULT 0,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
  )
`);

// â”€â”€â”€ UPLOADS DIRECTORY â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
const UPLOADS_DIR = path.join(__dirname, 'uploads');
if (!fs.existsSync(UPLOADS_DIR)) fs.mkdirSync(UPLOADS_DIR, { recursive: true });

// Seed initial data
const ADMIN_EMAIL = 'admin@tontine.sn';
const ADMIN_PASS = 'admin123';
const LEGACY_ADMIN_EMAIL = 'mba236106@gmail.com';
const LEGACY_ADMIN_PASS = 'passer123';

const existingAdmin = db.prepare('SELECT id, role FROM users WHERE email = ?').get(ADMIN_EMAIL);
let adminId = existingAdmin?.id;
if (!existingAdmin) {
  const hashedPassword = bcrypt.hashSync(ADMIN_PASS, 10);
  const adminResult = db.prepare('INSERT INTO users (name, email, password, role) VALUES (?, ?, ?, ?)').run('Moussa Diop', ADMIN_EMAIL, hashedPassword, 'gerant');
  adminId = adminResult.lastInsertRowid;
}

const existingLegacyAdmin = db.prepare('SELECT id FROM users WHERE email = ?').get(LEGACY_ADMIN_EMAIL);
if (!existingLegacyAdmin) {
  const hashedPassword = bcrypt.hashSync(LEGACY_ADMIN_PASS, 10);
  db.prepare('INSERT INTO users (name, email, password, role) VALUES (?, ?, ?, ?)').run('Moussa Diop', LEGACY_ADMIN_EMAIL, hashedPassword, 'gerant');
}

const tontineCount = db.prepare('SELECT COUNT(*) as c FROM tontine').get().c;
const membresCountForSeed = db.prepare('SELECT COUNT(*) as c FROM membres').get().c;
if (tontineCount === 0 && membresCountForSeed === 0) {
  const defaultTontineData = [
    { nom: 'Tontine Nataal', cotisation: 50000, places: 12, freq: 'mensuelle', desc: 'Notre tontine principale pour l\'investissement.' },
    { nom: 'Tontine Solidarité', cotisation: 25000, places: 10, freq: 'hebdomadaire', desc: 'Une tontine solidaire et rapide.' },
    { nom: 'Tontine Espoir', cotisation: 10000, places: 20, freq: 'mensuelle', desc: 'Idéale pour épargner à son rythme.' },
    { nom: 'Tontine Progrès', cotisation: 100000, places: 8, freq: 'mensuelle', desc: 'Pour financer des projets ambitieux.' },
    { nom: 'Tontine Diaspora', cotisation: 150000, places: 15, freq: 'mensuelle', desc: 'Destinée aux membres de la diaspora.' }
  ];

  defaultTontineData.forEach((tData, idx) => {
    const code = generateInvitationCode();
    const res = db.prepare(`
      INSERT INTO tontine (nom, description, cotisation_mensuelle, frequence, frais_gestion, nombre_places, date_debut, tour_total, code_invitation)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      tData.nom,
      tData.desc,
      tData.cotisation,
      tData.freq,
      0, // frais_gestion
      tData.places,
      new Date().toISOString().slice(0, 10), // date_debut
      tData.places,
      code
    );
    const seedTontineId = res.lastInsertRowid;

    if (idx === 0) {
      // Seed Moussa Diop + other members to the first tontine
      const memberNames = ['Moussa Diop', 'Fatou Ndiaye', 'Ibrahima Sow', 'Aminata Diallo', 'Omar Faye', 'Rokhaya Mbaye', 'Cheikh Fall', 'Aissatou Diop'];
      const colors = ['#FF6B6B', '#4ECDC4', '#45B7D1', '#F7DC6F', '#BB8FCE', '#82E0AA', '#F0B27A', '#AED6F1'];

      memberNames.forEach((name, i) => {
        const initials = name.split(' ').map(n => n[0]).join('').toUpperCase();
        const uid = i === 0 ? adminId : null;
        const mid = db.prepare('INSERT INTO membres (user_id, name, role, turn_number, color, initials, tontine_id) VALUES (?, ?, ?, ?, ?, ?, ?)').run(uid, name, i === 0 ? 'GÃ©rant' : 'Membre', i + 1, colors[i], initials, seedTontineId).lastInsertRowid;
        db.prepare('INSERT INTO tours (membre_id, membre_name, ordre, montant, tontine_id) VALUES (?, ?, ?, ?, ?)').run(mid, name, i + 1, tData.cotisation * tData.places, seedTontineId);
      });
    } else {
      // Seed Moussa Diop (Gérant) to the other tontines too so he can view/manage them
      const initials = 'MD';
      db.prepare('INSERT INTO membres (user_id, name, role, turn_number, color, initials, tontine_id) VALUES (?, ?, ?, ?, ?, ?, ?)')
        .run(adminId, 'Moussa Diop', 'GÃ©rant', 1, '#FF6B6B', initials, seedTontineId);
    }
  });

  // Seed audit
  db.prepare('INSERT INTO audit_logs (user_id, action, details) VALUES (?, ?, ?)').run(adminId, 'INIT', 'SystÃ¨me initialisÃ© avec 5 tontines par dÃ©faut');
}

// â”€â”€â”€ SEED SIMPLE USERS â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
const SIMPLE_USERS = [
  { name: 'Awa', prenom: 'Ndiaye', email: 'awa.ndiaye@tontine.sn', password: 'awa2024!', color: '#E91E63' },
  { name: 'Mamadou', prenom: 'Ba', email: 'mamadou.ba@tontine.sn', password: 'mamadou2024!', color: '#3F51B5' },
];

SIMPLE_USERS.forEach(u => {
  const existingUser = db.prepare('SELECT id FROM users WHERE email = ?').get(u.email);
  if (!existingUser) {
    const hashed = bcrypt.hashSync(u.password, 10);
    const fullName = `${u.name} ${u.prenom}`;
    const initials = `${u.name[0]}${u.prenom[0]}`.toUpperCase();
    const userResult = db.prepare('INSERT INTO users (name, prenom, email, telephone, password, role) VALUES (?, ?, ?, ?, ?, \'membre\')').run(u.name, u.prenom, u.email, '', hashed);
    // Find the first tontine (Tontine Nataal)
    const tontine = db.prepare('SELECT * FROM tontine ORDER BY id ASC LIMIT 1').get();
    const membresCount = db.prepare('SELECT COUNT(*) as c FROM membres WHERE tontine_id = ?').get(tontine.id).c;
    const membreResult = db.prepare(
      'INSERT INTO membres (user_id, name, prenom, role, turn_number, color, initials, tontine_id) VALUES (?, ?, ?, \'Membre\', ?, ?, ?, ?)'
    ).run(userResult.lastInsertRowid, fullName, u.prenom, membresCount + 1, u.color, initials, tontine.id);
    db.prepare('INSERT INTO tours (membre_id, membre_name, ordre, montant, tontine_id) VALUES (?, ?, ?, ?, ?)').run(
      membreResult.lastInsertRowid, fullName, membresCount + 1, tontine ? tontine.cotisation_mensuelle * tontine.nombre_places : 400000, tontine.id
    );
    console.log(`ðŸ‘¤ Utilisateur crÃ©Ã©: ${fullName} (${u.email} / ${u.password})`);
  }
});

// â”€â”€â”€ MIDDLEWARE â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
app.use(helmet({ crossOriginResourcePolicy: { policy: 'cross-origin' } }));
app.use(cors());
app.use(express.json({ limit: '10mb' }));
app.use('/uploads', express.static(UPLOADS_DIR));
app.use(express.static(path.join(__dirname, 'tontine-front', 'dist')));

const limiter = rateLimit({ windowMs: 15 * 60 * 1000, max: 5000 });
app.use('/api/', limiter);

// Rate limiter strict pour login (anti brute-force)
const loginLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 10,
  message: { success: false, message: 'Trop de tentatives de connexion. RÃ©essayez dans 15 minutes.' },
  standardHeaders: true,
  legacyHeaders: false
});

// â”€â”€â”€ AUTH MIDDLEWARE â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
function authenticate(req, res, next) {
  const header = req.headers.authorization;
  if (!header || !header.startsWith('Bearer ')) return res.status(401).json({ success: false, message: 'Non authentifiÃ©' });
  try {
    req.user = jwt.verify(header.split(' ')[1], JWT_SECRET);
    next();
  } catch {
    return res.status(401).json({ success: false, message: 'Token invalide' });
  }
}

function requireGerant(req, res, next) {
  if (req.user.role !== 'gerant' && req.user.role !== 'admin') {
    return res.status(403).json({ success: false, message: 'Accès réservé au gérant et administrateur' });
  }
  next();
}

function logAction(userId, action, details) {
  try { db.prepare('INSERT INTO audit_logs (user_id, action, details) VALUES (?, ?, ?)').run(userId, action, details); } catch { }
}

function generateInvitationCode(reservedCodes = new Set()) {
  let code;
  do {
    code = crypto.randomBytes(4).toString('hex').slice(0, 6).toUpperCase();
  } while (
    reservedCodes.has(code) ||
    db.prepare('SELECT id FROM tontine WHERE UPPER(code_invitation) = ?').get(code)
  );
  return code;
}

function getMemberTontine(userId, preferredId) {
  if (preferredId) {
    const selected = db.prepare(`
      SELECT t.* FROM tontine t
      JOIN membres m ON m.tontine_id = t.id
      WHERE t.id = ? AND m.user_id = ?
    `).get(preferredId, userId);
    if (selected) return selected;
  }
  return db.prepare(`
    SELECT t.* FROM tontine t
    JOIN membres m ON m.tontine_id = t.id
    WHERE m.user_id = ?
    ORDER BY m.id DESC
    LIMIT 1
  `).get(userId);
}

function getCurrentTontine(req) {
  const tontineId = req.query?.tontine_id || req.headers['x-tontine-id'];

  let t = null;
  if (req.user?.role !== 'gerant' && req.user?.role !== 'admin') {
    t = getMemberTontine(req.user.id, tontineId ? Number(tontineId) : null) || null;
  } else if (tontineId) {
    t = db.prepare('SELECT * FROM tontine WHERE id = ?').get(tontineId);
  } else {
    t = db.prepare(`
      SELECT t.* FROM tontine t 
      LEFT JOIN membres m ON m.tontine_id = t.id 
      GROUP BY t.id 
      ORDER BY COUNT(m.id) DESC, t.id ASC 
      LIMIT 1
    `).get();
  }

  if (t) {
    const c = db.prepare(`
      SELECT COALESCE(SUM(
        CASE 
          WHEN type IN ('cotisation', 'penalite', 'remboursement') THEN amount 
          WHEN type IN ('pret', 'decaissement', 'tirage') THEN -amount 
          ELSE 0 
        END
      ), 0) as cagnotte 
      FROM transactions WHERE tontine_id = ?
    `).get(t.id);
    t.cagnotte = c.cagnotte;

    const totalCotisations = db.prepare("SELECT COALESCE(SUM(amount), 0) as total FROM transactions WHERE type = 'cotisation' AND tontine_id = ?").get(t.id).total;
    const objectivTotal = (t.cotisation_mensuelle * t.nombre_places * t.tour_total) || 1;
    let prog = Math.round((totalCotisations / objectivTotal) * 100);
    if (prog > 100) prog = 100;
    t.progression = prog;
  }

  return t;
}

// â”€â”€â”€ MAILER â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
const transporter = nodemailer.createTransport({
  host: process.env.SMTP_HOST || 'smtp.gmail.com',
  port: 587,
  secure: false,
  auth: {
    user: process.env.SMTP_USER || '',
    pass: process.env.SMTP_PASS || '',
  },
  tls: { rejectUnauthorized: false }
});

async function sendEmail(to, subject, html) {
  if (!process.env.SMTP_USER) return { skipped: true };
  return transporter.sendMail({ from: `"Tontine Nataal" <${process.env.SMTP_USER}>`, to, subject, html });
}

// â”€â”€â”€ AUTH ROUTES â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
app.post('/api/auth/register', (req, res) => {
  const { name, email, password } = req.body;
  if (!name || !email || !password) return res.status(400).json({ success: false, message: 'Champs manquants' });
  // Validation email
  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  if (!emailRegex.test(email.trim())) return res.status(400).json({ success: false, message: 'Format d\'email invalide' });
  // Validation mot de passe
  if (password.length < 6) return res.status(400).json({ success: false, message: 'Le mot de passe doit contenir au moins 6 caractÃ¨res' });
  try {
    const trimmedName = name.trim();
    const trimmedEmail = email.trim().toLowerCase();
    const hashed = bcrypt.hashSync(password, 10);
    const result = db.prepare('INSERT INTO users (name, email, password) VALUES (?, ?, ?)').run(trimmedName, trimmedEmail, hashed);
    const token = jwt.sign({ id: result.lastInsertRowid, email: trimmedEmail, name: trimmedName, role: 'membre' }, JWT_SECRET, { expiresIn: '7d' });
    res.status(201).json({ success: true, token });
  } catch (e) {
    if (e.message.includes('UNIQUE')) return res.status(409).json({ success: false, message: 'Email dÃ©jÃ  utilisÃ©' });
    res.status(500).json({ success: false, message: e.message });
  }
});

app.post('/api/auth/login', loginLimiter, (req, res) => {
  const { email, password } = req.body;
  if (!email || !password) return res.status(400).json({ success: false, message: 'Champs manquants' });
  const user = db.prepare('SELECT * FROM users WHERE email = ?').get(email);
  if (!user || !bcrypt.compareSync(password, user.password)) return res.status(401).json({ success: false, message: 'Identifiants invalides' });
  const token = jwt.sign({ id: user.id, email: user.email, name: user.name, role: user.role }, JWT_SECRET, { expiresIn: '7d' });
  logAction(user.id, 'LOGIN', `Connexion de ${user.email}`);
  res.json({ success: true, token, user: { id: user.id, name: user.name, email: user.email, role: user.role } });
});

// â”€â”€â”€ HEALTH â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
app.get('/api/health', (req, res) => {
  res.json({ ok: true, status: 'up' });
});

app.get('/api/auth/me', authenticate, (req, res) => {
  const user = db.prepare('SELECT id, name, email, role FROM users WHERE id = ?').get(req.user.id);
  if (!user) return res.status(404).json({ success: false, message: 'Utilisateur introuvable' });
  res.json({ success: true, user });
});

// â”€â”€â”€ TONTINE â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
app.get('/api/tontines', authenticate, (req, res) => {
  const isGerant = req.user.role === 'gerant';
  const isAdmin = req.user.role === 'admin';
  let query = `
    SELECT t.*, 
           EXISTS(SELECT 1 FROM membres m WHERE m.tontine_id = t.id AND m.user_id = ?) as is_joined
    FROM tontine t
  `;
  let params = [req.user.id];
  
  // Show only tontines created by this gerant, or all tontines for regular members and admins
  if (isGerant && !isAdmin && hasColumn('tontine', 'gerant_id')) {
    query += ` WHERE t.gerant_id = ?`;
    params.push(req.user.id);
  }
  
  query += ` ORDER BY t.id DESC`;
  const tontines = db.prepare(query).all(...params);
  res.json({ success: true, data: tontines });
});

app.get('/api/tontine', authenticate, (req, res) => {
  const t = getCurrentTontine(req);
  if (!t) return res.status(404).json({ success: false, message: 'Tontine introuvable' });
  res.json({ success: true, data: t });
});

app.post('/api/tontine', authenticate, requireGerant, (req, res) => {
  const { nom, description, cotisation_mensuelle, frequence, frais_gestion, nombre_places, date_debut, tour_total } = req.body;
  const code = generateInvitationCode();
  const result = db.prepare(`
    INSERT INTO tontine (gerant_id, nom, description, cotisation_mensuelle, frequence, frais_gestion, nombre_places, date_debut, tour_total, code_invitation)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).run(
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
  );
  const tontine = db.prepare('SELECT * FROM tontine WHERE id = ?').get(result.lastInsertRowid);
  logAction(req.user.id, 'CREATE_TONTINE', `Création tontine ${tontine.nom} (${code})`);
  res.status(201).json({ success: true, message: 'Tontine créée avec succès', data: tontine, code });
});

// ─── REGENERATE INVITATION CODE ────────────────────────────────────────────────────────
app.post('/api/tontine/:id/regenerate-code', authenticate, requireGerant, (req, res) => {
  const { id } = req.params;
  const tontine = db.prepare('SELECT * FROM tontine WHERE id = ?').get(id);
  
  if (!tontine) {
    return res.status(404).json({ success: false, message: 'Tontine introuvable' });
  }
  
  // Verify this gerant owns this tontine
  if (tontine.gerant_id !== req.user.id) {
    return res.status(403).json({ success: false, message: 'Non autorisé' });
  }
  
  // Generate a new unique code
  const newCode = generateInvitationCode();
  
  // Update the tontine with the new code
  db.prepare('UPDATE tontine SET code_invitation = ? WHERE id = ?').run(newCode, id);
  logAction(req.user.id, 'REGENERATE_CODE', `Nouveau code pour tontine ${tontine.nom}: ${newCode} (ancien: ${tontine.code_invitation})`);
  
  res.json({ success: true, message: 'Code d\'invitation régénéré', code: newCode });
});

app.post('/api/notifications/send-manual', authenticate, requireGerant, async (req, res) => {
  const { message, members, type } = req.body;
  const tontine = getCurrentTontine(req);
  if (!tontine) return res.status(404).json({ success: false, message: 'Tontine introuvable' });

  const targetMembers = members === 'all'
    ? db.prepare('SELECT m.user_id, m.name, u.email FROM membres m LEFT JOIN users u ON m.user_id = u.id WHERE m.tontine_id = ?' + (type === 'rappel' ? ' AND m.paid = 0' : '')).all(tontine.id)
    : db.prepare(`SELECT m.user_id, m.name, u.email FROM membres m LEFT JOIN users u ON m.user_id = u.id WHERE m.id IN (${members.map(() => '?').join(',')}) AND m.tontine_id = ?`).all(...members, tontine.id);

  const icon = type === 'rappel' ? '🔔' : 'ℹ️';
  const notifType = type === 'rappel' ? 'rappel' : 'info';
  const subject = type === 'rappel' ? 'Rappel de Cotisation' : 'Information Tontine Nataal';

  const stmt = db.prepare('INSERT INTO notifications (user_id, texte, icon, type) VALUES (?, ?, ?, ?)');
  
  let sentEmails = 0;
  for (const m of targetMembers) {
    if (m.user_id) stmt.run(m.user_id, message, icon, notifType);
    
    // Envoyer l'email
    if (m.email) {
      const html = `<div style="font-family:sans-serif;padding:24px;">
        <h2 style="color:#7C3AED;">${icon} ${subject}</h2>
        <p>Bonjour <strong>${m.name}</strong>,</p>
        <div style="background:#f9f9f9;border-radius:12px;padding:16px;margin:16px 0;">${message.replace(/\n/g, '<br>')}</div>
        <p style="color:#888;font-size:12px;">Tontine Nataal</p>
      </div>`;
      await sendEmail(m.email, subject, html).catch(() => { });
      sentEmails++;
    }
  }

  res.json({ success: true, message: `${targetMembers.length} notification(s) envoyée(s) et ${sentEmails} email(s).` });
});

// ─── DELETE TONTINE ────────────────────────────────────────────────────────────────────
app.delete('/api/tontine/:id', authenticate, requireGerant, (req, res) => {
  const { id } = req.params;
  const tontine = db.prepare('SELECT * FROM tontine WHERE id = ?').get(id);
  
  if (!tontine) {
    return res.status(404).json({ success: false, message: 'Tontine introuvable' });
  }
  
  // Verify this gerant owns this tontine
  if (tontine.gerant_id !== req.user.id) {
    return res.status(403).json({ success: false, message: 'Non autorisé - Cette tontine n\'appartient pas à cet utilisateur' });
  }
  
  // Check if tontine has active members
  const memberCount = db.prepare('SELECT COUNT(*) as count FROM membres WHERE tontine_id = ?').get(id).count;
  if (memberCount > 0) {
    return res.status(400).json({ success: false, message: 'Impossible de supprimer une tontine qui a des membres. Veuillez d\'abord retirer tous les membres.' });
  }
  
  // Delete the tontine
  db.prepare('DELETE FROM tontine WHERE id = ?').run(id);
  logAction(req.user.id, 'DELETE_TONTINE', `Suppression tontine "${tontine.nom}" (${tontine.code_invitation})`);
  
  res.json({ success: true, message: 'Tontine supprimée avec succès' });
});

app.put('/api/tontine', authenticate, requireGerant, (req, res) => {
  const { nom, description, cotisation_mensuelle, frequence, frais_gestion, nombre_places, date_debut, tour_total } = req.body;
  const current = getCurrentTontine(req);
  if (!current) return res.status(404).json({ success: false, message: 'Tontine introuvable' });
  
  // Verify this gerant owns this tontine
  if (current.gerant_id !== req.user.id) {
    return res.status(403).json({ success: false, message: 'Non autorisé' });
  }
  
  db.prepare(`
    UPDATE tontine SET
      nom = ?, description = ?, cotisation_mensuelle = ?,
      frequence = ?, frais_gestion = ?, nombre_places = ?,
      date_debut = ?, tour_total = ?
    WHERE id = ?
  `).run(
    nom || 'Tontine Nataal',
    description || '',
    cotisation_mensuelle || 50000,
    frequence || 'mensuelle',
    frais_gestion || 0,
    nombre_places || 12,
    date_debut || '',
    tour_total || 12,
    current.id
  );
  logAction(req.user.id, 'UPDATE_TONTINE', JSON.stringify(req.body));
  res.json({ success: true, message: 'Tontine mise Ã  jour' });
});

// â”€â”€â”€ ADMIN â€” CRÃ‰ER UN MEMBRE â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
app.post('/api/admin/create-member', authenticate, requireGerant, (req, res) => {
  const { nom, prenom, email, telephone, password, photo } = req.body;
  if (!nom || !email || !password) return res.status(400).json({ success: false, message: 'Nom, email et mot de passe requis' });
  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  if (!emailRegex.test(email.trim())) return res.status(400).json({ success: false, message: 'Format d\'email invalide' });
  if (password.length < 6) return res.status(400).json({ success: false, message: 'Le mot de passe doit contenir au moins 6 caractÃ¨res' });

  try {
    // Save photo if provided (base64)
    let photoPath = '';
    if (photo && photo.startsWith('data:image')) {
      const matches = photo.match(/^data:image\/(\w+);base64,(.+)$/);
      if (matches) {
        const ext = matches[1];
        const base64Data = matches[2];
        const filename = `member_${Date.now()}.${ext}`;
        fs.writeFileSync(path.join(UPLOADS_DIR, filename), Buffer.from(base64Data, 'base64'));
        photoPath = `/uploads/${filename}`;
      }
    }

    const hashed = bcrypt.hashSync(password, 10);
    const fullName = prenom ? `${nom} ${prenom}` : nom;
    const initials = [nom[0], prenom ? prenom[0] : (nom[1] || '')].join('').toUpperCase();
    const colors = ['#FF6B6B', '#4ECDC4', '#45B7D1', '#F7DC6F', '#BB8FCE', '#82E0AA', '#F0B27A', '#AED6F1', '#C39BD3', '#7DCEA0'];
    const color = colors[Math.floor(Math.random() * colors.length)];

    // Create user
    const userResult = db.prepare(
      'INSERT INTO users (name, prenom, email, telephone, password, photo, role) VALUES (?, ?, ?, ?, ?, ?, \'membre\')'
    ).run(nom, prenom || '', email, telephone || '', hashed, photoPath);

    // Create membre
    const tontine = getCurrentTontine(req);
    const membresCount = db.prepare('SELECT COUNT(*) as c FROM membres WHERE tontine_id = ?').get(tontine.id).c;
    const membreResult = db.prepare(
      'INSERT INTO membres (user_id, name, prenom, telephone, photo, role, turn_number, color, initials, tontine_id) VALUES (?, ?, ?, ?, ?, \'Membre\', ?, ?, ?, ?)'
    ).run(userResult.lastInsertRowid, fullName, prenom || '', telephone || '', photoPath, membresCount + 1, color, initials, tontine.id);

    // Create tour for this member
    db.prepare('INSERT INTO tours (membre_id, membre_name, ordre, montant, tontine_id) VALUES (?, ?, ?, ?, ?)').run(
      membreResult.lastInsertRowid, fullName, membresCount + 1, tontine ? tontine.cotisation_mensuelle * 12 : 400000, tontine.id
    );

    logAction(req.user.id, 'CREATE_MEMBER', `CrÃ©ation du membre ${fullName} (${email})`);
    res.status(201).json({
      success: true,
      message: `Membre ${fullName} crÃ©Ã© avec succÃ¨s`,
      data: {
        id: membreResult.lastInsertRowid,
        user_id: userResult.lastInsertRowid,
        name: fullName, prenom, email, telephone, photo: photoPath, initials, color
      }
    });
  } catch (e) {
    if (e.message && e.message.includes('UNIQUE')) return res.status(409).json({ success: false, message: 'Cet email est dÃ©jÃ  utilisÃ©' });
    res.status(500).json({ success: false, message: e.message });
  }
});

// â”€â”€â”€ ADMIN â€” SUPPRIMER UN MEMBRE â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
app.delete('/api/admin/membres/:id', authenticate, requireGerant, (req, res) => {
  const membre = db.prepare('SELECT * FROM membres WHERE id = ?').get(req.params.id);
  if (!membre) return res.status(404).json({ success: false, message: 'Membre introuvable' });
  // Delete photo file if exists
  if (membre.photo) {
    const filePath = path.join(__dirname, membre.photo);
    if (fs.existsSync(filePath)) fs.unlinkSync(filePath);
  }
  // Delete related records to avoid foreign key constraints
  db.prepare('DELETE FROM echeances WHERE pret_id IN (SELECT id FROM prets WHERE membre_id = ?)').run(membre.id);
  db.prepare('DELETE FROM prets WHERE membre_id = ?').run(membre.id);
  db.prepare('DELETE FROM tirages_mensuels WHERE membre_id = ?').run(membre.id);
  db.prepare('DELETE FROM tours WHERE membre_id = ?').run(membre.id);
  db.prepare('DELETE FROM transactions WHERE membre_id = ?').run(membre.id);

  // Now safe to delete from membres
  db.prepare('DELETE FROM membres WHERE id = ?').run(membre.id);

  // If user exists, delete their notifications and the user record
  if (membre.user_id) {
    db.prepare('DELETE FROM notifications WHERE user_id = ?').run(membre.user_id);
    db.prepare('DELETE FROM users WHERE id = ?').run(membre.user_id);
  }

  logAction(req.user.id, 'DELETE_MEMBER', `Suppression du membre #${membre.id} (${membre.name})`);
  res.json({ success: true, message: `Membre ${membre.name} supprimÃ©` });
});

// â”€â”€â”€ ADMIN â€” MODIFIER UN MEMBRE â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
app.put('/api/admin/membres/:id', authenticate, requireGerant, (req, res) => {
  const { nom, prenom, email, telephone, photo } = req.body;
  if (!nom || !email) return res.status(400).json({ success: false, message: 'Nom et email requis' });

  const membre = db.prepare('SELECT * FROM membres WHERE id = ?').get(req.params.id);
  if (!membre) return res.status(404).json({ success: false, message: 'Membre introuvable' });

  try {
    // Handle photo update
    let photoPath = membre.photo || '';
    if (photo && photo.startsWith('data:image')) {
      // Delete old photo file
      if (membre.photo) {
        const oldPath = path.join(__dirname, membre.photo);
        if (fs.existsSync(oldPath)) fs.unlinkSync(oldPath);
      }
      const matches = photo.match(/^data:image\/(\w+);base64,(.+)$/);
      if (matches) {
        const ext = matches[1];
        const filename = `member_${Date.now()}.${ext}`;
        fs.writeFileSync(path.join(UPLOADS_DIR, filename), Buffer.from(matches[2], 'base64'));
        photoPath = `/uploads/${filename}`;
      }
    } else if (photo === '') {
      // Explicitly cleared
      if (membre.photo) {
        const oldPath = path.join(__dirname, membre.photo);
        if (fs.existsSync(oldPath)) fs.unlinkSync(oldPath);
      }
      photoPath = '';
    }

    const fullName = prenom ? `${nom} ${prenom}` : nom;
    const initials = [nom[0], prenom ? prenom[0] : (nom[1] || '')].join('').toUpperCase();

    db.prepare(`
      UPDATE membres SET name = ?, prenom = ?, telephone = ?, photo = ?, initials = ? WHERE id = ?
    `).run(fullName, prenom || '', telephone || '', photoPath, initials, membre.id);

    // Sync user table
    if (membre.user_id) {
      const existingUser = db.prepare('SELECT id, email FROM users WHERE email = ? AND id != ?').get(email, membre.user_id);
      if (existingUser) return res.status(409).json({ success: false, message: 'Cet email est dÃ©jÃ  utilisÃ© par un autre membre' });
      db.prepare('UPDATE users SET name = ?, prenom = ?, email = ?, telephone = ?, photo = ? WHERE id = ?')
        .run(nom, prenom || '', email, telephone || '', photoPath, membre.user_id);
    }

    // Sync tours table
    db.prepare('UPDATE tours SET membre_name = ? WHERE membre_id = ?').run(fullName, membre.id);

    logAction(req.user.id, 'EDIT_MEMBER', `Modification du membre #${membre.id} â†’ ${fullName}`);
    res.json({ success: true, message: `Membre ${fullName} mis Ã  jour`, data: { id: membre.id, name: fullName, prenom, email, telephone, photo: photoPath, initials } });
  } catch (e) {
    if (e.message && e.message.includes('UNIQUE')) return res.status(409).json({ success: false, message: 'Cet email est dÃ©jÃ  utilisÃ©' });
    res.status(500).json({ success: false, message: e.message });
  }
});

// â”€â”€â”€ MEMBRES â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
app.get('/api/membres', authenticate, (req, res) => {
  const tontine = getCurrentTontine(req);
  if (!tontine) return res.json({ success: true, data: [], stats: { total: 0, payes: 0, enAttente: 0 } });
  const membres = db.prepare(`
    SELECT m.*, u.email FROM membres m LEFT JOIN users u ON m.user_id = u.id WHERE m.tontine_id = ? ORDER BY m.turn_number
  `).all(tontine.id);
  const stats = {
    total: membres.length,
    payes: membres.filter(m => m.paid).length,
    enAttente: membres.filter(m => !m.paid).length,
  };
  res.json({ success: true, data: membres, stats });
});

app.get('/api/membres/me/status', authenticate, (req, res) => {
  const membership = db.prepare(`
    SELECT m.id as membre_id, m.tontine_id, t.nom as tontine_nom
    FROM membres m
    JOIN tontine t ON t.id = m.tontine_id
    WHERE m.user_id = ?
    ORDER BY m.id DESC
    LIMIT 1
  `).get(req.user.id);
  res.json({
    success: true,
    data: {
      is_member: !!membership,
      membership: membership || null,
    },
  });
});

app.get('/api/membres/me/dashboard', authenticate, (req, res) => {
  const tontine = getCurrentTontine(req);
  const membre = tontine ? db.prepare('SELECT m.*, u.email FROM membres m LEFT JOIN users u ON m.user_id = u.id WHERE m.user_id = ? AND m.tontine_id = ?').get(req.user.id, tontine.id) : null;
  if (!membre) return res.status(404).json({ success: false, message: 'Membre introuvable' });
  const totalCotisations = db.prepare("SELECT COALESCE(SUM(amount), 0) as total FROM transactions WHERE membre_id = ? AND tontine_id = ? AND type = 'cotisation'").get(membre.id, tontine.id).total;
  const nextTour = db.prepare("SELECT * FROM tours WHERE membre_id = ? AND tontine_id = ? AND statut = 'en_attente' ORDER BY ordre LIMIT 1").get(membre.id, tontine.id);
  const history = db.prepare('SELECT * FROM transactions WHERE membre_id = ? AND tontine_id = ? ORDER BY created_at DESC LIMIT 10').all(membre.id, tontine.id);
  res.json({ success: true, data: { membre, stats: { totalCotisations, nextTourOrder: nextTour?.ordre }, history } });
});

app.post('/api/membres/:id/appliquer-penalite', authenticate, requireGerant, (req, res) => {
  const membre = db.prepare('SELECT * FROM membres WHERE id = ?').get(req.params.id);
  if (!membre) return res.status(404).json({ success: false, message: 'Membre introuvable' });
  const penalite = 5000;
  db.prepare("INSERT INTO transactions (membre_id, type, amount, name, initials, color, tontine_id) VALUES (?, 'penalite', ?, ?, ?, ?, ?)").run(membre.id, penalite, membre.name, membre.initials, membre.color, membre.tontine_id);
  db.prepare('UPDATE tontine SET cagnotte = cagnotte + ? WHERE id = ?').run(penalite, membre.tontine_id);
  logAction(req.user.id, 'PENALITE', `Pénalité de ${penalite} F pour ${membre.name}`);
  res.json({ success: true, message: `Pénalité de ${penalite.toLocaleString('fr-FR')} F appliquée à ${membre.name}`, data: penalite });
});

app.post('/api/membres/:id/message', authenticate, requireGerant, async (req, res) => {
  const { sujet, contenu } = req.body;
  if (!sujet || !contenu) return res.status(400).json({ success: false, message: 'Sujet et contenu requis' });
  const membre = db.prepare('SELECT m.*, u.email FROM membres m LEFT JOIN users u ON m.user_id = u.id WHERE m.id = ?').get(req.params.id);
  if (!membre) return res.status(404).json({ success: false, message: 'Membre introuvable' });
  if (!membre.email) return res.status(400).json({ success: false, message: 'Ce membre n\'a pas d\'adresse email' });
  const html = `
    <div style="font-family:sans-serif;max-width:600px;margin:auto;padding:24px;">
      <h2 style="color:#7C3AED;">ðŸª™ Tontine Nataal</h2>
      <p>Bonjour <strong>${membre.name}</strong>,</p>
      <div style="background:#f9f9f9;border-radius:12px;padding:16px;margin:16px 0;">${contenu.replace(/\n/g, '<br>')}</div>
      <p style="color:#888;font-size:12px;">Tontine Nataal â€” Gestion multi-tontines</p>
    </div>`;
  try {
    await sendEmail(membre.email, sujet, html);
    logAction(req.user.id, 'MESSAGE', `Message Ã  ${membre.name}: ${sujet}`);
    res.json({ success: true, message: `Message envoyé à ${membre.name}` });
  } catch (e) {
    res.status(500).json({ success: false, message: 'Erreur d\'envoi: ' + e.message });
  }
});

// â”€â”€â”€ TRANSACTIONS â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
app.get('/api/transactions', authenticate, (req, res) => {
  const tontine = getCurrentTontine(req);
  const transactions = db.prepare('SELECT * FROM transactions WHERE tontine_id = ? ORDER BY created_at DESC').all(tontine.id);
  const total = db.prepare("SELECT COALESCE(SUM(amount),0) as v FROM transactions WHERE tontine_id = ? AND type='cotisation'").get(tontine.id).v;
  const decaisse = db.prepare("SELECT COALESCE(SUM(amount),0) as v FROM transactions WHERE tontine_id = ? AND type != 'cotisation'").get(tontine.id).v;
  res.json({ success: true, data: transactions, stats: { totalCollecte: total, totalDecaisse: decaisse, enCaisse: total - decaisse } });
});

app.post('/api/transactions/cotiser', authenticate, (req, res) => {
  if (req.user.role === 'gerant' || req.user.role === 'admin') return res.status(403).json({ success: false, message: "L'administrateur ne peut pas cotiser" });
  const { amount, method, name, membre_id } = req.body;
  if (!amount) return res.status(400).json({ success: false, message: 'Montant requis' });
  const tontine = getCurrentTontine(req);
  const membre = db.prepare('SELECT * FROM membres WHERE tontine_id = ? AND (id = ? OR user_id = ?)').get(tontine.id, membre_id || 0, req.user.id);
  if (!membre) return res.status(404).json({ success: false, message: 'Membre introuvable' });
  const tx = db.prepare("INSERT INTO transactions (membre_id, type, amount, method, name, initials, color, tontine_id) VALUES (?, 'cotisation', ?, ?, ?, ?, ?, ?)").run(membre.id, amount, method, name || membre.name, membre.initials, membre.color, tontine.id);
  db.prepare('UPDATE membres SET paid = 1 WHERE id = ?').run(membre.id);
  db.prepare('UPDATE tontine SET cagnotte = cagnotte + ? WHERE id = ?').run(amount, tontine.id);
  logAction(req.user.id, 'COTISATION', `Cotisation ${amount} F via ${method || 'N/A'} pour ${membre.name}`);
  res.status(201).json({ success: true, message: 'Cotisation enregistrÃ©e', data: { id: tx.lastInsertRowid } });
});

app.post('/api/transactions/cotiser-batch', authenticate, requireGerant, (req, res) => {
  const { method, membresIds } = req.body;
  if (!membresIds || membresIds.length === 0) return res.status(400).json({ success: false, message: 'Aucun membre sÃ©lectionnÃ©' });
  const tontine = getCurrentTontine(req);
  const amount = tontine?.cotisation_mensuelle || 50000;
  const insertTx = db.prepare("INSERT INTO transactions (membre_id, type, amount, method, name, initials, color, tontine_id) VALUES (?, 'cotisation', ?, ?, ?, ?, ?, ?)");
  const updateMembre = db.prepare('UPDATE membres SET paid = 1 WHERE id = ?');
  const batchOp = db.transaction(() => {
    for (const id of membresIds) {
      const m = db.prepare('SELECT * FROM membres WHERE id = ? AND tontine_id = ?').get(id, tontine.id);
      if (m) {
        insertTx.run(m.id, amount, method, m.name, m.initials, m.color, tontine.id);
        updateMembre.run(m.id);
      }
    }
    db.prepare('UPDATE tontine SET cagnotte = cagnotte + ? WHERE id = ?').run(amount * membresIds.length, tontine.id);
  });
  batchOp();
  logAction(req.user.id, 'BATCH_COTISATION', `${membresIds.length} cotisations via ${method}`);
  res.status(201).json({ success: true, message: `${membresIds.length} cotisation(s) enregistrée(s)` });
});

// â”€â”€â”€ PRÃŠTS â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
app.get('/api/prets', authenticate, (req, res) => {
  const tontine = getCurrentTontine(req);
  const prets = db.prepare(`
    SELECT p.*, m.name as membre_name, m.initials, m.color
    FROM prets p LEFT JOIN membres m ON p.membre_id = m.id
    WHERE p.tontine_id = ?
    ORDER BY p.created_at DESC
  `).all(tontine.id);
  const stats = {
    total: prets.length,
    totalMontant: prets.reduce((a, b) => a + b.montant, 0),
    enAttente: prets.filter(p => p.status === 'En attente').length,
  };
  res.json({ success: true, data: prets, stats });
});

app.post('/api/prets', authenticate, (req, res) => {
  const { montant, motif, membre_id } = req.body;
  if (!montant) return res.status(400).json({ success: false, message: 'Montant requis' });
  if (!motif) return res.status(400).json({ success: false, message: 'Motif requis' });
  const tontine = getCurrentTontine(req);
  const membresCount = db.prepare('SELECT COUNT(*) as c FROM membres WHERE tontine_id = ?').get(tontine.id).c;
  const cagnotteReference = tontine.cagnotte || ((tontine.cotisation_mensuelle || 0) * membresCount);
  if (montant > cagnotteReference * 0.3) return res.status(400).json({ success: false, message: 'Le montant dÃ©passe 30% de la cagnotte' });
  const membre = db.prepare('SELECT * FROM membres WHERE user_id = ? AND tontine_id = ?').get(req.user.id, tontine.id) || db.prepare('SELECT * FROM membres WHERE id = ? AND tontine_id = ?').get(membre_id, tontine.id);
  if (!membre) return res.status(404).json({ success: false, message: 'Membre introuvable' });
  const result = db.prepare("INSERT INTO prets (user_id, membre_id, montant, motif, tontine_id) VALUES (?, ?, ?, ?, ?)").run(req.user.id, membre.id, montant, motif, tontine.id);
  logAction(req.user.id, 'LOAN_REQUEST', `Demande prÃªt ${montant} F: ${motif}`);
  res.status(201).json({ success: true, data: { id: result.lastInsertRowid, montant, motif, status: 'En attente' } });
});

app.post('/api/prets/:id/approuver', authenticate, requireGerant, (req, res) => {
  const pret = db.prepare('SELECT * FROM prets WHERE id = ?').get(req.params.id);
  if (!pret) return res.status(404).json({ success: false, message: 'PrÃªt introuvable' });
  const approbations = JSON.parse(pret.approbations || '[]');
  if (!approbations.includes(req.user.id)) approbations.push(req.user.id);
  if (approbations.length >= 2) {
    db.prepare("UPDATE prets SET status = 'ApprouvÃ©', approbations = ? WHERE id = ?").run(JSON.stringify(approbations), pret.id);
    db.prepare("INSERT INTO transactions (membre_id, type, amount, name, tontine_id) VALUES (?, 'pret', ?, ?, ?)").run(pret.membre_id, pret.montant, `Prêt approuvé`, pret.tontine_id);
    db.prepare('UPDATE tontine SET cagnotte = cagnotte - ? WHERE id = ?').run(pret.montant, pret.tontine_id);
    logAction(req.user.id, 'APPROVE_LOAN', `PrÃªt #${pret.id} approuvÃ© (${pret.montant} F)`);
    
    const user = db.prepare('SELECT user_id FROM membres WHERE id = ?').get(pret.membre_id);
    if (user && user.user_id) {
      db.prepare("INSERT INTO notifications (user_id, texte, icon, type) VALUES (?, ?, 'success', 'success')").run(user.user_id, "Votre demande de prêt a été approuvée.");
    }
    
    return res.json({ success: true, message: 'PrÃªt approuvÃ© et dÃ©caissÃ©' });
  }
  db.prepare('UPDATE prets SET approbations = ? WHERE id = ?').run(JSON.stringify(approbations), pret.id);
  res.json({ success: true, message: `Signature enregistrÃ©e (${approbations.length}/2)` });
});

app.post('/api/prets/:id/rejeter', authenticate, requireGerant, (req, res) => {
  const pret = db.prepare('SELECT * FROM prets WHERE id = ?').get(req.params.id);
  if (!pret) return res.status(404).json({ success: false, message: 'PrÃªt introuvable' });
  db.prepare("UPDATE prets SET status = 'RejetÃ©' WHERE id = ?").run(pret.id);
  logAction(req.user.id, 'REJECT_LOAN', `PrÃªt #${pret.id} rejetÃ©`);
  
  const user = db.prepare('SELECT user_id FROM membres WHERE id = ?').get(pret.membre_id);
  if (user && user.user_id) {
    db.prepare("INSERT INTO notifications (user_id, texte, icon, type) VALUES (?, ?, 'error', 'error')").run(user.user_id, "Votre demande de prêt a été rejetée.");
  }
  
  res.json({ success: true, message: 'PrÃªt rejetÃ©' });
});

app.get('/api/prets/:id/echeancier', authenticate, (req, res) => {
  const echeances = db.prepare('SELECT * FROM echeances WHERE pret_id = ? ORDER BY echeance_date').all(req.params.id);
  res.json({ success: true, data: echeances });
});

app.post('/api/prets/echeance/:id/rembourser', authenticate, (req, res) => {
  const ech = db.prepare('SELECT * FROM echeances WHERE id = ?').get(req.params.id);
  if (!ech) return res.status(404).json({ success: false, message: 'Ã‰chÃ©ance introuvable' });
  db.prepare('UPDATE echeances SET paid = 1, paid_at = CURRENT_TIMESTAMP WHERE id = ?').run(ech.id);
  const pret = db.prepare('SELECT * FROM prets WHERE id = ?').get(ech.pret_id);
  db.prepare('UPDATE tontine SET cagnotte = cagnotte + ? WHERE id = ?').run(ech.montant, pret.tontine_id);
  const totalPaid = db.prepare('SELECT COALESCE(SUM(montant),0) as t FROM echeances WHERE pret_id = ? AND paid = 1').get(ech.pret_id).t;
  if (totalPaid >= pret.montant) db.prepare("UPDATE prets SET status = 'RemboursÃ©' WHERE id = ?").run(pret.id);
  logAction(req.user.id, 'PAY_INSTALLMENT', `Remboursement Ã©chÃ©ance #${ech.id}`);
  res.json({ success: true, message: 'Remboursement enregistrÃ©' });
});

// â”€â”€â”€ TOURS â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
app.get('/api/tours', authenticate, (req, res) => {
  const tontine = getCurrentTontine(req);
  const tours = db.prepare('SELECT * FROM tours WHERE tontine_id = ? ORDER BY ordre').all(tontine.id);
  res.json({ success: true, data: tours });
});

app.put('/api/tours/:id/complete', authenticate, requireGerant, (req, res) => {
  const tour = db.prepare('SELECT * FROM tours WHERE id = ?').get(req.params.id);
  if (!tour) return res.status(404).json({ success: false, message: 'Tour introuvable' });
  const approbations = JSON.parse(tour.approbations || '[]');
  if (!approbations.includes(req.user.id)) approbations.push(req.user.id);
  if (approbations.length >= 2) {
    db.prepare("UPDATE tours SET statut = 'terminÃ©', approbations = ?, date_effective = CURRENT_TIMESTAMP WHERE id = ?").run(JSON.stringify(approbations), tour.id);
    db.prepare("INSERT INTO transactions (membre_id, type, amount, name, tontine_id) VALUES (?, 'decaissement', ?, ?, ?)").run(tour.membre_id, tour.montant, `Tour #${tour.ordre} - ${tour.membre_name}`, tour.tontine_id);
    db.prepare('UPDATE tontine SET cagnotte = cagnotte - ?, tour_actuel = tour_actuel + 1 WHERE id = ?').run(tour.montant, tour.tontine_id);
    logAction(req.user.id, 'COMPLETE_TOUR', `Tour #${tour.ordre} complÃ©tÃ© pour ${tour.membre_name}`);

    const user = db.prepare('SELECT user_id FROM membres WHERE id = ?').get(tour.membre_id);
    if (user && user.user_id) {
      db.prepare("INSERT INTO notifications (user_id, texte, icon, type) VALUES (?, ?, 'trophy', 'success')").run(user.user_id, "Félicitations, vous avez été tiré pour ce tour et votre décaissement a été effectué !");
    }

    return res.json({ success: true, message: 'Tour complÃ©tÃ© et dÃ©caissÃ©' });
  }
  db.prepare('UPDATE tours SET approbations = ? WHERE id = ?').run(JSON.stringify(approbations), tour.id);
  res.json({ success: true, message: `Signature enregistrÃ©e (${approbations.length}/2)` });
});

// â”€â”€â”€ TIRAGE MENSUEL â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
app.get('/api/tirage', authenticate, (req, res) => {
  const tontine = getCurrentTontine(req);
  const mois = new Date().toISOString().slice(0, 7);
  const tirageActuel = db.prepare('SELECT t.*, m.name as membre_name FROM tirages_mensuels t LEFT JOIN membres m ON t.membre_id = m.id WHERE t.mois = ? AND t.tontine_id = ?').get(mois, tontine.id);
  const historique = db.prepare('SELECT t.*, m.name as membre_name FROM tirages_mensuels t LEFT JOIN membres m ON t.membre_id = m.id WHERE t.tontine_id = ? ORDER BY t.created_at DESC LIMIT 12').all(tontine.id);
  const totalMembres = db.prepare('SELECT COUNT(*) as c FROM membres WHERE tontine_id = ?').get(tontine.id).c;
  const dejaRecu = db.prepare('SELECT COUNT(*) as c FROM membres WHERE a_recu_tirage = 1 AND tontine_id = ?').get(tontine.id).c;
  res.json({ success: true, data: { tirageActuel, historique, cycle: { totalMembres, dejaRecu } } });
});

app.post('/api/tirage/effectuer', authenticate, requireGerant, async (req, res) => {
  const { montant, membre_id } = req.body;
  if (!montant) return res.status(400).json({ success: false, message: 'Montant requis' });
  const mois = new Date().toISOString().slice(0, 7);
  const tontine = getCurrentTontine(req);
  const existing = db.prepare('SELECT id FROM tirages_mensuels WHERE mois = ? AND tontine_id = ?').get(mois, tontine.id);
  if (existing) return res.status(400).json({ success: false, message: 'Un tirage a dÃ©jÃ  Ã©tÃ© effectuÃ© ce mois-ci' });
  let eligibles = db.prepare('SELECT m.*, u.email FROM membres m LEFT JOIN users u ON m.user_id = u.id WHERE m.a_recu_tirage = 0 AND m.tontine_id = ?').all(tontine.id);
  if (eligibles.length === 0) {
    db.prepare('UPDATE membres SET a_recu_tirage = 0 WHERE tontine_id = ?').run(tontine.id);
    eligibles = db.prepare('SELECT m.*, u.email FROM membres m LEFT JOIN users u ON m.user_id = u.id WHERE m.tontine_id = ?').all(tontine.id);
  }
  let beneficiaire;
  if (membre_id) {
    beneficiaire = eligibles.find(e => e.id === membre_id);
    if (!beneficiaire) return res.status(400).json({ success: false, message: 'Membre non éligible pour ce tirage' });
  } else {
    beneficiaire = eligibles[Math.floor(Math.random() * eligibles.length)];
  }
  const result = db.prepare('INSERT INTO tirages_mensuels (membre_id, montant, mois, tontine_id) VALUES (?, ?, ?, ?)').run(beneficiaire.id, montant, mois, tontine.id);
  if (beneficiaire.email) {
    const html = `<div style="font-family:sans-serif;padding:24px;"><h2 style="color:#7C3AED;">ðŸŽ‰ Vous Ãªtes le bÃ©nÃ©ficiaire du mois !</h2><p>Bonjour <strong>${beneficiaire.name}</strong>,</p><p>Vous avez Ã©tÃ© sÃ©lectionnÃ©(e) comme bÃ©nÃ©ficiaire du mois. Vous recevrez <strong>${montant.toLocaleString('fr-FR')} FCFA</strong>.</p><p style="color:#888;font-size:12px;">Tontine Nataal</p></div>`;
    await sendEmail(beneficiaire.email, 'ðŸŽ‰ Vous Ãªtes le bÃ©nÃ©ficiaire du mois !', html).catch(() => { });
  }
  logAction(req.user.id, 'TIRAGE', `Tirage ${mois}: ${beneficiaire.name} - ${montant} F`);
  res.status(201).json({ success: true, message: 'Tirage effectuÃ©', data: { id: result.lastInsertRowid, beneficiaire: beneficiaire.name, montant } });
});

app.post('/api/tirage/:id/envoyer', authenticate, requireGerant, (req, res) => {
  const tirage = db.prepare('SELECT * FROM tirages_mensuels WHERE id = ?').get(req.params.id);
  if (!tirage) return res.status(404).json({ success: false, message: 'Tirage introuvable' });
  if (tirage.statut === 'envoyÃ©') return res.status(400).json({ success: false, message: 'Cet argent a dÃ©jÃ  Ã©tÃ© envoyÃ©' });
  db.prepare("UPDATE tirages_mensuels SET statut = 'envoyÃ©', sent_at = CURRENT_TIMESTAMP WHERE id = ?").run(tirage.id);
  db.prepare('UPDATE membres SET a_recu_tirage = 1 WHERE id = ?').run(tirage.membre_id);
  db.prepare("INSERT INTO transactions (membre_id, type, amount, name, tontine_id) VALUES (?, 'tirage', ?, ?, ?)").run(tirage.membre_id, tirage.montant, `Tirage mensuel ${tirage.mois}`, tirage.tontine_id);
  db.prepare('UPDATE tontine SET cagnotte = cagnotte - ? WHERE id = ?').run(tirage.montant, tirage.tontine_id);
  const restants = db.prepare('SELECT COUNT(*) as c FROM membres WHERE a_recu_tirage = 0 AND tontine_id = ?').get(tirage.tontine_id).c;
  if (restants === 0) db.prepare('UPDATE membres SET a_recu_tirage = 0 WHERE tontine_id = ?').run(tirage.tontine_id);
  logAction(req.user.id, 'TIRAGE_ENVOI', `Envoi tirage #${tirage.id}`);
  res.json({ success: true, message: 'Envoi confirmé avec succès' });
});

// Deterministic Tirage from SpinWheel
app.post('/api/tirages', authenticate, requireGerant, (req, res) => {
  const { membre_id, montant, mois } = req.body;
  if (!membre_id || !montant) return res.status(400).json({ success: false, message: 'DonnÃ©es manquantes' });
  const tontine = getCurrentTontine(req);

  const winner = db.prepare('SELECT m.*, u.id as user_actual_id FROM membres m LEFT JOIN users u ON m.user_id = u.id WHERE m.id = ? AND m.tontine_id = ?').get(membre_id, tontine.id);
  if (!winner) return res.status(404).json({ success: false, message: 'Membre introuvable' });

  const moisTirage = mois || new Date().toLocaleDateString('fr-FR', { month: 'long', year: 'numeric' });

  try {
    // 1. Enregistrer le tirage en base
    const tirageResult = db.prepare("INSERT INTO tirages_mensuels (membre_id, montant, mois, statut, tontine_id) VALUES (?, ?, ?, 'en_attente', ?)")
      .run(winner.id, montant, moisTirage, tontine.id);

    // 2. Mettre Ã  jour le membre
    db.prepare('UPDATE membres SET a_recu_tirage = 1 WHERE id = ?').run(winner.id);

    // 3. Ajouter dans les transactions
    db.prepare("INSERT INTO transactions (membre_id, amount, type, name, tontine_id) VALUES (?, ?, 'tirage', ?, ?)")
      .run(winner.id, montant, `Tirage ${moisTirage} - bénéficiaire: ${winner.name}`, tontine.id);

    // 4. CrÃ©er notification globale
    db.prepare('INSERT INTO notifications (texte, icon, type, global) VALUES (?, ?, ?, 1)')
      .run(`ðŸŽ¯ Tirage ${moisTirage} â€“ ${winner.name} bÃ©nÃ©ficiaire`, 'ðŸŽ¯', 'tirage');

    // 5. CrÃ©er notification personnelle pour le gagnant
    if (winner.user_actual_id) {
      db.prepare('INSERT INTO notifications (user_id, texte, icon, type, global) VALUES (?, ?, ?, ?, 0)')
        .run(winner.user_actual_id, `ðŸ† FÃ©licitations ! Vous avez Ã©tÃ© tirÃ©(e) au sort pour le tour de ${moisTirage}.`, 'ðŸŽ‰', 'tirage_gagnant');
    }

    // 6. Update Cagnotte
    db.prepare('UPDATE tontine SET cagnotte = cagnotte - ? WHERE id = ?').run(montant, tontine.id);

    logAction(req.user.id, 'TIRAGE_CONFIRM', `Tirage confirmÃ© pour ${winner.name} (${montant} F)`);
    res.json({ success: true, message: 'Tirage enregistrÃ© avec succÃ¨s', tirage_id: tirageResult.lastInsertRowid });
  } catch (e) {
    res.status(500).json({ success: false, message: e.message });
  }
});

app.get('/api/notifications', authenticate, (req, res) => {
  const notifications = db.prepare(`
    SELECT * FROM notifications 
    WHERE (user_id = ? OR global = 1) 
    ORDER BY created_at DESC LIMIT 20
  `).all(req.user.id);
  res.json({ success: true, data: notifications });
});

// â”€â”€â”€ NOTIFICATIONS â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
app.post('/api/notifications/send-reminders', authenticate, requireGerant, async (req, res) => {
  const tontine = getCurrentTontine(req);
  if (!tontine) return res.status(404).json({ success: false, message: 'Tontine active introuvable' });
  const unpaid = db.prepare('SELECT m.*, u.email FROM membres m LEFT JOIN users u ON m.user_id = u.id WHERE m.paid = 0 AND m.tontine_id = ? AND u.email IS NOT NULL').all(tontine.id);
  let sent = 0;
  for (const m of unpaid) {
    const html = `<div style="font-family:sans-serif;padding:24px;"><h2 style="color:#FF7900;">âš ï¸ Rappel de Cotisation</h2><p>Bonjour <strong>${m.name}</strong>,</p><p>Votre cotisation mensuelle est en attente. Merci de rÃ©gulariser dÃ¨s que possible.</p><p style="color:#888;font-size:12px;">Tontine Nataal</p></div>`;
    await sendEmail(m.email, 'Rappel : Votre cotisation est en attente', html).catch(() => { });
    sent++;
  }
  logAction(req.user.id, 'REMINDERS', `${sent} rappels envoyÃ©s`);
  res.json({ success: true, message: `${sent} rappel(s) envoyÃ©(s)` });
});

// â”€â”€â”€ NOTIFICATIONS IN-APP â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
app.post('/api/notifications', authenticate, (req, res) => {
  const { user_id, texte, icon, type, global } = req.body;
  db.prepare('INSERT INTO notifications (user_id, texte, icon, type, global) VALUES (?, ?, ?, ?, ?)').run(user_id, texte, icon, type, global ? 1 : 0);
  res.json({ success: true });
});

app.get('/api/notifications', authenticate, (req, res) => {
  const notifs = db.prepare('SELECT * FROM notifications WHERE (user_id = ? OR global = 1) ORDER BY created_at DESC LIMIT 50').all(req.user.id);
  res.json({ success: true, data: notifs });
});

app.get('/api/notifications/count', authenticate, (req, res) => {
  const row = db.prepare('SELECT COUNT(*) as count FROM notifications WHERE (user_id = ? OR global = 1) AND read = 0').get(req.user.id);
  res.json({ success: true, count: row.count });
});

app.put('/api/notifications/:id/read', authenticate, (req, res) => {
  db.prepare('UPDATE notifications SET read = 1 WHERE id = ? AND (user_id = ? OR global = 1)').run(req.params.id, req.user.id);
  res.json({ success: true });
});

app.put('/api/notifications/read-all', authenticate, (req, res) => {
  db.prepare('UPDATE notifications SET read = 1 WHERE (user_id = ? OR global = 1)').run(req.user.id);
  res.json({ success: true });
});

app.post('/api/notifications/send-inapp-reminders', authenticate, requireGerant, (req, res) => {
  const { message, members } = req.body;
  const targetMembers = members === 'all'
    ? db.prepare('SELECT user_id FROM membres WHERE paid = 0').all()
    : members.map(id => ({ user_id: db.prepare('SELECT user_id FROM membres WHERE id = ?').get(id).user_id }));

  const stmt = db.prepare('INSERT INTO notifications (user_id, texte, icon, type) VALUES (?, ?, ?, ?)');
  targetMembers.forEach(m => {
    if (m.user_id) stmt.run(m.user_id, message, 'ðŸ””', 'rappel');
  });

  res.json({ success: true, message: `${targetMembers.length} notifications envoyÃ©es.` });
});

// â”€â”€â”€ PROFIL & TONTINE JOIN â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
app.put('/api/auth/profile', authenticate, (req, res) => {
  const { name, email, photo } = req.body;
  db.prepare('UPDATE users SET name = ?, email = ?, photo = ? WHERE id = ?').run(name, email, photo, req.user.id);
  db.prepare('UPDATE membres SET name = ?, photo = ? WHERE user_id = ?').run(name, photo, req.user.id);
  res.json({ success: true, message: "Profil mis Ã  jour" });
});

app.post('/api/auth/update-password', authenticate, (req, res) => {
  const { oldPass, newPass } = req.body;
  const user = db.prepare('SELECT password FROM users WHERE id = ?').get(req.user.id);
  if (!bcrypt.compareSync(oldPass, user.password)) return res.status(400).json({ success: false, message: "Ancien mot de passe incorrect" });
  const hashed = bcrypt.hashSync(newPass, 10);
  db.prepare('UPDATE users SET password = ? WHERE id = ?').run(hashed, req.user.id);
  res.json({ success: true, message: "Mot de passe modifiÃ©" });
});

app.get('/api/tontine/code', authenticate, (req, res) => {
  let t = getCurrentTontine(req);
  if (!t) return res.status(404).json({ success: false, message: 'Tontine introuvable' });
  if (!t.code_invitation) {
    const code = generateInvitationCode();
    db.prepare('UPDATE tontine SET code_invitation = ? WHERE id = ?').run(code, t.id);
    t.code_invitation = code;
  }
  res.json({ success: true, code: t.code_invitation });
});

app.post('/api/tontine/rejoindre', authenticate, (req, res) => {
  const { code } = req.body;
  const t = db.prepare('SELECT id, code_invitation, nom FROM tontine WHERE code_invitation = ?').get(code);
  if (!t) return res.status(404).json({ success: false, message: "Code invalide" });

  // VÃ©rifier si dÃ©jÃ  membre
  const exists = db.prepare('SELECT id FROM membres WHERE user_id = ? AND tontine_id = ?').get(req.user.id, t.id);
  if (exists) return res.status(400).json({ success: false, message: "Vous Ãªtes dÃ©jÃ  membre" });

  const user = db.prepare('SELECT name, photo FROM users WHERE id = ?').get(req.user.id);
  const initials = user.name.split(' ').map(n => n[0]).join('').toUpperCase();
  const nextTurn = (db.prepare('SELECT MAX(turn_number) as m FROM membres WHERE tontine_id = ?').get(t.id).m || 0) + 1;

  db.prepare('INSERT INTO membres (user_id, name, photo, turn_number, initials, tontine_id) VALUES (?, ?, ?, ?, ?, ?)')
    .run(req.user.id, user.name, user.photo, nextTurn, initials, t.id);

  res.json({ success: true, message: "Bienvenue dans la tontine !", tontine_id: t.id, tontine_nom: t.nom });
});

// â”€â”€â”€ AUDIT â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
app.get('/api/audit', authenticate, requireGerant, (req, res) => {
  const logs = db.prepare('SELECT a.*, u.name as user_name FROM audit_logs a LEFT JOIN users u ON a.user_id = u.id ORDER BY a.created_at DESC LIMIT 100').all();
  res.json({ success: true, data: logs });
});

// â”€â”€â”€ STATS â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
app.get('/api/stats/evolution-mensuelle', authenticate, (req, res) => {
  const data = db.prepare(`
    SELECT strftime('%m/%Y', created_at) as name,
           SUM(CASE WHEN type='cotisation' THEN amount ELSE 0 END) as entrees,
           SUM(CASE WHEN type!='cotisation' THEN amount ELSE 0 END) as sorties
    FROM transactions GROUP BY strftime('%Y-%m', created_at) ORDER BY created_at ASC LIMIT 12
  `).all();
  res.json({ success: true, data });
});

// â”€â”€â”€ FINANCE DASHBOARD â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
app.get('/api/stats/finance-dashboard', authenticate, (req, res) => {
  try {
    const today = new Date().toISOString().slice(0, 10);
    const tontine = getCurrentTontine(req);

    // Cotisations du jour
    const cotisJour = db.prepare(
      "SELECT COUNT(*) as count, COALESCE(SUM(amount), 0) as total FROM transactions WHERE tontine_id = ? AND type = 'cotisation' AND DATE(created_at) = ?"
    ).get(tontine.id, today);

    // PÃ©nalitÃ©s actives
    const penalites = db.prepare(
      "SELECT COUNT(*) as count, COALESCE(SUM(amount), 0) as total FROM transactions WHERE tontine_id = ? AND type = 'penalite'"
    ).get(tontine.id);
    const membresEnRetard = db.prepare('SELECT COUNT(*) as c FROM membres WHERE paid = 0 AND tontine_id = ?').get(tontine.id).c;

    // PrÃªts en cours
    const pretsEnCours = db.prepare(
      "SELECT COUNT(*) as count, COALESCE(SUM(montant), 0) as total FROM prets WHERE tontine_id = ? AND (status = 'ApprouvÃ©' OR status = 'En attente')"
    ).get(tontine.id);

    // Top 4 cotisants
    const topCotisants = db.prepare(`
      SELECT m.name, m.color, COALESCE(SUM(t.amount), 0) as total
      FROM membres m
      LEFT JOIN transactions t ON t.membre_id = m.id AND t.type = 'cotisation' AND t.tontine_id = ?
      WHERE m.tontine_id = ?
      GROUP BY m.id
      ORDER BY total DESC
      LIMIT 4
    `).all(tontine.id, tontine.id);

    // RÃ©sumÃ© session
    const totalCollecte = db.prepare("SELECT COALESCE(SUM(amount), 0) as v FROM transactions WHERE tontine_id = ? AND type = 'cotisation'").get(tontine.id).v;
    const totalPenalites = db.prepare("SELECT COALESCE(SUM(amount), 0) as v FROM transactions WHERE tontine_id = ? AND type = 'penalite'").get(tontine.id).v;
    const totalPretsDecaisses = db.prepare("SELECT COALESCE(SUM(montant), 0) as v FROM prets WHERE tontine_id = ? AND status = 'ApprouvÃ©'").get(tontine.id).v;
    const totalMembres = db.prepare('SELECT COUNT(*) as c FROM membres WHERE tontine_id = ?').get(tontine.id).c;
    const membresPaye = db.prepare('SELECT COUNT(*) as c FROM membres WHERE paid = 1 AND tontine_id = ?').get(tontine.id).c;
    const tauxCotisation = totalMembres > 0 ? Math.round((membresPaye / totalMembres) * 100) : 0;

    // DonnÃ©es chart â€” activitÃ© par type (derniers 12 points)
    const chartData = db.prepare(`
      SELECT strftime('%d/%m', created_at) as name,
             SUM(CASE WHEN type = 'cotisation' THEN amount ELSE 0 END) as cotisation,
             SUM(CASE WHEN type = 'penalite' THEN amount ELSE 0 END) as penalite,
             SUM(CASE WHEN type IN ('pret', 'decaissement', 'tirage') THEN amount ELSE 0 END) as pret
      FROM transactions
      WHERE tontine_id = ?
      GROUP BY strftime('%Y-%m-%d', created_at)
      ORDER BY created_at DESC
      LIMIT 20
    `).all(tontine.id).reverse();

    // DerniÃ¨res transactions
    const dernieres = db.prepare(
      'SELECT * FROM transactions WHERE tontine_id = ? ORDER BY created_at DESC LIMIT 20'
    ).all(tontine.id);

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
        totalTransactions: db.prepare('SELECT COUNT(*) as c FROM transactions WHERE tontine_id = ?').get(tontine.id).c
      }
    });
  } catch (e) {
    res.status(500).json({ success: false, message: e.message });
  }
});

// â”€â”€â”€ EXPORTS â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
app.get('/api/exports/rapport-mensuel.xlsx', authenticate, requireGerant, async (req, res) => {
  const transactions = db.prepare('SELECT * FROM transactions ORDER BY created_at DESC').all();
  const workbook = new ExcelJS.Workbook();
  const sheet = workbook.addWorksheet('Transactions');
  sheet.columns = [
    { header: 'ID', key: 'id', width: 8 },
    { header: 'Nom', key: 'name', width: 25 },
    { header: 'Type', key: 'type', width: 15 },
    { header: 'Montant (F)', key: 'amount', width: 18 },
    { header: 'MÃ©thode', key: 'method', width: 15 },
    { header: 'Date', key: 'created_at', width: 22 },
  ];
  transactions.forEach(t => sheet.addRow(t));
  res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
  res.setHeader('Content-Disposition', 'attachment; filename=rapport-tontine.xlsx');
  await workbook.xlsx.write(res);
  res.end();
});

app.get('/api/exports/rapport-mensuel.pdf', authenticate, requireGerant, (req, res) => {
  const transactions = db.prepare('SELECT * FROM transactions ORDER BY created_at DESC LIMIT 50').all();
  const doc = new PDFDocument({ margin: 40 });
  res.setHeader('Content-Type', 'application/pdf');
  res.setHeader('Content-Disposition', 'attachment; filename=rapport-tontine.pdf');
  doc.pipe(res);
  doc.fontSize(20).text('Rapport Tontine Nataal', { align: 'center' });
  doc.moveDown();
  doc.fontSize(12).text(`GÃ©nÃ©rÃ© le ${new Date().toLocaleDateString('fr-FR')}`);
  doc.moveDown();
  transactions.forEach(t => {
    doc.fontSize(10).text(`${t.name} | ${t.type} | ${t.amount.toLocaleString('fr-FR')} F | ${new Date(t.created_at).toLocaleDateString('fr-FR')}`);
  });
  doc.end();
});

// â”€â”€â”€ FRONTEND SPA ROUTING â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
if (!IS_TEST) {
  app.use((req, res) => {
    res.sendFile(path.join(__dirname, 'tontine-front', 'dist', 'index.html'));
  });
}

// â”€â”€â”€ RESET MENSUEL (CRON) â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
if (!IS_TEST) {
  cron.schedule('0 0 1 * *', () => {
    db.prepare('UPDATE membres SET paid = 0').run();
    console.log('âœ… RÃ©initialisation mensuelle effectuÃ©e');
  });

  // Rappel de fin de mois (le 28 à 18:00)
  cron.schedule('0 18 28 * *', () => {
    db.prepare("INSERT INTO notifications (texte, icon, type, global) VALUES ('Rappel : N\\'oubliez pas de payer votre cotisation pour ce mois.', 'warning', 'info', 1)").run();
    console.log('✅ Rappel de fin de mois envoyé (Global)');
  });

  // Notification de retard de paiement (le 5 du mois à 18:00)
  cron.schedule('0 18 5 * *', () => {
    const retardataires = db.prepare('SELECT user_id FROM membres WHERE paid = 0 AND user_id IS NOT NULL').all();
    const insertNotif = db.prepare('INSERT INTO notifications (user_id, texte, icon, type) VALUES (?, ?, ?, ?)');
    db.transaction(() => {
      for (const m of retardataires) {
        insertNotif.run(m.user_id, "Alerte : Vous avez un retard de paiement pour votre cotisation.", "alert", "error");
      }
    })();
    console.log(`✅ Notifications de retard envoyées à ${retardataires.length} membres`);
  });
}

// â”€â”€â”€ START â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
if (!IS_TEST) {
  app.listen(PORT, () => {
    console.log(`âœ… Serveur dÃ©marrÃ© â†’ http://localhost:${PORT}`);
    console.log(`ðŸ“¡ API          â†’ http://localhost:${PORT}/api`);
    console.log(`ðŸ‘¤ Admin        â†’ ${ADMIN_EMAIL} / ${ADMIN_PASS}`);
  });
}

module.exports = app;
module.exports = app;
module.exports = app;
