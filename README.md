# SMTP to Telegram

Forwards incoming emails to Telegram users/channels based on configurable routing rules. Built with Node.js.

## Quick Start

```bash
npm install
cp .env.example .env
# Edit .env with your settings (optional, defaults work for local testing)
npm start
```

- Web UI: http://127.0.0.1:3000
- SMTP server: port 2525 (configurable in .env)

## Setup Guide

### 1. Create a Telegram Bot

1. Open Telegram and chat with [@BotFather](https://t.me/BotFather)
2. Send `/newbot` and follow the prompts to create a bot
3. Copy the bot token (looks like `123456789:ABCdefGHIJK...`)

### 2. Find Your Chat ID

1. Send any message to your new bot on Telegram
2. Visit in your browser: `https://api.telegram.org/bot<YOUR_TOKEN>/getUpdates`
3. Look for `"chat":{"id":123456789}` — that number is your chat ID
4. For groups, it's a negative number like `-1001234567890`

### 3. Configure the Application

Open the Web UI at http://127.0.0.1:3000:

1. **Bots tab** — Add your bot token (name it whatever you like)
2. **Rules tab** — Create a routing rule:
   - Select the bot
   - Enter the chat ID
   - Set a sender pattern (e.g., `*` for all email, `*@yourdomain.com` for a domain)
3. **Settings tab** — Read the full configuration reference

### 4. Send a Test Email

Point any email client or script at your server:

```bash
# Using swaks (https://jetmore.org/john/code/swaks/)
swaks --to test@localhost --from sender@example.com --server 127.0.0.1:2525 --body "Hello from SMTP2TG"
```

If everything is configured correctly, the email appears in your Telegram chat.

## Configuration Reference (.env)

| Variable | Default | Description |
|----------|---------|-------------|
| `WEB_PORT` | 3000 | Web UI port |
| `WEB_HOST` | 127.0.0.1 | Web UI bind address |
| `ADMIN_PASSWORD` | (none) | Optional password for web UI access |
| `SMTP_PORT` | 2525 | SMTP server port |
| `SMTP_HOST` | 0.0.0.0 | SMTP bind address |
| `SMTP_SECURE` | false | Use SMTPS (TLS on connect, port 465 style) |
| `SMTP_TLS_CERT` | (none) | Path to TLS certificate PEM file |
| `SMTP_TLS_KEY` | (none) | Path to TLS private key PEM file |
| `SMTP_AUTH_USERS` | (none) | Comma-separated `user:pass` pairs for SMTP auth |
| `SMTP_MAX_SIZE` | 10485760 | Max email size in bytes (10MB) |
| `DEFAULT_BOT_ID` | (none) | Bot ID for wildcard catch-all forwarding |
| `DEFAULT_CHAT_ID` | (none) | Chat ID for wildcard catch-all forwarding |
| `SEVERITY_KEYWORDS` | (none) | Semicolon-separated severity:keyword groups |

### SMTP Modes

- **Plain SMTP** (default): No TLS, no auth. Set `SMTP_PORT=25` for standard. Only use on localhost or trusted networks.
- **STARTTLS**: Set `SMTP_TLS_CERT` and `SMTP_TLS_KEY` with `SMTP_SECURE=false`. Offers opportunistic TLS on port 587.
- **SMTPS**: Set `SMTP_SECURE=true` with cert and key. TLS required on connect (port 465 style).
- **With Auth**: Add `SMTP_AUTH_USERS=user1:pass1,user2:pass2`. Supports PLAIN and LOGIN auth.

## Wildcard Default Route

Set `DEFAULT_BOT_ID` and `DEFAULT_CHAT_ID` in `.env` to forward all emails that don't match any explicit rule to a fallback chat. This acts as a catch-all — no rules needed. If both are set and a matching rule also exists, the email still goes to the rule destination (the wildcard only fires when zero rules match).

## Keyword Severity Detection

The server scans incoming email subjects and bodies for severity keywords and tags forwarded messages with visual indicators:

- 🔴 **CRITICAL** — breach, compromised, exploit, ransomware
- 🟠 **HIGH** — urgent, critical, alert, asap, immediate, incident
- 🟡 **MEDIUM** — warning, attention, notice
- 🟢 **LOW** — info, fyi, newsletter

Fully configurable via `SEVERITY_KEYWORDS` in `.env`. The highest-severity match wins and appears in the Telegram message header.

## Rule Pattern Matching

Rules use glob-style patterns matching against the sender's email address:

| Pattern | Matches |
|---------|---------|
| `*` | All senders (catch-all) |
| `*@example.com` | Anyone at example.com |
| `user@example.com` | Exact email match |
| `noreply@*` | noreply at any domain |

Matching is case-insensitive. All enabled matching rules fire, so a single email can be forwarded to multiple chats.

## Debian/Ubuntu Deployment

### Automated Install

```bash
sudo bash install.sh
```

This installs Node.js, copies the app to `/opt/smtp2telegram`, installs dependencies, creates a systemd service, and starts it.

### Updating

```bash
sudo bash update.sh
```

Copies updated files, reinstalls deps, and restarts the service.

### Manual Systemd Service

```ini
[Unit]
Description=SMTP to Telegram
After=network.target

[Service]
Type=simple
User=nobody
WorkingDirectory=/opt/smtp2telegram
ExecStart=/usr/bin/node server.js
Restart=on-failure

[Install]
WantedBy=multi-user.target
```

## Security Notes

- The web UI has no authentication by default. Set `ADMIN_PASSWORD` in `.env` if exposing it beyond localhost.
- When running without SMTP auth, bind to `127.0.0.1` only (`SMTP_HOST=127.0.0.1`) to prevent open relay abuse.
- Bot tokens are stored in the SQLite database. Restrict file access to the `data/` directory.
- Email content passes through your server — run it on infrastructure you control.
