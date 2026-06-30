const express = require('express');
const crypto = require('crypto');
const path = require('path');
const { loadSettings } = require('../../lib/database');
const router = express.Router();

function getEnv(key, fallback) {
  const v = process.env[key];
  if (v !== undefined && v !== '') return v;
  return fallback;
}

const COOKIE_NAME = 'smtp2tg_session';
const COOKIE_MAX_AGE = 24 * 60 * 60 * 1000;

function createToken(password) {
  const salt = crypto.randomBytes(16).toString('hex');
  const hash = crypto.createHmac('sha256', password).update(salt).digest('hex');
  return `${salt}.${hash}`;
}

function verifyToken(token, password) {
  if (!token || !password) return false;
  const [salt, hash] = token.split('.');
  if (!salt || !hash) return false;
  const expected = crypto.createHmac('sha256', password).update(salt).digest('hex');
  try {
    return crypto.timingSafeEqual(Buffer.from(hash), Buffer.from(expected));
  } catch {
    return false;
  }
}

function adminAuth(req, res, next) {
  const pw = process.env.ADMIN_PASSWORD;
  if (!pw) return next();
  const token = req.cookies?.[COOKIE_NAME];
  if (token && verifyToken(token, pw)) return next();
  if (req.path === '/login') return next();
  return res.redirect('/login');
}

router.use(adminAuth);

router.get('/login', (req, res) => {
  if (!process.env.ADMIN_PASSWORD) return res.redirect('/');
  const token = req.cookies?.[COOKIE_NAME];
  if (token && verifyToken(token, process.env.ADMIN_PASSWORD)) return res.redirect('/');
  const error = req.query.error;
  res.render('login', { error });
});

router.post('/login', (req, res) => {
  if (!process.env.ADMIN_PASSWORD) return res.redirect('/');
  if (req.body.password === process.env.ADMIN_PASSWORD) {
    const token = createToken(process.env.ADMIN_PASSWORD);
    res.cookie(COOKIE_NAME, token, { httpOnly: true, maxAge: COOKIE_MAX_AGE, sameSite: 'strict' });
    return res.redirect('/');
  }
  res.redirect('/login?error=1');
});

router.get('/logout', (req, res) => {
  res.clearCookie(COOKIE_NAME);
  res.redirect('/login');
});

router.get('/', (req, res) => res.render('index'));
router.get('/bots', (req, res) => res.render('bots'));
router.get('/rules', (req, res) => res.render('rules'));
router.get('/logs', (req, res) => res.render('logs'));

router.get('/settings', (req, res) => {
  const rows = loadSettings();
  const db = {};
  for (const row of rows) db[row.key] = row.value;

  res.render('settings', {
    smtpPort: db.SMTP_PORT || getEnv('SMTP_PORT', '2525'),
    smtpSecure: db.SMTP_SECURE || getEnv('SMTP_SECURE', 'false'),
    smtpAuth: db.SMTP_AUTH_USERS || getEnv('SMTP_AUTH_USERS', ''),
    smtpMaxSize: db.SMTP_MAX_SIZE || getEnv('SMTP_MAX_SIZE', '10485760'),
    defaultBotId: db.DEFAULT_BOT_ID || getEnv('DEFAULT_BOT_ID', ''),
    defaultChatId: db.DEFAULT_CHAT_ID || getEnv('DEFAULT_CHAT_ID', ''),
    severityKeywords: db.SEVERITY_KEYWORDS || getEnv('SEVERITY_KEYWORDS', ''),
  });
});

module.exports = router;
