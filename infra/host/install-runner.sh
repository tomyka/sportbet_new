#!/usr/bin/env bash
#
# Installs and registers the self-hosted GitHub Actions runner on sportbet-new.
# The one-hour, single-use registration token arrives on stdin, never a file:
#
#   gh api -X POST repos/tomyka/sportbet_new/actions/runners/registration-token --jq .token \
#     | ssh -i ~/.ssh/sportbet_oci ubuntu@<ip> 'sudo bash /tmp/sportbet-host/install-runner.sh <version> <sha256>'
#
# <sha256> is the one GitHub publishes for actions-runner-linux-arm64-<version>.tar.gz.
# The runner user is in the docker group - root-equivalent on this host. That is
# accepted for a private repository only the owner pushes to (see the spec).
# Idempotent: an already-registered runner stays registered.
set -euo pipefail

VERSION="${1:?runner version, e.g. 2.330.0}"
SHA256="${2:?sha256 of actions-runner-linux-arm64-VERSION.tar.gz}"
DIR=/opt/actions-runner
[ "$(id -u)" -eq 0 ] || { echo "run as root (sudo)" >&2; exit 1; }
IFS= read -r TOKEN || true

id runner >/dev/null 2>&1 || { echo "run bootstrap.sh first (no runner user)" >&2; exit 1; }
install -d -o runner -g runner "$DIR"
if [ "$(cat "$DIR/.installed-version" 2>/dev/null || true)" != "$VERSION" ]; then
  tarball="actions-runner-linux-arm64-$VERSION.tar.gz"
  curl -fsSL -o "/tmp/$tarball" "https://github.com/actions/runner/releases/download/v$VERSION/$tarball"
  echo "$SHA256  /tmp/$tarball" | sha256sum -c -
  sudo -u runner tar xzf "/tmp/$tarball" -C "$DIR"
  rm -f "/tmp/$tarball"
  echo "$VERSION" > "$DIR/.installed-version"
fi
"$DIR/bin/installdependencies.sh" >/dev/null

if [ -f "$DIR/.runner" ]; then
  echo "already registered - leaving it."
else
  [ -n "${TOKEN:-}" ] || { echo "no registration token on stdin" >&2; exit 1; }
  cd "$DIR"
  sudo -u runner ./config.sh --unattended --url https://github.com/tomyka/sportbet_new \
    --token "$TOKEN" --name sportbet-new --labels sportbet-new --work _work --replace
fi
unset TOKEN

cd "$DIR"
./svc.sh status >/dev/null 2>&1 || ./svc.sh install runner
./svc.sh start || true
./svc.sh status
