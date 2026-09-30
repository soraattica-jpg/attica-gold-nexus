#!/usr/bin/env bash
set -euo pipefail

START_DID=8068711201
END_DID=8068711319
DEFAULT_CURRENT_DID=8068711209
ASTDB_FAMILY=TATA
ASTDB_KEY=outbound_did
SIP_CONF=/etc/asterisk/sip.conf
LOCK_FILE=/run/attica-rotate-tata-did.lock

log() {
  logger -t attica-rotate-tata-did "$*"
  printf '%s\n' "$*"
}

normalize_did() {
  local value="${1:-}"
  value="${value//[^0-9]/}"
  if [[ "$value" =~ ^80687112[0-9][0-9]$ || "$value" =~ ^80687113[0-1][0-9]$ ]]; then
    if (( value >= START_DID && value <= END_DID )); then
      printf '%s' "$value"
      return 0
    fi
  fi
  return 1
}

current_from_astdb() {
  local output value
  output="$(asterisk -rx "database get ${ASTDB_FAMILY} ${ASTDB_KEY}" 2>/dev/null || true)"
  value="$(printf '%s\n' "$output" | sed -n 's/^Value: *//p' | tr -dc '0-9')"
  normalize_did "$value" || return 1
}

current_from_sip_conf() {
  local fromuser did
  fromuser="$(sed -n 's/^[[:space:]]*fromuser[[:space:]]*=[[:space:]]*\([0-9]\+\).*/\1/p' "$SIP_CONF" | tail -1)"
  if [[ "$fromuser" =~ ^687112[0-9][0-9]$ || "$fromuser" =~ ^687113[0-1][0-9]$ ]]; then
    did="80${fromuser}"
    normalize_did "$did" || return 1
  else
    return 1
  fi
}

next_did_after() {
  local current="$1"
  if (( current >= END_DID )); then
    printf '%s' "$START_DID"
  else
    printf '%s' "$((current + 1))"
  fi
}

set_active_did() {
  local did="$1"
  local cli="${did:2}"
  local tmp_file

  asterisk -rx "database put ${ASTDB_FAMILY} ${ASTDB_KEY} ${did}" >/dev/null
  asterisk -rx "database put ${ASTDB_FAMILY} outbound_cli ${cli}" >/dev/null

  tmp_file="$(mktemp)"
  sed -E "s/^([[:space:]]*fromuser[[:space:]]*=).*/\1${cli}/" "$SIP_CONF" > "$tmp_file"
  install -m 0644 "$tmp_file" "$SIP_CONF"
  rm -f "$tmp_file"

  asterisk -rx "sip reload" >/dev/null
  log "Active Tata outbound DID set to ${did}; CLI/fromuser ${cli}"
}

main() {
  local mode="${1:-rotate}"
  local current next

  exec 9>"$LOCK_FILE"
  flock -n 9 || exit 0

  case "$mode" in
    init)
      set_active_did "$DEFAULT_CURRENT_DID"
      ;;
    rotate)
      current="$(current_from_astdb || current_from_sip_conf || printf '%s' "$DEFAULT_CURRENT_DID")"
      next="$(next_did_after "$current")"
      set_active_did "$next"
      ;;
    set)
      next="$(normalize_did "${2:-}")"
      set_active_did "$next"
      ;;
    *)
      printf 'Usage: %s [init|rotate|set DID]\n' "$0" >&2
      exit 2
      ;;
  esac
}

main "$@"
