'use strict';
require('dotenv').config();

const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const path = require('path');
const fs = require('fs');

const { PORT, IS_TEST } = require('./config/env');
const { globalLimiter } = require('./middlewares/rateLimiter');
const { setupCronJobs } = require('./jobs/cron');
const { initializeSchema } = require('./database/schema');
const { runSeeds } = require('./database/seeds');

// Import Routes
const authRoutes = require('./routes/authRoutes');
const tontineRoutes = require('./routes/tontineRoutes');
const membreRoutes = require('./routes/membreRoutes');
const transactionRoutes = require('./routes/transactionRoutes');
const pretRoutes = require('./routes/pretRoutes');
const tourRoutes = require('./routes/tourRoutes');
const tirageRoutes = require('./routes/tirageRoutes');
const notificationRoutes = require('./routes/notificationRoutes');
const statsRoutes = require('./routes/statsRoutes');
const adminRoutes = require('./routes/adminRoutes');
const exportRoutes = require('./routes/exportRoutes');

// Init Database
(async () => {
  try {
    await initializeSchema();
    await runSeeds();
  } catch (err) {
    console.error("Database initialization failed:", err);
  }
})();

const app = express();

const UPLOADS_DIR = path.join(__dirname, '../uploads');
if (!fs.existsSync(UPLOADS_DIR)) fs.mkdirSync(UPLOADS_DIR, { recursive: true });

// Middlewares Globaux
app.use(helmet({ crossOriginResourcePolicy: { policy: 'cross-origin' } }));
app.use(cors());
app.use(express.json({ limit: '10mb' }));

app.use('/uploads', express.static(UPLOADS_DIR));
app.use(express.static(path.join(__dirname, 'tontine-front', 'dist')));
app.use('/api/', globalLimiter);
app.get('/api/health', (req, res) => res.json({ ok: true, status: 'up' }));

// Mount Routes
app.use('/api/auth', authRoutes);
app.use('/api', tontineRoutes);
app.use('/api/membres', membreRoutes);
app.use('/api/transactions', transactionRoutes);
app.use('/api/prets', pretRoutes);
app.use('/api/tours', tourRoutes);
app.use('/api', tirageRoutes);
app.use('/api/notifications', notificationRoutes);
app.use('/api/stats', statsRoutes);
app.use('/api/admin', adminRoutes);
app.use('/api/exports', exportRoutes);

// SPA Routing
if (!IS_TEST) {
  app.use((req, res) => {
    res.sendFile(path.join(__dirname, 'tontine-front', 'dist', 'index.html'));
  });
}

// Start Cron Jobs
setupCronJobs();

// Démarrer le serveur
if (require.main === module) {
  setTimeout(() => { // small delay to ensure DB init starts before listening
    app.listen(PORT, () => {
      console.log(`✅ Serveur démarré sur le port \${PORT}`);
    });
  }, 100);
}

module.exports = app;
