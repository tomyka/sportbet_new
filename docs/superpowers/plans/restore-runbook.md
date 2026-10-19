# Restore runbook: production database on sportbet-ci

How to get production's data back from the nightly backup. Read it once before
you need it; the drill (C) is how you know it works.

Facts this rests on (all in `infra/host/backup-production.sh`, decision 14):

- Production is the Compose project `sportbet-production` on `sportbet-ci`:
  containers `sportbet-production-postgres-1` (Postgres 18.6, database
  `sportbet`, user `sportbet`, data on the named volume `pgdata`) and
  `sportbet-production-web-1`. Caddy is the separate project `sportbet-edge`.
- The timer runs the backup at **02:37 UTC** every night. A dump is
  `pg_dump -U sportbet -d sportbet -Fc` (custom format: compressed, restored
  only with `pg_restore`, never `psql`), named
  `production-<YYYYMMDDTHHMMSSZ>.dump`. It holds every table of every schema
  (including Drizzle's migration table), no roles and no passwords.
- Each dump is restored into a throwaway `postgres:18.6` and every table's row
  count checked before it is kept; a failed night leaves `status: failed` in
  `/srv/sportbet-new/backup-status.json` and a mail (infra/host/backup-alert.sh).
- Copies: the newest 7 in `/srv/sportbet-new/backups` on the host (root only),
  and every night's in the bucket `sportbet-db-backup`, namespace
  `axox7rtziknk`, under `sportbet-new/production/`. The host can only add to
  the bucket (write-only link); reading it is done from the owner's PC.
- **What is lost:** everything saved after the dump's time. The newest dump is
  at most about 24 hours old (02:37 UTC; up to 26 h before the watchdog mails),
  so a restore loses up to a day of predictions, results, sign-ups and
  league changes. Players have to be told; there is no other copy.
- **Not in the dump:** secrets and settings (see "What is not in the repo"),
  and Caddy's certificates (reissued automatically within a minute).

Dumps hold every player's name and address: keep them root-only (0600), never
in the repo, an issue, a chat or a log, and delete copies on the PC afterwards.

## A. Restore the newest dump on the host (database damaged, host fine)

Time: about 5 to 10 minutes of work; web is down for about 1 to 3 minutes
(estimates for today's size, a dump of well under 10 MB; the drill in C
measures the real figure and should be written down at the end of it).

All on the host, `ssh sportbet-ci`, as root (`sudo -i`).

1. Choose the dump and check it is whole:

   ```
   cd /srv/sportbet-new/backups
   ls -lt production-*.dump | head
   cat /srv/sportbet-new/backup-status.json
   dump=/srv/sportbet-new/backups/production-<stamp>.dump   # the newest, unless it is the damaged one
   docker run --rm -i postgres:18.6 pg_restore -l < "$dump" | head -5
   ```

   The host has no `pg_restore` of its own (Postgres is only in containers), so
   a throwaway container reads the dump's table of contents. A readable list
   means the archive is a valid dump.
   If the newest dump's sha256 equals the status file's `sha256`, it is the one
   last verified: `sha256sum "$dump"`.

2. Stop web, so nothing writes (reminders, sign-ins and saves fail with 502 for
   the duration; that is expected):

   ```
   docker stop sportbet-production-web-1
   ```

3. Keep what is there now, in case the dump turns out to be the worse state:

   ```
   stamp="$(date -u +%Y%m%dT%H%M%SZ)"
   docker exec sportbet-production-postgres-1 pg_dump -U sportbet -d sportbet -Fc \
     > "/srv/sportbet-new/backups/pre-restore-$stamp.dump" || echo "the live database is unreadable: carry on"
   chmod 600 /srv/sportbet-new/backups/pre-restore-*.dump
   ```

   The name does not match `production-*.dump`, so the nightly rotation never
   deletes it; remove it by hand once the restore is accepted.

4. Restore:

   ```
   docker exec -i sportbet-production-postgres-1 \
     pg_restore -U sportbet -d sportbet --clean --if-exists --no-owner --no-privileges \
     < "$dump" 2> /tmp/restore.err; echo "pg_restore exit $?"
   wc -l /tmp/restore.err; head -20 /tmp/restore.err
   ```

   `--clean --if-exists` drops each object the dump holds before recreating it
   (the pipe the switch-over used for the data load). Messages about objects
   that did not exist are normal on a damaged database; any `ERROR` about data
   (`COPY`, a constraint, a foreign key) is not: stop, keep the output, and ask
   before going on. If the database is too damaged for `--clean` to work, drop
   and recreate it instead (web stays stopped):

   ```
   docker exec sportbet-production-postgres-1 psql -U sportbet -d postgres \
     -c 'DROP DATABASE sportbet WITH (FORCE)' -c 'CREATE DATABASE sportbet'
   ```

   and repeat the `pg_restore` without `--clean --if-exists`.

5. Start web and check:

   ```
   docker start sportbet-production-web-1
   docker ps --filter name=sportbet-production --format '{{.Names}} {{.Status}}'   # web turns (healthy) within ~1 minute
   curl -fsS https://sportbet.lt/api/health
   ```

6. Verify the data (counts per table; they must match what the dump held, which
   the nightly restore test checked against the live database at that time):

   ```
   docker exec sportbet-production-postgres-1 psql -U sportbet -d sportbet -At -c "
   select table_schema || '.' || table_name,
          (xpath('/row/c/text()', query_to_xml(format('select count(*) as c from %I.%I', table_schema, table_name), false, true, '')))[1]::text
   from information_schema.tables
   where table_schema not in ('pg_catalog', 'information_schema') and table_type = 'BASE TABLE'
   order by 1" | tee /tmp/counts-after.txt
   ```

   Then the owner signs in at https://sportbet.lt, opens the game page and the
   league table, and confirms the newest result they know of is there. Points
   need no recalculation: the stored rows came back with the dump.

7. Run the backup once, so the next night's state is known and the mail path is
   quiet: `systemctl start sportbet-production-backup.service && cat /srv/sportbet-new/backup-status.json`
   (status `ok`).

8. Tell the players that saves made after the dump's time (give the time in
   Vilnius: dump stamp is UTC) were lost and must be entered again. Remove
   `/srv/sportbet-new/backups/pre-restore-*.dump` and `/tmp/restore.err` once
   the owner accepts.

Rollback of the restore: stop web, `pg_restore --clean --if-exists --no-owner`
the `pre-restore-<stamp>.dump` of step 3 the same way, start web.

## B. The host's disk is gone: restore from the bucket onto a rebuilt host

Use this when `/srv/sportbet-new/backups` is gone or untrusted (a dead disk, a
rebuilt or replaced host). The bucket is the only copy then.

Time: the rebuild is the long part, roughly 1 to 3 hours of work and waiting
(Oracle console, DNS settling, image build or pull, certificates); the restore
itself is a few minutes. Everything saved after the chosen dump is lost (up to
24 hours).

**B1. On the owner's PC: download the newest dump.** The PC has the OCI CLI
configured for the tenancy.

```
oci os object list --namespace-name axox7rtziknk --bucket-name sportbet-db-backup \
  --prefix sportbet-new/production/ --all --query "data[*].name"
```

Names carry the UTC time (`production-20261020T023701Z.dump`), so the last one
sorts newest. Download it into a new, empty folder (the dump is personal data;
this folder is deleted at the end):

```
mkdir restore-dump && cd restore-dump
oci os object get --namespace-name axox7rtziknk --bucket-name sportbet-db-backup \
  --name sportbet-new/production/production-<stamp>.dump --file production-<stamp>.dump
```

Check it is a whole archive and not an empty or cut file (the bucket's own MD5
was checked by the nightly upload; this adds a read of the table of contents):

```
docker run --rm -i postgres:18.6 pg_restore -l < production-<stamp>.dump | head
```

If the newest dump is unreadable, take the next older one: the bucket keeps
every night as far as the host's write-only link is concerned (it cannot
delete), but a bucket lifecycle rule would be invisible to it, so look at the
list before trusting an old date.

**B2. Rebuild the host.** What the repo does, in order (the host log
`docs/superpowers/plans/prod-host-log.md` lists what was done on `sportbet-ci`):

1. Oracle console (owner, not in the repo): a host with Ubuntu 24.04 arm64
   inside the free A1 allowance, with the public network card and public IPv4
   (and the IPv6 address); SSH access. Today `sportbet-ci` carries production,
   and the account is exactly at its Always Free cap: a replacement host means
   deleting or resizing something first, which is the owner's decision.
2. Copy `infra/` over: `scp -r infra ubuntu@<host>:/tmp/sportbet-infra`.
3. Baseline: on a fresh Ubuntu, `infra/host/bootstrap.sh` (Docker, packages,
   firewall, as its header says); on a host that already runs Docker, only
   `sudo bash /tmp/sportbet-infra/host/prepare-production.sh` (directories, the
   `edge` network, ports 80 and 443, `jq`, the backup, alert and watchdog units).
4. Network card, only if the host has a second (public) card as `sportbet-ci`
   does: `sudo bash /tmp/sportbet-infra/host/public-nic.sh` (edit its card name,
   MAC and addresses to the new host's first; they are written into the script).
5. Settings: `sudo bash /tmp/sportbet-infra/host/production-env.sh https://sportbet.lt`.
   This **generates new** `POSTGRES_PASSWORD`, `AUTH_SECRET` and `CRON_SECRET`
   (see "What is not in the repo": a new `AUTH_SECRET` signs every player out).
   Then the secrets only the owner holds, one at a time, from the PC, each with
   its script: `set-resend-key.sh`, `set-google-key.sh` (run it once for the id
   and once for the secret), `set-backup-par.sh` (a new PAR: the old URL is not
   recoverable), `set-alert-email.sh`. Add `ADSENSE_CLIENT` to the `.env` by hand
   (`ca-pub-7290396604686794`, the old site's id, per the host log).
6. The application: `sudo IMAGE_PREFIX=... /tmp/sportbet-infra/ci/deploy-production.sh <tag>`.
   With the images in GHCR it pulls `<40-char sha>-arm64` (default prefix
   `ghcr.io/tomyka/sportbet_new`); the host log shows what was done on
   `sportbet-ci` instead (images built on the host, `IMAGE_PREFIX=sportbet-new PULL=0`).
   Use the commit that was deployed before: `cat /srv/sportbet-new/production/deployed-tag`
   on the old host if it is readable, else the host log or the latest green
   `main`. The script starts Postgres, runs the migrations (an empty database
   with the current schema), starts web and Caddy. A schema newer than the dump
   is fine: the dump is restored first and the migrate step is run once more
   (step B3.4).
7. DNS (owner, Hostinger hPanel, not in the repo): A and AAAA of `sportbet.lt`
   and `www` to the new host's public addresses (TTL 300), one record at a
   time; wait for the result of each. Caddy obtains the certificates once DNS
   answers (it retries by itself).

**B3. Restore the dump onto it.**

1. Copy it to the host (the PC; the host's `/tmp` is fine, it moves next):

   ```
   scp restore-dump/production-<stamp>.dump ubuntu@<host>:/tmp/
   ```

2. On the host: `sudo install -d -m 700 /srv/sportbet-new/backups`, then
   `sudo install -m 600 /tmp/production-<stamp>.dump /srv/sportbet-new/backups/ && rm /tmp/production-<stamp>.dump`.
3. Run A from step 2 on (stop web, restore with `--clean --if-exists
   --no-owner --no-privileges`, start web, verify). Step 3 (the safety dump) is
   of an empty database and can be skipped.
4. Run the migrations once more so a schema newer than the dump is brought
   forward: re-run `deploy-production.sh <tag>` (the migrate step is idempotent).
5. Delete the dump on the PC (`restore-dump` folder) and the one under
   `/tmp` on the host.
6. Run `systemctl start sportbet-production-backup.service`, check
   `backup-status.json` is `ok`, then the mail test (below), then tell the
   players what was lost.

## C. The drill: restore a dump into a throwaway Postgres on the PC

Do this once now and again after any change to the backup (it is also the
`switch-runbook.md` D step "restore drill"). The nightly job proves a restore
of the *local* dump on the host; this proves a restore of the *bucket's* copy
and that the owner can do it. It touches nothing on the host and in the cloud
except reading the bucket. Write the timings of your run at the bottom.

1. Download the newest dump (B1; about 10 seconds for a small dump) into a new
   folder and leave the shell in it.
2. Start a throwaway Postgres of the same version (first run pulls the image,
   about 1 minute; then a few seconds):

   ```
   docker run -d --name restore-drill -e POSTGRES_PASSWORD=drill postgres:18.6
   until docker exec restore-drill pg_isready -h 127.0.0.1 -U postgres; do sleep 1; done
   docker exec restore-drill createdb -U postgres sportbet
   ```

3. Restore exactly as the nightly test does (a few seconds to a minute; any
   error stops it):

   ```
   time docker exec -i restore-drill pg_restore -U postgres -d sportbet \
     --no-owner --no-privileges --exit-on-error < production-<stamp>.dump
   ```

4. Count every table:

   ```
   cat > counts.sql <<'SQL'
   select table_schema || '.' || table_name,
          (xpath('/row/c/text()', query_to_xml(format('select count(*) as c from %I.%I', table_schema, table_name), false, true, '')))[1]::text
   from information_schema.tables
   where table_schema not in ('pg_catalog', 'information_schema') and table_type = 'BASE TABLE'
   order by 1
   SQL
   docker exec -i restore-drill psql -U postgres -d sportbet -At < counts.sql > counts-drill.txt
   cat counts-drill.txt
   ```

5. Compare with production's counts, taken on the host (read-only):

   ```
   ssh sportbet-ci "sudo docker exec -i sportbet-production-postgres-1 psql -U sportbet -d sportbet -At" < counts.sql > counts-live.txt
   diff counts-drill.txt counts-live.txt
   ```

   The two differ only by what was saved since the dump (a few more
   predictions, perhaps a sign-up); the tables for players, tournaments,
   games, leagues and the migration history must have the same names on both
   sides, and no table may be missing or empty on the drill side that is not
   empty live. If the dump is the one in `backup-status.json` (`file`), its
   `sha256` must also equal `sha256sum production-<stamp>.dump` (on Windows
   `certutil -hashfile production-<stamp>.dump SHA256`): that shows the bucket's
   object is byte for byte what the host dumped.
6. Remove everything (the dump is personal data):

   ```
   docker rm -f restore-drill
   cd .. && rm -rf <the folder>
   ```

Record the drill here (date, who, dump used, minutes for download / restore,
result), so the next one starts from a known figure:

| Date | Dump | Download | Restore | Counts match | Notes |
|---|---|---|---|---|---|
| | | | | | |

## Alerts: how you learn a backup failed, and how to test it

- A failed or killed nightly run triggers `sportbet-backup-alert@sportbet-production-backup.service`
  (`OnFailure=`), which mails `ALERT_EMAIL` through Resend (key and sender from
  production's `.env`, address from `/etc/sportbet/alert.env`).
- `sportbet-backup-watch.timer` runs at 07:00 UTC daily and mails if
  `backup-status.json` is missing, not `ok`, or older than 26 hours. It stays
  silent when all is well. A failed night is therefore mailed twice, then once
  each morning until a run succeeds.
- Neither works if the host is down or its network or Resend are; an external
  uptime monitor on https://sportbet.lt/api/health is the cover for that
  (`switch-runbook.md` D).
- Test (on the host, as root): `sudo sportbet-backup-alert --test` sends a mail
  marked TEST; `sudo systemctl start sportbet-backup-watch.service` then
  `journalctl -u sportbet-backup-watch -n 5` shows `backup watch: ok`.

## What is not in the repo

Rebuilding needs all of these; the repo has the scripts, not the accounts or
values. Names only; values never go in a file, chat, issue or log.

| What | Where it lives | If lost |
|---|---|---|
| Oracle tenancy, the host, public VNIC, IPv6 address, security lists, quota `always-free-caps`, budget `always-free-watch` | Oracle console | owner rebuilds by hand (console or `oci`); the cap decides whether a second host fits at all |
| Bucket `sportbet-db-backup` and its write-only PAR `sportbet-new-nightly` | Oracle console | create a new PAR (write only, prefix `sportbet-new/`), store with `set-backup-par.sh` |
| DNS records of `sportbet.lt` and `www` (A, AAAA) | Hostinger hPanel | owner re-enters them; current addresses are in `prod-host-log.md` |
| `/srv/sportbet-new/production/.env`: `POSTGRES_PASSWORD`, `AUTH_SECRET`, `CRON_SECRET`, `APP_URL`, `MAIL_TRANSPORT`, `MAIL_FROM_ADDRESS`, `RESEND_API_KEY`, `ADSENSE_CLIENT`, `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET` | the host, root 0600; only on that disk | `production-env.sh` generates new `POSTGRES_PASSWORD` (harmless: the dump holds no roles), `AUTH_SECRET` (every player is signed out and sealed cookies are void; nothing else) and `CRON_SECRET` (regenerated together with `reminders.env`); the others are re-supplied below |
| `RESEND_API_KEY` | Resend dashboard (domain `sportbet.lt` verified there) | create a new key, `set-resend-key.sh` |
| `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET` | Google Cloud console (the old app's OAuth client; redirect URIs for `sportbet.lt` and `new.sportbet.lt`) | add a second client secret, `set-google-key.sh` |
| `ADSENSE_CLIENT` | AdSense account / the old site | the id is `ca-pub-7290396604686794` per the host log |
| `/etc/sportbet/backup.env` (`BACKUP_PAR_URL`), `/etc/sportbet/reminders.env` (`REMINDERS_URL`, `CRON_SECRET`), `/etc/sportbet/alert.env` (`ALERT_EMAIL`) | the host, root 0600 | recreated by `set-backup-par.sh`, `production-env.sh`, `set-alert-email.sh` |
| `STAGING_CRON_SECRET` and other GitHub secrets, repository variables | GitHub repository settings (owner) | owner's step; not needed for production's restore |
| Container images | GHCR `ghcr.io/tomyka/sportbet_new/{web,migrate}:<sha>-arm64`, built by `ci.yml` | rebuild from the commit on the host (`docker build --platform linux/arm64`) |
| Caddy certificates | Docker volume `caddy_data` on the host | reissued by Let's Encrypt once DNS answers |
| SSH keys to the host | the owner's PC, `ubuntu` user's authorized_keys on the host | Oracle console: add a key to a new host |

Not recoverable from anywhere but the dump: players, predictions, results and
leagues. Not recoverable at all: anything saved after the newest dump.

## Drill record, 2026-10-20 (lead)

- Newest dump in the bucket (`sportbet-new/production/production-20261019T023706Z.dump`, 154,896 bytes) downloaded with
  the oci CLI on the owner's PC, restored with `pg_restore --no-owner --no-privileges` into a throwaway `postgres:18.6`
  container: the restore itself took 6 seconds, the whole drill about 25 seconds.
- Counts equal the live database (25 players, 380 games, 9,500 match predictions, 4,323 match points, 7 messages) except
  survival picks, 149 against 154: the five picks saved after the dump, the loss the runbook promises (up to a day).
- Pitfall on Windows with Git Bash: it rewrites `/tmp/...` in a `docker exec` argument into a Windows path and
  `pg_restore` then finds no file. Run the drill with `MSYS_NO_PATHCONV=1`.
- The failure mail path was proved the same day: `sportbet-backup-alert --test` mailed the owner; the daily watchdog ran
  and found everything fine.
