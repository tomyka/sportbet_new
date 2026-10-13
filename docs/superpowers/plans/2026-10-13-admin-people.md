# Slice 14: admin - users, leagues, messages, audit - Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking. In this repo the team runs it (`docs/agent-team.md`): backend-dev takes tasks 1-11, web-dev 12-18, qa and architect review each, **the security reviewer reviews tasks 2, 3, 7, 8, 9, 12, 13, 14 and 17** (marked SECURITY), only the lead commits.

**Goal:** `/admin/users`, `/admin/leagues`, `/admin/messages` and `/admin/audit` at sportbet's URLs, under R-19, R-25, R-26 amended, R-69, R-87, R-95, R-99 and R-105, plus the one account-deletion path slice 17 reuses (#31).

**Architecture:** The domain decides every write (`roleChange`, `accountDeletion` with `leagueHandOvers`, `adminHideChange`, `markGuest`, `messageFormEntry`) and the audit page's query. `packages/db` writes each through one function under the lock order: `deleteAccount` (the player's tournament locks in id order, predictions, statuses, owned leagues; no recalculation, R-99), `changeRole` (every superadmin row `FOR UPDATE`, the actor re-read), `setAdminHidden`, `setLeagueGuest`, the message writers. `apps/web` has pages that load and route handlers that answer a 303 with a flash; deleting an account, changing a role and deleting a message pass through slice 13's emailed confirmation.

**Tech Stack:** TypeScript, Zod, Drizzle on Postgres 18, Next.js App Router, React, Vitest (unit, db, component, feature), Playwright, Mailpit.

**Spec:** `docs/superpowers/specs/2026-10-13-admin-people-design.md`. Rulings R-19, R-25, R-26 amended, R-39, R-45, R-69, R-87, R-95, R-99, R-105, R-112, R-113, R-115 to R-118 (the owner's answers to the spec's questions, 2026-10-13). **Blocked on:** slice 12 (league tables, `loadRoster`, the league writers) and slice 13 (`isSuperadmin`, `admin_tournament_id`, `server/admin/confirm/`, `adminWriteLimits`) on `main`.

## Decisions taken while planning (refine the spec; record them in it in Task 19)

1. **`deleteAccount` lists its explicit deletes once** (`PLAYER_ROWS_DELETED`), and `player-fk-coverage.test.ts` reads `information_schema` so a future FK to `players` that is `restrict` and not in the list fails CI - sportbet issue 266's drift, closed structurally.
2. **The last-superadmin guard is under a lock, not a count.** `changeRole` and `deleteAccount` lock every superadmin's `player_settings` row `FOR UPDATE` in player id order before counting, and both take those locks before any other row, so two superadmins acting on each other serialise.
3. **The confirm page describes the action from the database**, not from the cookie: a target renamed or deleted since the ask shows the current name, or "Paskyra nebeegzistuoja." and no button.
4. **A hide toggle is a form post** (303), not sportbet's JSON fetch: one answer shape for every admin write, and no client script.
5. **The audit's user select lists every account's username** (sportbet's), read through one query; a forgotten actor reads "-".

## File structure

| File | Responsibility |
| --- | --- |
| `packages/domain/src/account/role-change.ts` (create) | `roleChange`, `roleChangeEntry` |
| `packages/domain/src/account/account-deletion.ts` (create) | `accountDeletion`, `leagueHandOvers` |
| `packages/domain/src/account/admin-hide.ts` (create) | `adminHideChange` |
| `packages/domain/src/league/guest-mark.ts` (create) | `markGuest` |
| `packages/domain/src/message/message-form.ts` (create) | `messageFormEntry`, `messageTextInvariant`, `messageLeagueAllowed` |
| `packages/domain/src/admin/confirmable-action.ts` (modify) | `delete-user`, `change-role`, `delete-league-message`, `delete-league` |
| `packages/domain/src/admin/audit-page.ts` (create) | `AUDIT_TABS`, `auditPageQuery`, row schemas |
| `packages/domain/src/index.ts` (modify) | exports |
| `packages/db/src/account/schema.ts`, `migrations/*` (modify, generate) | `audit_admin_actions` |
| `packages/db/src/account/deletion.ts` (create) | `deleteAccount` |
| `packages/db/src/account/role.ts` (create) | `changeRole` |
| `packages/db/src/player/admin-hide.ts` (create) | `setAdminHidden` |
| `packages/db/src/league/admin.ts` (create) | superadmin edit, delete, guest mark, loaders |
| `packages/db/src/message/admin.ts` (create) | message writers and loader |
| `packages/db/src/admin/users.ts`, `audit.ts` (create) | `loadAdminUsers`, `loadAuditPage` |
| `packages/db/src/recalculation/lock.ts` (modify) | comment: several tournament locks in id order; superadmin rows first |
| `packages/db/test/account-deletion.test.ts`, `role-change.test.ts`, `player-fk-coverage.test.ts`, `admin-leagues.test.ts`, `admin-messages.test.ts`, `admin-audit.test.ts` (create) | db tests |
| `apps/web/src/server/admin/{users,leagues,messages,audit}.ts`, `texts.ts` (create, modify) | use cases, Lithuanian refusals |
| `apps/web/src/server/admin/confirm/actions.ts` (modify) | the new kinds |
| `apps/web/src/app/admin/{users,leagues,messages,audit,updateUser,deleteUser,toggleHidden,messageInsert}/**` (create) | pages and route handlers |
| `apps/web/src/components/admin/*.tsx` (create, modify) | views; index tiles |
| `apps/web/tests/feature/admin-people.test.ts` (create) | routes and pages |
| `apps/web/e2e/admin.spec.ts` (modify) | the journey |
| `CLAUDE.md`, the spec (modify) | write paths |

Run commands from the repo root. Domain tests: `pnpm --filter @sportbet/domain test -- <file>`; db: `pnpm --filter @sportbet/db test -- <file>` (needs Docker); component: `pnpm --filter @sportbet/web test:component -- <file>`; feature: `pnpm --filter @sportbet/web test:feature -- <file>`; e2e: `pnpm test:e2e`.

---

### Task 1: Messages form and the guest mark (domain)

**Files:** Create `message/message-form.ts`, `league/guest-mark.ts` and tests.

- [ ] Tests first: `messageFormEntry` refuses an empty text, 256 characters, a league of another tournament (R-95, `league-not-allowed`), a non-integer league; blank league is null; `active` is `on` or absent (sportbet). All errors listed, in sportbet's field order. `markGuest`: `not-member`, `unchanged`, both directions. `mayEditMessages` (`account/role.ts`) holds for a results manager and a superadmin, not a player (R-116).
- [ ] Implement; `messageTextInvariant` as a `defineInvariant` (max 255) beside slice 12's message CHECK, which moves onto it.
- [ ] `pnpm --filter @sportbet/domain test && pnpm typecheck`.
- [ ] Commit - `feat(domain): the admin message form (R-95) and the league guest mark (R-87) (#31)`

### Task 2: Role change (domain) - SECURITY

**Files:** Create `account/role-change.ts`, `.test.ts`.

- [ ] Tests first: `roleChange` refuses `actor-not-superadmin` (a results manager, a player), `own-role`, `same-role`, `last-superadmin` (demoting the only superadmin, possible only as `own-role` today, tested through the pure rule with `superadmins: [target]`); accepts each of the six transitions. `roleChangeEntry` refuses a role outside `ROLES`, an array `userID`, a non-integer.
- [ ] Implement. Refusal order: actor, own, unknown role, same, last.
- [ ] Commit - `feat(domain): roleChange - only a superadmin, never your own, never the last superadmin (R-26) (#31)`

### Task 3: Account deletion and the hand-over (domain) - SECURITY

**Files:** Create `account/account-deletion.ts`, `account/admin-hide.ts` and tests.

- [ ] Tests first: `accountDeletion` with an admin actor refuses `own-account`; under `'self'` the last superadmin is refused `last-superadmin`; a superadmin deleting another superadmin passes. `leagueHandOvers`: the longest-standing other member by `joined_at`, a tie by player id, full members before guests - a guest inherits only when no full member is left (R-113) - and no other member -> `deleteEmpty` (R-112). `adminHideChange` sets `adminHidden` and leaves `switchedOff` (R-19, R-39).
- [ ] Implement.
- [ ] Commit - `feat(domain): accountDeletion and leagueHandOvers (R-25), adminHideChange (R-19) (#31)`

### Task 4: Confirmable kinds and the audit query (domain)

**Files:** Modify `admin/confirmable-action.ts`; create `admin/audit-page.ts` and tests.

- [ ] Tests first: the schema accepts `{ kind: 'delete-user', player }`, `{ kind: 'change-role', player, role }`, `{ kind: 'delete-league-message', message }`, `{ kind: 'delete-league', league }` and refuses a mix (`change-role` without a role, extra keys). `auditPageQuery`: unknown tab -> `prisijungimai`, page below 1 or not a number -> 1, `user` through `idFromText` (array refused -> no filter).
- [ ] Implement.
- [ ] Commit - `feat(domain): the slice 14 confirmable actions and the audit page query (#31)`

### Task 5: Migration

**Files:** Modify `packages/db/src/account/schema.ts`; generate `--name audit_admin_actions`.

- [ ] Table per the spec (R-117); `kind` an enum built from the domain's list; both player FKs `set null`.
- [ ] `pnpm --filter @sportbet/db test -- invariant-checks` passes; review the SQL.
- [ ] Commit - `feat(db): audit_admin_actions - role changes and account deletions, kept past either account (#31)`

### Task 6: FK coverage

**Files:** Create `packages/db/test/player-fk-coverage.test.ts`.

- [ ] Read every FK whose referenced table is `players` from `information_schema.referential_constraints`; each must be `CASCADE`, `SET NULL`, or its table named in `PLAYER_ROWS_DELETED` (exported by Task 7's module; until then the test lists today's `restrict` tables and fails on any other).
- [ ] Commit with Task 7.

### Task 7: `deleteAccount` - SECURITY

**Files:** Create `packages/db/src/account/deletion.ts`, `test/account-deletion.test.ts`; modify `recalculation/lock.ts` (comment), `index.ts`.

- [ ] Tests first, on a seeded tournament with three players, a private league owned by the target, a result saved by the target as results manager:
  - every row of the target is gone (predictions, picks, standings predictions, all three sources' points rows, `tournament_players`, memberships, settings, `audit_logins`, `audit_prediction_games`, sessions, the address's codes);
  - `audit_results` keeps the row with `player_id` null (R-69); `audit_admin_actions` keeps rows with the party null;
  - every other player's stored points rows and every `game_odds` row are unchanged byte for byte (R-99);
  - the league passes to the longest-standing full member, who is `is_admin`, and to a guest only when no full member is left (R-113); an owner-only league is deleted with its invites and its messages detached (R-112);
  - a code of another address that folds to the same key is not deleted (#41);
  - the admin path refuses yourself and writes nothing; the self path refuses the last superadmin;
  - a `saveResult` started meanwhile waits on the tournament lock and then scores without the deleted player.
- [ ] Implement: superadmin rows `FOR UPDATE` (if the target or actor is one), the player's tournament locks in id order, decide, delete in `PLAYER_ROWS_DELETED` order, hand-overs, the admin row, commit. No recalculation.
- [ ] `pnpm --filter @sportbet/db test -- account-deletion player-fk-coverage`.
- [ ] Commit - `feat(db): deleteAccount - one deletion path, R-25 hand-over, R-99 no points change, FK coverage (#31)`

### Task 8: `changeRole` - SECURITY

**Files:** Create `packages/db/src/account/role.ts`, `test/role-change.test.ts`.

- [ ] Tests first: a change writes the role and one audit row in one transaction; each refusal writes nothing; two concurrent demotions between the only two superadmins leave exactly one (run on two connections); the actor demoted meanwhile is refused `actor-not-superadmin`.
- [ ] Implement.
- [ ] Commit - `feat(db): changeRole - the last superadmin guarded under a lock, recorded (R-26) (#31)`

### Task 9: Hide and guest writers - SECURITY

**Files:** Create `packages/db/src/player/admin-hide.ts`, `league/admin.ts` (writers part), tests.

- [ ] Tests first: `setAdminHidden` flips `admin_hidden` only in the admin's tournament, leaves `switched_off`, and the player leaves `loadRoster('whole-tournament')`; a player not in the tournament is `not-player`. `setLeagueGuest` narrows `loadRoster({ selectedBy })` for a full member and not for a guest; not a member -> refused. `updateLeagueAsSuperadmin` and `deleteLeagueAsSuperadmin` reuse slice 12's decisions (public delete refused; members moved; messages detached).
- [ ] Implement under the lock orders (statuses through `lockPlayerStatuses`; league row then members).
- [ ] Commit - `feat(db): admin hide (R-19) and the league guest mark (R-87), the superadmin's league edit and delete (#31)`

### Task 10: Message writers

**Files:** Create `packages/db/src/message/admin.ts`, `test/admin-messages.test.ts`.

- [ ] Tests first: insert, update and delete; a league of another tournament refused (R-95); `loadAdminMessages` lists the admin tournament's leagues' messages and the detached ones, nothing of another tournament; the select lists only this tournament's leagues.
- [ ] Commit - `feat(db): the admin's league messages (R-95) (#31)`

### Task 11: Page loaders

**Files:** Create `packages/db/src/admin/users.ts`, `audit.ts`, `league/admin.ts` (loaders), tests.

- [ ] `loadAdminUsers` (every account by id, role, the admin tournament's hide and switch-off or none); `loadAdminLeagues` (the admin tournament's, public first then newest, member counts, owner); `loadAdminLeagueMembers`; `loadAuditPage` (per tab 25 rows, counts, user filter, usernames; results rows with game and teams; forgotten actor null). Every row parsed with the domain schema.
- [ ] Commit - `feat(db): the admin people loaders and the audit page (#31)`

### Task 12: Confirmable kinds (web) - SECURITY

**Files:** Modify `apps/web/src/server/admin/confirm/actions.ts`, its test; `server/admin/texts.ts`.

- [ ] Tests first: each kind's permission is `isSuperadmin`; its description is read from the database on the confirm page; a target gone since the ask shows "Paskyra nebeegzistuoja." and performs nothing; a code issued for `delete-user` cannot perform a `change-role` cookie (the cookie names the action, the code only the account - one pending action per admin, slice 13's decision 5).
- [ ] Commit - `feat(web): delete-user, change-role, delete-league-message and delete-league confirm by emailed code (R-26) (#31)`

### Task 13: Users page - SECURITY

**Files:** `app/admin/users/page.tsx`, `app/admin/{updateUser,deleteUser,toggleHidden}/route.ts`, `server/admin/users.ts`, `components/admin/users-table.tsx` and tests.

- [ ] Feature tests first: guest, player, results manager go home; cross-site 403; `userID[]=1` refused with the 422 summary, never acting on player 1; own role and own account refused before any mail; a role change and a delete each 303 to `/admin/confirm` and mail a code; the hide toggles and flashes; unknown id 404.
- [ ] Component tests: the columns (no Auth column), the "neaktyvus" badge, no hide button for an account outside the admin's tournament, the role select's three Lithuanian options.
- [ ] Commit - `feat(web): /admin/users - roles and deletion by emailed code, admin hide (#31)`

### Task 14: Leagues pages - SECURITY

**Files:** `app/admin/leagues/page.tsx`, `[league]/members/page.tsx`, `[league]/payments/page.tsx`, the route handlers, `server/admin/leagues.ts`, components and tests.

- [ ] Feature tests first: gates; edit flashes "Lyga atnaujinta"; delete of a public league refused "Viešos lygos ištrinti negalima"; a private delete goes through the code (R-118); the guest switch flashes and narrows the dashboard for a full member; the payments door saves for the public league; a league of another tournament 404.
- [ ] Commit - `feat(web): /admin/leagues - edit, delete, members and guests (R-87), the payments door (#31)`

### Task 15: Messages page

**Files:** `app/admin/messages/page.tsx`, `app/admin/messages/save/route.ts`, `app/admin/messageInsert/route.ts`, components and tests.

- [ ] Feature tests: insert, update, the delete through the code (superadmin only; a results manager lists, inserts and updates, but sees no delete button and the post is refused, R-116), neither button -> "Nėra ką išsaugoti: formoje nenurodytas veiksmas.", a 256-character text refused; an active message appears on the league's dashboard.
- [ ] Commit - `feat(web): /admin/messages (R-95) (#31)`

### Task 16: Audit page

**Files:** `app/admin/audit/page.tsx`, `components/admin/audit-*.tsx` and tests.

- [ ] Component and feature tests: four tabs with counts, 25 a page with separate pagers keeping `user`, no IP column, "Registracija" / "El. paštas" methods, a postponed side "Atidėta", a forgotten actor "-", the empty texts, Vilnius dates.
- [ ] Commit - `feat(web): /admin/audit - sign-ins, prediction and result changes (R-69), role changes (#31)`

### Task 17: Admin index, shell and security pass - SECURITY

**Files:** `components/admin/admin-index.tsx`, tests.

- [ ] Tiles "Vartotojai", "Lygos", "Žinutės", "Auditas" per permission; the security reviewer reads every handler of tasks 13-16 against sportbet `CLAUDE.md` > Security and `docs/old-app-audit-2026-09-28.md`.
- [ ] Commit - `feat(web): the admin index lists the people screens (#31)`

### Task 18: E2E

**Files:** `apps/web/e2e/admin.spec.ts`.

- [ ] At 390 and 1280: change a role with the Mailpit code; hide and un-hide; mark a guest; add and delete a message; delete an account and see its league handed over; filter the audit.
- [ ] Commit - `test(e2e): the admin people journey (#31)`

### Task 19: Docs

- [ ] `CLAUDE.md`: "A player is removed only by `deleteAccount` (`packages/db/src/account/deletion.ts`), a role changed only by `changeRole`; the last-superadmin guard locks every superadmin row first; every FK to `players` is cascade, set null or in `PLAYER_ROWS_DELETED` (`player-fk-coverage.test.ts`)." The lock order paragraph gains the deletion's several tournament locks in id order.
- [ ] The spec: the planning decisions above.
- [ ] Commit - `docs: slice 14 write paths and lock order (#31)`

### Finish

- [ ] `pnpm lint && pnpm typecheck && pnpm test`; db and feature suites green; E2E green.
- [ ] Security reviewer sign-off recorded on #31; architect runs `mp-code-review` and `improve-codebase-architecture`.
- [ ] Close #31 when staging shows the spec's "Done means".
