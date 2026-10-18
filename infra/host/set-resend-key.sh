#!/usr/bin/env bash
#
# Stores production's Resend API key on sportbet-ci (decision 14), as root. The key
# arrives on stdin and is never printed, never put in a command line (no `ps`
# leak) and never written anywhere but the root-only settings file. Replaces
# the rehearsal placeholder, then redeploys web so it reads the new value.
#
#   (from the laptop, with the key on the clipboard)
#   scp infra/host/set-resend-key.sh sportbet-ci:/tmp/
#   powershell -NoProfile -Command "Get-Clipboard" | ssh sportbet-ci 'sudo bash /tmp/set-resend-key.sh'
set -euo pipefail
[ "$(id -u)" -eq 0 ] || { echo "run as root (sudo)" >&2; exit 1; }

env_file=/srv/sportbet-new/production/.env
[ -f "$env_file" ] || { echo "$env_file is missing" >&2; exit 1; }

IFS= read -r raw || true
key="$(printf '%s' "$raw" | tr -d '[:space:]')"
unset raw
[[ "$key" =~ ^re_[A-Za-z0-9_]+$ ]] || { echo "stdin does not hold a Resend API key (re_...): nothing changed" >&2; exit 2; }

tmp="$(umask 077; mktemp "$env_file.XXXXXX")"
grep -v '^RESEND_API_KEY=' "$env_file" > "$tmp" || true
printf 'RESEND_API_KEY=%s\n' "$key" >> "$tmp"
chmod 600 "$tmp"
mv "$tmp" "$env_file"
unset key
echo "RESEND_API_KEY stored in $env_file (value not shown)"

# Redeploy web with the same images so it reads the new value.
tag="$(cat /srv/sportbet-new/production/deployed-tag 2>/dev/null || echo rehearsal)"
IMAGE_PREFIX="${IMAGE_PREFIX:-sportbet-new}" PULL=0 bash /tmp/sportbet-infra/ci/deploy-production.sh "$tag" | tail -3
