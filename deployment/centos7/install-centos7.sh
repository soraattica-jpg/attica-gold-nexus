#!/usr/bin/env bash
set -euo pipefail

BUNDLE_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
API_SRC="${BUNDLE_DIR}/attica-api"
FRONTEND_SRC="${BUNDLE_DIR}/frontend-dist"
SCHEMA_SRC="${BUNDLE_DIR}/schema/asterisk-schema.sql"
ASTERISK_SRC="${BUNDLE_DIR}/asterisk-config"

API_DST="${API_DST:-/opt/attica-api}"
WEB_DST="${WEB_DST:-/var/www/html}"
ENV_DST="${ENV_DST:-/etc/attica/attica-api.env}"
HTTPD_CONF_DST="${HTTPD_CONF_DST:-/etc/httpd/conf.d/attica-gold.conf}"
SERVICE_DST="${SERVICE_DST:-/etc/systemd/system/attica-api.service}"

backup_file() {
  local file="$1"
  if [[ -e "$file" ]]; then
    cp -a "$file" "${file}.bak-$(date +%Y%m%d%H%M%S)"
  fi
}

require_root() {
  if [[ "${EUID}" -ne 0 ]]; then
    echo "Run as root or with sudo." >&2
    exit 1
  fi
}

check_command() {
  local cmd="$1"
  if ! command -v "$cmd" >/dev/null 2>&1; then
    echo "Missing command: $cmd" >&2
    return 1
  fi
}

require_root

if [[ -f /etc/centos-release ]]; then
  echo "Detected: $(cat /etc/centos-release)"
else
  echo "Warning: /etc/centos-release not found. This installer is written for CentOS 7." >&2
fi

check_command node || {
  echo "Install Node.js 18+ before continuing." >&2
  exit 1
}
check_command npm || true
check_command systemctl || true
if ! command -v php >/dev/null 2>&1; then
  echo "Warning: PHP is not installed. WATI webhook PHP endpoints will not run until PHP with curl/mysqli is installed." >&2
fi

NODE_MAJOR="$(node -p "Number(process.versions.node.split('.')[0])")"
if [[ "${NODE_MAJOR}" -lt 18 ]]; then
  echo "Node.js 18+ is required. Current: $(node -v)" >&2
  exit 1
fi

mkdir -p /etc/attica "$API_DST" "$WEB_DST"

echo "Installing frontend to ${WEB_DST}"
rsync -a --delete "${FRONTEND_SRC}/" "${WEB_DST}/"

echo "Installing API to ${API_DST}"
rsync -a --delete \
  --exclude 'backups/' \
  --exclude 'server.log' \
  "${API_SRC}/" "${API_DST}/"

if [[ ! -d "${API_DST}/node_modules" && -f "${API_DST}/package-lock.json" ]]; then
  echo "Installing API npm dependencies"
  (cd "$API_DST" && npm ci --omit=dev)
fi

if [[ ! -f "$ENV_DST" ]]; then
  cp -a "${BUNDLE_DIR}/attica-api.env.example" "$ENV_DST"
  chmod 600 "$ENV_DST"
  echo "Created ${ENV_DST}. Review it before live traffic."
fi

echo "Installing systemd unit"
backup_file "$SERVICE_DST"
cp -a "${BUNDLE_DIR}/attica-api.service" "$SERVICE_DST"
systemctl daemon-reload
systemctl enable attica-api

if [[ -d /etc/httpd/conf.d ]]; then
  echo "Installing Apache config"
  backup_file "$HTTPD_CONF_DST"
  cp -a "${BUNDLE_DIR}/attica-gold.conf" "$HTTPD_CONF_DST"
  if command -v setsebool >/dev/null 2>&1; then
    setsebool -P httpd_can_network_connect 1 || true
  fi
  systemctl enable httpd || true
fi

if [[ "${IMPORT_SCHEMA:-0}" == "1" ]]; then
  check_command mysql
  echo "Importing schema into database asterisk"
  mysql -e "CREATE DATABASE IF NOT EXISTS asterisk CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;"
  mysql asterisk < "$SCHEMA_SRC"
fi

if [[ "${CREATE_DB_USER:-0}" == "1" ]]; then
  check_command mysql
  echo "Creating local API database user"
  mysql -e "CREATE USER IF NOT EXISTS 'custom'@'localhost' IDENTIFIED BY '{{ATTICA_DB_PASSWORD}}'; GRANT ALL PRIVILEGES ON asterisk.* TO 'custom'@'localhost'; FLUSH PRIVILEGES;"
fi

if [[ "${INSTALL_ASTERISK_CONFIGS:-0}" == "1" ]]; then
  if [[ ! -d /etc/asterisk ]]; then
    echo "/etc/asterisk not found; skipping Asterisk config install." >&2
  else
    echo "Installing selected Asterisk configs"
    for conf in extensions.conf sip.conf pjsip.conf queues.conf http.conf rtp.conf manager.conf; do
      if [[ -f "${ASTERISK_SRC}/${conf}" ]]; then
        backup_file "/etc/asterisk/${conf}"
        cp -a "${ASTERISK_SRC}/${conf}" "/etc/asterisk/${conf}"
      fi
    done
  fi
fi

systemctl restart attica-api
if systemctl list-unit-files | grep -q '^httpd.service'; then
  systemctl restart httpd || true
fi

echo "Install complete."
echo "Check API: curl http://127.0.0.1:3001/api/stats"
