#!/usr/bin/env bash
#
# Deploys one release of the images to production on sportbet-ci, as root
# (decision 14). Run by hand from a checkout copied onto the host:
#
#   sudo infra/ci/deploy-production.sh <image tag>
#
# <image tag> is `<40-char commit sha>-arm64` (CI's arm64 images in GHCR,
# image-arm64 in ci.yml), `main-arm64`, or a tag built on the host
# (`docker build --platform linux/arm64`, then PULL=0 so no pull is attempted).
#
# Copies the Compose and Caddy files to /srv/sportbet-new (so the running stack
# never depends on this checkout), updates Caddy, migrates and replaces the web
# container; a pg_dump restore point is taken first (predeploy-backup.sh; a
# failed dump stops the deploy before it migrates). If the new web never turns healthy, or then fails verification
# (verify-release.sh: the commit it reports and the main pages, through the
# edge), the previous release's web is put back and the script fails. Needs /srv/sportbet-new/production/.env
# (infra/host/production-env.sh).
set -euo pipefail

tag="${1:?usage: deploy-production.sh <image tag>}"
[[ "$tag" =~ ^[A-Za-z0-9_][A-Za-z0-9_.-]{0,127}$ ]] || { echo "not an image tag: $tag" >&2; exit 2; }
[ "$(id -u)" -eq 0 ] || { echo "run as root (sudo)" >&2; exit 1; }

root=/srv/sportbet-new
infra="$(cd "$(dirname "$0")/.." && pwd)"
prefix="${IMAGE_PREFIX:-ghcr.io/tomyka/sportbet_new}"
# shellcheck source=infra/ci/verify-release.sh
source "$(dirname "$0")/verify-release.sh"
# shellcheck source=infra/ci/predeploy-backup.sh
source "$(dirname "$0")/predeploy-backup.sh"
[ -f "$root/production/.env" ] || { echo "$root/production/.env is missing: run infra/host/production-env.sh" >&2; exit 1; }

install -d "$root/production" "$root/edge/caddy"
cp "$infra/compose/app.yml" "$infra/compose/production.yml" "$root/production/"
cp "$infra/edge/edge.yml" "$root/edge/"
cp "$infra/edge/caddy/Caddyfile.production" "$root/edge/caddy/Caddyfile"

docker network inspect edge >/dev/null 2>&1 || docker network create edge >/dev/null
edge=(docker compose -p sportbet-edge -f "$root/edge/edge.yml")
"${edge[@]}" up -d --wait
"${edge[@]}" exec -T caddy caddy reload --config /etc/caddy/Caddyfile

production() {
  local release="$1"; shift
  WEB_IMAGE="$prefix/web:$release" MIGRATE_IMAGE="$prefix/migrate:$release" \
    docker compose -p sportbet-production --env-file "$root/production/.env" \
    -f "$root/production/app.yml" -f "$root/production/production.yml" "$@"
}

previous="$(cat "$root/production/deployed-tag" 2>/dev/null || true)"

if [ "${PULL:-1}" = 1 ]; then
  production "$tag" --profile tasks pull migrate web
fi
production "$tag" up -d --wait postgres
predeploy_backup "$tag" || exit 1
production "$tag" run --rm migrate
roll_back() {
  if [ -n "$previous" ]; then
    production "$previous" up -d --wait web
    echo "production web rolled back to $previous" >&2
  fi
}

if ! production "$tag" up -d --wait web; then
  echo "web $tag did not turn healthy" >&2
  production "$tag" logs --tail 100 web || true
  roll_back
  exit 1
fi
# Healthy is not working: prove the site through the edge, and that it is the
# commit just deployed (verify-release.sh); if not, put the previous web back.
if ! verify_release "$tag"; then
  echo "web $tag failed verification" >&2
  production "$tag" logs --tail 100 web || true
  roll_back
  exit 1
fi
echo "$tag" > "$root/production/deployed-tag"
echo "production: $tag"
