#!/usr/bin/env bash
#
# One-time baseline for sportbet-new (Oracle, Ubuntu 24.04 arm64). Idempotent:
# run it again after any edit. From the laptop:
#
#   scp -i ~/.ssh/sportbet_oci -r infra/host ubuntu@<ip>:/tmp/sportbet-host
#   ssh -i ~/.ssh/sportbet_oci ubuntu@<ip> 'sudo bash /tmp/sportbet-host/bootstrap.sh <playwright-version>'
#
# <playwright-version> is @playwright/test's version in apps/web/package.json;
# it decides which browser libraries the host needs for E2E.
#
# Oracle-specific (learned on sportbet, #147): the Ubuntu image ships iptables
# REJECT rules in /etc/iptables/rules.v4 beneath the VCN security list, so 80
# and 443 are opened there too - live and in the boot file, never with
# `netfilter-persistent save` (that would snapshot Docker's chains).
set -euo pipefail

PLAYWRIGHT_VERSION="${1:?usage: bootstrap.sh <playwright-version>}"
here="$(cd "$(dirname "$0")" && pwd)"
[ "$(id -u)" -eq 0 ] || { echo "run as root (sudo)" >&2; exit 1; }
say() { printf '\n==> %s\n' "$*"; }
export DEBIAN_FRONTEND=noninteractive

say "Packages"
apt-get update -q
apt-get upgrade -yq
echo 'iptables-persistent iptables-persistent/autosave_v4 boolean false' | debconf-set-selections
echo 'iptables-persistent iptables-persistent/autosave_v6 boolean false' | debconf-set-selections
apt-get install -yq ca-certificates curl gnupg jq unattended-upgrades netfilter-persistent iptables-persistent python3-venv

say "Automatic security updates"
cat > /etc/apt/apt.conf.d/20auto-upgrades <<'CONF'
APT::Periodic::Update-Package-Lists "1";
APT::Periodic::Unattended-Upgrade "1";
CONF

say "Time: UTC"
timedatectl set-timezone UTC

say "Swap (2 GB)"
if ! swapon --show | grep -q '/swapfile'; then
  [ -f /swapfile ] || { fallocate -l 2G /swapfile; chmod 600 /swapfile; mkswap /swapfile >/dev/null; }
  swapon /swapfile
fi
grep -q '^/swapfile ' /etc/fstab || echo '/swapfile none swap sw 0 0' >> /etc/fstab

say "IPv6 by DHCPv6 (the VNIC's address, as on sportbet-web)"
# Same interface id as cloud-init's own netplan file, so netplan merges the two
# definitions instead of matching one device twice.
iface="$(ip -o -4 route show to default | awk '{ print $5; exit }')"
[ -n "$iface" ] || { echo "no default IPv4 route: cannot tell the interface" >&2; exit 1; }
cat > /etc/netplan/60-ipv6.yaml <<YAML
network:
  version: 2
  ethernets:
    $iface:
      dhcp6: true
YAML
chmod 600 /etc/netplan/60-ipv6.yaml
netplan apply

say "SSH: keys only, no root login"
cat > /etc/ssh/sshd_config.d/10-sportbet.conf <<'CONF'
PasswordAuthentication no
KbdInteractiveAuthentication no
PermitRootLogin no
CONF
sshd -t
systemctl reload ssh

say "Docker Engine + Compose plugin"
if ! command -v docker >/dev/null 2>&1; then
  install -m 0755 -d /etc/apt/keyrings
  curl -fsSL https://download.docker.com/linux/ubuntu/gpg -o /etc/apt/keyrings/docker.asc
  chmod a+r /etc/apt/keyrings/docker.asc
  # shellcheck source=/dev/null # /etc/os-release only exists on the target host, not in lint
  . /etc/os-release
  echo "deb [arch=$(dpkg --print-architecture) signed-by=/etc/apt/keyrings/docker.asc] https://download.docker.com/linux/ubuntu ${VERSION_CODENAME} stable" \
    > /etc/apt/sources.list.d/docker.list
  apt-get update -q
  apt-get install -yq docker-ce docker-ce-cli containerd.io docker-buildx-plugin docker-compose-plugin
fi
DAEMON_JSON='{
  "log-driver": "json-file",
  "log-opts": { "max-size": "10m", "max-file": "3" }
}'
if [ "$(cat /etc/docker/daemon.json 2>/dev/null || true)" != "$DAEMON_JSON" ]; then
  printf '%s\n' "$DAEMON_JSON" > /etc/docker/daemon.json
  systemctl restart docker
fi
systemctl enable --now docker >/dev/null

say "Node 24 and the browser libraries Playwright needs"
if ! node -v 2>/dev/null | grep -q '^v24\.'; then
  curl -fsSL https://deb.nodesource.com/setup_24.x | bash -
  apt-get install -yq nodejs
fi
npx -y "playwright@$PLAYWRIGHT_VERSION" install-deps chromium

say "OCI CLI (backups authenticate as this instance; no stored credential)"
if [ ! -x /usr/local/bin/oci ]; then
  curl -fsSL -o /tmp/oci-install.sh https://raw.githubusercontent.com/oracle/oci-cli/master/scripts/install/install.sh
  bash /tmp/oci-install.sh --accept-all-defaults --install-dir /opt/oracle-cli --exec-dir /usr/local/bin --script-dir /opt/oracle-cli/bin
  rm -f /tmp/oci-install.sh
fi

say "runner user and /srv/sportbet-new"
id runner >/dev/null 2>&1 || useradd --create-home --shell /bin/bash runner
usermod -aG docker runner
install -d -m 755 -o runner -g runner /srv/sportbet-new /srv/sportbet-new/staging /srv/sportbet-new/edge
if [ ! -f /srv/sportbet-new/staging/.env ]; then
  umask 077
  printf 'POSTGRES_PASSWORD=%s\n' "$(openssl rand -hex 24)" > /srv/sportbet-new/staging/.env
  chown runner:runner /srv/sportbet-new/staging/.env
fi
docker network inspect edge >/dev/null 2>&1 || docker network create edge >/dev/null

say "Host firewall: 80 and 443, IPv4 and IPv6"
open_port() {
  local tool="$1" file="$2" port="$3"
  local rule="-p tcp -m state --state NEW -m tcp --dport $port -j ACCEPT"
  # shellcheck disable=SC2086 # $rule is a deliberately word-split argument list for iptables
  if ! $tool -C INPUT $rule 2>/dev/null; then
    local at
    at=$($tool -L INPUT --line-numbers -n | awk '$2 == "REJECT" { print $1; exit }')
    # shellcheck disable=SC2086 # $rule is a deliberately word-split argument list for iptables
    if [ -n "$at" ]; then $tool -I INPUT "$at" $rule; else $tool -A INPUT $rule; fi
  fi
  if [ -f "$file" ] && ! grep -qF -- "-A INPUT $rule" "$file"; then
    awk -v line="-A INPUT $rule" '!done && /^-A INPUT .*-j REJECT/ { print line; done = 1 } { print }' \
      "$file" > "$file.new" && mv "$file.new" "$file"
  fi
}
for port in 80 443; do
  open_port iptables /etc/iptables/rules.v4 "$port"
  open_port ip6tables /etc/iptables/rules.v6 "$port"
done

say "Timers: nightly backup, daily image prune"
install -m 755 "$here/backup.sh" /usr/local/bin/sportbet-backup
install -m 644 "$here/sportbet-backup.service" "$here/sportbet-backup.timer" \
  "$here/docker-prune.service" "$here/docker-prune.timer" /etc/systemd/system/
systemctl daemon-reload
systemctl enable --now sportbet-backup.timer docker-prune.timer

say "Done"
docker --version; docker compose version; node -v; oci --version
