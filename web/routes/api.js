const express = require('express');
const { v4: uuidv4 } = require('uuid');
const router = express.Router();

const {
  getBots, createBot, updateBot, deleteBot,
  getRules, createRule, updateRule, deleteRule,
  getLogs, getLogCount, clearLogs,
} = require('../../lib/database');

const { initBotById, stopBot, reloadSeverityKeywords } = require('../../lib/telegram');

function adminAuth(req, res, next) {
  const pw = process.env.ADMIN_PASSWORD;
  if (!pw) return next();
  const auth = req.headers['x-admin-password'] || req.query.password || '';
  if (auth === pw) return next();
  return res.status(401).json({ error: 'Unauthorized' });
}

router.use(adminAuth);

// --- Bots ---

router.get('/bots', (req, res) => {
  res.json(getBots());
});

router.post('/bots', (req, res) => {
  const { name, token, enabled } = req.body;
  if (!name || !token) {
    return res.status(400).json({ error: 'Name and token are required' });
  }
  const id = uuidv4();
  const bot = { id, name, token, enabled: enabled !== false };
  createBot(bot);
  if (bot.enabled) initBotById(id);
  res.json(bot);
});

router.put('/bots/:id', (req, res) => {
  const { id } = req.params;
  const { name, token, enabled } = req.body;
  const updates = {};
  if (name !== undefined) updates.name = name;
  if (token !== undefined) updates.token = token;
  if (enabled !== undefined) updates.enabled = enabled;

  if (Object.keys(updates).length === 0) {
    return res.status(400).json({ error: 'No fields to update' });
  }

  updateBot(id, updates);

  if (updates.enabled === false) {
    stopBot(id);
  } else if (updates.enabled === true || updates.token !== undefined) {
    stopBot(id);
    initBotById(id);
  }

  res.json({ success: true });
});

router.delete('/bots/:id', (req, res) => {
  stopBot(req.params.id);
  deleteBot(req.params.id);
  res.json({ success: true });
});

// --- Rules ---

router.get('/rules', (req, res) => {
  res.json(getRules());
});

router.post('/rules', (req, res) => {
  const { name, bot_id, chat_id, sender_pattern, subject_pattern, enabled } = req.body;
  if (!bot_id || !chat_id) {
    return res.status(400).json({ error: 'bot_id and chat_id are required' });
  }
  const id = uuidv4();
  const rule = {
    id, name: name || '', bot_id, chat_id,
    sender_pattern: sender_pattern || '*',
    subject_pattern: subject_pattern || null,
    enabled: enabled !== false,
  };
  createRule(rule);
  res.json(rule);
});

router.put('/rules/:id', (req, res) => {
  const { id } = req.params;
  const { name, bot_id, chat_id, sender_pattern, subject_pattern, enabled } = req.body;
  const updates = {};
  if (name !== undefined) updates.name = name;
  if (bot_id !== undefined) updates.bot_id = bot_id;
  if (chat_id !== undefined) updates.chat_id = chat_id;
  if (sender_pattern !== undefined) updates.sender_pattern = sender_pattern;
  if (subject_pattern !== undefined) updates.subject_pattern = subject_pattern;
  if (enabled !== undefined) updates.enabled = enabled;

  if (Object.keys(updates).length === 0) {
    return res.status(400).json({ error: 'No fields to update' });
  }

  updateRule(id, updates);
  res.json({ success: true });
});

router.delete('/rules/:id', (req, res) => {
  deleteRule(req.params.id);
  res.json({ success: true });
});

// --- Logs ---

router.get('/logs', (req, res) => {
  const limit = parseInt(req.query.limit) || 100;
  const offset = parseInt(req.query.offset) || 0;
  res.json({
    logs: getLogs(limit, offset),
    total: getLogCount(),
  });
});

router.delete('/logs', (req, res) => {
  clearLogs();
  res.json({ success: true });
});

router.get('/config', (req, res) => {
  res.json({
    smtpPort: process.env.SMTP_PORT || 2525,
    smtpSecure: process.env.SMTP_SECURE === 'true',
    smtpAuth: !!process.env.SMTP_AUTH_USERS,
    defaultBotId: process.env.DEFAULT_BOT_ID || '',
    defaultChatId: process.env.DEFAULT_CHAT_ID || '',
    severityKeywords: process.env.SEVERITY_KEYWORDS || '',
  });
});

router.post('/config/reload-severity', (req, res) => {
  reloadSeverityKeywords();
  res.json({ success: true });
});

module.exports = router;
