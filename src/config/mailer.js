const nodemailer = require('nodemailer');

const transporter = nodemailer.createTransport({
  host: process.env.SMTP_HOST || 'smtp.gmail.com',
  port: 587,
  secure: false,
  auth: {
    user: process.env.SMTP_USER || '',
    pass: process.env.SMTP_PASS || '',
  },
  tls: { rejectUnauthorized: false }
});

async function sendEmail(to, subject, html) {
  if (!process.env.SMTP_USER) return { skipped: true };
  return transporter.sendMail({ from: `"Tontine Nataal" <${process.env.SMTP_USER}>`, to, subject, html });
}

module.exports = { transporter, sendEmail };
