#!/usr/bin/env bash
#
# Mails the owner that the production backup needs attention (installed as
# /usr/local/bin/sportbet-backup-alert; run as root by
# sportbet-backup-alert@.service, which sportbet-production-backup.service
# names in OnFailure=, and by backup-watch.sh).
#
#   sportbet-backup-alert <reason>      mail with that reason (free text)
#   sportbet-backup-alert --unit <name> a systemd unit failed; the reason is
#                                       that, plus backup-status.json's own
#                                       reason when it says `failed`
#   sportbet-backup-alert --test        a clearly marked test mail, to prove
#                                       the path (key, sender, address) works
#
# The mail goes through Resend's HTTP API. The key (RESEND_API_KEY) and the
# sender (MAIL_FROM_ADDRESS) come from the production .env, the recipient
# (ALERT_EMAIL) from /etc/sportbet/alert.env (root, 0600; infra/host/
# set-alert-email.sh writes it). They are read in here, one key at a time
# (neither file is sourced), and the key reaches curl through a config on
# stdin: never a command line, never a log. Subject and body are fixed text
# with the host name and the reason; no secret goes into them.
#
# Exits 0 only when Resend accepted the mail, so a failing alert unit shows in
# `systemctl --failed` and the journal. The three paths can be overridden by
# the environment for the shell test (infra/host/tests/backup-alert-test.sh).
set -Eeuo pipefail

ENV_FILE="${SPORTBET_PRODUCTION_ENV:-/srv/sportbet-new/production/.env}"
ALERT_ENV="${SPORTBET_ALERT_ENV:-/etc/sportbet/alert.env}"
STATUS="${SPORTBET_BACKUP_STATUS:-/srv/sportbet-new/backup-status.json}"

die() { echo "backup alert: $1" >&2; exit "${2:-1}"; }
usage() { echo "usage: sportbet-backup-alert <reason> | --unit <unit> | --test" >&2; exit 2; }

setting() { # file key: the value of the first KEY=value line, never echoed by callers
  sed -n "s/^$2=//p" "$1" 2>/dev/null | head -n 1 | tr -d '\r'
}

# One line, printable ASCII and anything above it, at most 400 characters.
clean() { printf '%s' "$1" | tr '\n\r\t' '   ' | tr -d '\000-\037\177' | cut -c1-400; }

[ "$#" -ge 1 ] || usage
case "$1" in
  --test)
    [ "$#" -eq 1 ] || usage
    marker="TEST: "
    reason="This is a test of the alert path. Nothing is wrong; no action is needed."
    ;;
  --unit)
    [ "$#" -eq 2 ] || usage
    [[ "$2" =~ ^[A-Za-z0-9@:._-]{1,100}$ ]] || die "not a unit name" 2
    marker=""
    reason="systemd unit $2 failed."
    if [ -f "$STATUS" ] && [ "$(jq -r '.status // empty' "$STATUS" 2>/dev/null)" = failed ]; then
      reason="$reason The backup's own reason: $(clean "$(jq -r '.reason // empty' "$STATUS" 2>/dev/null)")"
    fi
    ;;
  -*) usage ;;
  *)
    [ "$#" -eq 1 ] || usage
    marker=""
    reason="$(clean "$1")"
    ;;
esac

key="$(setting "$ENV_FILE" RESEND_API_KEY)"
from="$(setting "$ENV_FILE" MAIL_FROM_ADDRESS)"
to="$(setting "$ALERT_ENV" ALERT_EMAIL)"
[[ "$key" =~ ^re_[A-Za-z0-9_]+$ ]] || die "no RESEND_API_KEY in $ENV_FILE"
[[ "$from" =~ ^[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}$ ]] || die "no MAIL_FROM_ADDRESS in $ENV_FILE"
[[ "$to" =~ ^[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}$ ]] || die "no ALERT_EMAIL in $ALERT_ENV (infra/host/set-alert-email.sh)"

host="$(hostname)"
now="$(date -u +%Y-%m-%dT%H:%M:%SZ)"
subject="[sportbet] ${marker}production backup problem on $host"
[ -z "$marker" ] || subject="[sportbet] ${marker}backup alert path on $host"
body="$(printf '%s\n' \
  "${marker}Production backup alert" \
  "" \
  "Host:   $host" \
  "Time:   $now" \
  "Reason: $reason" \
  "" \
  "On the host: cat /srv/sportbet-new/backup-status.json ; journalctl -u sportbet-production-backup -n 50" \
  "Recovery: docs/superpowers/plans/restore-runbook.md in the sportbet_new repository.")"

work="$(umask 077; mktemp -d)"
trap 'rm -rf "$work"' EXIT
jq -n --arg from "$from" --arg to "$to" --arg subject "$subject" --arg text "$body" \
  '{from: $from, to: [$to], subject: $subject, text: $text}' > "$work/mail.json"

# The key goes to curl on stdin (ps shows arguments, not stdin).
printf 'url = "https://api.resend.com/emails"\nheader = "Authorization: Bearer %s"\nheader = "Content-Type: application/json"\ndata-binary = "@%s"\n' \
  "$key" "$work/mail.json" \
  | curl -fsS --max-time 30 --retry 2 -K - -o /dev/null \
  || die "Resend refused or could not be reached; no mail was sent"
echo "backup alert mailed${marker:+ (test)}"
