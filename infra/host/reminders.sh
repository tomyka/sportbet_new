#!/usr/bin/env bash
#
# Calls the app's reminder route once (R-97). Run by sportbet-reminders.service
# every 15 minutes, with REMINDERS_URL and CRON_SECRET from the root-only
# /etc/sportbet/reminders.env. Exits non-zero on any non-2xx answer or an
# unreachable host, so the failure shows in `systemctl --failed`. The secret
# travels only in a header and is never printed; the answer is counts only.
set -euo pipefail

: "${REMINDERS_URL:?REMINDERS_URL is required}"
: "${CRON_SECRET:?CRON_SECRET is required}"

curl -fsS --max-time 90 -X POST \
  -H "Authorization: Bearer $CRON_SECRET" \
  "$REMINDERS_URL"
echo
