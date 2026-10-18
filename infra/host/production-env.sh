#!/usr/bin/env bash
#
# Writes production's settings on sportbet-ci (decision 14), as root, and
# prints no value. Idempotent: a key already in the file is kept, so a re-run
# never rotates a secret; only missing keys are added.
#
#   sudo bash production-env.sh <app url, e.g. https://new.sportbet.lt>
#
# /srv/sportbet-new/production/.env (root, 0600): POSTGRES_PASSWORD,
# AUTH_SECRET, APP_URL and the mail settings, read by `docker compose
# --env-file`. /etc/sportbet/reminders.env (root, 0600): the reminder timer's
# REMINDERS_URL and the same CRON_SECRET.
#
# Mail: until the owner supplies a Resend key, RESEND_API_KEY is a marked
# placeholder that is not a valid key, so Resend refuses every send (401) and
# the rehearsal can mail nobody. The real key replaces that line by hand.
set -euo pipefail

app_url="${1:?usage: production-env.sh <app url>}"
[[ "$app_url" =~ ^https://[A-Za-z0-9.-]+$ ]] || { echo "not an https origin: $app_url" >&2; exit 2; }
[ "$(id -u)" -eq 0 ] || { echo "run as root (sudo)" >&2; exit 1; }

root=/srv/sportbet-new/production
install -d -m 755 /srv/sportbet-new "$root"
install -d -m 700 /etc/sportbet

env_file="$root/.env"
( umask 077; touch "$env_file" )
chmod 600 "$env_file"

has() { grep -q "^$1=" "$env_file"; }
add() { has "$1" || printf '%s=%s\n' "$1" "$2" >> "$env_file"; }

add POSTGRES_PASSWORD "$(openssl rand -hex 24)"
add AUTH_SECRET "$(openssl rand -base64 48 | tr -d '\n')"
add CRON_SECRET "$(openssl rand -base64 48 | tr -d '\n')"
add APP_URL "$app_url"
add MAIL_TRANSPORT resend
add MAIL_FROM_ADDRESS noreply@sportbet.lt
add RESEND_API_KEY re_rehearsal_placeholder_not_a_real_key

# The reminder timer: written every run, so it always carries the current secret.
cron_secret="$(sed -n 's/^CRON_SECRET=//p' "$env_file")"
( umask 077
  printf 'REMINDERS_URL=%s/api/cron/reminders\nCRON_SECRET=%s\n' "$app_url" "$cron_secret" > /etc/sportbet/reminders.env )
chmod 600 /etc/sportbet/reminders.env

echo "production env: $(wc -l < "$env_file") keys in $env_file (values not shown)"
