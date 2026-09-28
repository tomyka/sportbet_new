#!/usr/bin/env bash
#
# Nightly staging backup (installed as /usr/local/bin/sportbet-backup; run by
# sportbet-backup.timer, as root). Dumps, uploads, downloads it back, restores
# it into a throwaway Postgres 18 and compares every table's row count with
# the live database, then writes /srv/sportbet-new/backup-status.json, which
# .github/workflows/backup-check.yml reads every morning.
#
# Staging takes no writes between the dump and the count. Production will,
# and its restore test must compare against the dump instead (switch-over).
#
# postgres:18.x below is pinned exactly, bumped deliberately together with
# the same tag in infra/compose/app.yml and
# packages/db/src/testing/database.ts.
set -Eeuo pipefail

NAMESPACE=axox7rtziknk
BUCKET=sportbet-db-backup
LIVE=sportbet-staging-postgres-1
TEST=sportbet-restore-test
STATUS=/srv/sportbet-new/backup-status.json

stamp="$(date -u +%Y%m%dT%H%M%SZ)"
file="staging-$stamp.dump"
object="sportbet-new/staging/$file"
work="$(mktemp -d)"

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

docker exec "$LIVE" pg_dump -U sportbet -d sportbet -Fc > "$work/$file" || fail "pg_dump failed"
bytes="$(stat -c %s "$work/$file")"

oci os object put --auth instance_principal --namespace-name "$NAMESPACE" --bucket-name "$BUCKET" \
  --name "$object" --file "$work/$file" --no-overwrite >/dev/null || fail "upload failed"
oci os object get --auth instance_principal --namespace-name "$NAMESPACE" --bucket-name "$BUCKET" \
  --name "$object" --file "$work/downloaded.dump" >/dev/null || fail "download failed"
cmp -s "$work/$file" "$work/downloaded.dump" || fail "downloaded object differs from the dump"

docker rm -f "$TEST" >/dev/null 2>&1 || true
docker run -d --name "$TEST" -e POSTGRES_PASSWORD=restore-test postgres:18.6 >/dev/null
for _ in $(seq 60); do
  docker exec "$TEST" pg_isready -h 127.0.0.1 -U postgres >/dev/null 2>&1 && break
  sleep 1
done
docker exec "$TEST" pg_isready -h 127.0.0.1 -U postgres >/dev/null || fail "restore container never became ready"
docker exec "$TEST" createdb -U postgres sportbet
docker exec -i "$TEST" pg_restore -U postgres -d sportbet --no-owner --no-privileges --exit-on-error \
  < "$work/downloaded.dump" || fail "pg_restore failed"

tables="$(psql_live "select format('%I.%I', schemaname, tablename) from pg_tables where schemaname not in ('pg_catalog', 'information_schema') order by 1")"
[ -n "$tables" ] || fail "live database has no tables"
while IFS= read -r table; do
  live="$(psql_live "select count(*) from $table")"
  restored="$(psql_test "select count(*) from $table")"
  [ "$live" = "$restored" ] || fail "$table: $live rows live, $restored restored"
done <<< "$tables"

write_status ok "" "$bytes"
echo "backup ok: $object ($bytes bytes), restore test passed"
