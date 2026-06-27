const db = require('../config/db');
const crypto = require('crypto');

async function generateInvitationCode(reservedCodes = new Set()) {
  let code;
  let exists = true;
  while(exists) {
    code = crypto.randomBytes(4).toString('hex').slice(0, 6).toUpperCase();
    if(reservedCodes.has(code)) continue;
    try {
        const [rows] = await db.query('SELECT id FROM tontine WHERE UPPER(code_invitation) = ?', [code]);
        if(rows.length === 0) {
            exists = false;
        }
    } catch(e) {
        // If table doesn't exist yet
        exists = false;
    }
  }
  return code;
}

async function initializeSchema() {
  await db.query(`
    CREATE TABLE IF NOT EXISTS users (
      id INT AUTO_INCREMENT PRIMARY KEY,
      name VARCHAR(255) NOT NULL,
      email VARCHAR(255) UNIQUE NOT NULL,
      password VARCHAR(255) NOT NULL,
      role VARCHAR(50) NOT NULL DEFAULT 'membre',
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      prenom VARCHAR(255) DEFAULT '',
      telephone VARCHAR(50) DEFAULT '',
      photo VARCHAR(255) DEFAULT ''
    );

    CREATE TABLE IF NOT EXISTS tontine (
      id INT AUTO_INCREMENT PRIMARY KEY,
      gerant_id INT,
      nom VARCHAR(255) DEFAULT 'Tontine Nataal',
      description TEXT,
      cotisation_mensuelle INT DEFAULT 50000,
      frequence VARCHAR(50) DEFAULT 'mensuelle',
      frais_gestion FLOAT DEFAULT 0,
      nombre_places INT DEFAULT 12,
      date_debut VARCHAR(100) DEFAULT '',
      cagnotte INT DEFAULT 0,
      tour_actuel INT DEFAULT 1,
      tour_total INT DEFAULT 12,
      progression INT DEFAULT 0,
      taux_penalite FLOAT DEFAULT 5.0,
      code_invitation VARCHAR(50) UNIQUE,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (gerant_id) REFERENCES users(id) ON DELETE SET NULL
    );

    CREATE TABLE IF NOT EXISTS membres (
      id INT AUTO_INCREMENT PRIMARY KEY,
      user_id INT,
      tontine_id INT,
      name VARCHAR(255) NOT NULL,
      prenom VARCHAR(255) DEFAULT '',
      telephone VARCHAR(50) DEFAULT '',
      photo VARCHAR(255) DEFAULT '',
      role VARCHAR(50) DEFAULT 'Membre',
      turn_number INT NOT NULL,
      paid INT DEFAULT 0,
      a_recu_tirage INT DEFAULT 0,
      color VARCHAR(50),
      initials VARCHAR(10),
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
      FOREIGN KEY (tontine_id) REFERENCES tontine(id) ON DELETE CASCADE
    );

    CREATE TABLE IF NOT EXISTS transactions (
      id INT AUTO_INCREMENT PRIMARY KEY,
      membre_id INT,
      tontine_id INT,
      type VARCHAR(50) NOT NULL,
      amount INT NOT NULL,
      method VARCHAR(50),
      name VARCHAR(255),
      color VARCHAR(50),
      initials VARCHAR(10),
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (membre_id) REFERENCES membres(id) ON DELETE CASCADE,
      FOREIGN KEY (tontine_id) REFERENCES tontine(id) ON DELETE CASCADE
    );

    CREATE TABLE IF NOT EXISTS prets (
      id INT AUTO_INCREMENT PRIMARY KEY,
      user_id INT,
      membre_id INT,
      tontine_id INT,
      montant INT NOT NULL,
      motif TEXT,
      status VARCHAR(50) DEFAULT 'En attente',
      approbations TEXT,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
      FOREIGN KEY (membre_id) REFERENCES membres(id) ON DELETE CASCADE,
      FOREIGN KEY (tontine_id) REFERENCES tontine(id) ON DELETE CASCADE
    );

    CREATE TABLE IF NOT EXISTS echeances (
      id INT AUTO_INCREMENT PRIMARY KEY,
      pret_id INT,
      montant INT NOT NULL,
      echeance_date VARCHAR(100),
      paid INT DEFAULT 0,
      paid_at DATETIME,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (pret_id) REFERENCES prets(id) ON DELETE CASCADE
    );

    CREATE TABLE IF NOT EXISTS tours (
      id INT AUTO_INCREMENT PRIMARY KEY,
      membre_id INT,
      tontine_id INT,
      membre_name VARCHAR(255),
      ordre INT,
      montant INT DEFAULT 0,
      statut VARCHAR(50) DEFAULT 'en_attente',
      approbations TEXT,
      date_effective DATETIME,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (membre_id) REFERENCES membres(id) ON DELETE CASCADE,
      FOREIGN KEY (tontine_id) REFERENCES tontine(id) ON DELETE CASCADE
    );

    CREATE TABLE IF NOT EXISTS audit_logs (
      id INT AUTO_INCREMENT PRIMARY KEY,
      user_id INT,
      action VARCHAR(100) NOT NULL,
      details TEXT,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE IF NOT EXISTS tirages_mensuels (
      id INT AUTO_INCREMENT PRIMARY KEY,
      membre_id INT,
      tontine_id INT,
      montant INT NOT NULL,
      mois VARCHAR(50) NOT NULL,
      statut VARCHAR(50) DEFAULT 'en_attente',
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      sent_at DATETIME,
      FOREIGN KEY (membre_id) REFERENCES membres(id) ON DELETE CASCADE,
      FOREIGN KEY (tontine_id) REFERENCES tontine(id) ON DELETE CASCADE
    );

    CREATE TABLE IF NOT EXISTS notifications (
      id INT AUTO_INCREMENT PRIMARY KEY,
      user_id INT,
      texte TEXT NOT NULL,
      icon VARCHAR(50),
      type VARCHAR(50),
      global_notif INT DEFAULT 0,
      is_read INT DEFAULT 0,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
    );
  `);
  
  const [rows] = await db.query('SELECT id, code_invitation FROM tontine ORDER BY id ASC');
  const usedCodes = new Set();
  
  for(let row of rows) {
    const currentCode = String(row.code_invitation || '').trim().toUpperCase();
    if(currentCode && !usedCodes.has(currentCode)) {
      usedCodes.add(currentCode);
      continue;
    }
    const newCode = await generateInvitationCode(usedCodes);
    usedCodes.add(newCode);
    await db.query('UPDATE tontine SET code_invitation = ? WHERE id = ?', [newCode, row.id]);
  }
}

module.exports = { initializeSchema, generateInvitationCode };
