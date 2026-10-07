# Results Entry and the Recalculation Pipeline (Slice 7) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** A results manager or superadmin (R-26 amended) enters game results as in sportbet 3eb95e7.
- **7a:** each account holds a role (`player`, `results-manager`, `superadmin`), copied from sportbet's `user_settings.admin`. One server gate re-reads it on every request. `/admin` shows sportbet's tiles that exist; `/admin/results` (the current round) and `/admin/resultsAll` (the current tournament, R-66) list the games read-only. Admins get the shell's admin link.
- **7b:** the boxes autosave to `POST /admin/updateResult`. The server checks a result in sportbet's order (UpdateResultRequest): `-1 : -1` postpones (R-63), an empty pair clears, one empty box is refused (R-64), a game not yet started and a level result are refused (R-38). An accepted result is written in one transaction: the game row locked (`FOR UPDATE`, #20's F1), fill-ins for blank rows (FI-1, R-32, R-39) with each player's count (R-7), a correction's mistaken fill-ins removed (FI-4, R-5), then the tournament recalculated under `ruledRules` unless it is frozen (R-22). A prediction save now takes the game row `FOR SHARE` first.
- **7c:** "Perskaičiuoti taškus" (`POST /admin/recalculateAllGamePoints`) recalculates every tournament not frozen, standings included (R-65), timed, and answers sportbet's "Visi taškų rezultatai perskaičiuoti.". `/admin/updateStandingPoints` is not served.

**Architecture:**
- `packages/domain` decides:
  - `account/role.ts`: the roles, sportbet's levels as roles, who may enter results and recalculate.
  - `result/results-page.ts`: which games a results page lists, whether a game's boxes take input, the grouping.
  - `result/result-form.ts`: the posted pair, in UpdateResultRequest's per-field order.
  - `result/enter-result.ts`: the game's new state (postpone, clear, score) and its refusals; the fill-ins at a result and each player's status after them; a correction's mistaken fill-ins and the statuses after their removal.
- `packages/db` stores the role (migrations 0012-0014), loads the results page, writes a result in one transaction (`result/save.ts`), and recalculates every tournament (`recalculation/all.ts`).
- `apps/web` holds the gate (`server/admin/gate.ts`), the pages, two route handlers and their use cases, and the results autosave client.

**Tech Stack:**
- Next.js 16.3.6 (App Router, route handlers, `proxy.ts`), React 19.3.
- Drizzle ORM 0.45.3 and drizzle-kit 0.31.11 on Postgres 18.6, Zod 4.6.5.
- `Intl.DateTimeFormat` (Europe/Vilnius), `node:crypto` (`randomInt`, through the existing `cryptoDice`), `performance.now()`.
- Vitest 5, Testing Library, jsdom 30, Playwright 1.63.
- **No new dependency.**

**Spec:** `docs/superpowers/specs/2026-10-07-results-entry-design.md` (approved by the owner).

**Rulings:** LR-1, LR-6, R-2, R-5, R-6, R-7, R-9, R-13, R-19, R-22, R-26 (amended 2026-10-07), R-32, R-38, R-39, R-40, R-41, R-43, R-45, R-50, R-51, R-59, R-63 to R-66 (`docs/owner-rulings.md`).

**Decisions:** 3, 5, 10, 11, 13.

**Issue:** #21 (part of #1). Carries #20's F1 (lock the game row when a result is written).

**Reference:** sportbet (`D:\Projects\sportbet`) at `3eb95e7`:
- `app/Http/Controllers/ResultController.php` (pages 21-35, updateResult 39-88, recalculateAllGamePoints 91-100)
- `app/Http/Requests/UpdateResultRequest.php` (rules 46-60, after() 68-144)
- `app/Services/Recalculation.php` (afterResultEntered 50-69, all 76-115), `app/Services/GeneratedPredictions.php`
- `app/Http/Controllers/PointStandingController.php` (121-133)
- `app/Http/Middleware/{AdminMiddleware,SuperAdminMiddleware,EnsureIsLevel9Admin}.php`
- `resources/views/admin/{index,results}.blade.php`, `resources/views/admin/layouts/master.blade.php`, `resources/views/admin/partials/rail.blade.php`
- `routes/web.php` (150-247)
- `public/css/custom.css` (`.admin-result-row` 2079-2088, `.pred-score--*` 2165-2168, `.admin-tile*` 2632-2665)

---

## Conventions for every task

**Roles and commits**
- Work on `main` (trunk-based, `CLAUDE.md`).
- Each task names the teammate role that owns its folders (`docs/agent-team.md`):
  - `backend-dev` edits `packages/domain`, `packages/db` and `tools/migrate`.
  - `web-dev` edits `apps/web`, including its component and feature tests.
  - `qa` edits E2E, smoke and `playwright.config.ts` only.
  - The lead edits the records and is the only one who talks to the owner.
- There is no `devops` task. Migrations 0012-0014 reach Neon through the existing deploy; the staging seed runs on every deploy and in CI's E2E stack.
- Reviews:
  - `qa` reviews every task against #21's criteria and sportbet's behaviour.
  - `architect` reviews every task against `CLAUDE.md` and the spec.
  - `security-reviewer` reviews every task marked **(sensitive)**: the roles and their migration (Tasks 1-3), the gate and the admin pages (Tasks 5 and 6), the result write and the prediction save's lock (Tasks 8 and 9), the result route (Task 10), the recalculation route (Task 13).
- **Only the lead commits**, once those reviews have passed the task.
- A teammate's last step is "hand to the lead": the files changed, the commands run and their results, and the commit message.
- Every commit message references `#21` and ends with the trailer lines the lead's session gives (`Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>` and the `Claude-Session:` line).
- Do not push until Task 16. Tasks 7 and 11 end 7a and 7b with the whole check and a review pass; nothing is pushed in between.

**Running things**
- Shell snippets are Git Bash on Windows, run from `D:\Projects\sportbet_new`.
- The db, feature and reader suites need Docker running. The feature suite also needs a fresh `pnpm build`.
- Every verify step runs `pnpm format` first. The code below is written as Prettier leaves it, but a line Prettier rewraps is not a failure. `pnpm format:check` must pass after `pnpm format`.
- How to run one file:
  - Unit: `pnpm --filter @sportbet/domain exec vitest run <file>`
  - DB: `pnpm --filter @sportbet/db exec vitest run <file>`
  - Reader: `pnpm --filter @sportbet/migrate exec vitest run <file>`
  - Component and web unit: `pnpm --filter @sportbet/web exec vitest run --config vitest.component.config.ts <file>`
  - Feature: `pnpm build && pnpm --filter @sportbet/web exec vitest run --config vitest.feature.config.ts <file>`

**sportbet and texts**
- "sportbet" means the old app at `3eb95e7`. Read any of its files with `git -C /d/Projects/sportbet show 3eb95e7:<path>`.
- Every Lithuanian text below is sportbet's (the views above and `lang/lt.json`), except the three marked **(owner to confirm)**: sportbet answers those cases with Laravel's English, or not at all (design decision 6).
- No emoji is typed into any file, and no `\uXXXX` escape either: the Write and Edit tools turn a typed escape into the raw character.

**Code rules** (`CLAUDE.md`)
- `packages/domain` imports only `zod`, and takes time and randomness as parameters.
- Web reaches the database only through `@sportbet/db`.
- Pages only load data (parse params, call a query) and return one component. Markup lives in components, which have component tests.
- Colours exist only as tokens (`bg-card`, `text-muted`, `border-warn`), never as a literal or a palette class.
- No `any`, no `as` other than `as const`, no `!`.
- A refusal is a `Result`; an impossible state throws. The one exception is a posted form checked field by field (`predictionFormEntry`, and now `resultFormEntry`): its refusal lists the fields' errors.
- A skipped or focused test is a lint error.
- Every query result is parsed before it leaves `db`.
- Derived points rows only through `recalculateUnderRuleSet`.
- An id typed into a URL or form is read only by `idFromText` / `gameIdFromText`.
- Route handlers answer through `apps/web/src/server/request/route-responses.ts`. Every POST starts with `refuseCrossSite`.
- **The lock order** (this slice extends it): the game row first (a result write `FOR UPDATE`, a prediction save `FOR SHARE`), then a player's `match_predictions` row, then the player's `tournament_players` rows through `lockPlayerStatuses` (by tournament id). A writer locking several players' status rows takes the players in player id order.
- **Nothing personal in any log or output.** No address, username, name, surname or score is passed to `console.*` or put in an error message. A catch logs `errorKind(error)` only (`apps/web/src/server/error-kind.ts`). The recalculation's timing log names a tournament's slug and milliseconds, nothing else.

## File map

```
packages/domain/src/account/
  role.ts                 ROLES, Role, roleOfSportbetLevel, isAdmin, mayEnterResults, mayRecalculate  (+ test, new)
  player-settings.ts      StoredPlayerSettings.role (adminLevel goes); isAdmin moves to role.ts      (+ test)
packages/domain/src/stored/sportbet-columns.ts   settings: the role from `admin`                  (+ test)
packages/domain/src/result/
  results-page.ts         resultsPageGames, resultBoxesOpen, groupResultGames                     (+ test, new)
  result-form.ts          resultFormEntry: the posted pair, in UpdateResultRequest's order         (+ test, new)
  enter-result.ts         enterResult, resultFillIns, mistakenFillInsRemoved                       (+ test, new)
packages/domain/src/prediction/predict-match.ts  statusAfterSave keeps; TournamentStatusRow reused
packages/domain/src/index.ts                     the new exports

packages/db/src/account/schema.ts                + player_role enum, role; admin_level goes
packages/db/migrations/0012_player-role.sql                (generated, new)
packages/db/migrations/0013_player-role-from-level.sql     (custom, new)
packages/db/migrations/0014_drop-admin-level.sql           (generated, new)
packages/db/src/account/repository.ts, sessions.ts, registration.ts   role instead of adminLevel
packages/db/src/seed/staging.ts                  the staging account is a superadmin
packages/db/src/result/page.ts                   loadResultsPage                                 (new)
packages/db/src/result/save.ts                   saveResult (one transaction)                    (new)
packages/db/src/recalculation/all.ts             recalculateAll                                  (new)
packages/db/src/prediction/save.ts               the game row FOR SHARE first (F1)
packages/db/src/index.ts                         the new exports
packages/db/test/role.test.ts, results-page.test.ts, result-save.test.ts, result-replay.test.ts, recalculate-all.test.ts (new)
packages/db/test/account.test.ts, sessions.test.ts, seed.test.ts, schema.test.ts, prediction-save.test.ts

tools/migrate/src/map.ts                         the role, and a notice counting each role
tools/migrate/src/report.ts                      each tournament's recalculation time (notice)
tools/migrate/test/map.test.ts, reader.test.ts   role instead of adminLevel

apps/web/src/server/admin/gate.ts                resultsManager(): the signed-in admin, re-read per request (new)
apps/web/src/server/viewer.ts, request-context.ts   isAdmin(role)
apps/web/src/server/results/texts.ts             the result save's texts                         (new)
apps/web/src/server/results/save-result.ts       the save's use case and answers                 (+ test, new)
apps/web/src/server/flash.ts                     + 'recalculated'
apps/web/src/components/hub/flash-alert.tsx      + "Visi taškų rezultatai perskaičiuoti."        (+ test)
apps/web/src/components/shell/shell-paths.ts     SHELL_LINKS.admin; ADMIN_RESULTS_PATH, ADMIN_RESULTS_ALL_PATH,
                                                 UPDATE_RESULT_PATH, RECALCULATE_PATH            (+ test)
apps/web/src/components/shell/icon.tsx           + gear-fill, trophy... arrow-repeat, chevron-down (+ test)
apps/web/src/components/predictions/score-autosave.tsx   Mark + 'partial'
apps/web/src/components/admin/
  admin-index-view.tsx    AdminIndexView: "Admin skydelis" and its tiles                         (+ test, new)
  confirm-form.tsx        ConfirmForm: a POST that asks first                                    (+ test, new)
  result-protocol.ts      the result save's wire format                                          (+ test, new)
  result-row.tsx          ResultRow: one game, its boxes, its autosave                           (+ test, new)
  results-view.tsx        ResultsView                                                            (+ test, new)
apps/web/src/app/admin/page.tsx                  /admin                                          (new)
apps/web/src/app/admin/results/page.tsx          /admin/results                                  (new)
apps/web/src/app/admin/resultsAll/page.tsx       /admin/resultsAll                               (new)
apps/web/src/app/admin/updateResult/route.ts     POST                                            (new)
apps/web/src/app/admin/recalculateAllGamePoints/route.ts   POST                                  (new)
apps/web/tests/support/accounts.ts, hub.ts       role instead of adminLevel
apps/web/tests/feature/admin.test.ts, result-save.test.ts, recalculate.test.ts (new); session.test.ts
apps/web/e2e/predictions.spec.ts                 + a superadmin enters a result and clears it
CLAUDE.md                                        the records
```

## Design decisions this plan makes

None of these is a scoring rule; each is how the spec is held. Where one departs from the letter of the spec or of sportbet, the reason is given, and the lead lists it again in the report to the owner.

1. **The role replaces `admin_level` in three migrations.** drizzle-kit asks interactively whether a column added and one dropped in the same generate are a rename, and the agents cannot answer a prompt. So: 0012 adds `role` (generated), 0013 fills it from `admin_level` (`drizzle-kit generate --custom`), 0014 drops `admin_level` and its CHECK (generated). Mapping (R-26 amended): 0 player; 1 to 7 results manager; 8 and up superadmin. sportbet's admin form offers 0, 1, 5, 8, 9 (UserController:55); levels 2-4, 6, 7 never occur and map with their neighbours by sportbet's middleware thresholds (> 0, >= 5).
2. **A non-admin is sent to `/`, a guest too.** sportbet's AdminMiddleware redirects a signed-in non-admin to `/`; a guest meets `auth` first and goes to sign in. Here a guest also goes to `/` (no return path is kept for an admin page: `GUARDED_PAGES` does not grow). A page answers with Next's `redirect('/')` (307); a route handler with `seeOther('/')` (303).
3. **The admin pages sit in the player shell for now.** sportbet's admin layout has its own rail ("Admin", "Grįžti į svetainę", its sections). With three pages, the shell's admin link and the index's tiles reach them; the admin rail is built with the sections it lists (slice 13). The pages and tiles themselves follow sportbet's look.
4. **"The tournament the admin has open" is the request's tournament** (`requestContext`, R-28, R-46): one the admin plays. An admin who plays none sees an empty page until the admin tournament switcher (slice 13).
5. **A non-knockout round is one card, "Rungtynės".** sportbet groups a round by the home team's `group_name`; the new schema carries no group (the reader does not read `teams.group_name`), and Euroleague's regular season has none, which sportbet also draws as "Rungtynės". A knockout round is grouped by Vilnius day, as sportbet does.
6. **Three texts the owner should confirm.** sportbet answers a box that is not a whole number and one over 150 with Laravel's English (`integer`, `max:150`; no `lt` validation file), and has no frozen tournament. Here:
   - not a whole number: "Įveskite sveiką skaičių." **(owner to confirm)**
   - over 150: "Rezultatas negali būti didesnis nei 150." **(owner to confirm)**
   - a finished tournament (R-22): "Turnyras baigtas - rezultatų keisti negalima." **(owner to confirm)**
7. **A result in a finished tournament is refused** (R-22). Under `ruledRules` a finished season's points never change; writing a result there without recalculating would leave the game and its points disagreeing. sportbet rescores every tournament, so it has no such refusal. "Finished" is Season.isFinishedAt (R-21): end date passed and every game scored, so clearing a result of a season not yet past its end stays possible.
8. **`-1 : -1` on a scored game clears and postpones it.** sportbet overwrites the scores with the placeholder and leaves the old points until the next full recalculation. Here the game is unscored, postponed (R-41, R-63), and the tournament recalculated, so its points go at once. `Game.postpone` refuses a scored game, so the domain clears first.
9. **Emptying a postponed game's boxes ends the postponement** (R-63). The game keeps any R-13 lock it took (a game postponed after its tip-off stays closed).
10. **A postponed game's boxes take input whatever the clock**, so its `-1 : -1` can be cleared once rescheduled (sportbet's UpdateResultRequest allows it, but its page disables a future game's boxes, so in sportbet it could not be done from the page).
11. **The save answers 200 `{success:true}`**, as sportbet; a refusal 422 Laravel's `{message, errors}`. The page shows the message (spec, lead decision, as R-59), where sportbet's page shows only the red border.
12. **The parity check of the write path is a db test on the golden scenario**, `result-replay.test.ts`, not a reader run. A production replay cannot reproduce fill-in scores (sportbet's `random_int`), and production parity is already the reader's (both oracles). The golden scenario has no blank rows, so a replay of its three results through `saveResult` must reproduce `GOLDEN_POINTS_RULED` exactly; a second case blanks one row and scripts the dice. The reader adds each tournament's recalculation time to its report (Task 12), so Task 17's run records the timing on production's copy.
13. **The E2E admin journey rides in `predictions.spec.ts`.** The seeded account (a superadmin now) has three sign-in codes per ten minutes and `sign-in.spec.ts` and `predictions.spec.ts` use all three. The journey enters a result for game 9002 and clears it before the file ends, so later files see game 9002 as before.

---

## Part 7a: roles, the gate and the results pages

### Task 0 (lead): The gate

**Files:** none.

- [ ] **Step 1: A clean `main` with the spec on it**

```bash
git status --short | wc -l
git log --oneline -1 -- docs/superpowers/specs/2026-10-07-results-entry-design.md
git -C /d/Projects/sportbet cat-file -t 3eb95e7
git rev-parse --short HEAD
```

Expected: `0`; `f504205 docs: slice 7 spec - results entry and recalculation; R-26 amended to three roles, R-63 to R-66 (#21)`; `commit`; the gate's commit (this plan, committed on top of `f504205`). Note it; Tasks 7, 11 and 16 review from it.

- [ ] **Step 2: Record the baseline**

```bash
pnpm install --frozen-lockfile 2>&1 | tail -1
pnpm build 2>&1 | grep -c "build: Done"
for s in unit component db feature migrate; do echo "== $s"; pnpm test:$s 2>&1 | grep -E "Test Files|Tests "; done
```

Expected: `Done`, `3`, and every suite passing (at 6125dca: unit 830, component 438, db 463, feature 205, migrate 233). Note each count.

- [ ] **Step 3: Post design decision 6's three texts on #21**, so the owner's answer has a place. The lead asks the owner one at a time before Task 10 is committed; the texts live in one file (`apps/web/src/server/results/texts.ts`), so an answer is a one-line change.

---

### Task 1 (backend-dev): Roles in the domain **(sensitive)**

**Files:**
- Create: `packages/domain/src/account/role.ts`, `packages/domain/src/account/role.test.ts`
- Modify: `packages/domain/src/account/player-settings.ts` (+ its test), `packages/domain/src/stored/sportbet-columns.ts` (+ its test), `packages/domain/src/index.ts`

- [ ] **Step 1: Write the failing test** `packages/domain/src/account/role.test.ts`

```ts
import { describe, expect, it } from 'vitest';
import {
  isAdmin,
  mayEnterResults,
  mayRecalculate,
  ROLES,
  roleOfSportbetLevel,
  type Role,
} from './role';

describe('roles (R-26 amended)', () => {
  it('role: three, in order of rights', () => {
    expect(ROLES).toEqual(['player', 'results-manager', 'superadmin']);
  });

  it.each([
    [0, 'player'],
    [1, 'results-manager'],
    [5, 'results-manager'],
    [7, 'results-manager'],
    [8, 'superadmin'],
    [9, 'superadmin'],
    [127, 'superadmin'],
  ] as const)(
    "role: sportbet's level %i is a %s",
    (level, role) => {
      expect(roleOfSportbetLevel(level)).toEqual({ ok: true, value: role });
    },
  );

  it.each([-1, 128, 1.5])(
    'role: %s is not a level sportbet stores',
    (level) => {
      expect(roleOfSportbetLevel(level)).toEqual({
        ok: false,
        refusal: 'bad-admin-level',
      });
    },
  );

  it.each([
    ['player', false],
    ['results-manager', true],
    ['superadmin', true],
  ] as const satisfies readonly (readonly [Role, boolean])[])(
    'role: a %s is an admin, enters results and recalculates: %s',
    (role, admin) => {
      expect(isAdmin(role)).toBe(admin);
      expect(mayEnterResults(role)).toBe(admin);
      expect(mayRecalculate(role)).toBe(admin);
    },
  );
});
```

- [ ] **Step 2: Run it to see it fail**

Run: `pnpm --filter @sportbet/domain exec vitest run src/account/role.test.ts`
Expected: FAIL, `Cannot find module './role'`.

- [ ] **Step 3: Write `packages/domain/src/account/role.ts`**

```ts
import { ok, refuse, type Result } from '../shared/result';
import { adminLevelInvariant } from './player-settings';

/**
 * R-26 (amended, 2026-10-07): the roles an account holds - a player, a
 * results manager (results, the standings facts, the recalculation), a
 * superadmin (everything).
 */
export const ROLES = ['player', 'results-manager', 'superadmin'] as const;

export type Role = (typeof ROLES)[number];

/**
 * sportbet's `user_settings.admin` as a role (R-26 amended): 0 a player;
 * 1 to 7 a results manager (its admin form offers 1 and 5 - AdminMiddleware
 * lets in level > 0, SuperAdminMiddleware >= 5); 8 and up a superadmin (8
 * and 9 are the owner's: 8 promoted itself to 9 for the dangerous work).
 */
export function roleOfSportbetLevel(
  level: number,
): Result<Role, 'bad-admin-level'> {
  if (!adminLevelInvariant.schema.safeParse(level).success) {
    return refuse('bad-admin-level');
  }
  if (level === 0) return ok('player');
  return ok(level >= 8 ? 'superadmin' : 'results-manager');
}

/** The shell's admin link, and R-50's "an admin sees a hidden tournament": any role but a player. */
export function isAdmin(role: Role): boolean {
  return role !== 'player';
}

/** R-26 amended: enters results ("Rezultatai"). */
export function mayEnterResults(role: Role): boolean {
  return role !== 'player';
}

/** R-26 amended, R-65: runs "Perskaičiuoti taškus". */
export function mayRecalculate(role: Role): boolean {
  return role !== 'player';
}
```

- [ ] **Step 4: Change `packages/domain/src/account/player-settings.ts`.** Keep `localeInvariant` and `adminLevelInvariant` (the reader still checks sportbet's column with it); change the invariant's doc comment's last sentence to "the reader maps it to a role (roleOfSportbetLevel, R-26 amended)". Replace the interface and delete the old `isAdmin`:

```ts
import type { PlayerId } from '../shared/ids';
import type { Role } from './role';

/**
 * A player's settings (sportbet's `user_settings`, the columns 4b reads),
 * their role (R-26 amended) and R-28's last-used tournament, which
 * sportbet kept in the session.
 */
export interface StoredPlayerSettings {
  readonly player: PlayerId;
  readonly locale: string;
  readonly role: Role;
  /** R-28: the tournament the player used last, by id; null until they use one. */
  readonly lastTournament: number | null;
}
```

In `player-settings.test.ts`, delete the `isAdmin` cases (role.test.ts holds them now).

- [ ] **Step 5: Change `sportbetColumns.settings`** in `packages/domain/src/stored/sportbet-columns.ts` (around line 563):

```ts
  settings(
    row: SportbetSettingsRow,
  ): Result<StoredPlayerSettings, 'bad-admin-level' | 'bad-locale'> {
    const role = roleOfSportbetLevel(row.admin);
    if (!role.ok) {
      return refuse('bad-admin-level');
    }
    if (!localeInvariant.schema.safeParse(row.locale).success) {
      return refuse('bad-locale');
    }
    return ok({
      player: row.player,
      locale: row.locale,
      role: role.value,
      lastTournament: null,
    });
  },
```

Import `roleOfSportbetLevel` from `'../account/role'`; drop `adminLevelInvariant` from that file's imports if nothing else there uses it. In `sportbet-columns.test.ts`, every `adminLevel: n` expectation becomes `role: <roleOfSportbetLevel(n)>` (0 `'player'`, 1 and 5 `'results-manager'`, 8 and 9 `'superadmin'`), and add:

```ts
  it.each([
    [0, 'player'],
    [5, 'results-manager'],
    [9, 'superadmin'],
  ] as const)(
    "settings: sportbet's admin %i is read as a %s (R-26 amended)",
    (admin, role) => {
      expect(
        sportbetColumns.settings({ player: ADA, admin, locale: 'lt' }),
      ).toEqual({
        ok: true,
        value: { player: ADA, locale: 'lt', role, lastTournament: null },
      });
    },
  );
```

(Use the file's existing player constant if it is not `ADA`.)

- [ ] **Step 6: Exports.** In `packages/domain/src/index.ts`, the `'./account/player-settings'` block keeps `adminLevelInvariant`, `localeInvariant` and `type StoredPlayerSettings` and loses `isAdmin`; add:

```ts
export {
  isAdmin,
  mayEnterResults,
  mayRecalculate,
  ROLES,
  roleOfSportbetLevel,
  type Role,
} from './account/role';
```

- [ ] **Step 7: Run the domain suite and the typecheck**

```bash
pnpm format
pnpm --filter @sportbet/domain exec vitest run
pnpm --filter @sportbet/domain typecheck
```

Expected: PASS (the domain only). `@sportbet/db`, `tools/migrate` and web fail to typecheck until Tasks 2, 3 and 5: that is expected, and the lead commits Tasks 1 to 3 together.

- [ ] **Step 8: Hand to the lead.** Commit message (with Tasks 2 and 3): `feat(domain,db,migrate): three roles (R-26 amended) instead of sportbet's admin level - sportbet's 1-7 results managers, 8-9 superadmins; migrations 0012-0014; the staging account a superadmin (#21)`.

---

### Task 2 (backend-dev): The role stored, migrations 0012-0014 **(sensitive)**

**Files:**
- Modify: `packages/db/src/account/schema.ts`, `repository.ts`, `sessions.ts`, `registration.ts`, `packages/db/src/seed/staging.ts`, `packages/db/src/index.ts`
- Create: `packages/db/migrations/0012_player-role.sql`, `0013_player-role-from-level.sql`, `0014_drop-admin-level.sql` (and their `meta/` snapshots and `_journal.json` entries, generated)
- Test: `packages/db/test/role.test.ts` (new); `account.test.ts`, `sessions.test.ts`, `seed.test.ts`, `schema.test.ts`, `invariant-checks.test.ts` as they need

- [ ] **Step 1: Write the failing test** `packages/db/test/role.test.ts`

```ts
import { describe, expect, it } from 'vitest';
import { z } from 'zod';
import { MIGRATIONS_FOLDER, runMigrations } from '../src/migrations';
import { useTestDatabase } from '../src/testing';
import { withDatabaseAt } from '../src/testing/migrated-database';

const { connection } = useTestDatabase();

describe('migrations 0012-0014 (R-26 amended)', () => {
  it("give each stored admin level its role, and drop the level", async () => {
    // Through 0011_audit-prediction-games: the settings hold sportbet's levels.
    await withDatabaseAt(connection, 12, async (before) => {
      const levels = [0, 1, 5, 8, 9];
      for (const [index, level] of levels.entries()) {
        const id = index + 1;
        await before.client.query(
          `insert into players (id, username, email, name, surname)
           overriding system value values ($1, $2, $3, 'Vardas', '')`,
          [id, `p${String(id)}`, `p${String(id)}@example.test`],
        );
        await before.client.query(
          'insert into player_settings (player_id, admin_level) values ($1, $2)',
          [id, level],
        );
      }
      await runMigrations(before.url, MIGRATIONS_FOLDER);
      const roles = z
        .array(z.object({ player_id: z.int(), role: z.string() }))
        .parse(
          (
            await before.client.query(
              'select player_id, role::text as role from player_settings order by player_id',
            )
          ).rows,
        );
      expect(roles).toEqual([
        { player_id: 1, role: 'player' },
        { player_id: 2, role: 'results-manager' },
        { player_id: 3, role: 'results-manager' },
        { player_id: 4, role: 'superadmin' },
        { player_id: 5, role: 'superadmin' },
      ]);
      const columns = await before.client.query(
        `select column_name from information_schema.columns
         where table_name = 'player_settings' and column_name = 'admin_level'`,
      );
      expect(columns.rows).toEqual([]);
    });
  });

  it('a new settings row is a player unless told otherwise', async () => {
    const { client } = connection;
    await client.query(
      `insert into players (id, username, email, name, surname)
       overriding system value values (1, 'p1', 'p1@example.test', 'Vardas', '')`,
    );
    await client.query('insert into player_settings (player_id) values (1)');
    const row = await client.query(
      'select role::text as role from player_settings where player_id = 1',
    );
    expect(row.rows).toEqual([{ role: 'player' }]);
  });
});
```

(If `useTestDatabase()` exposes the connection under another name - see `schema.test.ts`'s use of `withDatabaseAt(connection, ...)` - use the same destructuring as that file.)

- [ ] **Step 2: Run it to see it fail**

Run: `pnpm --filter @sportbet/db exec vitest run test/role.test.ts`
Expected: FAIL (there are 12 migrations only, so the first case runs none and finds no `role` column; the second, `column "role" does not exist`).

- [ ] **Step 3: Add the role beside the level**, in `packages/db/src/account/schema.ts`:

```ts
import {
  adminLevelInvariant,
  AUDIT_LOGIN_METHODS,
  emailInvariant,
  localeInvariant,
  LOGIN_CODE_PURPOSES,
  ROLES,
} from '@sportbet/domain';
```

```ts
/** R-26 (amended): a player, a results manager or a superadmin; built from the domain's list. */
export const playerRoleEnum = pgEnum('player_role', ROLES);
```

and in `playerSettings`, below `adminLevel`:

```ts
    /** R-26 (amended): the account's role; sportbet's level mapped by migration 0013 and the reader. */
    role: playerRoleEnum('role').notNull().default('player'),
```

Generate:

```bash
pnpm --filter @sportbet/db db:generate --name player-role
cat packages/db/migrations/0012_player-role.sql
```

Expected SQL, exactly (order may differ; nothing else):

```sql
CREATE TYPE "public"."player_role" AS ENUM('player', 'results-manager', 'superadmin');--> statement-breakpoint
ALTER TABLE "player_settings" ADD COLUMN "role" "player_role" DEFAULT 'player' NOT NULL;
```

- [ ] **Step 4: The custom migration that maps the levels**

```bash
pnpm --filter @sportbet/db exec drizzle-kit generate --custom --name player-role-from-level
```

Write into the generated, empty `packages/db/migrations/0013_player-role-from-level.sql`:

```sql
-- R-26 (amended, 2026-10-07): sportbet's admin levels as roles - 0 a
-- player, 1 to 7 a results manager, 8 and up a superadmin
-- (roleOfSportbetLevel in packages/domain/src/account/role.ts).
UPDATE "player_settings" SET "role" = CASE
  WHEN "admin_level" >= 8 THEN 'superadmin'::"player_role"
  WHEN "admin_level" >= 1 THEN 'results-manager'::"player_role"
  ELSE 'player'::"player_role"
END;
```

- [ ] **Step 5: Drop the level.** In `packages/db/src/account/schema.ts`, delete the `adminLevel` column and its entry in `playerSettingsInvariantChecks` (`player_settings_admin_level_range`), drop `adminLevelInvariant` and `smallint` from the imports if now unused, then:

```bash
pnpm --filter @sportbet/db db:generate --name drop-admin-level
cat packages/db/migrations/0014_drop-admin-level.sql
```

Expected SQL, exactly:

```sql
ALTER TABLE "player_settings" DROP CONSTRAINT "player_settings_admin_level_range";--> statement-breakpoint
ALTER TABLE "player_settings" DROP COLUMN "admin_level";
```

If drizzle-kit asks a question at any of these three steps, stop and hand to the lead: the steps are split so that it does not.

- [ ] **Step 6: The role through the repositories.**
  - `packages/db/src/account/repository.ts`: `settingsRows` reads `role: z.enum(ROLES)` instead of `adminLevel`; `savePlayerSettings` writes `role: row.role` and its `onConflictDoUpdate` sets `role: excluded(playerSettings.role)`; `listPlayerSettings` selects `role: playerSettings.role` and returns `role: row.role`. Import `ROLES` from `@sportbet/domain`, drop `adminLevelInvariant`.
  - `packages/db/src/account/sessions.ts`: `SignedInPlayer.adminLevel: number` becomes `readonly role: Role;`; `signedInRows` reads `role: z.enum(ROLES).nullable()`; the select reads `role: playerSettings.role`; the missing-settings check reads `if (row.role === null)`; the result returns `role: row.role`.
  - `packages/db/src/account/registration.ts` (around line 137): `adminLevel: 0` becomes `role: 'player'`.
  - `packages/db/src/seed/staging.ts`: the account's doc comment's last sentence becomes "A superadmin (R-26 amended): the owner's account on staging, and CI's E2E account, enters results (slice 7)."; the settings insert becomes:

```ts
    await tx
      .insert(playerSettings)
      .values({ playerId: account.id, role: 'superadmin' })
      .onConflictDoUpdate({
        target: playerSettings.playerId,
        set: { role: 'superadmin' },
      });
```

- [ ] **Step 7: The tests that named the level.** `grep -rn "adminLevel\|admin_level" packages/db/test packages/db/src` must print nothing outside `migrations/`. In `account.test.ts`, `sessions.test.ts` and `seed.test.ts`, every `adminLevel: n` becomes the role it maps to; `seed.test.ts` gains:

```ts
  it('seed: the staging account is a superadmin, and stays one (R-26 amended)', async () => {
    await seedStaging(db, STAGING_EMAIL);
    await seedStaging(db, STAGING_EMAIL);
    const rows = await client.query(
      "select role::text as role from player_settings join players on players.id = player_settings.player_id where players.username = 'savininkas'",
    );
    expect(rows.rows).toEqual([{ role: 'superadmin' }]);
  });
```

(`STAGING_EMAIL` and `client` as that file already names them.) `invariant-checks.test.ts` lists every CHECK: remove `player_settings_admin_level_range` from it if it is listed there by name.

- [ ] **Step 8: Run the db suite**

```bash
pnpm format
pnpm --filter @sportbet/db exec vitest run
pnpm --filter @sportbet/db typecheck
```

Expected: PASS, with `role.test.ts`'s two cases.

- [ ] **Step 9: Hand to the lead** (committed with Tasks 1 and 3).

---

### Task 3 (backend-dev): The reader maps the role **(sensitive)**

**Files:** Modify `tools/migrate/src/map.ts`; test `tools/migrate/test/map.test.ts`, `tools/migrate/test/reader.test.ts`.

- [ ] **Step 1: Write the failing test** in `tools/migrate/test/map.test.ts`, beside the settings cases:

```ts
describe('map: roles (R-26 amended)', () => {
  it("map: sportbet's admin levels become roles, and a notice counts each role", () => {
    const mapped = map(
      changed('user_settings', (rows) =>
        rows.map((row, index) => ({ ...row, admin: [0, 5, 9][index % 3] })),
      ),
    );
    const roles = mapped.settings.map(({ role }) => role);
    expect(new Set(roles)).toEqual(
      new Set(['player', 'results-manager', 'superadmin']),
    );
    const counts = {
      player: roles.filter((role) => role === 'player').length,
      manager: roles.filter((role) => role === 'results-manager').length,
      superadmin: roles.filter((role) => role === 'superadmin').length,
    };
    expect(mapped.notices).toContain(
      `player_settings: ${String(counts.player)} players, ${String(counts.manager)} results managers, ${String(counts.superadmin)} superadmins (R-26 amended)`,
    );
  });
});
```

(`map`, `changed` and the shape of `mapped` as the file's existing cases use them; if the mapped settings are named otherwise, use that name.)

- [ ] **Step 2: Run it to see it fail**

Run: `pnpm --filter @sportbet/migrate exec vitest run test/map.test.ts`
Expected: FAIL (no `role` field; no notice).

- [ ] **Step 3: In `tools/migrate/src/map.ts`**, after the settings are mapped (the `sportbetColumns.settings` loop around line 643), push the notice, numbers only:

```ts
  const roleCount = (role: Role) =>
    settings.filter((each) => each.role === role).length;
  notices.push(
    `player_settings: ${String(roleCount('player'))} players, ${String(roleCount('results-manager'))} results managers, ${String(roleCount('superadmin'))} superadmins (R-26 amended)`,
  );
```

(`settings` and `notices` as the file names its mapped settings and its notices; import `type Role` from `@sportbet/domain`.)

- [ ] **Step 4: The tests that named the level.** In `map.test.ts` and `reader.test.ts`, every `adminLevel` expectation becomes `role`. If `reader.test.ts` asserts the full list of notices, add the new line with the synthetic dump's counts.

- [ ] **Step 5: Run the reader suite**

```bash
pnpm format
pnpm --filter @sportbet/migrate exec vitest run
pnpm typecheck 2>&1 | grep -E "error|Done"
```

Expected: the reader suite PASS (233 + 1), no reader containers left. Web still fails to typecheck until Task 5.

- [ ] **Step 6: Hand to the lead** (committed with Tasks 1 and 2, after Task 5 makes the whole typecheck pass, or with a web typecheck failure noted in the hand-off - the lead commits 1-3 and 5 together if so).

---

### Task 4 (backend-dev): The results pages' data

**Files:**
- Create: `packages/domain/src/result/results-page.ts` (+ test), `packages/db/src/result/page.ts`, `packages/db/test/results-page.test.ts`
- Modify: `packages/domain/src/index.ts`, `packages/db/src/index.ts`

- [ ] **Step 1: Write the failing domain test** `packages/domain/src/result/results-page.test.ts`

```ts
import { describe, expect, it } from 'vitest';
import { at, gameNo, roundNo, testGame } from '../testing';
import {
  groupResultGames,
  resultBoxesOpen,
  resultsPageGames,
} from './results-page';

const NOW = at('2026-10-15T12:00:00Z');

describe('results pages (ResultController)', () => {
  it("results: the current round's games, or every game (R-66), by tip-off then id", () => {
    const games = [
      testGame({ id: 3, round: 2, tipOff: '2026-10-09T18:00:00Z' }),
      testGame({ id: 1, round: 1, tipOff: '2026-10-02T18:00:00Z' }),
      testGame({ id: 2, round: 1, tipOff: '2026-10-02T18:00:00Z' }),
    ];
    expect(
      resultsPageGames(games, roundNo(1)).map((game) => game.id),
    ).toEqual([gameNo(1), gameNo(2)]);
    expect(resultsPageGames(games, 'all').map((game) => game.id)).toEqual([
      gameNo(1),
      gameNo(2),
      gameNo(3),
    ]);
    expect(resultsPageGames(games, null)).toEqual([]);
  });

  it('results: the boxes take input once the game has tipped off, or while it is postponed (decision 10)', () => {
    expect(
      resultBoxesOpen(testGame({ id: 1, tipOff: '2026-10-20T18:00:00Z' }), NOW),
    ).toBe(false);
    expect(
      resultBoxesOpen(testGame({ id: 1, tipOff: '2026-10-02T18:00:00Z' }), NOW),
    ).toBe(true);
    expect(
      resultBoxesOpen(
        testGame({ id: 1, tipOff: '2026-10-20T18:00:00Z', postponed: true }),
        NOW,
      ),
    ).toBe(true);
  });

  it('results: a knockout round is grouped by Vilnius day, any other is one card (decision 5); a round with every game scored is finished', () => {
    const rounds = [
      { number: roundNo(1), knockout: false },
      { number: roundNo(2), knockout: true },
    ];
    const games = [
      testGame({ id: 1, round: 1, tipOff: '2026-10-02T18:00:00Z', result: [88, 79] }),
      testGame({ id: 2, round: 1, tipOff: '2026-10-03T18:00:00Z', result: [70, 75] }),
      testGame({ id: 3, round: 2, tipOff: '2026-10-09T18:00:00Z' }),
      testGame({ id: 4, round: 2, tipOff: '2026-10-10T18:00:00Z' }),
    ];
    const dayOf = (instant: number) => new Date(instant).toISOString().slice(0, 10);
    expect(groupResultGames(games, rounds, dayOf)).toEqual([
      {
        round: roundNo(1),
        finished: true,
        cards: [{ day: null, games: [games[0], games[1]] }],
      },
      {
        round: roundNo(2),
        finished: false,
        cards: [
          { day: '2026-10-09', games: [games[2]] },
          { day: '2026-10-10', games: [games[3]] },
        ],
      },
    ]);
  });
});
```

If `testGame` in `packages/domain/src/testing.ts` takes another shape (it builds `Game.schedule` then `withResult` from `spec.result`, see line 119), adapt the calls to it and give it a `postponed` option if it has none (`unwrap(game.postpone(at(spec.tipOff), sportbetRules))` when `spec.postponed`).

- [ ] **Step 2: Run it to see it fail**

Run: `pnpm --filter @sportbet/domain exec vitest run src/result/results-page.test.ts`
Expected: FAIL, `Cannot find module './results-page'`.

- [ ] **Step 3: Write `packages/domain/src/result/results-page.ts`**

```ts
import type { Game } from '../round/game';
import type { RoundNumber } from '../shared/ids';
import type { Instant } from '../shared/instant';

/** A round as the results page reads it. */
export interface ResultsRound {
  readonly number: RoundNumber;
  readonly knockout: boolean;
}

/** One card of a round: its Vilnius day (a knockout round), or null (the round's one card, "Rungtynės"). */
/** What the grouping reads of a game: a domain Game, or a page's row of one. */
export interface ResultsGroupable {
  readonly round: RoundNumber;
  readonly tipOff: Instant;
  readonly result: unknown;
}

export interface ResultsCard<G extends ResultsGroupable = Game> {
  readonly day: string | null;
  readonly games: readonly G[];
}

export interface ResultsRoundGroup<G extends ResultsGroupable = Game> {
  readonly round: RoundNumber;
  /** Every game scored: sportbet draws the round collapsed. */
  readonly finished: boolean;
  readonly cards: readonly ResultsCard<G>[];
}

/**
 * ResultController's two pages: "Rezultatai (turas)" lists the current
 * round's games (null: none), "Visi rezultatai" every game of the
 * tournament (R-66); by tip-off, then id (sportbet's orderBy('game_date')).
 */
export function resultsPageGames<G extends Game>(
  games: readonly G[],
  round: RoundNumber | 'all' | null,
): G[] {
  if (round === null) return [];
  return games
    .filter((game) => round === 'all' || game.round === round)
    .sort((a, b) => a.tipOff - b.tipOff || a.id - b.id);
}

/**
 * Whether a game's boxes take input: once it has tipped off, as sportbet's
 * page enables them, or while it is postponed, so its -1 : -1 can be
 * cleared (R-63, decision 10).
 */
export function resultBoxesOpen(game: Game, now: Instant): boolean {
  return game.postponed || game.hasTippedOffAt(now);
}

/**
 * results.blade.php's grouping: by round, in round order; a knockout round
 * by Vilnius calendar day as `dayOf` names it, any other as one card
 * (decision 5). A round whose games are all scored is finished.
 */
export function groupResultGames<G extends ResultsGroupable>(
  games: readonly G[],
  rounds: readonly ResultsRound[],
  dayOf: (instant: Instant) => string,
): ResultsRoundGroup<G>[] {
  return [...rounds]
    .sort((a, b) => a.number - b.number)
    .map((round) => {
      const own = games.filter((game) => game.round === round.number);
      const cards: { day: string | null; games: G[] }[] = [];
      for (const game of own) {
        const day = round.knockout ? dayOf(game.tipOff) : null;
        const card = cards.find((each) => each.day === day);
        if (card === undefined) cards.push({ day, games: [game] });
        else card.games.push(game);
      }
      return {
        round: round.number,
        finished: own.every((game) => game.result !== null),
        cards,
      };
    })
    .filter((group) => group.cards.length > 0);
}
```

Export from `packages/domain/src/index.ts`:

```ts
export {
  groupResultGames,
  resultBoxesOpen,
  resultsPageGames,
  type ResultsCard,
  type ResultsRound,
  type ResultsRoundGroup,
} from './result/results-page';
```

- [ ] **Step 4: Run the domain test** - PASS.

- [ ] **Step 5: Write the failing db test** `packages/db/test/results-page.test.ts`

```ts
import { ruledRules } from '@sportbet/domain';
import { at, roundNo } from '@sportbet/domain/testing';
import { beforeEach, describe, expect, it } from 'vitest';
import { loadResultsPage } from '../src';
import { saveGames } from '../src/season/repository';
import { useTestDatabase } from '../src/testing';
import { G10_OPEN, G7, G8, G9, saveWorld, TOURNAMENT } from './world';

const { db } = useTestDatabase();
const NOW = at('2026-10-15T12:00:00Z');

beforeEach(async () => {
  await saveWorld(db);
  await saveGames(db, TOURNAMENT, [G7, G8, G9, G10_OPEN]);
});

describe('loadResultsPage', () => {
  it("results page: the round's games with their teams' names, result, postponement and whether the boxes take input", async () => {
    const page = await loadResultsPage(db, {
      tournament: TOURNAMENT,
      round: roundNo(1),
      now: NOW,
      rules: ruledRules,
    });
    expect(page.rounds).toEqual([
      { number: 1, name: '1 turas', knockout: false },
      { number: 2, name: '2 turas', knockout: true },
    ]);
    expect(page.games).toEqual([
      {
        game: 7,
        round: 1,
        tipOff: at('2026-10-02T18:00:00Z'),
        home: 'Zalgiris',
        away: 'Olympiacos',
        result: { home: 88, away: 79 },
        postponed: false,
        open: true,
      },
      {
        game: 10,
        round: 1,
        tipOff: at('2026-10-20T18:00:00Z'),
        home: 'Real',
        away: 'Olympiacos',
        result: null,
        postponed: false,
        open: false,
      },
    ]);
  });

  it("results page: every game of the tournament (R-66); a postponed game's boxes take input (decision 10)", async () => {
    const page = await loadResultsPage(db, {
      tournament: TOURNAMENT,
      round: 'all',
      now: NOW,
      rules: ruledRules,
    });
    expect(page.games.map((line) => line.game)).toEqual([7, 8, 9, 10]);
    expect(page.games.find((line) => line.game === 9)).toMatchObject({
      postponed: true,
      open: true,
      result: null,
    });
  });

  it('results page: no current round lists nothing', async () => {
    const page = await loadResultsPage(db, {
      tournament: TOURNAMENT,
      round: null,
      now: NOW,
      rules: ruledRules,
    });
    expect(page.games).toEqual([]);
  });
});
```

- [ ] **Step 6: Run it to see it fail** - FAIL, `loadResultsPage` is not exported.

- [ ] **Step 7: Write `packages/db/src/result/page.ts`**

```ts
import {
  resultBoxesOpen,
  resultsPageGames,
  type GameId,
  type Instant,
  type RoundNumber,
  type RuleSet,
  type Tournament,
} from '@sportbet/domain';
import { asc, eq } from 'drizzle-orm';
import { z } from 'zod';
import type { Executor } from '../client';
import { loadSeason } from '../season/repository';
import { rounds } from '../season/schema';
import { teamNamesOf } from '../team/repository';

/** A round of the tournament: its number, name and knockout flag. */
export interface ResultsPageRound {
  readonly number: RoundNumber;
  readonly name: string;
  readonly knockout: boolean;
}

/** One game of a results page. */
export interface ResultsPageGame {
  readonly game: GameId;
  readonly round: RoundNumber;
  readonly tipOff: Instant;
  readonly home: string;
  readonly away: string;
  readonly result: { readonly home: number; readonly away: number } | null;
  /** R-41, R-63: shown as -1 : -1, "Atidėta". */
  readonly postponed: boolean;
  /** Whether the boxes take input (resultBoxesOpen). */
  readonly open: boolean;
}

export interface ResultsPage {
  readonly rounds: readonly ResultsPageRound[];
  readonly games: readonly ResultsPageGame[];
}

const roundRows = z.array(
  z.object({ number: z.int(), name: z.string(), knockout: z.boolean() }),
);

/**
 * ResultController::getResultsCurrentRound (`round` the current round,
 * null when there is none) and getResultsAll ('all': the tournament's
 * games, R-66). This only loads; which games, in which order, and whether
 * their boxes take input are the domain's.
 */
export async function loadResultsPage(
  db: Executor,
  input: {
    readonly tournament: Tournament;
    readonly round: RoundNumber | 'all' | null;
    readonly now: Instant;
    readonly rules: RuleSet;
  },
): Promise<ResultsPage> {
  const { tournament, round, now } = input;
  const season = await loadSeason(db, tournament);
  const nameOf = await teamNamesOf(db, tournament);
  const menu = roundRows.parse(
    await db
      .select({
        number: rounds.number,
        name: rounds.name,
        knockout: rounds.knockout,
      })
      .from(rounds)
      .where(eq(rounds.tournamentId, tournament.id))
      .orderBy(asc(rounds.number), asc(rounds.id)),
  );
  const listed = resultsPageGames(season.games, round);
  return {
    rounds: menu.map((row) => {
      const number = season.rounds.find((each) => each.number === row.number);
      if (number === undefined) {
        throw new Error(`loadResultsPage: round ${String(row.number)} is not in its season`);
      }
      return { number: number.number, name: row.name, knockout: row.knockout };
    }),
    games: listed.map((game) => ({
      game: game.id,
      round: game.round,
      tipOff: game.tipOff,
      home: nameOf(game.home),
      away: nameOf(game.away),
      result:
        game.result === null
          ? null
          : { home: game.result.home, away: game.result.away },
      postponed: game.postponed,
      open: resultBoxesOpen(game, now),
    })),
  };
}
```

(Check `Season`'s public field names - `games`, `rounds` - in `packages/domain/src/round/season.ts` and use them as they are.) Export from `packages/db/src/index.ts`:

```ts
export {
  loadResultsPage,
  type ResultsPage,
  type ResultsPageGame,
  type ResultsPageRound,
} from './result/page';
```

- [ ] **Step 8: Run both tests**

```bash
pnpm format
pnpm --filter @sportbet/domain exec vitest run src/result/results-page.test.ts
pnpm --filter @sportbet/db exec vitest run test/results-page.test.ts
```

Expected: PASS.

- [ ] **Step 9: Hand to the lead.** Commit message: `feat(domain,db): the results pages' data - the current round or the tournament (R-66), whether a game's boxes take input, the grouping by round and knockout day (ResultController) (#21)`.

---

### Task 5 (web-dev): The role in web, the gate and the admin link **(sensitive)**

**Files:**
- Create: `apps/web/src/server/admin/gate.ts` (+ test)
- Modify: `apps/web/src/server/viewer.ts` (+ test), `apps/web/src/server/request-context.ts`, `apps/web/src/components/shell/shell-paths.ts` (+ test), `apps/web/tests/support/accounts.ts`, `apps/web/tests/support/hub.ts`, every test that passed an admin level

- [ ] **Step 1: The role, through.**
  - `apps/web/src/server/viewer.ts`: `isAdmin(signedIn.adminLevel)` becomes `isAdmin(signedIn.role)` (the domain's `isAdmin` now takes a role).
  - `apps/web/src/server/request-context.ts`: `isAdmin: isAdmin(signedIn.adminLevel)` becomes `isAdmin: isAdmin(signedIn.role)`.
  - `apps/web/tests/support/accounts.ts`: `saveAccounts(db, accounts, adminLevel = 0)` becomes `saveAccounts(db, accounts, role: Role = 'player')`, writing `role`.
  - `apps/web/tests/support/hub.ts`: `signedInBrowser(db, baseUrl, account, adminLevel = 0, ip)` becomes `signedInBrowser(db, baseUrl, account, role: Role = 'player', ip)`; its doc says "saved with its settings as `role`".
  - Every caller passing a number: a level >= 1 becomes `'results-manager'` (or `'superadmin'` where the test is about the top tier); `0` becomes `'player'` or is dropped. `grep -rn "adminLevel" apps/web` must print nothing.

- [ ] **Step 2: Write the failing gate test** `apps/web/src/server/admin/gate.test.ts`

```ts
import { describe, expect, it, vi } from 'vitest';

const signedIn = vi.hoisted(() => ({
  value: null as null | { role: 'player' | 'results-manager' | 'superadmin' },
}));

vi.mock('../request-context', () => ({
  signedInPlayer: () => Promise.resolve(signedIn.value),
}));

const { resultsManager } = await import('./gate');

describe('the admin gate (AdminMiddleware, R-26 amended)', () => {
  it.each([
    [null, false],
    [{ role: 'player' }, false],
    [{ role: 'results-manager' }, true],
    [{ role: 'superadmin' }, true],
  ] as const)('gate: %o may enter results: %s', async (who, allowed) => {
    signedIn.value = who;
    expect((await resultsManager()) !== null).toBe(allowed);
  });
});
```

- [ ] **Step 3: Run it to see it fail** - FAIL, `Cannot find module './gate'`.

- [ ] **Step 4: Write `apps/web/src/server/admin/gate.ts`**

```ts
import type { SignedInPlayer } from '@sportbet/db';
import { mayEnterResults } from '@sportbet/domain';
import { signedInPlayer } from '../request-context';

/**
 * AdminMiddleware for R-26 (amended): the signed-in player if their role
 * may enter results and recalculate, else null. The role is read from the
 * database with the session on every request (sportbet re-reads
 * `user_settings.admin` in each middleware), never kept in a cookie. A
 * page answers null with `redirect('/')`, a route handler with
 * `seeOther('/')` (design decision 2).
 */
export async function resultsManager(): Promise<SignedInPlayer | null> {
  const signedIn = await signedInPlayer();
  return signedIn !== null && mayEnterResults(signedIn.role) ? signedIn : null;
}
```

- [ ] **Step 5: The paths and the admin link** in `apps/web/src/components/shell/shell-paths.ts`:

```ts
/** "Rezultatai (turas)": the current round's games (slice 7). */
export const ADMIN_RESULTS_PATH = '/admin/results';

/** "Visi rezultatai": the tournament's games (slice 7, R-66). */
export const ADMIN_RESULTS_ALL_PATH = '/admin/resultsAll';

/** Where the results page's boxes post (sportbet's URL). */
export const UPDATE_RESULT_PATH = '/admin/updateResult';

/** "Perskaičiuoti taškus" (sportbet's URL, a POST since issue 269). */
export const RECALCULATE_PATH = '/admin/recalculateAllGamePoints';
```

and `SHELL_LINKS` becomes:

```ts
/** Slice 5's tournament exit and slice 7's administration; the profile (17) does not exist yet. */
export const SHELL_LINKS: ShellLinks = {
  profile: null,
  admin: ADMIN_PATH,
  tournamentExit: TOURNAMENT_EXIT_PATH,
};
```

`shell-paths.test.ts` checks every set link has its page: it passes once Task 6 adds `app/admin/page.tsx` (run it after Task 6). The two tests that assert administration is absent (`shell.test.tsx` "links to no page that does not exist ...", `tests/feature/session.test.ts` "shows the tournament the player plays, and links to no page that does not exist ...") now assert the admin link is drawn for an admin and absent for a player, and keep asserting the profile is absent.

- [ ] **Step 6: Run the web unit and component tests**

```bash
pnpm format
pnpm --filter @sportbet/web exec vitest run --config vitest.component.config.ts
pnpm typecheck
```

Expected: PASS except `shell-paths.test.ts`'s page check (Task 6), and the whole typecheck clean.

- [ ] **Step 7: Hand to the lead** (committed with Task 6). Commit message: `feat(web): the admin gate re-reading the role per request (R-26 amended), the shell's admin link, the admin paths (#21)`.

---

### Task 6 (web-dev): `/admin`, `/admin/results`, `/admin/resultsAll`, read-only **(sensitive)**

**Files:**
- Create: `apps/web/src/components/admin/admin-index-view.tsx`, `confirm-form.tsx`, `result-row.tsx`, `results-view.tsx` (each + test); `apps/web/src/app/admin/page.tsx`, `apps/web/src/app/admin/results/page.tsx`, `apps/web/src/app/admin/resultsAll/page.tsx`; `apps/web/tests/feature/admin.test.ts`
- Modify: `apps/web/src/components/shell/icon.tsx` (+ test)

- [ ] **Step 1: Icons.** Add `gear-fill`, `arrow-repeat` and `chevron-down` from the real `bootstrap-icons@1.11.1` package (`npm pack bootstrap-icons@1.11.1`, the paths of `icons/<name>.svg`), as slice 5 and 6 did - never retyped. Add the three names to `icon.test.tsx`'s list.

- [ ] **Step 2: Write the failing component tests.**

`apps/web/src/components/admin/admin-index-view.test.tsx`:

```tsx
import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { AdminIndexView } from './admin-index-view';

describe('AdminIndexView (admin/index.blade.php)', () => {
  it('admin: "Admin skydelis" and the tiles whose pages exist, the recalculation a POST', () => {
    render(<AdminIndexView />);
    expect(screen.getByRole('heading', { name: 'Admin skydelis' })).toBeTruthy();
    expect(
      screen.getByRole('link', { name: 'Rezultatai (turas)' }).getAttribute('href'),
    ).toBe('/admin/results');
    expect(
      screen.getByRole('link', { name: 'Visi rezultatai' }).getAttribute('href'),
    ).toBe('/admin/resultsAll');
    const recalculate = screen.getByRole('button', {
      name: 'Perskaičiuoti taškus',
    });
    expect(recalculate.closest('form')?.getAttribute('method')).toBe('post');
    expect(recalculate.closest('form')?.getAttribute('action')).toBe(
      '/admin/recalculateAllGamePoints',
    );
    expect(screen.queryByText('Eigos taškai')).toBeNull();
  });
});
```

`apps/web/src/components/admin/confirm-form.test.tsx`:

```tsx
import { fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { ConfirmForm } from './confirm-form';

afterEach(() => {
  vi.restoreAllMocks();
});

describe('ConfirmForm (onsubmit="return confirm(...)")', () => {
  it('confirm: submits only when the admin agrees', () => {
    const confirm = vi.spyOn(window, 'confirm').mockReturnValue(false);
    render(
      <ConfirmForm action="/x" question="Tikrai?">
        <button type="submit">Eiti</button>
      </ConfirmForm>,
    );
    const form = screen.getByRole('button', { name: 'Eiti' }).closest('form');
    if (form === null) throw new Error('no form');
    const submitted = fireEvent.submit(form);
    expect(confirm).toHaveBeenCalledWith('Tikrai?');
    expect(submitted).toBe(false);
  });
});
```

`apps/web/src/components/admin/results-view.test.tsx`:

```tsx
import { render, screen, within } from '@testing-library/react';
import { at, gameNo, roundNo } from '@sportbet/domain/testing';
import { describe, expect, it } from 'vitest';
import { ResultsView } from './results-view';

const PAGE = {
  rounds: [
    { number: roundNo(1), name: '1 turas', knockout: false },
    { number: roundNo(2), name: 'Atkrintamosios', knockout: true },
  ],
  games: [
    {
      game: gameNo(7),
      round: roundNo(1),
      tipOff: at('2026-10-02T18:00:00Z'),
      home: 'Zalgiris',
      away: 'Olympiacos',
      result: { home: 88, away: 79 },
      postponed: false,
      open: true,
    },
    {
      game: gameNo(9),
      round: roundNo(2),
      tipOff: at('2026-10-10T17:30:00Z'),
      home: 'Real',
      away: 'Fenerbahce',
      result: null,
      postponed: true,
      open: true,
    },
    {
      game: gameNo(11),
      round: roundNo(2),
      tipOff: at('2026-10-20T18:00:00Z'),
      home: 'Zalgiris',
      away: 'Real',
      result: null,
      postponed: false,
      open: false,
    },
  ],
};

describe('ResultsView (admin/results.blade.php)', () => {
  it('results: a round per header, "Rungtynės" or Vilnius days, the finished round collapsed', () => {
    render(<ResultsView page={PAGE} flash={null} />);
    const first = screen.getByText('1 turas').closest('details');
    expect(first?.open).toBe(false);
    expect(within(first ?? document.body).getByText('Rungtynės')).toBeTruthy();
    const second = screen.getByText('Atkrintamosios').closest('details');
    expect(second?.open).toBe(true);
    expect(within(second ?? document.body).getByText('Spalio 10')).toBeTruthy();
    expect(within(second ?? document.body).getByText('Spalio 20')).toBeTruthy();
  });

  it("results: each game's names, Vilnius time, and boxes - a scored game's result, a postponed game's -1 : -1 and \"Atidėta\", a future game's boxes disabled", () => {
    render(<ResultsView page={PAGE} flash={null} />);
    expect(screen.getByText('Spalio 2 · 21:00')).toBeTruthy();
    const [home7, away7] = screen.getAllByRole('textbox', {
      name: /Zalgiris - Olympiacos/u,
    });
    expect(home7?.getAttribute('value')).toBe('88');
    expect(away7?.getAttribute('value')).toBe('79');
    expect(screen.getByText('Atidėta')).toBeTruthy();
    const [home9] = screen.getAllByRole('textbox', { name: /Real - Fenerbahce/u });
    expect(home9?.getAttribute('value')).toBe('-1');
    expect(home9?.hasAttribute('disabled')).toBe(false);
    const [home11] = screen.getAllByRole('textbox', { name: /Zalgiris - Real/u });
    expect(home11?.hasAttribute('disabled')).toBe(true);
  });

  it('results: no games, no rounds drawn', () => {
    render(<ResultsView page={{ rounds: PAGE.rounds, games: [] }} flash={null} />);
    expect(screen.queryByText('1 turas')).toBeNull();
  });
});
```

- [ ] **Step 3: Run them to see them fail** - FAIL, modules missing.

- [ ] **Step 4: Write the components.**

`apps/web/src/components/admin/confirm-form.tsx`:

```tsx
'use client';

import type { ReactNode } from 'react';

/** A POST form that asks first, as sportbet's tile does (onsubmit="return confirm(...)", issue 269). */
export function ConfirmForm({
  action,
  question,
  className,
  children,
}: {
  action: string;
  question: string;
  className?: string;
  children: ReactNode;
}) {
  return (
    <form
      method="post"
      action={action}
      className={className}
      onSubmit={(event) => {
        if (!window.confirm(question)) event.preventDefault();
      }}
    >
      {children}
    </form>
  );
}
```

`apps/web/src/components/admin/admin-index-view.tsx`:

```tsx
import Link from 'next/link';
import {
  ADMIN_RESULTS_ALL_PATH,
  ADMIN_RESULTS_PATH,
  RECALCULATE_PATH,
} from '../shell/shell-paths';
import { Icon, type IconName } from '../shell/icon';
import { CardIcon } from '../hub/card-icon';
import { CARD_TITLE } from '../hub/styles';
import { ConfirmForm } from './confirm-form';

/** .admin-tile: a card-sized link or button, its icon in accent over its label. */
const TILE =
  'flex w-full cursor-pointer flex-col items-center justify-center gap-2 rounded-[10px] border border-border bg-card px-2.5 py-5 text-text no-underline transition hover:-translate-y-0.5 hover:text-accent hover:shadow-[0_4px_16px_var(--color-shadow)]';

function TileBody({ icon, label }: { icon: IconName; label: string }) {
  return (
    <>
      <span className="text-[1.8rem] text-accent">
        <Icon name={icon} />
      </span>
      <span className="text-center text-[0.78rem] font-semibold">{label}</span>
    </>
  );
}

/**
 * admin/index.blade.php: "Admin skydelis" and the tiles of the pages this
 * app serves - the results pages and "Perskaičiuoti taškus" (a POST that
 * asks first, issue 269). "Eigos taškai" is gone (R-65); the other tiles
 * come with their slices (13, 14).
 */
export function AdminIndexView() {
  return (
    <div className="grid grid-cols-2 gap-4 md:grid-cols-4 lg:grid-cols-6">
      <h1 className={`col-span-full ${CARD_TITLE}`}>
        <CardIcon name="gear-fill" /> Admin skydelis
      </h1>
      <Link href={ADMIN_RESULTS_PATH} className={TILE}>
        <TileBody icon="trophy" label="Rezultatai (turas)" />
      </Link>
      <Link href={ADMIN_RESULTS_ALL_PATH} className={TILE}>
        <TileBody icon="trophy-fill" label="Visi rezultatai" />
      </Link>
      <ConfirmForm
        action={RECALCULATE_PATH}
        question="Perskaičiuoti visų rungtynių taškus? Tai gali užtrukti."
      >
        <button type="submit" className={TILE}>
          <TileBody icon="arrow-repeat" label="Perskaičiuoti taškus" />
        </button>
      </ConfirmForm>
    </div>
  );
}
```

(`CardIcon` and `CARD_TITLE` as slice 5 wrote them; if their names differ, use the real ones. `Icon` exports `IconName` at icon.tsx:11.)

`apps/web/src/components/admin/result-row.tsx` (read-only in 7a; Task 10 rewrites it with the autosave):

```tsx
import { TeamCrest } from '../hub/team-crest';
import { vilniusClock, dayHeader } from '../format/vilnius-time';
import type { ResultsPageGame } from '@sportbet/db';

const BOX =
  'w-[42px] rounded-[8px] border bg-surface-2 px-[2px] py-[2px] text-center text-[0.95rem] leading-[1.3] font-bold tabular-nums';

/** The boxes' values: a result's sides, a postponed game's -1 : -1 (R-63), or empty. */
export function boxesOf(game: ResultsPageGame): { home: string; away: string } {
  if (game.result !== null) {
    return { home: String(game.result.home), away: String(game.result.away) };
  }
  return game.postponed ? { home: '-1', away: '-1' } : { home: '', away: '' };
}

/** .admin-result-row: the home team, the time and two boxes, the away team. */
export function ResultRow({ game }: { game: ResultsPageGame }) {
  const boxes = boxesOf(game);
  const label = `${game.home} - ${game.away}`;
  return (
    <div className="grid grid-cols-[1fr_auto_1fr] items-center gap-1.5 py-[7px] [&+&]:border-t [&+&]:border-border">
      <div className="flex min-w-0 items-center justify-end gap-1.5">
        <TeamCrest team={game.home} size="row" />
        <span className="truncate font-semibold">{game.home}</span>
      </div>
      <div className="flex flex-col items-center gap-0.5">
        <span className="text-[0.72rem] text-muted">
          {`${dayHeader(game.tipOff)} · ${vilniusClock(game.tipOff)}`}
        </span>
        <div className="flex items-center gap-1">
          <input
            type="text"
            readOnly
            aria-label={`${label}: namų komanda`}
            disabled={!game.open}
            value={boxes.home}
            className={`${BOX} ${game.result !== null ? 'border-ok' : 'border-border'}`}
          />
          <span>:</span>
          <input
            type="text"
            readOnly
            aria-label={`${label}: svečių komanda`}
            disabled={!game.open}
            value={boxes.away}
            className={`${BOX} ${game.result !== null ? 'border-ok' : 'border-border'}`}
          />
        </div>
        {game.postponed ? (
          <span className="text-[0.72rem] font-semibold text-warn">Atidėta</span>
        ) : null}
      </div>
      <div className="flex min-w-0 items-center gap-1.5">
        <span className="truncate font-semibold">{game.away}</span>
        <TeamCrest team={game.away} size="row" />
      </div>
    </div>
  );
}
```

(`dayHeader` and `vilniusClock` are slice 6's `components/format/vilnius-time.ts`; `TeamCrest`'s size names are slice 6's - use `'row'` if it exists, else the 26px one. The box aria-labels "namų komanda" / "svečių komanda" are this app's labels for a screen reader; sportbet's boxes have none.)

`apps/web/src/components/admin/results-view.tsx`:

```tsx
import type { ResultsPage } from '@sportbet/db';
import { groupResultGames } from '@sportbet/domain';
import { dayHeader, vilniusDate } from '../format/vilnius-time';
import { FlashAlert } from '../hub/flash-alert';
import { Icon } from '../shell/icon';
import type { Flash } from '../../server/flash';
import { ResultRow } from './result-row';

/**
 * admin/results.blade.php: sportbet's flash, then a collapsible block per
 * round (shut when every game is scored), its cards side by side from
 * 600px - a knockout round's Vilnius days, any other round's one
 * "Rungtynės" (decision 5) - and each game's row.
 */
export function ResultsView({
  page,
  flash,
}: {
  page: ResultsPage;
  flash: Flash | null;
}) {
  const names = new Map(page.rounds.map((round) => [round.number, round.name]));
  const groups = groupResultGames(page.games, page.rounds, vilniusDate);
  return (
    <div>
      {flash === null ? null : <FlashAlert flash={flash} />}
      {groups.map((group) => (
        <details key={group.round} open={!group.finished} className="mb-4">
          <summary className="flex cursor-pointer items-center justify-between rounded-[10px] bg-surface-2 px-3 py-2 text-[0.85rem] font-bold">
            <span>{names.get(group.round)}</span>
            <Icon name="chevron-down" />
          </summary>
          <div className="mt-2 grid gap-3 min-[600px]:grid-cols-2">
            {group.cards.map((card) => (
              <div
                key={card.day ?? 'games'}
                className="rounded-[12px] border border-border bg-card p-3"
              >
                <div className="mb-1 text-[0.75rem] font-bold text-muted">
                  {card.day === null
                    ? 'Rungtynės'
                    : dayHeader(Date.parse(`${card.day}T12:00:00Z`))}
                </div>
                {card.games.map((game) => (
                  <ResultRow key={game.game} game={game} />
                ))}
              </div>
            ))}
          </div>
        </details>
      ))}
    </div>
  );
}
```

`groupResultGames` takes any `ResultsGroupable` (Task 4), so the page's rows, plain data, group as `Game`s do. (`vilniusDate` returns the Vilnius `YYYY-MM-DD`; if slice 6 named it otherwise, use that function.)

- [ ] **Step 5: The pages.**

`apps/web/src/app/admin/page.tsx`:

```tsx
import { redirect } from 'next/navigation';
import { connection } from 'next/server';
import { AdminIndexView } from '../../components/admin/admin-index-view';
import { resultsManager } from '../../server/admin/gate';

/** admin.index, behind AdminMiddleware (R-26 amended): a non-admin goes home (decision 2). */
export default async function AdminPage() {
  await connection();
  if ((await resultsManager()) === null) redirect('/');
  return <AdminIndexView />;
}
```

`apps/web/src/app/admin/results/page.tsx`:

```tsx
import { loadResultsPage } from '@sportbet/db';
import { ruledRules } from '@sportbet/domain';
import { redirect } from 'next/navigation';
import { connection } from 'next/server';
import { ResultsView } from '../../../components/admin/results-view';
import { resultsManager } from '../../../server/admin/gate';
import { now } from '../../../server/clock';
import { getDb } from '../../../server/db';
import { readFlash } from '../../../server/flash';
import { requestContext } from '../../../server/request-context';

/** getResultsCurrentRound: the current round (R-6, R-40) of the tournament the admin has open (decision 4). */
export default async function AdminResultsPage() {
  await connection();
  if ((await resultsManager()) === null) redirect('/');
  const context = await requestContext();
  const flash = await readFlash();
  if (context.tournament === null) {
    return <ResultsView page={{ rounds: [], games: [] }} flash={flash} />;
  }
  const page = await loadResultsPage(getDb(), {
    tournament: context.tournament.tournament,
    round: context.tournament.currentRound,
    now: now(),
    rules: ruledRules,
  });
  return <ResultsView page={page} flash={flash} />;
}
```

`apps/web/src/app/admin/resultsAll/page.tsx`: the same, with `round: 'all'` and the doc "getResultsAll: every game of the tournament the admin has open (R-66)".

- [ ] **Step 6: The feature test** `apps/web/tests/feature/admin.test.ts`

```ts
import { useTestDatabase } from '@sportbet/db/testing';
import { describe, expect, inject, it } from 'vitest';
import { JONAS_ACCOUNT } from '../support/accounts';
import { Browser } from '../support/browser';
import { signedInBrowser } from '../support/hub';
import { savePlaying } from '../support/predictions';
import { CLOSED } from '../support/registration';

// The admin gate (slice 7a, #21): AdminMiddleware for R-26 (amended),
// against the built app.

const baseUrl = inject('baseUrl');
const { db, client } = useTestDatabase();

const PAGES = ['/admin', '/admin/results', '/admin/resultsAll'];

describe('the admin pages (R-26 amended)', () => {
  it.each(PAGES)('a guest opening %s goes home (decision 2)', async (path) => {
    const page = await new Browser(baseUrl).get(path);
    expect(page.status).toBe(307);
    expect(page.headers.get('location')).toBe('/');
  });

  it.each(PAGES)('a player opening %s goes home', async (path) => {
    const browser = await signedInBrowser(db, baseUrl, JONAS_ACCOUNT, 'player');
    const page = await browser.get(path);
    expect(page.status).toBe(307);
    expect(page.headers.get('location')).toBe('/');
  });

  it.each([
    ['results-manager', '/admin'],
    ['superadmin', '/admin/results'],
    ['results-manager', '/admin/resultsAll'],
  ] as const)('a %s opens %s', async (role, path) => {
    const browser = await signedInBrowser(db, baseUrl, JONAS_ACCOUNT, role);
    await savePlaying(db, client, CLOSED);
    const page = await browser.get(path);
    expect(page.status).toBe(200);
  });

  it("the role is read on every request: a manager demoted meanwhile goes home", async () => {
    const browser = await signedInBrowser(
      db,
      baseUrl,
      JONAS_ACCOUNT,
      'results-manager',
    );
    expect((await browser.get('/admin')).status).toBe(200);
    await client.query(
      "update player_settings set role = 'player' where player_id = 1",
    );
    const page = await browser.get('/admin');
    expect(page.status).toBe(307);
  });

  it("\"Visi rezultatai\" lists the open tournament's games, with their names", async () => {
    const browser = await signedInBrowser(db, baseUrl, JONAS_ACCOUNT, 'superadmin');
    await savePlaying(db, client, CLOSED);
    const page = await browser.get('/admin/resultsAll');
    expect(page.status).toBe(200);
    expect(page.html).toContain('Rungtynės');
  });

  it('the shell links an admin to /admin and a player not', async () => {
    const admin = await signedInBrowser(db, baseUrl, JONAS_ACCOUNT, 'superadmin');
    expect((await admin.get('/')).html).toContain('href="/admin"');
    await client.query(
      "update player_settings set role = 'player' where player_id = 1",
    );
    expect((await admin.get('/')).html).not.toContain('href="/admin"');
  });
});
```

(`Browser`'s method names - `get`, `headers`, `html`, `status` - as `tests/support/browser.ts` has them; if its redirect status is followed automatically, use its no-follow option as `routes.test.ts` does.)

- [ ] **Step 7: Run everything web**

```bash
pnpm format
pnpm --filter @sportbet/web exec vitest run --config vitest.component.config.ts
pnpm build && pnpm --filter @sportbet/web exec vitest run --config vitest.feature.config.ts
pnpm typecheck && pnpm lint
```

Expected: PASS, `shell-paths.test.ts` included.

- [ ] **Step 8: Hand to the lead.** Commit message (with Task 5): `feat(web): /admin and the results pages, read-only, behind the gate - "Admin skydelis", "Rezultatai (turas)", "Visi rezultatai" (R-66); the admin link (R-26 amended) (#21)`.

---

### Task 7 (lead): The end of 7a - the whole check and a review pass

- [ ] Run Task 16 Step 1's whole check. Then the architect (`mp-code-review` on the gate's commit `..HEAD`) and the security reviewer on Tasks 1-3, 5 and 6 (the migration's mapping, the gate on every page, the role re-read per request, R-50 reading the role). Fix what they confirm, each fix its own commit. Nothing is pushed.

---

## Part 7b: saving a result

### Task 8 (backend-dev): A result's rules **(sensitive)**

**Files:**
- Create: `packages/domain/src/result/result-form.ts`, `packages/domain/src/result/enter-result.ts` (each + test)
- Modify: `packages/domain/src/index.ts`

- [ ] **Step 1: Write the failing test** `packages/domain/src/result/result-form.test.ts`

```ts
import { describe, expect, it } from 'vitest';
import { score } from '../testing';
import { resultFormEntry } from './result-form';

describe('resultFormEntry (UpdateResultRequest)', () => {
  it('result form: a score, a postponement (R-63) and a clear', () => {
    expect(resultFormEntry({ home: '88', away: '79' })).toEqual({
      ok: true,
      value: { kind: 'score', score: score(88, 79) },
    });
    expect(resultFormEntry({ home: '-1', away: '-1' })).toEqual({
      ok: true,
      value: { kind: 'postpone' },
    });
    expect(resultFormEntry({ home: '', away: '' })).toEqual({
      ok: true,
      value: { kind: 'clear' },
    });
  });

  it("result form: each field's own rule first - a whole number, at most 150 (decision 6)", () => {
    expect(resultFormEntry({ home: 'x', away: '151' })).toEqual({
      ok: false,
      errors: [
        { field: 'home', problem: 'not-a-whole-number' },
        { field: 'away', problem: 'above-maximum' },
      ],
    });
  });

  it('result form: then any negative but -1 : -1, on each such field', () => {
    expect(resultFormEntry({ home: '-1', away: '80' })).toEqual({
      ok: false,
      errors: [{ field: 'home', problem: 'negative' }],
    });
    expect(resultFormEntry({ home: '-2', away: '-1' })).toEqual({
      ok: false,
      errors: [
        { field: 'home', problem: 'negative' },
        { field: 'away', problem: 'negative' },
      ],
    });
  });

  it('result form (R-64): one box empty is "both scores", on the empty one', () => {
    expect(resultFormEntry({ home: '88', away: '' })).toEqual({
      ok: false,
      errors: [{ field: 'away', problem: 'half' }],
    });
  });
});
```

and `packages/domain/src/result/enter-result.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import { MatchPrediction } from '../prediction/match-prediction';
import { ruledRules, sportbetRules } from '../rules/rule-set';
import { tournamentId } from '../shared/ids';
import {
  at,
  gameNo,
  player,
  score,
  scriptedDice,
  testGame,
  unwrap,
} from '../testing';
import {
  enterResult,
  mistakenFillInsRemoved,
  resultFillIns,
} from './enter-result';

const NOW = at('2026-10-15T12:00:00Z');
const T = unwrap(tournamentId('3'));
const STARTED = testGame({ id: 11, tipOff: '2026-10-12T18:00:00Z' });
const FUTURE = testGame({ id: 12, tipOff: '2026-10-20T18:00:00Z' });

describe('enterResult (UpdateResultRequest::after, ResultController::updateResult)', () => {
  it('result: a score on a started game', () => {
    const entered = enterResult({
      game: STARTED,
      entry: { kind: 'score', score: score(88, 79) },
      now: NOW,
      rules: ruledRules,
    });
    expect(entered.ok && entered.value.game.result).toEqual(score(88, 79));
    expect(entered.ok && entered.value.scored).toBe(true);
  });

  it('result: not before tip-off', () => {
    expect(
      enterResult({
        game: FUTURE,
        entry: { kind: 'score', score: score(88, 79) },
        now: NOW,
        rules: ruledRules,
      }),
    ).toEqual({ ok: false, refusal: 'not-started' });
  });

  it('result (R-38): a level score is refused', () => {
    expect(
      enterResult({
        game: STARTED,
        entry: { kind: 'score', score: score(80, 80) },
        now: NOW,
        rules: ruledRules,
      }),
    ).toEqual({ ok: false, refusal: 'level' });
  });

  it('result (R-63): -1 : -1 postpones whatever the clock; a scored game is cleared first (decision 8)', () => {
    const future = enterResult({
      game: FUTURE,
      entry: { kind: 'postpone' },
      now: NOW,
      rules: ruledRules,
    });
    expect(future.ok && future.value.game.postponed).toBe(true);
    const scored = unwrap(STARTED.withResult(score(88, 79)));
    const postponed = enterResult({
      game: scored,
      entry: { kind: 'postpone' },
      now: NOW,
      rules: ruledRules,
    });
    expect(postponed.ok && postponed.value.game.result).toBeNull();
    expect(postponed.ok && postponed.value.game.postponed).toBe(true);
    expect(postponed.ok && postponed.value.corrected).toBe(true);
  });

  it('result (R-63): clearing a postponed game ends the postponement (decision 9)', () => {
    const postponed = unwrap(FUTURE.postpone(NOW, ruledRules));
    const cleared = enterResult({
      game: postponed,
      entry: { kind: 'clear' },
      now: NOW,
      rules: ruledRules,
    });
    expect(cleared.ok && cleared.value.game.postponed).toBe(false);
    expect(cleared.ok && cleared.value.scored).toBe(false);
  });

  it('result: clearing a scored game is a correction', () => {
    const scored = unwrap(STARTED.withResult(score(88, 79)));
    const cleared = enterResult({
      game: scored,
      entry: { kind: 'clear' },
      now: NOW,
      rules: ruledRules,
    });
    expect(cleared.ok && cleared.value.game.result).toBeNull();
    expect(cleared.ok && cleared.value.corrected).toBe(true);
  });
});

describe('resultFillIns (GeneratedPredictions::fillFor, FI-1, R-7, R-32, R-39)', () => {
  const blank = (id: string) =>
    unwrap(
      MatchPrediction.stored({
        player: player(id),
        game: gameNo(11),
        home: null,
        away: null,
        origin: 'real',
        filledInAt: null,
      }),
    );
  const row = (fillIns: number, switchedOff = false, adminHidden = false) => [
    { tournament: T, switchedOff, adminHidden, fillIns },
  ];

  it('fill-ins: a blank row gets one and its count goes up; a switched-off player gets none (R-32); a hidden one does (R-39)', () => {
    const made = resultFillIns({
      game: STARTED,
      tournament: T,
      candidates: [
        { prediction: blank('1'), statuses: row(0) },
        { prediction: blank('2'), statuses: row(20, true) },
        { prediction: blank('3'), statuses: row(3, false, true) },
      ],
      dice: scriptedDice([10, 10, 10, 5, 5, 5, 0, 0, 0, 1, 1, 1]),
      madeAt: NOW,
      rules: ruledRules,
    });
    expect(made.map(({ prediction }) => prediction.player)).toEqual([
      player('1'),
      player('3'),
    ]);
    expect(made[0]?.prediction.home).toBe(85);
    expect(made[0]?.prediction.away).toBe(70);
    expect(made[0]?.statuses).toEqual(row(1));
    expect(made[1]?.statuses).toEqual(row(4, false, true));
  });

  it("fill-ins (R-7): the 20th switches the player off in that tournament", () => {
    const [made] = resultFillIns({
      game: STARTED,
      tournament: T,
      candidates: [{ prediction: blank('1'), statuses: row(19) }],
      dice: scriptedDice([0, 0, 0, 1, 1, 1]),
      madeAt: NOW,
      rules: ruledRules,
    });
    expect(made?.statuses).toEqual(row(20, true));
  });

  it("fill-ins (sportbet): the 5th over a lifetime switches the player off", () => {
    const [made] = resultFillIns({
      game: STARTED,
      tournament: T,
      candidates: [{ prediction: blank('1'), statuses: row(4) }],
      dice: scriptedDice([0, 0, 0, 1, 1, 1]),
      madeAt: NOW,
      rules: sportbetRules,
    });
    expect(made?.statuses).toEqual(row(5, true));
  });
});

describe('mistakenFillInsRemoved (FI-4, R-5)', () => {
  const fillIn = (madeAt: string) =>
    MatchPrediction.fillIn(player('1'), gameNo(11), score(80, 70), 'fill-in', at(madeAt));

  it("correction (ruled): a fill-in made before the tip-off is cleared and uncounted", () => {
    const removed = mistakenFillInsRemoved({
      game: STARTED,
      tournament: T,
      candidates: [
        {
          prediction: fillIn('2026-10-11T00:00:00Z'),
          statuses: [{ tournament: T, switchedOff: true, adminHidden: false, fillIns: 20 }],
        },
      ],
      rules: ruledRules,
    });
    expect(removed[0]?.prediction.hasBlankHomeScore()).toBe(true);
    expect(removed[0]?.statuses).toEqual([
      { tournament: T, switchedOff: false, adminHidden: false, fillIns: 19 },
    ]);
  });

  it('correction (sportbet): every fill-in stays', () => {
    expect(
      mistakenFillInsRemoved({
        game: STARTED,
        tournament: T,
        candidates: [
          {
            prediction: fillIn('2026-10-11T00:00:00Z'),
            statuses: [{ tournament: T, switchedOff: false, adminHidden: false, fillIns: 1 }],
          },
        ],
        rules: sportbetRules,
      }),
    ).toEqual([]);
  });
});
```

(The `testing` entry's `score`, `player`, `gameNo`, `at`, `testGame`, `scriptedDice`, `unwrap` exist - `packages/domain/src/testing.ts`. The scripted rolls give `55+10+10+10 = 85` and `55+5+5+5 = 70`.)

- [ ] **Step 2: Run them to see them fail** - FAIL, modules missing.

- [ ] **Step 3: Write `packages/domain/src/result/result-form.ts`**

```ts
import { Score } from '../score/score';

/** A posted box: `homeTeamScore` or `awayTeamScore`. */
export type ResultField = 'home' | 'away';

/** Why a box was refused, in UpdateResultRequest's order. */
export type ResultFieldProblem =
  | 'not-a-whole-number'
  | 'above-maximum'
  | 'negative'
  | 'half';

export interface ResultFieldError {
  readonly field: ResultField;
  readonly problem: ResultFieldProblem;
}

/** What the admin entered: a score, the postponed placeholder (R-63), or nothing (a clear). */
export type ResultEntry =
  | { readonly kind: 'score'; readonly score: Score }
  | { readonly kind: 'postpone' }
  | { readonly kind: 'clear' };

/** The entry, or every box's refusal (Laravel reports each field). */
export type ResultFormCheck =
  | { readonly ok: true; readonly value: ResultEntry }
  | { readonly ok: false; readonly errors: readonly ResultFieldError[] };

/** sportbet's `max:150`: a column guard, not a sporting one. */
export const RESULT_MAX = 150;

/** Laravel's `integer` (FILTER_VALIDATE_INT): an optional sign, no leading zero. */
const LARAVEL_INTEGER = /^[+-]?(?:0|[1-9]\d*)$/u;

/** One trimmed box: blank, a whole number, or its problem. */
function boxOf(text: string): number | null | ResultFieldProblem {
  if (text === '') return null;
  if (!LARAVEL_INTEGER.test(text)) return 'not-a-whole-number';
  const value = Number(text);
  if (!Number.isSafeInteger(value)) return 'not-a-whole-number';
  return value > RESULT_MAX ? 'above-maximum' : value;
}

/**
 * UpdateResultRequest on the two trimmed boxes: each box's
 * `nullable|integer|max:150` first, every box that fails one error; then
 * after(): -1 : -1 is the postponed placeholder (R-63); any other negative
 * is refused on each negative box; both empty is a clear; one empty is
 * refused on the empty box (R-64; sportbet's server lets it through). The
 * game's own checks (tip-off, level) are enterResult's.
 */
export function resultFormEntry(boxes: {
  readonly home: string;
  readonly away: string;
}): ResultFormCheck {
  const home = boxOf(boxes.home);
  const away = boxOf(boxes.away);
  const typed: ResultFieldError[] = [];
  if (typeof home === 'string') typed.push({ field: 'home', problem: home });
  if (typeof away === 'string') typed.push({ field: 'away', problem: away });
  if (typed.length > 0) return { ok: false, errors: typed };
  if (typeof home === 'string' || typeof away === 'string') {
    throw new Error('resultFormEntry: a refused box was let through');
  }
  if (home === -1 && away === -1) return { ok: true, value: { kind: 'postpone' } };
  const negative: ResultFieldError[] = [];
  if (home !== null && home < 0) negative.push({ field: 'home', problem: 'negative' });
  if (away !== null && away < 0) negative.push({ field: 'away', problem: 'negative' });
  if (negative.length > 0) return { ok: false, errors: negative };
  if (home === null && away === null) return { ok: true, value: { kind: 'clear' } };
  if (home === null || away === null) {
    return {
      ok: false,
      errors: [{ field: home === null ? 'home' : 'away', problem: 'half' }],
    };
  }
  const score = Score.of(home, away);
  if (!score.ok) {
    throw new Error('resultFormEntry: a checked pair is not a score');
  }
  return { ok: true, value: { kind: 'score', score: score.value } };
}
```

- [ ] **Step 4: Write `packages/domain/src/result/enter-result.ts`**

```ts
import {
  afterResultCorrection,
  fillInScore,
  type FillInDice,
} from '../fill-in/fill-in';
import { MatchPrediction } from '../prediction/match-prediction';
import type { TournamentStatusRow } from '../prediction/predict-match';
import { PlayerStatus } from '../player/player-status';
import type { Game } from '../round/game';
import type { RuleSet } from '../rules/rule-set';
import type { TournamentId } from '../shared/ids';
import type { Instant } from '../shared/instant';
import { ok, refuse, type Result } from '../shared/result';
import type { ResultEntry } from './result-form';

/** Why a game's result was refused (UpdateResultRequest::after, R-38). */
export type EnterResultRefusal = 'not-started' | 'level';

export interface EnteredResult {
  /** The game's new state. */
  readonly game: Game;
  /** A result now stands: its blank rows are filled in. */
  readonly scored: boolean;
  /** A result stood before and was replaced or removed: FI-4's correction applies. */
  readonly corrected: boolean;
}

/**
 * ResultController::updateResult on one game, after resultFormEntry:
 * -1 : -1 postpones whatever the clock (R-63, Game.postpone, R-41, R-13),
 * a scored game cleared first (decision 8); a clear always goes through
 * and ends a postponement (decision 9); a score is refused before the
 * game has tipped off ("Rungtynės dar neprasidėjo") and when level (R-38).
 */
export function enterResult(input: {
  readonly game: Game;
  readonly entry: ResultEntry;
  readonly now: Instant;
  readonly rules: RuleSet;
}): Result<EnteredResult, EnterResultRefusal> {
  const { game, entry, now, rules } = input;
  const wasScored = game.result !== null;
  switch (entry.kind) {
    case 'postpone': {
      const postponed = game.withoutResult().postpone(now, rules);
      if (!postponed.ok) {
        throw new Error('enterResult: a cleared game refused postponing');
      }
      return ok({ game: postponed.value, scored: false, corrected: wasScored });
    }
    case 'clear': {
      const cleared = game.withoutResult();
      return ok({
        game: cleared.postponed ? cleared.endPostponement() : cleared,
        scored: false,
        corrected: wasScored,
      });
    }
    case 'score': {
      // A postponed game has tipped off only if R-13 locked it at its tip-off.
      if (!game.hasTippedOffAt(now)) {
        return refuse('not-started');
      }
      const scored = game.withResult(entry.score);
      if (!scored.ok) return refuse('level');
      return ok({ game: scored.value, scored: true, corrected: wasScored });
    }
  }
}

/** One player's blank row of the game and their tournament_players rows (locked). */
export interface FillInCandidateRows {
  readonly prediction: MatchPrediction;
  readonly statuses: readonly TournamentStatusRow[];
}

/** A fill-in made, and the player's rows after it. */
export interface FillInMade {
  readonly prediction: MatchPrediction;
  readonly statuses: readonly TournamentStatusRow[];
}

function statusOf(
  rows: readonly TournamentStatusRow[],
  tournament: TournamentId,
  rules: RuleSet,
): PlayerStatus {
  const status = PlayerStatus.stored(
    {
      switchedOffIn: new Set(
        rows.filter((row) => row.switchedOff).map((row) => row.tournament),
      ),
      adminHidden:
        rows.find((row) => row.tournament === tournament)?.adminHidden ?? false,
      fillIns: new Map(rows.map((row) => [row.tournament, row.fillIns])),
    },
    rules,
  );
  if (!status.ok) {
    throw new Error(`enter-result: a stored status is ${status.refusal}`);
  }
  return status.value;
}

function rowsOf(
  before: readonly TournamentStatusRow[],
  after: PlayerStatus,
  tournament: TournamentId,
  rules: RuleSet,
  countChange: number,
): TournamentStatusRow[] {
  return before.map((row) => ({
    tournament: row.tournament,
    switchedOff: after.isSwitchedOffIn(row.tournament, rules),
    adminHidden: row.adminHidden,
    fillIns:
      rules.switchOff.countedPer === 'tournament'
        ? after.fillInCount(row.tournament, rules)
        : row.tournament === tournament
          ? Math.max(0, row.fillIns + countChange)
          : row.fillIns,
  }));
}

/**
 * GeneratedPredictions::fillFor at a result (FI-1): each candidate whose
 * row of the game is blank and who is not switched off in the tournament
 * (R-32; an admin-hidden player is filled in, R-39) gets a fill-in
 * (fillInScore, FI-2), and the count toward switching them off goes up,
 * switching them off at the rule set's threshold (R-7: 20 in this
 * tournament; sportbet 5 over a lifetime). Candidates in player id order,
 * as the dice are drawn.
 */
export function resultFillIns(input: {
  readonly game: Game;
  readonly tournament: TournamentId;
  readonly candidates: readonly FillInCandidateRows[];
  readonly dice: FillInDice;
  readonly madeAt: Instant;
  readonly rules: RuleSet;
}): FillInMade[] {
  const { game, tournament, candidates, dice, madeAt, rules } = input;
  const made: FillInMade[] = [];
  for (const { prediction, statuses } of candidates) {
    if (prediction.game !== game.id || !prediction.hasBlankHomeScore()) {
      continue;
    }
    const before = statusOf(statuses, tournament, rules);
    if (!before.getsFillInsIn(tournament, rules)) continue;
    const after = before.afterFillIn(tournament, 'fill-in', rules);
    made.push({
      prediction: MatchPrediction.fillIn(
        prediction.player,
        game.id,
        fillInScore(dice),
        'fill-in',
        madeAt,
      ),
      statuses: rowsOf(statuses, after, tournament, rules, 1),
    });
  }
  return made;
}

/**
 * FI-4, R-5 at a correction: under the ruled set, a fill-in of this game
 * made before it had tipped off existed only because of a mistaken result;
 * it is cleared and stops counting, and the player is switched back on if
 * the count falls below the threshold (under R-7 a tournament's switch is
 * its count reaching the threshold, a real save resetting both). sportbet
 * keeps every fill-in: nothing is returned.
 */
export function mistakenFillInsRemoved(input: {
  readonly game: Game;
  readonly tournament: TournamentId;
  readonly candidates: readonly FillInCandidateRows[];
  readonly rules: RuleSet;
}): FillInMade[] {
  const { game, tournament, candidates, rules } = input;
  const removed: FillInMade[] = [];
  for (const { prediction, statuses } of candidates) {
    const [after] = afterResultCorrection([prediction], game, rules);
    if (after === undefined || after === prediction) continue;
    removed.push({
      prediction: after,
      statuses: statuses.map((row) => {
        if (row.tournament !== tournament) return row;
        const fillIns = Math.max(0, row.fillIns - 1);
        return {
          ...row,
          fillIns,
          switchedOff: fillIns >= rules.switchOff.afterFillIns,
        };
      }),
    });
  }
  return removed;
}
```

This needs two small additions elsewhere:
  - `Game.endPostponement()` in `packages/domain/src/round/game.ts` (with a test in `game.test.ts`: postponed false, the lock kept):

```ts
  /** R-63: a postponed game's -1 : -1 cleared - no longer postponed; a lock R-13 gave it stays. */
  endPostponement(): Game {
    return this.with({ postponed: false });
  }
```

  - `afterResultCorrection` returns the same object for a prediction it keeps (it maps `prediction => ... ? prediction.cleared() : prediction`, fill-in.ts:105), so the identity check above is sound; keep that and say so in a comment.

Export from `packages/domain/src/index.ts`:

```ts
export {
  resultFormEntry,
  RESULT_MAX,
  type ResultEntry,
  type ResultField,
  type ResultFieldError,
  type ResultFieldProblem,
  type ResultFormCheck,
} from './result/result-form';
export {
  enterResult,
  mistakenFillInsRemoved,
  resultFillIns,
  type EnteredResult,
  type EnterResultRefusal,
  type FillInCandidateRows,
  type FillInMade,
} from './result/enter-result';
```

and `TournamentStatusRow` if it is not exported yet.

- [ ] **Step 5: Run the domain suite**

```bash
pnpm format
pnpm --filter @sportbet/domain exec vitest run
pnpm --filter @sportbet/domain typecheck
```

Expected: PASS. (A postponed game postponed before its tip-off and then scored is refused `not-started`: it reopens with a new date, R-41; one postponed after its tip-off carries R-13's lock and takes a score.)

- [ ] **Step 6: Hand to the lead.** Commit message: `feat(domain): a result's rules - the boxes in UpdateResultRequest's order, -1 : -1 postpones (R-63), one box empty refused (R-64), not before tip-off, no level (R-38); the fill-ins at a result and each player's count (FI-1, R-7, R-32, R-39); a correction's mistaken fill-ins (FI-4, R-5) (#21)`.

---

### Task 9 (backend-dev): The result in one transaction; the prediction save takes the game row first **(sensitive)**

**Files:**
- Create: `packages/db/src/result/save.ts`, `packages/db/test/result-save.test.ts`, `packages/db/test/result-replay.test.ts`
- Modify: `packages/db/src/prediction/save.ts`, `packages/db/src/player/repository.ts` (lockPlayerStatuses's doc), `packages/db/src/index.ts`, `packages/db/test/prediction-save.test.ts`

- [ ] **Step 1: Write the failing test** `packages/db/test/result-save.test.ts`

```ts
import { Game, ruledRules, sportbetRules } from '@sportbet/domain';
import {
  at,
  gameNo,
  roundNo,
  scriptedDice,
  unwrap,
} from '@sportbet/domain/testing';
import { beforeEach, describe, expect, it } from 'vitest';
import { z } from 'zod';
import { saveResult } from '../src';
import { saveGames } from '../src/season/repository';
import { useTestDatabase } from '../src/testing';
import {
  ADA,
  BEN,
  CAI,
  FEN,
  G10_OPEN,
  G7,
  G8,
  G9,
  savePlaying,
  saveWorld,
  TOURNAMENT,
  ZAL,
} from './world';

const { db, client } = useTestDatabase();
const NOW = at('2026-10-15T12:00:00Z');

/** Game 11: round 1, FEN at home to ZAL, tipped off 2026-10-12, no result. */
const G11 = unwrap(
  Game.stored({
    id: gameNo(11),
    round: roundNo(1),
    home: FEN,
    away: ZAL,
    tipOff: at('2026-10-12T18:00:00Z'),
    result: null,
    recordedWinner: null,
    lockedSince: null,
    postponed: false,
  }),
);

beforeEach(async () => {
  await saveWorld(db);
  await saveGames(db, TOURNAMENT, [G7, G8, G9, G10_OPEN, G11]);
  await savePlaying(db, TOURNAMENT, ADA, BEN, CAI);
  // ADA predicted game 11; BEN's row is blank; CAI is switched off (R-32).
  await client.query(
    "insert into match_predictions (player_id, game_id, home, away, origin) values (1, 11, 88, 79, 'real'), (2, 11, null, null, 'real'), (3, 11, null, null, 'real')",
  );
  await client.query(
    'update tournament_players set switched_off = true, fill_ins = 20 where player_id = 3',
  );
});

const atNow = () => Promise.resolve(NOW);
const NO_DICE = scriptedDice([]);

const enter = (
  game: number,
  home: string,
  away: string,
  rules = ruledRules,
  dice = scriptedDice([10, 10, 10, 5, 5, 5]),
) =>
  saveResult(
    db,
    { game: gameNo(game), boxes: { home, away }, now: NOW, rules, dice },
    atNow,
  );

const gameRow = async (game: number) =>
  z
    .array(
      z.object({
        home_score: z.int().nullable(),
        away_score: z.int().nullable(),
        postponed: z.boolean(),
      }),
    )
    .parse(
      (
        await client.query(
          'select home_score, away_score, postponed from games where id = $1',
          [game],
        )
      ).rows,
    )[0];

const rowOf = async (player: number, game: number) =>
  z
    .array(
      z.object({
        home: z.int().nullable(),
        away: z.int().nullable(),
        origin: z.string(),
      }),
    )
    .parse(
      (
        await client.query(
          'select home, away, origin from match_predictions where player_id = $1 and game_id = $2',
          [player, game],
        )
      ).rows,
    )[0];

const pointsOf = async (game: number) =>
  z
    .array(z.object({ player_id: z.int(), source: z.string() }))
    .parse(
      (
        await client.query(
          'select player_id, source::text as source from match_points where game_id = $1 order by player_id',
          [game],
        )
      ).rows,
    );

const countOf = async (player: number) =>
  z
    .array(z.object({ fill_ins: z.int(), switched_off: z.boolean() }))
    .parse(
      (
        await client.query(
          'select fill_ins, switched_off from tournament_players where player_id = $1 and tournament_id = $2',
          [player, TOURNAMENT.id],
        )
      ).rows,
    )[0];

describe('saveResult (ResultController::updateResult)', () => {
  it('result: a score writes the game, fills in the blank row of a player not switched off (FI-1, R-32), counts it (R-7), and scores the game under ruledRules', async () => {
    expect(await enter(11, '85', '80')).toEqual({ ok: true, value: null });
    expect(await gameRow(11)).toEqual({
      home_score: 85,
      away_score: 80,
      postponed: false,
    });
    expect(await rowOf(2, 11)).toEqual({ home: 85, away: 70, origin: 'fill-in' });
    expect(await rowOf(3, 11)).toEqual({ home: null, away: null, origin: 'real' });
    expect(await countOf(2)).toEqual({ fill_ins: 1, switched_off: false });
    expect(await pointsOf(11)).toEqual([
      { player_id: 1, source: 'ruled' },
      { player_id: 2, source: 'ruled' },
    ]);
  });

  it("result: the boxes' refusals, in UpdateResultRequest's order, write nothing", async () => {
    expect(await enter(11, '88', '')).toEqual({
      ok: false,
      refusal: { kind: 'fields', errors: [{ field: 'away', problem: 'half' }] },
    });
    expect(await enter(11, '-3', '80')).toEqual({
      ok: false,
      refusal: { kind: 'fields', errors: [{ field: 'home', problem: 'negative' }] },
    });
    expect(await enter(10, '85', '80', ruledRules, NO_DICE)).toEqual({
      ok: false,
      refusal: { kind: 'not-started' },
    });
    expect(await enter(11, '80', '80', ruledRules, NO_DICE)).toEqual({
      ok: false,
      refusal: { kind: 'level' },
    });
    expect(await enter(99, '85', '80', ruledRules, NO_DICE)).toEqual({
      ok: false,
      refusal: { kind: 'no-game' },
    });
    expect(await gameRow(11)).toEqual({
      home_score: null,
      away_score: null,
      postponed: false,
    });
    expect(await pointsOf(11)).toEqual([]);
  });

  it('result (R-63): -1 : -1 postpones the game and nothing is scored; emptying the boxes undoes it', async () => {
    expect(await enter(10, '-1', '-1', ruledRules, NO_DICE)).toEqual({
      ok: true,
      value: null,
    });
    expect(await gameRow(10)).toMatchObject({ postponed: true });
    expect(await enter(10, '', '', ruledRules, NO_DICE)).toEqual({
      ok: true,
      value: null,
    });
    expect(await gameRow(10)).toMatchObject({ postponed: false });
  });

  it('result: clearing a scored game removes its points and keeps its fill-ins (sportbet, issue 268)', async () => {
    await enter(11, '85', '80');
    expect(await enter(11, '', '', ruledRules, NO_DICE)).toEqual({
      ok: true,
      value: null,
    });
    expect(await gameRow(11)).toMatchObject({ home_score: null });
    expect(await pointsOf(11)).toEqual([]);
    expect(await rowOf(2, 11)).toMatchObject({ origin: 'fill-in' });
  });

  it('result (R-22): a finished tournament is refused and nothing written (decision 7)', async () => {
    await client.query(
      "update tournaments set ends_on = '2026-10-13' where id = $1",
      [TOURNAMENT.id],
    );
    await client.query(
      'update games set home_score = 70, away_score = 75, postponed = false, locked_since = null where id in (9, 10)',
    );
    await enter(11, '85', '80', sportbetRules);
    expect(await enter(11, '86', '80', ruledRules, NO_DICE)).toEqual({
      ok: false,
      refusal: { kind: 'frozen' },
    });
  });
});
```

(Game 10 in this world is `G10_OPEN`, tipping off 2026-10-20: a score there is "not started". The finished case sets the end date before NOW, scores the others and game 11 under the sportbet set, which does not freeze, then finds the ruled correction frozen.)

- [ ] **Step 2: Run it to see it fail** - FAIL, `saveResult` is not exported.

- [ ] **Step 3: Write `packages/db/src/result/save.ts`**

```ts
import {
  enterResult,
  mistakenFillInsRemoved,
  resultFillIns,
  resultFormEntry,
  tournamentId,
  type FillInCandidateRows,
  type FillInDice,
  type FillInMade,
  type GameId,
  type Instant,
  type Result,
  type ResultFieldError,
  type RuleSet,
  ok,
  refuse,
} from '@sportbet/domain';
import { and, asc, eq } from 'drizzle-orm';
import { z } from 'zod';
import type { Executor } from '../client';
import { keyOf, stored } from '../edge';
import { lockPlayerStatuses } from '../player/repository';
import { tournamentPlayers } from '../player/schema';
import { predictionColumns, storedPredictions } from '../prediction/repository';
import { matchPredictions } from '../prediction/schema';
import { databaseClock, type DatabaseClock } from '../prediction/save';
import { recalculateUnderRuleSet } from '../recalculation/repository';
import { loadSeason, saveGames } from '../season/repository';
import { games } from '../season/schema';
import { findTournamentById } from '../tournament/repository';

/** One result as posted: the game, and the two boxes as typed (trimmed). */
export interface ResultSave {
  readonly game: GameId;
  readonly boxes: { readonly home: string; readonly away: string };
  readonly now: Instant;
  readonly rules: RuleSet;
  readonly dice: FillInDice;
}

/** Why a result was not saved. */
export type ResultSaveRefusal =
  | { readonly kind: 'fields'; readonly errors: readonly ResultFieldError[] }
  | { readonly kind: 'no-game' }
  | { readonly kind: 'not-started' }
  | { readonly kind: 'level' }
  | { readonly kind: 'frozen' };

const gameRows = z.array(z.object({ tournament: z.int() }));

/**
 * ResultController::updateResult in one transaction. The posted boxes
 * first (resultFormEntry, no database read); then the game row, locked
 * FOR UPDATE for the rest of the transaction (#20's F1: a prediction save
 * takes it FOR SHARE and waits, then finds the game closed); judged at the
 * later of `now` and the database's time once the lock is held. A finished
 * tournament is refused (R-22, decision 7). Then:
 * - the game's new state (enterResult) written;
 * - on a correction, FI-4's mistaken fill-ins removed (R-5);
 * - on a score, the blank rows filled in (FI-1, R-32, R-39) and counted
 *   (R-7), each player's status rows locked through lockPlayerStatuses,
 *   players in id order;
 * - the tournament recalculated under `rules` (recalculateUnderRuleSet),
 *   whose refusal is an inconsistent database: it throws, all rolled back.
 *
 * Lock order: the game row, the game's match_predictions rows (FOR
 * UPDATE, by player), each player's tournament_players rows.
 */
export async function saveResult(
  db: Executor,
  save: ResultSave,
  clock: DatabaseClock = databaseClock,
): Promise<Result<null, ResultSaveRefusal>> {
  const { game: id, boxes, now, rules, dice } = save;
  const form = resultFormEntry(boxes);
  if (!form.ok) return refuse({ kind: 'fields', errors: form.errors });
  return db.transaction(
    async (tx): Promise<Result<null, ResultSaveRefusal>> => {
      const [locked] = gameRows.parse(
        await tx
          .select({ tournament: games.tournamentId })
          .from(games)
          .where(eq(games.id, id))
          .for('update'),
      );
      if (locked === undefined) return refuse({ kind: 'no-game' });
      const tournament = await findTournamentById(tx, locked.tournament);
      if (tournament === undefined) {
        throw new Error(`saveResult: tournament ${String(locked.tournament)} is not stored`);
      }
      const season = await loadSeason(tx, tournament);
      const game = season.game(id);
      if (game === undefined) {
        throw new Error(`saveResult: game ${String(id)} is not in its season`);
      }
      const lockedAt = await clock(tx);
      const judgedAt = lockedAt > now ? lockedAt : now;
      if (!season.mayRecalculateAt(judgedAt, rules)) {
        return refuse({ kind: 'frozen' });
      }
      const entered = enterResult({ game, entry: form.value, now: judgedAt, rules });
      if (!entered.ok) return refuse({ kind: entered.refusal });
      await saveGames(tx, tournament, [entered.value.game]);
      const key = stored(
        tournamentId(String(tournament.id)),
        'tournaments',
        tournament.id,
      );
      const candidates = await candidatesOf(tx, id);
      if (entered.value.corrected) {
        await writeMade(
          tx,
          mistakenFillInsRemoved({ game: entered.value.game, tournament: key, candidates, rules }),
        );
      }
      if (entered.value.scored) {
        await writeMade(
          tx,
          resultFillIns({
            game: entered.value.game,
            tournament: key,
            candidates: await candidatesOf(tx, id),
            dice,
            madeAt: judgedAt,
            rules,
          }),
        );
      }
      const refusal = await recalculateUnderRuleSet(tx, tournament, rules);
      if (refusal !== null) {
        throw new Error(
          `saveResult: tournament ${String(tournament.id)} could not be recalculated (${refusal})`,
        );
      }
      return ok(null);
    },
  );
}

/**
 * The game's prediction rows, locked FOR UPDATE by player, each with the
 * player's tournament_players rows locked through lockPlayerStatuses -
 * players in id order, so two result writes lock them alike.
 */
async function candidatesOf(
  tx: Executor,
  game: GameId,
): Promise<FillInCandidateRows[]> {
  const predictions = storedPredictions(
    await tx
      .select(predictionColumns)
      .from(matchPredictions)
      .where(eq(matchPredictions.gameId, game))
      .orderBy(asc(matchPredictions.playerId))
      .for('update'),
  );
  const candidates: FillInCandidateRows[] = [];
  for (const prediction of predictions) {
    candidates.push({
      prediction,
      statuses: await lockPlayerStatuses(tx, prediction.player),
    });
  }
  return candidates;
}

/** Writes each changed row and its player's status rows. */
async function writeMade(tx: Executor, made: readonly FillInMade[]): Promise<void> {
  for (const { prediction, statuses } of made) {
    const playerKey = keyOf(prediction.player, 'player');
    await tx
      .update(matchPredictions)
      .set({
        home: prediction.home,
        away: prediction.away,
        origin: prediction.origin,
        filledInAt:
          prediction.filledInAt === null ? null : new Date(prediction.filledInAt),
      })
      .where(
        and(
          eq(matchPredictions.playerId, playerKey),
          eq(matchPredictions.gameId, prediction.game),
        ),
      );
    for (const row of statuses) {
      await tx
        .update(tournamentPlayers)
        .set({
          switchedOff: row.switchedOff,
          adminHidden: row.adminHidden,
          fillIns: row.fillIns,
        })
        .where(
          and(
            eq(tournamentPlayers.playerId, playerKey),
            eq(tournamentPlayers.tournamentId, Number(row.tournament)),
          ),
        );
    }
  }
}
```

Export from `packages/db/src/index.ts`:

```ts
export {
  saveResult,
  type ResultSave,
  type ResultSaveRefusal,
} from './result/save';
```

- [ ] **Step 4: F1 - the prediction save takes the game row first.** In `packages/db/src/prediction/save.ts`, at the top of the transaction, before the `match_predictions` select:

```ts
      // #20's F1: the game row first, shared - a result write holds it FOR
      // UPDATE, so a save that meets one waits, then finds the game closed.
      await tx
        .select({ id: games.id })
        .from(games)
        .where(eq(games.id, rowGame))
        .for('share');
```

and the doc's lock-order paragraph becomes: "Lock order: the game row (FOR SHARE), the player's match_predictions row, then their tournament_players rows through lockPlayerStatuses (by tournament id)." Update `lockPlayerStatuses`'s doc in `packages/db/src/player/repository.ts` the same way: "the game row first (a result write FOR UPDATE, a prediction save FOR SHARE), then the player's match_predictions row, then these; saveResult locks several players' rows in player id order".

Add to `packages/db/test/prediction-save.test.ts`'s concurrency block:

```ts
  it("save (F1): a save waiting for a result write's game lock is then refused as closed", async () => {
    const holder = await client.connect();
    try {
      await holder.query('begin');
      await holder.query('select 1 from games where id = 10 for update');
      const pending = save(10, 88, 79);
      await sleep(500);
      await holder.query(
        'update games set home_score = 85, away_score = 80 where id = 10',
      );
      await holder.query('commit');
      expect(await pending).toEqual({ ok: false, refusal: 'closed' });
    } finally {
      holder.release();
    }
    expect(await rowOf(1, 10)).toEqual({ home: null, away: null, origin: 'real' });
  });
```

(Before the fix this save takes the prediction row and is judged on the unscored game it read: accepted. The `save` helper's fixed clock is NOW, before game 10's tip-off, so only the result can close it.)

- [ ] **Step 5: The replay against the golden scenario** (design decision 12): `packages/db/test/result-replay.test.ts`. Copy `golden.test.ts`'s `IDS`, `GOLDEN_EL`, `productionRows` and `saveGolden` (lines 46-125) into the new file, then:

```ts
describe('the result write path against the golden scenario', () => {
  it("replay (ruled): entering the golden results one by one through saveResult reproduces GOLDEN_POINTS_RULED", async () => {
    // Every game unscored, then each result entered as an admin would, in
    // tip-off order, three hours after its tip-off. The scenario holds no
    // blank row, so no fill-in is made: the dice must never be rolled.
    const inputs = goldenInputs({}, IDS);
    await saveGames(
      db,
      GOLDEN_EL,
      inputs.season.games.map((game) => game.withoutResult()),
    );
    for (const spec of GOLDEN.games) {
      const result = await saveResult(
        db,
        {
          game: IDS.game(spec.id),
          boxes: { home: String(spec.result[0]), away: String(spec.result[1]) },
          now: at(spec.tipOff) + 3 * 3600 * 1000,
          rules: ruledRules,
          dice: scriptedDice([]),
        },
        () => Promise.resolve(at('2026-06-01T00:00:00Z')),
      );
      expect(result).toEqual({ ok: true, value: null });
    }
    expect(
      snapshotOf(await loadTournamentPoints(db, GOLDEN_EL, 'ruled'), IDS),
    ).toEqual(GOLDEN_POINTS_RULED);
  });
});
```

(The clock answers a moment before every tip-off so the judged time is the `now` given. If `at()` returns a branded `Instant`, build `now` with `at(new Date(Date.parse(spec.tipOff) + 3 * 3600 * 1000).toISOString().replace('.000Z', 'Z'))`. If `saveGolden`'s player statuses or survival history make the ruled snapshot differ only by the survival rows' provisional flag at intermediate results, that is not a final difference: compare after the last result only, as written.)

- [ ] **Step 6: Run the db suite**

```bash
pnpm format
pnpm --filter @sportbet/db exec vitest run
pnpm --filter @sportbet/db typecheck
```

Expected: PASS, the F1 case included (it fails without Step 4: check by removing the `for('share')` select once, then restoring it).

- [ ] **Step 7: Hand to the lead.** Commit message: `feat(db): a result saved in one transaction - the game row FOR UPDATE, fill-ins counted (FI-1, R-7, R-32, R-39), a correction's mistaken fill-ins removed (FI-4, R-5), the tournament recalculated unless frozen (R-22); a prediction save takes the game row FOR SHARE first (#20's F1); the golden results replayed (#21)`.

---

### Task 10 (web-dev): `POST /admin/updateResult` and the results autosave **(sensitive)**

**Files:**
- Create: `apps/web/src/server/results/texts.ts`, `apps/web/src/server/results/save-result.ts` (+ test), `apps/web/src/components/admin/result-protocol.ts` (+ test), `apps/web/src/app/admin/updateResult/route.ts`, `apps/web/tests/feature/result-save.test.ts`
- Modify: `apps/web/src/components/admin/result-row.tsx` (+ test), `apps/web/src/components/predictions/score-autosave.tsx`

- [ ] **Step 1: The texts** `apps/web/src/server/results/texts.ts`

```ts
import type { ResultFieldProblem } from '@sportbet/domain';

/**
 * The result save's texts: UpdateResultRequest's (lang/lt.json), and
 * three this app adds where sportbet answers in Laravel's English or has
 * no case (design decision 6, owner to confirm).
 */
export const RESULT_TEXTS = {
  field: {
    'not-a-whole-number': 'Įveskite sveiką skaičių.',
    'above-maximum': 'Rezultatas negali būti didesnis nei 150.',
    negative:
      'Rezultatas negali būti neigiamas. Atidėtoms rungtynėms įveskite -1 : -1.',
    half: 'Įveskite abu rezultatus.',
  } satisfies Readonly<Record<ResultFieldProblem, string>>,
  notStarted: 'Rungtynės dar neprasidėjo - rezultato įvesti negalima.',
  level: 'Lygiosios negalimos - komandų rezultatai turi skirtis.',
  frozen: 'Turnyras baigtas - rezultatų keisti negalima.',
} as const;

/** The page's text for a failure that is not an answer (a lost connection): lang/lt.json's. */
export const NOT_SAVED = 'Neišsaugota';
```

- [ ] **Step 2: The wire format** `apps/web/src/components/admin/result-protocol.ts`

```ts
import { z } from 'zod';

// POST /admin/updateResult's wire format, written once: the route builds
// its answers from these and the results page posts and parses with them.

/** sportbet's field names (results.blade.php's saveResult). */
export const RESULT_FIELDS = {
  game: 'gameID',
  home: 'homeTeamScore',
  away: 'awayTeamScore',
} as const;

export function resultRequestBody(request: {
  readonly game: number;
  readonly home: string;
  readonly away: string;
}): URLSearchParams {
  return new URLSearchParams({
    [RESULT_FIELDS.game]: String(request.game),
    [RESULT_FIELDS.home]: request.home,
    [RESULT_FIELDS.away]: request.away,
  });
}

/** 200: sportbet's `{success: true}`. */
export const resultSavedSchema = z.object({ success: z.literal(true) });

/** 422: Laravel's `{message, errors}` - the boxes' messages, and `message` the first (design decision 11). */
export const resultErrorsSchema = z.object({
  message: z.string(),
  errors: z.partialRecord(
    z.enum([RESULT_FIELDS.home, RESULT_FIELDS.away, RESULT_FIELDS.game]),
    z.array(z.string()),
  ),
});

export type ResultErrors = z.infer<typeof resultErrorsSchema>;

/** Every answer besides a non-admin's 303 and a cross-site 403. */
export type ResultAnswer =
  | { readonly status: 200; readonly body: { readonly success: true } }
  | { readonly status: 422; readonly body: ResultErrors };

/** What the row shows after a save: saved, or the server's message. */
export type ResultOutcome =
  | { readonly kind: 'saved' }
  | { readonly kind: 'refused'; readonly message: string };

/** The answer as the page shows it; anything else (a lost connection, a 500) is `notSaved`. */
export function readResultAnswer(
  status: number,
  body: unknown,
  notSaved: string,
): ResultOutcome {
  if (status === 200 && resultSavedSchema.safeParse(body).success) {
    return { kind: 'saved' };
  }
  if (status === 422) {
    const errors = resultErrorsSchema.safeParse(body);
    if (errors.success) return { kind: 'refused', message: errors.data.message };
  }
  return { kind: 'refused', message: notSaved };
}
```

with `result-protocol.test.ts` covering: the body's three names; a 200 is saved; a 422's `message` is the refusal; a 500 and a body of another shape are `notSaved`.

- [ ] **Step 3: Write the failing use-case test** `apps/web/src/server/results/save-result.test.ts`

```ts
import { describe, expect, it } from 'vitest';
import { answerOf } from './save-result';

describe("the result save's answers", () => {
  it('answer: saved is 200 {success: true}', () => {
    expect(answerOf({ ok: true, value: null })).toEqual({
      status: 200,
      body: { success: true },
    });
  });

  it("answer: the boxes' errors are Laravel's 422, message the first", () => {
    expect(
      answerOf({
        ok: false,
        refusal: {
          kind: 'fields',
          errors: [
            { field: 'home', problem: 'negative' },
            { field: 'away', problem: 'negative' },
          ],
        },
      }),
    ).toEqual({
      status: 422,
      body: {
        message:
          'Rezultatas negali būti neigiamas. Atidėtoms rungtynėms įveskite -1 : -1. (and 1 more error)',
        errors: {
          homeTeamScore: [
            'Rezultatas negali būti neigiamas. Atidėtoms rungtynėms įveskite -1 : -1.',
          ],
          awayTeamScore: [
            'Rezultatas negali būti neigiamas. Atidėtoms rungtynėms įveskite -1 : -1.',
          ],
        },
      },
    });
  });

  it.each([
    ['not-started', 'Rungtynės dar neprasidėjo - rezultato įvesti negalima.'],
    ['level', 'Lygiosios negalimos - komandų rezultatai turi skirtis.'],
    ['frozen', 'Turnyras baigtas - rezultatų keisti negalima.'],
  ] as const)('answer: %s is a 422 on the home box', (kind, text) => {
    expect(answerOf({ ok: false, refusal: { kind } })).toEqual({
      status: 422,
      body: { message: text, errors: { homeTeamScore: [text] } },
    });
  });
});
```

(Laravel's `message` for several errors is the first error plus " (and N more error(s))", as slice 6's `validationAnswer` writes it; reuse that function's wording if it exists, else write it here. `no-game` is answered 404, as sportbet's `findOrFail`, by the route, not here.)

- [ ] **Step 4: Run it to see it fail** - FAIL, module missing.

- [ ] **Step 5: Write `apps/web/src/server/results/save-result.ts`**

```ts
import type { ResultSaveRefusal } from '@sportbet/db';
import type { Result, ResultField } from '@sportbet/domain';
import {
  RESULT_FIELDS,
  type ResultAnswer,
} from '../../components/admin/result-protocol';
import { RESULT_TEXTS } from './texts';

const FIELD_NAME: Readonly<Record<ResultField, 'homeTeamScore' | 'awayTeamScore'>> = {
  home: RESULT_FIELDS.home,
  away: RESULT_FIELDS.away,
};

/** Laravel's summary: the first message, and how many more. */
function summary(messages: readonly string[]): string {
  const [first = ''] = messages;
  const more = messages.length - 1;
  if (more === 0) return first;
  return `${first} (and ${String(more)} more error${more === 1 ? '' : 's'})`;
}

/**
 * saveResult's outcome as POST /admin/updateResult answers it: sportbet's
 * 200 `{success: true}`, or Laravel's 422 with each box's message (the
 * game's own refusals on the home box, as UpdateResultRequest adds them).
 * `no-game` is the route's 404.
 */
export function answerOf(
  saved: Result<null, Exclude<ResultSaveRefusal, { kind: 'no-game' }>>,
): ResultAnswer {
  if (saved.ok) return { status: 200, body: { success: true } };
  const refusal = saved.refusal;
  if (refusal.kind === 'fields') {
    const errors: Partial<Record<'homeTeamScore' | 'awayTeamScore', string[]>> = {};
    for (const { field, problem } of refusal.errors) {
      const name = FIELD_NAME[field];
      errors[name] = [...(errors[name] ?? []), RESULT_TEXTS.field[problem]];
    }
    return {
      status: 422,
      body: {
        message: summary(
          refusal.errors.map(({ problem }) => RESULT_TEXTS.field[problem]),
        ),
        errors,
      },
    };
  }
  const text =
    refusal.kind === 'not-started'
      ? RESULT_TEXTS.notStarted
      : refusal.kind === 'level'
        ? RESULT_TEXTS.level
        : RESULT_TEXTS.frozen;
  return { status: 422, body: { message: text, errors: { homeTeamScore: [text] } } };
}
```

(`Result` is the domain's type.)

- [ ] **Step 6: The route** `apps/web/src/app/admin/updateResult/route.ts`

```ts
import { saveResult } from '@sportbet/db';
import { gameIdFromText, ruledRules } from '@sportbet/domain';
import { NextResponse } from 'next/server';
import { RESULT_FIELDS } from '../../../components/admin/result-protocol';
import { resultsManager } from '../../../server/admin/gate';
import { now } from '../../../server/clock';
import { getDb } from '../../../server/db';
import { cryptoDice } from '../../../server/dice';
import { formText } from '../../../server/request/form';
import {
  notFound,
  refuseCrossSite,
  seeOther,
} from '../../../server/request/route-responses';
import { answerOf } from '../../../server/results/save-result';

/**
 * ResultController::updateResult behind AdminMiddleware (R-26 amended):
 * from this site only (#16), for a results manager or superadmin, else
 * home (decision 2). An unreadable or unknown gameID is a 404, as
 * sportbet's findOrFail. The result is saved in one transaction
 * (saveResult) under the live rule set, its fill-ins drawn with
 * node:crypto (cryptoDice).
 */
export async function POST(request: Request): Promise<Response> {
  const crossSite = refuseCrossSite(request);
  if (crossSite !== null) return crossSite;
  if ((await resultsManager()) === null) return seeOther('/');
  const form = await request.formData();
  const game = gameIdFromText(formText(form, RESULT_FIELDS.game));
  if (!game.ok) return notFound();
  const saved = await saveResult(getDb(), {
    game: game.value,
    boxes: {
      home: formText(form, RESULT_FIELDS.home),
      away: formText(form, RESULT_FIELDS.away),
    },
    now: now(),
    rules: ruledRules,
    dice: cryptoDice,
  });
  if (!saved.ok && saved.refusal.kind === 'no-game') return notFound();
  const answer = answerOf(
    saved.ok ? saved : { ok: false, refusal: saved.refusal },
  );
  return NextResponse.json(answer.body, { status: answer.status });
}
```

(`formText` - the trimmed field, `''` when missing - as slice 5/6 named it; if it lives elsewhere, import it from there. The `answerOf` call narrows `no-game` away; if TypeScript does not narrow through the ternary, use an `if (!saved.ok)` branch that switches on `saved.refusal.kind`.)

- [ ] **Step 7: The autosave in the row.** In `apps/web/src/components/predictions/score-autosave.tsx`, add `'partial'` to `Mark` and to `MARK` (`partial: 'border-warn text-text'`: `.pred-score--partial`), and export `Mark`, `ScoreBox` and `SaveMessage` as they are. Rewrite `apps/web/src/components/admin/result-row.tsx` as a client component:

```tsx
'use client';

import type { ResultsPageGame } from '@sportbet/db';
import { useState } from 'react';
import { dayHeader, vilniusClock } from '../format/vilnius-time';
import { TeamCrest } from '../hub/team-crest';
import { ScoreBox, SaveMessage, type Mark } from '../predictions/score-autosave';
import { UPDATE_RESULT_PATH } from '../shell/shell-paths';
import { readResultAnswer, resultRequestBody } from './result-protocol';

/** The page's text for a failure that is not an answer (lang/lt.json's "Neišsaugota"). */
const NOT_SAVED = 'Neišsaugota';

/** The boxes' values: a result's sides, a postponed game's -1 : -1 (R-63), or empty. */
export function boxesOf(game: ResultsPageGame): { home: string; away: string } {
  if (game.result !== null) {
    return { home: String(game.result.home), away: String(game.result.away) };
  }
  return game.postponed ? { home: '-1', away: '-1' } : { home: '', away: '' };
}

/**
 * .admin-result-row and results.blade.php's saveResult: one game's boxes
 * posted when both are filled or both empty - one alone is never posted
 * and marked yellow ("partial"); a save marks them green, a clear grey, a
 * refusal red with the server's message (design decision 11; sportbet's
 * page shows only the red).
 */
export function ResultRow({ game }: { game: ResultsPageGame }) {
  const initial = boxesOf(game);
  const [home, setHome] = useState(initial.home);
  const [away, setAway] = useState(initial.away);
  const [mark, setMark] = useState<Mark>(game.result !== null ? 'saved' : 'none');
  const [message, setMessage] = useState<string | null>(null);
  const [postponed, setPostponed] = useState(game.postponed);
  const label = `${game.home} - ${game.away}`;

  const changed = (nextHome: string, nextAway: string) => {
    setHome(nextHome);
    setAway(nextAway);
    setMessage(null);
    const pair = [nextHome.trim(), nextAway.trim()] as const;
    const both = pair[0] !== '' && pair[1] !== '';
    const neither = pair[0] === '' && pair[1] === '';
    if (!both && !neither) {
      setMark('partial');
      return;
    }
    void fetch(UPDATE_RESULT_PATH, {
      method: 'POST',
      body: resultRequestBody({ game: game.game, home: pair[0], away: pair[1] }),
    })
      .then(async (response) =>
        readResultAnswer(response.status, await response.json().catch(() => null), NOT_SAVED),
      )
      .catch(() => ({ kind: 'refused', message: NOT_SAVED }) as const)
      .then((outcome) => {
        if (outcome.kind === 'refused') {
          setMark('error');
          setMessage(outcome.message);
          return;
        }
        setMark(both ? 'saved' : 'cleared');
        setPostponed(pair[0] === '-1' && pair[1] === '-1');
      });
  };

  return (
    <div className="grid grid-cols-[1fr_auto_1fr] items-center gap-1.5 py-[7px] [&+&]:border-t [&+&]:border-border">
      <div className="flex min-w-0 items-center justify-end gap-1.5">
        <TeamCrest team={game.home} size="row" />
        <span className="truncate font-semibold">{game.home}</span>
      </div>
      <div className="flex flex-col items-center gap-0.5">
        <span className="text-[0.72rem] text-muted">
          {`${dayHeader(game.tipOff)} · ${vilniusClock(game.tipOff)}`}
        </span>
        <div className="flex items-center gap-1">
          <ScoreBox
            label={`${label}: namų komanda`}
            value={home}
            mark={mark}
            locked={!game.open}
            onType={(value) => {
              changed(value, away);
            }}
          />
          <span>:</span>
          <ScoreBox
            label={`${label}: svečių komanda`}
            value={away}
            mark={mark}
            locked={!game.open}
            onType={(value) => {
              changed(home, value);
            }}
          />
        </div>
        {postponed ? (
          <span className="text-[0.72rem] font-semibold text-warn">Atidėta</span>
        ) : null}
        <SaveMessage message={message} />
      </div>
      <div className="flex min-w-0 items-center gap-1.5">
        <span className="truncate font-semibold">{game.away}</span>
        <TeamCrest team={game.away} size="row" />
      </div>
    </div>
  );
}
```

(The lead's decision: a result posts as sportbet's page does, on `change` - when the box is left or Enter is pressed - never on every keystroke. Each accepted result runs fill-ins and a whole recalculation, so a half-typed "8" of "88" must never be saved. Reuse `ScoreBox`'s look; give the autosave hook a `saveOn: 'change'` mode or a results-only hook, and test that typing "8","8" posts once, on blur.) `result-row.test.tsx` (fetch mocked as `prediction-editor.test.tsx` mocks it) covers: one box filled is yellow and nothing is posted; both filled posts `gameID`, `homeTeamScore`, `awayTeamScore` and marks green; a 422 shows its message in red; `-1`/`-1` saved shows "Atidėta"; a disabled row's boxes are disabled. `results-view.test.tsx`'s value checks keep passing (the boxes are `ScoreBox`es now: query by their labels).

- [ ] **Step 8: The feature test** `apps/web/tests/feature/result-save.test.ts`

```ts
import { useTestDatabase } from '@sportbet/db/testing';
import { describe, expect, inject, it } from 'vitest';
import { z } from 'zod';
import { JONAS_ACCOUNT } from '../support/accounts';
import type { Page } from '../support/browser';
import { signedInBrowser } from '../support/hub';
import { gamesOf, savePlaying } from '../support/predictions';
import { CLOSED, SOONER } from '../support/registration';

// POST /admin/updateResult (slice 7b, #21): ResultController::updateResult
// behind UpdateResultRequest and AdminMiddleware, against the built app.

const baseUrl = inject('baseUrl');
const { db, client } = useTestDatabase();

const PATH = '/admin/updateResult';
const [STARTED] = gamesOf(CLOSED);
const [FUTURE] = gamesOf(SOONER);

const boxes = (game: number, home: string, away: string) => {
  const body = new FormData();
  body.set('gameID', String(game));
  body.set('homeTeamScore', home);
  body.set('awayTeamScore', away);
  return body;
};

const json = (page: Page): unknown => JSON.parse(page.html);

const scoreOf = async (game: number) =>
  z
    .array(z.object({ home_score: z.int().nullable(), postponed: z.boolean() }))
    .parse(
      (
        await client.query(
          'select home_score, postponed from games where id = $1',
          [game],
        )
      ).rows,
    )[0];

const manager = async () => {
  const browser = await signedInBrowser(db, baseUrl, JONAS_ACCOUNT, 'results-manager');
  await savePlaying(db, client, SOONER, CLOSED);
  return browser;
};

describe('POST /admin/updateResult', () => {
  it('saved: 200 {success: true}; the game is scored and its predictions with it', async () => {
    const browser = await manager();
    const page = await browser.post(PATH, boxes(STARTED, '85', '80'));
    expect(page.status).toBe(200);
    expect(json(page)).toEqual({ success: true });
    expect(await scoreOf(STARTED)).toEqual({ home_score: 85, postponed: false });
    const points = await client.query(
      "select count(*)::int as rows from match_points where game_id = $1 and source = 'ruled'",
      [STARTED],
    );
    expect(points.rows).toEqual([{ rows: 1 }]);
  });

  it.each([
    ['85', '', 'Įveskite abu rezultatus.'],
    ['-3', '80', 'Rezultatas negali būti neigiamas. Atidėtoms rungtynėms įveskite -1 : -1.'],
    ['80', '80', 'Lygiosios negalimos - komandų rezultatai turi skirtis.'],
  ])('refused: %s : %s is a 422 "%s", nothing written', async (home, away, text) => {
    const browser = await manager();
    const page = await browser.post(PATH, boxes(STARTED, home, away));
    expect(page.status).toBe(422);
    expect(json(page)).toMatchObject({ message: text });
    expect(await scoreOf(STARTED)).toEqual({ home_score: null, postponed: false });
  });

  it('refused: a game not yet started', async () => {
    const browser = await manager();
    const page = await browser.post(PATH, boxes(FUTURE, '85', '80'));
    expect(page.status).toBe(422);
    expect(json(page)).toMatchObject({
      message: 'Rungtynės dar neprasidėjo - rezultato įvesti negalima.',
    });
  });

  it('postponed (R-63): -1 : -1, then cleared', async () => {
    const browser = await manager();
    expect((await browser.post(PATH, boxes(FUTURE, '-1', '-1'))).status).toBe(200);
    expect(await scoreOf(FUTURE)).toEqual({ home_score: null, postponed: true });
    expect((await browser.post(PATH, boxes(FUTURE, '', ''))).status).toBe(200);
    expect(await scoreOf(FUTURE)).toEqual({ home_score: null, postponed: false });
  });

  it('an unknown or unreadable game is a 404', async () => {
    const browser = await manager();
    expect((await browser.post(PATH, boxes(999999, '85', '80'))).status).toBe(404);
    expect((await browser.post(PATH, boxes(0, '85', '80'))).status).toBe(404);
  });

  it('a player is sent home, and nothing is written', async () => {
    const browser = await signedInBrowser(db, baseUrl, JONAS_ACCOUNT, 'player');
    await savePlaying(db, client, CLOSED);
    const page = await browser.post(PATH, boxes(STARTED, '85', '80'));
    expect(page.status).toBe(303);
    expect(page.headers.get('location')).toBe('/');
    expect(await scoreOf(STARTED)).toEqual({ home_score: null, postponed: false });
  });

  it('another site is refused (403), and nothing is written', async () => {
    const browser = await manager();
    const page = await browser.post(PATH, boxes(STARTED, '85', '80'), {
      origin: 'https://evil.example',
    });
    expect(page.status).toBe(403);
    expect(await scoreOf(STARTED)).toEqual({ home_score: null, postponed: false });
  });
});
```

(`browser.post`'s option for a foreign Origin as `prediction-save.test.ts` sends it; use that file's form.)

- [ ] **Step 9: Run everything web**

```bash
pnpm format
pnpm --filter @sportbet/web exec vitest run --config vitest.component.config.ts
pnpm build && pnpm --filter @sportbet/web exec vitest run --config vitest.feature.config.ts
pnpm typecheck && pnpm lint
```

Expected: PASS.

- [ ] **Step 10: Hand to the lead.** Commit message: `feat(web): POST /admin/updateResult and the results autosave - sportbet's 200 and 422s with their texts, -1 : -1 postpones (R-63), one box yellow and unsent (R-64), the server's message shown; a non-admin home, another site 403 (#21)`.

---

### Task 11 (lead): The end of 7b - the whole check and a review pass

- [ ] Run Task 16 Step 1's whole check. The architect (`mp-code-review`, `..HEAD`) and the security reviewer on Tasks 8-10: the lock order and the F1 test, the gate on the route, the refusal order, nothing personal in a log, the fill-in dice. Before the commit of Task 10, the lead asks the owner design decision 6's three texts, one at a time; an answer changes one line in `texts.ts`. Nothing is pushed.

---

## Part 7c: recalculating everything

### Task 12 (backend-dev): `recalculateAll`, timed; the reader's timing notice

**Files:**
- Create: `packages/db/src/recalculation/all.ts`, `packages/db/test/recalculate-all.test.ts`
- Modify: `packages/db/src/index.ts`, `tools/migrate/src/report.ts` (or wherever the reader runs `recalculateUnderRuleSet`), its test

- [ ] **Step 1: Write the failing test** `packages/db/test/recalculate-all.test.ts`

```ts
import { ruledRules } from '@sportbet/domain';
import { at } from '@sportbet/domain/testing';
import { beforeEach, describe, expect, it } from 'vitest';
import { recalculateAll } from '../src';
import { saveGames } from '../src/season/repository';
import { saveTournament } from '../src/tournament/repository';
import { useTestDatabase } from '../src/testing';
import { G7, G8, OTHER, saveWorld, TOURNAMENT } from './world';

const { db, client } = useTestDatabase();
const NOW = at('2026-10-15T12:00:00Z');

beforeEach(async () => {
  await saveWorld(db);
  await saveTournament(db, OTHER);
  await saveGames(db, TOURNAMENT, [G7, G8]);
});

describe('recalculateAll (Recalculation::all, R-65)', () => {
  it('recalculates every tournament not frozen, timing each', async () => {
    let tick = 0;
    const done = await recalculateAll(db, {
      now: NOW,
      rules: ruledRules,
      timer: () => (tick += 5),
    });
    expect(done).toEqual([
      { tournament: TOURNAMENT.slug, ms: 5 },
      { tournament: OTHER.slug, ms: 5 },
    ]);
  });

  it('leaves a finished tournament frozen (R-22)', async () => {
    await client.query(
      "update tournaments set ends_on = '2026-10-10' where id = $1",
      [TOURNAMENT.id],
    );
    const done = await recalculateAll(db, {
      now: NOW,
      rules: ruledRules,
      timer: () => 0,
    });
    expect(done.map(({ tournament }) => tournament)).toEqual([OTHER.slug]);
  });
});
```

(Game 8 is level with a recorded winner, scored: with game 7 every game of TOURNAMENT is scored, so an end date before NOW finishes it, R-21. Each `timer()` pair - before and after - advances by 5.)

- [ ] **Step 2: Run it to see it fail** - FAIL, not exported.

- [ ] **Step 3: Write `packages/db/src/recalculation/all.ts`**

```ts
import type { Instant, RuleSet } from '@sportbet/domain';
import type { Executor } from '../client';
import { loadSeason } from '../season/repository';
import { listTournaments } from '../tournament/repository';
import { recalculateUnderRuleSet } from './repository';

/** One tournament recalculated, and how long it took. */
export interface Recalculated {
  readonly tournament: string;
  readonly ms: number;
}

/**
 * Recalculation::all for R-65's one button: every tournament that may be
 * recalculated at `now` (Season.mayRecalculateAt - a finished one is
 * frozen under the ruled set, R-22), each through recalculateUnderRuleSet
 * (match points, serija, survival and standings: no separate "Eigos
 * taškai"), timed with `timer` (milliseconds). No fill-in is made and no
 * stored odds read (CO-7). A refusal is an inconsistent database: it
 * throws, and the tournaments before it stay recalculated.
 */
export async function recalculateAll(
  db: Executor,
  input: {
    readonly now: Instant;
    readonly rules: RuleSet;
    readonly timer: () => number;
  },
): Promise<Recalculated[]> {
  const { now, rules, timer } = input;
  const done: Recalculated[] = [];
  for (const tournament of await listTournaments(db)) {
    const season = await loadSeason(db, tournament);
    if (!season.mayRecalculateAt(now, rules)) continue;
    const started = timer();
    const refusal = await recalculateUnderRuleSet(db, tournament, rules);
    if (refusal !== null) {
      throw new Error(
        `recalculateAll: tournament ${String(tournament.id)} could not be recalculated (${refusal})`,
      );
    }
    done.push({ tournament: tournament.slug, ms: timer() - started });
  }
  return done;
}
```

(If `listTournaments` orders by something other than id, sort by id here so the test's order holds.) Export from `packages/db/src/index.ts`: `export { recalculateAll, type Recalculated } from './recalculation/all';`.

- [ ] **Step 4: The reader's timing.** Where the reader recalculates each tournament under each rule set (find it with `grep -rn "recalculateUnderRuleSet" tools/migrate/src`), time each call with `performance.now()` and push a notice `recalculation: <slug> under <rule set name> took <n> ms` (rounded). A slug and a number only. A reader test asserts the notice's shape (`/^recalculation: golden-el under ruled took \d+ ms$/u`) on the synthetic dump.

- [ ] **Step 5: Run the db and reader suites** - PASS.

- [ ] **Step 6: Hand to the lead.** Commit message: `feat(db,migrate): recalculateAll - every tournament not frozen (R-22, R-65), timed; the reader reports each recalculation's time (#21)`.

---

### Task 13 (web-dev): "Perskaičiuoti taškus" **(sensitive)**

**Files:**
- Create: `apps/web/src/app/admin/recalculateAllGamePoints/route.ts`, `apps/web/tests/feature/recalculate.test.ts`
- Modify: `apps/web/src/server/flash.ts`, `apps/web/src/components/hub/flash-alert.tsx` (+ test)

- [ ] **Step 1: The message.** In `apps/web/src/server/flash.ts`'s `flashSchema`, add `z.object({ kind: z.literal('recalculated') }).readonly(),`. In `flash-alert.tsx`, the `'recalculated'` kind is sportbet's `alert alert-primary` (`session('info')` on the admin layout):

```tsx
  if (flash.kind === 'recalculated') {
    return (
      <div role="status" className={`${ALERT} border-accent bg-accent-tint text-accent`}>
        <Icon name="info-circle" />
        Visi taškų rezultatai perskaičiuoti.
      </div>
    );
  }
```

with a component test that it shows the text as a status.

- [ ] **Step 2: Write the failing feature test** `apps/web/tests/feature/recalculate.test.ts`

```ts
import { useTestDatabase } from '@sportbet/db/testing';
import { describe, expect, inject, it } from 'vitest';
import { JONAS_ACCOUNT } from '../support/accounts';
import { signedInBrowser } from '../support/hub';
import { savePlaying } from '../support/predictions';
import { CLOSED } from '../support/registration';

// "Perskaičiuoti taškus" (slice 7c, #21): ResultController::recalculateAllGamePoints, R-65.

const baseUrl = inject('baseUrl');
const { db, client } = useTestDatabase();

const PATH = '/admin/recalculateAllGamePoints';

describe('POST /admin/recalculateAllGamePoints', () => {
  it('recalculates, then the results page says so once', async () => {
    const browser = await signedInBrowser(db, baseUrl, JONAS_ACCOUNT, 'results-manager');
    await savePlaying(db, client, CLOSED);
    const page = await browser.post(PATH, new FormData());
    expect(page.status).toBe(303);
    expect(page.headers.get('location')).toBe('/admin/results');
    const shown = await browser.get('/admin/results');
    expect(shown.html).toContain('Visi taškų rezultatai perskaičiuoti.');
    expect((await browser.get('/admin/results')).html).not.toContain(
      'Visi taškų rezultatai perskaičiuoti.',
    );
  });

  it('a player is sent home; another site is refused', async () => {
    const player = await signedInBrowser(db, baseUrl, JONAS_ACCOUNT, 'player');
    const refused = await player.post(PATH, new FormData());
    expect(refused.status).toBe(303);
    expect(refused.headers.get('location')).toBe('/');
    await client.query("update player_settings set role = 'superadmin' where player_id = 1");
    const crossSite = await player.post(PATH, new FormData(), {
      origin: 'https://evil.example',
    });
    expect(crossSite.status).toBe(403);
  });

  it('"Eigos taškai" is not served (R-65)', async () => {
    const browser = await signedInBrowser(db, baseUrl, JONAS_ACCOUNT, 'superadmin');
    expect((await browser.post('/admin/updateStandingPoints', new FormData())).status).toBe(404);
  });
});
```

- [ ] **Step 3: Run it to see it fail** - FAIL (no route: 404 for the first two).

- [ ] **Step 4: Write `apps/web/src/app/admin/recalculateAllGamePoints/route.ts`**

```ts
import { recalculateAll } from '@sportbet/db';
import { mayRecalculate, ruledRules } from '@sportbet/domain';
import { cookies } from 'next/headers';
import { env } from '../../../env';
import { ADMIN_RESULTS_PATH } from '../../../components/shell/shell-paths';
import { resultsManager } from '../../../server/admin/gate';
import { now } from '../../../server/clock';
import { getDb } from '../../../server/db';
import { writeFlash } from '../../../server/flash';
import {
  refuseCrossSite,
  seeOther,
} from '../../../server/request/route-responses';

/**
 * ResultController::recalculateAllGamePoints for R-65's one button: from
 * this site only (#16), for a role that may recalculate (R-26 amended),
 * else home. Every tournament not frozen is recalculated
 * (recalculateAll), each one's time logged - its slug and milliseconds,
 * nothing personal - then the results page with sportbet's message.
 */
export async function POST(request: Request): Promise<Response> {
  const crossSite = refuseCrossSite(request);
  if (crossSite !== null) return crossSite;
  const admin = await resultsManager();
  if (admin === null || !mayRecalculate(admin.role)) return seeOther('/');
  const at = now();
  const done = await recalculateAll(getDb(), {
    now: at,
    rules: ruledRules,
    timer: () => performance.now(),
  });
  for (const { tournament, ms } of done) {
    console.info(`recalculateAll: ${tournament} ${String(Math.round(ms))} ms`);
  }
  writeFlash(await cookies(), { kind: 'recalculated' }, at, env().AUTH_SECRET);
  return seeOther(ADMIN_RESULTS_PATH);
}
```

(`writeFlash`'s jar is the cookie writer slice 5's routes pass - use the same call as `app/tournament/[slug]/register/submit/route.ts`.)

- [ ] **Step 5: Run everything web** (as Task 10 Step 9) - PASS.

- [ ] **Step 6: Hand to the lead.** Commit message: `feat(web): "Perskaičiuoti taškus" - POST /admin/recalculateAllGamePoints recalculates every tournament not frozen (R-65, R-22), timed, and says "Visi taškų rezultatai perskaičiuoti." once; /admin/updateStandingPoints not served (#21)`.

---

### Task 14 (qa): A superadmin enters a result, in a browser, at 1280 and 390

**Files:** Modify `apps/web/e2e/predictions.spec.ts` (and any spec asserting the shell has no admin link).

- [ ] **Step 1:** The seeded account is now a superadmin (Task 2): any E2E assertion that its rail or menu has no "Administravimas" / admin link changes to expect it.
- [ ] **Step 2:** At the end of `predictions.spec.ts`'s desktop journey (already signed in, design decision 13):
  - open `/admin`: "Admin skydelis" and the three tiles;
  - "Visi rezultatai": game 9002's boxes take input; type `85`, then `80`: after the first box the boxes are yellow, after the second green;
  - open `/prediction/results?event=all`: game 9002's row is scored (its result shown);
  - back to "Visi rezultatai": empty both boxes: grey; the predictions list shows game 9002 locked again, as the earlier steps expect.
  - At 390, `/admin/resultsAll` does not scroll sideways.
- [ ] **Step 3:** Run the whole suite against a fresh local stack built from `git archive HEAD` (README "A local stack from built images"), with Mailpit; then take the stack down.

Expected: every test passes; registrations and sign-in codes stay within their limits (no new registration, no new sign-in).

- [ ] **Step 4: Hand to the lead.** Commit message: `test(e2e): a superadmin enters game 9002's result and clears it, the predictions list follows, at 1280 and 390; the seeded account's admin link (#21)`.

---

### Task 15 (lead): The records

- [ ] **Step 1: `CLAUDE.md`.**
  - Replace the cookie bullet's "a session is started, read, extended and ended only through ..." sentence's neighbour, or add after the slice 6 bullet:

```markdown
- An account's role (`player`, `results-manager`, `superadmin`; R-26
  amended) is `player_settings.role`, read with the session on every
  request; sportbet's admin level becomes a role only in migration 0013
  and the reader (`roleOfSportbetLevel`). Admin pages and routes pass
  `resultsManager()` (`apps/web/src/server/admin/gate.ts`) or go home. A
  result is decided by `enterResult` after `resultFormEntry`
  (`packages/domain/src/result/`) and written only by `saveResult`
  (`packages/db/src/result/save.ts`): one transaction holding the game row
  `FOR UPDATE`, the fill-ins and their counts (`resultFillIns`), a
  correction's mistaken fill-ins (`mistakenFillInsRemoved`), then
  `recalculateUnderRuleSet`; a finished tournament is refused (R-22).
  "Perskaičiuoti taškus" is `recalculateAll`.
```

  - In the slice 6 bullet, "one transaction holding the player's own row" becomes "one transaction holding the game row `FOR SHARE`, then the player's own row", and the lock order sentence reads "the game row first (a result write `FOR UPDATE`, a prediction save `FOR SHARE`), then a player's `match_predictions` row, then their `tournament_players` rows through `lockPlayerStatuses`; a writer locking several players' rows takes them in player id order".
- [ ] **Step 2: Note on #21**: the plan's design decisions 1-13, each in one line, and the owner's answers to decision 6.
- [ ] **Step 3: Commit.** `docs: slice 7 - roles, the admin gate, the result write path and its locks, recalculateAll in CLAUDE.md (#21)`.

---

### Task 16 (lead): Verify everything, review, push, watch CI

- [ ] **Step 1: The whole check, as CI runs it**

```bash
pnpm install --frozen-lockfile 2>&1 | tail -1
pnpm format:check 2>&1 | tail -1
pnpm lint >/dev/null 2>&1; echo lint=$?
pnpm typecheck 2>&1 | grep -c "typecheck: Done"
pnpm build 2>&1 | grep -c "build: Done"
for s in unit component db feature migrate; do echo "== $s"; pnpm test:$s 2>&1 | grep -E "Test Files|Tests "; done
LC_ALL=C.UTF-8 grep -rnP '[\x{1F300}-\x{1FAFF}\x{2600}-\x{27BF}\x{23F3}]' packages apps tools --include=*.ts --include=*.tsx | grep -v node_modules | wc -l
git diff <gate> -- pnpm-lock.yaml | wc -l
git status --short | wc -l
```

Expected: `Done`; Prettier clean; `lint=0`; `4`; `3`; every suite passes with more tests than Task 0 recorded; `0`; `0`; `0`.

- [ ] **Step 2: Review.** `mp-code-review` on `<gate>..HEAD` (Standards and Spec), and, a new feature having landed, `improve-codebase-architecture` on `packages/domain/src/result/`, `packages/domain/src/account/role.ts`, `packages/db/src/result/`, `packages/db/src/recalculation/all.ts`, `apps/web/src/server/admin/`, `apps/web/src/server/results/`, `apps/web/src/components/admin/` and the new routes; present its report to the owner and act on no candidate unless the owner picks one. The security reviewer on every task marked sensitive, as listed in the conventions.
- [ ] **Step 3: Push, and watch the run to the end**

```bash
git push origin main
sleep 15
run=$(gh run list --branch main --limit 1 --json databaseId --jq '.[0].databaseId')
gh run watch "$run" --exit-status
```

Expected: `check`, `image`, `e2e`, `staging` (migrations 0012-0014 on Neon; the staging account a superadmin) and `smoke` green. A failing job: read `gh run view "$run" --log-failed`, fix the cause, commit, push; never re-run a failed job to make it pass.

- [ ] **Step 4: Report on #21** with the run's link, the counts per suite, and each criterion with its evidence.

---

### Task 17 (lead, on the owner's PC): Parity, roles and timings

- [ ] **Step 1:** Rebuild the reader (`pnpm --filter @sportbet/migrate build`) and run `node tools/migrate/dist/migrate.mjs --parity --sportbet-tag 3eb95e7`, its output to a scratchpad file on this PC. Read back only: the verdict, the class counts, the `player_settings: ... (R-26 amended)` notice (numbers only), and the `recalculation: ... took ... ms` notices. Delete the file.

Expected: `PARITY HOLDS`, the class counts as #20's; the role counts (the owner's account a superadmin); each tournament's recalculation time.

- [ ] **Step 2: Post on #21** the verdict, the counts per class, the role counts and the timings.

---

### Task 18 (the owner, with the lead): Results on staging

- [ ] **Step 1 (one instruction; wait for the answer):** "Sign in on staging. The menu now has an admin link: open it. You should see 'Admin skydelis' and three tiles. Open 'Visi rezultatai': Real Madrid vs Zalgiris Kaunas has started, so its boxes take input. Type 85 and 80: the boxes turn green. Then open 'Spėjimai': that game now shows its result and your points. Tell me 'works', or what happened."
- [ ] **Step 2 (after "works"):** "Back on 'Visi rezultatai', type -1 and -1 in that game's boxes: it shows 'Atidėta'. Empty both boxes: it is an ordinary game again. Then press 'Perskaičiuoti taškus' on the admin page and confirm: you land on the results page with 'Visi taškų rezultatai perskaičiuoti.'. Tell me 'works', or what happened."
- [ ] **Step 3: Close #21** once both work, quoting the answers. A problem the owner names becomes a fix verified as in Task 16 Step 1, pushed, and the step again.

---

## Self-review against the spec

**Spec coverage:**

| Spec | Task | Named tests |
|---|---|---|
| Roles: `role` replaces `admin_level`, migration maps 0 / 1,5 / 8,9 | 1, 2 | `role: sportbet's level %i is a %s`, `migrations 0012-0014 ... give each stored admin level its role` |
| The reader maps the level | 3 | `map: sportbet's admin levels become roles, and a notice counts each role` |
| The staging account a superadmin | 2 | `seed: the staging account is a superadmin, and stays one` |
| `mayEnterResults`, `mayRecalculate`; R-50's admin reads the role | 1, 5 | `role: a %s is an admin, enters results and recalculates`, viewer and hub tests through `isAdmin(role)` |
| The gate re-reads the role per request; refusal to `/` | 5, 6 | `gate: %o may enter results`, `the role is read on every request ...`, `a guest/player opening %s goes home` |
| `/admin` tiles; "Eigos taškai" gone | 6, 13 | `admin: "Admin skydelis" and the tiles ...`, `"Eigos taškai" is not served (R-65)` |
| `/admin/results` current round; `/admin/resultsAll` the tournament (R-66) | 4, 6 | `results: the current round's games, or every game (R-66)`, `results page: ...` (3), `"Visi rezultatai" lists ...` |
| Grouping; collapsed when scored; disabled before tip-off; "Atidėta" | 4, 6 | `results: a knockout round is grouped by Vilnius day ...`, `results: each game's names, Vilnius time, and boxes ...` |
| The shell's admin link | 5, 6, 14 | `the shell links an admin to /admin and a player not` |
| `enterResult`: refusals in order, postpone, clear, R-38, R-64 | 8 | `result form: ...` (4), `result: ...` (6) |
| `saveResult`: game `FOR UPDATE`, fill-ins (R-32, R-39, R-7), FI-4/R-5, recalculation, R-22 | 8, 9 | `fill-ins: ...` (3), `correction (ruled/sportbet)`, `result: a score writes the game, fills in ...`, `result (R-22): a finished tournament is refused` |
| F1: a save waits for a result write and is refused | 9 | `save (F1): a save waiting for a result write's game lock is then refused as closed` |
| `POST /admin/updateResult`, autosave, the server's message | 10 | `POST /admin/updateResult` (8), `answer: ...` (3), result-row tests |
| `recalculateAll` with durations | 12 | `recalculates every tournament not frozen, timing each`, `leaves a finished tournament frozen (R-22)` |
| `POST /admin/recalculateAllGamePoints`, confirm, message | 6, 13 | `confirm: submits only when the admin agrees`, `recalculates, then the results page says so once` |
| Parity: replay; timings | 9, 12, 17 | `replay (ruled): entering the golden results one by one ...`, the reader's timing notice, Task 17's run |
| E2E at 390 and 1280 | 14 | `predictions.spec.ts`'s admin steps |

**Placeholder scan:** none of "TBD", "TODO", "implement later". Three texts are marked **(owner to confirm)** by design (decision 6); each is a working text until answered.

**Type consistency:**
- `Role` (domain) is `player_settings.role`'s enum, `SignedInPlayer.role`, `StoredPlayerSettings.role`, `saveAccounts`'s and `signedInBrowser`'s `role` argument.
- `ResultEntry` (result-form.ts) is `enterResult`'s `entry`; `ResultFieldError` is `ResultSaveRefusal`'s `fields` errors and `answerOf`'s input; `EnterResultRefusal` maps onto `ResultSaveRefusal`'s `not-started` and `level`.
- `FillInCandidateRows` / `FillInMade` use `TournamentStatusRow` (predict-match.ts:92), the rows `lockPlayerStatuses` returns.
- `ResultsPageGame` (db) is `ResultRow`'s and `ResultsView`'s game; `groupResultGames`'s type parameter accepts it (Task 6's note).
- `DatabaseClock` / `databaseClock` (prediction/save.ts) are reused by `saveResult`.
