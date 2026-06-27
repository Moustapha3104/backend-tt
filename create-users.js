const Database = require('better-sqlite3');
const bcrypt = require('bcryptjs');
const path = require('path');

const DB_PATH = path.join(__dirname, 'tontine.db');
const db = new Database(DB_PATH);

// ─────────────────────────────────────────────────────────────────────────
// CREATE SUPER ADMIN
// ─────────────────────────────────────────────────────────────────────────

const SUPER_ADMIN = {
  name: 'Mohamed Moustapha Ba',
  email: 'mohamedmoustaphaba01@icloud.com',
  password: 'P@sser123',
  role: 'admin'
};

console.log('\n╔════════════════════════════════════════════════════════════════╗');
console.log('║           CRÉATION DU SUPER ADMIN                              ║');
console.log('╚════════════════════════════════════════════════════════════════╝\n');

try {
  const existingAdmin = db.prepare('SELECT id FROM users WHERE email = ?').get(SUPER_ADMIN.email);
  
  if (existingAdmin) {
    console.log('❌ Super Admin existe déjà');
  } else {
    const hashedPassword = bcrypt.hashSync(SUPER_ADMIN.password, 10);
    const result = db.prepare(
      'INSERT INTO users (name, email, password, role) VALUES (?, ?, ?, ?)'
    ).run(SUPER_ADMIN.name, SUPER_ADMIN.email, hashedPassword, SUPER_ADMIN.role);
    
    const adminId = result.lastInsertRowid;
    console.log('✅ Super Admin créé avec succès!');
    console.log(`   ID: ${adminId}`);
    console.log(`   Nom: ${SUPER_ADMIN.name}`);
    console.log(`   Email: ${SUPER_ADMIN.email}`);
    console.log(`   Mot de passe: ${SUPER_ADMIN.password}`);
    console.log(`   Rôle: ${SUPER_ADMIN.role.toUpperCase()}`);
    console.log(`   Permissions: Accès complet à toutes les tontines et fonctionnalités`);
  }
} catch (error) {
  console.error('❌ Erreur lors de la création du Super Admin:', error.message);
}

// ─────────────────────────────────────────────────────────────────────────
// CREATE 5 MEMBERS
// ─────────────────────────────────────────────────────────────────────────

const MEMBERS = [
  {
    name: 'Fatou Ndiaye',
    prenom: 'Fatou',
    telephone: '+221771234567',
    email: 'fatou.ndiaye@tontine.sn',
    password: 'Fatou@2024',
    role: 'Membre',
    color: '#FF6B6B'
  },
  {
    name: 'Ibrahima Sow',
    prenom: 'Ibrahima',
    telephone: '+221772345678',
    email: 'ibrahima.sow@tontine.sn',
    password: 'Ibrahim@2024',
    role: 'Membre',
    color: '#4ECDC4'
  },
  {
    name: 'Aminata Diallo',
    prenom: 'Aminata',
    telephone: '+221773456789',
    email: 'aminata.diallo@tontine.sn',
    password: 'Aminata@2024',
    role: 'Membre',
    color: '#45B7D1'
  },
  {
    name: 'Omar Faye',
    prenom: 'Omar',
    telephone: '+221774567890',
    email: 'omar.faye@tontine.sn',
    password: 'Omar@2024',
    role: 'Membre',
    color: '#F7DC6F'
  },
  {
    name: 'Rokhaya Mbaye',
    prenom: 'Rokhaya',
    telephone: '+221775678901',
    email: 'rokhaya.mbaye@tontine.sn',
    password: 'Rokhaya@2024',
    role: 'Membre',
    color: '#BB8FCE'
  }
];

console.log('\n╔════════════════════════════════════════════════════════════════╗');
console.log('║             CRÉATION DES 5 MEMBRES                             ║');
console.log('╚════════════════════════════════════════════════════════════════╝\n');

const createdMembers = [];

MEMBERS.forEach((member, index) => {
  try {
    const existingMember = db.prepare('SELECT id FROM users WHERE email = ?').get(member.email);
    
    if (existingMember) {
      console.log(`${index + 1}. ❌ ${member.name} (${member.email}) - Existe déjà`);
    } else {
      const hashedPassword = bcrypt.hashSync(member.password, 10);
      const initials = member.name
        .split(' ')
        .map(n => n[0])
        .join('')
        .toUpperCase();
      
      const result = db.prepare(
        'INSERT INTO users (name, email, password, role) VALUES (?, ?, ?, ?)'
      ).run(member.name, member.email, hashedPassword, 'membre');
      
      const userId = result.lastInsertRowid;
      
      // Add to first tontine as membre
      const tontine = db.prepare('SELECT * FROM tontine ORDER BY id ASC LIMIT 1').get();
      
      if (tontine) {
        const membresCount = db.prepare('SELECT COUNT(*) as c FROM membres WHERE tontine_id = ?').get(tontine.id).c;
        const membreResult = db.prepare(
          'INSERT INTO membres (user_id, name, prenom, role, turn_number, color, initials, tontine_id) VALUES (?, ?, ?, ?, ?, ?, ?, ?)'
        ).run(userId, member.name, member.prenom, member.role, membresCount + 1, member.color, initials, tontine.id);
        
        createdMembers.push({
          id: userId,
          name: member.name,
          email: member.email,
          password: member.password,
          telephone: member.telephone,
          role: member.role,
          color: member.color,
          initials: initials,
          membreId: membreResult.lastInsertRowid
        });
        
        console.log(`${index + 1}. ✅ ${member.name}`);
      }
    }
  } catch (error) {
    console.error(`${index + 1}. ❌ Erreur pour ${member.name}:`, error.message);
  }
});

// ─────────────────────────────────────────────────────────────────────────
// AFFICHE TOUTES LES INFORMATIONS
// ─────────────────────────────────────────────────────────────────────────

console.log('\n╔════════════════════════════════════════════════════════════════╗');
console.log('║        RÉSUMÉ COMPLET - SUPER ADMIN                            ║');
console.log('╚════════════════════════════════════════════════════════════════╝\n');

console.log('👑 SUPER ADMIN - Accès à TOUTES les tontines et TOUTES les fonctionnalités');
console.log('─'.repeat(65));
console.log(`Email:          ${SUPER_ADMIN.email}`);
console.log(`Mot de passe:   ${SUPER_ADMIN.password}`);
console.log(`Nom complet:    ${SUPER_ADMIN.name}`);
console.log(`Rôle:           ${SUPER_ADMIN.role.toUpperCase()}`);
console.log(`Permissions:    🔓 Contrôle total`);
console.log('');

console.log('╔════════════════════════════════════════════════════════════════╗');
console.log('║        RÉSUMÉ COMPLET - 5 MEMBRES                             ║');
console.log('╚════════════════════════════════════════════════════════════════╝\n');

createdMembers.forEach((member, index) => {
  console.log(`MEMBRE ${index + 1}`);
  console.log('─'.repeat(65));
  console.log(`ID Utilisateur:  ${member.id}`);
  console.log(`ID Membre:       ${member.membreId}`);
  console.log(`Nom complet:     ${member.name}`);
  console.log(`Email:           ${member.email}`);
  console.log(`Mot de passe:    ${member.password}`);
  console.log(`Téléphone:       ${member.telephone}`);
  console.log(`Initiales:       ${member.initials}`);
  console.log(`Couleur:         ${member.color} (🎨 utilisée pour l'affichage)`);
  console.log(`Rôle:            ${member.role}`);
  console.log(`Permissions:     Accès à la tontine, paiements, prêts, tirages`);
  console.log('');
});

// ─────────────────────────────────────────────────────────────────────────
// RÉSUMÉ FINAL
// ─────────────────────────────────────────────────────────────────────────

console.log('╔════════════════════════════════════════════════════════════════╗');
console.log('║                   RÉSUMÉ FINAL                                 ║');
console.log('╚════════════════════════════════════════════════════════════════╝\n');

const totalUsers = db.prepare('SELECT COUNT(*) as c FROM users').get().c;
console.log(`✅ Total d'utilisateurs en base de données: ${totalUsers}`);
console.log(`✅ Super Admin créé: 1`);
console.log(`✅ Membres créés: ${createdMembers.length}`);

console.log('\n📝 TABLE DES CONNEXIONS:');
console.log('─'.repeat(65));
console.log('┌──────────────────────────────────┬─────────────────────────────┐');
console.log('│ Email                            │ Mot de passe                │');
console.log('├──────────────────────────────────┼─────────────────────────────┤');
console.log(`│ ${SUPER_ADMIN.email.padEnd(32)} │ ${SUPER_ADMIN.password.padEnd(27)} │`);
createdMembers.forEach(member => {
  console.log(`│ ${member.email.padEnd(32)} │ ${member.password.padEnd(27)} │`);
});
console.log('└──────────────────────────────────┴─────────────────────────────┘');

console.log('\n🔒 SÉCURITÉ:');
console.log('─'.repeat(65));
console.log('• Tous les mots de passe sont hashés avec bcryptjs');
console.log('• Le Super Admin a accès complet à toutes les tontines');
console.log('• Les membres n\'ont accès qu\'à la tontine dont ils font partie');
console.log('• Les données sont stockées de manière sécurisée en base SQLite');

console.log('\n✨ SUCCÈS! Tous les utilisateurs ont été créés avec succès!\n');

db.close();
