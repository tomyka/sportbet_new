#!/usr/bin/env bash
#
# A throwaway application stack for E2E tests, from already-built images.
#
#   WEB_IMAGE=... MIGRATE_IMAGE=... infra/ci/e2e-stack.sh up <project>    # prints the base URL
#   infra/ci/e2e-stack.sh down <project>
#
# `up` migrates and seeds exactly as a staging deploy does, so E2E sees the
# same data staging has.
set -euo pipefail

action="${1:?usage: e2e-stack.sh up|down <project>}"
project="${2:?usage: e2e-stack.sh up|down <project>}"
here="$(cd "$(dirname "$0")/../compose" && pwd)"
export POSTGRES_PASSWORD=e2e
export WEB_IMAGE="${WEB_IMAGE:-unused}" MIGRATE_IMAGE="${MIGRATE_IMAGE:-unused}"
compose=(docker compose -p "$project" -f "$here/app.yml" -f "$here/e2e.yml")

case "$action" in
  up)
    "${compose[@]}" up -d --wait postgres >&2
    "${compose[@]}" run --rm migrate >&2
    "${compose[@]}" run --rm seed >&2
    "${compose[@]}" up -d --wait web >&2
    echo "http://$("${compose[@]}" port web 3000)"
    ;;
  down)
    "${compose[@]}" --profile tasks down -v --remove-orphans
    ;;
  *)
    echo "usage: e2e-stack.sh up|down <project>" >&2
    exit 2
    ;;
esac
