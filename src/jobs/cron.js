const cron = require('node-cron');
const db = require('../config/db');
const { IS_TEST } = require('../config/env');

function setupCronJobs() {
  if (IS_TEST) return;

  // Réinitialisation mensuelle
  cron.schedule('0 0 1 * *', async () => {
    try {
        await db.query('UPDATE membres SET paid = 0');
        console.log('✅ Réinitialisation mensuelle effectuée');
    } catch(err) {
        console.error('Erreur cron réinitialisation:', err.message);
    }
  });

  // Rappel de fin de mois (le 28 à 18:00)
  cron.schedule('0 18 28 * *', async () => {
    try {
        await db.query("INSERT INTO notifications (texte, icon, type, global_notif) VALUES ('Rappel : N\'oubliez pas de payer votre cotisation pour ce mois.', 'warning', 'info', 1)");
        console.log('✅ Rappel de fin de mois envoyé (Global)');
    } catch(err) {
        console.error('Erreur cron rappel:', err.message);
    }
  });

  // Notification de retard de paiement (le 5 du mois à 18:00)
  cron.schedule('0 18 5 * *', async () => {
    try {
        const [retardataires] = await db.query('SELECT user_id FROM membres WHERE paid = 0 AND user_id IS NOT NULL');
        for (const m of retardataires) {
            await db.query('INSERT INTO notifications (user_id, texte, icon, type) VALUES (?, ?, ?, ?)', 
              [m.user_id, "Alerte : Vous avez un retard de paiement pour votre cotisation.", "alert", "error"]);
        }
        console.log(`✅ Notifications de retard envoyées à ${retardataires.length} membres`);
    } catch(err) {
        console.error('Erreur cron retard:', err.message);
    }
  });
}

module.exports = { setupCronJobs };
