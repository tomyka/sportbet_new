# Slice 13: admin - tournaments, rounds, games, teams - Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking. In this repo the team runs it (`docs/agent-team.md`): backend-dev takes tasks 1-13, web-dev 14-20, qa and architect review each, the security reviewer reviews tasks 7 and 14 (the emailed confirmation), only the lead commits.

**Goal:** `/admin/tournaments`, `/admin/events`, `/admin/games` and `/admin/teams` at sportbet's URLs and texts, under R-26 amended and R-89 to R-92, plus the reusable emailed confirmation of a destructive superadmin action (#30).

**Architecture:** The domain decides every admin write (`*FormEntry`, then `insertRound` / `planGameChange` / `gameDeletion` / `finalMark` / ...) and the Vilnius time (`vilniusTipOff`). `packages/db` writes each through one function that takes the tournament's recalculation lock, then the game row where one is touched, decides under the lock, writes and recalculates through `recalculateUnderRuleSet`. `apps/web` has pages that load and route handlers that answer a 303 with a flash. Deleting a game passes through `server/admin/confirm/`: a code mailed to the superadmin, an action sealed in `__Host-sb_confirm`, the shared `checkCode`.

**Tech Stack:** TypeScript, Zod, Drizzle on Postgres 18, Next.js App Router, React, Vitest (unit, db, component, feature), Playwright, Mailpit.

**Spec:** `docs/superpowers/specs/2026-10-13-admin-structure-design.md`. Rulings R-10, R-13, R-16, R-21, R-22, R-26 amended, R-37, R-43, R-55, R-67, R-89 to R-92. The spec's open questions 1-3 change Tasks 6, 4 and every writer's finished guard; do not start them before the owner answers.

## Decisions taken while planning (refine the spec; record them in it in Task 21)

1. **No blank `game_odds` row on insert.** sportbet's (`GameController.php:122`) has no reader here: odds before a result are computed on read (R-61), and only `recalculateTournament` derives `game_odds` (CLAUDE.md).
2. **`seedBlankRows` is extracted from `registerForTournament`** (`packages/db/src/joining/repository.ts:203-226`), unchanged in behaviour, so a late joiner, a new game and new teams seed rows one way.
3. **The admin's tournament is stored with the account** (`player_settings.admin_tournament_id`), as R-28 stores the last-used one; the session stays the player (decision 5). A brand-new tournament has no players, so the request context's tournament cannot reach it.
4. **A delete or a change locks the game row `FOR UPDATE`** after the tournament lock. A prediction save takes the row `FOR SHARE` and waits at most 5 s, so the real-prediction count read under the lock is final until commit.
5. **The confirmation holds one pending action per admin.** `issueLoginCode` voids the earlier code of the address and purpose, and the cookie is overwritten, so a code can only ever confirm the action the cookie names.
6. **The rate form caps at 127** (sportbet's `max:127`, the `smallint`); the invariant stays `min: 1`.

## File structure

| File | Responsibility |
| --- | --- |
| `packages/domain/src/account/role.ts` (modify) | `isSuperadmin`, `mayEnterStandingsFacts`, `mayUnmarkFinalTable` |
| `packages/domain/src/account/login-code.ts` (modify) | `admin_action` purpose |
| `packages/domain/src/admin/confirmable-action.ts` (create) | `ConfirmableAction`, schema, `adminConfirmLimits` |
| `packages/domain/src/admin/admin-write-throttle.ts` (create) | `adminWriteLimits` |
| `packages/domain/src/shared/vilnius-time.ts` (create) | `vilniusTipOff`, `utcPreview` (R-91) |
| `packages/domain/src/round/round-form.ts`, `round-admin.ts` (create) | round form, insert / change / delete, `stageRate` |
| `packages/domain/src/round/game-form.ts`, `game-admin.ts` (create) | game form, `planNewGame`, `planGameChange`, `gameDeletion` |
| `packages/domain/src/team/team-admin.ts` (create) | `placeholderTeams`, `teamRenameEntry` |
| `packages/domain/src/standings/standings-facts.ts` (create) | `standingsFactsEntry`, `finalMark` (R-92) |
| `packages/domain/src/tournament/tournament-form.ts` (create) | `tournamentFormEntry`, `survivalAllowed` |
| `packages/domain/src/index.ts` (modify) | exports |
| `packages/db/src/account/schema.ts`, `migrations/*` (modify, generate) | purpose value, `admin_tournament_id` |
| `packages/db/src/joining/seed-blank-rows.ts` (create), `repository.ts` (modify) | `seedBlankRows` |
| `packages/db/src/tournament/admin.ts` (create) | `createTournament`, `updateTournament`, `chooseAdminTournament`, `loadAdminTournament` |
| `packages/db/src/season/admin.ts` (create) | round and game writers |
| `packages/db/src/team/admin.ts` (create) | `insertPlaceholderTeams`, `renameTeam`, `saveStandingsFacts` |
| `packages/db/src/admin/pages.ts` (create) | the four page loaders |
| `packages/db/test/admin-*.test.ts` (create) | db tests |
| `apps/web/src/server/admin/confirm/*` (create), `server/cookies.ts` (modify), `server/mail/admin-confirmation-mail.ts` (create) | the confirmation |
| `apps/web/src/server/admin/{tournaments,rounds,games,teams}.ts`, `texts.ts` (create) | use cases, Lithuanian refusals |
| `apps/web/src/app/admin/{tournaments,events,games,teams,teaminsert,confirm,...}/**` (create) | pages and route handlers |
| `apps/web/src/components/admin/*.tsx` (create, modify) | views; index tiles |
| `apps/web/tests/feature/admin-structure.test.ts`, `admin-confirm.test.ts` (create) | routes and pages |
| `apps/web/e2e/admin.spec.ts` (create or modify) | the journey |
| `CLAUDE.md`, the spec (modify) | write paths, the confirmation |

Run commands from the repo root. Domain tests: `pnpm --filter @sportbet/domain test -- <file>`; db: `pnpm --filter @sportbet/db test -- <file>` (needs Docker); component: `pnpm --filter @sportbet/web test:component -- <file>`; feature: `pnpm --filter @sportbet/web test:feature -- <file>`; e2e: `pnpm test:e2e`.

---

### Task 1: Roles

**Files:** Modify `packages/domain/src/account/role.ts`, `role.test.ts`, `apps/web/src/server/admin/gate.test.ts`.

- [ ] Tests first: `isSuperadmin` true only for `superadmin`; `mayEnterStandingsFacts` for `results-manager` and `superadmin`; `mayUnmarkFinalTable` superadmin only. `adminGate(isSuperadmin)` refuses a results manager.
- [ ] Run, expect FAIL; implement (each with its R-26 amended doc comment); run, expect PASS.
- [ ] Commit - `feat(domain): isSuperadmin and the standings-facts permissions (R-26 amended) (#30)`

### Task 2: `vilniusTipOff` (R-91)

**Files:** Create `packages/domain/src/shared/vilnius-time.ts`, `.test.ts`.

```ts
/**
 * R-91: a `YYYY-MM-DDTHH:mm` typed on the admin's form, read as Vilnius
 * time. A time the spring change skips, or the autumn change repeats, is
 * refused rather than guessed (sportbet's Carbon::parse picks one).
 */
export function vilniusTipOff(
  text: string,
): Result<Instant, 'bad-time' | 'nonexistent-time' | 'ambiguous-time'>;
/** The UTC time shown under the box before saving: `YYYY-MM-DD HH:mm UTC`. */
export function utcPreview(at: Instant): string;
```

Implement with `Intl.DateTimeFormat('en-CA', { timeZone: 'Europe/Vilnius', ... })`: try both offsets (+02:00, +03:00); zero round-trips is nonexistent, two is ambiguous.

- [ ] Tests: `2026-12-01T20:00` -> 18:00Z; `2026-07-01T20:00` -> 17:00Z; `2027-03-28T03:30` nonexistent; `2026-10-25T03:30` ambiguous; `2026-10-25T02:59` and `04:00` fine; `2026-13-01T10:00`, `''`, `2026-12-01 20:00` bad.
- [ ] FAIL, implement, PASS. Commit - `feat(domain): vilniusTipOff refuses a clock-change hour (R-91) (#30)`

### Task 3: Rounds

**Files:** Create `packages/domain/src/round/round-form.ts`, `round-admin.ts` and tests.

`roundFormEntry({ event, eventDay, stage, rate, eventSurvival, isKnockout })` checks field by field (sportbet's names, `validateNameAndDay` then the request's `rate`): name required; day through `roundNumberInvariant`; stage in `STAGES`; rate an integer 1-127; switches `on` or absent. `insertRound(season, entry, { finished })`, `changeRound(season, round, entry, { finished })`, `deleteRound(season, round, { finished })` -> refusals `duplicate-number`, `has-games`, `tournament-finished`. `stageRate(stage)` is R-10's table.

- [ ] Tests for each refusal and acceptance, `stageRate` for every stage. FAIL, implement, PASS.
- [ ] Commit - `feat(domain): the round form and its admin decisions; a round with games is kept (#30)`

### Task 4: Games (R-89, R-90, R-13)

**Files:** Create `packages/domain/src/round/game-form.ts`, `game-admin.ts` and tests.

`gameFormEntry({ gameDateTime, homeTeamID, awayTeamID, eventID })` (ids through `idFromText`, time through `vilniusTipOff`). `planNewGame(season, teams, entry, { finished })`; `planGameChange(season, game, entry, { realPredictions, now, rules, finished })`: R-90 `teams-fixed` when `game.hasTippedOffAt(now)`, `realPredictions > 0` and a team changes; the date through `game.reschedule(tipOff, now, rules)` (R-13); `mixed-tournament` (a team or round not the game's tournament's - sportbet's issue 272); `same-team-twice`; `duplicate-pair` (D16(c)). `gameDeletion(game, { realPredictions, finished })` -> `has-real-predictions` (R-89), `has-result` (OPEN QUESTION 2), `tournament-finished`.

- [ ] Tests: each refusal; R-90 before tip-off (teams change), started without real predictions (teams change), started with one (refused, date and round still change); R-13 moved later after lock stays locked, under both sets; R-89 blank rows only (allowed), a fill-in only after a result (`has-result`), one real (refused).
- [ ] FAIL, implement, PASS. Commit - `feat(domain): game insert, change and delete decisions (R-89, R-90, R-13) (#30)`

### Task 5: Teams and the standings facts (R-92)

**Files:** Create `packages/domain/src/team/team-admin.ts`, `packages/domain/src/standings/standings-facts.ts` and tests.

`placeholderTeams(teamCount, { existing })` -> `team1..teamN`, 2-64 (`TeamController.php:68`), `teams-exist` when the tournament has any. `teamRenameEntry({ teamID, teamName })`. `standingsFactsEntry({ teamID[], place[], playOffs[], finalFour[], finalPlace[], final })` -> rows -> `TeamOutcomes.enter`. `finalMark({ outcomes, teamCount, wasFinal, final, role })`: marking needs every place filled and exactly 1..teamCount (`places-incomplete`); taking it off needs `mayUnmarkFinalTable` (`unmark-not-allowed`).

- [ ] Tests: counts 1, 2, 64, 65, existing teams; R-92 complete, a gap, a missing place, a place past N, a results manager unmarking (refused), a superadmin unmarking. FAIL, implement, PASS.
- [ ] Commit - `feat(domain): placeholder teams and the standings facts; final only when complete (R-92) (#30)`

### Task 6: Tournaments

**Files:** Create `packages/domain/src/tournament/tournament-form.ts` and test.

`tournamentFormEntry` field by field in `adminStore`'s order: name (`tournamentNameInvariant`, 255), slug (`slugInvariant`), deadline round (empty or 1-255), status (OPEN QUESTION 1; default: `upcoming` or `active`), start and end dates (end not before start), description (1000), public, survival. `survivalAllowed({ survival, drawAllowed, existing })` ports `refuseSurvivalWithDraws` (`TournamentController.php:351-368`). Uniqueness of the slug is the database's (a typed refusal from the writer).

- [ ] Tests for each field, the date order, `survivalAllowed`'s four cases. FAIL, implement, PASS.
- [ ] Commit - `feat(domain): the tournament form (#30)`

### Task 7: The confirmation's domain

**Files:** Modify `packages/domain/src/account/login-code.ts`; create `packages/domain/src/admin/confirmable-action.ts`, `admin-write-throttle.ts` and tests.

```ts
/** R-26 amended: a destructive superadmin action, confirmed by an emailed code. Slice 14 adds its kinds here. */
export type ConfirmableAction = { readonly kind: 'delete-game'; readonly game: GameId };
export const confirmableActionSchema: z.ZodType<ConfirmableAction>;
export function adminConfirmLimits(player: PlayerId): readonly ThrottleLimit[]; // 5 codes, 10 checks / 10 min
export function adminWriteLimits(player: PlayerId): readonly ThrottleLimit[];   // 60 / min
```

- [ ] Tests: the schema accepts its kind and refuses an unknown kind or a bad id; the purposes list. FAIL, implement, PASS.
- [ ] Commit - `feat(domain): ConfirmableAction and the admin_action code purpose (R-26 amended) (#30)`

### Task 8: Migration and `seedBlankRows`

**Files:** Modify `packages/db/src/account/schema.ts`; generate `pnpm --filter @sportbet/db db:generate --name admin-structure`; create `packages/db/src/joining/seed-blank-rows.ts`; modify `joining/repository.ts`.

- [ ] `admin_tournament_id integer` FK `tournaments` `on delete set null`; the enum value. Review the SQL (`ALTER TYPE ... ADD VALUE`).
- [ ] Move the blank-row inserts of `registerForTournament` into `seedBlankRows(tx, tournament, { players?, games?, teams? })` (rows inserted where missing). The joining tests pass unchanged.
- [ ] Commit - `refactor(db): seedBlankRows, shared by joining and the admin writers; admin_tournament_id (#30)`

### Task 9: Tournament writers

**Files:** Create `packages/db/src/tournament/admin.ts`, `packages/db/test/admin-tournament.test.ts`.

`createTournament(db, entry)` -> `Result<Tournament, 'slug-taken'>`: tournament, profile and `ensurePublicLeague` in one transaction. `updateTournament(db, { tournament, entry, rules })`: tournament lock; a change to the end date, survival or deadline round recalculates. `chooseAdminTournament(db, player, tournament)`, `loadAdminTournament(db, player)`.

- [ ] Tests: create makes one public league; a taken slug refused, nothing written; changing the deadline round changes stored standings points; the choice survives, a deleted choice reads null.
- [ ] Commit - `feat(db): create and update a tournament; the admin's tournament (#30)`

### Task 10: Round writers

**Files:** Create `packages/db/src/season/admin.ts` (rounds), `packages/db/test/admin-rounds.test.ts`.

Each under `lockTournamentForRecalculation`, the season read under it, decided by Task 3, written, `recalculateUnderRuleSet`.

- [ ] Tests: insert; a rate change changes stored match points; a duplicate number refused; a round with games refused; a refusal writes nothing (also inside a caller's transaction).
- [ ] Commit - `feat(db): round writers under the tournament lock, each recalculating (#30)`

### Task 11: Game writers

**Files:** Modify `packages/db/src/season/admin.ts`; create `packages/db/test/admin-games.test.ts`.

`insertGame` (seeds every tournament player's blank row through `seedBlankRows`, no `game_odds`), `updateGame`, `deleteGame`: tournament lock, game row `FOR UPDATE`, real predictions counted under it, Task 4 decides, write, recalculate. A delete removes blank match rows, then the game.

- [ ] Tests: insert seeds N blank rows and no odds row; R-90 refused with a real prediction on a started game; a moved round changes points; R-13 moved later keeps `locked_since`; delete with blank rows only; refused with a real one; a prediction save racing a delete (one wins, no orphan); 55P03 after 5 s on a held lock.
- [ ] Commit - `feat(db): game writers - seeded insert, R-90 change, R-89 delete (#30)`

### Task 12: Team writers

**Files:** Create `packages/db/src/team/admin.ts`, `packages/db/test/admin-teams.test.ts`.

`insertPlaceholderTeams` (teams, empty outcomes, `seedBlankRows` for every player), `renameTeam` (no recalculation), `saveStandingsFacts` (tournament lock, `saveTeamOutcomes`, `standings_table_final`, recalculate).

- [ ] Tests: placeholders refused when teams exist; every player's standings rows seeded; facts change stored standings points; marking final scores places; unmarking unscores them (R-37); a team of another tournament refused.
- [ ] Commit - `feat(db): placeholder teams, rename and the standings facts, recalculated (R-16, R-37) (#30)`

### Task 13: Page loaders

**Files:** Create `packages/db/src/admin/pages.ts`, `packages/db/test/admin-pages.test.ts`; modify `packages/db/src/index.ts`.

`loadAdminTournaments`, `loadAdminRounds(tournament)`, `loadAdminGames(tournament)` (games newest id first, team and round names, real-prediction counts, the tournament's teams and rounds, the latest tip-off for the new game's default), `loadAdminTeams(tournament)` (names, outcomes, final mark). Parsed with the domain schemas.

- [ ] Tests for each loader on the golden scenario. Commit - `feat(db): the admin structure pages' loaders (#30)`

### Task 14: The emailed confirmation (web)

**Files:** Create `apps/web/src/server/admin/confirm/{request,check,actions}.ts` and tests, `server/mail/admin-confirmation-mail.ts` and test; modify `server/cookies.ts`, `sign-in/send-code.ts` (accept the purpose), `app/admin/confirm/page.tsx`, `app/admin/confirm/save/route.ts`, `components/admin/confirm-view.tsx`.

- [ ] `__Host-sb_confirm`: sealed `{ account, action, issuedAt }`, purpose `admin-confirm`, Max-Age 300, cleared with its flags and Max-Age 0.
- [ ] `requestConfirmation(admin, action)`: `adminConfirmLimits`, `issueLoginCode` for the admin's address under `admin_action`, the mail after the response, the cookie, 303 `/admin/confirm`.
- [ ] `confirm/save`: same origin, `adminGate` with the action's permission, the cookie for this account, `checkCode`, clear the cookie, perform, 303 with the performer's flash. Wrong: flash "Neteisingas arba pasibaigęs kodas.".
- [ ] Feature tests (spec "Testing"), mail through Mailpit. Security review before commit.
- [ ] Commit - `feat(web): the emailed confirmation of a destructive superadmin action (R-26 amended) (#30)`

### Task 15: Tournaments pages

`/admin/tournaments` (list, "Dirbti šiame turnyre" posting `context`), `/create`, `/[id]/edit`, `POST /admin/tournaments`, `POST /admin/tournaments/[id]`, `POST /admin/tournaments/[id]/context`; gate `isSuperadmin`. Component and feature tests. Commit - `feat(web): /admin/tournaments (#30)`

### Task 16: Rounds page

`/admin/events` (the admin's tournament's rounds; the insert row; delete), `POST /admin/events/save`, `POST /admin/eventInsert`; rate prefilled by `stageRate`. Commit - `feat(web): /admin/events (#30)`

### Task 17: Games page

`/admin/games` (table, modal, the UTC preview under the time box, "Ištrinti žaidimą" only where `gameDeletion` allows), `POST /admin/insertGame`, `/admin/updateGame`, `/admin/deleteGame` (asks the confirmation; registers `delete-game` in `actions.ts`). `pointsChanged()` after each write. Commit - `feat(web): /admin/games with Vilnius time and the confirmed delete (#30)`

### Task 18: Teams pages

`/admin/teams` (results manager: the facts form and the final mark; superadmin: also rename and unmark), `/admin/teaminsert` (the insert view; also shown by `/admin/teams` with no team), `POST /admin/teams/save`, `/admin/teaminsert/save`, `/admin/updateTeamDetails`. Commit - `feat(web): /admin/teams - the standings facts, details and placeholders (#30)`

### Task 19: Admin index and shell

The index's tiles "Turnyrai", "Turai", "Žaidimai", "Komandos", each shown by its permission; component tests. Commit - `feat(web): admin tiles for the structure pages (#30)`

### Task 20: E2E

The spec's journey at 390 and 1280, the code read from Mailpit. Commit - `test(e2e): run a tournament from the admin (#30)`

### Task 21: Docs

- [ ] **CLAUDE.md:** after the result paragraph, the admin write paths (each writer, its lock and recalculation, `seedBlankRows` as the only blank-row seeder with `saveResult`'s fill-ins), and the confirmation (`ConfirmableAction`, `__Host-sb_confirm` in the cookie list, `admin_action` as a code purpose, the shared code check now three flows). The lock-order paragraph: an admin delete or change takes the game row `FOR UPDATE`.
- [ ] **The spec:** the six planning decisions under "Lead decisions", and the owner's answers.
- [ ] Commit - `docs: slice 13 - admin write paths and the emailed confirmation in CLAUDE.md (#30)`

### Finish

- [ ] `pnpm lint && pnpm typecheck && pnpm test:unit && pnpm test:db && pnpm test:component && pnpm test:feature` - all green.
- [ ] `mp-code-review` from 3f3eb0b; `improve-codebase-architecture` on the new files (a new feature landed).
- [ ] Push; CI deploys staging; the owner checks the done-means; close #30.
