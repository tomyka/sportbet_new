# Slice 15: the Euroleague schedule import

A19 of `docs/phase-2-inventory.md` (#32): `/admin/import`, its preview and
its apply, and the shell command `euroleague-import --dry-run`, which bring
a Euroleague regular season - its teams, rounds and games - into a
tournament from the official feed, and move games the feed reschedules.
Euroleague only (decision 11). It builds on slice 13
(`docs/superpowers/specs/2026-10-13-admin-structure-design.md`): the
`isSuperadmin` gate, the admin's tournament, the tournament lock,
`seedBlankRows`, `Game.reschedule` and the finished guard.

Binding: decisions 4, 5, 10, 11 and 13; R-10, R-13, R-41, R-73, R-93, R-94,
R-96 and R-110 (`docs/owner-rulings.md`); the rules in `CLAUDE.md` (the
domain decides, one transaction under the lock order, every derived row
through `recalculateUnderRuleSet`, route handlers answering a real 303,
`adminGate`, Lithuanian text in components, every boundary parsed).

## The reference

sportbet at **5aa8465**: `routes/web.php` (191-197, the superadmin group),
`app/Http/Controllers/EuroleagueImportController.php` (`preview` 48-66,
`store` 68-99, `validated` 104-118),
`app/Console/Commands/ImportEuroleagueSchedule.php` (signature 22-25,
`handle` 29-92), `app/Services/Import/EuroleagueFeed.php` (`games` 33-57),
`EuroleagueFeedParser.php` (`parse` 30-47, `fixture` 54-76, `club` 94-103,
`malformed` 134-140), `EuroleagueFixture.php`, `EuroleagueImportPlan.php`
(`isNoop` 39-46), `EuroleagueScheduleImporter.php` (`plan` 57-115, `apply`
122-164, `teamsToCreate` 173-191, `createEvents` 215-240, `syncGames`
249-321, `seedPredictions` 333-342, `existingTeams` 410-430, `gameKey`
461-468, `normalise` 474-477), `TeamCrestDownloader.php`,
`app/Support/TeamLogo.php` (`baseName` 72-81),
`resources/views/admin/import.blade.php`, and
`tests/Feature/EuroleagueImportTest.php` with its fixture
`tests/Fixtures/euroleague-e2026-games.json` (20 games, rounds 1 and 2,
all `phaseType.code` `RS`, 20 clubs).

What sportbet does, in short:

- **Who.** The superadmin group, as inserting teams and rounds by hand.
- **The screen** ("Tvarkaraščio importas") picks any tournament and a
  season code (`^[A-Z]{1,2}[0-9]{4}$`, "E2026 - 2026-27 sezonas"), then
  "Peržiūrėti" (POST `/admin/import/preview`) shows "Ką padarys importas":
  new teams, new rounds, new games, moved games (from / to), unchanged,
  "Neperkeliamos - jau užrakintos" (with "Šių rungtynių data nebus
  pakeista: jos jau prasidėjo arba turi rezultatą, o spėjimai lieka tokie,
  kokie buvo."), and the players who get rows; "Viskas jau atnaujinta -
  nieko keisti nereikia." when nothing would change. "Importuoti" (POST
  `/admin/import`, a confirm "Importuoti tvarkaraštį į šį turnyrą?")
  fetches the feed again, plans again and applies; it flashes "Importuota:
  :teams komandų, :events turų, :games naujų rungtynių, :moved perkeltų,
  :locked neperkeltų (jau užrakintos). Spėjimų eilutės sukurtos :players
  žaidėjams, atsisiųsta logotipų: :crests.".
- **The feed** is one unauthenticated GET,
  `https://api-live.euroleague.net/v2/competitions/E/seasons/{code}/games`,
  60 s timeout, two retries a second apart. Failures: "Nepavyko pasiekti
  Euroleague serverio. Bandykite dar kartą po kelių minučių.", "Euroleague
  serveris grąžino klaidą (:status). Patikrinkite sezono kodą :season.",
  "Euroleague atsakymo nepavyko perskaityti.".
- **The parser** reads `data[]`: `round` (integer or digit string),
  `utcDate` (the only UTC field), `local.club.name` / `road.club.name`
  (whitespace collapsed, trimmed), the crest URLs. No games: "Euroleague
  atsakyme nėra rungtynių. Patikrinkite sezono kodą."; a missing field:
  "Euroleague atsakymas netinkamas: rungtynėse nr. :number trūksta lauko
  :field.". It keeps every phase, post-season included.
- **The plan** matches teams by `TeamLogo::baseName` (lower-cased,
  whitespace collapsed). A tournament with no teams gets every club; one
  with teams refuses any club it lacks: "Šios komandos yra tvarkaraštyje,
  bet ne turnyre: :teams. Pervadinkite jas turnyre taip pat, kaip vadinasi
  tvarkaraštyje, ir bandykite dar kartą. Niekas nebuvo importuota.". Two
  teams with one key refuse: "Turnyre yra dvi vienodai vadinamos komandos:
  :team. Pervadinkite vieną iš jų ir bandykite dar kartą.". A missing
  round is created ("N turas", day N, rate 1, survival off, not knockout).
  A game is keyed by round, home and away: missing is created (with a
  blank `game_odds` row); present with another date is moved when still
  open (`GameLock::isOpen`: tip-off not passed, no result), else skipped
  and counted (R-13, issue 286); a move clears the game's `reminded_at`
  (issue 283).
- **Apply** is one transaction re-deriving the plan (not trusting the
  preview), then seeds every league member's prediction rows,
  unconditionally (a re-run repairs a player short of rows), then, outside
  the transaction, downloads crests to `public/img/teams`.
- **The command** `euroleague:import {tournament id or slug}
  {--season=E2026} {--dry-run}` prints the plan as a table and applies
  unless `--dry-run`.

## Rulings applied

- **R-93.** Apply carries the preview's plan fingerprint; it fetches the
  feed again, plans again under the tournament lock and refuses when the
  fingerprint differs - the feed or the tournament changed since the
  preview: "Tvarkaraštis arba turnyras pasikeitė po peržiūros - peržiūrėkite
  dar kartą." (new text, the owner may reword), with the fresh preview
  shown. Nothing is written.
- **R-94.** Only `phaseType.code` `RS` is planned; the preview counts the
  post-season games it left out ("Atkrintamųjų rungtynių neimportuota: N" -
  new). A game of a regular-season round (stage `regular`) that the feed no
  longer lists is shown under "Tvarkaraštyje nebėra" (new) and never
  deleted; rounds of another stage are not compared. A feed round whose
  number is an existing non-regular round refuses: "Turas N jau yra ir nėra
  reguliariojo sezono." (new, `round-not-regular`).
- **R-96.** No crest is downloaded; `TeamCrestDownloader` is not carried.
  The preview and the result list the teams with no committed crest
  ("Komandos be logotipo" - new), by the same lookup the pages use.
- **R-13, and the slice plan's lead decision.** A game the feed moves is
  moved only while `isOpenAt(now)`, through `Game.reschedule(tipOff, now,
  rules)`. Otherwise it is skipped and reported with its reason: `scored`
  (a result), `postponed` (R-41, the admin gives it a date on the games
  page), `locked` (tipped off, or `lockedSince`). sportbet's "Neperkeliamos
  - jau užrakintos" heads them; each row says which.
- **R-110.** On a finished tournament (`isFinishedWindowAt`) preview and
  apply refuse: "Turnyras baigtas - keisti negalima."
  (`tournament-finished`).
- **R-10.** Created rounds are stage `regular`, rate `stageRate('regular')`
  (1), not knockout, named "N turas". Their survival flag: see the open
  question below (sportbet: off).
- **R-73.** "Players affected" and the seeded rows are the tournament's
  players (`tournament_players`), not league members.

## Lead decisions (technical)

- **The feed sits behind one adapter, and no test can reach it.**
  `EuroleagueFeed` (domain type: `games(season) -> Promise<Result<unknown,
  FeedFailure>>`, failures `unreachable`, `http-error` with the status,
  `not-json`) has two implementations in
  `packages/db/src/import/feed.ts`: `liveEuroleagueFeed(fetchFn)` (the
  only code in the repo that names the Euroleague host; 60 s
  `AbortSignal.timeout`, two retries a second apart) and
  `fixtureEuroleagueFeed(path)`. Which one runs is `EUROLEAGUE_FEED`
  (`live` | `fixture`, with `EUROLEAGUE_FEED_FIXTURE`), held to
  `SPORTBET_ENV` like the mail transport: `staging` and `production` only
  `live`; `ci` and an unset environment only `fixture`; `local` either. A
  bad setting stops the server at start. Every Vitest config (domain, db,
  web component and feature) gets a setup file that wraps global `fetch`
  so any host but `localhost` / `127.0.0.1` throws "network is closed in
  tests" (Mailpit and the started app stay reachable; a test's own
  `vi.stubGlobal` still wins), and lint bans the `fetch` global in
  `packages/domain` and in `packages/db` outside `feed.ts`. Tests
  pass a fake or the fixture; the live adapter is tested with an injected
  `fetchFn` only. The earlier incident (a test reaching a real service)
  cannot recur without breaking three guards at once.
- **The fixture** is sportbet's, copied to
  `packages/domain/test/fixtures/euroleague-e2026-games.json` unchanged;
  post-season, malformed and moved cases are built from it in the test.
- **Planning is pure** (`planEuroleagueImport`), from the parsed fixtures,
  the tournament's teams, season, games and player count, `now`, the rule
  set and `finished`. The plan lists what it would create, move, skip,
  leave and list as dropped. `canonicalPlan(plan)` is its stable text (sorted,
  ids and instants as ISO strings); `db` hashes it (SHA-256) into the
  fingerprint. Apply re-plans under the lock and compares, which is R-93
  and sportbet's "re-derived rather than trusted" together.
- **Team matching** is sportbet's key, `teamNameKey` (TeamLogo::baseName),
  moved from `apps/web/src/components/hub/crests.ts` into the domain
  (`team/crests.ts`) with `CREST_FILES` and `hasCrest(name)`, so the
  importer, the command and the crest component share one lookup; web's
  `crestPath` keeps building the URL from them. `crests.test.ts` still
  holds the list equal to `public/img/teams`.
- **Refusals in the plan, in sportbet's order:** `tournament-finished`,
  `duplicate-team-names` (the name), `unmatched-teams` (the names, sorted
  as `clubs` sorts), `round-not-regular` (the number), `duplicate-fixture`
  (a round, home and away the feed lists twice; the unique index
  `games_round_teams_unique` would otherwise 500). Parser refusals:
  `no-games`, `malformed` (index, field; `phaseType.code` joins the checked
  fields, and home equal to away is malformed at `road.club.name`).
- **Game identity** stays sportbet's (round, home, away). A game the feed
  moves to another round appears as a new game plus a dropped one; the
  admin decides (R-94).
- **No blank `game_odds` row** (slice 13's decision): odds before a result
  are computed on read (R-61).
- **One write path.** `applyEuroleagueImport(db, { tournament, fixtures,
  fingerprint, now, rules })`, after the feed is fetched (never inside a
  lock): `lockTournamentForRecalculation`; the existing games the plan
  would move locked `FOR NO KEY UPDATE` in id order (the lock order's game
  step, so a prediction save cannot slip between judging and moving); the
  state read and planned under the lock; the fingerprint compared; teams
  inserted with empty `team_outcomes`, rounds, games (multi-row, returning
  ids), moves (`tip_off`, `locked_since`, `postponed` from `reschedule`),
  then `seedBlankRows(tx, tournament, {})` for every player over every game
  and team (unconditional, sportbet's repair), then one
  `recalculateUnderRuleSet` under the live rule set, as slice 13's
  writers. Inserts go through `inChunks` (about 380 games times the
  players). A refusal writes nothing.
- **`reminded_at`.** sportbet clears a moved game's reminder (issue 283).
  The column arrives with slice 16 (`match_predictions.reminded_at`);
  whichever of slices 15 and 16 lands second makes the import's moves and
  slice 13's `updateGame` set it null for the moved game.
- **The admin's tournament** (slice 13: `player_settings.admin_tournament_id`,
  else the request's) is the one imported into; the page heads with its
  name. sportbet's tournament select is not carried.
- **Addresses.** `GET /admin/import` (the form), `GET
  /admin/import/preview?season=E2026` (sportbet POSTs it; a Next page
  answers GET, and the preview writes nothing; it is only reached by the
  form, never a `<Link>`, so nothing prefetches it) and `POST
  /admin/import/save` (sportbet's `POST /admin/import`; Next cannot serve
  a page and a handler at one path, as slice 13's `events/save`). The save
  posts `season` and `fingerprint` and answers 303 to `/admin/import` with
  the flash; an R-93 refusal answers 303 to the preview with its flash.
- **Gate and limits.** `adminGate(isSuperadmin)` on all three. The save
  counts against `adminWriteLimits` (60 a minute); the preview against
  `importPreviewLimits` (10 a minute per account, new), so a held key
  cannot hammer the feed. A bad season code is refused before the feed is
  called: "Netinkamas sezono kodas." (new; sportbet answered Laravel's
  regex message).
- **The result flash** is sportbet's without the crest count, with the
  skips split: "Importuota: :teams komandų, :rounds turų, :games naujų
  rungtynių, :moved perkeltų, :skipped neperkeltų. Spėjimų eilutės
  sukurtos :players žaidėjams." plus "Komandos be logotipo: :teams." when
  any (owner may reword). `pointsChanged()` after an apply.
- **The command** is a `db` bin, `packages/db/src/bin/euroleague-import.ts`
  (bundled by `build.mjs` into the migrate image), a thin wrapper over
  `runEuroleagueImportCommand(args, { db, feed, now, out })`:
  `<tournament id or slug> [--season E2026] [--dry-run]`, the plan as a
  table (sportbet's rows plus post-season left out, dropped, without
  crest), exit 1 on an unknown tournament or a refusal. On the Oracle host:
  `docker compose run --rm migrate node dist/euroleague-import.mjs ...`.
  It cannot call `pointsChanged()` (Next's cache); the leaderboard catches
  up within its minute.
- **Vercel's limit.** The save route sets `maxDuration = 60`; the db test
  times a 380-game import for 200 players and must finish well inside it.

## Open question for the owner

- **Survival on imported rounds.** sportbet creates them with survival off
  (`EuroleagueScheduleImporter.php:221-236`), so the admin ticks 38 rounds
  by hand; R-10 (`docs/owner-rulings.md:196-197`) says survival is the
  regular season. (a) off, as sportbet; (b) on when the tournament's
  survival switch is on. Recommended: (b). Until answered, the plan builds
  (a) behind one constant in `import-plan.ts`.

## Design

### Domain (`packages/domain/src/import/`, `team/`)

- `season-code.ts`: `seasonCodeSchema` (`^[A-Z]{1,2}[0-9]{4}$`).
- `euroleague-feed.ts`: `EuroleagueFeed`, `FeedFailure`;
  `parseEuroleagueFeed(payload: unknown) -> Result<FeedSeason, FeedRefusal>`
  (`FeedSeason` = the regular-season `EuroleagueFixture`s - round, tip-off,
  home, away - and `postSeasonLeftOut`).
- `import-plan.ts`: `planEuroleagueImport(input) -> Result<ImportPlan,
  ImportRefusal>`; `ImportPlan` = `teamsToCreate`, `roundsToCreate`,
  `gamesToCreate`, `moves` (game, label, from, to), `skippedMoves` (label,
  from, to, reason), `unchanged`, `dropped` (game, label, round, tip-off),
  `postSeasonLeftOut`, `teamsWithoutCrest`, `playersAffected`;
  `isNoop(plan)` (sportbet's four lists empty); `canonicalPlan(plan)`.
- `import-throttle.ts`: `importPreviewLimits`.
- `team/crests.ts`: `teamNameKey`, `CREST_FILES`, `hasCrest`.

### Database (`packages/db/src/import/`)

- `feed.ts`: `liveEuroleagueFeed`, `fixtureEuroleagueFeed`,
  `euroleagueFeedEnvSchema`.
- `state.ts`: `loadImportState(tx, tournament)` - teams, season, games,
  player count, finished; parsed with the domain schemas.
- `preview.ts`: `previewEuroleagueImport(db, { tournament, fixtures,
  postSeasonLeftOut, now, rules })` -> the plan and its fingerprint.
- `apply.ts`: `applyEuroleagueImport` (above).
- `command.ts`: `runEuroleagueImportCommand`; `bin/euroleague-import.ts`.

### Web (`apps/web`)

- `app/admin/import/page.tsx`, `preview/page.tsx`, `save/route.ts`.
- `server/import/feed.ts` (the adapter from env), `server/import/texts.ts`
  (the Lithuanian refusals and failures), `server/import/import.ts` (the
  use cases).
- `components/admin/import/`: form, preview (every list, the no-op line,
  the confirm on "Importuoti"), result flash; the admin index tile
  "Tvarkaraščio importas" for a superadmin.

## Testing

- Domain: the parser on the fixture (20 fixtures, rounds 1-2, UTC as
  `utcDate`, names collapsed), each refusal (no `data`, empty, each
  missing field by number and name, a digit-string round, home equal to
  away), R-94 (a `PO` game left out and counted); the plan on an empty
  tournament (20 teams, 2 rounds, 20 games, the 20 crests all found), a
  re-plan of the applied state (no-op), a moved open game, a moved scored /
  postponed / tipped-off / `lockedSince` game (each reason), a dropped
  game, unmatched and duplicate names, `round-not-regular`,
  `duplicate-fixture`, `tournament-finished`, a team without a crest;
  `canonicalPlan` stable under input order; `teamNameKey` as
  `TeamLogo::baseName`. Under both rule sets where `reschedule` decides.
- Database (the fixture through `fixtureEuroleagueFeed`): the same rows as
  sportbet's importer (teams, "1 turas" / "2 turas" regular rate 1, 20
  games at the feed's UTC times); every player gets blank rows, a second
  run duplicates nothing and repairs a deleted row; a move, a skipped
  move; R-93 refusal after a hand-added game and after a changed feed,
  writing nothing; another tournament untouched; a prediction save waiting
  on a move's game lock; totals unchanged by the recalculation; the
  380-game, 200-player timing; the command's dry run writes nothing, its
  apply reports, an unknown tournament exits 1; the live adapter with an
  injected `fetchFn` (URL, retries, timeout, status, bad JSON).
- Feature (the app started with `EUROLEAGUE_FEED=fixture`): the gate
  (player, results manager, superadmin), 403, the bad season code, preview
  writes nothing, save imports and flashes, R-93's 303 to the preview,
  R-110, the throttles. The env schema refuses `live` under `ci`.
- Guards: a test proves the fetch setup throws in each Vitest project.
- Components: form, preview lists and no-op line, skipped reasons, crests
  missing, the tile per role.
- E2E at 390 and 1280: preview the fixture into a fresh tournament,
  import, preview again and see "Viskas jau atnaujinta".

## Done means

On staging the owner creates an empty tournament (slice 13), previews
E2026 from the live feed, imports it (20 teams, 38 rounds, 380 games, every
player with rows), previews again and sees nothing to change; a moved
started game is reported, not moved; a finished tournament refuses; no
test reaches the network (the guards prove it). #32 is closed, and every
rule above has a named test.
