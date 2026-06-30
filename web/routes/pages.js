const express = require('express');
const path = require('path');
const router = express.Router();

function adminAuth(req, res, next) {
  const pw = process.env.ADMIN_PASSWORD;
  if (!pw) return next();
  if (req.query.password === pw) return next();
  if (req.headers['x-admin-password'] === pw) return next();
  res.set('WWW-Authenticate', 'Basic realm="SMTP2TG"');
  return res.status(401).send('Unauthorized. Append ?password=YOUR_PASSWORD to the URL.');
}

router.use(adminAuth);

router.get('/', (req, res) => {
  res.render('index');
});

router.get('/bots', (req, res) => {
  res.render('bots');
});

router.get('/rules', (req, res) => {
  res.render('rules');
});

router.get('/logs', (req, res) => {
  res.render('logs');
});

router.get('/settings', (req, res) => {
  res.render('settings', {
    smtpPort: process.env.SMTP_PORT || 2525,
    smtpSecure: process.env.SMTP_SECURE === 'true',
    smtpAuth: !!process.env.SMTP_AUTH_USERS,
    defaultBotId: process.env.DEFAULT_BOT_ID || '',
    defaultChatId: process.env.DEFAULT_CHAT_ID || '',
    severityKeywords: process.env.SEVERITY_KEYWORDS || '',
  });
});

module.exports = router;
