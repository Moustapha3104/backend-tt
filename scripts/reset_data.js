const Database = require('better-sqlite3');
const db = new Database('./tontine.db');

try {
  console.log("--- Resetting Dashboard Data for Testing ---");

  db.pragma('foreign_keys = OFF');

  // 1. Clear transaction data
  db.prepare('DELETE FROM transactions').run();
  console.log("Cleared transactions.");

  db.prepare('DELETE FROM echeances').run();
  db.prepare('DELETE FROM prets').run();
  console.log("Cleared loans and schedules.");

  db.prepare('DELETE FROM tirages_mensuels').run();
  console.log("Cleared monthly draws.");

  db.prepare('DELETE FROM audit_logs').run();
  console.log("Cleared audit logs.");

  // 2. Reset Tontine variables to 0
  db.prepare(`
    UPDATE tontine 
    SET cagnotte = 0, progression = 0, tour_actuel = 1
  `).run();
  console.log("Reset tontine cagnotte, progression to 0 and tour_actuel to 1.");

  // 3. Reset Membres stats
  db.prepare(`
    UPDATE membres 
    SET paid = 0, a_recu_tirage = 0
  `).run();
  console.log("Reset members: paid = 0, a_recu_tirage = 0.");

  // 4. Reset Tours
  db.prepare(`
    UPDATE tours 
    SET statut = 'en_attente', approbations = '[]', date_effective = NULL
  `).run();
  console.log("Reset tours: statut to 'en_attente'.");

  db.pragma('foreign_keys = ON');

  console.log("\nAll data has been erased and set to zero successfully!");
} catch (err) {
  console.error("Error while resetting data:", err);
}
