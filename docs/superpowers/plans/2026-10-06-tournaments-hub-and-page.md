# Tournaments Hub, Tournament Page and Joining From It (Slice 5) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** The front page becomes sportbet's tournaments hub. It has the charity card and the three groups (active, upcoming, finished) in sportbet's order, each card with its header, button and widgets, and for a guest the top 5, the medal count, the next games and the stats. `/tournament/<slug>` shows its header card, and an unknown slug gets a server-rendered not-found inside the shell (5a). Then "Žaisti", "Keisti turnyrą" and the tournament registration form work, with one-time messages and a return to the form after sign-in (5b). All of it follows sportbet 3eb95e7, except where the owner ruled (R-50 to R-55).

**Architecture:** The rules are in `packages/domain`:
- `tournament/tournament-profile.ts`: a tournament's profile (sportbet's status, start date, sport, description and public switch).
- `hub/hub.ts`: the hub's rules (`hubGroup`, `orderHub`, `canSeeTournament`, `cardAction`, `widgetsShown`, `tournamentPageAction`, `registrationFormStep`).
- `hub/medal-tally.ts`: the medal count.
- `hub/number-format.ts`: sportbet's number format.
- Two new `RuleSet` fields hold R-50 and R-55.

`packages/db` stores the profile (migration 0010, `tournament/profile.ts`) and reads the pages' data (`hub/repository.ts`: `loadHub`, `loadTournamentPage`, `loadRegistrationForm`, `findVisibleTournament`). The reader copies the five columns from production.

`apps/web` draws the pages (`components/hub/`, `components/tournament/`) and holds the actions:
- Enter, exit and the form's submit are route handlers taking plain form posts and answering with real redirects. So the next page reads the one-time message cookie, through `proxy.ts`.
- After sign-in, the player returns to the form they were sent away from.

**Tech Stack:**
- Next.js 16.3.6 (App Router, route handlers, `proxy.ts`), React 19.3.
- Drizzle ORM 0.45.3 and drizzle-kit 0.31.11 on Postgres 18.6, Zod 4.6.5.
- `node:crypto` (through `server/sealed.ts`), `Intl.DateTimeFormat` (Europe/Vilnius).
- Vitest 5, Testing Library, jsdom 30, Playwright 1.63.
- **No new dependency.**

**Spec:** `docs/superpowers/specs/2026-10-06-tournaments-hub-and-page-design.md` (approved by the owner).

**Rulings:** R-7, R-8, R-9, R-18, R-19, R-21, R-27, R-28, R-30, R-46, R-48, R-49, and R-50 to R-56 (R-50 as amended at the plan review: sign-up skips a non-public tournament) (`docs/owner-rulings.md`).

**Decisions:** 5, 11, 13.

**Issue:** #19 (part of #1), and the notes carried from #16: the server-rendered 404, and the hardened intended-page check.

**Reference:** sportbet (`D:\Projects\sportbet`) at `3eb95e7`.

---

## Conventions for every task

**Roles and commits**
- Work on `main` (trunk-based, `CLAUDE.md`).
- Each task names the teammate role that owns its folders (`docs/agent-team.md`):
  - `backend-dev` edits `packages/domain`, `packages/db` and `tools/migrate`.
  - `web-dev` edits `apps/web`, including its component and feature tests and its `public/` files.
  - `qa` edits E2E and smoke files only.
  - The lead edits the records and is the only one who talks to the owner.
- There is no `devops` task. Migration 0010 reaches Neon through the existing deploy, the staging seed runs on every deploy, and CI's E2E stack seeds the same way.
- Reviews:
  - `qa` reviews every task against #19's criteria and sportbet's behaviour.
  - `architect` reviews every task against `CLAUDE.md` and the spec.
  - `security-reviewer` reviews every task marked **(sensitive)**.
- **Only the lead commits**, once those reviews have passed the task.
- A teammate's last step is "hand to the lead": the files changed, the commands run and their results, and the commit message.
- Every commit message references `#19` and ends with the trailer lines the lead's session gives (`Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>` and the `Claude-Session:` line).
- Do not push until Task 18. Task 11 ends 5a with the whole check and a review pass; 5b then starts on top. Nothing is pushed in between.

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
- Every Lithuanian text below is sportbet's (`resources/views/tournaments/{hub,show,register}.blade.php`, `lang/lt.json`). There are three exceptions, each marked where it is used: the two texts R-52 replaces ("krepšinio prognozių žaidimas", "taškų skirtumą"), and R-54's "Registracija galima iki {data}.".
- **No emoji is typed into any file.** sportbet's headings and medals carry emoji: the red circle, the hourglass, the folder, the three medals, the target, the chart, the trophy and the heart.
  - The code writes each one as `String.fromCodePoint(0x...)` in a single constant, and tests match the text beside it.
  - No escape is typed either: the Write and Edit tools turn a typed `\uXXXX` into the raw character.

**Code rules** (`CLAUDE.md`)
- `packages/domain` imports only `zod`, and takes time as a parameter.
- Web reaches the database only through `@sportbet/db`.
- Pages only load data (parse params, call a query) and return one component. Markup lives in components, which have component tests.
- Colours exist only as tokens (`bg-card`, `text-muted`), never as a literal or a palette class.
- No `any`, no `as` other than `as const`, no `!`.
- A refusal is a `Result`; an impossible state throws.
- A skipped or focused test is a lint error.
- Every query result is parsed before it leaves `db`.
- Derived points rows are written only through `recalculateUnderRuleSet`.
- A difference between sportbet and the rulings exists only as a `RuleSet` field, with a test under both sets.
- **Nothing personal in any log or output.** No address, username, name, surname or code is passed to `console.*` or put in an error message. A catch logs `errorKind(error)` only (`apps/web/src/server/error-kind.ts`).

## File map

```
packages/domain/src/tournament/
  tournament-profile.ts   TOURNAMENT_STATUSES, tournamentProfileSchema, TournamentProfile        (+ test, new)
packages/domain/src/stored/sportbet-columns.ts   + tournamentProfile(row), SportbetTournamentProfileRow (+ test)
packages/domain/src/rules/rule-set.ts            + hubFinishedFollowsR21 (R-55), nonPublicTournamentsHidden (R-50) (+ test)
packages/domain/src/hub/
  hub.ts                  HUB_GROUPS, hubGroup, orderHub, canSeeTournament, cardAction, widgetsShown,
                          tournamentPageAction, registrationFormStep                              (+ test, new)
  medal-tally.ts          tallyMedals, MedalPick, MedalRow                                         (+ test, new)
  number-format.ts        numberFormat, leaderPoints                                               (+ test, new)
packages/domain/src/ranking/league-table.ts      + unicodeCiCompare (the accent-blind order, exported) (+ test)
packages/domain/src/recalculation/recalculation.ts  totalsOf exported as sumTournamentTotals       (+ test)
packages/domain/src/joining/joining.ts           takesPlayersAt exported as isOpenForRegistrationWindowAt; + joinableOnSignUp, SignUpWindow, JoinCandidate.isPublic (R-50, Task 6A)
packages/domain/src/index.ts                     the new exports

packages/db/src/tournament/schema.ts             + status, starts_on, sport, description, is_public
packages/db/migrations/0010_tournament-hub-columns.sql   (generated, new)
packages/db/src/tournament/profile.ts            saveTournamentProfile, loadTournamentProfiles     (new)
packages/db/src/joining/repository.ts            + loadRegistrationWindowsById; candidates and sign-up windows carry isPublic (Task 6A)
packages/db/src/account/repository.ts            + setLastTournament
packages/db/src/hub/repository.ts                loadHub, loadTournamentPage, loadRegistrationForm,
                                                 findVisibleTournament, HubViewer, HubCard, ...    (new)
packages/db/src/seed/staging.ts                  profiles, a third and a non-public tournament, one game
packages/db/src/index.ts                         the new exports
packages/db/test/tournament-profile.test.ts, hub.test.ts (new); seed.test.ts, account.test.ts

tools/migrate/src/read-columns.ts                tournaments: + sport, status, start_date, description, is_public
tools/migrate/src/map.ts                         MappedTournament.profile, through sportbetColumns.tournamentProfile
tools/migrate/src/load.ts                        saves each profile
tools/migrate/src/read-columns.test.ts, test/map.test.ts, test/load.test.ts

apps/web/public/img/teams/                       sportbet's 20 Euroleague crests and _placeholder.svg (copied)
apps/web/src/components/shell/icon.tsx           + ten Bootstrap Icons glyphs
apps/web/src/components/format/vilnius-time.ts   vilniusDateTime (R-51)                             (+ test, new)
apps/web/src/components/hub/
  crests.ts               CREST_FILES, crestPath (TeamLogo)                                         (+ test, new)
  glyphs.ts               sportbet's emoji, as code points                                          (new)
  header-line.ts          headerLine, sportName (R-56)                                              (+ test, new)
  styles.ts               the hub's shared classes                                                  (new)
  flash-alert.tsx         FlashAlert                                                                (+ test, new)
  charity-card.tsx        CharityCard (R-52)                                                        (+ test, new)
  card-action.tsx         CardActionButton                                                          (+ test, new)
  widgets.tsx             HowItWorks, UpcomingGames, LeadersPanel, MedalsPanel, StatsPanel          (+ test, new)
  tournament-card.tsx     TournamentCard                                                            (+ test, new)
  hub-view.tsx            HubView                                                                   (+ test, new)
apps/web/src/components/tournament/
  tournament-page-view.tsx   TournamentPageView                                                     (+ test, new)
  register-form-view.tsx     RegisterFormView (R-54)                                                (+ test, new)
apps/web/src/components/{home-view,tournament-list,tournament-details}.tsx (+ tests)   deleted
apps/web/src/app/page.tsx                        the hub
apps/web/src/app/tournament/[slug]/page.tsx      the tournament page
apps/web/src/app/tournament/[slug]/not-found.tsx the shell's not-found, server-rendered (new)
apps/web/src/app/tournament/[slug]/enter/route.ts        POST, and R-53's GET                       (new)
apps/web/src/app/tournament/[slug]/register/page.tsx     the form                                   (new)
apps/web/src/app/tournament/[slug]/register/submit/route.ts   the form's POST                       (new)
apps/web/src/app/tournament/[slug]/register/closed/route.ts   the "closed" message, then home      (new)
apps/web/src/app/tournaments/exit/route.ts       "Keisti turnyrą"                                   (new)
apps/web/src/app/login/route.ts                  + ?intended= remembered as the return path
apps/web/src/server/cookies.ts                   + FLASH_COOKIE, FLASH_HEADER, RETURN_COOKIE (+ test)
apps/web/src/server/flash.ts                     Flash, sealFlash, openFlash, writeFlash, readFlash (+ test, new)
apps/web/src/server/sign-in/return-path.ts       safeReturnPath, rememberReturn, readReturn, forgetReturn (+ test, new)
apps/web/src/server/sign-in/verify-code.ts       back to the return path after sign-in
apps/web/src/server/viewer.ts                    hubViewer: the request's HubViewer                 (new)
apps/web/src/proxy.ts                            forwards and clears the flash
apps/web/src/components/shell/shell-paths.ts     SHELL_LINKS.tournamentExit set (+ test)
apps/web/tests/support/hub.ts                    signedInBrowser, withProfile                       (new)
apps/web/tests/feature/routes.test.ts            the hub and the page, rewritten
apps/web/tests/feature/hub.test.ts, joining-from-hub.test.ts (new)
apps/web/e2e/tournaments.spec.ts (rewritten), e2e/join.spec.ts (new), playwright.config.ts, smoke/smoke.test.ts
CLAUDE.md                                        the records
```

## Design decisions this plan makes

None of these is a scoring rule; each is how the spec is held. Where one departs from the letter of the spec or of sportbet, the reason is given, and the lead lists it again in the report to the owner.

1. **The profile is its own type, not five more `Tournament` fields.**
   - `Tournament` is what scoring reads, and eighteen files build one; the hub alone reads the hub columns.
   - `TournamentProfile` (domain) is saved by `saveTournamentProfile` and read by `loadTournamentProfiles`.
   - The columns get sportbet's defaults (`status` `upcoming`, `is_public` true), and `sport` defaults to `basketball` (decision 11: Euroleague only). So every existing insert keeps working.
2. **Totals are summed by one exported function.**
   - The guest top 5 needs each player's total from the stored rows of the live rule set.
   - `recalculateTournament`'s internal `totalsOf` becomes the exported `sumTournamentTotals(players, rows)`, which `recalculateTournament` still calls. Nothing else adds points up.
   - The `CLAUDE.md` line "players' totals are derived only through recalculateTournament" is amended to name it (Task 17). The architect reviews this.
3. **Who is listed in the top 5 and the medal count.**
   - Listing follows `PlayerStatus.isListedIn` under the rule set (RA-4, R-7, R-19): sportbet's `user_settings.active`, read per tournament as R-7 rules.
   - The top 5 takes only players with a match points row from the rule set's source in the tournament. This is `PlayerTotals::eligible`'s inner join on `point_results`.
4. **The hub reads the live rows**: the rule set's own source (`ruled` on the site), never `production`.
5. **"Upcoming games" are the games open for predictions** (`Game.isOpenAt`: no result, not locked, not postponed, tip-off still to come). sportbet's `GameLock::openSql` reads only the date and the score, because postponed and locked are states only the new app has (R-13, R-41).
6. **Enter, exit and the form's submit are plain form posts to route handlers, not Server Actions.**
   - A one-time message is a cookie the next page must read once.
   - A Server Action's redirect renders the target inside the action's own response, which never passes through `proxy.ts`, so the message would show twice.
   - A route handler answers with a real 303, so the browser asks for the next page. `proxy.ts` then forwards the cookie as a header and clears it, as it does `__Host-sb_signin_open`.
   - Because of this, the form posts to `/tournament/<slug>/register/submit`. sportbet posts to the form's own URL, but Next cannot serve a page and a handler at one path. A player never sees this URL.
7. **R-53 needs a GET on enter.**
   - The form page cannot write (pages only load data). So a member opening it is redirected to `GET /tournament/<slug>/enter`, which does what the card's POST does.
   - That GET changes only the player's own last-used tournament, as sportbet's GET `/tournaments/exit` changes the session. The security reviewer weighs it.
   - A closed form likewise hops through `GET /tournament/<slug>/register/closed`, which sets the "closed" message and goes home. It writes nothing else.
8. **The return path after sign-in is its own cookie** (sportbet's `redirect()->intended`).
   - It is `__Host-sb_return`, separate from `__Host-sb_intended`, which holds registration's tournament slug. In sportbet these are also two session keys: `intended_tournament` and `url.intended`.
   - A guest opening the form goes to `/login?intended=/tournament/<slug>/register`. `/login` keeps that path only if `safeReturnPath` accepts it.
   - Sign-in ends there; the cookie is read and cleared once.
   - Registration (4c) still ends at home, as sportbet's does.
9. **Links to the form are plain `<a>`, never `next/link`.** A prefetch would run the page, and its member branch redirects to a GET that writes.
10. **The rail's "Turnyrai" stays highlighted on `/` only.**
    - The spec says `/tournament/...` should highlight it too. But sportbet's rail marks it with `routeIs('tournaments.hub')`, the hub alone, and parity beats a nicer rule (`CLAUDE.md`).
    - The section matching #16 asked for is meant for sportbet's `leagues.*` and `admin*` entries, which arrive with slices 12 and 13. It is noted on #19 for them, and `NavLink` is not changed here.
11. **The staging seed gets a game.**
    - R-48 joins a sign-up to the open tournament with a next game, otherwise the newest.
    - A new upcoming tournament with no games would take every staging sign-up away from Euroleague 2026/27, and break `register.spec.ts`.
    - So 2026/27 gets one game, on 2027-03-04. The non-public tournament is a finished one, so it shows no join button in any case; R-50 (Task 6A) keeps sign-up out of it either way.
12. **A crest is looked up in a list, not by reading a directory.** `CREST_FILES` names the copied files, and a test holds it equal to `public/img/teams/`. sportbet reads the directory once per process.
13. **With no closing time, R-54's sentence is left out.** This happens when a tournament has no game in the closing round, so there is no moment to name. The "Taisyklės" link stays.

## Point the lead raises with the owner (no task waits on it)

**P2. Teams with a final place of 0.**
- The question: sportbet's medal count lists a team that has a `final = 0` row, with zeros. The new schema stores that 0 as null (`standings_predictions.final_place`), so such a team is not listed.
  - sportbet's own write path has stored null since `UpdatePredictionStandingRequest` (min 1), so only old rows can hold 0.
- What the plan does: Task 19 counts the `final = 0` rows on the production copy (a count only). If there are none, nothing is needed; if there are any, the lead asks the owner.

The owner answered P1 and P3 at the plan review (2026-10-06): R-50 now also keeps sign-up out of a non-public tournament (Task 6A), and R-56 names the sport in Lithuanian (Task 8).

---

### Task 0 (lead): The gate

**Files:** none.

- [ ] **Step 1: A clean `main` with the spec on it**

```bash
git status --short | wc -l
git log --oneline -1 -- docs/superpowers/specs/2026-10-06-tournaments-hub-and-page-design.md
git -C /d/Projects/sportbet cat-file -t 3eb95e7
git rev-parse --short HEAD
```

Expected:
- `0`
- `aea08f6 docs: slice 5 spec - tournaments hub, tournament page, joining from it; R-50 to R-55 (#19)`
- `commit`
- The gate's commit: this plan, committed on top of `aea08f6`. Note it; Tasks 11 and 18 review from it.

- [ ] **Step 2: Record the baseline**

```bash
pnpm install --frozen-lockfile 2>&1 | tail -1
pnpm build 2>&1 | grep -c "build: Done"
pnpm test:unit 2>&1 | grep -E "Test Files|Tests "
pnpm test:component 2>&1 | grep -E "Test Files|Tests "
pnpm test:db 2>&1 | grep -E "Test Files|Tests "
pnpm test:feature 2>&1 | grep -E "Test Files|Tests "
pnpm test:migrate 2>&1 | grep -E "Test Files|Tests "
```

Expected: `Done`, then `3`, then every suite passes. Note each count; Tasks 11 and 18 compare against them.

- [ ] **Step 3: Post P2 on #19**, so the owner's answer has a place. The lead asks the owner P2 only after Task 19 has counted.

---

## Part 5a: the read-only pages

### Task 1 (backend-dev): A tournament's profile, and how sportbet's columns read into it

**Files:**
- Create: `packages/domain/src/tournament/tournament-profile.ts`, `packages/domain/src/tournament/tournament-profile.test.ts`
- Modify: `packages/domain/src/stored/sportbet-columns.ts` (a `tournamentProfile` method beside `tournament`), `packages/domain/src/stored/sportbet-columns.test.ts`, `packages/domain/src/index.ts`

- [ ] **Step 1: Write the failing test** - `packages/domain/src/tournament/tournament-profile.test.ts`

```ts
import { describe, expect, it } from 'vitest';
import {
  TOURNAMENT_STATUSES,
  tournamentProfileSchema,
} from './tournament-profile';

const PROFILE = {
  status: 'active',
  startsOn: '2026-09-30',
  sport: 'basketball',
  description: 'Eurolygos sezonas',
  isPublic: true,
} as const;

describe('tournament profile', () => {
  it("profile: holds sportbet's three statuses, in its enum's order", () => {
    expect(TOURNAMENT_STATUSES).toEqual(['upcoming', 'active', 'finished']);
  });

  it('profile: takes a full profile, and one with no start date and no description', () => {
    expect(tournamentProfileSchema.parse(PROFILE)).toEqual(PROFILE);
    expect(
      tournamentProfileSchema.parse({
        ...PROFILE,
        startsOn: null,
        description: null,
      }),
    ).toEqual({ ...PROFILE, startsOn: null, description: null });
  });

  it('profile: refuses a status sportbet does not have, and a start date that is no date', () => {
    expect(
      tournamentProfileSchema.safeParse({ ...PROFILE, status: 'paused' })
        .success,
    ).toBe(false);
    expect(
      tournamentProfileSchema.safeParse({ ...PROFILE, startsOn: '2026-02-30' })
        .success,
    ).toBe(false);
  });
});
```

- [ ] **Step 2: Run it to see it fail**

Run: `pnpm --filter @sportbet/domain exec vitest run src/tournament/tournament-profile.test.ts`
Expected: FAIL - `Failed to resolve import "./tournament-profile"`.

- [ ] **Step 3: Write `packages/domain/src/tournament/tournament-profile.ts`**

```ts
import { z } from 'zod';

/**
 * sportbet's `tournaments.status`: the state the admin declared
 * (Tournament::effectiveStatus reads it; nothing writes it back).
 */
export const TOURNAMENT_STATUSES = ['upcoming', 'active', 'finished'] as const;

export type TournamentStatus = (typeof TOURNAMENT_STATUSES)[number];

/**
 * What the hub and the tournament page show of a tournament besides its
 * rules (spec slice 5): sportbet's status, start date, sport, description
 * and public switch, copied from production. Only the hub's grouping
 * (hubGroup) and who may see a tournament (canSeeTournament) read them;
 * scoring never does.
 */
export const tournamentProfileSchema = z.object({
  status: z.enum(TOURNAMENT_STATUSES),
  /** `start_date`, `YYYY-MM-DD` in UTC; null when the admin set none. */
  startsOn: z.iso.date().nullable(),
  /** `sport` as the admin typed it ("basketball"). */
  sport: z.string(),
  description: z.string().nullable(),
  /** `is_public`: R-50 hides a tournament without it. */
  isPublic: z.boolean(),
});

export type TournamentProfile = z.infer<typeof tournamentProfileSchema>;
```

- [ ] **Step 4: Run it to see it pass**

Run: `pnpm --filter @sportbet/domain exec vitest run src/tournament/tournament-profile.test.ts`
Expected: PASS, 3 tests.

- [ ] **Step 5: Write the failing test for sportbet's columns** - append to `packages/domain/src/stored/sportbet-columns.test.ts`

```ts
describe('sportbet columns: tournament profiles', () => {
  const ROW = {
    status: 'active',
    start_date: '2026-09-30',
    sport: 'basketball',
    description: 'Eurolygos sezonas',
    is_public: 1,
  };

  it("columns: a tournament's status, start date, sport, description and public switch, as sportbet stores them", () => {
    expect(unwrap(sportbetColumns.tournamentProfile(ROW))).toEqual({
      status: 'active',
      startsOn: '2026-09-30',
      sport: 'basketball',
      description: 'Eurolygos sezonas',
      isPublic: true,
    });
  });

  it('columns: is_public 0 is not public; no start date and no description are none', () => {
    expect(
      unwrap(
        sportbetColumns.tournamentProfile({
          ...ROW,
          is_public: 0,
          start_date: null,
          description: null,
        }),
      ),
    ).toEqual({
      status: 'active',
      startsOn: null,
      sport: 'basketball',
      description: null,
      isPublic: false,
    });
  });

  it.each([
    ['bad-status', { ...ROW, status: 'paused' }],
    ['bad-start-date', { ...ROW, start_date: '2026-13-01' }],
  ] as const)('columns: refuses a profile with %s', (refusal, row) => {
    expect(sportbetColumns.tournamentProfile(row)).toEqual(refuse(refusal));
  });
});
```

- [ ] **Step 6: Run it to see it fail**

Run: `pnpm --filter @sportbet/domain exec vitest run src/stored/sportbet-columns.test.ts`
Expected: FAIL - `sportbetColumns.tournamentProfile is not a function`.

- [ ] **Step 7: Add the row type and the method** in `packages/domain/src/stored/sportbet-columns.ts`

Add the import beside the tournament one:

```ts
import {
  TOURNAMENT_STATUSES,
  type TournamentProfile,
} from '../tournament/tournament-profile';
```

Add after `SportbetTournamentRefusal`:

```ts
/** The `tournaments` columns the hub reads (slice 5), as the reader reads them. */
export interface SportbetTournamentProfileRow {
  readonly status: string;
  /** `start_date` as `YYYY-MM-DD`; null when the admin set none. */
  readonly start_date: string | null;
  readonly sport: string;
  readonly description: string | null;
  readonly is_public: number;
}

export type SportbetTournamentProfileRefusal = 'bad-status' | 'bad-start-date';
```

Add the method to `sportbetColumns`, right after `tournament(...)`:

```ts
  /**
   * The tournament's profile: `status` one of sportbet's three, `start_date`
   * a date or none, `is_public` true unless 0 (a tinyint(1), as
   * `survival_game`); `sport` and `description` as typed.
   */
  tournamentProfile(
    row: SportbetTournamentProfileRow,
  ): Result<TournamentProfile, SportbetTournamentProfileRefusal> {
    const status = TOURNAMENT_STATUSES.find((each) => each === row.status);
    if (status === undefined) {
      return refuse('bad-status');
    }
    const startsOn = isoDateSchema.nullable().safeParse(row.start_date);
    if (!startsOn.success) {
      return refuse('bad-start-date');
    }
    return ok({
      status,
      startsOn: startsOn.data,
      sport: row.sport,
      description: row.description,
      isPublic: row.is_public !== 0,
    });
  },
```

- [ ] **Step 8: Export them** - in `packages/domain/src/index.ts`, add after the `./tournament/tournament` block:

```ts
export {
  TOURNAMENT_STATUSES,
  tournamentProfileSchema,
  type TournamentProfile,
  type TournamentStatus,
} from './tournament/tournament-profile';
```

and add `type SportbetTournamentProfileRefusal,` and `type SportbetTournamentProfileRow,` to the `./stored/sportbet-columns` block, in alphabetical order.

- [ ] **Step 9: Verify**

```bash
pnpm format
pnpm --filter @sportbet/domain exec vitest run src/tournament/tournament-profile.test.ts src/stored/sportbet-columns.test.ts
pnpm --filter @sportbet/domain typecheck && pnpm lint
```

Expected: PASS (both files); typecheck and lint silent.

- [ ] **Step 10: Hand to the lead.** Commit message: `feat(domain): a tournament's profile - sportbet's status, start date, sport, description and public switch, read from its columns (#19)`.

---

### Task 2 (backend-dev): The hub's rules, and R-50 and R-55 in `RuleSet`

**Files:**
- Modify: `packages/domain/src/rules/rule-set.ts`, `packages/domain/src/rules/rule-set.test.ts`
- Modify: `packages/domain/src/joining/joining.ts` (export the window check)
- Create: `packages/domain/src/hub/hub.ts`, `packages/domain/src/hub/hub.test.ts`
- Modify: `packages/domain/src/index.ts`

- [ ] **Step 1: The two fields fail the rule-set test first** - in `packages/domain/src/rules/rule-set.test.ts`, add to `DIFFERENCES` after `lateJoinersFilledIn`:

```ts
  hubFinishedFollowsR21: 'LR-6, R-21, R-55',
  nonPublicTournamentsHidden: 'R-50',
```

Run: `pnpm --filter @sportbet/domain exec vitest run src/rules/rule-set.test.ts`
Expected: FAIL - `rules: holds exactly the listed differences` (the two keys are missing from the sets), and typecheck reports the two keys unknown to `RuleSet`.

- [ ] **Step 2: Add the fields** in `packages/domain/src/rules/rule-set.ts`

In `interface RuleSet`, after `lateJoinersFilledIn`:

```ts

  // Tournaments hub
  /**
   * LR-6, R-21, R-55: does the hub group a tournament as finished only as
   * R-21 finishes it? sportbet's hub also does when an admin marks it
   * finished or every game entered so far is scored
   * (Tournament::effectiveStatus).
   */
  readonly hubFinishedFollowsR21: boolean;
  /**
   * R-50: is a non-public tournament shown only to its players and admins?
   * sportbet's hub lists every tournament and never reads `is_public`.
   */
  readonly nonPublicTournamentsHidden: boolean;
```

In `sportbetRules`, after `lateJoinersFilledIn: false,`:

```ts
  hubFinishedFollowsR21: false,
  nonPublicTournamentsHidden: false,
```

In `ruledRules`, after `lateJoinersFilledIn: true,`:

```ts
  hubFinishedFollowsR21: true,
  nonPublicTournamentsHidden: true,
```

Run: `pnpm --filter @sportbet/domain exec vitest run src/rules/rule-set.test.ts`
Expected: PASS.

- [ ] **Step 3: Export the window's registration check** - in `packages/domain/src/joining/joining.ts`, rename the private `takesPlayersAt` to an exported `isOpenForRegistrationWindowAt` (its two callers, `isOpenForRegistration` and `registrationIsOpen`, use the new name) and give it this comment:

```ts
/**
 * isOpenForRegistration from a tournament's window alone
 * (Season.registrationWindow, or the database's
 * loadRegistrationWindowsById): not finished (R-21) and not closed under
 * the rule set (PL-2, R-8). The hub asks it of every card without loading
 * a season.
 */
export function isOpenForRegistrationWindowAt(
  window: RegistrationWindow,
  now: Instant,
  rules: RuleSet,
): boolean {
  return (
    !isFinishedWindowAt(window, now) &&
    isRegistrationOpenWindowAt(window, now, rules)
  );
}
```

Add `isOpenForRegistrationWindowAt,` to the `./joining/joining` block of `packages/domain/src/index.ts`.

Run: `pnpm --filter @sportbet/domain exec vitest run src/joining`
Expected: PASS (unchanged behaviour).

- [ ] **Step 4: Write the failing test** - `packages/domain/src/hub/hub.test.ts`

```ts
import { describe, expect, it } from 'vitest';
import type { RegistrationWindow } from '../round/season';
import { ruledRules, sportbetRules } from '../rules/rule-set';
import { at } from '../testing';
import {
  canSeeTournament,
  cardAction,
  hubGroup,
  orderHub,
  registrationFormStep,
  tournamentPageAction,
  widgetsShown,
  type HubGroup,
} from './hub';

// sportbet's Tournament::effectiveStatus and orderByEffectiveStatus,
// hub.blade.php's buttons and widgets, show.blade.php's header button and
// TournamentController::registerForm, with R-50, R-53 and R-55.

const NOW = at('2026-10-06T12:00:00Z');

/** Two games, neither scored; no end date; closes at the first game (sportbet) or round 5 (ruled). */
function window(over: Partial<RegistrationWindow> = {}): RegistrationWindow {
  return {
    endsAt: null,
    games: 2,
    allScored: false,
    firstTipOff: at('2026-10-02T18:00:00Z'),
    standingsDeadline: at('2026-11-01T18:00:00Z'),
    ...over,
  };
}

const group = (
  status: 'upcoming' | 'active' | 'finished',
  startsOn: string | null,
  over: Partial<RegistrationWindow>,
  rules = sportbetRules,
): HubGroup =>
  hubGroup({ profile: { status, startsOn }, window: window(over), now: NOW, rules });

describe('hubGroup (both sets)', () => {
  it.each([sportbetRules, ruledRules])(
    'hub ($name): active while the admin says active and no date says otherwise',
    (rules) => {
      expect(group('active', null, {}, rules)).toBe('active');
      expect(group('active', '2026-10-06', {}, rules)).toBe('active');
    },
  );

  it.each([sportbetRules, ruledRules])(
    'hub ($name): upcoming when the admin says so, or its start date is after today in UTC',
    (rules) => {
      expect(group('upcoming', null, {}, rules)).toBe('upcoming');
      expect(group('active', '2026-10-07', {}, rules)).toBe('upcoming');
    },
  );
});

describe('hubGroup (sportbet): Tournament::effectiveStatus', () => {
  it('hub (sportbet): finished when the admin marks it finished', () => {
    expect(group('finished', null, {})).toBe('finished');
  });

  it('hub (sportbet): finished when it has games and every one is scored', () => {
    expect(group('active', null, { allScored: true })).toBe('finished');
  });

  it('hub (sportbet): a tournament with no games has not finished them', () => {
    expect(group('active', null, { games: 0, allScored: true })).toBe(
      'active',
    );
  });

  it('hub (sportbet): finished from the day after its end date (end_date < today), not on it', () => {
    expect(
      group('active', null, { endsAt: at('2026-10-06T00:00:00Z') }),
    ).toBe('finished');
    expect(
      group('active', null, { endsAt: at('2026-10-07T00:00:00Z') }),
    ).toBe('active');
  });

  it('hub (sportbet): finished wins over upcoming', () => {
    expect(group('upcoming', '2026-12-01', { allScored: true })).toBe(
      'finished',
    );
  });
});

describe('hubGroup (ruled): R-55 follows R-21', () => {
  it('hub (ruled, R-55): an admin marking it finished does not finish it', () => {
    expect(group('finished', null, {}, ruledRules)).toBe('active');
  });

  it('hub (ruled, R-55): every game scored without an end date does not finish it', () => {
    expect(group('active', null, { allScored: true }, ruledRules)).toBe(
      'active',
    );
  });

  it('hub (ruled, R-55): an end date passed with a game unscored does not finish it', () => {
    expect(
      group('active', null, { endsAt: at('2026-10-06T00:00:00Z') }, ruledRules),
    ).toBe('active');
  });

  it('hub (ruled, R-55): finished once its end date has passed and every game is scored', () => {
    expect(
      group(
        'active',
        null,
        { endsAt: at('2026-10-06T00:00:00Z'), allScored: true },
        ruledRules,
      ),
    ).toBe('finished');
  });
});

describe('orderHub: Tournament::orderByEffectiveStatus', () => {
  it('hub: active, then upcoming, then finished; by start date with none first; then by id', () => {
    const places = [
      { id: 1, group: 'finished', startsOn: null },
      { id: 2, group: 'upcoming', startsOn: '2027-10-01' },
      { id: 3, group: 'active', startsOn: '2026-10-01' },
      { id: 4, group: 'active', startsOn: null },
      { id: 5, group: 'upcoming', startsOn: '2026-12-01' },
      { id: 6, group: 'active', startsOn: '2026-10-01' },
    ] as const;
    expect(orderHub(places).map(({ id }) => id)).toEqual([4, 3, 6, 5, 2, 1]);
  });
});

describe('canSeeTournament: R-50', () => {
  const seen = (
    isPublic: boolean,
    member: boolean,
    isAdmin: boolean,
    rules = ruledRules,
  ) => canSeeTournament({ isPublic, member, isAdmin, rules });

  it('hub (sportbet): every tournament is listed, public or not', () => {
    expect(seen(false, false, false, sportbetRules)).toBe(true);
  });

  it('hub (ruled, R-50): a non-public tournament is seen by its players and admins only', () => {
    expect(seen(true, false, false)).toBe(true);
    expect(seen(false, false, false)).toBe(false);
    expect(seen(false, true, false)).toBe(true);
    expect(seen(false, false, true)).toBe(true);
  });
});

describe("cardAction: hub.blade.php's button", () => {
  it.each([
    ['active', true, true, false, 'play'],
    ['upcoming', true, true, false, 'join'],
    ['finished', true, true, false, 'view'],
    ['active', true, false, true, 'register'],
    ['upcoming', true, false, true, 'register'],
    ['active', true, false, false, null],
    ['upcoming', true, false, false, null],
    ['finished', true, false, true, 'view-results'],
    ['active', false, false, true, null],
    ['upcoming', false, false, true, null],
    ['finished', false, false, false, 'view-results'],
  ] as const)(
    'hub: %s, signed in %s, member %s, registration open %s -> %s',
    (group, signedIn, member, registrationOpen, action) => {
      expect(cardAction({ group, signedIn, member, registrationOpen })).toBe(
        action,
      );
    },
  );
});

describe("widgetsShown: hub.blade.php's widgets", () => {
  it('hub: an upcoming card explains the game and lists its next games, to everyone', () => {
    for (const signedIn of [true, false]) {
      expect(widgetsShown('upcoming', signedIn)).toEqual({
        howItWorks: true,
        upcomingGames: true,
        guestPanels: false,
      });
    }
  });

  it("hub: an active card shows a guest the leaders, medals, next games and stats, and a player nothing", () => {
    expect(widgetsShown('active', false)).toEqual({
      howItWorks: false,
      upcomingGames: true,
      guestPanels: true,
    });
    expect(widgetsShown('active', true)).toEqual({
      howItWorks: false,
      upcomingGames: false,
      guestPanels: false,
    });
  });

  it('hub: a finished card shows nothing', () => {
    expect(widgetsShown('finished', false)).toEqual({
      howItWorks: false,
      upcomingGames: false,
      guestPanels: false,
    });
  });
});

describe("tournamentPageAction: show.blade.php's header button", () => {
  it.each([
    [false, false, true, 'sign-in'],
    [true, false, true, 'register'],
    [true, false, false, 'create-league'],
    [true, true, true, 'create-league'],
  ] as const)(
    'tournament page: signed in %s, member %s, open %s -> %s',
    (signedIn, member, registrationOpen, action) => {
      expect(tournamentPageAction({ signedIn, member, registrationOpen })).toBe(
        action,
      );
    },
  );
});

describe('registrationFormStep: TournamentController::registerForm, R-53', () => {
  it('registration form (R-53): a member is taken in, open or closed', () => {
    expect(registrationFormStep({ member: true, registrationOpen: true })).toBe(
      'member',
    );
    expect(
      registrationFormStep({ member: true, registrationOpen: false }),
    ).toBe('member');
  });

  it('registration form: anyone else gets the form while registration is open, else "closed"', () => {
    expect(
      registrationFormStep({ member: false, registrationOpen: true }),
    ).toBe('open');
    expect(
      registrationFormStep({ member: false, registrationOpen: false }),
    ).toBe('closed');
  });
});
```

- [ ] **Step 5: Run it to see it fail**

Run: `pnpm --filter @sportbet/domain exec vitest run src/hub/hub.test.ts`
Expected: FAIL - `Failed to resolve import "./hub"`.

- [ ] **Step 6: Write `packages/domain/src/hub/hub.ts`**

```ts
import { utcDay } from '../account/session';
import { isFinishedWindowAt, type RegistrationWindow } from '../round/season';
import type { RuleSet } from '../rules/rule-set';
import type { Instant } from '../shared/instant';
import type { TournamentProfile } from '../tournament/tournament-profile';

/** The hub's groups, in the order sportbet lists them (Tournament::DISPLAY_ORDER). */
export const HUB_GROUPS = ['active', 'upcoming', 'finished'] as const;

export type HubGroup = (typeof HUB_GROUPS)[number];

/**
 * Tournament::effectiveStatus: the group a tournament is listed in.
 * Finished first: under sportbet, when the admin marked it finished, when
 * it has games and every one is scored (gameCensus), or once its end date
 * is before today (UTC, so it stays on all of that day); under R-55 only
 * as R-21 finishes it (isFinishedWindowAt). Then upcoming, when the admin
 * says so or its start date is after today (UTC); else active - a missing
 * date has no opinion.
 */
export function hubGroup(input: {
  readonly profile: Pick<TournamentProfile, 'status' | 'startsOn'>;
  readonly window: RegistrationWindow;
  readonly now: Instant;
  readonly rules: RuleSet;
}): HubGroup {
  const { profile, window, now, rules } = input;
  const finished = rules.hubFinishedFollowsR21
    ? isFinishedWindowAt(window, now)
    : profile.status === 'finished' ||
      (window.games > 0 && window.allScored) ||
      (window.endsAt !== null && now >= window.endsAt);
  if (finished) return 'finished';
  if (
    profile.status === 'upcoming' ||
    (profile.startsOn !== null && profile.startsOn > utcDay(now))
  ) {
    return 'upcoming';
  }
  return 'active';
}

/** What orderHub sorts a tournament by. */
export interface HubPlace {
  readonly id: number;
  readonly group: HubGroup;
  /** `YYYY-MM-DD`, or null. */
  readonly startsOn: string | null;
}

function byStart(a: string | null, b: string | null): number {
  if (a === b) return 0;
  if (a === null) return -1;
  if (b === null) return 1;
  return a < b ? -1 : 1;
}

/**
 * Tournament::orderByEffectiveStatus: by group (active, upcoming,
 * finished), then by start date, a tournament with none first. sportbet
 * leaves the rest to PHP's stable sort over rows MySQL returns by id, so
 * the rest is by id.
 */
export function orderHub<T extends HubPlace>(
  places: readonly T[],
): readonly T[] {
  const rank = (place: HubPlace) => HUB_GROUPS.indexOf(place.group);
  return Object.freeze(
    [...places].sort(
      (a, b) =>
        rank(a) - rank(b) || byStart(a.startsOn, b.startsOn) || a.id - b.id,
    ),
  );
}

/**
 * R-50: under the ruled set a non-public tournament is shown - on the hub,
 * and at its own address - only to a player in it and to an admin.
 * sportbet's hub lists every tournament.
 */
export function canSeeTournament(input: {
  readonly isPublic: boolean;
  readonly member: boolean;
  readonly isAdmin: boolean;
  readonly rules: RuleSet;
}): boolean {
  const { isPublic, member, isAdmin, rules } = input;
  return !rules.nonPublicTournamentsHidden || isPublic || member || isAdmin;
}

/**
 * The card's button: "Žaisti →" (play), "Prisijungti →" (join) and
 * "Peržiūrėti →" (view) enter the tournament; "Registruotis į turnyrą →"
 * opens its form; "Peržiūrėti rezultatus →" its page.
 */
export type CardAction = 'play' | 'join' | 'view' | 'register' | 'view-results';

/**
 * hub.blade.php's action button. A finished card lets its players back in
 * and shows anyone else its results page. On an active or upcoming card a
 * player in the tournament enters it, a signed-in player who is not gets
 * the registration link while it is open (issue #63), and a guest gets
 * nothing (issue 105).
 */
export function cardAction(input: {
  readonly group: HubGroup;
  readonly signedIn: boolean;
  readonly member: boolean;
  readonly registrationOpen: boolean;
}): CardAction | null {
  const { group, signedIn, member, registrationOpen } = input;
  if (group === 'finished') return member ? 'view' : 'view-results';
  if (!signedIn) return null;
  if (member) return group === 'active' ? 'play' : 'join';
  return registrationOpen ? 'register' : null;
}

/** Which of a card's widgets the hub draws. */
export interface HubWidgets {
  /** "Kaip tai veikia?" */
  readonly howItWorks: boolean;
  /** "Artėjančios rungtynės", when there are any. */
  readonly upcomingGames: boolean;
  /** "Lyderiai", "Finalų prognozės" and "Statistika". */
  readonly guestPanels: boolean;
}

/**
 * hub.blade.php's widgets: an upcoming card explains the game and lists
 * its next games, to everyone; an active card shows a guest its leaders,
 * medal count, next games and stats; a player's active card and every
 * finished card show none.
 */
export function widgetsShown(group: HubGroup, signedIn: boolean): HubWidgets {
  const guestOnActive = group === 'active' && !signedIn;
  return {
    howItWorks: group === 'upcoming',
    upcomingGames: group === 'upcoming' || guestOnActive,
    guestPanels: guestOnActive,
  };
}

/**
 * The tournament page's header button (show.blade.php): "Prisijungti ir
 * dalyvauti" for a guest; "Registruotis į turnyrą" for a signed-in player
 * not in it while it is open; else "Sukurti lygą šiame turnyre".
 */
export type TournamentPageAction = 'sign-in' | 'register' | 'create-league';

export function tournamentPageAction(input: {
  readonly signedIn: boolean;
  readonly member: boolean;
  readonly registrationOpen: boolean;
}): TournamentPageAction {
  const { signedIn, member, registrationOpen } = input;
  if (!signedIn) return 'sign-in';
  return !member && registrationOpen ? 'register' : 'create-league';
}

/** What the registration form's address answers a signed-in player. */
export type RegistrationFormStep = 'member' | 'closed' | 'open';

/**
 * TournamentController::registerForm with R-53: a player already in the
 * tournament is taken into it, before or after registration closes;
 * anyone else gets the form while registration is open, else the hub with
 * "Registracija į šį turnyrą jau pasibaigė.".
 */
export function registrationFormStep(input: {
  readonly member: boolean;
  readonly registrationOpen: boolean;
}): RegistrationFormStep {
  if (input.member) return 'member';
  return input.registrationOpen ? 'open' : 'closed';
}
```

- [ ] **Step 7: Run it to see it pass**

Run: `pnpm --filter @sportbet/domain exec vitest run src/hub/hub.test.ts`
Expected: PASS, 36 tests.

- [ ] **Step 8: Export them** - in `packages/domain/src/index.ts`, after the `./joining/joining` block:

```ts
export {
  canSeeTournament,
  cardAction,
  HUB_GROUPS,
  hubGroup,
  orderHub,
  registrationFormStep,
  tournamentPageAction,
  widgetsShown,
  type CardAction,
  type HubGroup,
  type HubPlace,
  type HubWidgets,
  type RegistrationFormStep,
  type TournamentPageAction,
} from './hub/hub';
```

- [ ] **Step 9: Verify**

```bash
pnpm format
pnpm test:unit 2>&1 | grep -E "Test Files|Tests "
pnpm --filter @sportbet/domain typecheck && pnpm lint
```

Expected: every domain test passes; typecheck and lint silent. `rules: %s differs between the sets` now runs for the two new keys.

- [ ] **Step 10: Hand to the lead.** Commit message: `feat(domain): the hub's rules - its groups and order (Tournament::effectiveStatus), who sees a tournament (R-50), each card's button and widgets, the page's button, the form's step (R-53); R-50 and R-55 in RuleSet (#19)`.

---

### Task 3 (backend-dev): The top 5's totals, the medal count and sportbet's number format

**Files:**
- Modify: `packages/domain/src/recalculation/recalculation.ts` (`totalsOf` exported as `sumTournamentTotals`)
- Create: `packages/domain/src/recalculation/totals.test.ts`
- Modify: `packages/domain/src/ranking/league-table.ts` (`unicodeCiCompare` exported), `packages/domain/src/ranking/league-table.test.ts`
- Create: `packages/domain/src/hub/medal-tally.ts`, `packages/domain/src/hub/medal-tally.test.ts`
- Create: `packages/domain/src/hub/number-format.ts`, `packages/domain/src/hub/number-format.test.ts`
- Modify: `packages/domain/src/index.ts`

- [ ] **Step 1: Write the failing tests**

`packages/domain/src/recalculation/totals.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import { goldenInputs } from '../golden/golden-scenario';
import { ruledRules, sportbetRules } from '../rules/rule-set';
import { unwrap } from '../testing';
import { recalculateTournament, sumTournamentTotals } from './recalculation';

// Decision 2 of the slice 5 plan: the stored rows of a rule set add up to
// the totals recalculateTournament gave when it wrote them - one sum, so a
// page reading stored rows can never total them differently.

describe('sumTournamentTotals', () => {
  it.each([sportbetRules, ruledRules])(
    'totals ($name): the rows recalculateTournament writes add up to its own totals',
    (rules) => {
      const inputs = goldenInputs();
      const points = unwrap(recalculateTournament(inputs, rules));
      expect(sumTournamentTotals(inputs.players, points)).toEqual(
        points.totals,
      );
    },
  );

  it('totals: a player with no rows has a zero total, and is listed first as given', () => {
    const inputs = goldenInputs();
    const totals = sumTournamentTotals(inputs.players, {
      matches: [],
      standings: [],
      survival: [],
    });
    expect(totals.map(({ player }) => player)).toEqual(inputs.players);
    expect(totals.every(({ match }) => match.hundredths === 0)).toBe(true);
  });
});
```

`packages/domain/src/hub/medal-tally.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import { tallyMedals } from './medal-tally';

// MedalTally::forTournament: how many players put each team first, second,
// third and fourth, most firsts first.

describe('tallyMedals', () => {
  it('medals: counts each final place per team, most firsts, then seconds, then thirds first', () => {
    expect(
      tallyMedals([
        { team: 'Real Madrid', finalPlace: 1 },
        { team: 'Zalgiris Kaunas', finalPlace: 1 },
        { team: 'Zalgiris Kaunas', finalPlace: 1 },
        { team: 'Real Madrid', finalPlace: 2 },
        { team: 'Olympiacos Piraeus', finalPlace: 2 },
        { team: 'Olympiacos Piraeus', finalPlace: 4 },
      ]),
    ).toEqual([
      { team: 'Zalgiris Kaunas', first: 2, second: 0, third: 0, fourth: 0 },
      { team: 'Real Madrid', first: 1, second: 1, third: 0, fourth: 0 },
      { team: 'Olympiacos Piraeus', first: 0, second: 1, third: 0, fourth: 1 },
    ]);
  });

  it("medals: equal counts are listed by team name as MySQL's unicode_ci orders it", () => {
    expect(
      tallyMedals([
        { team: 'Žalgiris', finalPlace: 1 },
        { team: 'Zenit', finalPlace: 1 },
        { team: 'Barcelona', finalPlace: 1 },
      ]).map(({ team }) => team),
    ).toEqual(['Barcelona', 'Žalgiris', 'Zenit']);
  });

  it('medals: no picks, no rows', () => {
    expect(tallyMedals([])).toEqual([]);
  });
});
```

`packages/domain/src/hub/number-format.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import { leaderPoints, numberFormat } from './number-format';

// PHP's number_format, as sportbet prints points ("12.5 pt") and counts
// ("1,234 prognozės").

describe('numberFormat', () => {
  it.each([
    [0, 0, '0'],
    [999, 0, '999'],
    [1234, 0, '1,234'],
    [1234567, 0, '1,234,567'],
    [125, 1, '12.5'],
    [123450, 1, '12,345.0'],
    [-125, 1, '-12.5'],
    [5, 1, '0.5'],
  ] as const)('number format: %i units with %i places is %s', (units, places, text) => {
    expect(numberFormat(units, places)).toBe(text);
  });
});

describe('leaderPoints', () => {
  it.each([
    [1234, '12.3'],
    [1235, '12.4'],
    [-1235, '-12.4'],
    [123456, '1,234.6'],
  ] as const)(
    'leaders: a total of %i cents shows as %s (ROUND(..., 1), half away from zero)',
    (cents, text) => {
      expect(leaderPoints(cents)).toBe(text);
    },
  );
});
```

Add to `packages/domain/src/ranking/league-table.test.ts`:

```ts
describe('unicodeCiCompare', () => {
  it('ranking: reads accented letters as their base and ignores case, as utf8mb4_unicode_ci does, then byte order', () => {
    expect(
      ['Zenit', 'žalgiris', 'Barcelona', 'Žalgiris'].sort(unicodeCiCompare),
    ).toEqual(['Barcelona', 'Žalgiris', 'žalgiris', 'Zenit']);
  });
});
```

(and add `unicodeCiCompare` to that file's import from `./league-table`).

- [ ] **Step 2: Run them to see them fail**

Run: `pnpm --filter @sportbet/domain exec vitest run src/recalculation/totals.test.ts src/hub/medal-tally.test.ts src/hub/number-format.test.ts src/ranking/league-table.test.ts`
Expected: FAIL - `sumTournamentTotals` and `unicodeCiCompare` are not exported; `./medal-tally` and `./number-format` do not resolve.

- [ ] **Step 3: Export the sum** - in `packages/domain/src/recalculation/recalculation.ts`, replace the private `totalsOf(players, matches, standings, survival)` with:

```ts
/**
 * RA-1, SU-2: each player's four parts, summed from one rule set's rows -
 * the players given first (each with zero if they have no row), then
 * anyone else with a row, in order of appearance. recalculateTournament
 * totals its own rows with it, and a page reading stored rows (the hub's
 * top 5) totals them with it too: the only place points are added up.
 */
export function sumTournamentTotals(
  players: readonly PlayerId[],
  rows: {
    readonly matches: readonly StoredMatchRow[];
    readonly standings: readonly StandingsRow[];
    readonly survival: readonly SurvivalPoints[];
  },
): readonly TournamentTotal[] {
```

with the old body unchanged except that `matches`, `standings` and `survival` are read from `rows` (`for (const row of rows.matches)`, `rows.standings`, `rows.survival`). Its one caller becomes:

```ts
      totals: sumTournamentTotals(inputs.players, {
        matches,
        standings,
        survival: survival.value,
      }),
```

and add `sumTournamentTotals,` to the `./recalculation/recalculation` block of `packages/domain/src/index.ts`. The comment above that block ("its internals and are not exported") stays true: the sum is now part of its interface.

- [ ] **Step 4: Export the accent-blind order** - in `packages/domain/src/ranking/league-table.ts`, add after `const accentBlind = ...`:

```ts
/**
 * MySQL's utf8mb4_unicode_ci, as near as an ICU collator comes: case and
 * accents ignored ("Š" reads as "S"), byte order breaking what it calls
 * equal. sportbet's Lyderiai tie order and its medal count's team order.
 */
export function unicodeCiCompare(a: string, b: string): number {
  return accentBlind.compare(a, b) || byteOrder(a, b);
}
```

and in `tieOrder` replace `: (a, b) => accentBlind.compare(a, b) || byteOrder(a, b);` with `: unicodeCiCompare;`. Add `unicodeCiCompare,` to the `./ranking/league-table` block of `packages/domain/src/index.ts`.

- [ ] **Step 5: Write `packages/domain/src/hub/medal-tally.ts`**

```ts
import { unicodeCiCompare } from '../ranking/league-table';

/** One listed player's final place (1 to 4) for one team, by the team's name. */
export interface MedalPick {
  readonly team: string;
  readonly finalPlace: number;
}

/** One team's line of "Finalų prognozės". */
export interface MedalRow {
  readonly team: string;
  readonly first: number;
  readonly second: number;
  readonly third: number;
  readonly fourth: number;
}

/**
 * MedalTally::forTournament: how many players put each team first,
 * second, third and fourth, grouped by team name, the most firsts first,
 * then seconds, then thirds, then the name (utf8mb4_unicode_ci). Who
 * counts is the caller's: the listed players (MedalTally's active
 * accounts).
 */
export function tallyMedals(picks: readonly MedalPick[]): readonly MedalRow[] {
  const byTeam = new Map<string, [number, number, number, number]>();
  for (const { team, finalPlace } of picks) {
    const counts = byTeam.get(team) ?? [0, 0, 0, 0];
    const index = finalPlace - 1;
    if (index >= 0 && index < counts.length) {
      counts[index] = (counts[index] ?? 0) + 1;
    }
    byTeam.set(team, counts);
  }
  return Object.freeze(
    [...byTeam]
      .map(([team, [first, second, third, fourth]]) =>
        Object.freeze({ team, first, second, third, fourth }),
      )
      .sort(
        (a, b) =>
          b.first - a.first ||
          b.second - a.second ||
          b.third - a.third ||
          unicodeCiCompare(a.team, b.team),
      ),
  );
}
```

- [ ] **Step 6: Write `packages/domain/src/hub/number-format.ts`**

```ts
import { roundUnits } from '../points/fixed-point';

/**
 * PHP's number_format with its defaults, as sportbet prints numbers:
 * `units` hundredths-style fixed point with `places` decimals ("1,234",
 * "12.5"), ',' between thousands, '.' before the decimals. The value is
 * already rounded to `places`.
 */
export function numberFormat(units: number, places: number): string {
  const scale = 10 ** places;
  const sign = units < 0 ? '-' : '';
  const absolute = Math.abs(units);
  const whole = String(Math.floor(absolute / scale)).replace(
    /\B(?=(\d{3})+(?!\d))/g,
    ',',
  );
  if (places === 0) return `${sign}${whole}`;
  return `${sign}${whole}.${String(absolute % scale).padStart(places, '0')}`;
}

/**
 * A leader's total as the hub prints it: PlayerTotals' ROUND(total, 1),
 * half away from zero, through number_format (`{{ number_format($p->total_points, 1) }} pt`).
 */
export function leaderPoints(totalCents: number): string {
  return numberFormat(roundUnits(totalCents, 1), 1);
}
```

- [ ] **Step 7: Export them** - in `packages/domain/src/index.ts`, after the `./hub/hub` block:

```ts
export {
  tallyMedals,
  type MedalPick,
  type MedalRow,
} from './hub/medal-tally';
export { leaderPoints, numberFormat } from './hub/number-format';
```

- [ ] **Step 8: Verify**

```bash
pnpm format
pnpm --filter @sportbet/domain exec vitest run src/recalculation src/hub src/ranking src/golden
pnpm test:unit 2>&1 | grep -E "Test Files|Tests "
pnpm --filter @sportbet/domain typecheck && pnpm lint
```

Expected: PASS everywhere, the golden master unchanged; typecheck and lint silent.

- [ ] **Step 9: Hand to the lead.** Commit message: `feat(domain): one sum of a rule set's stored rows (sumTournamentTotals), the medal count (MedalTally), sportbet's number format; the accent-blind order exported (#19)`.

---

### Task 4 (backend-dev): The profile stored - migration 0010, its repository, each window by id, the last-used tournament written, staging's seed

**Files:**
- Modify: `packages/db/src/tournament/schema.ts`
- Create: `packages/db/migrations/0010_tournament-hub-columns.sql` (generated) and its `meta/` snapshot
- Create: `packages/db/src/tournament/profile.ts`, `packages/db/test/tournament-profile.test.ts`
- Modify: `packages/db/src/joining/repository.ts` (`loadRegistrationWindowsById`), `packages/db/test/joining.test.ts`
- Modify: `packages/db/src/account/repository.ts` (`setLastTournament`), `packages/db/test/account.test.ts`
- Modify: `packages/db/src/seed/staging.ts`, `packages/db/test/seed.test.ts`
- Modify: `packages/db/src/index.ts`

- [ ] **Step 1: Write the failing test** - `packages/db/test/tournament-profile.test.ts`

```ts
import type { TournamentProfile } from '@sportbet/domain';
import { describe, expect, it } from 'vitest';
import {
  insertTournaments,
  loadTournamentProfiles,
  saveTournamentProfile,
} from '../src';
import { saveTournament } from '../src/tournament/repository';
import { useTestDatabase } from '../src/testing';
import { OTHER, TOURNAMENT } from './world';

const { db } = useTestDatabase();

const PROFILE: TournamentProfile = {
  status: 'active',
  startsOn: '2026-09-30',
  sport: 'basketball',
  description: 'Eurolygos sezonas',
  isPublic: false,
};

describe('tournament profiles', () => {
  it("profile: a tournament saved without one has sportbet's defaults: upcoming, no date, public", async () => {
    await saveTournament(db, TOURNAMENT);
    expect(await loadTournamentProfiles(db)).toEqual(
      new Map([
        [
          TOURNAMENT.id,
          {
            status: 'upcoming',
            startsOn: null,
            sport: 'basketball',
            description: null,
            isPublic: true,
          },
        ],
      ]),
    );
  });

  it('profile: is saved for its tournament alone, and read back by id', async () => {
    await saveTournament(db, TOURNAMENT);
    await saveTournament(db, OTHER);
    await saveTournamentProfile(db, TOURNAMENT, PROFILE);
    const profiles = await loadTournamentProfiles(db);
    expect(profiles.get(TOURNAMENT.id)).toEqual(PROFILE);
    expect(profiles.get(OTHER.id)?.status).toBe('upcoming');
  });

  it('profile: saving one for a tournament that is not stored is a programmer error', async () => {
    await expect(saveTournamentProfile(db, TOURNAMENT, PROFILE)).rejects.toThrow(
      'saveTournamentProfile: tournament 3 is not stored',
    );
  });

  it('profile: a tournament inserted by slug gets the defaults too', async () => {
    await insertTournaments(db, [
      newTournamentSchema.parse({ ...TOURNAMENT, slug: 'by-slug' }),
    ]);
    expect([...(await loadTournamentProfiles(db)).values()]).toHaveLength(1);
  });
});
```

`insertTournaments` takes `NewTournament`s, so the last test passes `newTournamentSchema.parse({ ...TOURNAMENT, slug: 'by-slug' })` (Zod strips the `id`; import `newTournamentSchema` from `@sportbet/domain`).

- [ ] **Step 2: Run it to see it fail**

Run: `pnpm --filter @sportbet/db exec vitest run test/tournament-profile.test.ts`
Expected: FAIL - `loadTournamentProfiles` is not exported.

- [ ] **Step 3: The columns** - in `packages/db/src/tournament/schema.ts`, import `TOURNAMENT_STATUSES` from `@sportbet/domain`, add after `formatEnum`:

```ts
/** sportbet's `status` enum, built from the domain's list (TOURNAMENT_STATUSES). */
export const tournamentStatusEnum = pgEnum(
  'tournament_status',
  TOURNAMENT_STATUSES,
);
```

and in the `tournaments` table, after `standingsTableFinal`:

```ts
    /**
     * The hub's columns (slice 5; TournamentProfile), sportbet's own, with
     * its defaults: copied from production, not yet edited by any admin
     * screen. `sport` defaults to basketball (decision 11).
     */
    status: tournamentStatusEnum('status').notNull().default('upcoming'),
    startsOn: date('starts_on', { mode: 'string' }),
    sport: text('sport').notNull().default('basketball'),
    description: text('description'),
    isPublic: boolean('is_public').notNull().default(true),
```

- [ ] **Step 4: Generate migration 0010**

```bash
pnpm --filter @sportbet/db db:generate --name tournament-hub-columns
cat packages/db/migrations/0010_tournament-hub-columns.sql
```

Expected: `0010_tournament-hub-columns.sql` holding exactly one `CREATE TYPE "public"."tournament_status" AS ENUM('upcoming', 'active', 'finished');` and five `ALTER TABLE "tournaments" ADD COLUMN ...` lines: `"status" "tournament_status" DEFAULT 'upcoming' NOT NULL`, `"starts_on" date`, `"sport" text DEFAULT 'basketball' NOT NULL`, `"description" text`, `"is_public" boolean DEFAULT true NOT NULL`. Nothing else (no drop, no other table). Review it; it is committed as generated. No CHECK is added, so `INVARIANT_CHECKS` is unchanged.

- [ ] **Step 5: Write `packages/db/src/tournament/profile.ts`**

```ts
import {
  tournamentProfileSchema,
  type Tournament,
  type TournamentProfile,
} from '@sportbet/domain';
import { asc, eq } from 'drizzle-orm';
import { z } from 'zod';
import type { Executor } from '../client';
import { tournaments } from './schema';

const profileRows = z.array(
  z.object({ id: z.int() }).extend(tournamentProfileSchema.shape),
);

/**
 * Writes the tournament's profile (slice 5): the reader's copy of
 * production's, or the staging seed's. The tournament must be stored
 * already: a profile for none is a programmer error.
 */
export async function saveTournamentProfile(
  db: Executor,
  tournament: Tournament,
  profile: TournamentProfile,
): Promise<void> {
  const row = tournamentProfileSchema.parse(profile);
  const saved = await db
    .update(tournaments)
    .set({
      status: row.status,
      startsOn: row.startsOn,
      sport: row.sport,
      description: row.description,
      isPublic: row.isPublic,
    })
    .where(eq(tournaments.id, tournament.id))
    .returning({ id: tournaments.id });
  if (saved.length === 0) {
    throw new Error(
      `saveTournamentProfile: tournament ${String(tournament.id)} is not stored`,
    );
  }
}

/** Every tournament's profile, by id. */
export async function loadTournamentProfiles(
  db: Executor,
): Promise<Map<number, TournamentProfile>> {
  const rows = await db
    .select({
      id: tournaments.id,
      status: tournaments.status,
      startsOn: tournaments.startsOn,
      sport: tournaments.sport,
      description: tournaments.description,
      isPublic: tournaments.isPublic,
    })
    .from(tournaments)
    .orderBy(asc(tournaments.id));
  return new Map(
    profileRows.parse(rows).map(({ id, ...profile }) => [id, profile]),
  );
}
```

Export both from `packages/db/src/index.ts`:

```ts
export {
  loadTournamentProfiles,
  saveTournamentProfile,
} from './tournament/profile';
```

Run: `pnpm --filter @sportbet/db exec vitest run test/tournament-profile.test.ts`
Expected: PASS, 4 tests.

- [ ] **Step 6: Each window by id** - in `packages/db/src/joining/repository.ts`, rename the query function to `loadRegistrationWindowsById`, returning `Promise<Map<number, RegistrationWindow>>` (`new Map(windowRows.parse(rows).map((row) => [row.id, { ...as today... }]))`, its comment adding "keyed by tournament id"), and keep `loadRegistrationWindows` as:

```ts
/** Every tournament's RegistrationWindow, by id (loadRegistrationWindowsById). */
export async function loadRegistrationWindows(
  db: Executor,
): Promise<RegistrationWindow[]> {
  return [...(await loadRegistrationWindowsById(db)).values()];
}
```

The query's `.orderBy(asc(tournaments.id))` stays, so the list keeps its order. Export `loadRegistrationWindowsById` from `packages/db/src/index.ts`'s joining block. In `packages/db/test/joining.test.ts`, inside the existing `loadRegistrationWindows` test, add after its first `expect`:

```ts
    expect([...(await loadRegistrationWindowsById(db)).keys()]).toEqual([
      TOURNAMENT.id,
      OTHER.id,
    ]);
```

(importing `loadRegistrationWindowsById` from `../src/joining/repository` beside `loadRegistrationWindows`).

Run: `pnpm --filter @sportbet/db exec vitest run test/joining.test.ts`
Expected: PASS.

- [ ] **Step 7: The last-used tournament** - append to `packages/db/test/account.test.ts`:

```ts
describe('setLastTournament (R-28)', () => {
  it('account: writes the tournament the player used last, and clears it', async () => {
    await saveWorld(db);
    await savePlayerSettings(db, [
      { player: ADA, locale: 'lt', adminLevel: 0, lastTournament: null },
    ]);
    await setLastTournament(db, ADA, TOURNAMENT.id);
    expect((await listPlayerSettings(db))[0]?.lastTournament).toBe(
      TOURNAMENT.id,
    );
    await setLastTournament(db, ADA, null);
    expect((await listPlayerSettings(db))[0]?.lastTournament).toBeNull();
  });

  it('account: a player without settings is a programmer error', async () => {
    await saveWorld(db);
    await expect(setLastTournament(db, ADA, TOURNAMENT.id)).rejects.toThrow(
      'setLastTournament: the player has no settings',
    );
  });
});
```

(add `setLastTournament`, `savePlayerSettings`, `listPlayerSettings` to the file's `../src` import and `ADA`, `saveWorld`, `TOURNAMENT` from `./world` where not imported yet).

Run: `pnpm --filter @sportbet/db exec vitest run test/account.test.ts`
Expected: FAIL - `setLastTournament` is not exported.

Add to `packages/db/src/account/repository.ts`:

```ts
/**
 * R-28: the tournament the player used last ("Žaisti", joining from its
 * form), or none ("Keisti turnyrą"). Every account has its settings row
 * (createAccount, the reader); a player without one is a programmer error.
 */
export async function setLastTournament(
  db: Executor,
  player: PlayerId,
  tournament: number | null,
): Promise<void> {
  const saved = await db
    .update(playerSettings)
    .set({ lastTournamentId: tournament })
    .where(eq(playerSettings.playerId, keyOf(player, 'player')))
    .returning({ player: playerSettings.playerId });
  if (saved.length === 0) {
    throw new Error('setLastTournament: the player has no settings');
  }
}
```

and `setLastTournament,` to the account block of `packages/db/src/index.ts`.

Run: `pnpm --filter @sportbet/db exec vitest run test/account.test.ts`
Expected: PASS.

- [ ] **Step 8: Staging's seed** - the hub's three groups, a non-public tournament and a next game (design decision 11). Replace `STAGING_TOURNAMENTS` in `packages/db/src/seed/staging.ts` and seed the profiles and the game:

```ts
/** A staging tournament and what the hub shows of it. */
export interface StagingTournament {
  readonly tournament: NewTournament;
  readonly profile: TournamentProfile;
}

const EUROLEAGUE = {
  format: 'euroleague',
  standingsDeadlineRound: null,
  survival: true,
  standingsTableFinal: false,
} as const;

const PROFILE = {
  sport: 'basketball',
  description: null,
  isPublic: true,
} as const;

/**
 * Staging's fake data. Never real players or real tournaments' results.
 * The hub's three groups (2026/27 active, 2027/28 upcoming, 2025/26
 * finished) and a non-public tournament, finished so that no sign-up can
 * join it (R-50, and Task 6A).
 */
export const STAGING_TOURNAMENTS: readonly StagingTournament[] = [
  {
    tournament: {
      ...EUROLEAGUE,
      slug: 'euroleague-2025-26',
      name: 'Euroleague 2025/26',
      endsOn: '2026-05-24',
    },
    profile: { ...PROFILE, status: 'finished', startsOn: '2025-10-01' },
  },
  {
    tournament: {
      ...EUROLEAGUE,
      slug: 'euroleague-2026-27',
      name: 'Euroleague 2026/27',
      endsOn: '2027-05-23',
    },
    profile: { ...PROFILE, status: 'active', startsOn: '2026-09-30' },
  },
  {
    tournament: {
      ...EUROLEAGUE,
      slug: 'euroleague-2027-28',
      name: 'Euroleague 2027/28',
      endsOn: '2028-05-21',
    },
    profile: { ...PROFILE, status: 'upcoming', startsOn: '2027-10-01' },
  },
  {
    tournament: {
      ...EUROLEAGUE,
      slug: 'bandomasis-turnyras',
      name: 'Bandomasis turnyras',
      endsOn: '2026-06-30',
    },
    profile: {
      ...PROFILE,
      status: 'finished',
      startsOn: '2026-01-01',
      isPublic: false,
    },
  },
];

/**
 * Euroleague 2026/27's one game, far ahead (2027-03-04): a next game makes
 * R-48 join every staging sign-up to 2026/27 rather than to the newer
 * 2027/28, which has none, and fills the guest's "Artėjančios rungtynės".
 * Ids from 9001, clear of any a real season uses on staging.
 */
const STAGING_SEASON = {
  plays: 'euroleague-2026-27',
  teams: [
    { id: team('9001'), name: 'Zalgiris Kaunas' },
    { id: team('9002'), name: 'Real Madrid' },
  ],
  round: {
    id: 9001,
    name: '1 turas',
    round: Round.stored({
      number: mustRound(1),
      stage: 'regular',
      rate: mustRate(1),
      survival: false,
      knockout: false,
    }),
  },
  tipOff: '2027-03-04T18:00:00Z',
  game: 9001,
} as const;
```

The helpers it needs, at the top of the file (the seed is not test code, so it cannot use `@sportbet/domain/testing`):

```ts
import {
  Game,
  gameId,
  instantFrom,
  Rate,
  Round,
  roundNumber,
  teamId,
  type EmailAddress,
  type Result,
  type TeamId,
  type TournamentProfile,
} from '@sportbet/domain';
import { advanceIdentitySequences } from '../identity';
import { saveGames, saveRounds } from '../season/repository';
import { saveTeams } from '../team/repository';
import { saveTournamentProfile } from '../tournament/profile';

/** The seed's own constants are valid; a refusal is a programmer error. */
function must<T, R extends string>(result: Result<T, R>): T {
  if (!result.ok) throw new Error(`seed: ${result.refusal}`);
  return result.value;
}
const team = (id: string): TeamId => must(teamId(id));
const mustRound = (n: number) => must(roundNumber(n));
const mustRate = (n: number) => must(Rate.of(n));
```

(each name is exported by `@sportbet/domain` today - `Round.stored`, `Rate.of`, `Game.schedule`, `gameId`, `teamId`, `roundNumber`, `instantFrom`; check with `grep -n "Rate\b\|gameId\|teamId\|roundNumber\|instantFrom" packages/domain/src/index.ts` and import from where it is exported if a name differs.)

`seedStaging` becomes:

```ts
export async function seedStaging(
  db: Db,
  accountEmail: EmailAddress | null,
): Promise<void> {
  await insertTournaments(
    db,
    STAGING_TOURNAMENTS.map(({ tournament }) => tournament),
  );
  for (const { tournament, profile } of STAGING_TOURNAMENTS) {
    const stored = await findTournamentBySlug(db, tournament.slug);
    if (stored === undefined) {
      throw new Error('seed: a staging tournament is missing');
    }
    await saveTournamentProfile(db, stored, profile);
  }
  await seedSeason(db);
  if (accountEmail === null) return;
  // ... the account, as today
}

/** STAGING_SEASON, saved again on every run (each save is an upsert). */
async function seedSeason(db: Db): Promise<void> {
  const tournament = await findTournamentBySlug(db, STAGING_SEASON.plays);
  const [home, away] = STAGING_SEASON.teams;
  if (tournament === undefined || home === undefined || away === undefined) {
    throw new Error('seed: the staging season has no tournament');
  }
  await saveTeams(db, tournament, STAGING_SEASON.teams);
  await saveRounds(db, tournament, [STAGING_SEASON.round]);
  await saveGames(db, tournament, [
    must(
      Game.schedule({
        id: must(gameId(STAGING_SEASON.game)),
        round: STAGING_SEASON.round.round.number,
        home: home.id,
        away: away.id,
        tipOff: must(instantFrom(STAGING_SEASON.tipOff)),
      }),
    ),
  ]);
  await advanceIdentitySequences(db);
}
```

`seed.test.ts`'s first test becomes:

```ts
it('seeds the staging tournaments with their profiles and 2026/27 its one game, and running it again adds nothing', async () => {
  await seedStaging(db, null);
  await seedStaging(db, null);
  const stored = await listTournaments(db);
  const profiles = await loadTournamentProfiles(db);
  const seeded = stored.map((tournament) => ({
    tournament: newTournamentSchema.parse(tournament),
    profile: profiles.get(tournament.id),
  }));
  const byName = (a: StagingTournament, b: StagingTournament) =>
    a.tournament.name.localeCompare(b.tournament.name);
  expect(seeded).toEqual([...STAGING_TOURNAMENTS].sort(byName));
  const games = await client.query('select id from games');
  expect(z.array(z.object({ id: z.int() })).parse(games.rows)).toEqual([
    { id: 9001 },
  ]);
  expect(await listPlayers(db)).toEqual([]);
});
```

(`listTournaments` orders by name, as `localeCompare` does for these four names; add `loadTournamentProfiles` to the `../src` import and `type StagingTournament` to the `../src/seed/staging` import.)

Run: `pnpm --filter @sportbet/db exec vitest run test/seed.test.ts`
Expected: PASS, both tests (the account test unchanged).

- [ ] **Step 9: Verify**

```bash
pnpm format
pnpm test:db 2>&1 | grep -E "Test Files|Tests "
pnpm --filter @sportbet/db typecheck && pnpm lint
```

Expected: every db test passes - `invariant-checks.test.ts` and `schema.test.ts` included (no CHECK added); typecheck and lint silent.

- [ ] **Step 10: Hand to the lead.** Commit message: `feat(db): migration 0010 - a tournament's status, start date, sport, description and public switch, sportbet's defaults; the profile's repository, each window by id, the last-used tournament written; staging seeds the hub's groups, a non-public tournament and a next game (#19)`.

---

### Task 5 (backend-dev): The reader copies the profile from production

**Files:**
- Modify: `tools/migrate/src/read-columns.ts`, `tools/migrate/src/read-columns.test.ts`
- Modify: `tools/migrate/src/map.ts` (`MappedTournament.profile`), `tools/migrate/src/load.ts`
- Modify: `tools/migrate/test/map.test.ts`, `tools/migrate/test/load.test.ts`

- [ ] **Step 1: Write the failing tests**

In `tools/migrate/src/read-columns.test.ts`, beside the users test:

```ts
  it("reads a tournament's profile - status, start date, sport, description, public switch - and never its cover image", () => {
    expect(Object.keys(READ_COLUMNS.tournaments.shape)).toEqual([
      'id',
      'slug',
      'name',
      'standings_format',
      'standings_deadline_round',
      'end_date',
      'survival_game',
      'sport',
      'status',
      'start_date',
      'description',
      'is_public',
    ]);
  });
```

In `tools/migrate/test/map.test.ts`, in `describe('map: the golden scenario', ...)`:

```ts
  it("map: the tournament's profile is production's: status, start date, sport, description, public switch", () => {
    expect(mapped.profile).toEqual({
      status: 'active',
      startsOn: null,
      sport: 'basketball',
      description: null,
      isPublic: true,
    });
  });
```

and in the refusals describe (beside the end-date refusal at `end_date: '2027-02-30'`):

```ts
  it('map: a tournament whose status sportbet does not have is refused, with every row of it', () => {
    const mapped = map(
      changed('tournaments', (rows) =>
        rows.map((row) =>
          row['id'] === EUROLEAGUE ? { ...row, status: 'paused' } : row,
        ),
      ),
    );
    expect(countOf(mapped, 'tournaments').refused).toEqual({ 'bad-status': 1 });
    expect(mapped.tournaments).toEqual([]);
  });
```

`status` is a MySQL enum, so the synthetic dump cannot hold 'paused' when it is loaded into MySQL: this test maps rows in memory only (`map(...)` reads `readRows(dump)`, no container), as the end-date refusal test does.

In `tools/migrate/test/load.test.ts`, beside the end-date test:

```ts
  it("loads each tournament's profile", async () => {
    await loadMapped(db, mapSportbet(readRows(syntheticDump())));
    const tournament = await findTournamentBySlug(db, 'golden-el');
    if (tournament === undefined) throw new Error('golden-el was not loaded');
    expect((await loadTournamentProfiles(db)).get(tournament.id)).toEqual({
      status: 'active',
      startsOn: null,
      sport: 'basketball',
      description: null,
      isPublic: true,
    });
  });
```

(`loadTournamentProfiles` from `@sportbet/db`).

- [ ] **Step 2: Run them to see them fail**

Run: `pnpm --filter @sportbet/migrate exec vitest run src/read-columns.test.ts test/map.test.ts test/load.test.ts`
Expected: FAIL - the five columns are not read; `mapped.profile` is undefined.

- [ ] **Step 3: Read the columns** - in `tools/migrate/src/read-columns.ts`, `READ_COLUMNS.tournaments` gains, after `survival_game`:

```ts
    sport: text('varchar(255)'),
    status: text("enum('upcoming','active','finished')"),
    start_date: maybeText('date'),
    description: maybeText('text'),
    is_public: whole('tinyint(1)'),
```

and the file's header comment gains, after the `users` sentence: "From `tournaments` it reads the hub's profile too - status, start date, sport, description and public switch (slice 5) - never `cover_image`." The schema drift check compares each type with production's `information_schema.columns`; these are the types sportbet's migrations give (`2026_06_30_100000_create_tournaments_and_add_fks.php`), as `test/fixtures/create-tables.ts` already declares them.

- [ ] **Step 4: Map them** - in `tools/migrate/src/map.ts`:

`MappedTournament` gains:

```ts
  /** The hub's profile (slice 5), through sportbetColumns.tournamentProfile. */
  readonly profile: TournamentProfile;
```

(import `type TournamentProfile` from `@sportbet/domain`). The tournaments loop maps both and keeps the profile:

```ts
  const tournaments = new Map<number, Tournament>();
  const profiles = new Map<number, TournamentProfile>();
  for (const row of rows.tournaments) {
    const mapped = sportbetColumns.tournament(row);
    const profile = sportbetColumns.tournamentProfile(row);
    if (mapped.ok && profile.ok) {
      tournaments.set(row.id, mapped.value);
      profiles.set(row.id, profile.value);
      tournamentFates.set(row.id, LOADED);
      ledger.load('tournaments');
    } else if (!mapped.ok && mapped.refusal === 'format-not-ported') {
      tournamentFates.set(row.id, skipped('not-euroleague'));
      ledger.skip('tournaments', 'not-euroleague');
    } else {
      const refusal = !mapped.ok
        ? mapped.refusal
        : !profile.ok
          ? profile.refusal
          : null;
      if (refusal === null) {
        throw new ReaderProblem('map: a tournament both loaded and refused');
      }
      tournamentFates.set(row.id, refused(refusal));
      ledger.refuse('tournaments', refusal, `id ${String(row.id)}`);
    }
  }
```

Where each `MappedTournament` is pushed (`mapped.push({ tournament, ... })`), take its profile (`must` is the file's own: `must(result, what)` takes a `Result`, so check the map directly):

```ts
    const profile = profiles.get(id);
    if (profile === undefined) {
      throw new ReaderProblem('map: a loaded tournament has no profile');
    }
```

before the push, and `profile,` in it.

- [ ] **Step 5: Load them** - in `tools/migrate/src/load.ts`, inside the transaction, right after `await saveTournamentSnapshot(tx, each);`:

```ts
      await saveTournamentProfile(tx, each.tournament, each.profile);
```

(import `saveTournamentProfile` from `@sportbet/db`), and the comment above `loadMapped` names it: "...each tournament's snapshot (saveTournamentSnapshot, which owns the foreign-key order) and its profile...".

- [ ] **Step 6: Verify**

```bash
pnpm format
pnpm test:migrate 2>&1 | grep -E "Test Files|Tests "
pnpm --filter @sportbet/migrate typecheck && pnpm lint
```

Expected: every reader test passes - `reader.test.ts` and `reader-parity.test.ts` included, so the synthetic dump loads through MySQL with the five columns and the drift check finds every type; typecheck and lint silent.

- [ ] **Step 7: Hand to the lead.** Commit message: `feat(migrate): read each tournament's status, start date, sport, description and public switch, and load them as its profile (#19)`.

---

### Task 6 (backend-dev): The pages' data - `loadHub`, `loadTournamentPage`, `loadRegistrationForm`, `findVisibleTournament`

**Files:**
- Create: `packages/db/src/hub/repository.ts`, `packages/db/test/hub.test.ts`
- Modify: `packages/db/src/index.ts`

- [ ] **Step 1: Write the failing test** - `packages/db/test/hub.test.ts`

```ts
// TournamentController::hub, show and registerForm's data: which
// tournaments a viewer sees, in which group and order, with which button
// and widgets; a guest's top 5, medal count and stats (PlayerTotals,
// MedalTally); the page's header; the form's step.

import {
  Game,
  MatchPrediction,
  ruledRules,
  sportbetRules,
  StandingsPrediction,
  type TournamentProfile,
} from '@sportbet/domain';
import {
  at,
  gameNo,
  player,
  roundNo,
  teamPick,
  testPlayer,
  unwrap,
} from '@sportbet/domain/testing';
import { describe, expect, it } from 'vitest';
import {
  findVisibleTournament,
  loadHub,
  loadRegistrationForm,
  loadTournamentPage,
  recalculateUnderRuleSet,
  savePlayers,
  saveTournamentProfile,
} from '../src';
import { saveTournamentPlayers } from '../src/player/repository';
import { saveMatchPredictions } from '../src/prediction/repository';
import { saveGames } from '../src/season/repository';
import { saveStandingsPredictions } from '../src/standings/repository';
import { saveTournament } from '../src/tournament/repository';
import { useTestDatabase } from '../src/testing';
import {
  ADA,
  BEN,
  CAI,
  FEN,
  G10,
  G7,
  G8,
  G9,
  OLY,
  OTHER,
  REA,
  savePlaying,
  saveWorld,
  TOURNAMENT,
  ZAL,
} from './world';

const { db } = useTestDatabase();

/** After game 7 (scored), before the locked game 10 and the postponed game 9; G11 and G12 to come. */
const NOW = at('2026-10-05T12:00:00Z');

const GUEST = { player: null, isAdmin: false } as const;
const ADA_SIGNED_IN = { player: ADA, isAdmin: false } as const;
const DAN = player('4');
const DAN_SIGNED_IN = { player: DAN, isAdmin: false } as const;
const ADMIN = { player: DAN, isAdmin: true } as const;

const ACTIVE: TournamentProfile = {
  status: 'active',
  startsOn: '2026-09-30',
  sport: 'basketball',
  description: 'Eurolygos sezonas',
  isPublic: true,
};

/** A round-1 game still to come: one game per round and pair of teams (D16(c)). */
const future = (
  id: number,
  home: typeof OLY,
  away: typeof OLY,
  tipOff: string,
) =>
  unwrap(
    Game.stored({
      id: gameNo(id),
      round: roundNo(1),
      home,
      away,
      tipOff: at(tipOff),
      result: null,
      recordedWinner: null,
      lockedSince: null,
      postponed: false,
    }),
  );

const G11 = future(11, OLY, REA, '2026-10-12T18:00:00Z');
const G12 = future(12, FEN, ZAL, '2026-10-14T18:00:00Z');
const G13 = future(13, OLY, FEN, '2026-10-20T18:00:00Z');
const G14 = future(14, FEN, REA, '2026-10-22T18:00:00Z');

const prediction = (who: typeof ADA, home: number, away: number) =>
  unwrap(
    MatchPrediction.stored({
      player: who,
      game: G7.id,
      home,
      away,
      origin: 'real',
      filledInAt: null,
    }),
  );

/**
 * TOURNAMENT (3) active with games 7 to 14 and ada, ben and cai in it;
 * OTHER (4) upcoming, starting 2027-10-01, with no games; dan in nothing.
 */
async function hub(): Promise<void> {
  await saveWorld(db);
  await saveTournament(db, OTHER);
  await savePlayers(db, [testPlayer(DAN, 'dan')]);
  await saveGames(db, TOURNAMENT, [G7, G8, G9, G10, G11, G12, G13, G14]);
  await savePlaying(db, TOURNAMENT, ADA, BEN, CAI);
  await saveTournamentProfile(db, TOURNAMENT, ACTIVE);
  await saveTournamentProfile(db, OTHER, {
    ...ACTIVE,
    status: 'upcoming',
    startsOn: '2027-10-01',
    description: null,
  });
}

describe('loadHub: who sees what, in which group and order', () => {
  it('hub: lists active before upcoming, each with its profile and group', async () => {
    await hub();
    const cards = await loadHub(db, GUEST, NOW, ruledRules);
    expect(
      cards.map(({ tournament, group }) => [tournament.id, group]),
    ).toEqual([
      [TOURNAMENT.id, 'active'],
      [OTHER.id, 'upcoming'],
    ]);
    expect(cards[0]?.profile).toEqual(ACTIVE);
  });

  it('hub (sportbet): an admin marking a tournament finished moves it to finished; (ruled, R-55) it stays where R-21 has it', async () => {
    await hub();
    await saveTournamentProfile(db, TOURNAMENT, {
      ...ACTIVE,
      status: 'finished',
    });
    const group = async (rules: typeof ruledRules) =>
      (await loadHub(db, GUEST, NOW, rules)).find(
        ({ tournament }) => tournament.id === TOURNAMENT.id,
      )?.group;
    expect(await group(sportbetRules)).toBe('finished');
    expect(await group(ruledRules)).toBe('active');
  });

  it('hub (ruled, R-50): a non-public tournament is left out for a guest and a player not in it, and shown to its players and to an admin', async () => {
    await hub();
    await saveTournamentProfile(db, TOURNAMENT, { ...ACTIVE, isPublic: false });
    const ids = async (viewer: Parameters<typeof loadHub>[1]) =>
      (await loadHub(db, viewer, NOW, ruledRules)).map(
        ({ tournament }) => tournament.id,
      );
    expect(await ids(GUEST)).toEqual([OTHER.id]);
    expect(await ids(DAN_SIGNED_IN)).toEqual([OTHER.id]);
    expect(await ids(ADA_SIGNED_IN)).toEqual([TOURNAMENT.id, OTHER.id]);
    expect(await ids(ADMIN)).toEqual([TOURNAMENT.id, OTHER.id]);
  });

  it('hub (sportbet): a non-public tournament is listed for everyone', async () => {
    await hub();
    await saveTournamentProfile(db, TOURNAMENT, { ...ACTIVE, isPublic: false });
    expect(await loadHub(db, GUEST, NOW, sportbetRules)).toHaveLength(2);
  });
});

describe("loadHub: each card's button", () => {
  it('hub: a player in it plays; a signed-in player not in it registers while it is open; a guest gets nothing', async () => {
    await hub();
    const action = async (viewer: Parameters<typeof loadHub>[1]) =>
      (await loadHub(db, viewer, NOW, ruledRules)).map(({ action }) => action);
    // Ada plays 3; 4 (no games) is open to her too.
    expect(await action(ADA_SIGNED_IN)).toEqual(['play', 'register']);
    // R-8: 3 is open until its round-5 deadline (none here), 4 too.
    expect(await action(DAN_SIGNED_IN)).toEqual(['register', 'register']);
    expect(await action(GUEST)).toEqual([null, null]);
  });

  it('hub (sportbet): registration closed at the first game offers no registration on the active card', async () => {
    await hub();
    const cards = await loadHub(db, DAN_SIGNED_IN, NOW, sportbetRules);
    expect(cards.map(({ action }) => action)).toEqual([null, 'register']);
  });
});

describe("loadHub: each card's widgets", () => {
  it("hub: a guest's active card lists the next three games open for predictions - not the scored, locked or postponed ones - by tip-off", async () => {
    await hub();
    const [active] = await loadHub(db, GUEST, NOW, ruledRules);
    expect(active?.upcomingGames.map(({ id }) => id)).toEqual([11, 12, 13]);
    expect(active?.upcomingGames[0]).toEqual({
      id: 11,
      tipOff: at('2026-10-12T18:00:00Z'),
      home: 'Olympiacos',
      away: 'Real',
    });
    expect(active?.howItWorks).toBe(false);
  });

  it("hub: a player's active card has no widgets; an upcoming card explains the game", async () => {
    await hub();
    const [active, upcoming] = await loadHub(
      db,
      ADA_SIGNED_IN,
      NOW,
      ruledRules,
    );
    expect(active?.upcomingGames).toEqual([]);
    expect(active?.guestPanels).toBeNull();
    expect(upcoming?.howItWorks).toBe(true);
    expect(upcoming?.upcomingGames).toEqual([]);
  });

  it("hub: a guest's top 5 is the listed players with a points row, by the rule set's Lyderiai order, with the stats", async () => {
    await hub();
    await savePlayers(db, [testPlayer(player('5'), 'eve')]);
    await savePlaying(db, TOURNAMENT, player('5'));
    await saveMatchPredictions(db, TOURNAMENT, [
      prediction(ADA, 88, 79),
      prediction(BEN, 80, 70),
      prediction(CAI, 70, 80),
    ]);
    const refusal = await recalculateUnderRuleSet(db, TOURNAMENT, ruledRules);
    expect(refusal).toBeNull();
    const [active] = await loadHub(db, GUEST, NOW, ruledRules);
    // eve has no points row: PlayerTotals' inner join leaves her out.
    expect(active?.guestPanels?.leaders.map(({ username }) => username)).toEqual(
      ['ada', 'ben', 'cai'],
    );
    expect(active?.guestPanels?.leaders.map(({ rank }) => rank)).toEqual([
      1, 2, 3,
    ]);
    expect(active?.guestPanels?.participants).toBe(4);
    expect(active?.guestPanels?.predictions).toBe(3);
  });

  it('hub: a switched-off player is not listed in the top 5 (RA-4, R-7)', async () => {
    await hub();
    await saveMatchPredictions(db, TOURNAMENT, [
      prediction(ADA, 88, 79),
      prediction(BEN, 80, 70),
    ]);
    expect(
      await recalculateUnderRuleSet(db, TOURNAMENT, ruledRules),
    ).toBeNull();
    await saveTournamentPlayers(db, TOURNAMENT, [
      { player: ADA, switchedOff: true, adminHidden: false, fillIns: 20 },
    ]);
    const [active] = await loadHub(db, GUEST, NOW, ruledRules);
    expect(
      active?.guestPanels?.leaders.map(({ username }) => username),
    ).toEqual(['ben']);
  });

  it("hub: the medal count counts the listed players' final places by team", async () => {
    await hub();
    await saveStandingsPredictions(db, TOURNAMENT, [
      unwrap(
        StandingsPrediction.stored(ADA, [
          teamPick('12', { finalPlace: 1 }),
          teamPick('13', { finalPlace: 2 }),
        ]),
      ),
      unwrap(
        StandingsPrediction.stored(BEN, [
          teamPick('12', { finalPlace: 2 }),
          teamPick('13', { finalPlace: 1 }),
        ]),
      ),
      unwrap(
        StandingsPrediction.stored(CAI, [teamPick('13', { finalPlace: 1 })]),
      ),
    ]);
    const [active] = await loadHub(db, GUEST, NOW, ruledRules);
    expect(active?.guestPanels?.medals).toEqual([
      { team: 'Real', first: 2, second: 1, third: 0, fourth: 0 },
      { team: 'Olympiacos', first: 1, second: 1, third: 0, fourth: 0 },
    ]);
  });

  it('hub: a tournament with nobody scored has no leaders, no medals and no predictions counted', async () => {
    await hub();
    const [active] = await loadHub(db, GUEST, NOW, ruledRules);
    expect(active?.guestPanels).toEqual({
      leaders: [],
      medals: [],
      participants: 3,
      predictions: 0,
    });
  });
});

describe("loadTournamentPage: show's header", () => {
  it('tournament page: its profile, its players counted, and the button for the viewer', async () => {
    await hub();
    const page = await loadTournamentPage(
      db,
      TOURNAMENT.slug,
      DAN_SIGNED_IN,
      NOW,
      ruledRules,
    );
    expect(page).toEqual({
      tournament: TOURNAMENT,
      profile: ACTIVE,
      finished: false,
      participants: 3,
      action: 'register',
    });
    expect(
      (await loadTournamentPage(db, TOURNAMENT.slug, GUEST, NOW, ruledRules))
        ?.action,
    ).toBe('sign-in');
    expect(
      (
        await loadTournamentPage(
          db,
          TOURNAMENT.slug,
          ADA_SIGNED_IN,
          NOW,
          ruledRules,
        )
      )?.action,
    ).toBe('create-league');
  });

  it('tournament page: an unknown slug, and (R-50) a non-public tournament for a guest, are not found', async () => {
    await hub();
    expect(
      await loadTournamentPage(db, 'no-such', GUEST, NOW, ruledRules),
    ).toBeNull();
    await saveTournamentProfile(db, TOURNAMENT, { ...ACTIVE, isPublic: false });
    expect(
      await loadTournamentPage(db, TOURNAMENT.slug, GUEST, NOW, ruledRules),
    ).toBeNull();
    expect(
      await loadTournamentPage(
        db,
        TOURNAMENT.slug,
        ADA_SIGNED_IN,
        NOW,
        ruledRules,
      ),
    ).not.toBeNull();
  });
});

describe('loadRegistrationForm: registerForm, R-53, R-54', () => {
  it('registration form: a player not in it gets the form, with the games and teams counted and the closing moment', async () => {
    await hub();
    expect(
      await loadRegistrationForm(
        db,
        TOURNAMENT.slug,
        DAN_SIGNED_IN,
        NOW,
        sportbetRules,
      ),
    ).toEqual({ step: 'closed' });
    const form = await loadRegistrationForm(
      db,
      TOURNAMENT.slug,
      DAN_SIGNED_IN,
      NOW,
      ruledRules,
    );
    expect(form).toEqual({
      step: 'open',
      tournament: TOURNAMENT,
      profile: ACTIVE,
      games: 8,
      teams: 4,
      // R-8: no game in round 5 or later, so no closing moment (decision 13).
      closesAt: null,
    });
  });

  it('registration form (R-53): a player in it is taken in, before and after registration closes', async () => {
    await hub();
    for (const rules of [sportbetRules, ruledRules]) {
      expect(
        await loadRegistrationForm(
          db,
          TOURNAMENT.slug,
          ADA_SIGNED_IN,
          NOW,
          rules,
        ),
      ).toEqual({ step: 'member' });
    }
  });

  it('registration form: an unknown slug is not found', async () => {
    await hub();
    expect(
      await loadRegistrationForm(
        db,
        'no-such',
        DAN_SIGNED_IN,
        NOW,
        ruledRules,
      ),
    ).toBeNull();
  });
});

describe('findVisibleTournament', () => {
  it('visible: the tournament, and whether the viewer plays it; null where R-50 hides it', async () => {
    await hub();
    expect(
      await findVisibleTournament(db, TOURNAMENT.slug, ADA_SIGNED_IN, ruledRules),
    ).toMatchObject({ tournament: TOURNAMENT, member: true });
    expect(
      await findVisibleTournament(db, TOURNAMENT.slug, DAN_SIGNED_IN, ruledRules),
    ).toMatchObject({ tournament: TOURNAMENT, member: false });
    await saveTournamentProfile(db, TOURNAMENT, { ...ACTIVE, isPublic: false });
    expect(
      await findVisibleTournament(db, TOURNAMENT.slug, DAN_SIGNED_IN, ruledRules),
    ).toBeNull();
  });
});
```

`world.ts`'s teams are 11 Zalgiris, 12 Olympiacos, 13 Real, 14 Fenerbahce; game 7 (Zalgiris 88:79 Olympiacos) is round 1, played 2026-10-02; game 8 (round 2) is scored too; game 9 postponed; game 10 (round 1, Real v Olympiacos) locked. Games 11 to 14 use the round-1 pairs still free. If a recalculation writes a match points row for a player without a prediction, eve is listed: then the test's premise is wrong, not the code - stop and hand to the lead with the rows. The top-5 order rests on the scores alone: ada's 88:79 is exact, ben has the winner, cai the loser - under `ruledRules` cai's total is the lowest, possibly 0, and still listed (a zero is a standing; PlayerTotals has no `HAVING`, issue #72). If the recalculation ranks two of them equal, adjust the scores (keep ada exact), never the assertion's meaning.

- [ ] **Step 2: Run it to see it fail**

Run: `pnpm --filter @sportbet/db exec vitest run test/hub.test.ts`
Expected: FAIL - `loadHub` is not exported.

- [ ] **Step 3: Write `packages/db/src/hub/repository.ts`**

```ts
import {
  canSeeTournament,
  cardAction,
  hubGroup,
  isOpenForRegistrationWindowAt,
  orderHub,
  rankPlayers,
  registrationClosesAt,
  registrationFormStep,
  sumTournamentTotals,
  tallyMedals,
  tournamentId,
  tournamentPageAction,
  usernameInvariant,
  widgetsShown,
  type CardAction,
  type HubGroup,
  type Instant,
  type MedalRow,
  type PlayerId,
  type RegistrationWindow,
  type RuleSet,
  type Tournament,
  type TournamentId,
  type TournamentPageAction,
  type TournamentProfile,
} from '@sportbet/domain';
import { and, asc, eq, gt, inArray, isNotNull, isNull, sql } from 'drizzle-orm';
import { alias } from 'drizzle-orm/pg-core';
import { z } from 'zod';
import { listPlayerTournaments } from '../account/repository';
import type { Executor } from '../client';
import { instantOf, keyOf, playerOf, stored } from '../edge';
import { loadRegistrationWindowsById } from '../joining/repository';
import { loadPlayerStatuses } from '../player/repository';
import { players, tournamentPlayers } from '../player/schema';
import { loadTournamentPoints } from '../points/repository';
import { matchPoints } from '../points/schema';
import { games } from '../season/schema';
import { standingsPredictions } from '../standings/schema';
import { listTeams } from '../team/repository';
import { teams } from '../team/schema';
import { listTournaments } from '../tournament/repository';
import { loadTournamentProfiles } from '../tournament/profile';

/** Who is looking: a guest (no player), or a signed-in player and whether they are an admin (R-50). */
export interface HubViewer {
  readonly player: PlayerId | null;
  readonly isAdmin: boolean;
}

/** A signed-in viewer: the registration form is for players only. */
export interface PlayerViewer extends HubViewer {
  readonly player: PlayerId;
}

/** A tournament the viewer may see, with what decides its card. */
export interface VisibleTournament {
  readonly tournament: Tournament;
  readonly profile: TournamentProfile;
  readonly window: RegistrationWindow;
  /** The viewer plays it (`tournament_players`; leagues are slice 12's). */
  readonly member: boolean;
}

/** One line of "Artėjančios rungtynės". */
export interface UpcomingGame {
  readonly id: number;
  readonly tipOff: Instant;
  readonly home: string;
  readonly away: string;
}

/** One line of "Lyderiai". */
export interface HubLeader {
  readonly rank: number;
  readonly username: string;
  /** The total the page ranks by, to the cent (leaderPoints prints it). */
  readonly totalCents: number;
}

/** What an active card shows a guest. */
export interface GuestPanels {
  readonly leaders: readonly HubLeader[];
  readonly medals: readonly MedalRow[];
  /** "dalyviai": the tournament's players (leagues are slice 12's). */
  readonly participants: number;
  /** "prognozės": its match points rows of the rule set. */
  readonly predictions: number;
}

/** One card of the hub. */
export interface HubCard {
  readonly tournament: Tournament;
  readonly profile: TournamentProfile;
  readonly group: HubGroup;
  readonly action: CardAction | null;
  readonly howItWorks: boolean;
  /** Empty where the card lists none, or none is open. */
  readonly upcomingGames: readonly UpcomingGame[];
  readonly guestPanels: GuestPanels | null;
}

/** The tournament page's header card. */
export interface TournamentPage {
  readonly tournament: Tournament;
  readonly profile: TournamentProfile;
  /** show.blade.php's `$isFinished`: the hub's group (R-55). */
  readonly finished: boolean;
  readonly participants: number;
  readonly action: TournamentPageAction;
}

/** What the registration form's address answers a signed-in player. */
export type RegistrationForm =
  | { readonly step: 'member' }
  | { readonly step: 'closed' }
  | {
      readonly step: 'open';
      readonly tournament: Tournament;
      readonly profile: TournamentProfile;
      readonly games: number;
      readonly teams: number;
      /** PL-2 under the rule set; null when no game sets it (R-54). */
      readonly closesAt: Instant | null;
    };

const keyOfTournament = (tournament: Tournament): TournamentId =>
  stored(tournamentId(String(tournament.id)), 'tournaments', tournament.id);

/**
 * Every tournament the viewer may see (R-50, canSeeTournament), by id,
 * with its profile, its registration window and whether they play it.
 */
async function visibleTournaments(
  db: Executor,
  viewer: HubViewer,
  rules: RuleSet,
): Promise<VisibleTournament[]> {
  const profiles = await loadTournamentProfiles(db);
  const windows = await loadRegistrationWindowsById(db);
  const playing = new Set(
    viewer.player === null
      ? []
      : await listPlayerTournaments(db, viewer.player),
  );
  return (await listTournaments(db)).flatMap((tournament) => {
    const profile = profiles.get(tournament.id);
    const window = windows.get(tournament.id);
    if (profile === undefined || window === undefined) {
      throw new Error(
        `hub: tournament ${String(tournament.id)} has no profile or window`,
      );
    }
    const member = playing.has(tournament.id);
    const seen = canSeeTournament({
      isPublic: profile.isPublic,
      member,
      isAdmin: viewer.isAdmin,
      rules,
    });
    return seen ? [{ tournament, profile, window, member }] : [];
  });
}

/**
 * The tournament at `slug`, if the viewer may see it (R-50): the page,
 * the form, enter and the form's submit all answer "not found" otherwise.
 */
export async function findVisibleTournament(
  db: Executor,
  slug: string,
  viewer: HubViewer,
  rules: RuleSet,
): Promise<VisibleTournament | null> {
  const visible = await visibleTournaments(db, viewer, rules);
  return visible.find(({ tournament }) => tournament.slug === slug) ?? null;
}

const upcomingRows = z.array(
  z.object({
    id: z.int(),
    tournament: z.int(),
    tipOff: z.date(),
    home: z.string(),
    away: z.string(),
  }),
);

/**
 * The hub's "Artėjančios rungtynės": each tournament's next three games
 * open for predictions (Game.isOpenAt: no result, not locked, not
 * postponed, tip-off after `now`; the plan's decision 5), by tip-off then
 * id, in one query for every card that lists them.
 */
async function loadUpcomingGames(
  db: Executor,
  tournamentIds: readonly number[],
  now: Instant,
): Promise<Map<number, UpcomingGame[]>> {
  const byTournament = new Map<number, UpcomingGame[]>();
  if (tournamentIds.length === 0) return byTournament;
  const home = alias(teams, 'home');
  const away = alias(teams, 'away');
  const ranked = db
    .select({
      id: games.id,
      tournament: games.tournamentId,
      tipOff: games.tipOff,
      home: sql<string>`${home.name}`.as('home_name'),
      away: sql<string>`${away.name}`.as('away_name'),
      place:
        sql<number>`row_number() over (partition by ${games.tournamentId} order by ${games.tipOff}, ${games.id})`.as(
          'place',
        ),
    })
    .from(games)
    .innerJoin(home, eq(home.id, games.homeTeamId))
    .innerJoin(away, eq(away.id, games.awayTeamId))
    .where(
      and(
        inArray(games.tournamentId, [...tournamentIds]),
        gt(games.tipOff, new Date(now)),
        isNull(games.homeScore),
        isNull(games.lockedSince),
        eq(games.postponed, false),
      ),
    )
    .as('ranked');
  const rows = await db
    .select({
      id: ranked.id,
      tournament: ranked.tournament,
      tipOff: ranked.tipOff,
      home: ranked.home,
      away: ranked.away,
    })
    .from(ranked)
    .where(sql`${ranked.place} <= 3`)
    .orderBy(asc(ranked.tournament), asc(ranked.tipOff), asc(ranked.id));
  for (const row of upcomingRows.parse(rows)) {
    byTournament.set(row.tournament, [
      ...(byTournament.get(row.tournament) ?? []),
      {
        id: row.id,
        tipOff: instantOf(row.tipOff, 'games', String(row.id)),
        home: row.home,
        away: row.away,
      },
    ]);
  }
  return byTournament;
}

const usernameRows = z.array(
  z.object({ id: z.int(), username: usernameInvariant.schema }),
);

async function usernamesOf(
  db: Executor,
  ids: readonly PlayerId[],
): Promise<Map<PlayerId, string>> {
  if (ids.length === 0) return new Map();
  const rows = await db
    .select({ id: players.id, username: players.username })
    .from(players)
    .where(
      inArray(
        players.id,
        ids.map((id) => keyOf(id, 'player')),
      ),
    );
  return new Map(
    usernameRows.parse(rows).map((row) => [playerOf(row.id), row.username]),
  );
}

/**
 * PlayerTotals::forTournament(...)->limit(5), ranked: the players with a
 * match points row of the rule set's source in the tournament (the inner
 * join on point_results), listed (RA-4: not switched off, not hidden), in
 * rankPlayers' Lyderiai order (RA-1, R-18; RA-3, R-30), the first five.
 * Their totals are the rows' sum (sumTournamentTotals).
 */
async function loadLeaders(
  db: Executor,
  tournament: Tournament,
  rules: RuleSet,
): Promise<HubLeader[]> {
  const rows = await loadTournamentPoints(db, tournament, rules.name);
  const scored = new Set(rows.matches.map(({ player }) => player));
  if (scored.size === 0) return [];
  const statuses = await loadPlayerStatuses(db, tournament, rules);
  const names = await usernamesOf(db, [...scored]);
  const key = keyOfTournament(tournament);
  const totals = sumTournamentTotals([], rows).flatMap((total) => {
    const username = names.get(total.player);
    if (!scored.has(total.player) || username === undefined) return [];
    const listed = statuses.get(total.player)?.isListedIn(key, rules) ?? false;
    return [{ ...total, username, listed }];
  });
  return rankPlayers(totals, 'lyderiai', rules)
    .slice(0, 5)
    .map(({ rank, username, totalCents }) => ({
      rank,
      username,
      totalCents,
    }));
}

const medalRows = z.array(
  z.object({ player: z.int(), team: z.string(), finalPlace: z.int() }),
);

/**
 * MedalTally::forTournament: the listed players' final places (1 to 4)
 * by team (tallyMedals). sportbet also lists a team whose only rows hold
 * a final of 0; that 0 is null here (the plan's P2).
 */
async function loadMedals(
  db: Executor,
  tournament: Tournament,
  rules: RuleSet,
): Promise<MedalRow[]> {
  const rows = medalRows.parse(
    await db
      .select({
        player: standingsPredictions.playerId,
        team: teams.name,
        finalPlace: standingsPredictions.finalPlace,
      })
      .from(standingsPredictions)
      .innerJoin(teams, eq(teams.id, standingsPredictions.teamId))
      .where(
        and(
          eq(teams.tournamentId, tournament.id),
          isNotNull(standingsPredictions.finalPlace),
        ),
      ),
  );
  if (rows.length === 0) return [];
  const statuses = await loadPlayerStatuses(db, tournament, rules);
  const key = keyOfTournament(tournament);
  return [
    ...tallyMedals(
      rows.filter(
        ({ player }) =>
          statuses.get(playerOf(player))?.isListedIn(key, rules) ?? false,
      ),
    ),
  ];
}

const countRows = z.array(z.object({ count: z.int() }));

async function countParticipants(
  db: Executor,
  tournament: Tournament,
): Promise<number> {
  const rows = await db
    .select({ count: sql<number>`count(*)::int` })
    .from(tournamentPlayers)
    .where(eq(tournamentPlayers.tournamentId, tournament.id));
  return countRows.parse(rows)[0]?.count ?? 0;
}

/** The hub's "prognozės": sportbet counts the tournament's point_results rows. */
async function countPredictions(
  db: Executor,
  tournament: Tournament,
  rules: RuleSet,
): Promise<number> {
  const rows = await db
    .select({ count: sql<number>`count(*)::int` })
    .from(matchPoints)
    .innerJoin(games, eq(games.id, matchPoints.gameId))
    .where(
      and(
        eq(matchPoints.source, rules.name),
        eq(games.tournamentId, tournament.id),
      ),
    );
  return countRows.parse(rows)[0]?.count ?? 0;
}

async function loadGuestPanels(
  db: Executor,
  tournament: Tournament,
  rules: RuleSet,
): Promise<GuestPanels> {
  return {
    leaders: await loadLeaders(db, tournament, rules),
    medals: await loadMedals(db, tournament, rules),
    participants: await countParticipants(db, tournament),
    predictions: await countPredictions(db, tournament, rules),
  };
}

/**
 * TournamentController::hub: every tournament the viewer may see (R-50),
 * grouped and ordered (hubGroup, orderHub; R-55), each with its button
 * (cardAction) and the widgets sportbet draws for it (widgetsShown). The
 * guest panels are loaded per active card a guest sees - single digits.
 */
export async function loadHub(
  db: Executor,
  viewer: HubViewer,
  now: Instant,
  rules: RuleSet,
): Promise<HubCard[]> {
  const signedIn = viewer.player !== null;
  const ordered = orderHub(
    (await visibleTournaments(db, viewer, rules)).map((visible) => {
      const group = hubGroup({
        profile: visible.profile,
        window: visible.window,
        now,
        rules,
      });
      return {
        ...visible,
        id: visible.tournament.id,
        startsOn: visible.profile.startsOn,
        group,
        widgets: widgetsShown(group, signedIn),
      };
    }),
  );
  const upcoming = await loadUpcomingGames(
    db,
    ordered.filter(({ widgets }) => widgets.upcomingGames).map(({ id }) => id),
    now,
  );
  const cards: HubCard[] = [];
  for (const card of ordered) {
    cards.push({
      tournament: card.tournament,
      profile: card.profile,
      group: card.group,
      action: cardAction({
        group: card.group,
        signedIn,
        member: card.member,
        registrationOpen: isOpenForRegistrationWindowAt(
          card.window,
          now,
          rules,
        ),
      }),
      howItWorks: card.widgets.howItWorks,
      upcomingGames: upcoming.get(card.id) ?? [],
      guestPanels: card.widgets.guestPanels
        ? await loadGuestPanels(db, card.tournament, rules)
        : null,
    });
  }
  return cards;
}

/**
 * TournamentController::show's header card, or null when the slug names
 * no tournament the viewer may see (R-50).
 */
export async function loadTournamentPage(
  db: Executor,
  slug: string,
  viewer: HubViewer,
  now: Instant,
  rules: RuleSet,
): Promise<TournamentPage | null> {
  const found = await findVisibleTournament(db, slug, viewer, rules);
  if (found === null) return null;
  const { tournament, profile, window, member } = found;
  return {
    tournament,
    profile,
    finished: hubGroup({ profile, window, now, rules }) === 'finished',
    participants: await countParticipants(db, tournament),
    action: tournamentPageAction({
      signedIn: viewer.player !== null,
      member,
      registrationOpen: isOpenForRegistrationWindowAt(window, now, rules),
    }),
  };
}

/**
 * TournamentController::registerForm (R-53): a player in the tournament
 * is taken in; anyone else gets the form while it is open - with its
 * games and teams counted and its closing moment (R-54) - else "closed".
 * Null when the slug names no tournament the viewer may see.
 */
export async function loadRegistrationForm(
  db: Executor,
  slug: string,
  viewer: PlayerViewer,
  now: Instant,
  rules: RuleSet,
): Promise<RegistrationForm | null> {
  const found = await findVisibleTournament(db, slug, viewer, rules);
  if (found === null) return null;
  const step = registrationFormStep({
    member: found.member,
    registrationOpen: isOpenForRegistrationWindowAt(found.window, now, rules),
  });
  if (step !== 'open') return { step };
  return {
    step,
    tournament: found.tournament,
    profile: found.profile,
    games: found.window.games,
    teams: (await listTeams(db, found.tournament)).length,
    closesAt: registrationClosesAt(found.window, rules),
  };
}
```

`PlayerId` values compare by value in a `Set` (they are branded strings); `stored`, `keyOf`, `playerOf` and `instantOf` are `edge.ts`'s.

- [ ] **Step 4: Export them** - in `packages/db/src/index.ts`:

```ts
export {
  findVisibleTournament,
  loadHub,
  loadRegistrationForm,
  loadTournamentPage,
  type GuestPanels,
  type HubCard,
  type HubLeader,
  type HubViewer,
  type PlayerViewer,
  type RegistrationForm,
  type TournamentPage,
  type UpcomingGame,
  type VisibleTournament,
} from './hub/repository';
```

- [ ] **Step 5: Run it to see it pass**

Run: `pnpm --filter @sportbet/db exec vitest run test/hub.test.ts`
Expected: PASS, 17 tests.

- [ ] **Step 6: Verify**

```bash
pnpm format
pnpm test:db 2>&1 | grep -E "Test Files|Tests "
pnpm --filter @sportbet/db typecheck && pnpm lint
```

Expected: every db test passes; typecheck and lint silent (the db package imports no web code).

- [ ] **Step 7: Hand to the lead.** Commit message: `feat(db): the hub's and the tournament page's data - visible tournaments (R-50), groups and order (R-55), buttons, next games, a guest's top 5, medal count and stats; the registration form's step (R-53, R-54) (#19)`.

---

### Task 6A (backend-dev; web-dev for Step 6): Sign-up never joins a non-public tournament (R-50, amended)

The owner amended R-50 at the plan review (2026-10-06): under `ruledRules` sign-up never joins a non-public tournament, neither by R-27's choice nor through a `?tournament=` link. It uses the same `RuleSet` field, `nonPublicTournamentsHidden`; under `sportbetRules` every tournament is joinable, as sportbet reads no `is_public`.

**Where it goes (read from 4c's code).** Two domain functions decide sign-up, and both take the rule set already:
- `tournamentToJoin` (`packages/domain/src/joining/joining.ts`), called by `createAccount` with `loadJoinCandidates`.
- `registrationIsOpen` (the same file), called by `isRegistrationOpen` in the db, which serves `/register` and the dialog's "Registruotis" tab (`apps/web/src/server/register/registration-window.ts`, R-49).

Each candidate and each window gains `isPublic`, and one domain predicate, `joinableOnSignUp`, is asked by both functions. The db loads `isPublic` from the profiles (Task 4). Neither the joining of a signed-in player through the form (Task 15) nor `registerForTournament` changes: the form already answers "not found" for a tournament R-50 hides (`findVisibleTournament`).

**R-49 is affected, and this is flagged for the owner.** R-49 says sign-up is open while some tournament is open for registration.
- Under `ruledRules` a non-public tournament no longer counts. So on a site where only non-public tournaments take players, the "Registruotis" tab is hidden and `/register` goes home.
- R-49's empty installation keeps reading every tournament: sign-up stays open, joining none, only when no tournament has a game at all. So a non-public tournament never opens sign-up by itself.

The lead notes both points on #19 with the task's commit.

**Files:**
- Modify: `packages/domain/src/joining/joining.ts`, `packages/domain/src/joining/joining.test.ts`, `packages/domain/src/index.ts`
- Modify: `packages/db/src/joining/repository.ts`, `packages/db/test/joining.test.ts`
- Modify: `apps/web/tests/feature/registration.test.ts`

- [ ] **Step 1: Write the failing domain tests**

In `packages/domain/src/joining/joining.test.ts`:
- The `candidate` helper takes `isPublic = true` as a fifth parameter and returns it: `({ tournament: tournament(id, slug), season: seasonOf(games, endsAt), isPublic })`.
- The `windows` helper of the `registration open at all` describe returns `each.map(({ season, isPublic }) => ({ window: season.registrationWindow(), isPublic }))`.

Every existing test keeps its meaning. Then add:

```ts
describe('R-50: sign-up never joins a non-public tournament', () => {
  const NOW = at('2026-10-05T12:00:00Z');
  const sooner = candidate(
    2,
    'euroleague-2026-27',
    [ROUND_5],
    END,
    false,
  );
  const later = candidate(3, 'euroleague-2027-28', []);
  const choose = (intended: string | null, rules: RuleSet) =>
    tournamentToJoin({
      intended,
      candidates: [sooner, later],
      now: NOW,
      rules,
    })?.id ?? null;

  it("joining (ruled, R-50): R-27 never picks a non-public tournament, even the one whose next game is soonest", () => {
    expect(choose(null, ruledRules)).toBe(3);
  });

  it('joining (ruled, R-50): a ?tournament= naming a non-public tournament falls back to R-27\'s public one', () => {
    expect(choose('euroleague-2026-27', ruledRules)).toBe(3);
  });

  it('joining (ruled, R-50): registration is not open at all when only a non-public tournament takes players (R-49)', () => {
    const windows = [sooner].map(({ season, isPublic }) => ({
      window: season.registrationWindow(),
      isPublic,
    }));
    expect(registrationIsOpen(windows, NOW, ruledRules)).toBe(false);
  });

  it('joining (sportbet): a non-public tournament is joined and counts as open, as sportbet reads no is_public', () => {
    expect(choose(null, sportbetRules)).toBe(2);
    expect(choose('euroleague-2026-27', sportbetRules)).toBe(2);
    const windows = [sooner].map(({ season, isPublic }) => ({
      window: season.registrationWindow(),
      isPublic,
    }));
    expect(registrationIsOpen(windows, NOW, sportbetRules)).toBe(true);
  });
});
```

Use the file's own fixtures for `ROUND_5`, `END` and the tournament ids. `sooner` must be open at `NOW` under both sets, with its next game sooner than `later`'s (which has none). If `ROUND_5`'s game has tipped off by `NOW` under `sportbetRules`, give `sooner` a game still to come, as the file's R-27 tests do (`candidate(2, ..., [...])` at line ~244). Import `type RuleSet` if the file does not yet.

Run: `pnpm --filter @sportbet/domain exec vitest run src/joining/joining.test.ts`
Expected: FAIL. Typecheck reports `isPublic` unknown on `JoinCandidate`, and `registrationIsOpen` is given objects, not windows.

- [ ] **Step 2: The domain** - in `packages/domain/src/joining/joining.ts`:

```ts
/** A tournament a new account might join, with its season. */
export interface JoinCandidate {
  readonly tournament: Tournament;
  readonly season: Season;
  /** `is_public` (TournamentProfile): R-50 keeps sign-up out of a non-public one. */
  readonly isPublic: boolean;
}

/** One tournament's window as sign-up reads it: whether it takes players, and whether sign-up may join it (R-50). */
export interface SignUpWindow {
  readonly window: RegistrationWindow;
  readonly isPublic: boolean;
}

/**
 * R-50 (amended at the slice 5 plan review): under the ruled set sign-up
 * never joins a non-public tournament, by R-27 or by `?tournament=`, and
 * such a tournament does not open sign-up (R-49); sportbet joins any.
 */
export function joinableOnSignUp(isPublic: boolean, rules: RuleSet): boolean {
  return !rules.nonPublicTournamentsHidden || isPublic;
}
```

`registrationIsOpen` takes `readonly SignUpWindow[]`:

```ts
/**
 * ChecksRegistrationDeadline::anyTournamentIsJoinable, from each
 * tournament's window (Season.registrationWindow, or the database's
 * isRegistrationOpen): registration is open while some tournament sign-up
 * may join (joinableOnSignUp, R-50) takes players. With none taking
 * players it is open only on an empty installation - every tournament
 * finished and no game anywhere (Q4, R-49), whatever its public switch -
 * whose first account creates the tournaments.
 */
export function registrationIsOpen(
  windows: readonly SignUpWindow[],
  now: Instant,
  rules: RuleSet,
): boolean {
  const joinable = windows.some(
    ({ window, isPublic }) =>
      joinableOnSignUp(isPublic, rules) &&
      isOpenForRegistrationWindowAt(window, now, rules),
  );
  if (joinable) return true;
  return windows.every(
    ({ window }) => isFinishedWindowAt(window, now) && window.games === 0,
  );
}
```

This is the old rule restated. Before, "every one finished" gave "every one has no games", and otherwise "some takes players". Now it is "some joinable one takes players", or else "every one is finished and has no games". When every window is finished, none takes players, so the two agree under `sportbetRules`. The existing `registration open at all` tests prove it.

In `tournamentToJoin`, the `open` filter becomes:

```ts
  const open = candidates.filter(
    ({ season, isPublic }) =>
      joinableOnSignUp(isPublic, rules) &&
      isOpenForRegistration(season, now, rules),
  );
```

and its comment gains "a tournament sign-up may join (R-50)". Export `joinableOnSignUp` and `type SignUpWindow` from the `./joining/joining` block of `packages/domain/src/index.ts`.

Run: `pnpm --filter @sportbet/domain exec vitest run src/joining/joining.test.ts`
Expected: PASS.

- [ ] **Step 3: Write the failing db tests** - in `packages/db/test/joining.test.ts`:

```ts
describe('R-50: sign-up and a non-public tournament', () => {
  it('R-50: a join candidate carries its public switch', async () => {
    await saveWorld(db);
    await saveTournamentProfile(db, TOURNAMENT, {
      status: 'active',
      startsOn: null,
      sport: 'basketball',
      description: null,
      isPublic: false,
    });
    expect(
      (await loadJoinCandidates(db)).map(({ tournament, isPublic }) => [
        tournament.id,
        isPublic,
      ]),
    ).toEqual([[TOURNAMENT.id, false]]);
  });

  it('R-50: registration is closed under ruled when only a non-public tournament takes players, and open under sportbet', async () => {
    await saveWorld(db);
    await saveGames(db, TOURNAMENT, [G11]);
    await saveTournamentProfile(db, TOURNAMENT, {
      status: 'active',
      startsOn: null,
      sport: 'basketball',
      description: null,
      isPublic: false,
    });
    const before = at('2026-11-01T12:00:00Z');
    expect(await isRegistrationOpen(db, before, ruledRules)).toBe(false);
    expect(await isRegistrationOpen(db, before, sportbetRules)).toBe(true);
  });
});
```

Import `saveTournamentProfile` from `../src`. `G11` is the file's own game still to come on 2026-12-01. So at 2026-11-01 the tournament takes players under both sets: before its first game (sportbet), and with no round-5 game (ruled).

Run: `pnpm --filter @sportbet/db exec vitest run test/joining.test.ts`
Expected: FAIL. `isPublic` is undefined on the candidates, and `isRegistrationOpen` is still open under ruled.

- [ ] **Step 4: The db** - in `packages/db/src/joining/repository.ts`:

```ts
/** Every tournament with its season and public switch, by id: what a new account may join. */
export async function loadJoinCandidates(
  db: Executor,
): Promise<JoinCandidate[]> {
  const profiles = await loadTournamentProfiles(db);
  const candidates: JoinCandidate[] = [];
  const byId = (await listTournaments(db)).sort((a, b) => a.id - b.id);
  for (const tournament of byId) {
    candidates.push({
      tournament,
      season: await loadSeason(db, tournament),
      isPublic: profiles.get(tournament.id)?.isPublic ?? true,
    });
  }
  return candidates;
}
```

`isRegistrationOpen` becomes:

```ts
export async function isRegistrationOpen(
  db: Executor,
  now: Instant,
  rules: RuleSet,
): Promise<boolean> {
  const profiles = await loadTournamentProfiles(db);
  const windows = [...(await loadRegistrationWindowsById(db))].map(
    ([id, window]) => ({
      window,
      isPublic: profiles.get(id)?.isPublic ?? true,
    }),
  );
  return registrationIsOpen(windows, now, rules);
}
```

Import `loadTournamentProfiles` from `../tournament/profile`. `?? true` is the column's own default, for a tournament the profile query had not seen. Every tournament has a row there, so it is only a type's fallback. Its comment gains "the tournaments sign-up may join (R-50)". `createAccount` (`packages/db/src/account/registration.ts`) passes the candidates on unchanged.

Run: `pnpm --filter @sportbet/db exec vitest run test/joining.test.ts test/registration.test.ts`
Expected: PASS. Any other test building a `JoinCandidate` by hand gets `isPublic: true`, which typecheck points to.

- [ ] **Step 5: Verify**

```bash
pnpm format
pnpm test:unit 2>&1 | grep -E "Test Files|Tests "
pnpm test:db 2>&1 | grep -E "Test Files|Tests "
pnpm typecheck && pnpm lint
```

Expected: every test passes; typecheck and lint silent.

- [ ] **Step 6 (web-dev): The feature test** - in `apps/web/tests/feature/registration.test.ts`, inside `describe('the tournament a new account joins (PostRegisterController, R-27)', ...)`:

```ts
  it('registration (R-50): a ?tournament= naming a non-public tournament joins R-27\'s public one instead', async () => {
    await withProfile(db, LATER.tournament.slug, {
      ...ACTIVE_PROFILE,
      isPublic: false,
    });
    const browser = visitor();
    await browser.get('/register?tournament=euroleague-2027-28');
    await registered(browser);
    expect(await joinedTournaments()).toEqual([SOONER.id]);
  });
```

(import `ACTIVE_PROFILE` and `withProfile` from `../support/hub`, Task 9's). Run: `pnpm build && pnpm --filter @sportbet/web exec vitest run --config vitest.feature.config.ts tests/feature/registration.test.ts`. Expected: PASS. This step runs after Task 9, which creates `tests/support/hub.ts`. If Task 6A lands first, this step waits for Task 9.

- [ ] **Step 7: Hand to the lead.** Commit message: `feat(domain,db): sign-up never joins a non-public tournament, by R-27 or ?tournament=, and none opens sign-up by itself under ruledRules (R-50 amended) (#19)`. The lead notes R-49's effect (above) on #19.

---

### Task 7 (web-dev): Crests, the icons the hub draws, Vilnius time

**Files:**
- Create: `apps/web/public/img/teams/` (21 files copied from sportbet)
- Create: `apps/web/src/components/hub/crests.ts`, `apps/web/src/components/hub/crests.test.ts`, `apps/web/src/components/hub/team-crest.tsx`
- Modify: `apps/web/src/components/shell/icon.tsx`
- Create: `apps/web/src/components/format/vilnius-time.ts`, `apps/web/src/components/format/vilnius-time.test.ts`

- [ ] **Step 1: Copy sportbet's Euroleague crests and its placeholder** (binary, through `git show`):

```bash
mkdir -p apps/web/public/img/teams
for f in "_placeholder.svg" "anadolu efes istanbul.png" "armani olimpia milan.png" \
  "besiktas istanbul.png" "crvena zvezda meridianbet belgrade.png" "dubai basketball.png" \
  "fc barcelona.png" "fc bayern munich.png" "fenerbahce tarfin istanbul.png" \
  "hapoel ibi tel aviv.png" "kosner baskonia vitoria-gasteiz.png" "ldlc asvel villeurbanne.png" \
  "maccabi rapyd tel aviv.png" "olympiacos piraeus.png" "panathinaikos aktor athens.png" \
  "paris basketball.png" "partizan mozzart bet belgrade.png" "real madrid.png" \
  "valencia basket.png" "virtus bologna.png" "zalgiris kaunas.png"; do
  git -C /d/Projects/sportbet show "3eb95e7:public/img/teams/$f" > "apps/web/public/img/teams/$f"
done
ls apps/web/public/img/teams | wc -l
git -C /d/Projects/sportbet show "3eb95e7:public/img/teams/real madrid.png" | cmp - "apps/web/public/img/teams/real madrid.png" && echo same
```

Expected: `21`; `same`. The country flags are football's (decision 11) and are not copied.

- [ ] **Step 2: Write the failing tests**

`apps/web/src/components/hub/crests.test.ts`:

```ts
import { readdirSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { CREST_FILES, CREST_PLACEHOLDER, crestPath } from './crests';

// sportbet's TeamLogo: a team's crest by its lower-cased, space-collapsed
// name, SVG before PNG, URL-encoded; the placeholder when none exists.

describe('crests', () => {
  it('crests: CREST_FILES names exactly the crests in public/img/teams', () => {
    const directory = join(import.meta.dirname, '..', '..', '..', 'public', 'img', 'teams');
    const files = readdirSync(directory).filter((name) => name !== '_placeholder.svg');
    expect([...CREST_FILES].sort()).toEqual(files.sort());
  });

  it("crests: a team's crest is its name lower-cased, URL-encoded", () => {
    expect(crestPath('Zalgiris Kaunas')).toBe('/img/teams/zalgiris%20kaunas.png');
  });

  it('crests: stray, doubled and trailing spaces do not detach a team from its crest', () => {
    expect(crestPath('  Real   Madrid ')).toBe('/img/teams/real%20madrid.png');
  });

  it('crests: an SVG wins over a PNG of the same name', () => {
    expect(crestPath('Lietuva', ['lietuva.png', 'lietuva.svg'])).toBe('/img/teams/lietuva.svg');
  });

  it('crests: a team with no crest, or no name, gets the placeholder', () => {
    expect(crestPath('Nežinoma')).toBe(CREST_PLACEHOLDER);
    expect(crestPath('   ')).toBe(CREST_PLACEHOLDER);
    expect(CREST_PLACEHOLDER).toBe('/img/teams/_placeholder.svg');
  });
});
```

`apps/web/src/components/format/vilnius-time.test.ts`:

```ts
import { at } from '@sportbet/domain/testing';
import { describe, expect, it } from 'vitest';
import { vilniusDateTime } from './vilnius-time';

// R-51: game times in Vilnius time, written in Lithuanian.

describe('vilniusDateTime', () => {
  it.each([
    ['2026-10-06T18:00:00Z', 'spalio 6 d., 21:00'],
    ['2027-01-15T17:30:00Z', 'sausio 15 d., 19:30'],
    ['2027-03-04T18:00:00Z', 'kovo 4 d., 20:00'],
    ['2026-10-25T00:30:00Z', 'spalio 25 d., 03:30'],
    ['2026-12-31T22:30:00Z', 'sausio 1 d., 00:30'],
  ] as const)('R-51: %s is %s', (instant, text) => {
    expect(vilniusDateTime(at(instant))).toBe(text);
  });
});
```

(`@sportbet/domain/testing` is allowed in web tests: the lint rule names it only for `src` outside tests; if lint refuses it here, use `Date.parse(instant)` - `vilniusDateTime` takes a millisecond count.)

- [ ] **Step 3: Run them to see them fail**

Run: `pnpm --filter @sportbet/web exec vitest run --config vitest.component.config.ts src/components/hub/crests.test.ts src/components/format/vilnius-time.test.ts`
Expected: FAIL - `./crests` and `./vilnius-time` do not resolve.

- [ ] **Step 4: Write `apps/web/src/components/hub/crests.ts`**

```ts
const DIRECTORY = '/img/teams';

/** Shown instead of a broken image when a team has no crest (TeamLogo::PLACEHOLDER). */
export const CREST_PLACEHOLDER = `${DIRECTORY}/_placeholder.svg`;

/**
 * sportbet's Euroleague crests at 3eb95e7, copied into public/img/teams
 * (crests.test.ts holds this list equal to the directory). sportbet reads
 * the directory; a list keeps the page from touching the disk.
 */
export const CREST_FILES: readonly string[] = [
  'anadolu efes istanbul.png',
  'armani olimpia milan.png',
  'besiktas istanbul.png',
  'crvena zvezda meridianbet belgrade.png',
  'dubai basketball.png',
  'fc barcelona.png',
  'fc bayern munich.png',
  'fenerbahce tarfin istanbul.png',
  'hapoel ibi tel aviv.png',
  'kosner baskonia vitoria-gasteiz.png',
  'ldlc asvel villeurbanne.png',
  'maccabi rapyd tel aviv.png',
  'olympiacos piraeus.png',
  'panathinaikos aktor athens.png',
  'paris basketball.png',
  'partizan mozzart bet belgrade.png',
  'real madrid.png',
  'valencia basket.png',
  'virtus bologna.png',
  'zalgiris kaunas.png',
];

/**
 * TeamLogo::baseName: the name lower-cased with its whitespace collapsed,
 * so a stray space in the teams table does not detach a team from its
 * crest; null for a blank name.
 */
function baseName(team: string): string | null {
  const name = team.replace(/\s+/gu, ' ').trim();
  return name === '' ? null : name.toLowerCase();
}

/** TeamLogo::url: the team's crest, SVG before PNG, its name URL-encoded; else the placeholder. */
export function crestPath(
  team: string,
  files: readonly string[] = CREST_FILES,
): string {
  const base = baseName(team);
  if (base === null) return CREST_PLACEHOLDER;
  for (const extension of ['svg', 'png']) {
    const file = `${base}.${extension}`;
    if (files.includes(file)) return `${DIRECTORY}/${encodeURIComponent(file)}`;
  }
  return CREST_PLACEHOLDER;
}
```

`apps/web/src/components/hub/team-crest.tsx`:

```tsx
import { crestPath } from './crests';

/** sportbet's x-team-crest: the crest at text size, the team's name as its alternative text. */
export function TeamCrest({ team }: { team: string }) {
  return (
    // A local file at its own size: next/image would add nothing.
    // eslint-disable-next-line @next/next/no-img-element
    <img
      src={crestPath(team)}
      alt={team}
      width={20}
      height={20}
      className="inline-block size-5 shrink-0 object-contain"
    />
  );
}
```

(If the lint config has no `@next/next/no-img-element` rule, drop the disable comment; `pnpm lint` reports an unused disable.)

- [ ] **Step 5: Write `apps/web/src/components/format/vilnius-time.ts`**

```ts
const PARTS = new Intl.DateTimeFormat('lt', {
  month: 'long',
  day: 'numeric',
  hour: '2-digit',
  minute: '2-digit',
  hourCycle: 'h23',
  timeZone: 'Europe/Vilnius',
});

/**
 * R-51: an instant as Vilnius time, in Lithuanian - "spalio 6 d., 21:00".
 * Built from the formatter's parts, so the comma after "d." is ours and
 * does not depend on the ICU data's pattern.
 */
export function vilniusDateTime(instant: number): string {
  const parts = PARTS.formatToParts(new Date(instant));
  const part = (type: Intl.DateTimeFormatPartTypes) =>
    parts.find((each) => each.type === type)?.value ?? '';
  return `${part('month')} ${part('day')} d., ${part('hour')}:${part('minute')}`;
}
```

- [ ] **Step 6: The icons** - in `apps/web/src/components/shell/icon.tsx`, add to `IconName`, in alphabetical order: `'arrow-right-short'`, `'bar-chart-fill'`, `'calendar3'`, `'check-circle-fill'`, `'exclamation-circle'`, `'graph-up-arrow'`, `'info-circle'`, `'pencil-square'`, `'plus-circle'`, `'trophy-fill'`; and to `ICONS` (bootstrap-icons 1.11.1, MIT, as the file's comment says):

```ts
  'arrow-right-short': [
    {
      evenOdd: true,
      d: 'M4 8a.5.5 0 0 1 .5-.5h5.793L8.146 5.354a.5.5 0 1 1 .708-.708l3 3a.5.5 0 0 1 0 .708l-3 3a.5.5 0 0 1-.708-.708L10.293 8.5H4.5A.5.5 0 0 1 4 8z',
    },
  ],
  'bar-chart-fill': [
    {
      d: 'M1 11a1 1 0 0 1 1-1h2a1 1 0 0 1 1 1v3a1 1 0 0 1-1 1H2a1 1 0 0 1-1-1v-3zm5-4a1 1 0 0 1 1-1h2a1 1 0 0 1 1 1v7a1 1 0 0 1-1 1H7a1 1 0 0 1-1-1V7zm5-5a1 1 0 0 1 1-1h2a1 1 0 0 1 1 1v12a1 1 0 0 1-1 1h-2a1 1 0 0 1-1-1V2z',
    },
  ],
  calendar3: [
    {
      d: 'M14 0H2a2 2 0 0 0-2 2v12a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V2a2 2 0 0 0-2-2zM1 3.857C1 3.384 1.448 3 2 3h12c.552 0 1 .384 1 .857v10.286c0 .473-.448.857-1 .857H2c-.552 0-1-.384-1-.857V3.857z',
    },
    {
      d: 'M6.5 7a1 1 0 1 0 0-2 1 1 0 0 0 0 2zm3 0a1 1 0 1 0 0-2 1 1 0 0 0 0 2zm3 0a1 1 0 1 0 0-2 1 1 0 0 0 0 2zm-9 3a1 1 0 1 0 0-2 1 1 0 0 0 0 2zm3 0a1 1 0 1 0 0-2 1 1 0 0 0 0 2zm3 0a1 1 0 1 0 0-2 1 1 0 0 0 0 2zm3 0a1 1 0 1 0 0-2 1 1 0 0 0 0 2zm-9 3a1 1 0 1 0 0-2 1 1 0 0 0 0 2zm3 0a1 1 0 1 0 0-2 1 1 0 0 0 0 2zm3 0a1 1 0 1 0 0-2 1 1 0 0 0 0 2z',
    },
  ],
  'check-circle-fill': [
    {
      d: 'M16 8A8 8 0 1 1 0 8a8 8 0 0 1 16 0zm-3.97-3.03a.75.75 0 0 0-1.08.022L7.477 9.417 5.384 7.323a.75.75 0 0 0-1.06 1.06L6.97 11.03a.75.75 0 0 0 1.079-.02l3.992-4.99a.75.75 0 0 0-.01-1.05z',
    },
  ],
  'exclamation-circle': [
    { d: 'M8 15A7 7 0 1 1 8 1a7 7 0 0 1 0 14zm0 1A8 8 0 1 0 8 0a8 8 0 0 0 0 16z' },
    {
      d: 'M7.002 11a1 1 0 1 1 2 0 1 1 0 0 1-2 0zM7.1 4.995a.905.905 0 1 1 1.8 0l-.35 3.507a.552.552 0 0 1-1.1 0L7.1 4.995z',
    },
  ],
  'graph-up-arrow': [
    {
      evenOdd: true,
      d: 'M0 0h1v15h15v1H0V0Zm10 3.5a.5.5 0 0 1 .5-.5h4a.5.5 0 0 1 .5.5v4a.5.5 0 0 1-1 0V4.9l-3.613 4.417a.5.5 0 0 1-.74.037L7.06 6.767l-3.656 5.027a.5.5 0 0 1-.808-.588l4-5.5a.5.5 0 0 1 .758-.06l2.609 2.61L13.445 4H10.5a.5.5 0 0 1-.5-.5Z',
    },
  ],
  'info-circle': [
    { d: 'M8 15A7 7 0 1 1 8 1a7 7 0 0 1 0 14zm0 1A8 8 0 1 0 8 0a8 8 0 0 0 0 16z' },
    {
      d: 'm8.93 6.588-2.29.287-.082.38.45.083c.294.07.352.176.288.469l-.738 3.468c-.194.897.105 1.319.808 1.319.545 0 1.178-.252 1.465-.598l.088-.416c-.2.176-.492.246-.686.246-.275 0-.375-.193-.304-.533L8.93 6.588zM9 4.5a1 1 0 1 1-2 0 1 1 0 0 1 2 0z',
    },
  ],
  'pencil-square': [
    {
      d: 'M15.502 1.94a.5.5 0 0 1 0 .706L14.459 3.69l-2-2L13.502.646a.5.5 0 0 1 .707 0l1.293 1.293zm-1.75 2.456-2-2L4.939 9.21a.5.5 0 0 0-.121.196l-.805 2.414a.25.25 0 0 0 .316.316l2.414-.805a.5.5 0 0 0 .196-.12l6.813-6.814z',
    },
    {
      evenOdd: true,
      d: 'M1 13.5A1.5 1.5 0 0 0 2.5 15h11a1.5 1.5 0 0 0 1.5-1.5v-6a.5.5 0 0 0-1 0v6a.5.5 0 0 1-.5.5h-11a.5.5 0 0 1-.5-.5v-11a.5.5 0 0 1 .5-.5H9a.5.5 0 0 0 0-1H2.5A1.5 1.5 0 0 0 1 2.5v11z',
    },
  ],
  'plus-circle': [
    { d: 'M8 15A7 7 0 1 1 8 1a7 7 0 0 1 0 14zm0 1A8 8 0 1 0 8 0a8 8 0 0 0 0 16z' },
    {
      d: 'M8 4a.5.5 0 0 1 .5.5v3h3a.5.5 0 0 1 0 1h-3v3a.5.5 0 0 1-1 0v-3h-3a.5.5 0 0 1 0-1h3v-3A.5.5 0 0 1 8 4z',
    },
  ],
  'trophy-fill': [
    {
      d: 'M2.5.5A.5.5 0 0 1 3 0h10a.5.5 0 0 1 .5.5c0 .538-.012 1.05-.034 1.536a3 3 0 1 1-1.133 5.89c-.79 1.865-1.878 2.777-2.833 3.011v2.173l1.425.356c.194.048.377.135.537.255L13.3 15.1a.5.5 0 0 1-.3.9H3a.5.5 0 0 1-.3-.9l1.838-1.379c.16-.12.343-.207.537-.255L6.5 13.11v-2.173c-.955-.234-2.043-1.146-2.833-3.012a3 3 0 1 1-1.132-5.89A33.076 33.076 0 0 1 2.5.5zm.099 2.54a2 2 0 0 0 .72 3.935c-.333-1.05-.588-2.346-.72-3.935zm10.083 3.935a2 2 0 0 0 .72-3.935c-.133 1.59-.388 2.885-.72 3.935z',
    },
  ],
```

(The paths are `bootstrap-icons@1.11.1/icons/<name>.svg`'s, `npm pack bootstrap-icons@1.11.1` to compare; each `fill-rule="evenodd"` path is `evenOdd: true`.)

- [ ] **Step 7: Verify**

```bash
pnpm format
pnpm --filter @sportbet/web exec vitest run --config vitest.component.config.ts src/components/hub/crests.test.ts src/components/format/vilnius-time.test.ts src/components/shell/icon.test.tsx
pnpm --filter @sportbet/web typecheck && pnpm lint
```

Expected: PASS, 10 tests in the two new files, `icon.test.tsx` unchanged; typecheck and lint silent.

- [ ] **Step 8: Hand to the lead.** Commit message: `feat(web): sportbet's Euroleague crests (TeamLogo), the hub's icons, Vilnius time in Lithuanian (R-51) (#19)`.

---

### Task 8 (web-dev): The hub's components

**Files:**
- Create in `apps/web/src/components/hub/`: `header-line.ts` (`headerLine`, and R-56's `sportName`), `glyphs.ts`, `styles.ts`, `flash.ts`, `flash-alert.tsx`, `charity-card.tsx`, `card-action.tsx`, `widgets.tsx`, `tournament-card.tsx`, `hub-view.tsx`, and a test beside each `.tsx` and `header-line.ts`
- Create: `apps/web/tests/support/hub-cards.ts` (the component tests' cards)

- [ ] **Step 1: The cards the tests draw** - `apps/web/tests/support/hub-cards.ts`:

```ts
import type { HubCard } from '@sportbet/db';
import type { Instant, Tournament, TournamentProfile } from '@sportbet/domain';
import { at } from '@sportbet/domain/testing';

// Hub cards for component tests: test data only.

export const EL_2026: Tournament = {
  id: 2,
  slug: 'euroleague-2026-27',
  name: 'Euroleague 2026/27',
  format: 'euroleague',
  endsOn: '2027-05-23',
  standingsDeadlineRound: null,
  survival: true,
  standingsTableFinal: false,
};

export const PROFILE: TournamentProfile = {
  status: 'active',
  startsOn: '2026-09-30',
  sport: 'basketball',
  description: 'Eurolygos sezonas',
  isPublic: true,
};

export const TIP_OFF: Instant = at('2026-10-06T18:00:00Z');

/** A card with nothing but its header; `over` sets the rest. */
export function card(over: Partial<HubCard> = {}): HubCard {
  return {
    tournament: EL_2026,
    profile: PROFILE,
    group: 'active',
    action: null,
    howItWorks: false,
    upcomingGames: [],
    guestPanels: null,
    ...over,
  };
}
```

- [ ] **Step 2: Write the failing tests**

`apps/web/src/components/hub/header-line.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import { PROFILE } from '../../../tests/support/hub-cards';
import { headerLine, sportName } from './header-line';

// hub.blade.php and register.blade.php: the sport (R-56), then "· start - end"
// or "· nuo start".

describe('sportName (R-56)', () => {
  it.each([
    ['basketball', 'Krepšinis'],
    ['Basketball', 'Krepšinis'],
    ['FOOTBALL', 'Futbolas'],
    ['football', 'Futbolas'],
    ['handball', 'handball'],
    ['Rankinis', 'Rankinis'],
  ] as const)('sport (R-56): %s is shown as %s', (stored, shown) => {
    expect(sportName(stored)).toBe(shown);
  });
});

describe('headerLine', () => {
  it('header: the sport with its first letter raised, and both dates', () => {
    expect(headerLine(PROFILE, '2027-05-23')).toBe(
      'Krepšinis · 2026-09-30 - 2027-05-23',
    );
  });

  it('header: "nuo" the start date when there is no end date', () => {
    expect(headerLine(PROFILE, null)).toBe('Krepšinis · nuo 2026-09-30');
  });

  it('header: the sport alone with no start date', () => {
    expect(headerLine({ ...PROFILE, startsOn: null }, '2027-05-23')).toBe(
      'Krepšinis',
    );
  });
});
```

`apps/web/src/components/hub/flash-alert.test.tsx`:

```tsx
import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { FlashAlert } from './flash-alert';

// sportbet's session('info') and session('error') alerts.

describe('FlashAlert', () => {
  it('flash: a registration done is a success, naming the tournament', () => {
    render(
      <FlashAlert flash={{ kind: 'registered', tournament: 'Euroleague 2027/28' }} />,
    );
    expect(screen.getByRole('status').textContent).toBe(
      'Užsiregistravote į turnyrą: Euroleague 2027/28',
    );
  });

  it.each([
    ['registration-closed', 'Registracija į šį turnyrą jau pasibaigė.'],
    ['confirm-required', 'Patvirtinkite, kad norite dalyvauti šiame turnyre.'],
  ] as const)('flash: %s is an error: %s', (kind, text) => {
    render(<FlashAlert flash={{ kind }} />);
    expect(screen.getByRole('alert').textContent).toBe(text);
  });
});
```

`apps/web/src/components/hub/charity-card.test.tsx`:

```tsx
import { render, screen } from '@testing-library/react';
import { expect, it } from 'vitest';
import { CharityCard } from './charity-card';

it("charity (R-52): sportbet's card, speaking of basketball, with 7 500€", () => {
  render(<CharityCard />);
  const card = screen.getByTestId('charity-card');
  expect(
    screen.getByRole('heading', { name: 'Žaidžiame dėl gero tikslo' }),
  ).toBeDefined();
  expect(card.textContent).toContain(
    'SportBet - tai ne tik krepšinio prognozių žaidimas.',
  );
  expect(card.textContent).not.toContain('futbolo');
  expect(card.textContent).toContain('Jaunimo linijai');
  expect(card.textContent).toContain('7 500€');
  expect(card.textContent).toContain('paaukota nuo 2018 m.');
  // The charity page is not built yet: no link to it.
  expect(card.querySelector('a')).toBeNull();
});
```

`apps/web/src/components/hub/card-action.test.tsx`:

```tsx
import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { CardActionButton } from './card-action';

describe("CardActionButton: hub.blade.php's buttons", () => {
  it.each([
    ['play', 'Žaisti →'],
    ['join', 'Prisijungti →'],
    ['view', 'Peržiūrėti →'],
  ] as const)('card: %s posts to the tournament\'s enter: %s', (action, label) => {
    render(<CardActionButton action={action} slug="euroleague-2026-27" />);
    const form = screen.getByRole('button', { name: label }).closest('form');
    expect(form?.getAttribute('method')).toBe('post');
    expect(form?.getAttribute('action')).toBe(
      '/tournament/euroleague-2026-27/enter',
    );
  });

  it('card: register is a plain link to the form (never prefetched)', () => {
    render(<CardActionButton action="register" slug="euroleague-2027-28" />);
    const link = screen.getByRole('link', { name: 'Registruotis į turnyrą →' });
    expect(link.getAttribute('href')).toBe('/tournament/euroleague-2027-28/register');
  });

  it("card: view-results links to the tournament's page", () => {
    render(<CardActionButton action="view-results" slug="euroleague-2025-26" />);
    expect(
      screen
        .getByRole('link', { name: 'Peržiūrėti rezultatus →' })
        .getAttribute('href'),
    ).toBe('/tournament/euroleague-2025-26');
  });
});
```

`apps/web/src/components/hub/widgets.test.tsx`:

```tsx
import { render, screen, within } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { TIP_OFF } from '../../../tests/support/hub-cards';
import {
  HowItWorks,
  LeadersPanel,
  MedalsPanel,
  StatsPanel,
  UpcomingGames,
} from './widgets';

describe('HowItWorks (R-52)', () => {
  it("how it works: sportbet's three items, the second speaking of points, not goals", () => {
    render(<HowItWorks />);
    const box = screen.getByTestId('how-it-works');
    expect(within(box).getByText('Kaip tai veikia?')).toBeDefined();
    expect(box.textContent).toContain('Spėk rungtynių rezultatus');
    expect(box.textContent).toContain('Prognozuok tikslų rezultatą prieš kiekvieną rungtynę');
    expect(box.textContent).toContain(
      'Taškus gauni už tikslų rezultatą, nugalėtoją ir taškų skirtumą',
    );
    expect(box.textContent).not.toContain('įvarčių');
    expect(box.textContent).toContain('Sukurk privačią lygą su draugais arba prisijunk prie esamos');
  });
});

describe('UpcomingGames (R-51)', () => {
  it('next games: each in Vilnius time, home vs away', () => {
    render(
      <UpcomingGames
        games={[{ id: 1, tipOff: TIP_OFF, home: 'Zalgiris Kaunas', away: 'Real Madrid' }]}
      />,
    );
    const list = screen.getByTestId('upcoming-games');
    expect(within(list).getByText('Artėjančios rungtynės')).toBeDefined();
    expect(list.textContent).toContain('spalio 6 d., 21:00');
    expect(list.textContent).toContain('Zalgiris Kaunas vs Real Madrid');
  });
});

describe('LeadersPanel', () => {
  it('leaders: rank, username and the total to one decimal in "pt"; "Visos vietos" unlinked until the leaderboard exists', () => {
    render(
      <LeadersPanel
        leaders={[
          { rank: 1, username: 'ada', totalCents: 12345 },
          { rank: 2, username: 'ben', totalCents: 1000 },
          { rank: 2, username: 'cai', totalCents: 1000 },
          { rank: 4, username: 'dan', totalCents: -50 },
        ]}
      />,
    );
    const panel = screen.getByTestId('leaders');
    const rows = within(panel).getAllByTestId('leader');
    expect(rows.map((row) => row.getAttribute('data-rank'))).toEqual(['1', '2', '2', '4']);
    expect(rows[0]?.textContent).toContain('ada');
    expect(rows[0]?.textContent).toContain('123.5 pt');
    expect(rows[3]?.textContent).toContain('4');
    expect(rows[3]?.textContent).toContain('-0.5 pt');
    expect(within(panel).getByText('Visos vietos →').closest('a')).toBeNull();
  });
});

describe('MedalsPanel', () => {
  it('medals: each team with its crest and its four counts', () => {
    render(
      <MedalsPanel
        medals={[{ team: 'Real Madrid', first: 2, second: 1, third: 0, fourth: 0 }]}
      />,
    );
    const row = within(screen.getByTestId('medals')).getByTestId('medal-row');
    expect(row.querySelector('img')?.getAttribute('src')).toBe('/img/teams/real%20madrid.png');
    expect(row.querySelector('img')?.getAttribute('alt')).toBe('Real Madrid');
    expect(
      [...row.querySelectorAll('[data-testid="medal-count"]')].map((each) => each.textContent),
    ).toEqual(['2', '1', '0', '0']);
  });
});

describe('StatsPanel', () => {
  it('stats: the players, and the predictions with thousands marked when there are any', () => {
    render(<StatsPanel participants={42} predictions={1234} />);
    const panel = screen.getByTestId('stats');
    expect(panel.textContent).toContain('42');
    expect(panel.textContent).toContain('dalyviai');
    expect(panel.textContent).toContain('1,234');
    expect(panel.textContent).toContain('prognozės');
  });

  it('stats: no predictions line while there are none', () => {
    render(<StatsPanel participants={1} predictions={0} />);
    expect(screen.getByTestId('stats').textContent).not.toContain('prognozės');
  });
});
```

`apps/web/src/components/hub/tournament-card.test.tsx`:

```tsx
import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { card, TIP_OFF } from '../../../tests/support/hub-cards';
import { TournamentCard } from './tournament-card';

const GAME = { id: 1, tipOff: TIP_OFF, home: 'Zalgiris Kaunas', away: 'Real Madrid' };

describe('TournamentCard', () => {
  it('card: name, sport and dates, description, and no button when there is none', () => {
    render(<TournamentCard card={card()} />);
    const shown = screen.getByTestId('tournament-card');
    expect(screen.getByRole('heading', { name: 'Euroleague 2026/27' })).toBeDefined();
    expect(shown.textContent).toContain('Krepšinis · 2026-09-30 - 2027-05-23');
    expect(shown.textContent).toContain('Eurolygos sezonas');
    expect(shown.querySelector('button, a')).toBeNull();
  });

  it('card: its button', () => {
    render(<TournamentCard card={card({ action: 'play' })} />);
    expect(screen.getByRole('button', { name: 'Žaisti →' })).toBeDefined();
  });

  it('card: an upcoming card explains the game and lists its next games', () => {
    render(
      <TournamentCard
        card={card({ group: 'upcoming', howItWorks: true, upcomingGames: [GAME] })}
      />,
    );
    expect(screen.getByTestId('how-it-works')).toBeDefined();
    expect(screen.getByTestId('upcoming-games')).toBeDefined();
  });

  it("card: a guest's active card shows the leaders and medals when there are any, the next games, and always the stats", () => {
    render(
      <TournamentCard
        card={card({
          upcomingGames: [GAME],
          guestPanels: { leaders: [], medals: [], participants: 3, predictions: 0 },
        })}
      />,
    );
    expect(screen.queryByTestId('leaders')).toBeNull();
    expect(screen.queryByTestId('medals')).toBeNull();
    expect(screen.getByTestId('upcoming-games')).toBeDefined();
    expect(screen.getByTestId('stats')).toBeDefined();
    expect(screen.queryByTestId('how-it-works')).toBeNull();
  });
});
```

`apps/web/src/components/hub/hub-view.test.tsx`:

```tsx
import { render, screen, within } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { card, EL_2026 } from '../../../tests/support/hub-cards';
import { HubView } from './hub-view';

const named = (id: number, name: string, group: 'active' | 'upcoming' | 'finished') =>
  card({ tournament: { ...EL_2026, id, slug: `t-${String(id)}`, name }, group });

describe('HubView', () => {
  it('hub: the charity card, then each group with its heading, in the order given, then the disclaimer', () => {
    render(
      <HubView
        cards={[
          named(1, 'Vykstantis', 'active'),
          named(2, 'Artėjantis', 'upcoming'),
          named(3, 'Pasibaigęs', 'finished'),
        ]}
        flash={null}
      />,
    );
    expect(screen.getByTestId('charity-card')).toBeDefined();
    const groups = ['active', 'upcoming', 'finished'].map((group) =>
      screen.getByTestId(`hub-group-${group}`),
    );
    expect(groups.map((group) => group.querySelector('h2')?.textContent)).toEqual([
      expect.stringContaining('Vykstantys turnyrai'),
      expect.stringContaining('Artėjantys turnyrai'),
      expect.stringContaining('Pasibaigę turnyrai'),
    ]);
    expect(within(groups[1] ?? document.body).getByText('Artėjantis')).toBeDefined();
    expect(
      screen.getByText('SportBet yra nemokamas pramoginis žaidimas - realių pinigų lažybų nėra.'),
    ).toBeDefined();
  });

  it('hub: a group with no tournament is not drawn', () => {
    render(<HubView cards={[named(1, 'Vykstantis', 'active')]} flash={null} />);
    expect(screen.queryByTestId('hub-group-upcoming')).toBeNull();
    expect(screen.queryByTestId('hub-group-finished')).toBeNull();
  });

  it('hub: with no tournament at all, the empty state (issue #53)', () => {
    render(<HubView cards={[]} flash={null} />);
    expect(screen.getByText('Turnyrų kol kas nėra')).toBeDefined();
    expect(
      screen.getByText('Kai tik bus paskelbtas naujas turnyras, jis atsiras čia.'),
    ).toBeDefined();
  });

  it('hub: a one-time message above everything', () => {
    render(<HubView cards={[]} flash={{ kind: 'registration-closed' }} />);
    expect(screen.getByRole('alert').textContent).toBe(
      'Registracija į šį turnyrą jau pasibaigė.',
    );
  });

  it('hub: one level-1 heading, for screen readers', () => {
    render(<HubView cards={[]} flash={null} />);
    expect(screen.getByRole('heading', { level: 1, name: 'Turnyrai' })).toBeDefined();
  });
});
```

- [ ] **Step 3: Run them to see them fail**

Run: `pnpm --filter @sportbet/web exec vitest run --config vitest.component.config.ts src/components/hub`
Expected: FAIL - the components do not resolve.

- [ ] **Step 4: Write the shared pieces**

`apps/web/src/components/hub/glyphs.ts`:

```ts
/**
 * sportbet's emoji on the hub, by code point: no emoji is typed into a
 * source file (the plan's conventions).
 */
export const GLYPH = {
  /** "Vykstantys turnyrai": red circle. */
  active: String.fromCodePoint(0x1f534),
  /** "Artėjantys turnyrai": hourglass. */
  upcoming: String.fromCodePoint(0x23f3),
  /** "Pasibaigę turnyrai": file folder. */
  finished: String.fromCodePoint(0x1f4c1),
  /** Ranks 1, 2 and 3 in "Lyderiai": the medals. */
  gold: String.fromCodePoint(0x1f947),
  silver: String.fromCodePoint(0x1f948),
  bronze: String.fromCodePoint(0x1f949),
  /** "Kaip tai veikia?": direct hit, bar chart, trophy. */
  target: String.fromCodePoint(0x1f3af),
  chart: String.fromCodePoint(0x1f4ca),
  trophy: String.fromCodePoint(0x1f3c6),
  /** The charity card's heart. */
  heart: String.fromCodePoint(0x2665),
} as const;
```

`apps/web/src/components/hub/styles.ts`:

```ts
// The hub's and the tournament pages' shared classes: sportbet's sb-card,
// its widget boxes and its sb-btn variants, on the colour tokens only.

export const CARD = 'mb-6 rounded-xl border border-border bg-card p-5';

export const PANEL =
  'h-full rounded-[10px] border border-border bg-surface-2 p-[18px]';

export const PANEL_TITLE =
  'mb-[14px] flex items-center gap-2 text-[0.88rem] font-bold';

const BUTTON =
  'inline-flex items-center gap-1 rounded-md px-4 py-2 text-[0.88rem] font-bold no-underline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent';

export const BUTTON_PRIMARY = `${BUTTON} bg-accent text-on-accent hover:bg-accent-hover`;

export const BUTTON_SECONDARY = `${BUTTON} border border-border-strong bg-card text-text hover:bg-surface-2`;

export const BUTTON_GHOST =
  'inline-flex items-center gap-1 rounded-md px-3 py-1 text-[0.8rem] font-semibold text-muted no-underline hover:text-text';

/** A button that is not a link yet (its page arrives in a later slice). */
export const BUTTON_INERT = `${BUTTON} bg-accent text-on-accent opacity-60`;
```

`apps/web/src/components/hub/flash.ts`:

```ts
/**
 * The one-time messages sportbet flashes (`->with('info' | 'error', ...)`),
 * by kind: the texts are FlashAlert's (decision 13), the cookie is
 * server/flash.ts's.
 */
export type Flash =
  | { readonly kind: 'registered'; readonly tournament: string }
  | { readonly kind: 'registration-closed' }
  | { readonly kind: 'confirm-required' };
```

`apps/web/src/components/hub/header-line.ts`:

```ts
import type { TournamentProfile } from '@sportbet/domain';

const SPORT_NAMES: Readonly<Record<string, string>> = {
  basketball: 'Krepšinis',
  football: 'Futbolas',
};

/**
 * R-56: the sport in Lithuanian - "Krepšinis", "Futbolas" - matched on the
 * stored value without regard to case; any other value as typed. sportbet
 * shows `ucfirst($t->sport)`, in English. Display only, not a RuleSet field.
 */
export function sportName(stored: string): string {
  return SPORT_NAMES[stored.toLowerCase()] ?? stored;
}

/**
 * A tournament card's second line (hub.blade.php, register.blade.php):
 * the sport (R-56), then " · start - end" or " · nuo start".
 */
export function headerLine(
  profile: Pick<TournamentProfile, 'sport' | 'startsOn'>,
  endsOn: string | null,
): string {
  const sport = sportName(profile.sport);
  if (profile.startsOn === null) return sport;
  return endsOn === null
    ? `${sport} · nuo ${profile.startsOn}`
    : `${sport} · ${profile.startsOn} - ${endsOn}`;
}
```

- [ ] **Step 5: Write the components**

`apps/web/src/components/hub/flash-alert.tsx`:

```tsx
import { Icon } from '../shell/icon';
import type { Flash } from './flash';

const TEXT = {
  'registration-closed': 'Registracija į šį turnyrą jau pasibaigė.',
  'confirm-required': 'Patvirtinkite, kad norite dalyvauti šiame turnyre.',
} as const;

/** sportbet's alert-success (`session('info')`) or alert-danger (`session('error')`). */
export function FlashAlert({ flash }: { flash: Flash }) {
  if (flash.kind === 'registered') {
    return (
      <div
        role="status"
        className="mb-3 flex items-center gap-2 rounded-md bg-ok-tint px-3 py-2 text-[0.9rem] text-ok"
      >
        <Icon name="check-circle-fill" />
        {`Užsiregistravote į turnyrą: ${flash.tournament}`}
      </div>
    );
  }
  return (
    <div
      role="alert"
      className="mb-3 flex items-center gap-2 rounded-md bg-bad-tint px-3 py-2 text-[0.9rem] text-bad"
    >
      <Icon name="exclamation-circle" />
      {TEXT[flash.kind]}
    </div>
  );
}
```

(`Icon` renders an `aria-hidden` SVG, so `textContent` is the text alone; if it renders a title, assert with `toContain` instead.)

`apps/web/src/components/hub/charity-card.tsx`:

```tsx
import { Icon } from '../shell/icon';
import { GLYPH } from './glyphs';

/**
 * hub.blade.php's charity card. R-52: sportbet's "futbolo prognozių
 * žaidimas" reads "krepšinio" here; the rest, and the 7 500€ written into
 * sportbet's page, are sportbet's. The charity page is not built yet, so
 * its two links are text until it is.
 */
export function CharityCard() {
  return (
    <section
      data-testid="charity-card"
      className="mb-6 flex flex-wrap items-center gap-4 rounded-xl border border-border bg-card p-5"
    >
      <div aria-hidden="true" className="text-[1.6rem] text-bad">
        {GLYPH.heart}
      </div>
      <div className="min-w-0 flex-1">
        <h3 className="mb-1 text-[1rem] font-bold">Žaidžiame dėl gero tikslo</h3>
        <p className="mb-2 text-[0.88rem] text-muted">
          SportBet - tai ne tik krepšinio prognozių žaidimas. Nuo 2018 metų
          žaidėjai savanoriškai aukoja Jaunimo linijai, teikiančiai
          psichologinę pagalbą jaunimui visoje Lietuvoje. Iki 2024 m. kiekvieną
          auką dvigubino TransUnion Lithuania.
        </p>
        <span className="inline-flex items-center text-[0.85rem] font-semibold text-accent">
          Sužinoti daugiau <Icon name="arrow-right-short" />
        </span>
      </div>
      <div className="flex flex-col items-center rounded-[10px] bg-surface-2 px-4 py-3">
        <span className="text-[1.4rem] font-extrabold text-accent">7 500€</span>
        <span className="text-[0.75rem] text-muted">paaukota nuo 2018 m.</span>
      </div>
    </section>
  );
}
```

JSX joins the paragraph's lines with single spaces, so `textContent` holds the sentences as the test expects.

`apps/web/src/components/hub/card-action.tsx`:

```tsx
import type { CardAction } from '@sportbet/domain';
import Link from 'next/link';
import { BUTTON_PRIMARY, BUTTON_SECONDARY } from './styles';

const ENTER_LABEL = {
  play: 'Žaisti →',
  join: 'Prisijungti →',
  view: 'Peržiūrėti →',
} as const;

/**
 * hub.blade.php's button. Entering is a POST to the tournament's enter
 * (a plain form: the next page reads the session's tournament fresh);
 * the form is a plain link, never prefetched (the plan's decision 9).
 */
export function CardActionButton({
  action,
  slug,
}: {
  action: CardAction;
  slug: string;
}) {
  switch (action) {
    case 'play':
    case 'join':
    case 'view':
      return (
        <form method="post" action={`/tournament/${slug}/enter`}>
          <button type="submit" className={BUTTON_PRIMARY}>
            {ENTER_LABEL[action]}
          </button>
        </form>
      );
    case 'register':
      return (
        <a href={`/tournament/${slug}/register`} className={BUTTON_PRIMARY}>
          Registruotis į turnyrą →
        </a>
      );
    case 'view-results':
      return (
        <Link href={`/tournament/${slug}`} className={BUTTON_SECONDARY}>
          Peržiūrėti rezultatus →
        </Link>
      );
  }
}
```

`apps/web/src/components/hub/widgets.tsx`:

```tsx
import type { HubLeader, UpcomingGame } from '@sportbet/db';
import { leaderPoints, numberFormat, type MedalRow } from '@sportbet/domain';
import { vilniusDateTime } from '../format/vilnius-time';
import { Icon } from '../shell/icon';
import { GLYPH } from './glyphs';
import { PANEL, PANEL_TITLE } from './styles';
import { TeamCrest } from './team-crest';

const HOW_IT_WORKS = [
  {
    glyph: GLYPH.target,
    title: 'Spėk rungtynių rezultatus',
    text: 'Prognozuok tikslų rezultatą prieš kiekvieną rungtynę',
  },
  {
    glyph: GLYPH.chart,
    title: 'Rink taškus',
    // R-52: sportbet's "įvarčių skirtumą" is "taškų skirtumą" here.
    text: 'Taškus gauni už tikslų rezultatą, nugalėtoją ir taškų skirtumą',
  },
  {
    glyph: GLYPH.trophy,
    title: 'Konkuruok lygoje',
    text: 'Sukurk privačią lygą su draugais arba prisijunk prie esamos',
  },
] as const;

/** "Kaip tai veikia?" on an upcoming card. */
export function HowItWorks() {
  return (
    <div data-testid="how-it-works" className={PANEL}>
      <div className={PANEL_TITLE}>
        <Icon name="info-circle" /> Kaip tai veikia?
      </div>
      <div className="flex flex-col gap-3">
        {HOW_IT_WORKS.map((item) => (
          <div key={item.title} className="flex items-start gap-3">
            <span aria-hidden="true" className="text-[1.4rem] leading-none">
              {item.glyph}
            </span>
            <div>
              <div className="text-[0.88rem] font-semibold">{item.title}</div>
              <div className="text-[0.8rem] text-muted">{item.text}</div>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

/** "Artėjančios rungtynės": each game's time in Vilnius (R-51), then "home vs away". */
export function UpcomingGames({ games }: { games: readonly UpcomingGame[] }) {
  return (
    <div data-testid="upcoming-games" className={PANEL}>
      <div className={PANEL_TITLE}>
        <Icon name="calendar3" /> Artėjančios rungtynės
      </div>
      <div className="flex flex-col gap-[10px]">
        {games.map((game) => (
          <div key={game.id} className="text-[0.85rem]">
            <div className="mb-[2px] text-[0.75rem] text-muted">
              {vilniusDateTime(game.tipOff)}
            </div>
            <div className="font-semibold">
              {game.home} <span className="font-normal text-muted">vs</span>{' '}
              {game.away}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

const MEDAL = [GLYPH.gold, GLYPH.silver, GLYPH.bronze] as const;

/**
 * "Lyderiai": ranks 1 to 3 as medals, the rest as numbers, the username
 * and the total to one decimal. "Visos vietos →" leads to the leaderboard
 * once slice 8 builds it; until then it is text.
 */
export function LeadersPanel({ leaders }: { leaders: readonly HubLeader[] }) {
  return (
    <div data-testid="leaders" className={PANEL}>
      <div className={PANEL_TITLE}>
        <Icon name="trophy-fill" /> Lyderiai
        <span className="ms-auto text-[0.75rem] font-semibold text-muted">
          Visos vietos →
        </span>
      </div>
      <div className="flex flex-col gap-[6px]">
        {leaders.map((leader) => (
          <div
            key={leader.username}
            data-testid="leader"
            data-rank={leader.rank}
            className="flex items-center gap-2 border-b border-border py-[5px] last:border-b-0"
          >
            <span className="w-6 shrink-0 text-center text-[1rem]">
              {MEDAL[leader.rank - 1] ?? (
                <span className="text-[0.8rem] text-muted">{leader.rank}</span>
              )}
            </span>
            <span className="flex-1 text-[0.85rem] font-semibold">
              {leader.username}
            </span>
            <span className="text-[0.85rem] font-bold text-accent">
              {leaderPoints(leader.totalCents)} pt
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}

/** "Finalų prognozės": each team's crest and how many put it 1st to 4th. */
export function MedalsPanel({ medals }: { medals: readonly MedalRow[] }) {
  return (
    <div data-testid="medals" className={PANEL}>
      <div className={PANEL_TITLE}>
        <Icon name="graph-up-arrow" /> Finalų prognozės
      </div>
      <div className="flex flex-col gap-[6px]">
        {medals.map((row) => (
          <div
            key={row.team}
            data-testid="medal-row"
            className="flex items-center gap-2"
          >
            <span className="flex min-w-0 flex-1 items-center gap-2">
              <TeamCrest team={row.team} />
              <span className="text-[0.82rem]">{row.team}</span>
            </span>
            {[row.first, row.second, row.third, row.fourth].map(
              (count, place) => (
                <span
                  key={place}
                  data-testid="medal-count"
                  className={`min-w-6 rounded-sm px-1 text-center text-[0.78rem] font-bold ${count === 0 ? 'text-dim' : 'bg-accent-tint text-accent'}`}
                >
                  {count}
                </span>
              ),
            )}
          </div>
        ))}
      </div>
    </div>
  );
}

/** "Statistika": the players, and the predictions once there are any. */
export function StatsPanel({
  participants,
  predictions,
}: {
  participants: number;
  predictions: number;
}) {
  return (
    <div data-testid="stats" className={PANEL}>
      <div className={PANEL_TITLE}>
        <Icon name="bar-chart-fill" /> Statistika
      </div>
      <div className="flex flex-wrap gap-4">
        <div>
          <div className="text-[1.4rem] font-bold text-accent">
            {participants}
          </div>
          <div className="text-[0.75rem] text-muted">dalyviai</div>
        </div>
        {predictions > 0 ? (
          <div>
            <div className="text-[1.4rem] font-bold text-accent">
              {numberFormat(predictions, 0)}
            </div>
            <div className="text-[0.75rem] text-muted">prognozės</div>
          </div>
        ) : null}
      </div>
    </div>
  );
}
```

`apps/web/src/components/hub/tournament-card.tsx`:

```tsx
import type { HubCard } from '@sportbet/db';
import { CardActionButton } from './card-action';
import { headerLine } from './header-line';
import { CARD } from './styles';
import {
  HowItWorks,
  LeadersPanel,
  MedalsPanel,
  StatsPanel,
  UpcomingGames,
} from './widgets';

/** One tournament card of the hub: its header, its button, its widgets. */
export function TournamentCard({ card }: { card: HubCard }) {
  const { tournament, profile, upcomingGames, guestPanels } = card;
  const games =
    upcomingGames.length > 0 ? <UpcomingGames games={upcomingGames} /> : null;
  return (
    <article data-testid="tournament-card" className={CARD}>
      <div className="mb-5 flex flex-wrap items-center gap-3">
        <div className="min-w-0 flex-1">
          <h3 className="mb-1 text-[1.15rem] font-bold">{tournament.name}</h3>
          <div className="text-[0.8rem] text-muted">
            {headerLine(profile, tournament.endsOn)}
          </div>
          {profile.description === null ? null : (
            <p className="mt-2 mb-0 text-[0.85rem] text-muted">
              {profile.description}
            </p>
          )}
        </div>
        {card.action === null ? null : (
          <div className="shrink-0">
            <CardActionButton action={card.action} slug={tournament.slug} />
          </div>
        )}
      </div>
      {card.howItWorks ? (
        <div className="grid gap-3 md:grid-cols-[7fr_5fr]">
          <HowItWorks />
          {games}
        </div>
      ) : null}
      {guestPanels === null ? null : (
        <div className="grid gap-3 md:grid-cols-3">
          {guestPanels.leaders.length > 0 ? (
            <LeadersPanel leaders={guestPanels.leaders} />
          ) : null}
          {guestPanels.medals.length > 0 ? (
            <MedalsPanel medals={guestPanels.medals} />
          ) : null}
          {games}
          <StatsPanel
            participants={guestPanels.participants}
            predictions={guestPanels.predictions}
          />
        </div>
      )}
    </article>
  );
}
```

`apps/web/src/components/hub/hub-view.tsx`:

```tsx
import type { HubCard } from '@sportbet/db';
import type { HubGroup } from '@sportbet/domain';
import { CharityCard } from './charity-card';
import type { Flash } from './flash';
import { FlashAlert } from './flash-alert';
import { GLYPH } from './glyphs';
import { CARD } from './styles';
import { TournamentCard } from './tournament-card';

const GROUPS: readonly (readonly [HubGroup, string])[] = [
  ['active', `${GLYPH.active} Vykstantys turnyrai`],
  ['upcoming', `${GLYPH.upcoming} Artėjantys turnyrai`],
  ['finished', `${GLYPH.finished} Pasibaigę turnyrai`],
];

/**
 * TournamentController::hub's page (hub.blade.php): the one-time message,
 * the charity card, the empty state, each group's cards in the order
 * given (orderHub), the disclaimer. The admin's "Sukurti turnyrą" in the
 * empty state arrives with the admin screens.
 */
export function HubView({
  cards,
  flash,
}: {
  cards: readonly HubCard[];
  flash: Flash | null;
}) {
  return (
    <>
      <h1 className="sr-only">Turnyrai</h1>
      {flash === null ? null : <FlashAlert flash={flash} />}
      <CharityCard />
      {cards.length === 0 ? (
        <div className={`${CARD} text-center`}>
          <div aria-hidden="true" className="mb-3 text-[2rem]">
            {GLYPH.trophy}
          </div>
          <div className="mb-[6px] text-[1.05rem] font-bold">
            Turnyrų kol kas nėra
          </div>
          <p className="m-0 text-[0.88rem] text-muted">
            Kai tik bus paskelbtas naujas turnyras, jis atsiras čia.
          </p>
        </div>
      ) : null}
      {GROUPS.map(([group, label]) => {
        const inGroup = cards.filter((card) => card.group === group);
        if (inGroup.length === 0) return null;
        return (
          <section key={group} data-testid={`hub-group-${group}`}>
            <h2 className="mt-7 mb-3 text-[0.82rem] font-bold tracking-[0.08em] text-muted uppercase">
              {label}
            </h2>
            {inGroup.map((card) => (
              <TournamentCard key={card.tournament.id} card={card} />
            ))}
          </section>
        );
      })}
      <p className="mt-2 text-[0.78rem] text-muted opacity-65">
        SportBet yra nemokamas pramoginis žaidimas - realių pinigų lažybų nėra.
      </p>
    </>
  );
}
```

`uppercase` changes only the look; `textContent` keeps sportbet's case, as the test reads it.

- [ ] **Step 6: Run them to see them pass**

Run: `pnpm --filter @sportbet/web exec vitest run --config vitest.component.config.ts src/components/hub src/token-guard.test.ts`
Expected: PASS - every hub test, and the token guard (no literal colour, no palette class, no `dark:`).

- [ ] **Step 7: Verify**

```bash
pnpm format
pnpm test:component 2>&1 | grep -E "Test Files|Tests "
pnpm --filter @sportbet/web typecheck && pnpm lint
LC_ALL=C.UTF-8 grep -rnP '[\x{1F300}-\x{1FAFF}\x{2600}-\x{27BF}\x{23F3}]' apps/web/src apps/web/tests | wc -l
```

Expected: every component test passes; typecheck and lint silent; `0` emoji in any source file.

- [ ] **Step 8: Hand to the lead.** Commit message: `feat(web): the hub's components - the sport in Lithuanian (R-56), charity card (R-52), groups, cards, buttons, how it works, next games (R-51), leaders, medal count, stats, one-time message (#19)`.

---

### Task 9 (web-dev): The hub and the tournament page, served; the not-found inside the shell

**Files:**
- Create: `apps/web/src/server/viewer.ts`
- Modify: `apps/web/src/app/page.tsx`, `apps/web/src/app/tournament/[slug]/page.tsx`
- Create: `apps/web/src/app/tournament/[slug]/not-found.tsx`
- Create: `apps/web/src/components/tournament/tournament-page-view.tsx`, `apps/web/src/components/tournament/tournament-page-view.test.tsx`
- Delete: `apps/web/src/components/home-view.tsx`, `tournament-list.tsx`, `tournament-details.tsx` and their three tests
- Create: `apps/web/tests/support/hub.ts`
- Modify: `apps/web/tests/feature/routes.test.ts`
- Create: `apps/web/tests/feature/hub.test.ts`

- [ ] **Step 1: Write the failing component test** - `apps/web/src/components/tournament/tournament-page-view.test.tsx`

```tsx
import type { TournamentPage } from '@sportbet/db';
import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { EL_2026, PROFILE } from '../../../tests/support/hub-cards';
import { TournamentPageView } from './tournament-page-view';

const PAGE: TournamentPage = {
  tournament: EL_2026,
  profile: PROFILE,
  finished: false,
  participants: 42,
  action: 'sign-in',
};

describe("TournamentPageView: show.blade.php's header", () => {
  it('tournament page: the name, the description, sport, year and players, and the way back', () => {
    render(<TournamentPageView page={PAGE} />);
    expect(
      screen.getByRole('heading', { level: 1, name: 'Euroleague 2026/27' }),
    ).toBeDefined();
    expect(screen.getByText('Eurolygos sezonas')).toBeDefined();
    expect(screen.getByText('Krepšinis · 2026 · 42 dalyviai')).toBeDefined();
    expect(
      screen.getByRole('link', { name: '← Turnyrai' }).getAttribute('href'),
    ).toBe('/');
  });

  it('tournament page: a guest is asked to sign in for this tournament', () => {
    render(<TournamentPageView page={PAGE} />);
    expect(
      screen
        .getByRole('link', { name: 'Prisijungti ir dalyvauti' })
        .getAttribute('href'),
    ).toBe('/login?tournament=euroleague-2026-27');
  });

  it('tournament page: a player not in it, while it is open, registers through its form', () => {
    render(<TournamentPageView page={{ ...PAGE, action: 'register' }} />);
    expect(
      screen
        .getByRole('link', { name: 'Registruotis į turnyrą' })
        .getAttribute('href'),
    ).toBe('/tournament/euroleague-2026-27/register');
  });

  it('tournament page: otherwise "Sukurti lygą šiame turnyre", not a link until leagues exist', () => {
    render(<TournamentPageView page={{ ...PAGE, action: 'create-league' }} />);
    expect(
      screen.getByText('Sukurti lygą šiame turnyre').closest('a'),
    ).toBeNull();
  });

  it('tournament page: no start date, no year', () => {
    render(
      <TournamentPageView
        page={{ ...PAGE, profile: { ...PROFILE, startsOn: null } }}
      />,
    );
    expect(screen.getByText('Krepšinis · 42 dalyviai')).toBeDefined();
  });

  it('tournament page: a finished tournament shows only the way back', () => {
    render(<TournamentPageView page={{ ...PAGE, finished: true }} />);
    expect(screen.getByRole('link', { name: '← Turnyrai' })).toBeDefined();
    expect(screen.queryByRole('heading')).toBeNull();
  });
});
```

Run: `pnpm --filter @sportbet/web exec vitest run --config vitest.component.config.ts src/components/tournament`
Expected: FAIL - `./tournament-page-view` does not resolve.

- [ ] **Step 2: Write `apps/web/src/components/tournament/tournament-page-view.tsx`**

```tsx
import type { TournamentPage } from '@sportbet/db';
import type { TournamentPageAction } from '@sportbet/domain';
import Link from 'next/link';
import {
  BUTTON_GHOST,
  BUTTON_INERT,
  BUTTON_PRIMARY,
  CARD,
} from '../hub/styles';
import { sportName } from '../hub/header-line';
import { Icon } from '../shell/icon';

function BackToHub() {
  return (
    <Link href="/" className={BUTTON_GHOST}>
      ← Turnyrai
    </Link>
  );
}

function PageAction({
  action,
  slug,
}: {
  action: TournamentPageAction;
  slug: string;
}) {
  switch (action) {
    case 'sign-in':
      return (
        <a href={`/login?tournament=${slug}`} className={BUTTON_PRIMARY}>
          Prisijungti ir dalyvauti
        </a>
      );
    case 'register':
      return (
        <a href={`/tournament/${slug}/register`} className={BUTTON_PRIMARY}>
          <Icon name="pencil-square" /> Registruotis į turnyrą
        </a>
      );
    case 'create-league':
      // The leagues page is slice 12's: text until it exists.
      return (
        <span className={BUTTON_INERT}>
          <Icon name="plus-circle" /> Sukurti lygą šiame turnyre
        </span>
      );
  }
}

/**
 * TournamentController::show (show.blade.php): a finished tournament
 * shows only the way back; any other its header card - name, description,
 * sport, start year and players, and the button for the viewer. The
 * public league table below it is slice 8's.
 */
export function TournamentPageView({ page }: { page: TournamentPage }) {
  if (page.finished) {
    return (
      <div className="mb-3">
        <BackToHub />
      </div>
    );
  }
  const { tournament, profile } = page;
  const sport = sportName(profile.sport);
  const year =
    profile.startsOn === null ? '' : ` · ${profile.startsOn.slice(0, 4)}`;
  return (
    <article className={CARD}>
      <div className="mb-3 flex items-center gap-2">
        <Icon name="globe2" />
        <h1 className="m-0 text-[1.05rem] font-bold">{tournament.name}</h1>
        <span className="ms-auto">
          <BackToHub />
        </span>
      </div>
      {profile.description === null ? null : (
        <p className="mb-4 text-[0.9rem] text-muted">{profile.description}</p>
      )}
      <div className="mb-5 text-[0.85rem] text-muted">
        {`${sport}${year} · ${String(page.participants)} dalyviai`}
      </div>
      <PageAction action={page.action} slug={tournament.slug} />
    </article>
  );
}
```

Run: `pnpm --filter @sportbet/web exec vitest run --config vitest.component.config.ts src/components/tournament`
Expected: PASS, 6 tests.

- [ ] **Step 3: The viewer, and the pages** - `apps/web/src/server/viewer.ts`:

```ts
import type { HubViewer } from '@sportbet/db';
import { isAdmin } from '@sportbet/domain';
import { signedInPlayer } from './request-context';

/** Who the hub and the tournament pages are drawn for: the signed-in player, if any, and whether an admin (R-50). */
export async function hubViewer(): Promise<HubViewer> {
  const signedIn = await signedInPlayer();
  return signedIn === null
    ? { player: null, isAdmin: false }
    : { player: signedIn.player, isAdmin: isAdmin(signedIn.adminLevel) };
}
```

`apps/web/src/app/page.tsx`:

```tsx
import { loadHub } from '@sportbet/db';
import { ruledRules } from '@sportbet/domain';
import { connection } from 'next/server';
import { HubView } from '../components/hub/hub-view';
import { now } from '../server/clock';
import { getDb } from '../server/db';
import { hubViewer } from '../server/viewer';

export default async function HubPage() {
  await connection(); // per request, never prerendered at build
  const cards = await loadHub(getDb(), await hubViewer(), now(), ruledRules);
  return <HubView cards={cards} flash={null} />;
}
```

(Task 12 passes the one-time message instead of `null`.)

`apps/web/src/app/tournament/[slug]/page.tsx`:

```tsx
import { loadTournamentPage } from '@sportbet/db';
import { ruledRules, slugSchema } from '@sportbet/domain';
import { notFound } from 'next/navigation';
import { connection } from 'next/server';
import { TournamentPageView } from '../../../components/tournament/tournament-page-view';
import { now } from '../../../server/clock';
import { getDb } from '../../../server/db';
import { hubViewer } from '../../../server/viewer';

export default async function TournamentPage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  await connection();
  const slug = slugSchema.safeParse((await params).slug);
  if (!slug.success) notFound();
  const page = await loadTournamentPage(
    getDb(),
    slug.data,
    await hubViewer(),
    now(),
    ruledRules,
  );
  if (page === null) notFound();
  return <TournamentPageView page={page} />;
}
```

`apps/web/src/app/tournament/[slug]/not-found.tsx`:

```tsx
import { NotFoundView } from '../../../components/not-found-view';

/**
 * The tournament pages' own not-found boundary, inside the root layout:
 * an unknown or hidden tournament (R-50) is answered with the shell and
 * "Puslapis nerastas" rendered on the server (#16: the root boundary
 * alone reached the browser as Next 16's bare error document).
 */
export default function TournamentNotFound() {
  return <NotFoundView />;
}
```

Delete the replaced components and their tests:

```bash
git rm apps/web/src/components/home-view.tsx apps/web/src/components/home-view.test.tsx \
  apps/web/src/components/tournament-list.tsx apps/web/src/components/tournament-list.test.tsx \
  apps/web/src/components/tournament-details.tsx apps/web/src/components/tournament-details.test.tsx
grep -rn "home-view\|tournament-list\|tournament-details" apps/web/src apps/web/tests apps/web/e2e apps/web/look | wc -l
```

Expected: `0` references left (`back-to-list.tsx` stays: `NotFoundView` uses it).

- [ ] **Step 4: The feature tests' helpers** - `apps/web/tests/support/hub.ts`:

```ts
import {
  createSession,
  findTournamentBySlug,
  saveTournamentProfile,
  type Db,
} from '@sportbet/db';
import {
  utcDay,
  type StoredPlayer,
  type TournamentProfile,
} from '@sportbet/domain';
import { now } from '../../src/server/clock';
import {
  hashSessionToken,
  newSessionToken,
} from '../../src/server/session/session-token';
import { saveAccounts } from './accounts';
import { Browser } from './browser';

export const ACTIVE_PROFILE: TournamentProfile = {
  status: 'active',
  startsOn: '2026-09-30',
  sport: 'basketball',
  description: null,
  isPublic: true,
};

/** Sets the profile of the tournament stored at `slug`. */
export async function withProfile(
  db: Db,
  slug: string,
  profile: TournamentProfile,
): Promise<void> {
  const tournament = await findTournamentBySlug(db, slug);
  if (tournament === undefined) throw new Error(`no tournament ${slug}`);
  await saveTournamentProfile(db, tournament, profile);
}

/** A browser holding a live session for `account` (saved with its settings at `adminLevel`). */
export async function signedInBrowser(
  db: Db,
  baseUrl: string,
  account: StoredPlayer,
  adminLevel = 0,
  ip = '192.0.2.40',
): Promise<Browser> {
  await saveAccounts(db, [account], adminLevel);
  const token = newSessionToken();
  const began = now();
  await createSession(db, {
    player: account.id,
    tokenHash: hashSessionToken(token),
    now: began,
  });
  const browser = new Browser(baseUrl, ip);
  browser.setCookie('__Host-sb_session', `${token}.${utcDay(began)}`);
  return browser;
}
```

- [ ] **Step 5: Rewrite the route tests** - in `apps/web/tests/feature/routes.test.ts`, replace the `describe('GET /', ...)` and `describe('GET /tournament/[slug]', ...)` blocks with:

```ts
describe('GET / (the hub)', () => {
  it('groups the stored tournaments: active first, then upcoming', async () => {
    await insertTournaments(db, [EUROLEAGUE_2025_26, EUROLEAGUE_2026_27]);
    await withProfile(db, EUROLEAGUE_2026_27.slug, ACTIVE_PROFILE);
    const { status, body } = await fetchPage('/');
    expect(status).toBe(200);
    const page = new JSDOM(body).window.document;
    const group = (name: string) =>
      page.querySelector(`[data-testid="hub-group-${name}"]`)?.textContent ?? '';
    expect(group('active')).toContain('Euroleague 2026/27');
    // A tournament saved with no profile has sportbet's default status, upcoming.
    expect(group('upcoming')).toContain('Euroleague 2025/26');
  });

  it('reads the database on every request, not at build time', async () => {
    expect((await fetchPage('/')).body).toContain('Turnyrų kol kas nėra');
    await insertTournaments(db, [EUROLEAGUE_2025_26]);
    expect((await fetchPage('/')).body).toContain('Euroleague 2025/26');
  });
});

describe('GET /tournament/[slug]', () => {
  it("shows a stored tournament's header card", async () => {
    await insertTournaments(db, [EUROLEAGUE_2026_27]);
    await withProfile(db, EUROLEAGUE_2026_27.slug, ACTIVE_PROFILE);
    const { status, body } = await fetchPage('/tournament/euroleague-2026-27');
    expect(status).toBe(200);
    const page = new JSDOM(body).window.document;
    expect(page.querySelector('h1')?.textContent).toBe('Euroleague 2026/27');
    expect(body).toContain('Krepšinis · 2026 · 0 dalyviai');
  });

  it('is a 404 for an unknown slug, rendered on the server inside the shell (#16)', async () => {
    const { status, body } = await fetchPage('/tournament/no-such-tournament');
    expect(status).toBe(404);
    // Read without running a script: what the server rendered.
    const page = new JSDOM(body).window.document;
    expect(page.querySelector('h1')?.textContent).toBe('Puslapis nerastas');
    expect(page.querySelector('[data-testid="rail"]')).not.toBeNull();
  });

  it('is a 404 for a slug that is not a valid slug at all', async () => {
    expect((await fetchPage('/tournament/Not_A_Slug')).status).toBe(404);
  });

  it('is a 404 for a non-public tournament seen by a guest (R-50)', async () => {
    await insertTournaments(db, [EUROLEAGUE_2026_27]);
    await withProfile(db, EUROLEAGUE_2026_27.slug, {
      ...ACTIVE_PROFILE,
      isPublic: false,
    });
    expect((await fetchPage('/tournament/euroleague-2026-27')).status).toBe(
      404,
    );
  });
});
```

and in `describe('the page shell', ...)`, replace the comment above `frames the 404 page too` with `// An address no route matches: Next serves it from its not-found route, rendered on the server.` Imports: add `import { JSDOM } from 'jsdom';` and `import { ACTIVE_PROFILE, withProfile } from '../support/hub';`.

- [ ] **Step 6: A signed-in player's hub** - `apps/web/tests/feature/hub.test.ts`:

```ts
import { insertTournaments } from '@sportbet/db';
import { useTestDatabase } from '@sportbet/db/testing';
import { describe, expect, inject, it } from 'vitest';
import { saveTournamentWithGames, SOONER } from '../support/registration';
import { JONAS_ACCOUNT } from '../support/accounts';
import { Browser, documentOf } from '../support/browser';
import { ACTIVE_PROFILE, signedInBrowser, withProfile } from '../support/hub';
import { EUROLEAGUE_2025_26 } from '../support/tournaments';

// TournamentController::hub for a signed-in player, and R-50, against
// the built app.

const baseUrl = inject('baseUrl');
const { db } = useTestDatabase();

describe('the hub, signed in', () => {
  it('offers a tournament still taking players its registration link, and a guest no button', async () => {
    await saveTournamentWithGames(db, SOONER);
    await withProfile(db, SOONER.tournament.slug, ACTIVE_PROFILE);
    const browser = await signedInBrowser(db, baseUrl, JONAS_ACCOUNT);
    const signedIn = documentOf(await browser.get('/'));
    expect(
      signedIn
        .querySelector(`a[href="/tournament/${SOONER.tournament.slug}/register"]`)
        ?.textContent,
    ).toBe('Registruotis į turnyrą →');
    const guest = documentOf(await new Browser(baseUrl, '192.0.2.41').get('/'));
    expect(
      guest.querySelector(`a[href="/tournament/${SOONER.tournament.slug}/register"]`),
    ).toBeNull();
  });

  it('leaves out a non-public tournament for a player not in it, and shows it to an admin (R-50)', async () => {
    await insertTournaments(db, [EUROLEAGUE_2025_26]);
    await withProfile(db, EUROLEAGUE_2025_26.slug, {
      ...ACTIVE_PROFILE,
      isPublic: false,
    });
    const player = await signedInBrowser(db, baseUrl, JONAS_ACCOUNT);
    expect((await player.get('/')).html).not.toContain('Euroleague 2025/26');
    const admin = await signedInBrowser(db, baseUrl, JONAS_ACCOUNT, 1, '192.0.2.42');
    expect((await admin.get('/')).html).toContain('Euroleague 2025/26');
  });
});
```

- [ ] **Step 7: Run them**

```bash
pnpm format
pnpm --filter @sportbet/web typecheck && pnpm lint
pnpm build && pnpm --filter @sportbet/web exec vitest run --config vitest.feature.config.ts tests/feature/routes.test.ts tests/feature/hub.test.ts
```

Expected: PASS. If `is a 404 for an unknown slug, rendered on the server inside the shell` fails because the body holds no `h1` outside a script (Next's bare error document), the segment boundary did not change how Next 16.3.6 renders a page's `notFound()`: stop, use superpowers:systematic-debugging on that one test, and hand the finding to the lead before changing anything else. Do not weaken the assertion.

- [ ] **Step 8: Verify the suites**

```bash
pnpm test:component 2>&1 | grep -E "Test Files|Tests "
pnpm test:feature 2>&1 | grep -E "Test Files|Tests "
```

Expected: every test passes. (`sign-in.test.ts`, `registration.test.ts` and `session.test.ts` read `/` too; none depends on the old list's markup. If one does, it changes to the hub's, never the other way round.)

- [ ] **Step 9: Hand to the lead.** Commit message: `feat(web): the tournaments hub and the tournament page's header, served; an unknown or hidden tournament's 404 rendered on the server inside the shell (#16, R-50) (#19)`.

---

### Task 10 (qa): The hub and the tournament page in a browser, and the smoke check

**Files:**
- Modify: `apps/web/e2e/tournaments.spec.ts` (rewritten), `apps/web/smoke/smoke.test.ts`

These run against CI's E2E stack and again against staging, both seeded by `packages/db/src/seed/staging.ts` (Task 4): 2026/27 active with one game on 2027-03-04, 2027/28 upcoming, 2025/26 finished, "Bandomasis turnyras" finished and non-public.

- [ ] **Step 1: Rewrite `apps/web/e2e/tournaments.spec.ts`**

```ts
import { expect, test } from '@playwright/test';

// The hub and the tournament page (slice 5, #19), against the staging
// seed (packages/db/src/seed/staging.ts).

test("a visitor sees the hub's three groups in sportbet's order, and not the non-public tournament", async ({
  page,
}) => {
  await page.goto('/');
  await expect(
    page.getByRole('heading', { level: 1, name: 'Turnyrai' }),
  ).toBeAttached();
  const active = page.getByTestId('hub-group-active');
  const upcoming = page.getByTestId('hub-group-upcoming');
  const finished = page.getByTestId('hub-group-finished');
  await expect(active.getByRole('heading', { name: 'Euroleague 2026/27' })).toBeVisible();
  await expect(upcoming.getByRole('heading', { name: 'Euroleague 2027/28' })).toBeVisible();
  await expect(finished.getByRole('heading', { name: 'Euroleague 2025/26' })).toBeVisible();
  await expect(page.getByText('Bandomasis turnyras')).toHaveCount(0);
  const groups = await page.locator('[data-testid^="hub-group-"]').evaluateAll(
    (sections) => sections.map((section) => section.getAttribute('data-testid')),
  );
  expect(groups).toEqual(['hub-group-active', 'hub-group-upcoming', 'hub-group-finished']);
});

test("a visitor's active card lists its next game in Vilnius time, and its stats; the upcoming card explains the game", async ({
  page,
}) => {
  await page.goto('/');
  const active = page.getByTestId('hub-group-active');
  await expect(active.getByTestId('upcoming-games')).toContainText('kovo 4 d., 20:00');
  await expect(active.getByTestId('upcoming-games')).toContainText('Zalgiris Kaunas vs Real Madrid');
  await expect(active.getByTestId('stats')).toContainText('dalyviai');
  await expect(page.getByTestId('hub-group-upcoming').getByTestId('how-it-works')).toBeVisible();
});

test("a finished card leads to its results page, which shows only the way back", async ({
  page,
}) => {
  await page.goto('/');
  await page
    .getByTestId('hub-group-finished')
    .getByRole('link', { name: 'Peržiūrėti rezultatus →' })
    .click();
  await expect(page).toHaveURL('/tournament/euroleague-2025-26');
  await page.getByRole('link', { name: '← Turnyrai', exact: true }).click();
  await expect(page).toHaveURL('/');
});

test("an active tournament's page: its header, and the way to sign in for it", async ({
  page,
}) => {
  await page.goto('/tournament/euroleague-2026-27');
  await expect(
    page.getByRole('heading', { level: 1, name: 'Euroleague 2026/27' }),
  ).toBeVisible();
  await expect(page.getByText(/^Krepšinis · 2026 · [0-9]+ dalyviai$/)).toBeVisible();
  await expect(
    page.getByRole('link', { name: 'Prisijungti ir dalyvauti' }),
  ).toHaveAttribute('href', '/login?tournament=euroleague-2026-27');
});

test('an unknown tournament, and a non-public one, are a 404 page inside the shell', async ({
  page,
}) => {
  for (const path of ['/tournament/no-such-tournament', '/tournament/bandomasis-turnyras']) {
    const response = await page.goto(path);
    expect(response?.status()).toBe(404);
    await expect(
      page.getByRole('heading', { level: 1, name: 'Puslapis nerastas', exact: true }),
    ).toBeVisible();
  }
});
```

- [ ] **Step 2: The smoke check** - in `apps/web/smoke/smoke.test.ts`'s `serves the home page`, add after the status check:

```ts
    const body = await response.text();
    expect(body).toContain('data-testid="charity-card"');
    expect(body).toContain('data-testid="hub-group-active"');
```

(read the body once; if the test already reads it, reuse that variable).

- [ ] **Step 3: Run E2E against a local stack**

```bash
pnpm build
docker build --target web -t sportbet-web:local .
docker build --target migrate -t sportbet-migrate:local .
WEB_IMAGE=sportbet-web:local MIGRATE_IMAGE=sportbet-migrate:local infra/ci/e2e-stack.sh up sb-local
E2E_BASE_URL=http://localhost:3000 pnpm test:e2e -- tournaments.spec.ts shell.spec.ts
infra/ci/e2e-stack.sh down sb-local
```

Use the base URL and Mailpit URL the `up` command prints if they differ. Expected: every test passes.

- [ ] **Step 4: Hand to the lead.** Commit message: `test(e2e): the hub's groups, cards and widgets, the tournament page and its 404, against the staging seed (#19)`.

---

### Task 11 (lead): The end of 5a - the whole check and a review pass

**Files:** none (fixes are their own commits).

- [ ] **Step 1: The whole check, as CI runs it** - the commands of Task 18 Step 1. Expected: every suite passes, each with at least Task 0's count.
- [ ] **Step 2: Review 5a.** `architect` reviews `<gate>..HEAD` against `CLAUDE.md` and the spec - in particular decision 2 (`sumTournamentTotals`), the two `RuleSet` fields, the profile's place outside `Tournament`, and the page/component split; `qa` against #19's criteria and sportbet's hub, show and TeamLogo. Fixes are made by the task's role and committed by the lead, one per finding, each with `#19`.
- [ ] **Step 3: The look.** Run `STAGING_URL=http://localhost:3000/ pnpm --filter @sportbet/web look:signoff` against the local stack (Task 10 Step 3's) and compare `/` with sportbet.lt's hub at 390 and 1280, light and dark. Differences of layout are noted on #19 for the owner's staging check; none blocks 5b.

---

## Part 5b: the actions

### Task 12 (web-dev): One-time messages - the flash cookie **(sensitive)**

**Files:**
- Modify: `apps/web/src/server/cookies.ts` (`FLASH_COOKIE`, `FLASH_HEADER`, and Task 13's `RETURN_COOKIE`), `apps/web/src/server/cookies.test.ts`
- Create: `apps/web/src/server/flash.ts`, `apps/web/src/server/flash.test.ts`
- Modify: `apps/web/src/proxy.ts`, `apps/web/src/app/page.tsx`

- [ ] **Step 1: Write the failing tests**

Append to `describe("the app's cookies", ...)` in `apps/web/src/server/cookies.test.ts` (adding `FLASH_COOKIE` and `RETURN_COOKIE` to its import):

```ts
  it("a one-time message: 60 seconds, as /login's open-the-dialog; only the server reads and clears it", () => {
    expect(FLASH_COOKIE).toEqual({
      name: '__Host-sb_flash',
      options: { ...COOKIE_FLAGS, maxAge: 60 },
    });
  });

  it("the return path after sign-in: two hours, sportbet's session lifetime, which held url.intended", () => {
    expect(RETURN_COOKIE).toEqual({
      name: '__Host-sb_return',
      options: { ...COOKIE_FLAGS, maxAge: 7200 },
    });
  });
```

`apps/web/src/server/flash.test.ts`:

```ts
import { at } from '@sportbet/domain/testing';
import { describe, expect, it } from 'vitest';
import { seal } from './sealed';
import { openFlash, sealFlash } from './flash';

const SECRET = 'test-secret-test-secret-test-secret';
const SENT = at('2026-10-06T12:00:00Z');

// sportbet's ->with('info' | 'error', ...): a message for the next page,
// sealed so no one else can write one, and stale after its 60 seconds.

describe('the one-time message', () => {
  it('flash: opens to the message sealed, within its minute', () => {
    const sealed = sealFlash(
      { kind: 'registered', tournament: 'Euroleague 2027/28' },
      SENT,
      SECRET,
    );
    expect(openFlash(sealed, SECRET, at('2026-10-06T12:01:00Z'))).toEqual({
      kind: 'registered',
      tournament: 'Euroleague 2027/28',
    });
  });

  it('flash: is nothing after its minute, without a value, under another key, or sealed for another purpose', () => {
    const sealed = sealFlash({ kind: 'registration-closed' }, SENT, SECRET);
    expect(openFlash(sealed, SECRET, at('2026-10-06T12:01:01Z'))).toBeNull();
    expect(openFlash(null, SECRET, SENT)).toBeNull();
    expect(openFlash(sealed, `${SECRET}-other`, SENT)).toBeNull();
    const asRegistration = seal(
      'registration',
      { flash: { kind: 'registration-closed' }, at: '2026-10-06T12:00:00Z' },
      SECRET,
    );
    expect(openFlash(asRegistration, SECRET, SENT)).toBeNull();
  });

  it('flash: a sealed value of a kind the app does not have is nothing', () => {
    const odd = seal(
      'flash',
      { flash: { kind: 'anything', text: 'x' }, at: '2026-10-06T12:00:00Z' },
      SECRET,
    );
    expect(openFlash(odd, SECRET, SENT)).toBeNull();
  });
});
```

Run: `pnpm --filter @sportbet/web exec vitest run --config vitest.component.config.ts src/server/cookies.test.ts src/server/flash.test.ts`
Expected: FAIL - `FLASH_COOKIE` is not exported; `./flash` does not resolve.

- [ ] **Step 2: The cookies** - add to `apps/web/src/server/cookies.ts`, after `INTENDED_TOURNAMENT_COOKIE`:

```ts
/**
 * A one-time message for the next page (sportbet's `->with('info' |
 * 'error', ...)` flash; server/flash.ts): sealed, for 60 seconds.
 * proxy.ts turns it into FLASH_HEADER for that page and clears it on the
 * page's response, as it does OPEN_SIGN_IN_COOKIE.
 */
export const FLASH_COOKIE: AppCookie = {
  name: '__Host-sb_flash',
  options: { ...FLAGS, maxAge: 60 },
};

/** The request header proxy.ts sets from FLASH_COOKIE, for the page's one render. */
export const FLASH_HEADER = 'x-sportbet-flash';

/**
 * Where sign-in returns to (sportbet's `url.intended`, which
 * `redirect()->intended` reads; server/sign-in/return-path.ts): a path on
 * this site, for two hours, sportbet's session lifetime. Separate from
 * INTENDED_TOURNAMENT_COOKIE, as sportbet's two session keys are.
 */
export const RETURN_COOKIE: AppCookie = {
  name: '__Host-sb_return',
  options: { ...FLAGS, maxAge: 2 * 60 * 60 },
};
```

and in `CLAUDE.md`'s cookie list (Task 17) both names are added.

- [ ] **Step 3: Write `apps/web/src/server/flash.ts`**

```ts
import { instantFrom, type Instant } from '@sportbet/domain';
import { headers } from 'next/headers';
import { z } from 'zod';
import type { Flash } from '../components/hub/flash';
import { env } from '../env';
import { isoSecond, now } from './clock';
import {
  FLASH_COOKIE,
  FLASH_HEADER,
  setCookie,
  withinMaxAge,
  type CookieWriter,
} from './cookies';
import { seal, unseal } from './sealed';

/** What the seal is for: a message's value never opens as another cookie's. */
const PURPOSE = 'flash';

const payloadSchema = z.object({
  flash: z.discriminatedUnion('kind', [
    z.object({ kind: z.literal('registered'), tournament: z.string() }),
    z.object({ kind: z.literal('registration-closed') }),
    z.object({ kind: z.literal('confirm-required') }),
  ]),
  at: z.string(),
});

/** The cookie's value: the message and when it was written, sealed under AUTH_SECRET. */
export function sealFlash(flash: Flash, at: Instant, secret: string): string {
  return seal(PURPOSE, { flash, at: isoSecond(at) }, secret);
}

/** The message, or null for a value missing, forged, sealed for another purpose, of an unknown kind, or past its minute at `now`. */
export function openFlash(
  value: string | null | undefined,
  secret: string,
  now: Instant,
): Flash | null {
  const payload = payloadSchema.safeParse(
    unseal(PURPOSE, value ?? undefined, secret),
  );
  if (!payload.success) return null;
  const at = instantFrom(payload.data.at);
  if (!at.ok || !withinMaxAge(FLASH_COOKIE, at.value, now)) return null;
  return payload.data.flash;
}

/** Leaves a message for the next page (a route handler's response). */
export function writeFlash(
  jar: CookieWriter,
  flash: Flash,
  at: Instant,
  secret: string,
): void {
  setCookie(jar, FLASH_COOKIE, sealFlash(flash, at, secret));
}

/** The message proxy.ts handed this render (FLASH_HEADER), if any. */
export async function readFlash(): Promise<Flash | null> {
  return openFlash(
    (await headers()).get(FLASH_HEADER),
    env().AUTH_SECRET,
    now(),
  );
}
```

Run: `pnpm --filter @sportbet/web exec vitest run --config vitest.component.config.ts src/server/cookies.test.ts src/server/flash.test.ts`
Expected: PASS.

- [ ] **Step 4: `proxy.ts` forwards and clears it** - in `apps/web/src/proxy.ts`, import `FLASH_COOKIE` and `FLASH_HEADER`, and make the function:

```ts
export async function proxy(request: NextRequest): Promise<NextResponse> {
  const opening = readCookie(request.cookies, OPEN_SIGN_IN_COOKIE);
  const flash = readCookie(request.cookies, FLASH_COOKIE);
  const headers = new Headers(request.headers);
  headers.delete(OPEN_SIGN_IN_HEADER);
  headers.delete(FLASH_HEADER);
  // The tab it names, as sent: the dialog reads it (sign-in/dialog.ts).
  if (opening !== undefined) headers.set(OPEN_SIGN_IN_HEADER, opening);
  // Still sealed: the page opens it (server/flash.ts).
  if (flash !== undefined) headers.set(FLASH_HEADER, flash);
  const response = NextResponse.next({ request: { headers } });
  await extendSession(getDb(), request.cookies, response.cookies, now());
  if (opening !== undefined) clearCookie(response.cookies, OPEN_SIGN_IN_COOKIE);
  if (flash !== undefined) clearCookie(response.cookies, FLASH_COOKIE);
  return response;
}
```

and its comment gains: "...and a one-time message (FLASH_COOKIE) the same way: forwarded as FLASH_HEADER, still sealed, and cleared, so it shows on one page only; one a client sends as a header itself is dropped."

- [ ] **Step 5: The hub shows it** - in `apps/web/src/app/page.tsx`, import `readFlash` from `../server/flash` and return `<HubView cards={cards} flash={await readFlash()} />`.

- [ ] **Step 6: Verify**

```bash
pnpm format
pnpm --filter @sportbet/web typecheck && pnpm lint
pnpm test:component 2>&1 | grep -E "Test Files|Tests "
```

Expected: silent; every component test passes. The flash is proven end to end in Task 15's feature tests.

- [ ] **Step 7: Hand to the lead.** Commit message: `feat(web): one-time messages - a sealed __Host-sb_flash, forwarded and cleared by proxy.ts, shown on the hub (#19)`.

---

### Task 13 (web-dev): The return to the form after sign-in **(sensitive)**

**Files:**
- Create: `apps/web/src/server/sign-in/return-path.ts`, `apps/web/src/server/sign-in/return-path.test.ts`
- Modify: `apps/web/src/app/login/route.ts`, `apps/web/src/server/sign-in/verify-code.ts`
- Modify: `apps/web/tests/feature/sign-in.test.ts`

- [ ] **Step 1: Write the failing test** - `apps/web/src/server/sign-in/return-path.test.ts`

```ts
import { describe, expect, it } from 'vitest';
import { safeReturnPath } from './return-path';

// #16's hardened check for sportbet's redirect()->intended: only a path on
// this site, judged as the browser will resolve it.

describe('safeReturnPath', () => {
  it.each([
    ['/tournament/euroleague-2026-27/register', '/tournament/euroleague-2026-27/register'],
    ['/', '/'],
    ['/a/./b/../c?x=1', '/a/c?x=1'],
  ] as const)('return path: %s is kept as %s', (typed, kept) => {
    expect(safeReturnPath(typed)).toBe(kept);
  });

  it.each([
    ['another origin, protocol-relative', '//evil.example'],
    ['a backslash after the slash', '/\\evil.example'],
    ['a dot segment hiding a second slash', '/.//evil.example'],
    ['a parent segment hiding a second slash', '/a/..//evil.example'],
    ['encoded dots hiding a second slash', '/%2e%2e//evil.example'],
    ['an absolute URL', 'https://evil.example/'],
    ['a script URL', 'javascript:alert(1)'],
    ['a relative path', 'tournament/x'],
    ['nothing', ''],
    ['no value', null],
  ] as const)('return path: refuses %s', (_label, typed) => {
    expect(safeReturnPath(typed)).toBeNull();
  });

  it('return path: refuses a control character or a backslash anywhere', () => {
    expect(safeReturnPath(`/a${String.fromCharCode(10)}b`)).toBeNull();
    expect(safeReturnPath(`/a${String.fromCharCode(0)}b`)).toBeNull();
    expect(safeReturnPath('/a\\b')).toBeNull();
  });

  it('return path: refuses one longer than 2,000 characters', () => {
    expect(safeReturnPath(`/${'a'.repeat(2000)}`)).toBeNull();
  });
});
```

Run: `pnpm --filter @sportbet/web exec vitest run --config vitest.component.config.ts src/server/sign-in/return-path.test.ts`
Expected: FAIL - `./return-path` does not resolve.

- [ ] **Step 2: Write `apps/web/src/server/sign-in/return-path.ts`**

```ts
import {
  clearCookie,
  readCookie,
  RETURN_COOKIE,
  setCookie,
  type CookieReader,
  type CookieWriter,
} from '../cookies';

/** An origin no request has: the path is resolved against it, then must stay on it. */
const HERE = 'https://sportbet.invalid';

const MAX_LENGTH = 2000;

const unsafeCharacter = (character: string): boolean => {
  const code = character.charCodeAt(0);
  return code < 0x20 || code === 0x7f || character === '\\';
};

/**
 * #16's hardened check for sportbet's `redirect()->intended`: a path on
 * this site, as a browser will resolve it. It must start with one '/',
 * hold no control character or backslash, and - after the URL parser has
 * removed dot segments, encoded dots included - still be on this origin
 * and start with neither '//' nor '/\' ('/.//evil.example',
 * '/a/..//evil.example' and '/%2e%2e//evil.example' all resolve to
 * '//evil.example'). The resolved path and query are what is kept.
 */
export function safeReturnPath(
  typed: string | null | undefined,
): string | null {
  if (typed === null || typed === undefined) return null;
  if (typed.length === 0 || typed.length > MAX_LENGTH) return null;
  if (!typed.startsWith('/') || [...typed].some(unsafeCharacter)) return null;
  let url: URL;
  try {
    url = new URL(typed, HERE);
  } catch {
    return null;
  }
  if (url.origin !== HERE) return null;
  const path = `${url.pathname}${url.search}`;
  if (path.startsWith('//') || path.startsWith('/\\')) return null;
  return path;
}

/**
 * /login's `?intended=`: the guarded page a guest was sent from (the
 * tournament registration form), kept only if safeReturnPath accepts it;
 * anything else is not kept, and a path kept before stays.
 */
export function rememberReturn(
  jar: CookieWriter,
  typed: string | null,
): void {
  const path = safeReturnPath(typed);
  if (path !== null) setCookie(jar, RETURN_COOKIE, path);
}

/** The path sign-in returns to, checked again as it is read. */
export function readReturn(jar: CookieReader): string | null {
  return safeReturnPath(readCookie(jar, RETURN_COOKIE));
}

/** Forgets it: sign-in has used it. */
export function forgetReturn(jar: CookieWriter): void {
  clearCookie(jar, RETURN_COOKIE);
}
```

Run: `pnpm --filter @sportbet/web exec vitest run --config vitest.component.config.ts src/server/sign-in/return-path.test.ts`
Expected: PASS, 15 tests.

- [ ] **Step 3: `/login` keeps it, sign-in uses it**

In `apps/web/src/app/login/route.ts`, inside the guest branch after `rememberIntended(...)`:

```ts
    rememberReturn(jar, url.searchParams.get('intended'));
```

with `const url = new URL(request.url);` taken once above both calls (`rememberIntended(jar, url.searchParams.get('tournament'))`), and `rememberReturn` imported from `../../server/sign-in/return-path`. The route's comment gains: "an `?intended=` path - the guarded page a guest came from - is kept as where sign-in returns (sportbet's url.intended; return-path.ts)".

In `apps/web/src/server/sign-in/verify-code.ts`, replace the last line `redirect(PLAYER_HOME);` with:

```ts
  const back = readReturn(jar);
  forgetReturn(jar);
  redirect(back ?? PLAYER_HOME);
```

importing `forgetReturn` and `readReturn` from `./return-path`, and replace the doc comment's last clause ("...and on to the player's home: no 4b page is guarded, so there is no intended page to return to (review W5).") with "...and back to the guarded page the guest came from, if /login kept one (sportbet's `redirect()->intended`, checked again by safeReturnPath), else on to the player's home."

- [ ] **Step 4: Prove it against the built app** - in `apps/web/tests/feature/sign-in.test.ts`, add a describe:

```ts
describe('the return to a guarded page (redirect()->intended, #16)', () => {
  it('a guest sent to /login from the tournament form signs in and lands back on it', async () => {
    const browser = visitor('203.0.113.60');
    const login = await browser.get(
      '/login?intended=%2Ftournament%2Feuroleague-2026-27%2Fregister',
    );
    expect(setCookieFor(login, '__Host-sb_return')).toMatch(
      /^__Host-sb_return=\/tournament\/euroleague-2026-27\/register;/,
    );
    const step = await askForCode(browser, JONAS_EMAIL);
    const done = await browser.submit(step, 'sign-in-verify', {
      code: await onlyCode(JONAS_EMAIL),
    });
    expect(done.status).toBe(303);
    expect(done.location).toBe('/tournament/euroleague-2026-27/register');
    expect(browser.cookie('__Host-sb_return')).toBeUndefined();
  });

  it.each([
    '%2F%2Fevil.example',
    '%2F.%2F%2Fevil.example',
    '%2Fa%2F..%2F%2Fevil.example',
    '%2F%252e%252e%2F%2Fevil.example',
    'https%3A%2F%2Fevil.example',
  ])('/login?intended=%s is not kept, and sign-in ends at home', async (intended) => {
    const browser = visitor('203.0.113.61');
    const login = await browser.get(`/login?intended=${intended}`);
    expect(setCookieFor(login, '__Host-sb_return')).toBeUndefined();
    const step = await askForCode(browser, JONAS_EMAIL);
    const done = await browser.submit(step, 'sign-in-verify', {
      code: await onlyCode(JONAS_EMAIL),
    });
    expect(done.location).toBe('/');
  });
});
```

`askForCode` and `onlyCode` are the file's own helpers; `sign-in-verify` is the code step's form, as the file's other tests submit it. Next answers the Server Action's `redirect()` with 303 and its `Location`.

- [ ] **Step 5: Verify**

```bash
pnpm format
pnpm --filter @sportbet/web typecheck && pnpm lint
pnpm build && pnpm --filter @sportbet/web exec vitest run --config vitest.feature.config.ts tests/feature/sign-in.test.ts tests/feature/sign-in-guards.test.ts
```

Expected: PASS - the new tests, and every existing sign-in test (a sign-in with no return path still ends at `/`).

- [ ] **Step 6: Hand to the lead.** Commit message: `feat(web): sign-in returns to the guarded page a guest came from - __Host-sb_return, kept by /login only through #16's hardened same-origin check (#19)`.

---

### Task 14 (web-dev): "Žaisti" and "Keisti turnyrą" - enter and exit **(sensitive)**

**Files:**
- Create: `apps/web/src/app/tournament/[slug]/enter/route.ts`, `apps/web/src/app/tournaments/exit/route.ts`
- Modify: `apps/web/src/components/shell/shell-paths.ts`, `shell-paths.test.ts`, `phone-header.test.tsx`
- Create: `apps/web/tests/feature/joining-from-hub.test.ts`

- [ ] **Step 1: Write the failing feature test** - `apps/web/tests/feature/joining-from-hub.test.ts`

```ts
import {
  listPlayerSettings,
  savePlayerSettings,
} from '@sportbet/db';
import { useTestDatabase } from '@sportbet/db/testing';
import { describe, expect, inject, it } from 'vitest';
import { JONAS_ACCOUNT } from '../support/accounts';
import { Browser } from '../support/browser';
import { ACTIVE_PROFILE, signedInBrowser, withProfile } from '../support/hub';
import {
  LATER,
  saveTournamentWithGames,
  SOONER,
} from '../support/registration';

// TournamentController::enter and exit, the registration form and its
// submit (slice 5b, #19), against the built app.

const baseUrl = inject('baseUrl');
const { db, client } = useTestDatabase();

const enterBody = () => new FormData();

/** Jonas, signed in, in SOONER (41); LATER (42) open to him. */
async function jonasInSooner(): Promise<Browser> {
  await saveTournamentWithGames(db, SOONER);
  await saveTournamentWithGames(db, LATER);
  await withProfile(db, SOONER.tournament.slug, ACTIVE_PROFILE);
  await withProfile(db, LATER.tournament.slug, ACTIVE_PROFILE);
  const browser = await signedInBrowser(db, baseUrl, JONAS_ACCOUNT);
  await client.query(
    'insert into tournament_players (tournament_id, player_id, switched_off, admin_hidden, fill_ins) values (41, 1, false, false, 0)',
  );
  return browser;
}

const lastTournament = async () =>
  (await listPlayerSettings(db))[0]?.lastTournament ?? null;

describe('enter (TournamentController::enter)', () => {
  it("a player in the tournament makes it their last used (R-28) and goes home", async () => {
    const browser = await jonasInSooner();
    const page = await browser.post(
      `/tournament/${SOONER.tournament.slug}/enter`,
      enterBody(),
    );
    expect(page.status).toBe(303);
    expect(page.location).toBe('/');
    expect(await lastTournament()).toBe(SOONER.id);
  });

  it("a player not in it goes to its page, and nothing is written", async () => {
    const browser = await jonasInSooner();
    const page = await browser.post(
      `/tournament/${LATER.tournament.slug}/enter`,
      enterBody(),
    );
    expect(page.location).toBe(`/tournament/${LATER.tournament.slug}`);
    expect(await lastTournament()).toBeNull();
  });

  it('a guest goes to sign in, before the slug is looked at', async () => {
    const page = await new Browser(baseUrl, '192.0.2.50').post(
      '/tournament/no-such/enter',
      enterBody(),
    );
    expect(page.status).toBe(303);
    expect(page.location).toBe('/login');
  });

  it('an unknown tournament is not found', async () => {
    const browser = await jonasInSooner();
    expect(
      (await browser.post('/tournament/no-such/enter', enterBody())).status,
    ).toBe(404);
  });

  it('a POST from another site is refused, and nothing is written', async () => {
    const browser = await jonasInSooner();
    const page = await browser.post(
      `/tournament/${SOONER.tournament.slug}/enter`,
      enterBody(),
      { origin: 'https://evil.example' },
    );
    expect(page.status).toBe(403);
    expect(await lastTournament()).toBeNull();
  });
});

describe('exit (TournamentController::exit, "Keisti turnyrą")', () => {
  it('forgets the last-used tournament and goes to the hub', async () => {
    const browser = await jonasInSooner();
    await savePlayerSettings(db, [
      {
        player: JONAS_ACCOUNT.id,
        locale: 'lt',
        adminLevel: 0,
        lastTournament: SOONER.id,
      },
    ]);
    const page = await browser.get('/tournaments/exit');
    expect(page.status).toBe(302);
    expect(page.location).toBe('/');
    expect(await lastTournament()).toBeNull();
  });

  it('a guest just goes to the hub', async () => {
    const page = await new Browser(baseUrl, '192.0.2.51').get(
      '/tournaments/exit',
    );
    expect(page.location).toBe('/');
  });
});
```

Run: `pnpm build && pnpm --filter @sportbet/web exec vitest run --config vitest.feature.config.ts tests/feature/joining-from-hub.test.ts`
Expected: FAIL - both routes answer 404/405.

- [ ] **Step 2: Write `apps/web/src/app/tournament/[slug]/enter/route.ts`**

```ts
import { findVisibleTournament, setLastTournament } from '@sportbet/db';
import { isAdmin, ruledRules, slugSchema } from '@sportbet/domain';
import { PLAYER_HOME } from '../../../../components/shell/shell-paths';
import { getDb } from '../../../../server/db';
import { signedInPlayer } from '../../../../server/request-context';
import { isSameOrigin } from '../../../../server/request/same-origin';

interface Context {
  readonly params: Promise<{ slug: string }>;
}

const seeOther = (location: string) =>
  new Response(null, { status: 303, headers: { Location: location } });

const notFound = () => new Response(null, { status: 404 });

/**
 * TournamentController::enter: a guest goes to sign in, before the slug
 * is looked at; a tournament the player may not see is not found (R-50);
 * a player in it makes it the one they used last (R-28) and goes to their
 * home; anyone else to its page. Leagues (sportbet's leagueID) are slice
 * 12's.
 */
async function enter(param: string): Promise<Response> {
  const signedIn = await signedInPlayer();
  if (signedIn === null) return seeOther('/login');
  const slug = slugSchema.safeParse(param);
  if (!slug.success) return notFound();
  const db = getDb();
  const found = await findVisibleTournament(
    db,
    slug.data,
    { player: signedIn.player, isAdmin: isAdmin(signedIn.adminLevel) },
    ruledRules,
  );
  if (found === null) return notFound();
  if (!found.member) return seeOther(`/tournament/${slug.data}`);
  await setLastTournament(db, signedIn.player, found.tournament.id);
  return seeOther(PLAYER_HOME);
}

/** The card's "Žaisti →", "Prisijungti →" and "Peržiūrėti →": a POST from this site only (#16). */
export async function POST(
  request: Request,
  { params }: Context,
): Promise<Response> {
  if (!isSameOrigin(request.headers)) {
    return new Response(null, { status: 403 });
  }
  return enter((await params).slug);
}

/**
 * R-53: the registration form sends a player already in the tournament
 * here (a page cannot write; the plan's decision 7). It changes only that
 * player's own last-used tournament.
 */
export async function GET(
  _request: Request,
  { params }: Context,
): Promise<Response> {
  return enter((await params).slug);
}
```

- [ ] **Step 3: Write `apps/web/src/app/tournaments/exit/route.ts`**

```ts
import { setLastTournament } from '@sportbet/db';
import { getDb } from '../../../server/db';
import { signedInPlayer } from '../../../server/request-context';

/**
 * TournamentController::exit ("Keisti turnyrą"), at sportbet's URL and
 * method (a GET): forgets the tournament the player used last (R-28) and
 * goes to the hub; the next page picks by R-46, as sportbet's next /main
 * re-picks. A guest just goes to the hub. The rail links it plainly, never
 * prefetched (rail-tournament.tsx).
 */
export async function GET(): Promise<Response> {
  const signedIn = await signedInPlayer();
  if (signedIn !== null) {
    await setLastTournament(getDb(), signedIn.player, null);
  }
  return new Response(null, { status: 302, headers: { Location: '/' } });
}
```

- [ ] **Step 4: The rail links it** - in `apps/web/src/components/shell/shell-paths.ts`:

```ts
/** Slice 5's: the tournament exit. The profile (17) and administration (13) do not exist yet. */
export const SHELL_LINKS: ShellLinks = {
  profile: null,
  admin: null,
  tournamentExit: TOURNAMENT_EXIT_PATH,
};
```

In `shell-paths.test.ts`, a link may be served by a page or a route handler:

```ts
// #16: each player link is listed only once its page (or route) exists.
it('lists a player link only once its page exists', () => {
  const served = (href: string) =>
    ['page.tsx', 'route.ts'].some((file) =>
      existsSync(join(APP, ...href.split('/'), file)),
    );
  const missing = Object.values(SHELL_LINKS)
    .flatMap((href) => (href === null ? [] : [href]))
    .filter((href) => !served(href));
  expect(missing).toEqual([]);
});
```

In `phone-header.test.tsx`, the 4b test `links to no page that does not exist: no Profilis, Admin or Keisti turnyrą in 4b, for an admin too` becomes `links to no page that does not exist: no Profilis or Admin yet, for an admin too; "Keisti turnyrą" since slice 5`, its `Keisti turnyrą` line:

```ts
    expect(
      screen.getByRole('link', { name: 'Keisti turnyrą' }).getAttribute('href'),
    ).toBe('/tournaments/exit');
```

- [ ] **Step 5: Verify**

```bash
pnpm format
pnpm --filter @sportbet/web typecheck && pnpm lint
pnpm test:component 2>&1 | grep -E "Test Files|Tests "
pnpm build && pnpm --filter @sportbet/web exec vitest run --config vitest.feature.config.ts tests/feature/joining-from-hub.test.ts tests/feature/session.test.ts
```

Expected: PASS everywhere.

- [ ] **Step 6: Hand to the lead.** Commit message: `feat(web): "Žaisti" and "Keisti turnyrą" - enter (a same-origin POST; R-53's GET) makes a tournament the last used, exit forgets it (R-28) (#19)`.

---

### Task 15 (web-dev): The tournament registration form and its submit **(sensitive)**

**Files:**
- Create: `apps/web/src/components/tournament/register-form-view.tsx`, `register-form-view.test.tsx`
- Create: `apps/web/src/app/tournament/[slug]/register/page.tsx`, `register/submit/route.ts`, `register/closed/route.ts`
- Modify: `apps/web/tests/feature/joining-from-hub.test.ts`

- [ ] **Step 1: Write the failing component test** - `apps/web/src/components/tournament/register-form-view.test.tsx`

```tsx
import type { RegistrationForm } from '@sportbet/db';
import { at } from '@sportbet/domain/testing';
import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { EL_2026, PROFILE } from '../../../tests/support/hub-cards';
import { RegisterFormView } from './register-form-view';

const FORM: Extract<RegistrationForm, { step: 'open' }> = {
  step: 'open',
  tournament: EL_2026,
  profile: PROFILE,
  games: 380,
  teams: 20,
  closesAt: at('2026-11-03T18:00:00Z'),
};

describe("RegisterFormView: register.blade.php", () => {
  it("registration form: sportbet's title, the tournament, and what joining gives", () => {
    render(<RegisterFormView form={FORM} error={null} />);
    expect(
      screen.getByRole('heading', { level: 1, name: 'Registracija į turnyrą' }),
    ).toBeDefined();
    expect(screen.getByText('Euroleague 2026/27')).toBeDefined();
    expect(screen.getByText('Krepšinis · 2026-09-30 - 2027-05-23')).toBeDefined();
    expect(screen.getByText('Ką gausite užsiregistravę')).toBeDefined();
    expect(
      screen.getByText('Vietą bendroje šio turnyro lygoje ir lyderių lentelėje.'),
    ).toBeDefined();
    expect(
      screen.getByText('Spėjimų korteles visoms turnyro rungtynėms: 380.'),
    ).toBeDefined();
    expect(
      screen.getByText('Komandų vietų prognozes: 20 komandos.'),
    ).toBeDefined();
  });

  it('registration form (R-54): says when registration closes, in Vilnius time', () => {
    render(<RegisterFormView form={FORM} error={null} />);
    expect(
      screen.getByText('Registracija galima iki lapkričio 3 d., 20:00.'),
    ).toBeDefined();
  });

  it('registration form (R-54): with no closing moment, says nothing of one', () => {
    render(<RegisterFormView form={{ ...FORM, closesAt: null }} error={null} />);
    expect(screen.queryByText(/Registracija galima/)).toBeNull();
  });

  it('registration form: the confirmation, posted to the submit, and a way back', () => {
    render(<RegisterFormView form={FORM} error={null} />);
    const box = screen.getByRole('checkbox', {
      name: 'Patvirtinu, kad noriu dalyvauti šiame turnyre.',
    });
    expect(box.getAttribute('name')).toBe('confirm');
    expect(box.getAttribute('value')).toBe('1');
    const form = box.closest('form');
    expect(form?.getAttribute('method')).toBe('post');
    expect(form?.getAttribute('action')).toBe(
      '/tournament/euroleague-2026-27/register/submit',
    );
    expect(
      screen.getByRole('button', { name: 'Registruotis į turnyrą' }),
    ).toBeDefined();
    expect(
      screen.getByRole('link', { name: 'Atšaukti' }).getAttribute('href'),
    ).toBe('/');
  });

  it("registration form: an unconfirmed submit comes back with sportbet's message", () => {
    render(
      <RegisterFormView form={FORM} error={{ kind: 'confirm-required' }} />,
    );
    expect(screen.getByRole('alert').textContent).toBe(
      'Patvirtinkite, kad norite dalyvauti šiame turnyre.',
    );
  });
});
```

Run: `pnpm --filter @sportbet/web exec vitest run --config vitest.component.config.ts src/components/tournament/register-form-view.test.tsx`
Expected: FAIL - `./register-form-view` does not resolve.

- [ ] **Step 2: Write `apps/web/src/components/tournament/register-form-view.tsx`**

```tsx
import type { RegistrationForm } from '@sportbet/db';
import Link from 'next/link';
import { vilniusDateTime } from '../format/vilnius-time';
import type { Flash } from '../hub/flash';
import { FlashAlert } from '../hub/flash-alert';
import { headerLine } from '../hub/header-line';
import { BUTTON_GHOST, BUTTON_PRIMARY, CARD, PANEL } from '../hub/styles';
import { Icon } from '../shell/icon';

/**
 * TournamentController::registerForm's page (register.blade.php): a page
 * to read and a confirmation to give (issue #63), posted to its submit.
 * R-54: "Registracija galima iki {Vilnius time}." replaces sportbet's
 * "...tik iki pirmųjų turnyro rungtynių pradžios.", and is left out when
 * no moment closes it. "Taisyklės" is text until the rules page exists.
 */
export function RegisterFormView({
  form,
  error,
}: {
  form: Extract<RegistrationForm, { step: 'open' }>;
  error: Flash | null;
}) {
  const { tournament, profile } = form;
  return (
    <div className={`${CARD} mx-auto max-w-[640px]`}>
      <div className="flex items-center gap-2">
        <Icon name="pencil-square" />
        <h1 className="m-0 text-[1.05rem] font-bold">Registracija į turnyrą</h1>
        <Link href="/" className={`ms-auto ${BUTTON_GHOST}`}>
          ← Turnyrai
        </Link>
      </div>
      <div className="mt-4 mb-1 text-[1.1rem] font-bold">{tournament.name}</div>
      <div className="text-[0.85rem] text-muted">
        {headerLine(profile, tournament.endsOn)}
      </div>
      {profile.description === null ? null : (
        <p className="mt-3 mb-0 text-[0.88rem] text-muted">
          {profile.description}
        </p>
      )}
      <div className={`${PANEL} my-5`}>
        <div className="mb-[10px] text-[0.88rem] font-bold">
          Ką gausite užsiregistravę
        </div>
        <ul className="m-0 flex flex-col gap-[6px] pl-5 text-[0.86rem] text-muted">
          <li>Vietą bendroje šio turnyro lygoje ir lyderių lentelėje.</li>
          <li>{`Spėjimų korteles visoms turnyro rungtynėms: ${String(form.games)}.`}</li>
          <li>{`Komandų vietų prognozes: ${String(form.teams)} komandos.`}</li>
        </ul>
      </div>
      <p className="text-[0.85rem] text-muted">
        {form.closesAt === null ? null : (
          <span>{`Registracija galima iki ${vilniusDateTime(form.closesAt)}.`}</span>
        )}{' '}
        <span>Taisyklės</span>
      </p>
      {error === null ? null : <FlashAlert flash={error} />}
      <form
        method="post"
        action={`/tournament/${tournament.slug}/register/submit`}
        data-testid="tournament-register"
      >
        <label className="mb-3 flex items-center gap-2 text-[0.9rem]">
          <input type="checkbox" name="confirm" value="1" />
          Patvirtinu, kad noriu dalyvauti šiame turnyre.
        </label>
        <div className="flex flex-wrap gap-2">
          <button type="submit" className={BUTTON_PRIMARY}>
            Registruotis į turnyrą
          </button>
          <Link href="/" className={BUTTON_GHOST}>
            Atšaukti
          </Link>
        </div>
      </form>
    </div>
  );
}
```

Run: `pnpm --filter @sportbet/web exec vitest run --config vitest.component.config.ts src/components/tournament`
Expected: PASS.

- [ ] **Step 3: The page** - `apps/web/src/app/tournament/[slug]/register/page.tsx`:

```tsx
import { loadRegistrationForm } from '@sportbet/db';
import { isAdmin, ruledRules, slugSchema } from '@sportbet/domain';
import { notFound, redirect } from 'next/navigation';
import { connection } from 'next/server';
import { RegisterFormView } from '../../../../components/tournament/register-form-view';
import { now } from '../../../../server/clock';
import { getDb } from '../../../../server/db';
import { readFlash } from '../../../../server/flash';
import { signedInPlayer } from '../../../../server/request-context';

/**
 * TournamentController::registerForm, behind sportbet's `auth`: a guest
 * goes to sign in and comes back here (the return path, #16); a player in
 * the tournament is taken in (R-53, through enter's GET); a closed one
 * goes home with "Registracija į šį turnyrą jau pasibaigė." (through
 * register/closed, which leaves the message); else the form.
 */
export default async function TournamentRegisterPage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  await connection();
  const slug = slugSchema.safeParse((await params).slug);
  if (!slug.success) notFound();
  const here = `/tournament/${slug.data}/register`;
  const signedIn = await signedInPlayer();
  if (signedIn === null) redirect(`/login?intended=${encodeURIComponent(here)}`);
  const form = await loadRegistrationForm(
    getDb(),
    slug.data,
    { player: signedIn.player, isAdmin: isAdmin(signedIn.adminLevel) },
    now(),
    ruledRules,
  );
  if (form === null) notFound();
  if (form.step === 'member') redirect(`/tournament/${slug.data}/enter`);
  if (form.step === 'closed') redirect(`${here}/closed`);
  const flash = await readFlash();
  return (
    <RegisterFormView
      form={form}
      error={flash?.kind === 'confirm-required' ? flash : null}
    />
  );
}
```

- [ ] **Step 4: The closed hop** - `apps/web/src/app/tournament/[slug]/register/closed/route.ts`:

```ts
import { cookies } from 'next/headers';
import { now } from '../../../../../server/clock';
import { env } from '../../../../../env';
import { writeFlash } from '../../../../../server/flash';

/**
 * The form's "closed" answer (registerForm's redirect to the hub with
 * "Registracija į šį turnyrą jau pasibaigė."): a page cannot set a cookie,
 * so the form sends the player here, which leaves that one message and
 * goes home. It writes nothing else; anyone opening it only sees the
 * message once.
 */
export async function GET(): Promise<Response> {
  writeFlash(
    await cookies(),
    { kind: 'registration-closed' },
    now(),
    env().AUTH_SECRET,
  );
  return new Response(null, { status: 303, headers: { Location: '/' } });
}
```

- [ ] **Step 5: The submit** - `apps/web/src/app/tournament/[slug]/register/submit/route.ts`:

```ts
import {
  findVisibleTournament,
  registerForTournament,
  setLastTournament,
} from '@sportbet/db';
import { isAdmin, ruledRules, slugSchema } from '@sportbet/domain';
import { cookies } from 'next/headers';
import { PLAYER_HOME } from '../../../../../components/shell/shell-paths';
import { env } from '../../../../../env';
import { now } from '../../../../../server/clock';
import { getDb } from '../../../../../server/db';
import { cryptoDice } from '../../../../../server/dice';
import { writeFlash } from '../../../../../server/flash';
import { signedInPlayer } from '../../../../../server/request-context';
import { formText } from '../../../../../server/request/form-input';
import { isSameOrigin } from '../../../../../server/request/same-origin';

interface Context {
  readonly params: Promise<{ slug: string }>;
}

const seeOther = (location: string) =>
  new Response(null, { status: 303, headers: { Location: location } });

/** Laravel's `accepted`: what a ticked box or an agreeing answer sends. */
const ACCEPTED: ReadonlySet<string> = new Set(['1', 'on', 'yes', 'true']);

/**
 * TournamentController::register, from this site only (#16). A guest goes
 * to sign in and back to the form; a tournament the player may not see is
 * not found (R-50); unconfirmed, back to the form with "Patvirtinkite, kad
 * norite dalyvauti šiame turnyre."; a player already in it is taken in
 * whether or not registration has closed (sportbet checks the deadline
 * only for a newcomer); a newcomer joins through registerForTournament
 * (4c: the rows, R-9's fill-ins) or, closed meanwhile, goes home with
 * "Registracija į šį turnyrą jau pasibaigė.". Joined: the tournament is
 * the one they used last (R-28), and home with "Užsiregistravote į
 * turnyrą: {name}".
 */
export async function POST(
  request: Request,
  { params }: Context,
): Promise<Response> {
  if (!isSameOrigin(request.headers)) {
    return new Response(null, { status: 403 });
  }
  const slug = slugSchema.safeParse((await params).slug);
  const signedIn = await signedInPlayer();
  if (signedIn === null) {
    return seeOther(
      slug.success
        ? `/login?intended=${encodeURIComponent(`/tournament/${slug.data}/register`)}`
        : '/login',
    );
  }
  if (!slug.success) return new Response(null, { status: 404 });
  const db = getDb();
  const at = now();
  const found = await findVisibleTournament(
    db,
    slug.data,
    { player: signedIn.player, isAdmin: isAdmin(signedIn.adminLevel) },
    ruledRules,
  );
  if (found === null) return new Response(null, { status: 404 });
  const jar = await cookies();
  const secret = env().AUTH_SECRET;
  const form = await request.formData();
  if (!ACCEPTED.has(formText(form, 'confirm'))) {
    writeFlash(jar, { kind: 'confirm-required' }, at, secret);
    return seeOther(`/tournament/${slug.data}/register`);
  }
  if (!found.member) {
    const joined = await registerForTournament(db, {
      player: signedIn.player,
      tournament: found.tournament,
      rules: ruledRules,
      now: at,
      dice: cryptoDice,
    });
    if (!joined.ok) {
      writeFlash(jar, { kind: 'registration-closed' }, at, secret);
      return seeOther('/');
    }
  }
  await setLastTournament(db, signedIn.player, found.tournament.id);
  writeFlash(
    jar,
    { kind: 'registered', tournament: found.tournament.name },
    at,
    secret,
  );
  return seeOther(PLAYER_HOME);
}
```

(`formText` trims and returns `''` for a missing field - check `server/request/form-input.ts`; if it returns something else for a missing field, compare that.)

- [ ] **Step 6: The feature tests** - append to `apps/web/tests/feature/joining-from-hub.test.ts` (adding `documentOf` and `setCookieFor` to the `../support/browser` import, `CLOSED` to the registration import):

```ts
const FLASH = '__Host-sb_flash';

const rows = async (table: string, tournament: number) =>
  (
    await client.query(
      `select count(*)::int as n from ${table} where player_id = 1 and ${
        table === 'tournament_players'
          ? 'tournament_id = $1'
          : table === 'match_predictions'
            ? 'game_id in (select id from games where tournament_id = $1)'
            : 'team_id in (select id from teams where tournament_id = $1)'
      }`,
      [tournament],
    )
  ).rows[0]?.n;

describe('the registration form (registerForm)', () => {
  it('a guest is sent to sign in, to come back to the form', async () => {
    await saveTournamentWithGames(db, LATER);
    const page = await new Browser(baseUrl, '192.0.2.52').get(
      `/tournament/${LATER.tournament.slug}/register`,
    );
    expect(page.status).toBe(307);
    expect(page.location).toBe(
      `/login?intended=%2Ftournament%2F${LATER.tournament.slug}%2Fregister`,
    );
  });

  it("a player not in it gets sportbet's form", async () => {
    const browser = await jonasInSooner();
    const page = await browser.get(`/tournament/${LATER.tournament.slug}/register`);
    expect(page.status).toBe(200);
    const form = documentOf(page).querySelector(
      'form[data-testid="tournament-register"]',
    );
    expect(form?.getAttribute('action')).toBe(
      `/tournament/${LATER.tournament.slug}/register/submit`,
    );
  });

  it('a player already in it is taken in (R-53), and the tournament becomes their last used', async () => {
    const browser = await jonasInSooner();
    const page = await browser.get(`/tournament/${SOONER.tournament.slug}/register`);
    expect(page.status).toBe(307);
    expect(page.location).toBe(`/tournament/${SOONER.tournament.slug}/enter`);
    const entered = await browser.get(page.location ?? '');
    expect(entered.location).toBe('/');
    expect(await lastTournament()).toBe(SOONER.id);
  });

  it('a closed tournament goes home with "Registracija į šį turnyrą jau pasibaigė." shown once', async () => {
    const browser = await jonasInSooner();
    await saveTournamentWithGames(db, CLOSED);
    await withProfile(db, CLOSED.tournament.slug, ACTIVE_PROFILE);
    const page = await browser.get(`/tournament/${CLOSED.tournament.slug}/register`);
    expect(page.location).toBe(`/tournament/${CLOSED.tournament.slug}/register/closed`);
    const hop = await browser.get(page.location ?? '');
    expect(hop.location).toBe('/');
    expect(setCookieFor(hop, FLASH)).toMatch(/Max-Age=60/);
    const home = await browser.get('/');
    expect(documentOf(home).querySelector('[role="alert"]')?.textContent).toBe(
      'Registracija į šį turnyrą jau pasibaigė.',
    );
    expect(setCookieFor(home, FLASH)).toMatch(/Max-Age=0/);
    const again = await browser.get('/');
    expect(documentOf(again).querySelector('[role="alert"]')).toBeNull();
  });
});

describe('the form submitted (register)', () => {
  const submit = (browser: Browser, slug: string, confirm: string | null) => {
    const body = new FormData();
    if (confirm !== null) body.append('confirm', confirm);
    return browser.post(`/tournament/${slug}/register/submit`, body);
  };

  it('unconfirmed: back to the form with sportbet\'s message, and nothing joined', async () => {
    const browser = await jonasInSooner();
    const page = await submit(browser, LATER.tournament.slug, null);
    expect(page.status).toBe(303);
    expect(page.location).toBe(`/tournament/${LATER.tournament.slug}/register`);
    const form = await browser.get(page.location ?? '');
    expect(documentOf(form).querySelector('[role="alert"]')?.textContent).toBe(
      'Patvirtinkite, kad norite dalyvauti šiame turnyre.',
    );
    expect(await rows('tournament_players', LATER.id)).toBe(0);
  });

  it('confirmed: joins (a place, a blank row per game, a standings row per team), makes it the last used, and goes home with "Užsiregistravote į turnyrą: ..."', async () => {
    const browser = await jonasInSooner();
    const page = await submit(browser, LATER.tournament.slug, '1');
    expect(page.status).toBe(303);
    expect(page.location).toBe('/');
    expect(await rows('tournament_players', LATER.id)).toBe(1);
    expect(await rows('match_predictions', LATER.id)).toBe(2);
    expect(await rows('standings_predictions', LATER.id)).toBe(2);
    expect(await lastTournament()).toBe(LATER.id);
    const home = await browser.get('/');
    expect(documentOf(home).querySelector('[role="status"]')?.textContent).toBe(
      `Užsiregistravote į turnyrą: ${LATER.tournament.name}`,
    );
  });

  it('submitted twice, joins once', async () => {
    const browser = await jonasInSooner();
    await submit(browser, LATER.tournament.slug, '1');
    await submit(browser, LATER.tournament.slug, '1');
    expect(await rows('tournament_players', LATER.id)).toBe(1);
    expect(await rows('match_predictions', LATER.id)).toBe(2);
  });

  it('closed meanwhile: home with the closed message, nothing joined', async () => {
    const browser = await jonasInSooner();
    await saveTournamentWithGames(db, CLOSED);
    await withProfile(db, CLOSED.tournament.slug, ACTIVE_PROFILE);
    const page = await submit(browser, CLOSED.tournament.slug, '1');
    expect(page.location).toBe('/');
    expect(await rows('tournament_players', CLOSED.id)).toBe(0);
    const home = await browser.get('/');
    expect(documentOf(home).querySelector('[role="alert"]')?.textContent).toBe(
      'Registracija į šį turnyrą jau pasibaigė.',
    );
  });

  it('a player already in it, after the close too, is taken in with the message, as sportbet lets a member resubmit', async () => {
    const browser = await jonasInSooner();
    await saveTournamentWithGames(db, CLOSED);
    await withProfile(db, CLOSED.tournament.slug, ACTIVE_PROFILE);
    await client.query(
      'insert into tournament_players (tournament_id, player_id, switched_off, admin_hidden, fill_ins) values ($1, 1, false, false, 0)',
      [CLOSED.id],
    );
    const page = await submit(browser, CLOSED.tournament.slug, '1');
    expect(page.location).toBe('/');
    expect(await lastTournament()).toBe(CLOSED.id);
  });

  it('a guest is sent to sign in, back to the form after', async () => {
    await saveTournamentWithGames(db, LATER);
    const page = await submit(
      new Browser(baseUrl, '192.0.2.53'),
      LATER.tournament.slug,
      '1',
    );
    expect(page.location).toBe(
      `/login?intended=%2Ftournament%2F${LATER.tournament.slug}%2Fregister`,
    );
  });

  it('a POST from another site is refused, and nothing is joined', async () => {
    const browser = await jonasInSooner();
    const body = new FormData();
    body.append('confirm', '1');
    const page = await browser.post(
      `/tournament/${LATER.tournament.slug}/register/submit`,
      body,
      { origin: 'https://evil.example' },
    );
    expect(page.status).toBe(403);
    expect(await rows('tournament_players', LATER.id)).toBe(0);
  });

  it('a POST with no Origin and no Sec-Fetch-Site is refused', async () => {
    const browser = await jonasInSooner();
    const body = new FormData();
    body.append('confirm', '1');
    const page = await browser.post(
      `/tournament/${LATER.tournament.slug}/register/submit`,
      body,
      { origin: null },
    );
    expect(page.status).toBe(403);
  });

  it('a non-public tournament is not found for a player not in it (R-50)', async () => {
    const browser = await jonasInSooner();
    await withProfile(db, LATER.tournament.slug, {
      ...ACTIVE_PROFILE,
      isPublic: false,
    });
    expect((await submit(browser, LATER.tournament.slug, '1')).status).toBe(404);
    expect(
      (await browser.get(`/tournament/${LATER.tournament.slug}/register`)).status,
    ).toBe(404);
  });
});
```

`saveTournamentWithGames` gives each tournament two teams and two unplayed games (its rounds 1 and 5); `LATER` is open (R-8: round 5 in 50 days), `CLOSED` is past its round-5 start. The `rows` helper's three table choices are a test's own SQL, with the tournament id as a parameter.

- [ ] **Step 7: Verify**

```bash
pnpm format
pnpm --filter @sportbet/web typecheck && pnpm lint
pnpm test:component 2>&1 | grep -E "Test Files|Tests "
pnpm build && pnpm --filter @sportbet/web exec vitest run --config vitest.feature.config.ts tests/feature/joining-from-hub.test.ts
```

Expected: PASS everywhere.

- [ ] **Step 8: Hand to the lead.** Commit message: `feat(web): the tournament registration form (R-54) and its submit - confirmed, joined through registerForTournament, the last used, sportbet's messages; a member taken in (R-53); a closed one sent home (#19)`.

---

### Task 16 (qa): Joining a tournament from the hub, in a browser at 1280 and 390

**Files:**
- Create: `apps/web/e2e/support/newcomer.ts` (the registration helpers, moved out of `register.spec.ts`)
- Modify: `apps/web/e2e/register.spec.ts` (imports them)
- Create: `apps/web/e2e/join.spec.ts`
- Modify: `apps/web/playwright.config.ts` (`join.spec.ts` needs Mailpit too)

- [ ] **Step 1: Move the helpers** - `apps/web/e2e/support/newcomer.ts` takes `register.spec.ts`'s `answerCookies`, `Newcomer`, `newcomer`, `register` and `scrollsSideways` as they are, exported, with `MAILPIT` read the same way; `register.spec.ts` imports them from `./support/newcomer` and keeps its tests unchanged. Playwright's default test match (`*.spec.ts`) does not pick up `support/newcomer.ts`.

- [ ] **Step 2: Write `apps/web/e2e/join.spec.ts`**

```ts
import { expect, test } from '@playwright/test';
import {
  answerCookies,
  newcomer,
  register,
  scrollsSideways,
} from './support/newcomer';

// Joining a further tournament from the hub (slice 5, #19): a newcomer of
// this run registers (and so plays Euroleague 2026/27, R-48), opens
// 2027/28's registration form from its card, confirms, lands home in it;
// "Keisti turnyrą" and "Žaisti" switch between them. Only CI's stack has
// Mailpit, so playwright.config.ts leaves this file out against staging.

test.describe.configure({ mode: 'serial' });

test.describe('at a desktop width', () => {
  test.use({ viewport: { width: 1280, height: 800 } });

  test('joins Euroleague 2027/28 through its form, then switches back to 2026/27', async ({
    page,
  }) => {
    await page.goto('/');
    await answerCookies(page);
    await page.getByTestId('rail').getByRole('link', { name: 'Prisijungti' }).click();
    await register(page, newcomer(1280));
    const context = page.getByTestId('rail-context');
    await expect(context.getByText('Euroleague 2026/27')).toBeVisible();

    await page.goto('/');
    await page
      .getByTestId('hub-group-upcoming')
      .getByRole('link', { name: 'Registruotis į turnyrą →' })
      .click();
    await expect(page).toHaveURL('/tournament/euroleague-2027-28/register');
    await expect(
      page.getByRole('heading', { level: 1, name: 'Registracija į turnyrą' }),
    ).toBeVisible();

    // Unconfirmed: back with sportbet's message.
    await page.getByRole('button', { name: 'Registruotis į turnyrą' }).click();
    await expect(page.getByRole('alert')).toHaveText(
      'Patvirtinkite, kad norite dalyvauti šiame turnyre.',
    );

    await page
      .getByRole('checkbox', {
        name: 'Patvirtinu, kad noriu dalyvauti šiame turnyre.',
      })
      .check();
    await page.getByRole('button', { name: 'Registruotis į turnyrą' }).click();
    await expect(page).toHaveURL('/');
    await expect(page.getByRole('status')).toHaveText(
      'Užsiregistravote į turnyrą: Euroleague 2027/28',
    );
    await expect(context.getByText('Euroleague 2027/28')).toBeVisible();

    // "Keisti turnyrą" goes to the hub; "Žaisti" on 2026/27 takes them there.
    await context.getByRole('link', { name: 'Keisti turnyrą' }).click();
    await expect(page).toHaveURL('/');
    await page
      .getByTestId('hub-group-active')
      .getByRole('button', { name: 'Žaisti →' })
      .click();
    await expect(page).toHaveURL('/');
    await expect(context.getByText('Euroleague 2026/27')).toBeVisible();
    expect(await scrollsSideways(page)).toBe(false);
  });
});

test.describe('at a phone width', () => {
  test.use({ viewport: { width: 390, height: 844 } });

  test('the registration form reads at a phone width without scrolling sideways', async ({
    page,
  }) => {
    await page.goto('/');
    await answerCookies(page);
    await page
      .getByTestId('phone-header')
      .getByRole('link', { name: 'Prisijungti' })
      .click();
    await register(page, newcomer(390));
    await page.goto('/tournament/euroleague-2027-28/register');
    await expect(
      page.getByRole('checkbox', {
        name: 'Patvirtinu, kad noriu dalyvauti šiame turnyre.',
      }),
    ).toBeVisible();
    expect(await scrollsSideways(page)).toBe(false);
  });
});
```

- [ ] **Step 3: Leave it out against staging** - in `apps/web/playwright.config.ts`:

```ts
const signInJourney =
  mailpit === undefined || mailpit === ''
    ? ['**/sign-in.spec.ts', '**/register.spec.ts', '**/join.spec.ts']
    : [];
```

- [ ] **Step 4: Run it against a local stack** (Task 10 Step 3's commands, with `E2E_MAILPIT_URL` from the stack's output):

```bash
E2E_BASE_URL=http://localhost:3000 E2E_MAILPIT_URL=http://localhost:8025 pnpm test:e2e
```

Expected: every E2E test passes, `join.spec.ts`'s two included.

- [ ] **Step 5: Hand to the lead.** Commit message: `test(e2e): joining a further tournament from the hub through its form, "Keisti turnyrą" and "Žaisti", at 1280 and 390 (#19)`.

---

### Task 17 (lead): The records

**Files:**
- Modify: `CLAUDE.md`
- Comment: #19

- [ ] **Step 1: `CLAUDE.md`**
  - In the bullet beginning "Stored points rows (`game_odds`, ...)", replace "and players' totals are derived only through `recalculateTournament`" with "and players' totals are derived only through `recalculateTournament`, whose sum of a rule set's rows (`sumTournamentTotals`) is the only place points are added up - a page reading stored rows totals them with it".
  - In the cookie list "(`__Host-sb_session`, `__Host-sb_signin`, `__Host-sb_signin_open`, `__Host-sb_register`, `__Host-sb_intended`)" add "`__Host-sb_flash`, `__Host-sb_return`", and after that sentence add: "A one-time message is a sealed `__Host-sb_flash` set by a route handler and forwarded once by `proxy.ts` (`server/flash.ts`); where sign-in returns is `__Host-sb_return`, kept only through `safeReturnPath` (`server/sign-in/return-path.ts`)."
  - After the "Joining a tournament is decided by `joinTournament`..." bullet, add: "- A tournament's hub data (status, start date, sport, description, public switch) is its `TournamentProfile`, beside `Tournament`, never in it; the hub's and the tournament pages' data come from `packages/db/src/hub/` (`loadHub`, `loadTournamentPage`, `loadRegistrationForm`, `findVisibleTournament`), which apply R-50 and R-55 through the rule set; sign-up asks `joinableOnSignUp` (R-50) for both its tournament (`tournamentToJoin`) and whether it is open at all (`registrationIsOpen`). Actions that leave a message or must not be prefetched are route handlers answering a real 303, not Server Actions."
- [ ] **Step 2: Note on #19**: the plan's design decisions 1 to 13, and that the rail's section matching (#16's note) moves to slices 12 and 13 (decision 10).
- [ ] **Step 3: Commit.** `docs: slice 5 - the hub's profile, data and actions, flash and return cookies, one sum of points in CLAUDE.md (#19)`.

---

### Task 18 (lead): Verify everything, review, push, watch CI

- [ ] **Step 1: The whole check, as CI runs it**

```bash
pnpm install --frozen-lockfile 2>&1 | tail -1
pnpm format:check 2>&1 | tail -1
pnpm lint && pnpm typecheck 2>&1 | grep -c "typecheck: Done"
pnpm build 2>&1 | grep -c "build: Done"
pnpm test:unit 2>&1 | grep -E "Test Files|Tests "
pnpm test:component 2>&1 | grep -E "Test Files|Tests "
pnpm test:db 2>&1 | grep -E "Test Files|Tests "
pnpm test:feature 2>&1 | grep -E "Test Files|Tests "
pnpm test:migrate 2>&1 | grep -E "Test Files|Tests "
LC_ALL=C.UTF-8 grep -rnP '[\x{1F300}-\x{1FAFF}\x{2600}-\x{27BF}\x{23F3}]' packages apps tools --include=*.ts --include=*.tsx | grep -v node_modules | wc -l
git diff <gate> -- pnpm-lock.yaml | wc -l
git status --short | wc -l
```

Expected: `Done`; `All matched files use Prettier code style!`; lint silent, the typecheck count as Task 0's; `3`; every suite passes, each with more tests than Task 0 recorded; `0` emoji typed into a source file; `0` lockfile lines (no new dependency); `0`.

- [ ] **Step 2: Review.** Run `mp-code-review` against `<gate>..HEAD` (Standards and Spec; the spec is `docs/superpowers/specs/2026-10-06-tournaments-hub-and-page-design.md`) and fix what it confirms, each fix its own commit ending with the trailer and `#19`, re-running Step 1 after the last. A new feature landed, so run `improve-codebase-architecture` over `packages/domain/src/hub/`, `packages/db/src/hub/`, `packages/db/src/tournament/profile.ts`, `apps/web/src/components/hub/`, `apps/web/src/components/tournament/` and the new routes, present its report to the owner, and act on no candidate unless the owner picks one. `security-reviewer` reviews every task marked **(sensitive)** against sportbet's Security rules and #16's notes - in particular: the flash cookie's seal, purpose, lifetime and one-time clearing, and that a header a client sends is dropped; `safeReturnPath` against every #16 example and the cookie re-checked on read; enter's GET (decision 7) and the closed hop; the same-origin check on every POST; R-50's 404 on the page, the form, enter and the submit alike; nothing personal in a log.

- [ ] **Step 3: Push, and watch the run to the end**

```bash
git push origin main
sleep 10
run=$(gh run list --branch main --limit 1 --json databaseId --jq '.[0].databaseId')
gh run watch "$run" --exit-status
```

Expected: `check` (unit, component, db, feature, reader), `image`, `e2e` (`tournaments.spec.ts`, `join.spec.ts` and the earlier journeys at both widths, against Mailpit), `staging` (migration 0010 on Neon, the seed's profiles, third and fourth tournaments and the game) and `smoke` (the hub's charity card and active group, and the E2E suite without the Mailpit journeys). A failing job: read it with `gh run view "$run" --log-failed`, fix the cause, commit, push again; never re-run a failed job to make it pass.

- [ ] **Step 4: Report on #19.** Comment with the green run's link, the test counts per suite, and the owner's answers at the plan review (P1, P3); tick each criterion that holds with its evidence (the named tests below). Leave #19 open for Tasks 19 and 20.

---

### Task 19 (lead, on the owner's PC): The reader and parity with the five new columns

- [ ] **Step 1: The run** - as #17's: the latest backup, the reader with `--parity` against `sportbet-app:3eb95e7`, on this PC. Expected: the drift check finds the five columns with the types Task 5 names; every tournament loads (no `bad-status`, no `bad-start-date`); `PARITY HOLDS`, the class counts as #17's.
- [ ] **Step 2: P2's count** - on the run's own MySQL copy, before it is removed (or with `--keep`), count only:

```sql
select count(*) from prediction_standings where final = 0;
select count(*) from (select ps.team_id from prediction_standings ps group by ps.team_id having max(coalesce(ps.final, 0)) = 0 and sum(ps.final = 0) > 0) t;
```

The second is the teams sportbet's medal count would list and the new app would not. Both `0`: P2 is closed on #19 with the counts. Otherwise the lead asks the owner P2, with the second count. Nothing of production but the counts leaves this PC (`CLAUDE.md`).
- [ ] **Step 3: Post on #19** the verdict, the counts per class, and P2's two counts.

---

### Task 20 (the owner, with the lead): The hub on staging

- [ ] **Step 1: The first instruction the lead sends (one step; wait for the answer)**

> The new front page is on staging: https://sportbet-new-staging.vercel.app. Please open it in a private window (signed out). You should see the charity card, then three groups - "Vykstantys turnyrai" with Euroleague 2026/27 (its next game, 4 March, and its stats), "Artėjantys turnyrai" with Euroleague 2027/28 ("Kaip tai veikia?"), "Pasibaigę turnyrai" with Euroleague 2025/26 - and no "Bandomasis turnyras" anywhere: that one is non-public. Tell me "works", or what looks wrong.

- [ ] **Step 2: The second instruction (after "works")**

> Now please sign in with your second test account (the plus-address). On Euroleague 2027/28's card press "Registruotis į turnyrą →", tick "Patvirtinu, kad noriu dalyvauti šiame turnyre." and press "Registruotis į turnyrą". You should land on the front page with "Užsiregistravote į turnyrą: Euroleague 2027/28", and the left menu showing Euroleague 2027/28. Then press "Keisti turnyrą", and on Euroleague 2026/27's card "Žaisti →": the menu should show Euroleague 2026/27. Tell me "works", or what happened instead.

- [ ] **Step 3: Close #19** once the owner says both work, quoting the answers and ticking "Done means". A problem the owner names becomes a fix on this plan's files, verified as in Task 18 Step 1, pushed, and the step again.

---

## Self-review against the spec

**Spec coverage** (each spec line, and the task and named tests that hold it):

| Spec | Task | Named tests |
|---|---|---|
| `tournaments` gains status, starts_on, sport, description, is_public; the reader reads them; parity fixtures carry them | 1, 4, 5, 19 | `profile: ...` (3 domain, 4 db), `columns: a tournament's status, start date, ...`, `reads a tournament's profile - ...`, `map: the tournament's profile is production's ...`, `map: a tournament whose status sportbet does not have is refused ...`, `loads each tournament's profile`; Task 19's run |
| Staging's seed fills every group and both public states | 4, 10 | `seeds the staging tournaments with their profiles and 2026/27 its one game ...`; `tournaments.spec.ts` |
| `hubGroup` under both sets; `RuleSet.hubFinishedFollowsR21` (R-55) | 2, 6 | `hubGroup (both sets)` (4), `hubGroup (sportbet)` (5), `hubGroup (ruled): R-55` (4), `rules: hubFinishedFollowsR21 differs ...`, db `hub (sportbet): an admin marking ... (ruled, R-55) ...` |
| `orderHub` | 2, 6 | `hub: active, then upcoming, then finished; by start date with none first; then by id`, db `hub: lists active before upcoming ...` |
| `canSeeTournament`; `RuleSet.nonPublicTournamentsHidden` (R-50) | 2, 6, 9, 15 | `hub (sportbet): every tournament is listed ...`, `hub (ruled, R-50): ...`, db `hub (ruled, R-50): a non-public tournament is left out ...`, `tournament page: ... (R-50) ...`, feature `is a 404 for a non-public tournament seen by a guest (R-50)`, `leaves out a non-public tournament ... shows it to an admin (R-50)`, `a non-public tournament is not found for a player not in it (R-50)` |
| `cardAction` with sportbet's labels | 2, 6, 8 | `hub: %s, signed in %s, member %s, registration open %s -> %s` (11), db `hub: a player in it plays; ...`, `card: %s posts to the tournament's enter`, `card: register is a plain link ...`, `card: view-results links ...` |
| `loadHub`: next 3 open games; guest top 5 (R-7, R-19, R-18, R-30), medal tally, participants, predictions; one query per kind | 3, 6 | `hub: a guest's active card lists the next three games ...`, `hub: a guest's top 5 ...`, `hub: a switched-off player is not listed ...`, `hub: the medal count ...`, `medals: ...` (3), `totals (...)` (3), `leaders: ...` |
| `loadTournamentPage` | 6, 9 | `tournament page: its profile, its players counted, and the button for the viewer`, `TournamentPageView` (6) |
| Medal tally's `final = 0` | 19 | P2's counts |
| R-50 (amended): sign-up never joins a non-public tournament, by R-27 or `?tournament=`; R-49's "open at all" counts only joinable tournaments | 6A | `joining (ruled, R-50): ...` (3), `joining (sportbet): ...`, db `R-50: ...` (2), feature `registration (R-50): a ?tournament= naming a non-public tournament joins R-27's public one instead` |
| R-56: the sport in Lithuanian | 8, 9 | `sport (R-56): %s is shown as %s` (6), `header: ...`, `TournamentPageView` |
| Hub: flash area, charity card (R-52, 7 500€, unlinked), empty state, groups, cards, widgets; "Visos vietos" text; R-51 times | 7, 8, 12 | `charity (R-52): ...`, `hub: ...` (5), `how it works: ... the second speaking of points, not goals`, `next games: each in Vilnius time ...`, `R-51: %s is %s` (5), `leaders: ... "Visos vietos" unlinked ...`, `flash: ...` |
| Crests by TeamLogo's rule | 7 | `crests: ...` (5), `medals: each team with its crest ...` |
| Tournament page header; finished shows only "← Turnyrai"; guest "Prisijungti ir dalyvauti" to `/login?tournament=` | 9, 10 | `TournamentPageView` (6), `an active tournament's page: ...`, `a finished card leads to its results page ...` |
| Not-found rendered on the server inside the shell (#16) | 9, 10 | `is a 404 for an unknown slug, rendered on the server inside the shell (#16)`, `an unknown tournament, and a non-public one, are a 404 page inside the shell` |
| `NavLink` prefix matching | - | Not done: sportbet marks "Turnyrai" on the hub alone (design decision 10); noted on #19 for slices 12 and 13 |
| Enter: guest to `/login`; member's `last_tournament_id` and `PLAYER_HOME`; non-member to the page; same-origin | 4, 14 | `account: writes the tournament the player used last, and clears it`, the five `enter` feature tests |
| Exit: clears `last_tournament_id`, to `/`; `SHELL_LINKS.tournamentExit` | 14 | `forgets the last-used tournament and goes to the hub`, `a guest just goes to the hub`, `lists a player link only once its page exists`, phone-header's `"Keisti turnyrą" since slice 5` |
| Form: guest to sign in and back (hardened path) | 13, 15 | `return path: ...` (15), `a guest sent to /login from the tournament form signs in and lands back on it`, `/login?intended=%s is not kept ...` (5), `a guest is sent to sign in, to come back to the form` |
| Form: member taken in (R-53), open or closed | 2, 6, 15 | `registration form (R-53): ...` (domain, db), feature `a player already in it is taken in (R-53) ...`, `a player already in it, after the close too, is taken in ...` |
| Form: closed - home with the message | 15 | `a closed tournament goes home with "Registracija ..." shown once`, `closed meanwhile: home with the closed message, nothing joined` |
| Form: sportbet's texts, game and team counts, R-54's closing time, Taisyklės, the checkbox, buttons | 15 | `RegisterFormView` (5) |
| Submit: unchecked message; `registerForTournament` (R-9); closed meanwhile; success sets last used and the message | 15, 16 | the submit feature tests (9), `join.spec.ts` |
| One-time messages: signed `__Host-sb_flash`, purpose-bound, short-lived, cleared on read | 12, 15 | `a one-time message: 60 seconds ...`, `flash: ...` (3), `... shown once` |
| Left for later: the league table (slice 8), leagues (slice 12) | - | `create-league` inert; participants from `tournament_players` |
| E2E at 390 and 1280 | 10, 16 | `tournaments.spec.ts` (5), `join.spec.ts` (2) |
| Done: the owner on staging | 20 | the owner's answers |

**Placeholder scan:** every code step shows its code. Three steps carry a stop-and-report branch instead of a guess: Task 6 (a recalculation writing rows for a player without a prediction), Task 9 (Next's not-found rendering), and Task 19 (P2's counts). Each names what to report, not what to invent.

**Type consistency:**
- `TournamentProfile` (Task 1) is what `saveTournamentProfile` and `loadTournamentProfiles` take and give (Task 4), what `MappedTournament.profile` holds (Task 5), and what `VisibleTournament`, `HubCard`, `TournamentPage` and `RegistrationForm` carry (Task 6).
- `HubGroup`, `CardAction` and `TournamentPageAction` (Task 2) are the field types of `HubCard` and `TournamentPage` (Task 6), and what `CardActionButton` and `PageAction` switch on (Tasks 8, 9).
- `MedalRow` (Task 3) is `GuestPanels.medals` (Task 6) and `MedalsPanel`'s prop (Task 8).
- `HubViewer` and `PlayerViewer` (Task 6) are what `hubViewer()` returns (Task 9) and what the routes build (Tasks 14, 15).
- `Flash` (`components/hub/flash.ts`, Task 8) is what `FlashAlert` draws, what `server/flash.ts` seals (Task 12), and `RegisterFormView`'s `error` (Task 15).
- `JoinCandidate.isPublic`, `SignUpWindow` and `joinableOnSignUp` (Task 6A) are what `loadJoinCandidates`, `isRegistrationOpen` and `registrationIsOpen` use.
- `isOpenForRegistrationWindowAt` (Task 2), `sumTournamentTotals` and `unicodeCiCompare` (Task 3) and `loadRegistrationWindowsById` and `setLastTournament` (Task 4) have the names their callers use.
- The test ids `hub-group-<group>`, `tournament-card`, `charity-card`, `how-it-works`, `upcoming-games`, `leaders`, `leader`, `medals`, `medal-row`, `medal-count`, `stats` and `tournament-register` are the same in Tasks 8, 9, 10, 15 and 16.
