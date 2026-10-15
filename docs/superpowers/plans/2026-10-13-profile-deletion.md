# Slice 17: the profile, notifications and account deletion - Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking. In this repo the team runs it (`docs/agent-team.md`): backend-dev takes tasks 1-7, web-dev 8-13, qa and architect review each, only the lead commits. **Tasks marked [SR] also go to the security reviewer before their commit** (`CLAUDE.md` team table: slice 17 is security-sensitive).

**Goal:** `/userProfile` - the account form with the confirmed address change (R-24), `/profile/notifications`, the theme - and self-service deletion (`/profile/deletion-code`, `DELETE /profile`) that erases the account's trail, hands its leagues on (R-25) and changes nobody else's points (R-99) (#34).

**Architecture:** The domain checks the form field by field (`profileFormEntry`), decides what an address edit means (`emailChangeIntent`), picks a league's heir (`leagueHeir`) and holds the throttles. `packages/db` writes names through `updateProfileNames`, the address only through `requestEmailChange` / `confirmEmailChange` / `cancelEmailChange`, and deletes an account only through `deleteAccount`: one transaction under the tournament locks, then the player row, then the lock order's rows. `apps/web` has one page and route handlers answering 303 with a sealed flash; the codes go through `issueLoginCode` and the shared `checkCode`.

**Tech Stack:** TypeScript, Zod, Drizzle on Postgres 18, Next.js App Router, React, Vitest (unit, db, component, feature), Playwright, Mailpit.

**Spec:** `docs/superpowers/specs/2026-10-13-profile-deletion-design.md`. Rulings R-24, R-25, R-69, R-99, R-112 (an empty league is deleted, its messages detached), R-113 (full members inherit before guests), R-114 (the reader reads `users.created_at`); the lead's decisions on stored odds under R-99 and the two new texts are in the spec.

**Depends on:** slice 12 (league tables, `joined_at`), slice 16 (`receive_reminders`, `setReceiveReminders`, the unsubscribe pages). Start after both are on `main`.

## Decisions taken while planning (record them in the spec in Task 13)

1. **One flash per outcome, errors included.** Laravel's three error bags become one flash kind `profile-refused` with a `bag`; no new cookie. The shell's alert ignores it; the page renders it in place.
2. **The deletion's lock order is spelled out once** in `deleteAccount`'s doc comment and in `CLAUDE.md`; the db test that proves "no deadlock" runs a deletion against a concurrent prediction save and a concurrent recalculation.
3. **The "every table" guard.** `packages/db/test/account-deletion.test.ts` reads `information_schema` for every FK to `players` and fails on one `deleteAccount` does not handle (deleted, cascaded or set null on purpose), so a later table cannot strand an account.
4. **The staging seed gains a second player in a private league** owned by the owner's test account, so the hand-over is visible on staging.

## File structure

| File | Responsibility |
| --- | --- |
| `packages/domain/src/account/profile-form.ts` (create) | `profileFormEntry` |
| `packages/domain/src/account/email-change.ts` (create) | `emailChangeIntent`, `EmailChangeRefusal` |
| `packages/domain/src/account/profile-throttle.ts` (create) | four limit functions |
| `packages/domain/src/league/league-heir.ts` (create) | `leagueHeir` |
| `packages/domain/src/rules/input-reads.ts`, `recalculation/recalculation.ts` (modify) | R-99: stored odds kept under ruled |
| `packages/domain/src/index.ts` (modify) | exports |
| `packages/db/src/player/schema.ts` (modify), migration (generate) | `pending_email`, `created_at` (R-114) |
| `packages/db/src/account/profile.ts` (create) | `loadProfile`, `updateProfileNames` |
| `packages/db/src/account/email-change.ts` (create) | the three address writers |
| `packages/db/src/account/deletion.ts` (create) | `deleteAccount` |
| `packages/db/test/profile.test.ts`, `email-change.test.ts`, `account-deletion.test.ts` (create) | db tests |
| `packages/db/src/seed/staging.ts`, `test/seed.test.ts` (modify) | the hand-over league |
| `tools/migrate/src/...` (modify) | `users.created_at` read (R-114) |
| `apps/web/src/server/flash.ts` (modify) | new kinds |
| `apps/web/src/server/mail/{deletion-code,email-change-code,email-changed-notice}-mail.ts` (create) | mails |
| `apps/web/src/server/profile/*.ts` (create) | use cases, texts |
| `apps/web/src/app/userProfile/page.tsx`, `save/route.ts`; `app/profile/**/route.ts`; `app/userSettings/route.ts` (create) | page, handlers, aliases |
| `apps/web/src/components/profile/*.tsx` (create) | the view |
| `apps/web/src/components/shell/shell-paths.ts`, `server/sign-in/guarded-pages.ts` (modify) | link, guarded page |
| `apps/web/tests/feature/profile.test.ts` (create) | routes and page |
| `apps/web/e2e/profile.spec.ts` (create) | the journey |
| `CLAUDE.md`, the spec (modify) | write paths, lock order |

Run commands from the repo root. Domain tests: `pnpm --filter @sportbet/domain test -- <file>`; db: `pnpm --filter @sportbet/db test -- <file>` (needs Docker); component: `pnpm --filter @sportbet/web test:component -- <file>`; feature: `pnpm --filter @sportbet/web test:feature -- <file>`; e2e: `pnpm test:e2e`.

---

### Task 1: `profileFormEntry`

**Files:** Create `packages/domain/src/account/profile-form.ts`, `.test.ts`

```ts
/**
 * UserProfileController::updateUserProfile's rules, field by field as
 * Laravel reports every field: username, name, surname required (trimmed),
 * each at most 255 (mb_strlen); email required, an address, at most 255,
 * then normalized (normalizeEmail, #42). Uniqueness is the database's.
 */
export function profileFormEntry(
  posted: Readonly<Record<'username' | 'name' | 'surname' | 'email', unknown>>,
): Result<ProfileEntry, ProfileProblems>;
```

- [ ] Tests first: each field's `required`, `blank` (only Laravel-trimmed characters), `too-long` at 256 and not at 255 (an astral character counts as one), `not-an-email`; several fields refused at once; `User@X.com ` normalized. Reuse `usernameInvariant`, `personNameInvariant`, the registration form's address check. Run, FAIL; implement; PASS.
- [ ] Commit - `feat(domain): profileFormEntry - the profile form checked field by field (#34)`

### Task 2: `emailChangeIntent`, `leagueHeir`, the throttles

**Files:** Create `email-change.ts`, `profile-throttle.ts` (account), `league/league-heir.ts`, with tests

- `emailChangeIntent(current, pending, requested)`: equal to `current` and a pending one -> `'cancel-pending'`; equal and none -> `'unchanged'`; else `{ change: requested }` (also when equal to `pending`: a re-request mails a fresh code, as sportbet).
- `leagueHeir(members, leaving)`: the member other than `leaving` with the earliest `joinedAt`, then the lowest member id, full members before guests (R-113); `null` when none is left (R-112: the caller deletes the league).
- Throttles, each `readonly ThrottleLimit[]`, IP first where there is one: `deletionCodeRequestLimits` (10 IP, 3 account, 10 min), `deletionVerifyLimits` (15, 5), `emailChangeRequestLimits` (3 account), `emailChangeVerifyLimits` (15, 5). Keys prefixed as AppServiceProvider's names.
- [ ] Tests first for each; FAIL; implement; PASS.
- [ ] Commit - `feat(domain): emailChangeIntent, leagueHeir and the profile throttles (#34)` **[SR]** (throttles)

### Task 3: R-99 - a scored game keeps its stored odds

**Moved into slice 14 (#31), done there (2026-10-15):** R-99 now holds, via the slice 14 review fixes. `inputReadsOf(ruledRules)` is `'stored-else-votes'`, the db reads the rule set's own `game_odds` rows (`loadInputsUnderRuleSet`) and `recalculateUnderRuleSet` saves them back as read; `saveResult` forgets its own game's row first, so a result entry still scores from the votes as they stand. Tests: `recalculation.test.ts` (domain and db), `account-deletion.test.ts`. Skip this task; slice 17 only uses it.

backend-dev. Decided by the lead (2026-10-13), following from R-99: the ruled set keeps a scored game's stored `game_odds` and computes odds only for a game without a row. No `RuleSet` field: `inputReadsOf` derives what a set reads, as today, and `sportbetRules` already reads `'stored'`.

**Files:** Modify `packages/domain/src/rules/input-reads.ts`, `input-reads.test.ts`, `recalculation/recalculation.ts`, `recalculation.test.ts`; `packages/db/src/recalculation/repository.ts`, `packages/db/test/recalculation.test.ts`

- [ ] Tests first, each a `for (const [set, rules] of bothSets)` test (the `sportbetRules` and `ruledRules` pair the domain tests already use):
  - `inputReadsOf`: `'stored-else-votes'` under ruled, `'stored'` under sportbet;
  - `recalculateTournament`: a tournament scored, one player's real votes removed, recalculated with the stored rows as inputs - every remaining player's `MatchRow` and every `GameOdds` unchanged;
  - a game first scored after the removal takes its odds from the remaining votes (under ruled; under sportbet, a game with no stored row is CO-5's missing row, as today);
  - a game postponed after scoring (its row gone) and scored again is computed afresh;
  - db: `recalculateUnderRuleSet` after a player's predictions are deleted leaves every other player's rows and the `game_odds` rows of that source byte for byte.
  The golden scenario still reproduces under both sets.
- [ ] Implement: `InputReads.odds` gains `'stored-else-votes'`; `inputReadsOf(ruledRules)` returns it; `crowdFor` uses the stored row when present, `CrowdOdds.forGame` otherwise; the db reads the source's rows for it.
- [ ] `pnpm --filter @sportbet/domain test && pnpm --filter @sportbet/db test -- recalculation` and the parity run: PASS, no stored point moves.
- [ ] Commit - `feat(domain): R-99 - under ruledRules a scored game keeps the odds it was scored with (#34)`

### Task 4: Schema and the profile reads

**Files:** Modify `packages/db/src/player/schema.ts`; generate `pnpm --filter @sportbet/db db:generate --name profile_pending_email`; create `packages/db/src/account/profile.ts`, `test/profile.test.ts`

- [ ] `players.pending_email text` nullable, CHECK `players_pending_email_format` from `emailInvariant` in `playerInvariantChecks` (proved by `invariant-checks.test.ts`). R-114: `players.created_at timestamptz not null default now()` and the reader maps `users.created_at` (READ_COLUMNS, its comment, `CLAUDE.md`'s reader rule).
- [ ] `loadProfile(db, player)` parsed with the domain schema; `updateProfileNames(db, { player, username, name, surname })`: refuses `username-taken` when `isUsernameTaken` over the other accounts says so, or on `players_username_unique`.
- [ ] Tests first: reads; rename; taken by `Šarūnas`/`sarunas` and by case, not by oneself. FAIL; implement; PASS.
- [ ] Commit - `feat(db): players.pending_email; loadProfile and updateProfileNames (#34)`

### Task 5: The address change **[SR]**

**Files:** Create `packages/db/src/account/email-change.ts`, `test/email-change.test.ts`

```ts
/** ProfileService::requestEmailChange's last step: parks the normalized address once its code is mailed. */
export async function requestEmailChange(db: Executor, at: { player: PlayerId; address: EmailAddress }): Promise<void>;
/** ProfileService::confirmEmailChange: after checkCode claimed the pending address's email_change code; the player row locked, pending unchanged, the address free (email_fold), then moved. */
export async function confirmEmailChange(db: Executor, at: { player: PlayerId; pending: EmailAddress }): Promise<Result<{ old: EmailAddress }, 'none' | 'taken'>>;
export async function cancelEmailChange(db: Executor, player: PlayerId): Promise<void>;
```

- [ ] Tests first: confirm moves and clears; `none` when nothing pends or the pending address changed since; `taken` by another account's other spelling (fold) and by the unique index under a race; sign-in by the old address finds nothing afterwards and by the new one finds the account (`findAccountByEmail`, exact); cancel. FAIL; implement; PASS.
- [ ] Commit - `feat(db): the address change - parked, confirmed under the player row lock, cancelled (#34, R-24)`

### Task 6: `deleteAccount` **[SR]**

**Files:** Create `packages/db/src/account/deletion.ts`, `test/account-deletion.test.ts`

The transaction of the spec's "deleteAccount" decision, steps 1-6, with the lock order in its doc comment. Returns `{ tournaments: TournamentId[]; handedOver: { league; heir }[] }` for the caller's `pointsChanged()` and the log (ids only).

- [ ] Tests first:
  - every table: the FK guard (planning decision 3);
  - a player with predictions, standings and survival picks, points rows of `production`, `sportbet` and `ruled`, an `audit_prediction_games` row, sessions, an `audit_logins` row, login codes for the address and the pending address: all gone; another player's rows and every `game_odds` row byte for byte unchanged; a results manager's `audit_results` kept with `player_id` null;
  - the hand-over: the oldest other member becomes owner and admin; the id breaks a `joined_at` tie; a full member inherits before an older guest, a guest when no full member is left (R-113); a league with no other member is deleted with its invites and its messages kept, detached (R-112);
  - `createAccount` with the same address (another spelling too) succeeds straight after;
  - a deletion waits for a held tournament lock; a recalculation started after it waits and then lists no row for the player;
  - a prediction save by the player racing the deletion either commits first (its row then goes) or fails; neither deadlocks (both orders, 20 runs);
  - a refused step rolls everything back (a thrown error mid-way leaves the account whole).
  FAIL; implement; PASS.
- [ ] Commit - `feat(db): deleteAccount - the one deleter, under the tournament locks, leagues handed on, no recalculation (#34, R-25, R-99)`

### Task 7: The staging seed

- [ ] Add a private league owned by the owner's test account with one other member (planning decision 4); `seed.test.ts`, the hub counts and `e2e` fixtures follow.
- [ ] Commit - `chore(db): the staging seed has a league to hand over (#34)`

### Task 8: Flash kinds, texts and mails **[SR]** (mails)

**Files:** Modify `server/flash.ts` (+ test); create `server/profile/texts.ts`, the three mails (+ tests)

- [ ] Flash kinds of the spec; `profile-refused`'s `errors` keys limited to the bag's fields, `values` only for `account`; anything else opens as nothing.
- [ ] Texts: every sportbet string in the spec, registration's reused, and the two new ones ("Įveskite pavardę.", "Šis vartotojo vardas jau užimtas.").
- [ ] Mails: sportbet's subjects and lines, the TTL minutes, sent through the transport for `SPORTBET_ENV`; tests that the body holds the code once and the notice holds none and no link.
- [ ] Commit - `feat(web): profile flash kinds, texts and the three mails (#34)`

### Task 9: The use cases and handlers **[SR]**

**Files:** Create `server/profile/{update-profile,email-change,delete-account}.ts`; the route handlers of the spec's URLs

- [ ] Each handler: same-origin (403), signed-in (guest 303 `/`), throttle (429 through `laravel-answers.ts`, the email-change request's in the form), then the use case, then 303 with the flash. `/profile` POST requires `_method=DELETE`; GET 308; `/userSettings` 308; `/userProfile/save`.
- [ ] `delete-account.ts`: throttle, `checkCode` (purpose `account_deletion`, the session's account address), `deleteAccount`, `pointsChanged()`, `endSession`, 303 `/`. The code is read only from the body, trimmed.
- [ ] `email-change.ts`: request (mailer allowed? issue, mail, park), confirm (`checkCode` purpose `email_change` on the pending address, `confirmEmailChange`, the notice), cancel.
- [ ] Feature tests (`tests/feature/profile.test.ts`) first: every answer of the spec's Testing list; deletion leaves the old session cookie refused and the cookie cleared with its flags and Max-Age 0; the deleted address signs in as unknown and registers at once.
- [ ] Commit - `feat(web): the profile's route handlers - form, address change, notifications, deletion (#34)`

### Task 10: The page

**Files:** Create `app/userProfile/page.tsx`, `components/profile/*.tsx` (+ component tests); modify `shell-paths.ts` (`SHELL_LINKS.profile = PROFILE_PATH`), `guarded-pages.ts` (`profile`)

- [ ] Component tests first: header (initials, badge for a non-player role, "Narys nuo" from `created_at`, R-114), the form with each bag in its place and typed values kept, the pending box, the sign-in card without Google, notifications, theme (writes `sb-theme`, sets `data-theme`), the danger zone closed, open after `deletion-code-sent` or a `userDeletion` error.
- [ ] Implement; tokens only (`token-guard.test.ts`).
- [ ] Commit - `feat(web): /userProfile (#34)`

### Task 11: E2E

- [ ] `e2e/profile.spec.ts` at 390 and 1280: rename; change the address with the Mailpit code; reminders on/off; theme; deletion with the Mailpit code lands signed out on `/`.
- [ ] Commit - `test(e2e): the profile journey (#34)`

### Task 12: Security review **[SR]**

- [ ] The security reviewer reads Tasks 2, 5, 6, 8, 9 together against sportbet's Security section and `CLAUDE.md`'s identity, cookie and session rules: no address lookup but exact equality, no code or address in a log, every code through `checkCode`, the deletion complete and atomic, sessions ended, throttles as sportbet. Findings fixed before Task 13.

### Task 13: Docs

- [ ] **CLAUDE.md:** a paragraph after the joining one:

```markdown
- An account's names change through `updateProfileNames`; its address only
  through `requestEmailChange` (parked in `pending_email` once the code is
  mailed to the new address), `confirmEmailChange` (after `checkCode`,
  purpose `email_change`, under the player row lock; the old address then
  gets a notice) and `cancelEmailChange` (`packages/db/src/account/email-change.ts`,
  R-24). An account is deleted only by `deleteAccount`
  (`packages/db/src/account/deletion.ts`), for the profile and the admin
  alike: one transaction that erases its trail and its points of every
  source, hands each private league it owned to `leagueHeir` (R-25),
  recalculates nothing (R-99), and is followed by `pointsChanged()` and
  `endSession`. The deletion code is checked only through `checkCode`
  (purpose `account_deletion`).
```

  The code-check sentence names all four purposes; the lock-order paragraph gains the deletion's order; the cookie list is unchanged.
- [ ] **The spec:** the four planning decisions and R-112 to R-114 and the lead's R-99 odds decision where the spec cites them.
- [ ] Commit - `docs: slice 17 - the profile and deletion write paths in CLAUDE.md; the plan's decisions in the spec (#34)`

---

### Finish

- [ ] `pnpm lint && pnpm typecheck && pnpm test:unit && pnpm test:db && pnpm test:component && pnpm test:feature` - all green.
- [ ] Parity run (`tools/migrate --parity`) still holds (Task 3 must move no stored point).
- [ ] `mp-code-review` from the slice's base; `improve-codebase-architecture` on the new files.
- [ ] Push; CI deploys staging; the owner checks the done-means; close #34.
