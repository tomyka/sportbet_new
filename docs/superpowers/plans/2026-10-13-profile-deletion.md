# Slice 17: the profile, notifications and account deletion - Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking. In this repo the team runs it (`docs/agent-team.md`): backend-dev takes tasks 1-7 (3 is dropped, 6 is shrunk), web-dev 8-13, qa and architect review each, only the lead commits. **Tasks marked [SR] also go to the security reviewer before their commit** (`CLAUDE.md` team table: slice 17 is security-sensitive).

**Goal:** `/userProfile` - the account form with the confirmed address change (R-24), `/profile/notifications`, the theme - and self-service deletion (`/profile/deletion-code`, `DELETE /profile`) that erases the account's trail, hands its leagues on (R-25) and changes nobody else's points (R-99) (#34).

**Architecture:** The domain checks the form field by field (`profileFormEntry`), decides what an address edit means (`emailChangeIntent`), picks a league's heir (`leagueHeir`) and holds the throttles. `packages/db` writes names through `updateProfileNames`, the address only through `requestEmailChange` / `confirmEmailChange` / `cancelEmailChange`, and deletes an account only through `deleteAccount`, which slice 14 built (`packages/db/src/account/deletion.ts`, `by: 'self'` is already its slice-17 entry): slice 17 calls it and adds only what its own new column needs. `apps/web` has one page and route handlers answering 303 with a sealed flash; the codes go through `issueLoginCode` and the shared `checkCode`. The league heir (R-113) is slice 14's `leagueHandOvers` (`packages/domain/src/account/account-deletion.ts`); there is no `leagueHeir`.

**Tech Stack:** TypeScript, Zod, Drizzle on Postgres 18, Next.js App Router, React, Vitest (unit, db, component, feature), Playwright, Mailpit.

**Spec:** `docs/superpowers/specs/2026-10-13-profile-deletion-design.md`. Rulings R-24, R-25, R-69, R-99, R-112 (an empty league is deleted, its messages detached), R-113 (full members inherit before guests), R-114 (the reader reads `users.created_at`); the lead's decisions on stored odds under R-99 and the two new texts are in the spec.

**Depends on:** slice 12 (league tables, `joined_at`), slice 16 (`receive_reminders`, `setReceiveReminders`, the unsubscribe pages). Start after both are on `main`.

## Decisions taken while planning (record them in the spec in Task 13)

1. **One flash per outcome, errors included.** Laravel's three error bags become one flash kind `profile-refused` with a `bag`; no new cookie. The shell's alert ignores it; the page renders it in place.
2. **`deleteAccount` is slice 14's and already done** (the lock order is in its doc comment and in `CLAUDE.md`: every superadmin's `player_settings` row, every tournament's recalculation lock in id order, the player's `match_predictions`, the leagues, `lockPlayerStatuses`; it does NOT lock the `players` row first). Slice 17 changes it in one place only: the login codes it removes also cover `pending_email` (exact equality, #41), and `'self'` records nothing in the admin trail pending the owner's answer to open question 1.
3. **The "every table" guard exists:** `packages/db/test/player-fk-coverage.test.ts` reads `information_schema` and `PLAYER_ROWS_DELETED`. `pending_email` is a column, not a key, so it adds nothing to it; slice 17 only keeps it green.
4. **The staging seed gains a second player in a private league** owned by the owner's test account, so the hand-over is visible on staging.

## File structure

| File | Responsibility |
| --- | --- |
| `packages/domain/src/account/profile-form.ts` (create) | `profileFormEntry` |
| `packages/domain/src/account/email-change.ts` (create) | `emailChangeIntent`, `EmailChangeRefusal` |
| `packages/domain/src/account/profile-throttle.ts` (create) | four limit functions |
| `packages/domain/src/index.ts` (modify) | exports |
| `packages/db/src/player/players.ts` (modify), migration (generate) | `pending_email`, `created_at` (R-114) |
| `packages/db/src/account/profile.ts` (create) | `loadProfile`, `updateProfileNames` |
| `packages/db/src/account/email-change.ts` (create) | the three address writers |
| `packages/db/src/account/deletion.ts` (modify) | also delete the codes of `pending_email` |
| `packages/db/test/profile.test.ts`, `email-change.test.ts` (create); `account-deletion.test.ts` (modify) | db tests |
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

### Task 2: `emailChangeIntent` and the throttles

**Files:** Create `email-change.ts`, `profile-throttle.ts` (account), with tests

- `emailChangeIntent(current, pending, requested)`: equal to `current` and a pending one -> `'cancel-pending'`; equal and none -> `'unchanged'`; else `{ change: requested }` (also when equal to `pending`: a re-request mails a fresh code, as sportbet).
- Throttles, each `readonly ThrottleLimit[]`, IP first where there is one: `deletionCodeRequestLimits` (10 IP, 3 account, 10 min), `deletionVerifyLimits` (15, 5), `emailChangeRequestLimits` (3 account), `emailChangeVerifyLimits` (15, 5). Keys prefixed as AppServiceProvider's names.
- [ ] Tests first for each; FAIL; implement; PASS.
- [ ] Commit - `feat(domain): emailChangeIntent and the profile throttles (#34)` **[SR]** (throttles)

### Task 3: R-99 - dropped, done in slice 14 (#31, 2026-10-15)

Nothing to do. `inputReadsOf(ruledRules)` is `'stored-else-votes'`, the db reads the rule set's own `game_odds` rows (`loadInputsUnderRuleSet`), `recalculateUnderRuleSet` saves them back as read, and `saveResult` forgets its own game's row first. Tests: `recalculation.test.ts` (domain and db) and `account-deletion.test.ts`. The task numbers below are kept so references to them stay valid.

### Task 4: Schema and the profile reads

**Files:** Modify `packages/db/src/player/players.ts`; generate `pnpm --filter @sportbet/db db:generate --name profile_pending_email`; create `packages/db/src/account/profile.ts`, `test/profile.test.ts`

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

### Task 6: `deleteAccount` for `by: 'self'` **[SR]** (shrunk)

**Files:** Modify `packages/db/src/account/deletion.ts`, `test/account-deletion.test.ts`

`deleteAccount` exists (slice 14): the lock order (every superadmin's `player_settings` row `FOR UPDATE` first through `lockSuperadmins`, the domain's `accountDeletion`, every tournament's recalculation lock in id order, the player's `match_predictions`, the leagues, `lockPlayerStatuses`), the rows in `PLAYER_ROWS_DELETED` order, the hand-over through `leagueHandOvers` (R-25, R-112, R-113: longest-standing full member, ties by the `league_members` row id, a guest only when no full member is left), the address's login codes, no recalculation (R-99). It never locks the `players` row first; do not add that. `accountDeletion` already lets `'self'` delete, and refuses a last superadmin (`last-superadmin`): the profile shows that refusal in the danger zone (text: see open question 2).

What this task adds, nothing else:
- [ ] The login codes of `players.pending_email` (once Task 4 adds the column) are deleted with the address's, by exact equality (#41). Read `pending_email` in the same statement as `email`.
- [ ] The result's `handedOver` (already returned) is what the use case logs by count only.
- [ ] Tests first, added to `account-deletion.test.ts`: a pending address's code is gone after the delete; a self-deletion by a player (a) with a private league and other members (heir rules already tested for the admin path: one self-path case only), (b) the last superadmin, refused with nothing written; `createAccount` with the same address succeeds straight after; the existing race and rollback tests are not repeated. FAIL; implement; PASS.
- [ ] Commit - `feat(db): deleteAccount also removes the pending address's codes (#34, R-25)`

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
- [ ] `delete-account.ts`: throttle, `checkCode` (purpose `account_deletion`, the session's account address), `deleteAccount(db, { target, by: 'self', now })` (a refusal, e.g. `last-superadmin`, is shown in the danger zone; no recalculation), `pointsChanged()`, `endSession`, 303 `/`. The code is read only from the body, trimmed. The admin path (`server/admin/confirm/delete-user.ts`) already calls the same writer; leave it alone.
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
  R-24). The profile's deletion is `deleteAccount` with `by: 'self'`
  (already described in CLAUDE.md since slice 14), followed by
  `pointsChanged()` and `endSession`; its code is checked only through
  `checkCode` (purpose `account_deletion`). `players.pending_email` is
  written only by those three writers.
```

  The code-check sentence names all four purposes; the deletion's lock order is NOT repeated (slice 14's paragraph already holds it; only add that its login-code removal covers `pending_email`); the cookie list is unchanged.
- [ ] **The spec:** the planning decisions above and R-112 to R-114 where the spec cites them.
- [ ] Commit - `docs: slice 17 - the profile and deletion write paths in CLAUDE.md; the plan's decisions in the spec (#34)`

---

### Open questions for the owner (answer before Tasks 6 and 9)

1. **What does the audit trail (`audit_admin_actions`) record when a player deletes their own account?** R-117 covers only an admin's role changes and an admin's deletion of an account; `deleteAccount` records nothing for `'self'` today (`recordDeletion` runs only for an admin). sportbet records nothing for self-deletion either. Options: nothing (the plan assumes this until told otherwise: R-25 erases the account's trail), or a row with no actor and no target. Not decided here.
2. **Last superadmin deleting their own account:** the domain refuses it (`last-superadmin`). sportbet has no such guard on self-deletion. What text should the danger zone show? Lithuanian wording is the owner's.

### Finish

- [ ] `pnpm lint && pnpm typecheck && pnpm test:unit && pnpm test:db && pnpm test:component && pnpm test:feature` - all green.
- [ ] Parity run (`tools/migrate --parity`) still holds (nothing in this slice moves a stored point).
- [ ] `mp-code-review` from the slice's base; `improve-codebase-architecture` on the new files.
- [ ] Push; CI deploys staging; the owner checks the done-means; close #34.
