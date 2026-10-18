#!/usr/bin/env bash
#
# Makes the public network card of sportbet-ci (enp1s0, 10.0.0.233, decision 14)
# answer the connections that arrive on it, as root. Idempotent.
#
#   scp infra/host/public-nic.sh sportbet-ci:/tmp/ && ssh sportbet-ci 'sudo bash /tmp/public-nic.sh'
#
# Why: a reply from a container (Docker NAT) is routed by the main table, which
# leaves through the private card with the public card's address, and the VCN
# drops it. So a connection that came in on enp1s0 is marked on the way in, its
# replies carry the mark back (restore-mark), and the mark selects routing table
# 100, whose only route is the public subnet's gateway (the rule is added by
# the boot unit, not netplan, which has no mark-only policy). Nothing else changes:
# the private card, SSH and the old app's staging keep the main table.
#
# Undo: ip rule del fwmark 100 table 100; the two mangle rules; then
#   systemctl disable --now sportbet-public-nic; rm /etc/systemd/system/sportbet-public-nic.service /usr/local/sbin/sportbet-public-nic
set -euo pipefail
[ "$(id -u)" -eq 0 ] || { echo "run as root (sudo)" >&2; exit 1; }

cat > /etc/netplan/60-public-nic.yaml <<'EOF'
network:
  version: 2
  ethernets:
    enp1s0:
      match:
        macaddress: "02:00:17:00:0d:77"
      set-name: "enp1s0"
      dhcp4: false
      addresses:
        - 10.0.0.233/32
      routes:
        - to: 0.0.0.0/0
          via: 10.0.0.1
          on-link: true
          table: 100
      routing-policy:
        - from: 10.0.0.233/32
          table: 100
          priority: 100
EOF
chmod 600 /etc/netplan/60-public-nic.yaml

cat > /usr/local/sbin/sportbet-public-nic <<'EOF'
#!/bin/sh
# Mark connections that arrive on the public card; restore the mark on their replies.
iptables -t mangle -C PREROUTING -i enp1s0 -m conntrack --ctstate NEW -j CONNMARK --set-mark 100 2>/dev/null \
  || iptables -t mangle -A PREROUTING -i enp1s0 -m conntrack --ctstate NEW -j CONNMARK --set-mark 100
iptables -t mangle -C PREROUTING -j CONNMARK --restore-mark 2>/dev/null \
  || iptables -t mangle -A PREROUTING -j CONNMARK --restore-mark
# Traffic for Docker's own networks (a marked connection redirected to a container)
# keeps the main table, ahead of the mark rule below.
ip rule show | grep -q 'to 172.16.0.0/12 lookup main' || ip rule add to 172.16.0.0/12 table main priority 80
# The mark selects the public card's routing table (netplan has no mark-only policy).
ip rule show | grep -q 'fwmark 0x64 lookup 100' || ip rule add fwmark 100 table 100 priority 90
EOF
chmod 755 /usr/local/sbin/sportbet-public-nic

cat > /etc/systemd/system/sportbet-public-nic.service <<'EOF'
[Unit]
Description=Reply routing for the public network card
After=network-online.target docker.service
Wants=network-online.target

[Service]
Type=oneshot
RemainAfterExit=yes
ExecStart=/usr/local/sbin/sportbet-public-nic

[Install]
WantedBy=multi-user.target
EOF

systemctl daemon-reload
systemctl enable sportbet-public-nic.service
netplan apply
# After netplan: it drops routing rules it does not own.
systemctl restart sportbet-public-nic.service
sleep 4
ip rule | head -5
iptables -t mangle -S PREROUTING
