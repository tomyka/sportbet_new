# Switch-over and fallback runbook (decisions 7 and 14)

Moves sportbet.lt and www from the old app on `sportbet-web` to the new one on
`sportbet-ci`, with the old app frozen as the fallback. Written 2026-10-18 from
the repo and the old repo's docs only: nothing here was checked on a host.
Anything marked **[unverified]** must be confirmed (read-only) before its step.

**Who:** *Lead* runs every host command (ssh to `sportbet-ci` and
`sportbet-web`). *Owner* does the Oracle console, Hostinger hPanel, Resend and
GitHub steps, one instruction at a time, and decides go and no-go. Nothing
below that creates or changes a cloud resource starts without the owner's yes.

## Facts and what could not be verified

Known from the repo: production runs on `sportbet-ci` (compose project
`sportbet-production`, Caddy project `sportbet-edge`, files in
`/srv/sportbet-new`); `new.sportbet.lt` already serves the rehearsal with a
Let's Encrypt certificate, public address 129.151.205.113 on the second VNIC;
the reader's `--keep` Postgres and `pg_restore --clean` are the data path; the
reminder timer's files are installed and it is not enabled; the reader fetches
the old app's dumps from bucket `sportbet-db-backup`, prefix `sportbet-web/`.

- **[unverified] Bucket name.** The reader's code and the staging backup say
  `sportbet-db-backup`; the old repo's docs and memory say `sportbet-db-backups`.
  One of them is wrong. Lead: `oci os bucket list` (read-only). The new backup's
  script never names the bucket (the PAR URL carries it), so it works with either.
- **[unverified] IPv6 on the new VNIC.** Hostinger publishes a hidden AAAA record
  for the domain that hPanel cannot show or delete; the old app only works
  because an explicit AAAA for `@` points at `sportbet-web`
  (2603:c026:301:3100:0:53f9:5d2c:ad1, old `docs/oci.md`). Once the A record
  moves, that AAAA would still point at the old host, and deleting it brings the
  hidden record back (IPv6 visitors and Let's Encrypt go to Hostinger; on the
  old cutover night issuance failed for 45 minutes). The new VNIC's IPv6 is not
  recorded in `prod-host-log.md`, and `infra/host/public-nic.sh` handles IPv4
  only (no policy routing for v6). So step A4 is needed.
- **[unverified]** Whether `sportbet-web`'s Caddy redirects `www` to the apex or
  serves both; the TTL currently on the records; Hostinger's lowest allowed TTL;
  the unit name of the old nightly backup (memory says `sportbet-backup`) and of
  the old scheduler container; whether the old app has a maintenance switch
  (`php artisan down`); whether the Resend domain `sportbet.lt` is verified for
  this account; whether the old site shows AdSense (compose passes
  `ADSENSE_CLIENT` only when set).
- **[unverified]** How the 1 OCPU, 6 GB `sportbet-ci` copes with the old
  staging, the old runner and production together (it did with the rehearsal).
  Watch `free -m` and load during B-steps.

## A. Preparation (days before; nothing visible to players)

**A1. Owner: the backup PAR.** Oracle console, Object Storage, the backup
bucket (see the bucket-name fact), Pre-Authenticated Requests, Create:

- Target: the bucket, or "objects with prefix" if the console offers it - then
  prefix `sportbet-new/` (the new app writes `sportbet-new/production/...`; the
  old app's nightly dump is `sportbet-web/...`, so the two never collide; the
  reader lists only `sportbet-web/`). **[unverified]** whether a prefix-limited
  write PAR exists in this console; if not, the whole-bucket PAR is what the old
  app uses and is acceptable.
- Access type: **Permit object writes** only. Never reads or listing.
- Expiry: the console's default is 7 days and the old app's PAR died at day 7
  (2026-09-30; four nights lost). Choose a date years out (2031 or later, as the
  old one was renewed) and write the date down; the backup check turns red 26 h
  after the first failed upload, and the script says "404 means the PAR expired".
- Copy the URL (ends in `/o/`). It is a credential: it goes to the clipboard,
  never into chat, a file, an issue or a command line.

**A2. Lead: store and prove the PAR.** From the laptop with the URL on the
clipboard (the script reads stdin, checks the URL's shape, proves it by
writing `par-check/<time>-from-<host>.txt`, and only then writes
`/etc/sportbet/backup.env`, root 0600):

```
scp infra/host/set-backup-par.sh sportbet-ci:/tmp/
powershell -NoProfile -Command "Get-Clipboard" | ssh sportbet-ci 'sudo bash /tmp/set-backup-par.sh'
```

Rollback: none needed; a failed check changes nothing. To renew an expired PAR,
repeat A1 and A2.

**A3. Lead: install the scripts, prove them, enable the timer.**

1. Re-run `prepare-production.sh` (it installs `backup-production.sh` as
   `/usr/local/bin/sportbet-production-backup`, plus `jq`, and enables the
   timer once `backup.env` exists).
2. `sudo sportbet-production-backup --dry-run`: dumps the running production
   Postgres, restores into a throwaway `postgres:18.6`, compares every table's
   count, prints the byte count and sha256. No upload, no local copy, no status
   file, and it works before A1. Tested 2026-10-18 on a stand-in container
   named like production's: passes, leaves no container.
3. `sudo systemctl start sportbet-production-backup.service`, then
   `cat /srv/sportbet-new/backup-status.json` (status `ok`, a recent
   `updated_at`) and a new object under `sportbet-new/production/` in the
   console (owner may look; the host cannot list it).
4. `systemctl list-timers sportbet-production-backup.timer` shows 02:37 UTC.

Rollback: `sudo systemctl disable --now sportbet-production-backup.timer`.
Data in the dump is rehearsal data until B3; dumps hold names and addresses
after it (local copies are root-only, 7 kept).

**A4. Owner then Lead: IPv6 for the new host.** Owner, Oracle console: add an
IPv6 address to the `sportbet-ci-public` VNIC (the public subnet already has
the `2603:c026:301:3100::/64` prefix, the route `::/0` to the internet gateway
and the ingress rule `::/0` TCP 80/443, per the old docs). This creates a cloud
resource: lead asks the owner first. Lead then makes the host answer on it,
including the reply-path policy routing that `public-nic.sh` does for IPv4, and
checks `curl -6 https://new.sportbet.lt`-style reachability once an AAAA for
`new.sportbet.lt` exists (owner adds it in hPanel). Do not proceed to C
without a working IPv6 path. Rollback: remove the AAAA for `new` and the
VNIC address.

**A5. Owner: lower the TTL** of `A @`, `AAAA @` and the `www` CNAME to the
lowest hPanel allows (300 s ideal), at least as long as the old TTL before the
switch day (if it is 4 h, do this the day before). Rollback: nothing visible;
raise it again after the fallback window.

**A6. Owner then Lead: Resend.** Confirm in Resend that the domain
`sportbet.lt` is verified (SPF/DKIM green; the old app already sends from it,
so likely yes) **[unverified]**. Create (or reuse) an API key with sending
access only. Lead stores it with `infra/host/set-resend-key.sh` (stdin, never a
command line; it redeploys web). Test: sign in to `new.sportbet.lt` with an
address that is not the Resend account owner's and see the code arrive (the
`onboarding@resend.dev` trap in the old `docs/email-delivery.md`).
`MAIL_FROM_ADDRESS` is already `noreply@sportbet.lt`. Rollback: put the
placeholder key back (mail stops; nothing else changes).

**A7. Lead: rehearsal of B and the parity gate on a fresh copy.** Decision 14
requires a clean rehearsal before the day: run B2 to B5 once for real against
the rehearsal host (the data load replaces rehearsal data) and keep the timings.

## B. Freeze night (a quiet day chosen by the owner; no players lose anything)

The window between B1 and C is the old app being read-only: keep it short
(target under 90 minutes).

**B1. Lead: freeze the old app, with the owner's yes.** On `sportbet-web`,
by hand (decision 14: no deploys; this is an operational change): stop the
old scheduler container (so it sends no reminder from now on) and put the app
in maintenance mode if it has one **[unverified]**; otherwise stop the php
container. Owner posts any notice they want. Rollback: start the scheduler and
`php artisan up` (or start the container); the old app is exactly as it was,
since nothing was written to it.

**B2. Lead: fresh backup of the old app.** `sudo systemctl start sportbet-backup`
on `sportbet-web` **[unverified unit name]**; confirm
`/srv/sportbet/backup-status.json` is `ok` and new. Owner (PC): run the reader
(B3); its report names the backup it took and its age, which must be after B1.
Rollback: nothing changed.

**B3. Owner and Lead: final data load.** Owner, on the PC (reader runs on the PC
only, decision 7 and `tools/migrate/README.md`):
`node tools/migrate/dist/migrate.mjs --keep` and leave it running; it prints
the kept Postgres URL to stderr (the URL holds a password: never share it).
Load report: exit 0, nothing refused. Lead then, with the web container
stopped so nothing writes (`docker compose ... stop web`), pipes
`pg_dump -Fc` of the kept Postgres into the host's postgres container with
`pg_restore --clean --if-exists --no-owner` (the pipe used for the rehearsal),
and starts web again. Checks: row counts per table equal the report's;
`sportbet-production-backup --dry-run` passes on the loaded data. Rollback:
the host holds only rehearsal data before this step, so a failed load is
repeated (`--clean`), or `sportbet-production-backup`'s local copy from A3 is
restored. The dump and containers on the PC are deleted by the reader on
Ctrl-C; owner confirms with the README's "Verifying after a run".

**B4. Owner: parity gate.** The same backup, same commit as deployed:
`node tools/migrate/dist/migrate.mjs --parity --sportbet-tag <commit>`.
Go only if exit 0: no `new-code-wrong`, no `refused`. Anything else is a stop:
rollback is B1's, and the date is moved. The report may name players on the PC
only; only the verdict and counts go on an issue.

**B5. Lead and Owner: check the loaded production on `new.sportbet.lt`.** Owner
signs in with their own account (the emailed code) and compares with the old
app's last state: the league table, leaderboard and one summary, the standings
page and the survival page. Lead: `/api/health`, `docker compose ... logs web`
without errors, and that the reminder timer is still **disabled**
(`systemctl is-enabled sportbet-reminders.timer`). **Go or no-go: owner's.**
Players must sign in again on the new app (its sessions are its own)
**[unverified: the owner should say so in the notice]**.

## C. The switch

Order matters: the certificate needs DNS first (HTTP-01; DNS-01 is not available
with stock Caddy and Hostinger), so there is a brief window.

**C1. Lead: prepare, do not apply.** Add to `infra/edge/caddy/Caddyfile.production`
(committed by the lead; this runbook edits nothing there) a block
`sportbet.lt { encode zstd gzip; reverse_proxy production-web:3000 }` and a
`www.sportbet.lt` block redirecting to `https://sportbet.lt{uri}` (permanent) -
or serving both, matching the old app's behaviour **[unverified]**: owner or
lead checks `curl -sI https://www.sportbet.lt`. No `noindex` header on these.
Keep the `new.sportbet.lt` block with its `noindex` until retirement. Do **not**
deploy the file yet: with DNS still on the old host Caddy would try HTTP-01
against the old host, fail, and retry, and Let's Encrypt limits failed
validations (5 per hour per hostname).

**C2. Owner: DNS in hPanel, one record at a time**, lead waiting for each:
1. `A @` to the new host's public IPv4 (129.151.205.113 per the host log, lead
   confirms the number the owner types);
2. `AAAA @` to the new host's IPv6 (A4) - an explicit record, replacing the one
   for `sportbet-web`; never delete it without a replacement (the hidden
   Hostinger AAAA returns);
3. `www` stays a CNAME to `sportbet.lt`.
Note the old values (`129.151.212.153`, `2603:c026:301:3100:0:53f9:5d2c:ad1`,
**[unverified]** the live ones) for rollback.

**C3. Lead: apply within a minute of C2.** Set `APP_URL=https://sportbet.lt` in
`/srv/sportbet-new/production/.env` and `REMINDERS_URL` in
`/etc/sportbet/reminders.env` (re-running `production-env.sh https://sportbet.lt`
keeps every existing key and rewrites the reminder file), then run
`infra/ci/deploy-production.sh <tag>` with the Caddyfile from C1 (it reloads Caddy
and recreates web). Caddy asks for the certificate on reload. Visitors whose
resolvers already hold the new address and arrive before issuance see a
certificate error; with a 300 s TTL and a prompt reload this is minutes. If
issuance fails, `docker logs sportbet-edge-caddy-1`, check `dig A` and
`dig AAAA` **from a public resolver** (the old cutover's lesson), then reload
again. Rollback within this step: C6.

**Alternative, to remove the window (not default).** The old host's Caddy
could proxy `/.well-known/acme-challenge/*` to the new host before DNS moves,
so the certificate is issued while DNS still points at the old host. It means
editing `sportbet-web`'s live config (read-only by the project's rule), so
only on the owner's explicit yes.

**C4. Lead: verify.** `curl -sI https://sportbet.lt` and `https://www.sportbet.lt`
(valid certificate, 200 or the redirect), `/api/health`, `dig A`/`dig AAAA` against
1.1.1.1 and 8.8.8.8, a sign-in from the owner's phone on mobile data (IPv6 path),
`X-Robots-Tag` absent on the apex.

**C5. Lead: scheduled jobs.** Only after C4, and only with B1's scheduler still
stopped: `sudo systemctl enable --now sportbet-reminders.timer`; watch
`journalctl -u sportbet-reminders` for the first tick (the response is counts
only). The reader carried sportbet's `reminded_at`, so no game already
reminded should be mailed again **[unverified end to end: check the first
tick's count against the next games before trusting it]**. Rollback:
`systemctl disable --now sportbet-reminders.timer`.

**C6. Rollback of the switch (any time in the fallback window).** Owner: set
`A @` and `AAAA @` back to the noted old values (TTL 300 makes it minutes).
Lead: `systemctl disable --now sportbet-reminders.timer`; on `sportbet-web`
`php artisan up` (or start the container) and start the old scheduler. **What is
lost:** whatever players saved on the new app after C3 does not exist in the old
app, and there is no tool to carry it back. The cost of rolling back grows with
every prediction saved; decide early, and say so in the owner's notice. After a
rollback, a new attempt starts again from B1 with a fresh dump.

**C7. Owner: AdSense** (if the old site shows ads **[unverified]**): give the
publisher id; lead adds `ADSENSE_CLIENT` to the `.env` and redeploys.

## D. Monitoring from day one

- **Backup:** the nightly run at 02:37 UTC writes
  `/srv/sportbet-new/backup-status.json` (`status`, `reason`, `file`, `bytes`,
  `sha256`, `updated_at`); the failure reasons are readable ("upload failed (a
  404 means the PAR expired...)", "table X: a..b rows live, n restored", "terminated
  before it finished"). The `check` job of `backup-check.yml` already reads that
  path with the 26-hour rule but is `if: false` and targets runner label
  `sportbet-new`; to turn it on, lead picks a runner on `sportbet-ci` (the old
  runner's label is `sportbet` **[unverified, and the old runner is frozen]**)
  and changes the job - a workflow edit for the lead's review, not made here.
  `systemctl --failed` on the host also shows a failed backup or reminder run.
- **Reachable:** the `reachable` job checks `STAGING_URL`'s `/api/health`; the
  owner adds a repository variable for `https://sportbet.lt` (GitHub setting:
  the owner's step) and a job reading it. An external uptime monitor is better
  still because it does not depend on the host.
- **Mail:** Resend dashboard for bounces and the first reminder run.
- **Host:** `free -m`, `df -h /` (20 GB free at the start; dumps are 7 local
  copies), `docker ps` health, Caddy renewal logs (certificates renew about every
  60 days; the first renewal falls in the retirement discussion below).
- **Restore drill, once:** owner downloads one night's object from the bucket in
  the console, lead restores it into a scratch Postgres and compares counts. The
  nightly job proves a restore from the local dump, not from the bucket's copy.

## E. Fallback window and retiring `sportbet-web`

Window length is the owner's decision; suggested at least 14 days and at least
one full round scored on the new app. Retire only when all of these hold:

1. Every nightly backup in the window is `ok`, and the restore drill (D) passed.
2. A full round was scored on the new app and the results and points match what
   the owner sees as correct (the old app is frozen, so it is no oracle after C).
3. Reminders and sign-in mail were delivered for real; no unresolved incident.
4. At least one certificate renewal attempt succeeded, or the owner accepts it is
   untested (Caddy renews at about 30 days left).
5. A final dump of the old MySQL is in the bucket and its location written down.

Then, owner's yes per item: stop the old app; retire the MySQL HeatWave
instance and remove the old DNS notes; repurpose `sportbet-web` as the CI runner
and move staging back to Oracle (decision 14); raise the TTLs again; delete
the `new.sportbet.lt` block and DNS record. Nothing is deleted before the final
dump exists.

## Risks, in order

1. IPv6 path and the hidden AAAA (A4, C2): the one failure that took 45 minutes
   last time.
2. Players writing on the new app, then a rollback (C6): data cannot go back.
3. `sportbet-ci` at 1 OCPU and 6 GB carrying production, old staging and the old
   runner together.
4. An expired PAR: the old app lost four nights; a far-future expiry and the
   26-hour check are the defences, and the check workflow is not on yet.
5. Double reminders if the old scheduler is not stopped at B1.
