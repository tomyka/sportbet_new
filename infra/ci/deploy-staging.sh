#!/usr/bin/env bash
#
# Deploys one commit's images to staging on sportbet-new:
#
#   infra/ci/deploy-staging.sh <40-char commit sha>
#
# Copies the Compose and Caddy files onto the host (so the running stack never
# depends on a CI workspace), updates Caddy, migrates, seeds, and replaces the
# web container. If the new web never turns healthy, the previous release's
# web is put back and the job fails.
set -euo pipefail

tag="${1:?usage: deploy-staging.sh <commit sha>}"
[[ "$tag" =~ ^[0-9a-f]{40}$ ]] || { echo "not a commit sha: $tag" >&2; exit 2; }

root=/srv/sportbet-new
infra="$(cd "$(dirname "$0")/.." && pwd)"
prefix=ghcr.io/tomyka/sportbet_new

install -d "$root/staging" "$root/edge/caddy"
cp "$infra/compose/app.yml" "$infra/compose/staging.yml" "$root/staging/"
cp "$infra/edge/edge.yml" "$root/edge/"
cp "$infra/edge/caddy/Caddyfile" "$root/edge/caddy/Caddyfile"

docker network inspect edge >/dev/null 2>&1 || docker network create edge >/dev/null
edge=(docker compose -p sportbet-edge -f "$root/edge/edge.yml")
"${edge[@]}" up -d --wait
"${edge[@]}" exec -T caddy caddy reload --config /etc/caddy/Caddyfile

staging() {
  local release="$1"; shift
  WEB_IMAGE="$prefix/web:$release" MIGRATE_IMAGE="$prefix/migrate:$release" \
    docker compose -p sportbet-staging --env-file "$root/staging/.env" \
    -f "$root/staging/app.yml" -f "$root/staging/staging.yml" "$@"
}

previous="$(cat "$root/staging/deployed-tag" 2>/dev/null || true)"

staging "$tag" --profile tasks pull
staging "$tag" up -d --wait postgres
staging "$tag" run --rm migrate
staging "$tag" run --rm seed
if ! staging "$tag" up -d --wait web; then
  echo "::error::web $tag did not turn healthy"
  staging "$tag" logs --tail 100 web || true
  if [ -n "$previous" ]; then
    staging "$previous" up -d --wait web
    echo "::warning::staging web rolled back to $previous"
  fi
  exit 1
fi
echo "$tag" > "$root/staging/deployed-tag"
echo "staging: $tag"
