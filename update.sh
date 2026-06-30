#!/bin/bash
set -e

APP_DIR="/opt/smtp2telegram"
SERVICE_NAME="smtp2telegram"

if [ "$(id -u)" -ne 0 ]; then
  echo "This script must be run as root (sudo)."
  exit 1
fi

if [ ! -d "$APP_DIR" ]; then
  echo "Application not found at $APP_DIR. Run install.sh first."
  exit 1
fi

echo "=== SMTP to Telegram Updater ==="

echo "[1/3] Stopping service..."
systemctl stop "$SERVICE_NAME" || true

echo "[2/3] Copying updated files..."
SRC_DIR="$(dirname "$(realpath "$0")")"
cp -r "$SRC_DIR"/lib "$APP_DIR/"
cp -r "$SRC_DIR"/web "$APP_DIR/"
cp "$SRC_DIR"/server.js "$APP_DIR/"
cp "$SRC_DIR"/package.json "$APP_DIR/"
cp "$SRC_DIR"/.env.example "$APP_DIR/"

if [ ! -f "$APP_DIR/.env" ]; then
  cp "$APP_DIR/.env.example" "$APP_DIR/.env"
fi

cd "$APP_DIR"
npm install --production

echo "[3/3] Starting service..."
systemctl start "$SERVICE_NAME"

echo ""
echo "=== Update complete ==="
echo "  Status: systemctl status $SERVICE_NAME"
echo "  Logs:   journalctl -u $SERVICE_NAME -f"
echo ""
