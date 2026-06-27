const Database = require('better-sqlite3');
const db = new Database('./tontine.db');

try {
  const users = db.prepare("SELECT id, name, email, role FROM users").all();
  console.log("USERS:", users);
  
  const membres = db.prepare("SELECT id, user_id, name FROM membres").all();
  console.log("MEMBRES:", membres);
} catch (err) {
  console.error(err);
}
