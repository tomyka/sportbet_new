#!/usr/bin/env bash
#
# Prepares sportbet-ci to run production (decision 14), as root. Unlike
# bootstrap.sh it changes nothing about what the old app's pipeline already
# relies on there (no upgrade, no Docker restart, no netplan, no sshd): it
# only adds what production needs. Idempotent. From the laptop:
#
#   scp -r infra ubuntu@sportbet-ci:/tmp/sportbet-infra
#   ssh sportbet-ci 'sudo bash /tmp/sportbet-infra/host/prepare-production.sh'
#
# Oracle-specific (bootstrap.sh, learned on sportbet #147): the Ubuntu image's
# iptables REJECT rule sits beneath the VCN security list, so 80 and 443 are
# opened there too - live and in the boot file, never with
# `netfilter-persistent save` (that would snapshot Docker's chains).
#
# Installs the production backup timer, its failure alert and daily watchdog
# (infra/host/backup-alert.sh, backup-watch.sh) and the reminder timer's files.
# The backup timer is enabled only when /etc/sportbet/backup.env exists, the
# watchdog timer only when /etc/sportbet/alert.env exists (set-alert-email.sh
# writes it and enables the timer itself), and the reminder timer is never
# enabled here (the switch-over's step).
set -euo pipefail

here="$(cd "$(dirname "$0")" && pwd)"
[ "$(id -u)" -eq 0 ] || { echo "run as root (sudo)" >&2; exit 1; }
say() { printf '\n==> %s\n' "$*"; }

say "Directories and the edge network"
install -d -m 755 /srv/sportbet-new /srv/sportbet-new/production /srv/sportbet-new/edge
install -d -m 700 /etc/sportbet
docker network inspect edge >/dev/null 2>&1 || docker network create edge >/dev/null

say "Host firewall: 80 and 443, IPv4 and IPv6"
open_port() {
  local tool="$1" file="$2" port="$3"
  local rule="-p tcp -m state --state NEW -m tcp --dport $port -j ACCEPT"
  # shellcheck disable=SC2086 # $rule is a deliberately word-split argument list for iptables
  if ! $tool -C INPUT $rule 2>/dev/null; then
    local at
    at=$($tool -L INPUT --line-numbers -n | awk '$2 == "REJECT" { print $1; exit }')
    # shellcheck disable=SC2086 # $rule is a deliberately word-split argument list for iptables
    if [ -n "$at" ]; then $tool -I INPUT "$at" $rule; else $tool -A INPUT $rule; fi
  fi
  if [ -f "$file" ] && ! grep -qF -- "-A INPUT $rule" "$file"; then
    awk -v line="-A INPUT $rule" '!done && /^-A INPUT .*-j REJECT/ { print line; done = 1 } { print }' \
      "$file" > "$file.new" && mv "$file.new" "$file"
  fi
}
for port in 80 443; do
  open_port iptables /etc/iptables/rules.v4 "$port"
  open_port ip6tables /etc/iptables/rules.v6 "$port"
done

say "Timers: production backup (enabled once backup.env exists) with its alert and watchdog (once alert.env exists), reminders (files only)"
apt-get install -yq jq >/dev/null
install -m 755 "$here/backup-production.sh" /usr/local/bin/sportbet-production-backup
install -m 755 "$here/backup-alert.sh" /usr/local/bin/sportbet-backup-alert
install -m 755 "$here/backup-watch.sh" /usr/local/bin/sportbet-backup-watch
install -m 755 "$here/reminders.sh" /usr/local/bin/sportbet-reminders
install -m 644 "$here/sportbet-production-backup.service" "$here/sportbet-production-backup.timer" \
  "$here/sportbet-backup-alert@.service" "$here/sportbet-backup-watch.service" "$here/sportbet-backup-watch.timer" \
  "$here/sportbet-reminders.service" "$here/sportbet-reminders.timer" /etc/systemd/system/
systemctl daemon-reload
if [ -f /etc/sportbet/backup.env ]; then
  systemctl enable --now sportbet-production-backup.timer
else
  echo "no /etc/sportbet/backup.env yet: the backup timer stays off"
fi
if [ -f /etc/sportbet/alert.env ]; then
  systemctl enable --now sportbet-backup-watch.timer
else
  echo "no /etc/sportbet/alert.env yet: the backup watchdog stays off (infra/host/set-alert-email.sh)"
fi
