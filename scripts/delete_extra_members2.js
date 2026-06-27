const Database = require('better-sqlite3');
const db = new Database('./tontine.db');

try {
  console.log("--- Deleting extra members ---");
  
  db.pragma('foreign_keys = OFF');

  const usersToKeep = db.prepare(`
    SELECT id FROM users 
    WHERE role IN ('gerant', 'admin') 
       OR email IN ('membre1@test.com', 'membre2@test.com', 'membre3@test.com')
  `).all();
  
  const keepUserIds = usersToKeep.map(u => u.id);
  const keepList = keepUserIds.join(',');

  console.log("Keeping users with IDs:", keepList);

  if (keepUserIds.length > 0) {
    db.prepare(`DELETE FROM notifications WHERE user_id NOT IN (${keepList})`).run();
    db.prepare(`DELETE FROM prets WHERE membre_id IN (SELECT id FROM membres WHERE user_id NOT IN (${keepList}) OR user_id IS NULL)`).run();
    db.prepare(`DELETE FROM transactions WHERE membre_id IN (SELECT id FROM membres WHERE user_id NOT IN (${keepList}) OR user_id IS NULL)`).run();
    db.prepare(`DELETE FROM tirages_mensuels WHERE membre_id IN (SELECT id FROM membres WHERE user_id NOT IN (${keepList}) OR user_id IS NULL)`).run();
    db.prepare(`DELETE FROM tours WHERE membre_id IN (SELECT id FROM membres WHERE user_id NOT IN (${keepList}) OR user_id IS NULL)`).run();
    
    // Delete from membres where user_id is not in keepList, OR user_id is null
    db.prepare(`DELETE FROM membres WHERE user_id NOT IN (${keepList}) OR user_id IS NULL`).run();
    
    // Delete from users where id is not in keepList
    db.prepare(`DELETE FROM users WHERE id NOT IN (${keepList})`).run();
  }

  db.pragma('foreign_keys = ON');
  
  const remainingUsers = db.prepare("SELECT email, role FROM users").all();
  console.log("Remaining users:", remainingUsers);
  
  const remainingMembres = db.prepare("SELECT name FROM membres").all();
  console.log("Remaining membres:", remainingMembres);

} catch (err) {
  console.error(err);
}
