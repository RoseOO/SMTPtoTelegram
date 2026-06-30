const { Telegraf } = require('telegraf');
const { getEnabledBots, getBot } = require('./database');

const bots = new Map();

const MAX_TG_MSG = 4096;
const PREVIEW_LEN = 3800;

function escapeMarkdown(text) {
  if (!text) return '';
  return text
    .replace(/_/g, '\\_')
    .replace(/\*/g, '\\*')
    .replace(/\[/g, '\\[')
    .replace(/\]/g, '\\]')
    .replace(/\(/g, '\\(')
    .replace(/\)/g, '\\)')
    .replace(/~/g, '\\~')
    .replace(/`/g, '\\`')
    .replace(/>/g, '\\>')
    .replace(/#/g, '\\#')
    .replace(/\+/g, '\\+')
    .replace(/-/g, '\\-')
    .replace(/=/g, '\\=')
    .replace(/\|/g, '\\|')
    .replace(/\{/g, '\\{')
    .replace(/\}/g, '\\}')
    .replace(/\./g, '\\.')
    .replace(/!/g, '\\!');
}

const SEVERITY_ICONS = {
  CRITICAL: '🔴',
  HIGH: '🟠',
  MEDIUM: '🟡',
  LOW: '🟢',
};
const SEVERITY_ORDER = ['CRITICAL', 'HIGH', 'MEDIUM', 'LOW'];

function detectSeverity(text) {
  if (!text || !severityKeywords) return null;
  const lower = text.toLowerCase();
  for (const level of SEVERITY_ORDER) {
    const keywords = severityKeywords[level];
    if (keywords) {
      for (const kw of keywords) {
        if (lower.includes(kw.toLowerCase())) {
          return level;
        }
      }
    }
  }
  return null;
}

function loadSeverityKeywords() {
  const raw = process.env.SEVERITY_KEYWORDS;
  if (!raw) return null;
  const map = {};
  for (const segment of raw.split(';')) {
    const [level, ...rest] = segment.split(':');
    const keywords = rest.join(':').split(',').map(k => k.trim()).filter(Boolean);
    if (level && keywords.length) {
      map[level.trim().toUpperCase()] = keywords;
    }
  }
  return Object.keys(map).length > 0 ? map : null;
}

let severityKeywords = loadSeverityKeywords();

function reloadSeverityKeywords() {
  severityKeywords = loadSeverityKeywords();
}

function formatEmailMessage(parsed, severity) {
  const from = parsed.from?.text || 'Unknown';
  const to = parsed.to?.text || 'Unknown';
  const subject = parsed.subject || '(no subject)';
  const date = parsed.date ? new Date(parsed.date).toISOString() : 'Unknown';
  const textBody = parsed.text || '(no text content)';

  const sevPrefix = severity ? `${SEVERITY_ICONS[severity] || '⚪'} *${severity}* ` : '';
  const sevSubject = severity ? `[${severity}] ` : '';

  const combinedText = subject + '\n\n' + textBody;
  const detectedSev = detectSeverity(combinedText);
  const finalSeverity = detectedSev || severity;
  const finalSevPrefix = finalSeverity ? `${SEVERITY_ICONS[finalSeverity] || '⚪'} *${finalSeverity}* ` : '';

  const header = [
    `${finalSevPrefix}📧 *New Email*`,
    ``,
    `*From:* ${escapeMarkdown(from)}`,
    `*To:* ${escapeMarkdown(to)}`,
    `*Subject:* ${escapeMarkdown(subject)}`,
    `*Date:* ${escapeMarkdown(date)}`,
    parsed.messageId ? `*Message\\-ID:* \`${escapeMarkdown(parsed.messageId.substring(0, 60))}\`` : '',
  ].filter(Boolean).join('\n');

  const truncated = textBody.length > PREVIEW_LEN
    ? textBody.substring(0, PREVIEW_LEN) + '\n\n...(truncated)'
    : textBody;

  return header + '\n\n' + escapeMarkdown(truncated);
}

function initBot(botRecord) {
  if (bots.has(botRecord.id)) {
    bots.get(botRecord.id).stop();
  }

  try {
    const tg = new Telegraf(botRecord.token);
    bots.set(botRecord.id, { instance: tg, record: botRecord });
    return true;
  } catch (err) {
    console.error(`Failed to init bot ${botRecord.name}:`, err.message);
    return false;
  }
}

function initAllBots() {
  const enabled = getEnabledBots();
  for (const b of enabled) {
    initBot(b);
  }
  console.log(`Initialized ${bots.size} Telegram bot(s)`);
}

function initBotById(id) {
  const record = getBot(id);
  if (record) {
    return initBot(record);
  }
  return false;
}

function stopBot(id) {
  const entry = bots.get(id);
  if (entry) {
    try { entry.instance.stop(); } catch {}
    bots.delete(id);
  }
}

async function sendToTelegram(botId, chatId, parsedEmail, attachments, severity) {
  const entry = bots.get(botId);
  if (!entry) {
    throw new Error(`Bot ${botId} not initialized`);
  }

  const tg = entry.instance;
  const msgText = formatEmailMessage(parsedEmail, severity);

  if (msgText.length <= MAX_TG_MSG) {
    await tg.telegram.sendMessage(chatId, msgText, {
      parse_mode: 'MarkdownV2',
      disable_web_page_preview: true,
    });
  } else {
    const chunks = msgText.match(new RegExp(`.{1,${MAX_TG_MSG}}`, 'gs')) || [];
    for (const chunk of chunks) {
      await tg.telegram.sendMessage(chatId, chunk, {
        parse_mode: 'MarkdownV2',
        disable_web_page_preview: true,
      });
    }
  }

  if (attachments && attachments.length > 0) {
    for (const att of attachments) {
      try {
        const filename = att.filename || 'attachment.bin';
        const buffer = att.content;
        if (buffer instanceof Buffer && buffer.length > 0) {
          const mimeType = att.contentType || 'application/octet-stream';
          if (mimeType.startsWith('image/') || filename.match(/\.(jpg|jpeg|png|gif|webp)$/i)) {
            await tg.telegram.sendPhoto(chatId, { source: buffer }, { caption: escapeMarkdown(filename).substring(0, 200) });
          } else if (mimeType.startsWith('audio/') || filename.match(/\.(mp3|ogg|wav|m4a)$/i)) {
            await tg.telegram.sendAudio(chatId, { source: buffer, filename });
          } else if (mimeType.startsWith('video/') || filename.match(/\.(mp4|mov|avi)$/i)) {
            await tg.telegram.sendVideo(chatId, { source: buffer, filename });
          } else {
            await tg.telegram.sendDocument(chatId, { source: buffer, filename });
          }
        }
      } catch (attErr) {
        console.error(`Failed to send attachment ${att.filename}:`, attErr.message);
      }
    }
  }
}

module.exports = { initAllBots, initBotById, stopBot, sendToTelegram, detectSeverity, reloadSeverityKeywords };
