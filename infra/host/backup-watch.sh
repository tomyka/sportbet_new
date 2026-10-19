#!/usr/bin/env bash
#
# Daily watchdog for the production backup (installed as
# /usr/local/bin/sportbet-backup-watch; run by sportbet-backup-watch.timer at
# 07:00 UTC, as root). It catches what OnFailure= cannot: a timer that never
# ran, a host that was down at 02:37, a status file nobody wrote. It reads
# /srv/sportbet-new/backup-status.json and mails (through sportbet-backup-alert)
# when the file is missing or unreadable, its status is not `ok`, or its
# updated_at is more than 26 hours old. When all is well it prints one line to
# the journal and mails nothing.
#
# A backup that failed overnight is mailed twice: once by the failure itself,
# once here at 07:00, and again every morning until a run succeeds. That is
# deliberate.
#
# Exits 0 when the state was judged (and any mail was sent), non-zero when the
# mail could not be sent, so the failure shows in `systemctl --failed`.
# SPORTBET_BACKUP_STATUS and SPORTBET_BACKUP_ALERT override the status path and
# the alert command for the shell test.
set -Eeuo pipefail

STATUS="${SPORTBET_BACKUP_STATUS:-/srv/sportbet-new/backup-status.json}"
ALERT="${SPORTBET_BACKUP_ALERT:-/usr/local/bin/sportbet-backup-alert}"
MAX_AGE_HOURS=26

problem() { "$ALERT" "$1"; echo "backup watch: mailed ($1)"; exit 0; }

[ -f "$STATUS" ] || problem "$STATUS is missing: the nightly backup has never run here."
jq -e . "$STATUS" >/dev/null 2>&1 || problem "$STATUS is not valid JSON."

status="$(jq -r '.status // empty' "$STATUS")"
reason="$(jq -r '.reason // empty' "$STATUS" | tr '\n\r' '  ' | cut -c1-300)"
updated="$(jq -r '.updated_at // empty' "$STATUS")"

if [ "$status" != ok ]; then
  problem "The last backup's status is '${status:-none}': ${reason:-no reason recorded}"
fi

then_s="$(date -u -d "$updated" +%s 2>/dev/null)" || problem "updated_at '$(printf '%s' "$updated" | cut -c1-40)' in $STATUS is not a date."
age_h=$(( ($(date -u +%s) - then_s) / 3600 ))
if [ "$age_h" -gt "$MAX_AGE_HOURS" ]; then
  problem "The last successful backup is ${age_h} hours old (limit ${MAX_AGE_HOURS}): the nightly timer is not running."
fi

echo "backup watch: ok ($(jq -r '.file' "$STATUS"), ${age_h} h old)"
