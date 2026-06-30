#!/bin/bash
set -e

APP_DIR="/opt/smtp2telegram"
SERVICE_NAME="smtp2telegram"
SERVICE_USER="${SERVICE_USER:-nobody}"

if [ "$(id -u)" -ne 0 ]; then
  echo "This script must be run as root (sudo)."
  exit 1
fi

if [ ! -d "$APP_DIR" ]; then
  echo "Application not found at $APP_DIR. Run install.sh first."
  exit 1
fi

echo "=== SMTP to Telegram Updater ==="

echo "[1/5] Stopping service..."
systemctl stop "$SERVICE_NAME" || true

echo "[2/5] Copying updated files..."
SRC_DIR="$(dirname "$(realpath "$0")")"
rm -rf "$APP_DIR/lib" "$APP_DIR/web"
cp -r "$SRC_DIR/lib" "$APP_DIR/"
cp -r "$SRC_DIR/web" "$APP_DIR/"
cp "$SRC_DIR/server.js" "$APP_DIR/"
cp "$SRC_DIR/package.json" "$APP_DIR/"
cp "$SRC_DIR/.env.example" "$APP_DIR/"

if [ ! -f "$APP_DIR/.env" ]; then
  cp "$APP_DIR/.env.example" "$APP_DIR/.env"
fi

mkdir -p "$APP_DIR/data"
chown "$SERVICE_USER" "$APP_DIR/data"

cd "$APP_DIR"
npm install --production

echo "[3/5] Updating systemd service..."
cat > "/etc/systemd/system/${SERVICE_NAME}.service" << EOF
[Unit]
Description=SMTP to Telegram Forwarder
After=network.target

[Service]
Type=simple
User=$SERVICE_USER
WorkingDirectory=$APP_DIR
Environment=DATA_DIR=/var/lib/smtp2telegram
ExecStart=/usr/bin/node server.js
Restart=on-failure
RestartSec=1s
StandardOutput=journal
StandardError=journal
SyslogIdentifier=$SERVICE_NAME

AmbientCapabilities=CAP_NET_BIND_SERVICE
NoNewPrivileges=yes
ProtectSystem=strict
ProtectHome=yes
PrivateTmp=yes
StateDirectory=smtp2telegram

[Install]
WantedBy=multi-user.target
EOF

echo "[4/5] Reloading systemd..."
systemctl daemon-reload

echo "[5/5] Starting service..."
systemctl start "$SERVICE_NAME"

echo ""
echo "=== Update complete ==="
echo "  Status: systemctl status $SERVICE_NAME"
echo "  Logs:   journalctl -u $SERVICE_NAME -f"
echo ""
