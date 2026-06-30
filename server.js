require('dotenv').config();

const path = require('path');
const express = require('express');
const { initDatabase } = require('./lib/database');
const { createSMTPServer } = require('./lib/smtp-server');
const { initAllBots, reloadSeverityKeywords } = require('./lib/telegram');
const apiRoutes = require('./web/routes/api');
const pageRoutes = require('./web/routes/pages');

initDatabase();
initAllBots();

const app = express();
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

app.set('view engine', 'ejs');
app.set('views', path.join(__dirname, 'web', 'views'));
app.use(express.static(path.join(__dirname, 'web', 'public')));

app.use('/api', apiRoutes);
app.use('/', pageRoutes);

const webPort = parseInt(process.env.WEB_PORT) || 3000;
const webHost = process.env.WEB_HOST || '127.0.0.1';

app.listen(webPort, webHost, () => {
  console.log(`Web UI running at http://${webHost}:${webPort}`);
});

const smtpPort = parseInt(process.env.SMTP_PORT) || 2525;
const smtpHost = process.env.SMTP_HOST || '0.0.0.0';

const authUsers = [];
if (process.env.SMTP_AUTH_USERS) {
  for (const entry of process.env.SMTP_AUTH_USERS.split(',')) {
    const [user, ...pass] = entry.trim().split(':');
    if (user && pass.length) {
      authUsers.push({ user: user.trim(), pass: pass.join(':').trim() });
    }
  }
}

let tlsCert = null;
let tlsKey = null;
if (process.env.SMTP_TLS_CERT && process.env.SMTP_TLS_KEY) {
  const fs = require('fs');
  tlsCert = process.env.SMTP_TLS_CERT;
  tlsKey = process.env.SMTP_TLS_KEY;
}

const smtpConfig = {
  host: smtpHost,
  secure: process.env.SMTP_SECURE === 'true',
  tlsCert,
  tlsKey,
  authUsers,
  maxSize: parseInt(process.env.SMTP_MAX_SIZE) || 10485760,
  defaultBotId: process.env.DEFAULT_BOT_ID || null,
  defaultChatId: process.env.DEFAULT_CHAT_ID || null,
};

const smtpServer = createSMTPServer(smtpConfig);
smtpServer.listen(smtpPort, smtpHost, () => {
  const mode = smtpConfig.secure ? 'SMTPS' : (smtpConfig.tlsCert ? 'STARTTLS' : 'Plain');
  const auth = authUsers.length > 0 ? `with auth (${authUsers.length} users)` : 'no auth';
  console.log(`SMTP server listening on ${smtpHost}:${smtpPort} (${mode}, ${auth})`);
});

process.on('SIGTERM', () => {
  console.log('Shutting down...');
  smtpServer.close();
  process.exit(0);
});

process.on('SIGINT', () => {
  smtpServer.close();
  process.exit(0);
});
