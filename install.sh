#!/bin/bash
set -e

APP_DIR="/opt/smtp2telegram"
SERVICE_NAME="smtp2telegram"
NODE_VERSION="22"

echo "=== SMTP to Telegram Installer ==="
echo ""

if [ "$(id -u)" -ne 0 ]; then
  echo "This script must be run as root (sudo)."
  exit 1
fi

echo "[1/5] Installing Node.js $NODE_VERSION..."
if ! command -v node &>/dev/null; then
  curl -fsSL https://deb.nodesource.com/setup_${NODE_VERSION}.x | bash -
  apt-get install -y nodejs
else
  echo "  Node.js already installed: $(node -v)"
fi

echo "[2/5] Creating application directory..."
mkdir -p "$APP_DIR"
cp -r "$(dirname "$0")"/* "$APP_DIR/" 2>/dev/null || true
chown -R root:root "$APP_DIR"
chmod -R 755 "$APP_DIR"

echo "[3/5] Installing dependencies..."
cd "$APP_DIR"
npm install --production

if [ ! -f "$APP_DIR/.env" ]; then
  echo "[*] Creating .env from .env.example..."
  cp "$APP_DIR/.env.example" "$APP_DIR/.env"
  echo "  --> Edit $APP_DIR/.env to configure the application"
fi

echo "[4/5] Creating systemd service..."
cat > "/etc/systemd/system/${SERVICE_NAME}.service" << EOF
[Unit]
Description=SMTP to Telegram Forwarder
After=network.target

[Service]
Type=simple
User=nobody
WorkingDirectory=$APP_DIR
ExecStart=/usr/bin/node server.js
Restart=on-failure
RestartSec=1s
StandardOutput=journal
StandardError=journal
SyslogIdentifier=$SERVICE_NAME

# Security hardening
NoNewPrivileges=yes
ProtectSystem=strict
ProtectHome=yes
ReadWritePaths=$APP_DIR/data
ReadOnlyPaths=$APP_DIR
PrivateTmp=yes

[Install]
WantedBy=multi-user.target
EOF

echo "[5/5] Enabling and starting service..."
systemctl daemon-reload
systemctl enable "$SERVICE_NAME"
systemctl start "$SERVICE_NAME"

echo ""
echo "=== Installation complete ==="
echo ""
echo "  Service:  systemctl status $SERVICE_NAME"
echo "  Web UI:   http://$(hostname -I | awk '{print $1}'):3000"
echo "  Config:   $APP_DIR/.env"
echo "  Logs:     journalctl -u $SERVICE_NAME -f"
echo ""
echo "  Next steps:"
echo "    1. Edit $APP_DIR/.env to set your Telegram bot tokens"
echo "    2. Open the Web UI and add bots + rules"
echo "    3. Point your mail server/relay at this server on port 2525"
echo ""
