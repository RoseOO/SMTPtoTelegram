#!/bin/bash
set -e

APP_DIR="/opt/smtp2telegram"
SERVICE_NAME="smtp2telegram"
SERVICE_USER="${SERVICE_USER:-nobody}"
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
SRC_DIR="$(dirname "$(realpath "$0")")"
shopt -s dotglob
for item in "$SRC_DIR"/*; do
  base="$(basename "$item")"
  [[ "$base" == "node_modules" ]] && continue
  [[ "$base" == "data" ]] && continue
  [[ "$base" == ".env" ]] && continue
  cp -r "$item" "$APP_DIR/"
done
shopt -u dotglob
mkdir -p "$APP_DIR/data"
chown -R root:root "$APP_DIR"
chown "$SERVICE_USER" "$APP_DIR/data"
chmod -R 755 "$APP_DIR"
chmod 755 "$APP_DIR/data"

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
User=$SERVICE_USER
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
echo "    1. Open the Web UI and add your Telegram bot tokens (Bots tab)"
echo "    2. Create routing rules (Rules tab)"
echo "    3. Edit $APP_DIR/.env for SMTP TLS/auth/wildcard settings (optional)"
echo "    4. Point your mail server/relay at this server on port 2525"
echo ""
