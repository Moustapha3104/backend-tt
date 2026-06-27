const Database = require('better-sqlite3');
const bcrypt = require('bcryptjs');

const db = new Database('./tontine.db');

try {
  console.log("--- Deleting extra gerants ---");
  // Keep the gerant with the minimum ID
  const firstGerant = db.prepare("SELECT id FROM users WHERE role = 'gerant' ORDER BY id ASC LIMIT 1").get();
  
  if (firstGerant) {
    console.log(`Keeping gerant with ID: ${firstGerant.id}`);
    
    // First, find all other gerants
    const otherGerants = db.prepare("SELECT id FROM users WHERE role = 'gerant' AND id != ?").all(firstGerant.id);
    const otherGerantIds = otherGerants.map(g => g.id);
    
    if (otherGerantIds.length > 0) {
      console.log(`Deleting ${otherGerantIds.length} other gerants...`);
      // We also need to be careful with foreign keys (membres, tontine, prets, etc. referencing user_id).
      // Since it's a test data reset, we'll just delete them if possible, or disable foreign keys temporarily.
      db.pragma('foreign_keys = OFF');
      
      const idList = otherGerantIds.join(',');
      db.prepare(`DELETE FROM notifications WHERE user_id IN (${idList})`).run();
      db.prepare(`DELETE FROM membres WHERE user_id IN (${idList})`).run();
      db.prepare(`DELETE FROM users WHERE id IN (${idList})`).run();
      
      db.pragma('foreign_keys = ON');
    } else {
      console.log("No other gerants found.");
    }
  } else {
    console.log("No gerant found at all.");
  }

  console.log("\n--- Creating test members ---");
  
  // Get the first tontine ID to assign members to
  const tontine = db.prepare("SELECT id, cotisation_mensuelle FROM tontine ORDER BY id ASC LIMIT 1").get();
  const tontineId = tontine ? tontine.id : 1;
  const cotisation = tontine ? tontine.cotisation_mensuelle : 50000;
  
  console.log(`Using tontine ID: ${tontineId}`);

  const testUsers = [
    { name: "Test Membre 1", email: "membre1@test.com", password: "password123", prenom: "Membre1" },
    { name: "Test Membre 2", email: "membre2@test.com", password: "password123", prenom: "Membre2" },
    { name: "Test Membre 3", email: "membre3@test.com", password: "password123", prenom: "Membre3" }
  ];

  const colors = ['#FF6B6B', '#4ECDC4', '#45B7D1'];
  
  let currentMaxTurn = db.prepare("SELECT MAX(turn_number) as m FROM membres WHERE tontine_id = ?").get(tontineId)?.m || 0;

  for (let i = 0; i < testUsers.length; i++) {
    const tu = testUsers[i];
    
    // Check if email already exists
    const existing = db.prepare("SELECT id FROM users WHERE email = ?").get(tu.email);
    if (existing) {
      console.log(`${tu.email} already exists, skipping creation.`);
      continue;
    }
    
    const hashed = bcrypt.hashSync(tu.password, 10);
    const userResult = db.prepare(
      "INSERT INTO users (name, email, password, role) VALUES (?, ?, ?, 'membre')"
    ).run(tu.name, tu.email, hashed);
    
    const userId = userResult.lastInsertRowid;
    currentMaxTurn++;
    const initials = "T" + (i + 1);
    const color = colors[i % colors.length];
    
    // Attempt to insert into membres
    // Let's check schema for membres to ensure we don't hit missing column errors
    try {
      const membreResult = db.prepare(
        "INSERT INTO membres (user_id, name, prenom, role, turn_number, color, initials, tontine_id) VALUES (?, ?, ?, 'Membre', ?, ?, ?, ?)"
      ).run(userId, tu.name, tu.prenom, currentMaxTurn, color, initials, tontineId);
      
      const membreId = membreResult.lastInsertRowid;
      
      // Attempt to insert into tours
      db.prepare(
        "INSERT INTO tours (membre_id, membre_name, ordre, montant, tontine_id) VALUES (?, ?, ?, ?, ?)"
      ).run(membreId, tu.name, currentMaxTurn, cotisation * 12, tontineId);
      
    } catch (e) {
      console.log(`Failed to create member record for ${tu.email}: ${e.message}`);
    }
  }

  console.log("\n--- Accounts for testing ---");
  const currentGerant = db.prepare("SELECT email FROM users WHERE role = 'gerant' ORDER BY id ASC LIMIT 1").get();
  if (currentGerant) {
    console.log(`Gerant Email: ${currentGerant.email} (Password: password123 or unchanged)`);
  }
  
  testUsers.forEach(tu => {
    console.log(`Membre Email: ${tu.email} | Password: ${tu.password}`);
  });

} catch (err) {
  console.error("Error:", err);
}
