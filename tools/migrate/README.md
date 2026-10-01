# tools/migrate - the production-copy reader

Loads a copy of sportbet's production data into a throwaway local Postgres,
recalculates it under both rule sets, and prints a load report (spec:
`docs/superpowers/specs/2026-09-30-core-schema-and-reader-design.md`, 2.2).
It runs by hand on the owner's PC only; it is in no image and no CI job
reaches production.

## Running it

```sh
pnpm --filter @sportbet/migrate build
node tools/migrate/dist/migrate.mjs [--keep] [--json]
```

Run the built file with `node` directly, not through `pnpm start`: on
Windows, pnpm sits between the console and the reader, and Ctrl-C may end
pnpm before the reader has deleted the dump and its containers. Started
directly, the reader receives Ctrl-C itself.

- `--json` prints the report as JSON on stdout.
- `--keep` keeps the loaded Postgres running after the report, until
  Ctrl-C. Its URL - which holds the container's password - goes to
  stderr, never to stdout, so a report piped to a file never holds it.

Exit status: 0 nothing refused, 1 something refused, 2 the run could not
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
| **Emails and names dropped.** | `src/read-columns.ts` is the only place a sportbet column is named: from `users` it reads `id` and `username`, nothing else, so no name, surname, email or Google id ever reaches the reader's memory. The report never holds a username, name, email or player id: every reported problem is the stage plus fixed text, a Zod or query summary without values, or an error's class (`src/problem.ts`). | `test/reader.test.ts` (no sentinel or `@` in the report, the JSON report or a `pg_dump` of the loaded Postgres); `src/problem.test.ts`; `test/reader-failures.test.ts` (no sentinel or `@` on any failure path) |
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
two columns (`id`, `username`), or `pg_dump` it and search for an `@`.
