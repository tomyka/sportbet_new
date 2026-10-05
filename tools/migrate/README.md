# tools/migrate - the production-copy reader

Loads a copy of sportbet's production data into a throwaway local Postgres,
recalculates it under both rule sets, and prints a load report (spec:
`docs/superpowers/specs/2026-09-30-core-schema-and-reader-design.md`, 2.2).
With `--parity` it also checks the new code's points against sportbet's own
(spec: `docs/superpowers/specs/2026-09-30-parity-checker-design.md`, 2.3; see
"Parity" below).
It runs by hand on the owner's PC only; it is in no image and no CI job
reaches production.

## Running it

```sh
pnpm --filter @sportbet/migrate build
node tools/migrate/dist/migrate.mjs [--keep] [--json] [--parity --sportbet-tag <commit>]
```

Run the built file with `node` directly, not through `pnpm start`: on
Windows, pnpm sits between the console and the reader, and Ctrl-C may end
pnpm before the reader has deleted the dump and its containers. Started
directly, the reader receives Ctrl-C itself.

- `--json` prints the report as JSON on stdout.
- `--keep` keeps the loaded Postgres running after the report, until
  Ctrl-C. Its URL - which holds the container's password - goes to
  stderr, never to stdout, so a report piped to a file never holds it.

Exit status: 0 nothing refused (and, with `--parity`, no row new-code-wrong
or refused), 1 something refused (or, with `--parity`, a row new-code-wrong
or refused, or a row of sportbet's recalculation refused with its parent),
2 the run could not
complete - including an interrupt, a refused Docker daemon, a load that
does not reconcile (a table whose rows read are not its loaded, skipped
and refused rows, or whose loaded rows are not the rows Postgres holds),
and any cleanup that could not be verified.

## The privacy guarantees, and how each is kept

The owner's condition: the nightly backup is downloaded to this PC only,
loaded into throwaway local containers, emails and names dropped, and the
dump deleted after every run - success or failure.

| Guarantee | How it is kept | Tested by |
|---|---|---|
| **This PC only.** | Before anything is fetched, the reader refuses a `DOCKER_HOST`, a `TESTCONTAINERS_HOST_OVERRIDE` or a docker CLI context that is not a unix socket, a named pipe or loopback TCP; then it refuses a Testcontainers runtime whose connection or port host is not local (`src/local-docker.ts`). It also refuses a set `TESTCONTAINERS_HUB_IMAGE_NAME_PREFIX`, which would make Testcontainers fetch every image, sportbet's own included, from another registry. The dump is streamed into MySQL over an exec on that same Testcontainers client - no separate `docker` process - so it can only reach the daemon that was checked. Container ports are published on 127.0.0.1 only. | `src/local-docker.test.ts`; `test/reader-failures.test.ts` (a remote `DOCKER_HOST` is refused and the fetcher is never called) |
| **Throwaway containers.** | Both containers keep their data on tmpfs (no Docker volume), use a random per-run password held only in memory, and carry the `sportbet-migrate` label. | `test/reader.test.ts` (no new volume after a run) |
| **Emails and names: in the throwaway Postgres only.** | The owner's consent for slice 4b (2026-10-05). `src/read-columns.ts` is the only place a sportbet column is named: from `users` it reads `id`, `username`, `name`, `surname` and `email`, and never a Google id, remember token or password; nothing is read from the audit or sign-in tables. They load into the run's own Postgres - deleted with it, or kept on this PC only with `--keep` - and nowhere else. The load report never holds a username, name, email or player id (with `--parity`, the parity report may name players by username - see "Parity"): every reported problem is the stage plus fixed text, a Zod or query summary without values, or an error's class (`src/problem.ts`); a refused address is counted by reason (`unnormalized-email`, `bad-email`, `email-collision`), never shown. | `test/reader.test.ts` (no sentinel or `@` in the report or the JSON report; a `pg_dump` of the loaded Postgres holds the loaded players' emails and names and no Google id, IP address or skipped user's); `src/problem.test.ts`; `test/reader-failures.test.ts` (no sentinel or `@` on any failure path, a folded-address collision at load included) |
| **The dump deleted after every run.** | The dump lives in one `sportbet-migrate-*` directory under the OS temp directory (`%TEMP%` on Windows), never in the repository. It is deleted as soon as MySQL has read it, and again on every path out: each cleanup step runs on its own, retrying while Windows still holds the file; on an interrupt the download is killed (its whole process tree) before its file is deleted. After cleanup the reader checks that the directory is gone and none of the run's containers is left, removes any it finds, and exits 2 if anything remains. | `test/reader-failures.test.ts` (a refused dump, a restore failure, schema drift, a fetcher that writes then throws, a failed load, a load that does not reconcile, an interrupt during the download and during a container's start, and a clean run without `--keep`: no directory, no labelled container; the preflight removes a crashed run's container and keeps a live one's) |

**Interrupts.** Ctrl-C (SIGINT), Ctrl-Break (SIGBREAK), closing the console
window (SIGHUP) and a kill (SIGTERM) each interrupt the run: the download is
killed, the dump and the run's containers - including one still
starting - are deleted, and the reader exits 2. A second signal, or a
cleanup still running after a minute, deletes what it can and exits at
once. If the reader is killed outright (Task Manager, `kill -9`),
Testcontainers' reaper removes its containers, and the next run's preflight
deletes any `sportbet-migrate-*` directory left behind.

**Whose leftovers are removed.** Every container the reader starts is
labelled `sportbet-migrate=<run id>` and `sportbet-migrate.pid=<its
process id>`, and its temporary directory is named
`sportbet-migrate-<process id>-<random>`. An interrupt and the final check
remove this run's containers only. The preflight removes a crashed run's
leftovers: the labelled containers and `sportbet-migrate-*` directories
whose process is no longer running (or that name none). A reader still
running in another terminal - or its `--keep` Postgres waiting for Ctrl-C -
is left alone. (Were a crashed run's process id reused by a live process,
its container would be kept; Testcontainers' reaper removes it anyway, and
`docker ps -a --filter label=sportbet-migrate` shows it.)

## Verifying after a run

On Windows, in PowerShell:

```powershell
Get-ChildItem $env:TEMP -Filter 'sportbet-migrate-*'   # nothing
docker ps -a --filter label=sportbet-migrate           # no rows
docker volume ls                                       # nothing new
git status                                             # clean
```

(in Git Bash: `ls "$TEMP" | grep sportbet-migrate-` prints nothing). The
report's `cleanup` lines say the same, and the run exits 2 if it is not
true. With `--keep`, connect to the printed URL and check `\d players` has
five columns (`id`, `username`, `email`, `name`, `surname`) and that nothing
else holds an `@`: `pg_dump` it and search.

## Parity (`--parity`)

```sh
node tools/migrate/dist/migrate.mjs --parity --sportbet-tag <commit>
```

runs the reader as above and adds a parity stage. Right after it has read
production's rows from the restored MySQL (oracle a), it starts sportbet's
own app from `sportbet-app:<commit>` beside that MySQL, runs
sportbet's full recalculation (`Recalculation::all()`), its standings
recalculation (`updateStandingPoints()`) and every league's leaderboard, and
reads the same copy again (oracle b) through the same `READ_COLUMNS` and
map - into memory only. After loading and recalculating as usual, it
classes every `point_results`, `point_standings`, `point_survivals` and
`game_odds` row:

| Class | New code (`sportbet`) against production | New code against sportbet's recalculation |
|---|---|---|
| `match` | equal | equal |
| `stale` | differs | equal |
| `new-code-wrong` | any | differs |
| `refused` | the reader refused the row, what it is scored from, or its game's odds | |

The report, after the load report (and in `--json`), gives the tag and the
backup, the counts per table and class, every `new-code-wrong` row by
username and game, team or round with all three values, `stale` rows
counted per column, the rows of sportbet's recalculation dropped with a
parent that did not load, each owner ruling's effect measured one `RuleSet`
field at a time (a field read only when another is on, on top of that one),
the points no single ruling explains and every ruling at once (only the
points add up to the whole: one row or player can change under two
rulings, so rows and players do not), every league's ranking against
sportbet's own, what it cannot check, and the verdict as its last line:

- `PARITY HOLDS`: no row `new-code-wrong` and nothing refused (exit 0);
- `PARITY HOLDS - <m> rows refused (exit 1)`: the new code agrees wherever it
  could compare, but some rows could not be compared;
- `PARITY FAILS: <n> rows new-code-wrong[, <m> refused]` (exit 1).

**Post only the verdict and the counts per class** on an issue: the rest
names players.

### Building sportbet's image

The reader never pulls the image, and no registry holds it: sportbet's CI
ships it to the web host with `docker save`. Build it on this PC from
sportbet's repository at the commit, with the Dockerfile and target
sportbet's CI builds production's image with (Git Bash; a few minutes the
first time):

```sh
git -C /d/Projects/sportbet fetch origin
git -C /d/Projects/sportbet archive <commit> | docker build -q -f docker/staging/Dockerfile --target app -t sportbet-app:<commit> -
```

The tests need `3eb95e7` (`SPORTBET_TEST_TAG` in
`test/support/reader-containers.ts`); CI builds the same one.

### Finding the commit production runs

```sh
gh api "repos/tomyka/sportbet/deployments?environment=production&per_page=5" --jq '.[] | "\(.id) \(.sha[0:7]) \(.created_at)"'
gh api repos/tomyka/sportbet/deployments/<id>/statuses --jq '.[0].state'
```

The newest deployment whose latest status is `success` is what production
runs; its seven-character sha is the tag (sportbet tags its images with
`git rev-parse --short=7`). A run against another commit proves nothing.

### What the old app may do on this PC

| Guarantee | How it is kept | Tested by |
|---|---|---|
| **Only the throwaway copy.** | Its container joins only an internal Docker network the run makes - no route off this PC, no port published, no mount - beside the reader's MySQL; it has a throwaway `APP_KEY`, `MAIL_MAILER=array`, `QUEUE_CONNECTION=sync`, `LOG_CHANNEL=null`, `CACHE_STORE=array`, `SESSION_DRIVER=array`. Container and network carry the reader's labels and are removed on every path, interrupts included; the run fails if either is left. | `test/reader-parity.test.ts` (no route out: an outbound connect and a DNS lookup both fail; no container or network left) |
| **Never pulled.** | The image is looked up on this PC first and the run refuses if it is missing; the container is started by the image's id, which no registry can answer; a `TESTCONTAINERS_HUB_IMAGE_NAME_PREFIX` is refused. | `src/containers.test.ts`, `src/local-docker.test.ts`, `test/reader-parity.test.ts` |
| **Nothing personal printed.** | It prints markers, ids, ranks and totals only; its script runs as a direct exec whose stdout is parsed, never shown, and whose stderr is dropped; a failure is its exit code and the steps it finished. The parity report names each `new-code-wrong` row and each ranking difference by the player's username - the owner's choice, on this PC only - and never a name, an email or an id. | `test/reader-parity.test.ts` (no sentinel or `@`), `src/sportbet-app.test.ts` |
