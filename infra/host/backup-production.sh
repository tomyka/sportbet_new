#!/usr/bin/env bash
#
# Nightly production backup on sportbet-ci (installed as
# /usr/local/bin/sportbet-production-backup; run by
# sportbet-production-backup.timer, as root). Dumps the database, restores the
# dump into a throwaway Postgres 18, checks every table's row count against
# the live database, uploads the dump to the Object Storage bucket through a
# write-only pre-authenticated request (the host can add objects, never read,
# list or delete them), and writes /srv/sportbet-new/backup-status.json.
#
# /etc/sportbet/backup.env (root, 0600) holds BACKUP_PAR_URL: the PAR's full
# URL, ending in /o/. It is the only secret here and is never printed or
# logged. Without it the restore test still runs and the status is `failed`.
#
# Production takes writes while the dump runs, so the restore test cannot
# compare with a count taken once: each table's live count is read before and
# after the dump, and the restored count must lie between the two (a table
# that changed both ways in that window can fail a night; the next one runs).
# The newest 7 dumps stay in /srv/sportbet-new/backups (root only: they hold
# every player's name and address).
#
# postgres:18.x below is pinned exactly, bumped deliberately together with
# the same tag in infra/compose/app.yml and packages/db/src/migrations.ts.
set -Eeuo pipefail

LIVE=sportbet-production-postgres-1
TEST=sportbet-production-restore-test
STATUS=/srv/sportbet-new/backup-status.json
KEEP_DIR=/srv/sportbet-new/backups

stamp="$(date -u +%Y%m%dT%H%M%SZ)"
file="production-$stamp.dump"
object="sportbet-new/production/$file"
work="$(mktemp -d)"
install -d -m 700 "$KEEP_DIR"

write_status() { # status reason bytes
  jq -n --arg status "$1" --arg reason "$2" --arg file "$object" --argjson bytes "${3:-0}" \
    --arg updated_at "$(date -u +%Y-%m-%dT%H:%M:%SZ)" \
    '{status: $status, reason: $reason, file: $file, bytes: $bytes, updated_at: $updated_at}' \
    > "$STATUS.new"
  chmod 644 "$STATUS.new"
  mv "$STATUS.new" "$STATUS"
}
cleanup() { docker rm -f "$TEST" >/dev/null 2>&1 || true; rm -rf "$work"; }
fail() { write_status failed "$1" 0; echo "backup failed: $1" >&2; exit 1; }
trap 'fail "unexpected error on line $LINENO"' ERR
trap cleanup EXIT

psql_live() { docker exec "$LIVE" psql -U sportbet -d sportbet -Atc "$1"; }
psql_test() { docker exec "$TEST" psql -U postgres -d sportbet -Atc "$1"; }
counts() { # one "table count" line per table, from the live database
  local table
  while IFS= read -r table; do
    printf '%s %s\n' "$table" "$(psql_live "select count(*) from $table")"
  done <<< "$tables"
}

tables="$(psql_live "select format('%I.%I', schemaname, tablename) from pg_tables where schemaname not in ('pg_catalog', 'information_schema') order by 1")"
[ -n "$tables" ] || fail "live database has no tables"

counts > "$work/before"
docker exec "$LIVE" pg_dump -U sportbet -d sportbet -Fc > "$work/$file" || fail "pg_dump failed"
counts > "$work/after"
bytes="$(stat -c %s "$work/$file")"

docker rm -f "$TEST" >/dev/null 2>&1 || true
docker run -d --name "$TEST" -e POSTGRES_PASSWORD=restore-test postgres:18.6 >/dev/null
for _ in $(seq 60); do
  docker exec "$TEST" pg_isready -h 127.0.0.1 -U postgres >/dev/null 2>&1 && break
  sleep 1
done
docker exec "$TEST" pg_isready -h 127.0.0.1 -U postgres >/dev/null || fail "restore container never became ready"
docker exec "$TEST" createdb -U postgres sportbet
docker exec -i "$TEST" pg_restore -U postgres -d sportbet --no-owner --no-privileges --exit-on-error \
  < "$work/$file" || fail "pg_restore failed"

while read -r table low; do
  high="$(awk -v t="$table" '$1 == t { print $2 }' "$work/after")"
  [ -n "$high" ] || fail "$table is gone after the dump"
  if [ "$high" -lt "$low" ]; then t="$low"; low="$high"; high="$t"; fi
  restored="$(psql_test "select count(*) from $table")"
  if [ "$restored" -lt "$low" ] || [ "$restored" -gt "$high" ]; then
    fail "$table: $low..$high rows live, $restored restored"
  fi
done < "$work/before"

# Off-host copy, then the local one.
# shellcheck source=/dev/null # /etc/sportbet/backup.env only exists on the host
[ -f /etc/sportbet/backup.env ] && . /etc/sportbet/backup.env
[ -n "${BACKUP_PAR_URL:-}" ] || fail "no BACKUP_PAR_URL in /etc/sportbet/backup.env"
want="$(openssl md5 -binary "$work/$file" | base64)"
curl -fsS --max-time 900 -o /dev/null -D "$work/headers" -T "$work/$file" "${BACKUP_PAR_URL}${object}" \
  || fail "upload failed"
got="$(tr -d '\r' < "$work/headers" | awk 'tolower($1) == "opc-content-md5:" { print $2 }')"
[ "$got" = "$want" ] || fail "the bucket's checksum differs from the dump's"

install -m 600 "$work/$file" "$KEEP_DIR/$file"
find "$KEEP_DIR" -name 'production-*.dump' -printf '%T@ %p\n' | sort -rn | awk 'NR > 7 { print $2 }' | xargs -r rm -f

write_status ok "" "$bytes"
echo "backup ok: $object ($bytes bytes), restore test passed"
