# Phase 2.2: core schema, repositories and production-copy reader - design

Issue: [#9](https://github.com/tomyka/sportbet_new/issues/9), part of epic #1
(Phase 2: 2.1 scoring domain #5 done, **2.2 this**, 2.3 parity checker).
Builds on: `docs/decisions.md` (4, 5, 6, 7, 10, 11, 12), the rules catalogue
`docs/superpowers/specs/2026-09-29-euroleague-rules-catalogue.md`,
`docs/owner-rulings.md`, `docs/phase-2-inventory.md` (slice 1, sections 2
and 6) and the production facts at the end of
`docs/old-app-audit-2026-09-28.md`. The owner delegated every technical
choice below; each carries its reason and what was turned down. The data
handling rules in *Where production data may go* were decided by the owner
and are recorded as given.

## Goal

1. A Postgres schema for the Euroleague domain (decision 4) that holds
   everything `recalculateTournament` reads and everything it writes, plus
   production's own stored points, in one database without either
   overwriting the other.
2. Repositories in `packages/db` that load and save whole domain objects
   through the domain's `stored` factories (decision 10), including one call
   that loads a tournament's `TournamentInputs` and one that saves a
   `TournamentPoints` result under a named rule set.
3. `tools/migrate`: a reader that takes the latest nightly backup of
   sportbet's production MySQL, restores it into a throwaway MySQL, maps
   every value it needs through `sportbetColumns`, loads a throwaway
   Postgres through the repositories, runs `recalculateTournament` over the
   loaded tournament, prints a load report with no personal data, and
   deletes the dump and both containers.

Out of scope: see the last section.

## Where production data may go (owner, 2026-09-29)

Recorded as the owner decided it:

- The reader obtains production data **only** from the latest nightly
  backup in the Oracle Object Storage bucket, downloaded to this PC.
- It is loaded into a **throwaway local database**: a MySQL container
  matching production's MySQL major, to read the dump; the target is a
  throwaway local Postgres.
- **Emails and names are dropped at load.** Players keep only their id and
  username, plus what scoring needs (switched-off and hidden status).
- **The dump is deleted after every run.**
- **Nothing of it goes to Vercel/Neon, GitHub, commits or logs.**
- Euroleague only (decision 11).

The *Security and privacy* section says how the design holds each of these
and how the owner can check.

## Production facts this design relies on

Read on 2026-09-28 (audit) and 2026-09-29 (this spec, metadata only through
the laptop's OCI CLI; no object was downloaded):

| Fact | Value | Used for |
|---|---|---|
| Backup bucket | `sportbet-db-backup`, namespace `axox7rtziknk`, region `eu-stockholm-1`, objects under `sportbet-web/` named `sportbet-YYYYMMDDTHHMMSSZ-daily.sql.gz` (latest `sportbet-web/sportbet-20260929T021708Z-daily.sql.gz`, 89,009 bytes). sportbet's own `docs/database-backup.md` spells the bucket `sportbet-db-backups`; the CLI finds no such bucket. The same bucket also holds sportbet_new's own `sportbet-new/` backups, which the reader never touches. | fetch |
| Dump format | written by `app/Services/Backup/DatabaseDumpWriter.php` under `BackupPolicy`: one gzipped SQL file; a header (`-- engine : mysql <version>`, `-- no rows for : ...`, `-- nulled : ...`); per table `DROP TABLE IF EXISTS` then `SHOW CREATE TABLE` output, then extended INSERTs with one tuple a line; last line `-- SPORTBET DUMP COMPLETE`. `sessions`, `login_codes`, cache and queue tables are dumped empty; `users.remember_token` is nulled. **It still holds every player's name, surname, email and `google_id`, and `audit_logins` IP addresses.** | restore, privacy |
| Production MySQL | HeatWave `sportbet-db`, `mysql-version` 26.7.0; sportbet's own restore scripts use `mysql:26.7` | restore image |
| Scale | 1 tournament (Euroleague, survival on), 20 teams, 380 games, 250 `point_results` rows; no duplicates on any "one row per" key (P2), no duplicate usernames (P12), no cross-tournament games (P17), no rate-0 rounds (P16), no points for unscored games (P10), `point_standings` stored as `double` (P15), one switched-off player (P20) | constraints, report |
| Time zone | UTC everywhere (P13); `Carbon::today()` in UTC decides "end date passed" (`Tournament::effectiveStatus`: a tournament is finished once `end_date < today`, so it is still on for the whole of its end date) | `ends_on` |

## 1. Schema

### Identity: sportbet's ids are kept

Every migrated entity keeps sportbet's id as its primary key in the new
schema: `tournaments.id`, `rounds.id` (= `events.id`), `teams.id`,
`games.id`, `players.id` (= `users.id`), and the id of each stored
`point_survivals` row. Rows whose identity is a pair (a prediction, a points
row) use that pair as their key instead of a surrogate id.

- **Why:** the parity checker (2.3, decision 7) compares production's rows
  and recomputed rows by key; with the same ids on both sides that is a
  plain join, and every difference it reports names an id the owner can
  look up in the old admin. The URLs players already hold in sent reminder
  mails and bookmarks (`/prediction/game/{gameID}`, `/compare/{userID}`,
  inventory A5, A11) keep working after switch-over. The switch-over
  migration (decision 7) is this same load, so ids are fixed once, here.
- **How:** identity columns stay `generated always as identity`; the reader
  inserts with Drizzle's `overridingSystemValue()` and, after the load,
  moves each identity sequence past the highest loaded id (`setval`), so an
  id the new app creates later never collides with a migrated one.
- **Turned down:** fresh ids with a `legacy_id` mapping column (a second key
  on every table, a join in every checker query, broken links); keeping
  sportbet's ids but as `generated by default` identity (any insert could
  then supply an id by accident; `always` makes supplying one an explicit
  act).

The domain's ids are strings for teams, players and tournaments
(`TeamId`, `PlayerId`, `TournamentId`) and a positive integer for games
(`GameId`); a round is identified by its number in its tournament
(`RoundNumber` = sportbet's `event_day`). Repositories convert: an integer
key becomes its decimal text (`String(id)`), parsed back with Zod on the way
in; a round's database id never reaches the domain, only its number.

### Rule-set tagging: `points_source`

Every derived row (`game_odds`, `match_points`, `standings_points`,
`survival_points`) carries a `source` column of the enum
`points_source` = `production | sportbet | ruled`, and `source` is part of
each table's key:

- `production`: the row as production stored it, read by the reader. It is
  the parity oracle, and also an input: sportbet's full recalculation reads
  its stored odds (CO-7) and refolds its stored survival rows (SU-10).
- `sportbet`: what `recalculateTournament(inputs, sportbetRules)` derives.
- `ruled`: what `recalculateTournament(inputs, ruledRules)` derives - the
  rows sportbet_new goes live with.

- **Why:** the checker compares `production` with `sportbet` inside one
  database, and the live app's `ruled` rows can never be overwritten by a
  parity run or read by accident as live, because every repository call
  names its source and none has a default. The values are the domain's
  `RuleSet.name` union plus `production`, built from the domain's constant
  so they cannot drift.
- **Turned down:** one set of points tables per source (three copies of
  every table and constraint); a separate parity database (the checker then
  joins across databases, and the reader would have to load inputs twice);
  a nullable rule-set column with null meaning production (a null in a key,
  and "production" is a real value, not the absence of one).

### Enums (real Postgres enums, built from domain constants)

| Enum | Values | From |
|---|---|---|
| `format` | `euroleague` | `FORMATS` (exists) |
| `stage` | `regular`, `play-in`, `play-offs`, `final-four`, `final` | `STAGES` |
| `prediction_origin` | `real`, `fill-in`, `late-fill-in` | a new `PREDICTION_ORIGINS` const beside `PredictionOrigin` |
| `points_source` | `production`, `sportbet`, `ruled` | `production` plus a new `RULE_SET_NAMES` const beside `RuleSet` |

A test per enum asserts the database holds exactly the domain's values, in
order, as the Phase 1 `format` test does.

### Numbers

- Match points, serija and survival points: `numeric(8,2)` - hundredths, as
  the domain's `Points` and sportbet's `DECIMAL(8,2)`.
- Game odds: `numeric(8,2)` - hundredths, as `Odds` and `game_odds`.
- Standings points and standings odds: `numeric(10,4)` - ten-thousandths, as
  `StandingsPoints`, `StandingsOdds` and R-31 (production stores `double`;
  the reader converts, below).
- Whole numbers (scores, places, rates, round numbers, counts): `smallint`
  or `integer`.

node-postgres returns `numeric` as text; repositories parse that text into
fixed-point units exactly (one shared helper, `decimalUnits(text, places)`,
which refuses more places than the column has) and write
`Points.toString()` / `StandingsPoints.toString()`. No value passes through a
JavaScript float on the way in or out.

### Tables

Keys: **PK** primary key, **U** unique, **FK** foreign key. Every FK is
`on delete restrict` (what deleting a player or a game does is R-25 and a
later slice's decision). "Stored shape" means the column accepts what the
domain's stored factory accepts, not only what entry allows - the parity
rule in CLAUDE.md: a constraint must accept every row production holds.

**`tournaments`** (extended; `id`, `slug`, `name`, `format`, `created_at`
unchanged)

| Column | Type | Notes |
|---|---|---|
| `ends_on` | `date not null` | sportbet's `end_date`. The domain's `Season.endsAt` is 00:00 UTC of the following day, which is sportbet's own reading (`end_date < today`, UTC). The migration backfills staging's seeded rows; a production tournament without an end date is refused by the reader (see the owner question) |
| `standings_deadline_round` | `smallint null` | CHECK round-number invariant (>= 1); null = the format's round 5 (ST-2) |
| `survival` | `boolean not null` | sportbet's `survival_game` |
| `standings_table_final` | `boolean not null default false` | `TeamOutcomes.tableIsFinal` (R-14). sportbet does not record it; the reader loads false and says so in the report |

Not carried: `sport`, `status`, `start_date`, `description`, `cover_image`,
`is_public` - nothing in scoring reads them; the hub slice decides them
(`is_public` is inventory Q18).

**`rounds`** (sportbet's `events`)

| Column | Type | Notes |
|---|---|---|
| `id` | `integer` identity, PK | `events.id` |
| `tournament_id` | FK `tournaments` | U (`tournament_id`, `id`) for the composite FKs below |
| `number` | `smallint not null` | `event_day`; U (`tournament_id`, `number`) - `Season.create` refuses a duplicate round; CHECK round-number invariant |
| `name` | `text not null` | `events.event` ("1 turas"); display only |
| `stage` | `stage not null` | sportbet stores none; the reader names it (below) |
| `rate` | `smallint not null` | CHECK rate invariant (>= 1; `Rate.of`) |
| `survival` | `boolean not null` | `event_survival = 1` |
| `knockout` | `boolean not null` | `is_knockout` (MS-8) |

Not carried: `active` (C6), `round_type` (football's admin filter).

**`teams`**

| Column | Type | Notes |
|---|---|---|
| `id` | identity, PK | `teams.id` |
| `tournament_id` | FK | U (`tournament_id`, `id`) |
| `name` | `text not null` | `teams.team` (also the logo file name, A23) |

Not carried: `group_name`, `last16`, `last32` (football only).

**`team_outcomes`** (the `TeamOutcomes` aggregate; sportbet keeps it on the
team row)

| Column | Type | Notes |
|---|---|---|
| `team_id` | PK, FK `teams` | |
| `place` | `smallint null` | sportbet's 0 is undecided and maps to null (`sportbetColumns.teamOutcome`); CHECK outcome-place invariant (>= 1). Not unique: sportbet's form allows a shared place and `TeamOutcomes.stored` keeps it |
| `play_offs`, `final_four` | `boolean not null` | ticked only at 1 |
| `final_place` | `smallint null` | CHECK stored-final-place invariant (1-4) |

**`games`**

| Column | Type | Notes |
|---|---|---|
| `id` | identity, PK | `games.id` |
| `tournament_id` | `integer not null` | composite FKs (`tournament_id`, `round_id`) -> `rounds`, (`tournament_id`, `home_team_id`) and (`tournament_id`, `away_team_id`) -> `teams`: a game's round and both teams are in one tournament (P17, audit issue 20) |
| `round_id`, `home_team_id`, `away_team_id` | `integer not null` | U (`round_id`, `home_team_id`, `away_team_id`) (D16(c); P17 found none) |
| `tip_off` | `timestamptz not null` | `game_date`, UTC |
| `home_score`, `away_score` | `smallint null` | both or neither; CHECK score-side invariant (>= 0). A level result is allowed (sportbet stored it; `Game.stored` keeps it; R-38 refuses it on entry only) |
| `recorded_winner_id` | `integer null` | `game_winner_id`; no foreign key of its own: CHECK `games_winner_in_game` keeps it the home or away team, whose composite FKs keep it a team of the game's tournament; needs a result (`Game.stored`) |
| `postponed` | `boolean not null default false` | R-41; false for every sportbet row |
| `locked_since` | `timestamptz null` | R-13; null for every sportbet row |

**`players`**

| Column | Type | Notes |
|---|---|---|
| `id` | identity, PK | `users.id` |
| `username` | `text not null`, U | CHECK username invariant: not blank, at most 255 characters (sportbet validates `required|string|max:255` on both registration paths; Google sign-up takes the email's non-empty local part). U by exact text (P12: none duplicated); the case- and accent-insensitive rule sign-in needs is the auth slice's |

Nothing else about a player is stored in 2.2: no name, surname, email,
`google_id`, locale, reminder setting or admin level.

**`tournament_players`** (who plays a tournament, and the status scoring
needs, per tournament - R-7, R-19)

| Column | Type | Notes |
|---|---|---|
| `tournament_id`, `player_id` | PK, FKs | |
| `switched_off` | `boolean not null` | R-7's per-tournament switch; loaded from sportbet's one global `user_settings.active` (false = switched off) |
| `admin_hidden` | `boolean not null default false` | R-19; always false from sportbet, which cannot store a separate hide (`PlayerStatus.stored` refuses one under `sportbetRules`) |
| `fill_ins` | `integer not null` | the fill-ins counted toward switching off, in this tournament; CHECK fill-in-count invariant (>= 0). Loaded as the tournament's own `generated = 1` rows. sportbet's count is lifetime over every tournament; with football tournaments skipped it cannot be reproduced, and production holds only one tournament |

The repository builds each player's `StoredStatus` from all of their rows
(`switchedOffIn` = the tournaments where `switched_off`; `fillIns` per
tournament) and calls `PlayerStatus.stored(status, rules)`, which adds the
counts up into sportbet's one lifetime count under `sportbetRules`.

**`match_predictions`**

| Column | Type | Notes |
|---|---|---|
| `player_id`, `game_id` | PK, FKs | one row per player and game (audit issue 15, built in) |
| `home`, `away` | `smallint null` | CHECK score-side invariant (>= 0); not level when both are set; a half-typed row is allowed (sportbet stores them, MS-2) - the stored shape of `MatchPrediction.stored` |
| `origin` | `prediction_origin not null` | from sportbet's `generated` blob via `sportbetColumns.prediction` |
| `filled_in_at` | `timestamptz null` | null for every sportbet row (sportbet keeps no fill-in time, FI-4); only a fill-in may have one, and a fill-in has both scores |

Blank rows (both scores null) are loaded: they are the normal state of an
unpredicted game and what a fill-in replaces (FI-1). Not carried:
`game_winner_id` (football's predicted shoot-out winner), `prediction_date`
(C5), `reminded_at` (the reminders slice).

**`standings_predictions`**

| Column | Type | Notes |
|---|---|---|
| `player_id`, `team_id` | PK, FKs | |
| `place` | `smallint null` | CHECK predicted-place invariant (>= 0: `StandingsPrediction.stored` keeps sportbet's place 0) |
| `play_offs`, `final_four` | `boolean null` | null = never saved, false = saved unticked (the 0/1/NULL ticks) |
| `final_place` | `smallint null` | sportbet's 0 maps to null; CHECK stored-final-place invariant (1-4) |

**`survival_picks`** (the pick history, R-5: never deleted to record a loss)

| Column | Type | Notes |
|---|---|---|
| `player_id` | FK | |
| `tournament_id`, `round_id`, `team_id` | composite FKs to `rounds` and `teams` | the team and the round are in one tournament |
| PK | (`player_id`, `round_id`) | one pick per round (`SurvivalRun.stored`) |

From sportbet: every `prediction_survivals` row with an `event_id`. Rows with
no `event_id` are sportbet's seeded "team not used" slots, not picks: skipped
by design and counted. Because sportbet detaches a run's picks on a loss,
production's picks are only the still-attached ones (inventory Q3); the
stored rows below remain the complete survival record for parity.

**`game_odds`**

| Column | Type | Notes |
|---|---|---|
| `source`, `game_id` | PK; FK `games` | one row per game and source |
| `home`, `away`, `draw` | `numeric(8,2) not null` | CHECK odds invariant (>= 0) |

Production rows: one per game after the reader resolves sportbet's
duplicates (below); sportbet's blank row reads as 0/0/0
(`sportbetColumns.gameOdds`); a game with no row gets none (CO-5).

**`match_points`** (`point_results`)

| Column | Type | Notes |
|---|---|---|
| `source`, `player_id`, `game_id` | PK; FKs | |
| `winner`, `margin`, `bingo`, `odds_points`, `full` | `numeric(8,2) not null` | may be negative (MS-5) |
| `odds` | `numeric(8,2) not null` | the odds used; CHECK odds invariant (>= 0) |
| `serija` | `numeric(8,2) not null` | `streak_bonus` (SE-3) |

`odds_points` is always 0 (H8, #215); it is kept so the checker can compare
it, as the domain's `MatchPoints` does.

**`standings_points`** (`point_standings`)

| Column | Type | Notes |
|---|---|---|
| `source`, `player_id`, `team_id` | PK; FKs | |
| `place_points`, `place_odds`, `play_offs_points`, `play_offs_odds`, `final_four_points`, `final_four_odds`, `final_points`, `final_odds` | `numeric(10,4) null` | a `StandingsLine` each; null vs 0 is kept (ST-6); odds columns CHECK odds invariant (>= 0) |

sportbet's `last16_*` and `last32_*` are not carried: Euroleague never plays
them, so they are always null; the reader refuses a row where one is not.

**`survival_points`** (`point_survivals`, and the domain's `SurvivalPoints`)

| Column | Type | Notes |
|---|---|---|
| `id` | identity, PK | the row's own, generated for every row (migration 0003) |
| `source` | `points_source not null` | |
| `player_id` | FK | |
| `tournament_id`, `round_id`, `team_id` | composite FKs | |
| `points` | `numeric(8,2) null` | null only while a pick waits for its game (SU-8) |
| `provisional` | `boolean not null` | R-34 |
| `sportbet_id` | `integer null`, unique | sportbet's `point_survivals.id` (the domain's `StoredSurvivalRow.id`, and a production row's `SurvivalPoints.storedId`); set on production rows, only (CHECK) |
| `stored_row_id` | `integer null`; FK (`tournament_id`, `stored_row_id`) to (`tournament_id`, `sportbet_id`) | the production row a sportbet refold rewrites (a derived row's `SurvivalPoints.storedId`) |

Uniqueness follows the domain rather than one key: production rows are
unique by sportbet's id (two may share a player and a round, which the
domain's refold allows; P2 found none); a row that rewrites a stored row is
unique per (`source`, `stored_row_id`); a row scored from picks is unique
per (`source`, `player_id`, `round_id`) (partial unique indexes). A
production row has `points` not null, `provisional` false, a
`sportbet_id` and no `stored_row_id`; a derived row has no `sportbet_id`.
Sportbet's ids live in a column of their own, not in `id`, so a later load
upserting production rows by `sportbet_id` can never land on a derived
row, and the foreign key can only name a production row of the same
tournament.

Totals (`TournamentPoints.totals`) are not stored: they are sums of the rows
above, and the league-table slice decides how pages read them.

### Indexes

Postgres indexes a primary or unique key, not a foreign key's columns.
Migration 0004 adds a btree index on each column the repositories read,
replace or count a tournament's rows by where no key already leads with
it: `games` (`tournament_id`, `round_id`), `match_predictions` (`game_id`),
`standings_predictions` (`team_id`), `survival_picks` (`tournament_id`,
`round_id`), `tournament_players` (`player_id`, for `loadPlayerStatuses`),
`match_points` (`game_id`), `standings_points` (`team_id`) and
`survival_points` (`tournament_id`, `source`: every read names the
tournament, only some the source). The two-column ones also index the
composite foreign keys to `rounds`. `rounds`, `teams` and
`tournament_players` by tournament, and `game_odds` by source and game, are
served by their keys; the `player_id` foreign keys of the points tables are
left unindexed, since no load reads by player and a player is never
deleted.

### CHECKs and `INVARIANT_CHECKS`

Every single-column rule is a domain invariant, built into SQL by
`invariantCheck` and listed in its area's `...InvariantChecks`, gathered by
`INVARIANT_CHECKS` (CLAUDE.md, code rules). Today `defineInvariant` holds
text patterns only, and most rules here are on numbers, so 2.2 adds a
second kind beside it in `packages/domain/src/invariant/`:

- **`defineRangeInvariant({ name, min, max?, accepts, refuses })`**: a
  whole-number range (the unit is the column's own; for the odds columns
  only the sign matters, so the same invariant holds for hundredths and
  ten-thousandths). Its Zod schema is `z.int().min(min)` (and `.max`), it
  throws on an example its schema disagrees with, exactly like
  `defineInvariant`. `invariantCheck` renders it as `col >= min [and col <=
  max]` (numbers are rendered from validated integers, never from text), and
  `describeInvariantCheck` proves it by substituting each example for the
  column as it does for text, on `smallint`, `integer` and `numeric`
  columns.
- **The domain's factories use the invariants' schemas** where they already
  hold the same rule (`Score.of`, `Rate.of`, `roundNumber`,
  `TeamOutcomes.stored`, `StandingsPrediction.stored`,
  `PlayerStatus.stored`, `Odds.ofHundredths`,
  `StandingsOdds.ofTenThousandths`), so the domain and the CHECK read one
  definition. No factory's behaviour changes; each keeps its refusal names.

The invariants: `scoreSideInvariant` (>= 0), `rateInvariant` (>= 1),
`roundNumberInvariant` (>= 1), `outcomePlaceInvariant` (>= 1),
`predictedPlaceInvariant` (>= 0), `storedFinalPlaceInvariant` (1-4),
`fillInCountInvariant` (>= 0), `oddsInvariant` (>= 0), and the text
`usernameInvariant` (the tournament name's not-blank class, at most 255).

Rules that span columns cannot be one column's invariant. They are CHECKs
listed in `NON_INVARIANT_CHECKS` (the allowlist in
`packages/db/test/invariant-checks.test.ts`), each with its reason, naming
the stored factory that refuses the same row:

| CHECK | Mirrors |
|---|---|
| `games_teams_differ` | `Game.stored` `same-team-twice` |
| `games_result_both_or_neither` | `sportbetColumns.game` `half-scored` |
| `games_winner_needs_result`, `games_winner_in_game` | `Game.stored` `winner-without-result`, `winner-not-in-game` |
| `games_postponed_without_result` | `Game.stored` `postponed-with-result` |
| `match_predictions_not_level` | `MatchPrediction.stored` `level` |
| `match_predictions_fill_in_scored` | `fill-in-without-score` |
| `match_predictions_fill_in_time` | `real-with-fill-in-time` |
| `survival_points_production_shape`, `survival_points_sportbet_id`, `survival_points_rewrites_production` | the production-row shape above |

Each gets one accepting and one refusing case in `schema.test.ts`, by
constraint name.

## 2. Repositories (`packages/db`)

Organised by area, like `tournament/`: `season/`, `team/`, `player/`,
`prediction/`, `standings/`, `survival/`, `points/`, each with its
`schema.ts` (tables and `...InvariantChecks`) and `repository.ts`. Every
function takes the `Db` (or a transaction) first. Rows are selected with
explicit column lists and parsed with Zod at the edge (decision 5); the
parsed row goes through the domain's `stored` factory, whose refusal is a
thrown error naming the table, key and refusal - a stored row the domain
refuses is a bug to see (Phase 1: "a bad row is a bug to see, not to hide"),
and the CHECKs make it unreachable in practice.

| Area | Loads | Saves |
|---|---|---|
| tournament | `findTournamentBySlug`, `listTournaments` (extended with the new columns) | `saveTournament` (upsert by id) |
| season | `loadSeason(db, tournament)`: rounds via `Round.stored`, games via `Game.stored`, then `Season.create` with `endsAt` and `standingsDeadlineRound` | `saveRounds`, `saveGames` (upsert by id) |
| team | `loadTeamOutcomes(db, tournament)` via `TeamOutcomes.stored` (with `standings_table_final`) | `saveTeams`, `saveTeamOutcomes(db, tournament, outcomes)` (a team of another tournament throws) |
| player | `loadPlayerStatuses(db, tournament, rules)`: `Map<PlayerId, PlayerStatus>` via `PlayerStatus.stored`; `listTournamentPlayers` | `savePlayers` (id and username only), `saveTournamentPlayers` |
| prediction | `loadMatchPredictions(db, tournament)` via `MatchPrediction.stored` | `saveMatchPredictions(db, tournament, predictions)` (upsert by player and game; a game of another tournament throws) |
| standings | `loadStandingsPredictions(db, tournament)`: one `StandingsPrediction.stored` per player | `saveStandingsPredictions(db, tournament, predictions)` (a team of another tournament throws) |
| survival | `loadSurvivalRuns(db, tournament)`: `Map<PlayerId, SurvivalRun>` via `SurvivalRun.stored`; `loadStoredSurvivalRows(db, tournament)`: the `production` rows as `StoredSurvivalRow[]` | `saveSurvivalPicks` |
| points | `loadTournamentPoints(db, tournament, source)` (for 2.3 and the tests) | `saveTournamentPoints(db, tournament, source, rows)` |

**The two calls the issue names:**

- `loadTournamentInputs(db, tournament, reads): Promise<Result<TournamentInputs,
  TournamentInputsRefusal>>`,
  where `reads` says what the recalculation reads and is always given
  explicitly: `{ odds: 'stored' | 'from-votes', survival: 'stored-rows' |
  'picks' }`. `'stored'` odds are the `production` `game_odds` rows (as
  sportbet's full recalculation reuses them, CO-7) and `'stored-rows'`
  survival the `production` `survival_points` rows (SU-10). Parity under
  `sportbetRules` reads `{ odds: 'stored', survival: 'stored-rows' }`; the
  ruled set reads `{ odds: 'from-votes', survival: 'picks' }`. `players` are
  the tournament's `tournament_players`; a prediction, standings row, pick or
  stored survival row of anyone else is refused
  (`row-of-player-not-in-tournament`), since every load makes each row's
  owner a player. One read transaction, so the inputs
  are one consistent snapshot.
- `saveTournamentPoints(db, tournament, source, rows)`: in one transaction,
  deletes the tournament's rows of that `source` from the four points tables
  and inserts `rows`, so saving the same result twice leaves the same rows.
  `rows` is a `PointsRows` - `TournamentPoints` minus its totals and minus
  `MatchPoints.extendsSerija` (a derived flag no stored row has) - so a
  `TournamentPoints` from `recalculateTournament` is accepted as it is, and
  so are the production rows the reader maps. The domain exports the two
  narrower row types (`StoredMatchRow`, `PointsRows`) beside
  `TournamentPoints`; `MatchRow` and `TournamentPoints` are assignable to
  them.

Writes of numbers go as the domain's exact decimal text; reads parse it back
with `decimalUnits`. Every save is an upsert or a replace keyed by the
table's key, so each is idempotent.

**Runtime exports `db` adds for the reader:** `runMigrations`,
`MIGRATIONS_FOLDER` and `POSTGRES_IMAGE` move from the test entry (or
`migrations.ts`, not exported today) into the package's runtime entry, so
the reader starts the same `postgres:18.6` and migrates it the same way the
tests do, without importing `@sportbet/db/testing`.

## 3. The reader (`tools/migrate`)

### Package and layering

- New workspace package `@sportbet/migrate` at `tools/migrate`
  (`pnpm-workspace.yaml` gains `tools/*`). It may import the entry points of
  `@sportbet/db` and `@sportbet/domain`, `zod`, `mysql2`, `testcontainers`
  (with `@testcontainers/mysql` and `@testcontainers/postgresql`) and Node
  built-ins. Its runtime code may not import `@sportbet/web`, Next, React,
  `@sportbet/db/testing` or `@sportbet/domain/testing`; its tests may import
  the two testing entries. No package imports `@sportbet/migrate`: the
  web, db and domain lint blocks add it to their restricted patterns. So the
  direction is web -> db -> domain and migrate -> db -> domain, with migrate
  beside web and never below it.
- Built like `db`'s bins: esbuild bundles `src/bin/migrate.ts` into
  `dist/migrate.mjs`, which the owner runs with `node` directly (not
  through pnpm, so Ctrl-C reaches the reader itself on Windows).
  Reason: the workspace packages export `.ts` sources with extensionless
  imports, which Node's own type stripping cannot load; `db` already bundles
  its bins this way. Turned down: `tsx` (a new runtime dependency for one
  tool).
- Runtime Testcontainers, not the docker CLI. Reason: it is already the
  repository's container tool, handles readiness and random ports, and its
  reaper removes the containers even if the reader is killed - which is what
  keeps the MySQL copy from outliving a crashed run. Turned down: shelling
  out to `docker run` (hand-written readiness and cleanup, nothing removes
  the container after a crash); a Compose file (leaves networks and volumes
  behind by default).
- `mysql2` to read the restored MySQL. Reason: the maintained Node MySQL
  driver with promise support; the reader reads with explicit column lists
  and parses every row with Zod. Turned down: reading the SQL text of the
  dump directly (it would mean parsing MySQL's `SHOW CREATE TABLE` and
  escaping rules by hand, the kind of quirk the MySQL container exists to
  absorb).

### Flow

`node tools/migrate/dist/migrate.mjs [--keep] [--json]` after
`pnpm --filter @sportbet/migrate build` (`tools/migrate/README.md`). It
takes no database URL and reads no `DATABASE_URL`: its only target is the
Postgres container it starts itself, so it cannot be pointed at Neon or
staging.

1. **Preflight.** Docker is on this PC: before any daemon is contacted, a
   `DOCKER_HOST`, `TESTCONTAINERS_HOST_OVERRIDE` or docker CLI context that
   is not a unix socket, a named pipe or loopback TCP is refused; then
   Testcontainers' resolved runtime must be reached the same way and
   publish ports on loopback. The OCI CLI is found (`OCI_CLI`, else `oci`
   on the PATH, else `~/bin/oci.exe`). The `sportbet-migrate-*` temporary
   directories and `sportbet-migrate`-labelled containers a crashed run
   left - those whose process (named in the directory and a label) is no
   longer running - are deleted; a run still going in another terminal,
   or its `--keep` Postgres, is left alone. The report says so.
2. **Fetch.** `oci os object list` on `sportbet-db-backup` /
   `axox7rtziknk`, prefix `sportbet-web/`; the latest object is the greatest
   name matching `sportbet-\d{8}T\d{6}Z-daily\.sql\.gz` (the names sort by
   time). A backup older than 26 hours is a warning in the report (the old
   app's own backup check uses the same bound). `oci os object get` writes
   it into a new private temporary directory
   (`sportbet-migrate-<pid>-<random>` under the OS temp directory, outside
   the repository). The file must pass
   `gzip -t`, end with `-- SPORTBET DUMP COMPLETE`, and name an engine in
   its header whose major.minor equals the MySQL image's; otherwise the run
   stops.
3. **Restore.** A MySQL container from the image pinned to production's
   version (`mysql:26.7.0`, production's HeatWave reports 26.7.0; bumped
   deliberately when HeatWave's is), with its data directory and the dump's
   landing directory on tmpfs, a random per-run root password held only in
   memory, its port published on the loopback interface only, and the
   `sportbet-migrate` label (its value the run's id). The dump is
   decompressed as it is streamed into the `mysql` client in the container,
   over an exec with stdin attached on the same Testcontainers client that
   started it (so it can only reach the daemon the preflight checked; no
   `docker` CLI process), and the local file is deleted at once. A load
   failure reports the client's exit code and the dump line
   number only - never the client's message, which quotes the statement near
   the error and so could quote a row of `users`.
4. **Schema drift.** For every table and column the reader reads, the
   restored `information_schema.columns` must hold it with the type and
   nullability the reader expects (from sportbet's migrations at
   `0da316f`); a missing or changed column stops the run. A column sportbet added later is ignored.
5. **Read.** One query per table with an explicit column list from one
   constant, `READ_COLUMNS` - the only place the reader names sportbet
   columns - and no `select *` anywhere. From `users` it reads `id` and
   `username`, nothing else; `name`, `surname`, `email`, `google_id` and
   `remember_token` are never selected, so they never reach the reader's
   memory. `audit_*`, `login_codes`, `sessions`, `leagues` (beyond `id` and
   `tournament_id`), `league_invites`, `messages`, `settings`, `colors` and
   `points_calculations` (football's table) are not read at all.

   | Table | Columns read |
   |---|---|
   | `tournaments` | `id`, `slug`, `name`, `standings_format`, `standings_deadline_round`, `end_date`, `survival_game` |
   | `events` | `id`, `tournament_id`, `event`, `event_day`, `event_survival`, `is_knockout`, `rate` |
   | `teams` | `id`, `tournament_id`, `team`, `group_position`, `quarterfinal`, `semifinal`, `final`, `last16`, `last32` |
   | `games` | `id`, `event_id`, `home_team_id`, `away_team_id`, `game_date`, `home_team_score`, `away_team_score`, `game_winner_id` |
   | `game_odds` | `id`, `game_id`, `home_odds`, `away_odds`, `draw_odds` |
   | `users` | `id`, `username` |
   | `user_settings` | `user_id`, `active` |
   | `leagues`, `league_members` | `leagues.id`, `leagues.tournament_id`; `league_members.league_id`, `league_members.user_id` (who plays a tournament) |
   | `prediction_results` | `id`, `user_id`, `game_id`, `home_team_score`, `away_team_score`, `generated`, `game_winner_id` |
   | `prediction_standings` | `id`, `user_id`, `team_id`, `group_position`, `quarterfinal`, `semifinal`, `final`, `last16`, `last32` |
   | `prediction_survivals` | `id`, `user_id`, `team_id`, `event_id` |
   | `point_results` | `id`, `user_id`, `game_id`, `winner_points`, `difference_points`, `bingo_points`, `odds`, `odds_points`, `full_points`, `streak_bonus` |
   | `point_standings` | `id`, `user_id`, `team_id`, and each `*_points` / `*_odds` column including `last16_*` and `last32_*` |
   | `point_survivals` | `id`, `user_id`, `event_id`, `team_id`, `survival_points` |

   Football columns (`last16`, `last32`, `game_winner_id` of a prediction)
   are read only to count values that should not be there.
6. **Map.** A pure function from the read rows to the domain's stored rows
   and the report - no I/O, so every quirk has a unit test. Every value goes
   through `sportbetColumns` and then the `stored` factory; nothing is mapped
   anywhere else. 2.2 adds the mappings the reader needs that
   `sportbetColumns` lacks, with the same doc-comment treatment:
   `matchPointsRow` (DECIMAL text to `Points`, refusing more than two
   places), `standingsPointsRow` (the `double` text MySQL returns - the
   shortest text that reads back as the stored double - to ten-thousandths,
   refusing more than four places; R-31 says four is what sportbet stores),
   `survivalPick` (a `prediction_survivals` row with an event), `player` and
   `tournament` (`end_date` to `ends_on`, `standings_format` to the closed
   format union).
   - **Scope.** A tournament whose `standings_format` is not `euroleague` is
     skipped with every row that belongs to it, counted per table. A user
     neither in a loaded tournament's league nor owning a loaded row is not
     loaded at all (counted, no id).
   - **Stages.** sportbet stores none. An event with `event_day` 1-38 is
     `regular` (R-10 and R-14 put the regular season at rounds 1-38); a later
     event is refused as `stage-unknown`, since its stage cannot be read
     from sportbet. Production held none on 2026-09-28.
   - **`game_odds` duplicates.** sportbet reads `first()` with no order; the
     reader keeps each game's lowest-id row (as `sportbetColumns` documents)
     and reports every game with more than one row. Duplicates equal to the
     kept row are a notice; a duplicate with other values is a refusal,
     because which one sportbet scored with cannot be known.
   - **Refusals** (the row is not loaded, counted by table and reason):
     every refusal a `sportbetColumns` mapping or `stored` factory returns
     (`bad-generated` for an unknown `generated` value, `half-scored`,
     `bad-odds`, `bad-final-place`, `same-team-twice`,
     `winner-not-in-game`, `two-picks-in-one-round`, ...); `orphan` (a row
     whose game, event, team, tournament or user does not exist);
     `cross-tournament` (a game whose round and teams are in different
     tournaments, or a pick whose team is not in its round's tournament);
     `duplicate-key` (two rows where the new schema has one key: two
     predictions for one game, two standings rows for one team, two
     `user_settings` rows with different `active`); `football-column-set`;
     `tournament-without-end-date`; `stage-unknown`. A row that depends on a
     refused row is refused as `depends-on-refused` with the reason it
     inherits, so one bad game shows as one game plus its dependants, not as
     scattered orphans.
   - **Skips by design** (expected, not quirks): non-Euroleague rows, the
     seeded survival slots without an event, users outside the loaded
     tournaments, sportbet columns the schema does not carry.
7. **Load.** A Postgres container from `POSTGRES_IMAGE` (tmpfs data,
   loopback, random password), migrated with `runMigrations`. The mapped
   rows are written through the repositories in one transaction, in FK
   order, then the identity sequences are moved past the loaded ids.
8. **Recalculate.** For each loaded tournament:
   `recalculateTournament(await loadTournamentInputs(db, t, { odds:
   'stored', survival: 'stored-rows' }), sportbetRules)` saved as
   `sportbet`, and `recalculateTournament(await loadTournamentInputs(db, t,
   { odds: 'from-votes', survival: 'picks' }), ruledRules)` saved as
   `ruled`. A `RecalculationRefusal`, or the inputs' refusal, is reported, not
   thrown. Comparing
   `production` with `sportbet` is 2.3's job; the report only gives the row
   counts of each source.
9. **Report.** Printed to stdout (`--json` prints the same as one JSON
   object); never written to a file by the reader. It holds: the object
   name, size, SHA-256 and age of the dump; the engine line and the image
   used; per sportbet table, rows in the dump, rows read, rows loaded, skips
   by reason and refusals by reason with counts; for refusals on rows no
   player owns (tournaments, rounds, teams, games, odds), the sportbet ids;
   for player-owned rows, counts and the game, team or round id only; the
   rows per source in each points table after step 8; any recalculation
   refusal; the cleanup result; the exit status. It never holds a username,
   name, email or player id: a problem that stops the run is its stage plus
   the reader's own fixed text, a Zod summary (issue code, column, expected
   type) or a failed query's verb, table, SQLSTATE and constraint - never a
   driver's message, detail or parameters, and never another error's text
   once anything has been fetched (only its class). Exit 0 when nothing was
   refused, 1 when anything was, 2 when the run could not complete.
10. **Cleanup** (on every path: success, failure, and SIGINT, SIGTERM,
    SIGHUP or SIGBREAK): each step runs on its own, so one failing does not
    skip the rest - the local dump file and its temporary directory are
    deleted if still there (retrying while Windows still holds them), both
    containers are stopped and removed. An interrupt kills the download's
    process tree before its file is deleted, and removes the run's
    containers at once, including one whose start is in flight; the run
    stops at its next step. The reader then lists the run's labelled
    containers, removes any left, and fails the run (exit 2) if a container
    or the temporary directory still remains. Nothing it started uses a
    Docker volume, so nothing is left on disk.

`--keep` keeps only the Postgres container running after the report (it
holds ids, usernames, predictions and points - no email or name) and prints
its local URL - on stderr, since it holds the container's password - until
the operator presses Ctrl-C; the MySQL container and
the dump are deleted before the pause either way. Its data is on tmpfs, so
stopping it leaves nothing behind.

**Idempotent.** Each run starts from a new dump, new containers and an empty
migrated Postgres, so a run cannot see a previous one; and within a run
every save is an upsert or a replace, so loading the same mapped rows twice
into one database leaves the same rows (a test proves it). Output is
deterministic: rows are read and written in key order, and the same dump
gives the same report.

## 4. Tests

- **Database tests** (`packages/db/test`, Testcontainers Postgres 18.6
  through `@sportbet/db/testing`, as today):
  - per table: a valid row is accepted; each FK, unique key and composite
    tournament FK refuses its bad row by constraint name; each
    cross-column CHECK accepts and refuses one row by name; a level result,
    a half-typed prediction, a place 0 and a final place 3 are accepted
    (stored shape).
  - every invariant CHECK through `describeInvariantCheck`, the range kind
    included; `INVARIANT_CHECKS` plus `NON_INVARIANT_CHECKS` equal the
    database's CHECKs.
  - each enum equals its domain constant.
  - per repository: a round trip (save, load, equal domain objects) through
    the stored factories; decimals exact at the edges (`-45.00`, `0.59`,
    `631.1610`, `0.0000` vs null); an id saved with `overridingSystemValue`
    and the sequence moved past it; `saveTournamentPoints` twice under one
    source leaves one set of rows and leaves the other sources' rows
    untouched; `loadTournamentInputs` with each `reads` option.
  - the golden scenario saved through the repositories and read back with
    `loadTournamentInputs` reproduces the golden snapshot under
    `sportbetRules` (from votes and picks, and from stored odds and stored
    survival rows) and the documented differences under `ruledRules` - the
    same assertions as `golden.test.ts`, now across the database.
  - migrations apply from empty and again idempotently; the staging seed
    still runs.
- **Reader unit tests** (`tools/migrate`, no containers): the map step on
  hand-built sportbet rows for every refusal, skip and notice above; the
  latest-object choice and the 26-hour warning; the dump checks (no marker,
  bad gzip, other engine); `READ_COLUMNS` reads exactly `id` and `username`
  from `users` and none of the forbidden columns anywhere; the MySQL error
  scrubbing.
- **Reader end to end** on a **synthetic** dump, never production data. A
  fixture builder writes a file in the dump's own format (header, `DROP` and
  `CREATE TABLE` for the read tables from sportbet's migrations at
  `0da316f`, extended INSERTs, the completion marker) from the domain's
  golden scenario - the teams, rounds, games and results, predictions,
  standings, outcomes, picks and the 25 stored Euroleague rows of
  `golden-points.json` - plus deliberate quirks: a football tournament with
  rows, an equal and a differing duplicate `game_odds` row, a blank odds
  row, an orphan prediction, a `generated` of `'2'`, seeded survival slots,
  a user in no tournament, and sentinel names and emails on every user. The
  test runs the whole pipeline with the fetch step replaced by the fixture
  file (the only seam: an injected fetcher), on a real MySQL container from
  the pinned image and a real Postgres, and asserts: the report's counts per
  table (dump, read, loaded, each skip and refusal); the loaded rows equal
  the golden inputs mapped through `sportbetColumns`; the `production`
  points rows equal `golden-points.json`; the `sportbet` rows the reader
  recalculated equal them too, and the `ruled` rows differ exactly as the
  catalogue lists; the exit status is 1 (the fixture has refusals); after
  the run the temporary directory is gone and no labelled container
  remains.
- **No personal data**: the same run captures stdout and stderr and asserts
  that no sentinel name, surname or email appears in them, in the
  `--json` report, or anywhere in the Postgres (`pg_dump` of the loaded
  database, searched as text); and that the loaded `players` table has
  exactly the columns `id` and `username`.
- The golden scenario's raw data and `golden-points.json`'s Euroleague
  entries move from `golden-scenario.ts` and `golden.test.ts` into the
  domain's test entry (`@sportbet/domain/testing`), so the domain test, the
  db test and the fixture builder share one copy.
- CI's `check` job adds `pnpm test:migrate` (GitHub-hosted runners have
  Docker). CI never reaches Oracle: it has no OCI credentials and the tests
  never call the real fetcher.

## 5. Security and privacy

| Question | Answer |
|---|---|
| Where the dump comes from | only the `sportbet-db-backup` bucket, `sportbet-web/` prefix, through the laptop's authenticated OCI CLI (read access the owner already holds) |
| Which machine | this PC only: a Docker daemon reached any other way than a unix socket, a named pipe or loopback TCP is refused before anything is fetched, and the dump is streamed through the same client that was checked |
| Where it lives | one private temporary directory under the OS temp directory (never inside the repository), then the tmpfs of the MySQL container |
| For how long | the local file: from download until it is streamed into the container, seconds; the container's copy: until the rows are read; both are deleted on every path (success, failure, SIGINT, SIGTERM, SIGHUP, SIGBREAK), the run fails if the directory or a container remains, and a crashed run's leftovers are deleted by the next run's preflight |
| What is dropped | `users` is read as `id` and `username` only; name, surname, email, `google_id` and `remember_token` are never selected. `audit_logins` (IP addresses), `audit_prediction_games`, `login_codes`, `sessions`, `messages`, `league_invites` and league fees are never read |
| What the loaded Postgres holds | ids, usernames, tournament structure, predictions, standings, survival picks, per-tournament player status and points; on tmpfs, removed at the end of the run (or when the operator ends `--keep`) |
| What the report holds | counts, sportbet ids of non-player rows, the dump's name, size and hash; no username, name, email or player id |
| What never happens | no upload of anything; no URL option (the target is always the reader's own container); no file written by the reader other than the temporary dump; MySQL error text is never printed; no row value of `users` is logged; CI never runs against production |
| Git | the reader writes nothing into the repository; `.gitignore` and `.dockerignore` gain `*.sql`, `*.sql.gz` and `sportbet-migrate-*` as a second guard, and the images do not build the reader; the test fixture is generated at test time from the golden scenario and carries only sentinel names |

**How the owner can verify:**

1. Read `READ_COLUMNS` (one file in `tools/migrate`): the `users` entry is
   `id`, `username`; the tests fail if any other `users` column or any
   forbidden table is added.
2. After a run: `docker ps -a --filter label=sportbet-migrate` is empty,
   `docker volume ls` shows nothing new, and the OS temp directory holds no
   `sportbet-migrate-*` folder. The report's cleanup line says the same, and
   the run fails if it is not true.
3. With `--keep`: connect to the printed URL and `\d players` (two columns),
   or `pg_dump` it and search for an `@`.
4. `git status` after a run is clean.

## Open question for the owner

1. **The season's end date.** The domain needs every tournament's end date
   (R-21: finished once it has passed and every game is scored), and reads
   it as sportbet does (the tournament is still on for the whole of that
   day, UTC). sportbet's `end_date` is optional. If production's Euroleague
   2026-27 tournament has none, the reader refuses the tournament until it
   has one: will you set it in the old admin (or say the date - for example
   the day of the Final Four's final)?

## 6. Out of scope

- The parity checker itself (2.3): comparing `production` with `sportbet`
  rows, classifying differences, the two-oracle comparison (inventory
  section 6), survival replay limits (Q3).
- Authentication, sessions and everything about accounts: users' emails,
  names, Google ids, locales and reminder settings are **not** migrated now.
  Sign-in needs emails later; the auth slice (inventory slice 4) and the
  switch-over migration extend this reader with them under their own spec,
  with the owner deciding again what may be read then.
- Leagues, memberships as data, fees, invites, messages, audit trails: the
  reader reads only which users play a tournament.
- Football (decision 11): football tournaments and their rows are skipped
  and counted; `points_calculations` is not read.
- The live app writing through these repositories (use cases, pages, the
  recalculation pipeline of slice 7); staging's seed beyond keeping it
  working.
- Running the reader anywhere but the owner's PC; scheduling it.

## Records to update

- `CLAUDE.md` code rules: `tools/migrate` in the dependency sentence
  (migrate -> db -> domain, nothing imports migrate); "every points row
  carries its `points_source`, named by the caller, never defaulted";
  range invariants beside `defineInvariant`; the reader's data rules (only
  from the Oracle backup, only `READ_COLUMNS`, never a URL option).
- `docs/decisions.md` "Settled in the walking-skeleton spec" gains a line
  pointing here for: sportbet's ids kept, `points_source`, the reader's
  tooling (Testcontainers at runtime, `mysql2`, esbuild bundle).

## Done when

Every acceptance criterion of #9 holds: a production copy loads into a
throwaway Postgres with each table's counts reconciled against the dump
(loaded plus skipped plus refused equals rows read), every row mapped
through the domain, quirks reported; `recalculateTournament` runs over the
loaded tournament under both rule sets; database tests cover every table's
constraints and every repository; the reader's end-to-end test on the
synthetic dump reproduces the golden master under `sportbetRules` and finds
no sentinel personal data in its output or database; and the owner has run
it once on the latest backup and read its report.
