# Slice 15: the Euroleague schedule import - Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking. In this repo the team runs it (`docs/agent-team.md`): backend-dev takes tasks 1-9, web-dev 10-13, qa and architect review each, only the lead commits.

**Goal:** `/admin/import`, its preview and its save, and the `euroleague-import` command, bringing a Euroleague regular season into the admin's tournament from the official feed and moving games it reschedules, at sportbet's texts, under R-93, R-94, R-96, R-13 and R-110 (#32).

**Architecture:** The feed is reached only through `EuroleagueFeed`, whose live implementation is the one place in the repo that names the Euroleague host; tests get the fixture or a fake, and a fetch guard in every Vitest project refuses any non-local host. The domain parses the feed (`parseEuroleagueFeed`, regular season only) and decides the whole import (`planEuroleagueImport`), and gives the plan a stable text (`canonicalPlan`). `packages/db` previews (plan plus SHA-256 fingerprint) and applies through one function that fetches nothing: under the tournament lock and the moved games' row locks it plans again, refuses a changed fingerprint (R-93), writes in chunks, seeds blank rows and recalculates once. `apps/web` has two pages and one route handler answering 303; the command is a `db` bin over the same functions.

**Tech Stack:** TypeScript, Zod, Drizzle on Postgres 18, Next.js App Router, React, Vitest (unit, db, component, feature), Playwright, esbuild.

**Spec:** `docs/superpowers/specs/2026-10-13-euroleague-import-design.md`. Rulings R-10, R-13, R-41, R-73, R-93, R-94, R-96, R-110.

**Prerequisite:** slice 13 has landed - `isSuperadmin`, `adminGate` with it, the admin's tournament (`loadAdminTournament`), `seedBlankRows`, `stageRate`, `adminWriteLimits`, the finished guard and the admin index tiles. If it has not, stop and tell the lead.

## Decisions taken while planning (refine the spec; record them in it in Task 14)

1. **The guard comes first.** Task 1 lands before any code that could fetch, so every later test runs behind it.
2. **Imported rounds' survival flag is one constant**, `IMPORTED_ROUND_SURVIVAL` in `import-plan.ts`, `'off'` (sportbet) until the owner answers the spec's open question; `'tournament'` would copy the tournament's switch. Both are tested; only the constant changes.
3. **The fingerprint covers the plan, not the raw feed.** A feed change that changes nothing for this tournament (a venue, a score) does not refuse an apply; a hand-added game does.
4. **A preview's plan is never stored.** The preview page holds the fingerprint in the save form; the save fetches again. No cookie, no table.
5. **`reminded_at` is left to whichever of slices 15 and 16 lands second** (spec); if slice 16 is in when Task 8 starts, Task 8 sets it null for moved games and tests it.

## File structure

| File | Responsibility |
| --- | --- |
| `packages/domain/vitest.config.ts`, `packages/db/vitest.config.ts`, `apps/web/vitest.*.config.ts` (modify), `test-support/network-guard.ts` per package (create) | the fetch guard |
| `eslint.config.*` (modify) | `fetch` banned in domain and in db outside `import/feed.ts` |
| `packages/domain/src/team/crests.ts` (create), `apps/web/src/components/hub/crests.ts` (modify) | `teamNameKey`, `CREST_FILES`, `hasCrest` moved |
| `packages/domain/test/fixtures/euroleague-e2026-games.json` (create) | sportbet's fixture, byte for byte |
| `packages/domain/src/import/season-code.ts`, `euroleague-feed.ts`, `import-plan.ts`, `import-throttle.ts` (+ tests) (create) | parsing, planning, limits |
| `packages/domain/src/index.ts` (modify) | exports |
| `packages/db/src/import/feed.ts`, `state.ts`, `preview.ts`, `apply.ts`, `command.ts` (create) | adapters, state, preview, apply, command |
| `packages/db/src/bin/euroleague-import.ts` (create), `packages/db/build.mjs` (modify) | the bin |
| `packages/db/src/index.ts` (modify) | exports |
| `packages/db/test/import-*.test.ts` (create) | db tests |
| `apps/web/src/env.ts` (modify) | `EUROLEAGUE_FEED` held to `SPORTBET_ENV` |
| `apps/web/src/server/import/feed.ts`, `texts.ts`, `import.ts` (create) | adapter from env, texts, use cases |
| `apps/web/src/app/admin/import/page.tsx`, `preview/page.tsx`, `save/route.ts` (create) | pages and handler |
| `apps/web/src/components/admin/import/*.tsx` (create), admin index (modify) | views, tile |
| `apps/web/tests/feature/import.test.ts` (create), feature env (modify) | routes |
| `apps/web/e2e/admin-import.spec.ts` (create) | the journey |
| `CLAUDE.md`, the spec (modify) | the write path, the guard |

Run commands from the repo root. Domain: `pnpm --filter @sportbet/domain test -- <file>`; db: `pnpm --filter @sportbet/db test -- <file>` (needs Docker); component: `pnpm --filter @sportbet/web test:component -- <file>`; feature: `pnpm --filter @sportbet/web test:feature -- <file>`; e2e: `pnpm test:e2e`.

---

### Task 1: The network guard

**Files:** the four Vitest configs, a `network-guard.ts` setup per package, `eslint.config.*`.

- [ ] **Step 1: Test first.** In each project add `network-guard.test.ts`: `await expect(fetch('https://example.com')).rejects.toThrow('network is closed in tests')`, and a `http://127.0.0.1:1/` call that fails with a connection error, not the guard's message.
- [ ] **Step 2:** Run each project; expect FAIL (the first reaches the network or fails differently).
- [ ] **Step 3: Implement.** The setup wraps `globalThis.fetch`: parse the URL, allow `localhost`, `127.0.0.1`, `::1`, otherwise throw `new Error('network is closed in tests: <host>')`. Add it to `setupFiles` of every config (feature and db keep their `globalSetup`). Lint: `no-restricted-globals` for `fetch` in `packages/domain/**` and `packages/db/**`, off for `packages/db/src/import/feed.ts`.
- [ ] **Step 4:** `pnpm test && pnpm lint`. Expect PASS; any existing test that fetched a real host now fails - report it to the lead rather than allowing its host.
- [ ] Commit - `test: no test reaches a non-local host - a fetch guard in every Vitest project, fetch banned in domain and db (#32)`

### Task 2: One crest lookup

**Files:** `packages/domain/src/team/crests.ts` (+ test), `apps/web/src/components/hub/crests.ts`, `crests.test.ts`.

- [ ] Move `baseName` (as `teamNameKey`, `TeamLogo::baseName` 72-81: whitespace collapsed, trimmed, lower-cased, null when blank) and `CREST_FILES` into the domain; add `hasCrest(name)` (an `svg` or `png` for the key). Domain tests: `'  Zalgiris   KAUNAS '` keys to `zalgiris kaunas`; blank is null; all 20 fixture clubs have a crest. Web's `crestPath` imports them; `crests.test.ts` unchanged and green.
- [ ] Commit - `refactor(domain): the crest lookup and the team-name key move to the domain, for the import (#32)`

### Task 3: Season code and the feed parser (R-94)

**Files:** `season-code.ts`, `euroleague-feed.ts` (+ tests), the fixture.

```ts
export type FeedFailure =
  | { kind: 'unreachable' }                     // Nepavyko pasiekti Euroleague serverio. ...
  | { kind: 'http-error'; status: number }      // Euroleague serveris grąžino klaidą (:status). ...
  | { kind: 'not-json' };                       // Euroleague atsakymo nepavyko perskaityti.
export interface EuroleagueFeed {
  games(season: SeasonCode): Promise<Result<unknown, FeedFailure>>;
}
export interface EuroleagueFixture {
  readonly round: number; readonly tipOff: Instant;
  readonly home: string; readonly away: string;
}
export type FeedRefusal =
  | { kind: 'no-games' }                                 // Euroleague atsakyme nėra rungtynių. ...
  | { kind: 'malformed'; number: number; field: string };// ... rungtynėse nr. :number trūksta lauko :field.
export function parseEuroleagueFeed(payload: unknown):
  Result<{ fixtures: readonly EuroleagueFixture[]; postSeasonLeftOut: number }, FeedRefusal>;
```

- [ ] **Tests:** the fixture gives 20 fixtures, rounds 1 and 2, the first `2026-09-24T16:00:00Z`, Hapoel IBI Tel Aviv v FC Bayern Munich; `data` missing, not an array, empty -> `no-games`; per field in sportbet's order (`round`, `utcDate`, `local.club.name`, `road.club.name`, then `phaseType.code`) the game number is index + 1; `"7"` is round 7, `"7a"` malformed; an unparsable `utcDate` malformed; names with tabs collapse; home equal to away (by `teamNameKey`) malformed at `road.club.name`; a copy of game 1 with `phaseType.code: 'PO'` is left out and counted. `seasonCodeSchema` takes `E2026`, `U2026`, refuses `e2026`, `E26`, `EUR2026`.
- [ ] Commit - `feat(domain): the Euroleague feed parsed, regular season only (R-94) (#32)`

### Task 4: The plan (R-93, R-94, R-96, R-13, R-110)

**Files:** `import-plan.ts` (+ test).

```ts
export interface ImportInput {
  readonly fixtures: readonly EuroleagueFixture[];
  readonly postSeasonLeftOut: number;
  readonly teams: readonly { id: TeamId; name: string }[];
  readonly season: Season;            // rounds with stage, games as Game
  readonly playerCount: number;
  readonly survivalPlayed: boolean;   // for IMPORTED_ROUND_SURVIVAL
  readonly finished: boolean;
  readonly now: Instant;
  readonly rules: RuleSet;
}
export type ImportRefusal =
  | { kind: 'tournament-finished' }
  | { kind: 'duplicate-team-names'; team: string }
  | { kind: 'unmatched-teams'; teams: readonly string[] }
  | { kind: 'round-not-regular'; round: number }
  | { kind: 'duplicate-fixture'; round: number; home: string; away: string };
export type SkipReason = 'scored' | 'postponed' | 'locked';
```

Order: finished; existing teams keyed by `teamNameKey` (a second team with one key -> `duplicate-team-names`, sportbet 410-430); clubs sorted by key, missing ones created only when the tournament has no team (else `unmatched-teams`, 173-191); a feed round that exists with a stage other than `regular` -> `round-not-regular`; a repeated (round, home, away) -> `duplicate-fixture`; then per fixture (sportbet 73-102): no game -> create; same tip-off -> unchanged; else `scored` (a result) / `postponed` / `locked` (not `isOpenAt(now)`) -> skipped, otherwise a move with `game.reschedule(tipOff, now, rules)`'s fields. `dropped`: games of `regular` rounds no fixture matches, by round then tip-off. `teamsWithoutCrest`: every team the plan ends with whose `hasCrest` is false. Created rounds: "N turas", `regular`, `stageRate('regular')`, not knockout, survival per `IMPORTED_ROUND_SURVIVAL`.

- [ ] **Tests** (both rule sets where a move is decided): empty tournament -> 20 teams, rounds 1 and 2, 20 games, no crest missing; the applied state re-planned is `isNoop`; a game an hour later and open -> one move; the same game scored, postponed, tipped off, and with `lockedSince` -> one skip each with its reason, nothing moved; a game in round 1 the feed lacks -> dropped; a game in a `playoffs` round the feed lacks -> not dropped; each refusal; `tournament-finished` before anything else; "Zalgiris" in the tournament -> `unmatched-teams` naming "Zalgiris Kaunas"; a team "Dubai  basketball" matches; a renamed club with no crest is listed; survival flag under both constant values; `canonicalPlan` equal for shuffled fixtures, different after one move.
- [ ] Commit - `feat(domain): planEuroleagueImport - moves only open games (R-13), lists dropped games (R-94) and crestless teams (R-96) (#32)`

### Task 5: The preview limit

- [ ] `importPreviewLimits(player)`: 10 a minute per account, beside `adminWriteLimits`; test the key and the numbers. Commit - `feat(domain): importPreviewLimits (#32)`

### Task 6: The feed adapters

**Files:** `packages/db/src/import/feed.ts` (+ `packages/db/test/import-feed.test.ts`).

- [ ] `liveEuroleagueFeed(fetchFn)`: GET `https://api-live.euroleague.net/v2/competitions/E/seasons/${encodeURIComponent(season)}/games`, `accept: application/json`, `AbortSignal.timeout(60_000)`, up to 3 attempts a second apart on a thrown error or 5xx; maps to `FeedFailure`. `fixtureEuroleagueFeed(path)` reads and `JSON.parse`s the file. `euroleagueFeedEnvSchema` (`EUROLEAGUE_FEED`, `EUROLEAGUE_FEED_FIXTURE`, `SPORTBET_ENV`): staging and production only `live`; `ci` and unset only `fixture`; `local` either.
- [ ] **Tests** (injected `fetchFn` only; Task 1's guard proves nothing else): the URL; a 404 -> `http-error` 404 with no retry; two 503s then 200 -> ok after 3 calls (fake timers); a throw three times -> `unreachable`; HTML body -> `not-json`; the fixture adapter on the fixture; the env schema's every pair.
- [ ] Commit - `feat(db): the Euroleague feed adapter - live with retries, fixture for tests, held to SPORTBET_ENV (#32)`

### Task 7: State and preview

**Files:** `state.ts`, `preview.ts` (+ `import-preview.test.ts`).

- [ ] `loadImportState(tx, tournament, now)`: teams (id, name), the season (`Season` with rounds' stages and every game as `Game.stored`), `tournament_players` count, `survival`, `finished` (`isFinishedWindowAt`); every row parsed with the domain schema. `previewEuroleagueImport(db, { tournament, fixtures, postSeasonLeftOut, now, rules })` -> `Result<{ plan, fingerprint }, ImportRefusal>`, fingerprint `sha256(canonicalPlan(plan))` hex. Reads only.
- [ ] **Tests:** the fixture into an empty tournament (counts, fingerprint stable across two calls); no row written (table counts before and after); another tournament's teams ignored.
- [ ] Commit - `feat(db): previewEuroleagueImport - the plan and its fingerprint, writing nothing (#32)`

### Task 8: Apply

**Files:** `apply.ts` (+ `import-apply.test.ts`).

- [ ] `applyEuroleagueImport(db, { tournament, fixtures, postSeasonLeftOut, fingerprint, now, rules })` -> `Result<ImportResult, ImportRefusal | { kind: 'plan-changed' }>`: `lockTournamentForRecalculation`; the games of the tournament's `regular` rounds `FOR NO KEY UPDATE` by id (the lock order's game step); `loadImportState`; plan; compare fingerprints (`plan-changed`); insert teams and empty `team_outcomes`, rounds, games (`inChunks`, `returning id`); update moved games' `tip_off`, `locked_since`, `postponed`; `seedBlankRows(tx, tournament, {})`; `recalculateUnderRuleSet` with the live rule set. `ImportResult` = counts of teams, rounds, games, moves, skips, players seeded, and `teamsWithoutCrest`. Any refusal rolls back.
- [ ] **Tests:** sportbet's rows on the fixture (`EuroleagueImportTest` 252-304: 20 teams, "1 turas" and "2 turas" regular rate 1, 20 games at the feed's UTC); every player has 20 blank match rows and 20 standings rows; a second apply writes nothing new and restores a deleted blank row (321-349); a moved open game moves, a started one keeps its date (378-447), a scored one too (502-531); a hand-added game after the preview -> `plan-changed`, nothing written; a changed feed fixture -> `plan-changed`; a finished tournament refused; another tournament untouched (587-606); totals unchanged; a prediction save holding a game `FOR SHARE` makes apply wait, then judge under the lock; 380 games x 200 players under 20 s on CI.
- [ ] Commit - `feat(db): applyEuroleagueImport - one transaction under the lock, refused when the plan changed (R-93) (#32)`

### Task 9: The command

**Files:** `command.ts`, `bin/euroleague-import.ts`, `build.mjs` (+ `import-command.test.ts`).

- [ ] `runEuroleagueImportCommand(argv, { db, feed, now, rules, out })`: `<tournament id or slug> [--season E2026] [--dry-run]`; an unknown tournament -> "No tournament matches \"x\"." exit 1; a bad season code exit 1; prints sportbet's table rows (`ImportEuroleagueSchedule.php` 52-60) plus "Post-season left out", "Dropped from the feed", "Teams without a crest"; `--dry-run` -> "Dry run: nothing was written."; else applies with the fingerprint it just made and prints the counts. The bin reads `DATABASE_URL` and `euroleagueFeedEnvSchema`, nothing else. Add the entry to `build.mjs`.
- [ ] **Tests** (fixture feed): dry run writes nothing; apply reports; unknown tournament exits 1; by slug and by id.
- [ ] Commit - `feat(db): the euroleague-import command, with --dry-run (#32)`

### Task 10: Web use cases and env

**Files:** `apps/web/src/env.ts`, `server/import/feed.ts`, `texts.ts`, `import.ts`.

- [ ] `env.ts` adds `euroleagueFeedEnvSchema`; the feature-test env sets `EUROLEAGUE_FEED=fixture` and the fixture path; CI and `.env.example` follow. `texts.ts`: every refusal and failure in Lithuanian, sportbet's where it had one, the spec's new ones marked "new". `import.ts`: `previewImport(admin, season)` and `saveImport(admin, season, fingerprint)` - gate, limits, the admin's tournament, fetch, parse, preview / apply, `pointsChanged()` after an apply.
- [ ] Commit - `feat(web): the import's use cases and texts; EUROLEAGUE_FEED held to SPORTBET_ENV (#32)`

### Task 11: Pages and the route

- [ ] `app/admin/import/page.tsx` (the form, the flash), `preview/page.tsx` (`?season=`, refused code -> back to the form with "Netinkamas sezono kodas."), `save/route.ts` (posts `season`, `fingerprint`; 303 to `/admin/import` with the result flash; `plan-changed` -> 303 to the preview with its flash; cross-site 403; `maxDuration = 60`). Each gated by `adminGate(isSuperadmin)`.
- [ ] **Feature tests** (`tests/feature/import.test.ts`): a player and a results manager go home; preview lists 20 new teams and writes nothing; save imports and flashes; a second preview reads "Viskas jau atnaujinta - nieko keisti nereikia."; a stale fingerprint -> 303 to the preview; finished tournament; 403; both throttles.
- [ ] Commit - `feat(web): /admin/import, its preview and its save (#32)`

### Task 12: Views and the tile

- [ ] `components/admin/import/`: the form ("Tvarkaraščio importas", sportbet's intro rewritten without the crest download, "Sezono kodas", "E2026 - 2026-27 sezonas", "Peržiūrėti"); the preview ("Ką padarys importas", each list with sportbet's heading, "Neperkeliamos - jau užrakintos" with a reason per row - "turi rezultatą", "atidėtos", "jau prasidėjo" (new) - "Tvarkaraštyje nebėra", "Atkrintamųjų rungtynių neimportuota: N", "Komandos be logotipo", the no-op line, "Importuoti" with the confirm); times shown in Vilnius. Tile "Tvarkaraščio importas" for a superadmin. Tokens only.
- [ ] Component tests for each list, the reasons, the no-op line, the tile per role. Commit - `feat(web): the import views and the admin tile (#32)`

### Task 13: E2E

- [ ] At 390 and 1280, with the stack's fixture feed: create a tournament, choose it, preview, import, preview again and see the no-op line. Commit - `test(e2e): import a season from the fixture (#32)`

### Task 14: Docs

- [ ] **CLAUDE.md:** after the admin write paths, the import (the feed only through `EuroleagueFeed`, `liveEuroleagueFeed` the only code naming the host, `EUROLEAGUE_FEED` held to `SPORTBET_ENV`, the fetch guard and lint; the plan decided only by `planEuroleagueImport`, written only by `applyEuroleagueImport` under the tournament lock with the moved games' rows locked, refused on a changed fingerprint). The spec records the decisions above and the owner's answer on survival.
- [ ] Commit - `docs: the import's write path and the network guard (#32)`

### Finish

- [ ] `pnpm typecheck && pnpm lint && pnpm test`, the db and feature suites, E2E. `mp-code-review` from the slice's base; architect and qa review. On staging the owner runs the spec's "Done means"; #32 closes.
