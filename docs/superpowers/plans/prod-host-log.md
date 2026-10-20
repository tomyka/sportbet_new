# Production host log (sportbet-ci)

Every command that changes sportbet-ci for the new production stack
(decision 14), in order. No secrets, no values. Read-only inspection is not
listed.

## 2026-10-18

Read-only findings first:

- Ubuntu 24.04 arm64, 1 OCPU, 5.9 GB RAM (about 4.2 GB available with the old
  staging running), 2 GB swap, 20 GB free disk. Docker 29.8.1, Compose 5.5.1;
  neither `oci` nor Node is installed (not needed: backups go through a PAR).
- Public NIC `enp1s0` (10.0.0.233, public <new-host-ip>) is in the subnet
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

## 2026-10-18 - Google sign-in on the host (lead, no secrets)

- Owner reused the old Google OAuth client: added the redirect URI https://new.sportbet.lt/auth/google/callback
  (sportbet.lt's was already there) and added a second client secret (the old one stays valid).
- Client id and secret stored with infra/host/set-google-key.sh (stdin from the clipboard, one setting per run,
  never printed, root-only settings file). Production compose passes them through when set.
- Images built on the host from 9dbd3fa (tag google), deployed with deploy-production.sh (IMAGE_PREFIX=sportbet-new
  PULL=0): migration 0026 applied, web healthy; the owner signed in with Google at new.sportbet.lt and the account
  linked by verified address.

## 2026-10-19 - IPv6 on the public card (lead, no secrets)

- Oracle (CLI): an IPv6 address `sportbet-new-ipv6` on the public VNIC (the subnet has <ipv6>/64).
- infra/host/public-nic.sh now also sets that address on enp1s0, a table-100 default route via the subnet's IPv6
  router (fe80::200:17ff:feed:3597) and a from-address rule; accept-ra and dhcp6 off on that card only so the main
  table gets no IPv6 default. Verified from sportbet-web: https://new.sportbet.lt/api/health over IPv6 answers 200
  with a valid certificate. For the switch the AAAA record of sportbet.lt and www must point at this address.

## 2026-10-19 - the switch-over (lead, no secrets)

- 20:33Z: the old site frozen (php artisan down, scheduler container stopped on sportbet-web; both reversible).
- 20:33Z: on-demand backup of the old database, sportbet-20261019T203353Z-daily.sql.gz in the bucket; loaded into the
  new Postgres by the reader (+ pg_dump pipe, pg_restore --clean): 25 players, 380 games, 9,500 predictions, 153
  survival picks. Parity holds on that backup (1,441 / 142 / 60 rows match, 0 new-code-wrong).
- ~20:37Z: the owner changed the A and AAAA records of sportbet.lt (TTL 300) to the new host (<new-host-ip> and
  <ipv6>). APP_URL=https://sportbet.lt and ADSENSE_CLIENT (ca-pub-7290396604686794, the
  old site's) set; deploy-production.sh applied the Caddyfile with sportbet.lt and www; both certificates issued
  within a minute (the first attempt for the bare name failed while DNS settled, Caddy retried).
- 20:45Z: the reminders timer enabled after the DNS check; first tick sent 0 (nothing due), no errors. Carried-over
  reminded_at marks: 89 rows, latest 2026-10-15.
- The old site stays in maintenance as the fallback. Rollback = DNS back to <old-host-ip> / <ipv6>,
  maintenance off (php artisan up), scheduler started; saves made on the new site are lost.

## 2026-10-20 - the old app retired (lead, owner's go-ahead)
- The old app's last data is the switch-over dump `sportbet-web/sportbet-20261019T203353Z-daily.sql.gz` (parity verified
  against it); the maintenance-mode night dump of 2026-10-20 02:17Z is in the bucket too. A copy of the switch-over dump
  is on the owner's PC, outside the repo.
- On sportbet-web: `sportbet-backup.timer` disabled; the `caddy`, `php` and `scheduler` containers stopped with restart
  policy `no` (stopped, not removed: `docker start` brings the old site back; the MySQL host is untouched).
- In tomyka/sportbet the `CI/CD` and `Check the backup` workflows are disabled (the backup check would go red on the
  stale status file).
- Not done: the MySQL host and sportbet-web itself stay until the owner decides what to repurpose them for (CI runner,
  staging per decision 12). The old repo's audit file leaves this repo (public) and is kept privately.
