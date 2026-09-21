#!/usr/bin/env bash
# FamFin API + Postgres — one-command server deploy (Ubuntu/Debian).
# Upload this whole folder to the server, then:  sudo bash deploy.sh
set -euo pipefail

# ── EDIT ME ────────────────────────────────────────────────────────────────
DB_PASSWORD="${DB_PASSWORD:-speedometer-dragon}";   # Postgres app user password
JWT_SECRET="${JWT_SECRET:-replace-with-a-long-random-string}"
OCR_SERVICE_URL="${OCR_SERVICE_URL:-}"              # optional OCR microservice
FAMFIN_DOMAIN="${FAMFIN_DOMAIN:-}"                  # e.g. api.example.com → enables HTTPS
# ───────────────────────────────────────────────────────────────────────────

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
DB_USER="famfin"
DB_NAME="famfin"

echo "==> Installing Postgres + Node 20"
sudo apt-get update -y
sudo apt-get install -y curl ca-certificates gnupg postgresql postgresql-contrib
curl -fsSL https://deb.nodesource.com/setup_20.x | sudo -E bash -
sudo apt-get install -y nodejs
sudo systemctl enable --now postgresql

echo "==> Creating DB role + database (idempotent)"
if ! sudo -u postgres psql -tAc "SELECT 1 FROM pg_roles WHERE rolname='$DB_USER'" | grep -q 1; then
  sudo -u postgres psql -c "CREATE ROLE $DB_USER LOGIN PASSWORD '$DB_PASSWORD'"
fi
sudo -u postgres psql -c "ALTER ROLE $DB_USER WITH LOGIN PASSWORD '$DB_PASSWORD'"
if ! sudo -u postgres psql -tAc "SELECT 1 FROM pg_database WHERE datname='$DB_NAME'" | grep -q 1; then
  sudo -u postgres createdb -O $DB_USER $DB_NAME
fi

echo "==> Loading master schema (app_users + households_registry)"
sudo -u postgres psql -v ON_ERROR_STOP=1 -d $DB_NAME -f "$SCRIPT_DIR/db/master-schema.sql"

echo "==> Writing api/.env"
cat > "$SCRIPT_DIR/api/.env" <<EOF
PORT=4000
MASTER_DATABASE_URL=postgresql://$DB_USER:$DB_PASSWORD@localhost:5432/$DB_NAME?sslmode=disable
JWT_SECRET=$JWT_SECRET
EOF
[ -n "$OCR_SERVICE_URL" ] && echo "OCR_SERVICE_URL=$OCR_SERVICE_URL" >> "$SCRIPT_DIR/api/.env"
chmod 600 "$SCRIPT_DIR/api/.env"

echo "==> Installing API dependencies"
cd "$SCRIPT_DIR/api"
npm ci --omit=dev

echo "==> Registering systemd service"
sudo tee /etc/systemd/system/famfin-api.service >/dev/null <<EOF
[Unit]
Description=Family Finance API
After=network.target postgresql.service

[Service]
WorkingDirectory=$SCRIPT_DIR/api
EnvironmentFile=$SCRIPT_DIR/api/.env
ExecStart=$(command -v node) src/server.js
Restart=always
RestartSec=3

[Install]
WantedBy=multi-user.target
EOF
sudo systemctl daemon-reload
sudo systemctl enable --now famfin-api

echo "==> API status"
sleep 2
systemctl --no-pager status famfin-api | head -n 5 || true
curl -s http://127.0.0.1:4000/health && echo

if [ -n "$FAMFIN_DOMAIN" ]; then
  echo "==> Installing Caddy for HTTPS ($FAMFIN_DOMAIN)"
  sudo apt-get install -y debian-keyring debian-archive-keyring apt-transport-https
  curl -1sLf 'https://dl.cloudsmith.io/public/caddy/stable/gpg.key' | sudo gpg --dearmor -o /usr/share/keyrings/caddy-stable-archive-keyring.gpg
  curl -1sLf 'https://dl.cloudsmith.io/public/caddy/stable/debian.deb.txt' | sudo tee /etc/apt/sources.list.d/caddy-stable.list >/dev/null
  sudo apt-get update -y
  sudo apt-get install -y caddy
  echo "$FAMFIN_DOMAIN {
  reverse_proxy 127.0.0.1:4000
}" | sudo tee /etc/caddy/Caddyfile >/dev/null
  sudo systemctl restart caddy
  echo "LIVE at: https://$FAMFIN_DOMAIN"
else
  echo "LIVE at: http://$(hostname -I | awk '{print $1}'):4000"
  echo "Set FAMFIN_DOMAIN=your.domain and rerun to add HTTPS."
fi