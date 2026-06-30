const { SMTPServer } = require('smtp-server');
const { simpleParser } = require('mailparser');
const fs = require('fs');
const { findMatchingRules } = require('./rules-engine');
const { sendToTelegram, detectSeverity } = require('./telegram');
const { addLog } = require('./database');

function createSMTPServer(config) {
  const serverOptions = {
    authOptional: true,
    allowInsecureAuth: false,
    disabledCommands: [],
    maxMessageSize: config.maxSize || 10485760,
    onConnect(session, callback) {
      console.log(`SMTP connection from ${session.remoteAddress}`);
      return callback();
    },
    onAuth(auth, session, callback) {
      if (!config.authUsers || config.authUsers.length === 0) {
        return callback(null, { user: 'anonymous' });
      }
      const match = config.authUsers.find(
        (u) => u.user === auth.username && u.pass === auth.password
      );
      if (match) {
        return callback(null, { user: auth.username });
      }
      return callback(new Error('Invalid credentials'));
    },
    onMailFrom(address, session, callback) {
      return callback();
    },
    onRcptTo(address, session, callback) {
      return callback();
    },
    onData(stream, session, callback) {
      const chunks = [];
      stream.on('data', (chunk) => chunks.push(chunk));
      stream.on('end', async () => {
        const raw = Buffer.concat(chunks);
        let parsed;
        try {
          parsed = await simpleParser(raw);
        } catch (err) {
          console.error('Failed to parse email:', err.message);
          addLog({
            sender: session.envelope.mailFrom?.address || '',
            recipient: session.envelope.rcptTo?.map(r => r.address).join(', ') || '',
            subject: '(parse error)',
            status: 'failed',
            error: err.message,
          });
          return callback(new Error('Failed to parse email'));
        }

        const sender = parsed.from?.value?.[0]?.address || session.envelope.mailFrom?.address || '';
        const recipient = session.envelope.rcptTo?.map(r => r.address).join(', ') || '';
        const subject = parsed.subject || '(no subject)';

        const combinedText = parsed.subject + '\n\n' + (parsed.text || '');
        const severity = detectSeverity(combinedText);

        const attachments = (parsed.attachments || []).map(att => ({
          filename: att.filename || 'attachment.bin',
          content: att.content,
          contentType: att.contentType,
        }));

        const bodyText = parsed.text || '';
        const attachmentMeta = attachments.map(a => ({ name: a.filename, type: a.contentType, size: a.content?.length || 0 }));

        const logBase = { sender, recipient, subject, body: bodyText, attachments: attachmentMeta };

        const rules = findMatchingRules(sender);
        const forwarded = new Set();

        for (const rule of rules) {
          const key = `${rule.bot_id}:${rule.chat_id}`;
          if (forwarded.has(key)) continue;
          forwarded.add(key);
          try {
            await sendToTelegram(rule.bot_id, rule.chat_id, parsed, attachments, severity);
            console.log(`Forwarded email from ${sender} to chat ${rule.chat_id} via bot ${rule.bot_name}`);
            addLog({ ...logBase, bot_id: rule.bot_id, chat_id: rule.chat_id, rule_id: rule.id, status: 'delivered' });
          } catch (err) {
            console.error(`Failed to forward to chat ${rule.chat_id}:`, err.message);
            addLog({ ...logBase, bot_id: rule.bot_id, chat_id: rule.chat_id, rule_id: rule.id, status: 'failed', error: err.message });
          }
        }

        if (forwarded.size === 0 && config.defaultBotId && config.defaultChatId) {
          const key = `${config.defaultBotId}:${config.defaultChatId}`;
          if (!forwarded.has(key)) {
            try {
              await sendToTelegram(config.defaultBotId, config.defaultChatId, parsed, attachments, severity);
              console.log(`Forwarded (wildcard) email from ${sender} to chat ${config.defaultChatId}`);
              addLog({ ...logBase, bot_id: config.defaultBotId, chat_id: config.defaultChatId, rule_id: null, status: 'delivered_wildcard' });
            } catch (err) {
              console.error(`Wildcard forward failed:`, err.message);
              addLog({ ...logBase, bot_id: config.defaultBotId, chat_id: config.defaultChatId, rule_id: null, status: 'failed', error: err.message });
            }
          }
        }

        if (forwarded.size === 0) {
          console.log(`No matching rule or wildcard for sender: ${sender}`);
          addLog({ ...logBase, status: 'no_rule' });
        }

        return callback();
      });
      stream.on('error', (err) => {
        console.error('SMTP stream error:', err.message);
        return callback(err);
      });
    },
  };

  if (config.host) serverOptions.hostname = config.host;

  if (config.secure) {
    if (config.tlsCert && config.tlsKey) {
      serverOptions.secure = true;
      serverOptions.key = fs.readFileSync(config.tlsKey);
      serverOptions.cert = fs.readFileSync(config.tlsCert);
    } else if (config.tlsCert && config.tlsKey) {
      serverOptions.secure = false;
      serverOptions.key = fs.readFileSync(config.tlsKey);
      serverOptions.cert = fs.readFileSync(config.tlsCert);
    }
  } else if (config.tlsCert && config.tlsKey) {
    serverOptions.key = fs.readFileSync(config.tlsKey);
    serverOptions.cert = fs.readFileSync(config.tlsCert);
  }

  const server = new SMTPServer(serverOptions);

  server.on('error', (err) => {
    console.error('SMTP server error:', err.message);
  });

  return server;
}

module.exports = { createSMTPServer };
