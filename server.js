require('dotenv').config();

const path = require('path');
const fs = require('fs');
const express = require('express');
const { initDatabase, getSetting, loadSettings } = require('./lib/database');
const { createSMTPServer } = require('./lib/smtp-server');
const { initAllBots, reloadSeverityKeywords } = require('./lib/telegram');
const apiRoutes = require('./web/routes/api');
const pageRoutes = require('./web/routes/pages');

initDatabase();
initAllBots();

function env(key, fallback) {
  return process.env[key] !== undefined && process.env[key] !== '' ? process.env[key] : (getSetting(key) || fallback);
}

function envBool(key) {
  const v = env(key, 'false');
  return v === 'true' || v === '1';
}

function envInt(key, fallback) {
  const v = env(key, String(fallback));
  const n = parseInt(v);
  return isNaN(n) ? fallback : n;
}

function parseAuthUsers(raw) {
  const users = [];
  if (raw) {
    for (const entry of raw.split(',')) {
      const [user, ...pass] = entry.trim().split(':');
      if (user && pass.length) {
        users.push({ user: user.trim(), pass: pass.join(':').trim() });
      }
    }
  }
  return users;
}

function buildSmtpConfig() {
  const authUsers = parseAuthUsers(env('SMTP_AUTH_USERS', ''));
  const tlsCert = process.env.SMTP_TLS_CERT || null;
  const tlsKey = process.env.SMTP_TLS_KEY || null;

  return {
    host: env('SMTP_HOST', '0.0.0.0'),
    secure: envBool('SMTP_SECURE'),
    tlsCert,
    tlsKey,
    authUsers,
    maxSize: envInt('SMTP_MAX_SIZE', 10485760),
    defaultBotId: env('DEFAULT_BOT_ID', null),
    defaultChatId: env('DEFAULT_CHAT_ID', null),
  };
}

let smtpServer = null;
let currentPort = null;

function startSmtp() {
  const config = buildSmtpConfig();
  currentPort = envInt('SMTP_PORT', 2525);
  const smtpHost = config.host;

  smtpServer = createSMTPServer(config);
  smtpServer.listen(currentPort, smtpHost, () => {
    const mode = config.secure ? 'SMTPS' : (config.tlsCert ? 'STARTTLS' : 'Plain');
    const auth = config.authUsers.length > 0 ? `with auth (${config.authUsers.length} users)` : 'no auth';
    console.log(`SMTP server listening on ${smtpHost}:${currentPort} (${mode}, ${auth})`);
  });
  return smtpServer;
}

function restartSmtp() {
  return new Promise((resolve, reject) => {
    if (smtpServer) {
      smtpServer.close(() => {
        try {
          reloadSeverityKeywords();
          startSmtp();
          resolve();
        } catch (err) {
          reject(err);
        }
      });
    } else {
      reloadSeverityKeywords();
      startSmtp();
      resolve();
    }
  });
}

const app = express();

app.use((req, res, next) => {
  const raw = req.headers.cookie || '';
  req.cookies = {};
  for (const part of raw.split(';')) {
    const eq = part.indexOf('=');
    if (eq > 0) {
      req.cookies[part.substring(0, eq).trim()] = decodeURIComponent(part.substring(eq + 1).trim());
    }
  }
  next();
});

app.use(express.json());
app.use(express.urlencoded({ extended: true }));

app.set('view engine', 'ejs');
app.set('views', path.join(__dirname, 'web', 'views'));
app.use(express.static(path.join(__dirname, 'web', 'public')));

app.set('restartSmtp', restartSmtp);

app.use('/api', apiRoutes);
app.use('/', pageRoutes);

const webPort = parseInt(process.env.WEB_PORT) || 3000;
const webHost = process.env.WEB_HOST || '127.0.0.1';

app.listen(webPort, webHost, () => {
  console.log(`Web UI running at http://${webHost}:${webPort}`);
});

startSmtp();

process.on('SIGTERM', () => {
  console.log('Shutting down...');
  if (smtpServer) smtpServer.close();
  process.exit(0);
});

process.on('SIGINT', () => {
  if (smtpServer) smtpServer.close();
  process.exit(0);
});
