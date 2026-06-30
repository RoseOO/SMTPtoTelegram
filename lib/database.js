const Database = require('better-sqlite3');
const path = require('path');
const fs = require('fs');

const DATA_DIR = path.join(__dirname, '..', 'data');
const DB_PATH = path.join(DATA_DIR, 'smtp2tg.db');

let db;

function initDatabase() {
  if (!fs.existsSync(DATA_DIR)) {
    fs.mkdirSync(DATA_DIR, { recursive: true });
  }

  db = new Database(DB_PATH);
  db.pragma('journal_mode = WAL');
  db.pragma('foreign_keys = ON');

  db.exec(`
    CREATE TABLE IF NOT EXISTS bots (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      token TEXT NOT NULL,
      enabled INTEGER NOT NULL DEFAULT 1,
      created_at TEXT NOT NULL DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS rules (
      id TEXT PRIMARY KEY,
      name TEXT,
      bot_id TEXT NOT NULL,
      chat_id TEXT NOT NULL,
      sender_pattern TEXT,
      subject_pattern TEXT,
      enabled INTEGER NOT NULL DEFAULT 1,
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      FOREIGN KEY (bot_id) REFERENCES bots(id) ON DELETE CASCADE
    );

    CREATE TABLE IF NOT EXISTS logs (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      timestamp TEXT NOT NULL DEFAULT (datetime('now')),
      sender TEXT,
      recipient TEXT,
      subject TEXT,
      bot_id TEXT,
      chat_id TEXT,
      rule_id TEXT,
      status TEXT NOT NULL,
      error TEXT
    );

    CREATE INDEX IF NOT EXISTS idx_logs_timestamp ON logs(timestamp DESC);
    CREATE INDEX IF NOT EXISTS idx_rules_bot_id ON rules(bot_id);
  `);

  return db;
}

function getDb() {
  if (!db) throw new Error('Database not initialized');
  return db;
}

function getBots() {
  return getDb().prepare('SELECT * FROM bots ORDER BY created_at DESC').all();
}

function getBot(id) {
  return getDb().prepare('SELECT * FROM bots WHERE id = ?').get(id);
}

function getEnabledBots() {
  return getDb().prepare('SELECT * FROM bots WHERE enabled = 1').all();
}

function createBot(bot) {
  const stmt = getDb().prepare(
    'INSERT INTO bots (id, name, token, enabled) VALUES (?, ?, ?, ?)'
  );
  stmt.run(bot.id, bot.name, bot.token, bot.enabled ? 1 : 0);
  return bot;
}

function updateBot(id, updates) {
  const fields = [];
  const values = [];
  for (const [key, value] of Object.entries(updates)) {
    fields.push(`${key} = ?`);
    values.push(key === 'enabled' ? (value ? 1 : 0) : value);
  }
  values.push(id);
  getDb().prepare(`UPDATE bots SET ${fields.join(', ')} WHERE id = ?`).run(...values);
}

function deleteBot(id) {
  getDb().prepare('DELETE FROM bots WHERE id = ?').run(id);
}

function getRules() {
  return getDb().prepare(`
    SELECT r.*, b.name as bot_name
    FROM rules r
    LEFT JOIN bots b ON r.bot_id = b.id
    ORDER BY r.created_at DESC
  `).all();
}

function getEnabledRules() {
  return getDb().prepare(`
    SELECT r.*, b.name as bot_name, b.token as bot_token
    FROM rules r
    JOIN bots b ON r.bot_id = b.id
    WHERE r.enabled = 1 AND b.enabled = 1
    ORDER BY r.created_at DESC
  `).all();
}

function createRule(rule) {
  const stmt = getDb().prepare(
    'INSERT INTO rules (id, name, bot_id, chat_id, sender_pattern, subject_pattern, enabled) VALUES (?, ?, ?, ?, ?, ?, ?)'
  );
  stmt.run(rule.id, rule.name || null, rule.bot_id, rule.chat_id,
    rule.sender_pattern || null, rule.subject_pattern || null, rule.enabled ? 1 : 0);
  return rule;
}

function updateRule(id, updates) {
  const fields = [];
  const values = [];
  for (const [key, value] of Object.entries(updates)) {
    fields.push(`${key} = ?`);
    values.push(key === 'enabled' ? (value ? 1 : 0) : value);
  }
  values.push(id);
  getDb().prepare(`UPDATE rules SET ${fields.join(', ')} WHERE id = ?`).run(...values);
}

function deleteRule(id) {
  getDb().prepare('DELETE FROM rules WHERE id = ?').run(id);
}

function addLog(entry) {
  const stmt = getDb().prepare(
    'INSERT INTO logs (sender, recipient, subject, bot_id, chat_id, rule_id, status, error) VALUES (?, ?, ?, ?, ?, ?, ?, ?)'
  );
  stmt.run(entry.sender || null, entry.recipient || null, entry.subject || null,
    entry.bot_id || null, entry.chat_id || null, entry.rule_id || null,
    entry.status, entry.error || null);
}

function getLogs(limit = 100, offset = 0) {
  return getDb().prepare(
    'SELECT * FROM logs ORDER BY timestamp DESC LIMIT ? OFFSET ?'
  ).all(limit, offset);
}

function getLogCount() {
  return getDb().prepare('SELECT COUNT(*) as count FROM logs').get().count;
}

function clearLogs() {
  getDb().prepare('DELETE FROM logs').run();
}

module.exports = {
  initDatabase,
  getDb,
  getBots,
  getBot,
  getEnabledBots,
  createBot,
  updateBot,
  deleteBot,
  getRules,
  getEnabledRules,
  createRule,
  updateRule,
  deleteRule,
  addLog,
  getLogs,
  getLogCount,
  clearLogs,
};
