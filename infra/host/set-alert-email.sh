#!/usr/bin/env bash
#
# Stores the address that backup alerts are mailed to on sportbet-ci, as root.
# The address arrives on stdin and is never printed or put in a command line;
# it goes only into the root-only /etc/sportbet/alert.env (ALERT_EMAIL). It
# then enables the watchdog timer (prepare-production.sh must have installed
# the units). Idempotent: a re-run replaces the address.
#
#   scp infra/host/set-alert-email.sh sportbet-ci:/tmp/
#   printf '%s\n' 'owner@example.com' | ssh sportbet-ci 'sudo bash /tmp/set-alert-email.sh'
set -euo pipefail

IFS= read -r raw || true
addr="$(printf '%s' "$raw" | tr -d '[:space:]')"
unset raw
[[ "$addr" =~ ^[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}$ ]] \
  || { echo "stdin does not hold an email address: nothing changed" >&2; exit 2; }
[ "$(id -u)" -eq 0 ] || { echo "run as root (sudo)" >&2; exit 1; }

install -d -m 700 /etc/sportbet
file=/etc/sportbet/alert.env
tmp="$(umask 077; mktemp "$file.XXXXXX")"
printf 'ALERT_EMAIL=%s\n' "$addr" > "$tmp"
chmod 600 "$tmp"
mv "$tmp" "$file"
unset addr
echo "ALERT_EMAIL stored in $file (value not shown)"

if [ -f /etc/systemd/system/sportbet-backup-watch.timer ]; then
  systemctl enable --now sportbet-backup-watch.timer
else
  echo "the watchdog units are not installed yet: run prepare-production.sh, then this again"
fi
