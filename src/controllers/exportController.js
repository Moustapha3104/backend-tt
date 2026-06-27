const db = require('../config/db');
const ExcelJS = require('exceljs');
const PDFDocument = require('pdfkit');

exports.exportExcel = async (req, res) => {
  const transactions = ((await db.query('SELECT * FROM transactions ORDER BY created_at DESC', []))[0]);
  const workbook = new ExcelJS.Workbook();
  const sheet = workbook.addWorksheet('Transactions');
  sheet.columns = [
    { header: 'ID', key: 'id', width: 8 },
    { header: 'Nom', key: 'name', width: 25 },
    { header: 'Type', key: 'type', width: 15 },
    { header: 'Montant (F)', key: 'amount', width: 18 },
    { header: 'Méthode', key: 'method', width: 15 },
    { header: 'Date', key: 'created_at', width: 22 },
  ];
  transactions.forEach(t => sheet.addRow(t));
  res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
  res.setHeader('Content-Disposition', 'attachment; filename=rapport-tontine.xlsx');
  await workbook.xlsx.write(res);
  res.end();
};

exports.exportPDF = async (req, res) => {
  const transactions = ((await db.query('SELECT * FROM transactions ORDER BY created_at DESC LIMIT 50', []))[0]);
  const doc = new PDFDocument({ margin: 40 });
  res.setHeader('Content-Type', 'application/pdf');
  res.setHeader('Content-Disposition', 'attachment; filename=rapport-tontine.pdf');
  doc.pipe(res);
  doc.fontSize(20).text('Rapport Tontine Nataal', { align: 'center' });
  doc.moveDown();
  doc.fontSize(12).text(`Généré le ${new Date().toLocaleDateString('fr-FR')}`);
  doc.moveDown();
  transactions.forEach(t => {
    doc.fontSize(10).text(`${t.name} | ${t.type} | ${t.amount.toLocaleString('fr-FR')} F | ${new Date(t.created_at).toLocaleDateString('fr-FR')}`);
  });
  doc.end();
};
