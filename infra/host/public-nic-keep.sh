#!/usr/bin/env bash
#
# Keeps the reply routing of the public network card alive (as root). Idempotent.
#
#   scp infra/host/public-nic-keep.sh sportbet-ci-direct:/tmp/ && ssh sportbet-ci-direct 'sudo bash /tmp/public-nic-keep.sh'
#
# Why: public-nic.sh adds two `ip rule`s with the boot unit (traffic to Docker's
# networks keeps the main table; a marked connection uses table 100). systemd-networkd
# removes routing rules it does not own whenever it starts or reloads, and
# unattended-upgrades restarted it on 2026-10-22 at 06:53 UTC: both rules vanished, the
# replies of every web connection left through the wrong card and were dropped, and the
# site was down for about 9.5 hours while SSH (which does not go through Docker) kept
# working. (Declaring the rules to networkd with a [RoutingPolicyRule] drop-in was tried
# and rejected: networkd installed the fwmark rule without its mark, sending ALL traffic
# to table 100. Do not use `networkctl reload` either: it also drops the rules.)
#
# Two layers, either of which would have prevented that outage:
#  1. A drop-in for systemd-networkd.service runs the idempotent boot script
#     (/usr/local/sbin/sportbet-public-nic, installed by public-nic.sh) right after
#     networkd starts, so the rules are back within seconds of the event that removes them.
#  2. A timer runs the same script every minute, so anything else that removes the rules
#     (or the mangle marks) is undone within a minute.
#
# Undo: rm /etc/systemd/system/systemd-networkd.service.d/90-sportbet-public-nic.conf;
#   systemctl daemon-reload; systemctl disable --now sportbet-public-nic-check.timer;
#   rm /etc/systemd/system/sportbet-public-nic-check.{service,timer}
set -euo pipefail
[ "$(id -u)" -eq 0 ] || { echo "run as root (sudo)" >&2; exit 1; }
[ -x /usr/local/sbin/sportbet-public-nic ] || { echo "run public-nic.sh first (/usr/local/sbin/sportbet-public-nic is missing)" >&2; exit 1; }

install -d /etc/systemd/system/systemd-networkd.service.d
cat > /etc/systemd/system/systemd-networkd.service.d/90-sportbet-public-nic.conf <<'EOF'
# networkd removes routing rules it does not own when it starts; put ours back at once
# (see public-nic-keep.sh). The leading dash: a failure here must not fail networkd.
[Service]
ExecStartPost=-/usr/local/sbin/sportbet-public-nic
EOF

cat > /etc/systemd/system/sportbet-public-nic-check.service <<'EOF'
[Unit]
Description=Re-assert the reply routing of the public network card

[Service]
Type=oneshot
ExecStart=/usr/local/sbin/sportbet-public-nic
EOF

cat > /etc/systemd/system/sportbet-public-nic-check.timer <<'EOF'
[Unit]
Description=Re-assert the reply routing of the public network card every minute

[Timer]
OnBootSec=1min
OnUnitActiveSec=1min
AccuracySec=5s

[Install]
WantedBy=timers.target
EOF

systemctl daemon-reload
systemctl enable --now sportbet-public-nic-check.timer
systemctl is-active sportbet-public-nic-check.timer
systemctl cat systemd-networkd | grep -A2 "90-sportbet" | head -4
