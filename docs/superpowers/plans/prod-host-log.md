# Production host log (sportbet-ci)

Every command that changes sportbet-ci for the new production stack
(decision 14), in order. No secrets, no values. Read-only inspection is not
listed.

## 2026-10-18

Read-only findings first:

- Ubuntu 24.04 arm64, 1 OCPU, 5.9 GB RAM (about 4.2 GB available with the old
  staging running), 2 GB swap, 20 GB free disk. Docker 29.8.1, Compose 5.5.1;
  neither `oci` nor Node is installed (not needed: backups go through a PAR).
- Public NIC `enp1s0` (10.0.0.233, public 129.151.205.113) is in the subnet
  whose security list already allows 80 and 443 from anywhere (IPv4 and IPv6),
  and 22 only from four owner addresses. The host's iptables allows only 22,
  then REJECTs: 80 and 443 still have to be opened on the host.
- The old staging Caddy publishes only `10.0.1.96:8081`, so ports 80 and 443 on
  the host are free. No `edge` Docker network and no `/srv/sportbet-new` yet.
  An older `docker-prune.timer` already exists (prunes unused images after 72 h).

Changes:

1. `scp` of a `git archive` of commit b6c6fee to `/tmp/src.tgz` and of the repo's
   `infra/` to `/tmp/sportbet-infra` (copies only; nothing installed yet).

## 2026-10-18 - lead's changes on sportbet-ci (no secrets)

- Oracle console (owner): second VNIC `sportbet-ci-public` in the public subnet with a public IPv4;
  DNS A `new.sportbet.lt` to that address.
- `/etc/netplan/60-public-nic.yaml`: static 10.0.0.233/32 on enp1s0, table 100 default route via the
  subnet gateway, rule `from 10.0.0.233`. A /24 here broke SSH (the connected route sent replies for
  sportbet-web out the wrong card); the safety timer restored the old state.
- `infra/host/public-nic.sh` (run by the owner): connmark on connections arriving on enp1s0, rule
  `fwmark 100 -> table 100`, rule `to 172.16.0.0/12 -> main` (a marked connection redirected to a
  container must keep the main table), boot unit `sportbet-public-nic`. Netplan has no mark-only policy,
  and `netplan apply` drops rules it does not own, so the unit runs after it.
- `prepare-production.sh` (80/443 open in iptables), `production-env.sh` (7 keys, placeholder Resend key
  so nothing can be mailed), arm64 images built on the host from b6c6fee, `deploy-production.sh
  rehearsal` with `IMAGE_PREFIX=sportbet-new PULL=0`.
- Result: Postgres 18.6, migrations applied, web and Caddy healthy; Caddy obtained a Let's Encrypt
  certificate; https://new.sportbet.lt answers 200 (health, home, leaderboard, rules, privacy). The
  database holds no data yet.

## 2026-10-18 - font, data reload, backup (lead, no secrets)

- Production data reloaded from the 2026-10-18 02:17 backup after the reader fix (TEXT columns decoded as UTF-8);
  pg_dump of the reader's kept Postgres piped into the host's Postgres with pg_restore --clean; web stopped during.
- Resend key stored with infra/host/set-resend-key.sh (stdin from the clipboard, never printed); web redeployed.
- Backup: owner chose the bucket sportbet-db-backup (the old app's bucket); the lead created a write-only PAR
  `sportbet-new-nightly` (AnyObjectWrite, prefix sportbet-new/, expires 2031-10-31) with the OCI CLI, stored it with
  infra/host/set-backup-par.sh over a pipe (file on the laptop deleted afterwards). Probe write and a real run both
  succeeded (sportbet-new/production/production-20261018T135943Z.dump, 153006 bytes); the nightly timer is enabled
  (02:37 UTC). Lesson: Object Storage refuses a chunked upload (501); upload a regular file.
