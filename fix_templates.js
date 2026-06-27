const fs = require('fs');

const files = [
  'src/controllers/adminController.js',
  'src/controllers/authController.js',
  'src/controllers/exportController.js',
  'src/controllers/membreController.js',
  'src/controllers/notificationController.js',
  'src/controllers/pretController.js',
  'src/controllers/statsController.js',
  'src/controllers/tirageController.js',
  'src/controllers/tontineController.js',
  'src/controllers/tourController.js',
  'src/controllers/transactionController.js',
  'src/database/schema.js',
  'src/database/seeds.js',
  'src/jobs/cron.js'
];

files.forEach(f => {
  if (!fs.existsSync(f)) return;
  let c = fs.readFileSync(f, 'utf8');
  c = c.replace(/\\\${/g, '${');
  fs.writeFileSync(f, c);
});
console.log('Fixed templates');
