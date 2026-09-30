#!/bin/bash
set -euo pipefail

METRICS=$(mysql -u root -N -e "
SELECT
  (SELECT COUNT(*) FROM information_schema.processlist),
  (SELECT COUNT(*) FROM information_schema.processlist WHERE COMMAND <> 'Sleep'),
  @@max_connections;
" 2>/dev/null) || exit 0

TOTAL_CONNECTIONS=$(echo "$METRICS" | awk '{print $1}')
ACTIVE_CONNECTIONS=$(echo "$METRICS" | awk '{print $2}')
MAX_CONNECTIONS=$(echo "$METRICS" | awk '{print $3}')

if [ -z "$TOTAL_CONNECTIONS" ] || [ -z "$ACTIVE_CONNECTIONS" ] || [ -z "$MAX_CONNECTIONS" ]; then
  exit 0
fi

CONNECTION_LIMIT_THRESHOLD=$((MAX_CONNECTIONS - 15))
if [ "$CONNECTION_LIMIT_THRESHOLD" -lt 250 ]; then
  CONNECTION_LIMIT_THRESHOLD=250
fi

ACTIVE_CONNECTION_THRESHOLD=80

ACTIVE_CHANNELS=$(asterisk -rx "core show channels count" 2>/dev/null | awk '/active channels/ {print $1; exit}')
ACTIVE_CHANNELS=${ACTIVE_CHANNELS:-1}

QUEUE_RELOAD_DEFERRED="/run/attica-queue-reload-deferred"
if [ -f "$QUEUE_RELOAD_DEFERRED" ] && [ "$ACTIVE_CHANNELS" -eq 0 ]; then
  logger -t fix-connections "Applying deferred Asterisk queue reload"
  if asterisk -rx "module reload app_queue.so" >/dev/null 2>&1; then
    rm -f "$QUEUE_RELOAD_DEFERRED"
  fi
fi

if [ "$TOTAL_CONNECTIONS" -lt "$CONNECTION_LIMIT_THRESHOLD" ] && [ "$ACTIVE_CONNECTIONS" -lt "$ACTIVE_CONNECTION_THRESHOLD" ]; then
  exit 0
fi

if [ "$ACTIVE_CHANNELS" -gt 0 ]; then
  logger -t fix-connections \
    "Deferring mariadb and attica-api restart: active_channels=$ACTIVE_CHANNELS total_connections=$TOTAL_CONNECTIONS active_connections=$ACTIVE_CONNECTIONS max_connections=$MAX_CONNECTIONS"
  exit 0
fi

logger -t fix-connections \
  "Restarting mariadb and attica-api: total_connections=$TOTAL_CONNECTIONS active_connections=$ACTIVE_CONNECTIONS max_connections=$MAX_CONNECTIONS"

systemctl restart mariadb
sleep 2
systemctl restart attica-api
