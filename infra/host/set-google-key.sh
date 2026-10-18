#!/usr/bin/env bash
#
# Stores one of production's Google sign-in settings on sportbet-ci (decision 14,
# slice 19), as root. The value arrives on stdin and is never printed, never
# put in a command line (no `ps` leak) and never written anywhere but the
# root-only settings file. Run once per setting. Does not redeploy: the lead
# redeploys web after both are stored (deploy-production.sh).
#
#   (from the laptop, with the value on the clipboard)
#   scp infra/host/set-google-key.sh sportbet-ci:/tmp/
#   powershell -NoProfile -Command "Get-Clipboard" | ssh sportbet-ci 'sudo bash /tmp/set-google-key.sh GOOGLE_CLIENT_ID'
#   powershell -NoProfile -Command "Get-Clipboard" | ssh sportbet-ci 'sudo bash /tmp/set-google-key.sh GOOGLE_CLIENT_SECRET'
set -euo pipefail
[ "$(id -u)" -eq 0 ] || { echo "run as root (sudo)" >&2; exit 1; }

name="${1:-}"
case "$name" in
  GOOGLE_CLIENT_ID|GOOGLE_CLIENT_SECRET) ;;
  *) echo "usage: set-google-key.sh GOOGLE_CLIENT_ID|GOOGLE_CLIENT_SECRET (value on stdin)" >&2; exit 2 ;;
esac

env_file=/srv/sportbet-new/production/.env
[ -f "$env_file" ] || { echo "$env_file is missing" >&2; exit 1; }

IFS= read -r raw || true
value="$(printf '%s' "$raw" | tr -d '[:space:]')"
unset raw
# Google's ids and secrets are URL-safe text; refuse anything else (a pasted sentence, a JSON file).
[[ "$value" =~ ^[A-Za-z0-9._~-]{8,512}$ ]] || { echo "stdin does not hold a $name (8 to 512 URL-safe characters): nothing changed" >&2; exit 2; }

tmp="$(umask 077; mktemp "$env_file.XXXXXX")"
grep -v "^$name=" "$env_file" > "$tmp" || true
printf '%s=%s\n' "$name" "$value" >> "$tmp"
chmod 600 "$tmp"
mv "$tmp" "$env_file"
unset value
echo "$name stored in $env_file (value not shown)"
