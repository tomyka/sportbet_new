# Phase 2.3: the parity checker - design

Part of epic #1 (Phase 2: 2.1 scoring domain #5 done, 2.2 core schema and
reader #9, **2.3 this**). Builds on: `docs/decisions.md` (6, 7, 10, 11),
`docs/phase-2-inventory.md` (slice 3, section 6), the rules catalogue
`docs/superpowers/specs/2026-09-29-euroleague-rules-catalogue.md`,
`docs/owner-rulings.md` and the reader's design
`docs/superpowers/specs/2026-09-30-core-schema-and-reader-design.md`, whose
privacy rules this design keeps unchanged except where the owner said
otherwise below. The owner chose the scope and the pass bar (2026-09-30) and
delegated every technical choice; each carries its reason.

## Goal

Decision 7: before switch-over, every stored `point_results`,
`point_standings` and `point_survivals` row of production is reproduced by
the new code. The checker proves it, and where it cannot, says exactly why.

One command on the owner's PC:

```text
pnpm --filter @sportbet/migrate start -- --parity --sportbet-tag <tag>
```

runs the reader as today (latest backup, throwaway MySQL and Postgres,
`READ_COLUMNS` only, everything deleted afterwards) and adds a parity stage
and a parity report.

## Owner decisions (2026-09-30)

- **Two oracles.** (a) production's rows as dumped; (b) the same copy after
  sportbet's own full recalculation. Both are compared, so a difference is
  classified without the owner judging it by hand.
- **Pass bar: zero "new code wrong".** Parity holds when the new code, under
  `sportbetRules`, equals oracle (b) on every row. Rows where only
  production differs are *stale* and reported as counts; before switch-over
  the owner runs the recalculation on production so they disappear too.
- **Extras in v1:** the impact of each owner ruling, and league rankings.
- **Usernames on screen.** The parity report printed on the owner's PC may
  name a player by username (it has to, to be read). Nothing else changes:
  no name, email or other personal field is read; nothing of the report goes
  to GitHub, commits or logs; what is posted on an issue is counts and the
  pass/fail verdict only.

## 1. Classification

Every row key (`point_results`: user and game; `point_standings`: user and
team; `point_survivals`: user and event (round); `game_odds`: game) gets one class:

| Class | New code (`sportbet`) vs (a) production | New code vs (b) old app recalculated |
|---|---|---|
| `match` | equal | equal |
| `stale` | differs | equal |
| `new-code-wrong` | any | differs |
| `refused` | the reader refused the row or its parent (reported by reason, as today) | |

"Differs" covers a missing row, an extra row, and each column that differs,
compared exactly: points in hundredths, standings values in ten-thousandths,
null distinct from zero (inventory section 6, "What it recomputes and
compares"). A `new-code-wrong` row lists the columns that differ with all
three values. `game_odds` is classified the same way but reported apart, as
an explanation of `point_results` differences (inventory section 6).

What it cannot check is stated in the report, as inventory section 6 lists
it: generated predictions are taken as stored, not regenerated (sportbet's
`Recalculation::all()` does not regenerate them either, so both oracles see
the same inputs); broken survival runs (audit Q3); odds of games whose
predictions changed after the result was saved.

## 2. Oracle (b): sportbet recalculates the copy

After the reader has read production's stored rows (oracle a) from the
restored MySQL, the checker starts one more container from the
`sportbet-app` image of the sportbet commit production runs, and in it runs,
through `php artisan tinker --execute`:

1. `app(App\Services\Recalculation::class)->all()` - every game with a
   result rescored, streaks rebuilt, survival rebuilt from the stored rows
   (what `/admin/recalculateAllGamePoints` runs). It skips generation and
   odds by design (`Recalculation.php`), so it is deterministic.
2. `app(App\Http\Controllers\PointStandingController::class)->updateStandingPoints()`
   (what `/admin/updateStandingPoints` runs).
3. For every league, sportbet's own ranking (`PointController::getAllUserPoints`
   for the league with every member visible, then `Ranking`), printed as JSON
   of league id, user id, rank and total - the input to section 4.

Then the reader reads the four points tables again, through the same
`READ_COLUMNS` and `sportbetColumns` factories as oracle (a), into memory.
Oracle (b)'s rows are never stored in Postgres: no new `points_source`,
nothing that could be read as live.

**Why this way:** sportbet's recalculation is plain service code, so it runs
without a browser or an admin session; the image of production's commit is
the exact code that wrote production's rows. Turned down: a separate tool over a
kept Postgres (the MySQL is gone by then, and the privacy guarantees would
have to be proved twice); an owner-run recalculation on a scratch copy (a
manual step in every rehearsal, which decision 7 repeats until clean).

**The container's limits:** it joins only the reader's private Docker
network (no internet, no host ports), with `APP_ENV=parity`, a throwaway
`APP_KEY`, `MAIL_MAILER=array`, `QUEUE_CONNECTION=sync`, `LOG_CHANNEL=null`;
its output is parsed and never printed raw. It carries the reader's
`sportbet-migrate` label, so the existing cleanup removes it on every path,
interrupts included, and the run fails if it is left.

**The image is built locally, never pulled.** sportbet publishes no image:
its deploy ships it with `docker save | ssh ... docker load`, and
tomyka/sportbet is private (planner finding, 2026-10-01). So the image is
built on the PC from the commit, with sportbet's own Dockerfile and target
(`git archive <sha> | docker build -f docker/staging/Dockerfile --target app
-t sportbet-app:<sha> -`), and the reader refuses to start if that image is
missing. The build reads only sportbet's code, no data.

**The tag** (sportbet's commit) is required: the report prints it, and a run
against a commit that is not production's proves nothing. The runbook says
how to read the commit production runs from the old repo's deployments.

## 3. Rulings impact

For each `RuleSet` field that `recalculateTournament` reads, the checker
recalculates once under `sportbetRules` with only that field set to its
`ruledRules` value, in memory, and compares with plain `sportbetRules`. The
report lists per field (named after its catalogue rule and ruling, e.g.
"ST-8, R-14: places paid only from the final table"): rows changed, players
affected, and total points changed. Fields that only govern entry (locks,
reopening, which round is current) change no stored row and are listed as
such. The full `ruledRules` run already stored by the reader is reported as
the total.

A field that `recalculateTournament` reads only when another is on names
that field as its prerequisite, and is measured on top of it: under
`sportbetRules` with both set, against the prerequisite alone (#14). A
prerequisite is a scoring field with none of its own. One field has one:

- CO-6, R-2, R-9 (fill-ins are not crowd votes), on top of CO-5, CO-7: the
  votes count only where the odds come from the votes.

A field that also acts alone has no prerequisite, even where another ruling
widens it: ST-6's null for an unscored place acts under `sportbetRules`
before a table has the place, and R-14 leaves more places unscored.

The points of the total that no line explains (rulings acting together
beyond a prerequisite) are one more line, so the lines' points plus it are
the total's:

- ST-4 on a table not marked final removes a position bonus R-14 already
  removed, so the two lines count it twice and the remainder gives it back.

Only points are summed. Rows and players are not: one row or player can
change under two rulings.

**Why one field at a time:** it attributes each change to exactly one
ruling, which the `RuleSet` design (one field per difference) makes cheap.
A prerequisite gives a field that cannot act alone its own share, and the
remainder keeps the section adding up without ordering the rulings.

## 4. League rankings

The reader already reads `leagues` and `league_members` (ids only). For
every league, the domain's `rankPlayers` over the new code's `sportbet`
totals is compared with sportbet's own ranking from section 2, step 3: rank
and total per player. A player whose rank differs is listed with both ranks.
Rankings are checked against oracle (b) only, since a ranking over stale
rows is stale too.

## 5. The parity report and exit status

After the load report, printed to stdout (and in `--json`):

- The sportbet tag and the backup's timestamp.
- Per table: counts per class. Verdict line, the report's last, in one of
  three forms: `PARITY HOLDS` (exit 0), `PARITY HOLDS - <m> rows refused
  (exit 1)`, or `PARITY FAILS: <n> rows new-code-wrong[, <m> refused]`. It
  names both signals, so a run that holds but refused a row does not read
  as clean (owner, 2026-10-01: the parity report owns its outcome).
- Every `new-code-wrong` row: table, username, game (teams and date) or team
  or round, each differing column with production, old-app and new-code
  values.
- `stale` rows: counts per table and per column, not listed one by one.
- Rulings impact (section 3) and rankings (section 4).
- What it cannot check (section 1).

Exit status: 0 parity holds and nothing was refused; 1 some row is
`new-code-wrong` or refused; 2 the run could not complete. Without
`--parity` the reader behaves exactly as today.

## 6. Structure

- `tools/migrate/src/sportbet-app.ts`: starts the old-app container on the
  reader's network, runs the three steps, returns their parsed output.
  Talks to Docker only through `containers.ts`.
- `tools/migrate/src/parity/compare.ts`: a pure function from the three sets
  of rows (production, old app, new code) to the classified result. No I/O.
- `tools/migrate/src/parity/rulings.ts`: the one-field-at-a-time runs, over
  the loaded `TournamentInputs`, calling `recalculateTournament` (the only
  way points are derived, CLAUDE.md).
- `tools/migrate/src/parity/rankings.ts`: the ranking comparison.
- `tools/migrate/src/parity/report.ts`: rendering, text and JSON.
- `run.ts` gains the parity stage between recalculation and the report.
- **One "recalculate under a rule set" operation in `packages/db`**
  (architecture candidate 3 of the #9 review; owner, 2026-10-01): given a
  tournament and a rule set, it reads what that rule set reads, calls
  `recalculateTournament` once, and saves the result under the rule set's
  own name as `points_source`, returning any refusal. The reader's load and
  the golden db test use it instead of pairing reads, rules and source by
  hand; the web's result entry (slice 7) will too. The rulings-impact runs
  (section 3) use the same read and `recalculateTournament`, without the
  save, since their rows are compared in memory only. The source is still
  named by the caller, through the rule set it passes, which the CLAUDE.md
  rule is amended to say.

Layering is unchanged: migrate -> db -> domain; nothing imports migrate.

## 7. Tests

- **compare.ts:** unit tests on the golden scenario with differences planted
  on purpose, one per class, and one per edge case of inventory section 6
  that can differ (knockout ending, negative difference points, missing odds
  row at 1.0, contrarian odds, generated rows, serija breaks and ordering,
  standings null vs 0, survival totals and resets, multi-tournament players,
  2-place precision). Exact comparison proved on values one hundredth apart.
- **rulings.ts, rankings.ts:** unit tests on the golden scenario; the
  rulings run for R-14 reproduces the four unscored exact places #9 already
  shows.
- **sportbet-app.ts and the whole run:** the reader's end-to-end tests on
  the synthetic golden dump, with the real `sportbet-app` image: the golden
  dump's production rows equal oracle (b), so the verdict is `PARITY HOLDS`;
  a second dump with a planted stale row yields exactly one `stale`; the
  container is gone afterwards; no personal field in the output.
- CI runs them in `pnpm test:migrate`, as today, after building the image
  from a pinned sportbet commit. Checking out the private tomyka/sportbet
  needs a fine-grained read-only (Contents) token as a GitHub secret: an
  owner step, one instruction when the plan reaches it.

## 8. Out of scope

- Oracle (b) for anything beyond the four points tables and rankings.
- Fixing a `new-code-wrong` row: each becomes its own issue.
- Football (decision 11).
- R-42 and R-38 (#8). Production runs R-42 since 2026-09-30 (sportbet
  1ac955f, recalculated, owner 2026-10-01), so #8's R-42 half lands before
  this issue (owner: #9, #8, #12, #11) and the checker is built and tested
  against that commit. R-38 follows sportbet#274 as a new commit to pin.
- Replaying results through the new app's own write path (slice 7).

## Records to update

- `docs/phase-2-inventory.md` section 6: the owner's choices (both oracles,
  the pass bar, usernames on screen).
- The reader's README: `--parity`, `--sportbet-tag`, and the runbook step
  for finding production's tag.
- `CLAUDE.md`, the production-copy reader paragraph: the old-app container
  and that the parity report may show usernames on the owner's PC only.

## Done when

- `pnpm test:migrate` in CI proves the parity stage on the synthetic dump
  (verdict, one planted stale row, cleanup, privacy).
- The owner has run `--parity` once on the latest backup with production's
  tag and read the report; the issue gets the verdict and the counts per
  class only. Every `new-code-wrong` row, if any, has its own issue.
