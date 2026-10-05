# Accounts and Code Sign-In (Slice 4b) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** A player with an account signs in with an 8-digit code mailed to them, exactly as sportbet's code sign-in works (codes, throttles, answers, the dialog), stays signed in for 90 days from their last visit (R-44), sees the player shell built per request from their tournament (R-28) and signs out; the reader loads players' emails and names into its throwaway Postgres and prints none of them; on staging the owner signs in with a code Resend mails to them.

**Architecture:** The rules live in `packages/domain/src/account/` (email identity and folding, code and session rules, player settings) and `packages/domain/src/context/` (which tournament, sportbet's `NavVisibility`), all pure. `packages/db` gains the `account` area (`player_settings`, `login_codes`, `sessions`, `rate_limits`, `audit_logins`), players' `email`, `name` and `surname`, and an `email_fold()` SQL function behind a unique index that refuses a second spelling as sportbet's collation does. `apps/web` holds the use cases: one Server Action (`signInAction`, request / verify / cancel) for the dialog, a POST-only `/logout` route handler, a `/login` route handler, `requestContext()` read fresh per request, and Next 16's `proxy.ts`, which re-issues the session cookie at most once a day. Mail goes through a `Mailer` port with Mailpit, Resend and allow-listed Resend adapters, sent after the response with `after()`.

**Tech Stack:** Next.js 16.3.6 (App Router, Server Actions, `after()`, `proxy.ts`), React 19.3 (`useActionState`), Drizzle ORM 0.45.3 and drizzle-kit 0.31.11 on Postgres 18.6, Zod 4.6.5, `node:crypto` (`scrypt`, `randomInt`, `randomBytes`, HMAC-SHA256), Resend's and Mailpit's HTTP APIs through `fetch` (no SDK), Mailpit `axllent/mailpit:v1.31.4` (E2E), Vitest 5, Testing Library, jsdom 30, Playwright 1.63. **No new npm dependency.**

**Spec:** `docs/superpowers/specs/2026-10-05-accounts-and-code-sign-in-design.md` (approved by the owner). **Rulings:** R-27, R-28, R-44 (`docs/owner-rulings.md`). **Decisions:** 5, 8 as amended, 13. **Issue:** #16 (part of #1), and its comment: `leagueTab` is always `showsLeagueTab(leagues)`. **Reference:** sportbet (`D:\Projects\sportbet`) at `1ac955f`, the commit production runs; Laravel 12.69.2 (its `vendor/` matches that lock).

---

## Conventions for every task

- Work on `main` (trunk-based, `CLAUDE.md`). Each task names the teammate role that owns its folders (`docs/agent-team.md`): `backend-dev` edits `packages/domain`, `packages/db`, `tools/migrate`; `web-dev` edits `apps/web` (its feature and component tests included); `devops` edits `infra/`, `.github/workflows/`, `Dockerfile` and asks before any cloud change; `qa` edits E2E and smoke test files only; the lead edits the records and is the only one who talks to the owner. `qa` reviews every task against #16's criteria and sportbet's behaviour, `architect` against `CLAUDE.md` and the spec, `security-reviewer` every task marked **(sensitive)**; **only the lead commits**, once those have passed the task. A teammate's last step is "hand to the lead": the files changed, the commands run and their results, and the commit message given. Every commit message references `#16` and ends with the trailer lines the lead's session gives (`Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>` and the `Claude-Session:` line).
- Do not push until Task 21. Task 19 (staging's configuration) must be done before that push, or the staging deploy starts a server that refuses its environment.
- Shell snippets are Git Bash on Windows, run from `D:\Projects\sportbet_new`. The db, feature and reader suites need Docker running; the feature suite needs a fresh `pnpm build`. Only one `pnpm test:migrate` runs at a time on this PC (`docker ps --filter label=sportbet-migrate` lists nothing before it starts).
- Every verify step runs `pnpm format` first; the code below is written as Prettier leaves it, but a line Prettier rewraps is not a failure - `pnpm format:check` must pass after `pnpm format`.
- "sportbet" means the old app at `1ac955f`. Read any of its files with `git -C /d/Projects/sportbet show 1ac955f:<path>`. Every Lithuanian text below is sportbet's (its views and `lang/lt.json`), except the three marked **Q2**, which wait on the owner.
- Code rules (`CLAUDE.md`): `packages/domain` imports only `zod` and takes time and randomness as parameters; web reaches the database only through `@sportbet/db`; pages only load data and return one component; no `any`, no `as` other than `as const`, no `!`; a refusal is a `Result`, an impossible state throws; a skipped or focused test is a lint error; invisible characters in tests are escapes; every query result is parsed before it leaves `db`; a rule held in TypeScript and SQL is one `defineInvariant` / `defineRangeInvariant`; every CHECK is listed.
- Unit runs: `pnpm --filter @sportbet/domain exec vitest run <file>`; db runs: `pnpm --filter @sportbet/db exec vitest run <file>`; component runs: `pnpm --filter @sportbet/web exec vitest run --config vitest.component.config.ts <file>`; feature runs: `pnpm build && pnpm --filter @sportbet/web exec vitest run --config vitest.feature.config.ts <file>`; reader runs: `pnpm --filter @sportbet/migrate exec vitest run <file>`.
- **Nothing personal in any log or output.** No email address, name, surname, code, token or hash is ever passed to `console.*`, put in an error message, or printed by a test. Errors from Postgres can quote row values in their detail, so a catch logs the error's `name` only.

## File map

```
packages/domain/src/account/
  email.ts                emailInvariant, EmailAddress, normalizeEmail, emailAddress, storedEmailAddress, foldEmail   (+ test)
  person-name.ts          personNameInvariant                                                                       (+ test)
  player-settings.ts      localeInvariant, adminLevelInvariant, StoredPlayerSettings, isAdmin                      (+ test)
  login-code.ts           LOGIN_CODE_DIGITS, LOGIN_CODE_TTL_MINUTES, RESEND_COOLDOWN_SECONDS, LOGIN_CODE_PURPOSES,
                          loginCodeExpiresAt, codeStepCounters                                                      (+ test)
  session.ts              SESSION_LIFETIME_DAYS, sessionExpiresAt, utcDay, AUDIT_LOGIN_METHODS                     (+ test)
packages/domain/src/context/
  tournament-context.ts   tournamentContext, chooseTournament, NO_TOURNAMENT_NAV, NavVisibility                   (+ test)
packages/domain/src/player/player.ts          StoredPlayer gains email, name, surname
packages/domain/src/stored/sportbet-columns.ts users' email, name, surname; sportbetColumns.settings (+ test)
packages/domain/src/testing.ts                testPlayer
packages/domain/src/index.ts                  the new exports

packages/db/migrations/0006_email-fold.sql    email_fold(): NFD, combining marks dropped (custom, new)
packages/db/migrations/0007_accounts.sql      players' account columns, the account tables (generated, new)
packages/db/src/player/schema.ts              email, name, surname, the folded unique index, their CHECKs
packages/db/src/player/repository.ts          savePlayers / listPlayers with the account columns
packages/db/src/account/schema.ts             player_settings, login_codes, sessions, rate_limits, audit_logins (new)
packages/db/src/account/repository.ts         findAccountByEmail, savePlayerSettings, listPlayerSettings,
                                              listPlayerTournaments (new)
packages/db/src/account/login-codes.ts        issueLoginCode, findLiveLoginCode, claimLoginCode (new)
packages/db/src/account/sessions.ts           createSession, findSignedInPlayer, touchSession, deleteSession, recordLogin (new)
packages/db/src/account/rate-limits.ts        attemptRateLimit, pruneSignInState (new)
packages/db/src/tournament/repository.ts      + findTournamentById
packages/db/src/counts.ts                     + player_settings; SIGN_IN_TABLES
packages/db/src/schema.ts                     the account area, its CHECKs in INVARIANT_CHECKS
packages/db/src/seed/staging.ts, src/bin/seed-staging.ts   the staging account (STAGING_ACCOUNT_EMAIL)
packages/db/src/testing/index.ts              + migrateThrough
packages/db/src/index.ts                      the new exports
packages/db/test/account.test.ts, login-codes.test.ts, sessions.test.ts, rate-limits.test.ts (new)
packages/db/test/{schema,player,points,seed,golden,snapshot}.test.ts, test/world.ts   the account columns

tools/migrate/src/read-columns.ts (+ test)    users' email, name, surname; user_settings' admin, locale
tools/migrate/src/map.ts                      accounts, folded-email collisions, settings
tools/migrate/src/load.ts, src/reconcile.ts (+ test)   player_settings
tools/migrate/test/{map,reader,reader-failures}.test.ts   accounts, sentinels
tools/migrate/README.md                       the privacy guarantees

apps/web/src/env.ts                           AUTH_SECRET, MAIL_* (mailEnvSchema)
apps/web/src/proxy.ts                         re-issues the session cookie once a day (new)
apps/web/src/server/clock.ts                  now(), isoSecond() (new)
apps/web/src/server/mail/{mail,mailpit,resend,allow-list,create-mailer,login-code-mail}.ts   (+ tests, new)
apps/web/src/server/request/{same-origin,client-ip,form-input,next-path}.ts      (+ tests, new)
apps/web/src/server/session/{session-token,session-cookie}.ts                     (+ tests, new)
apps/web/src/server/sign-in/{code-hash,pending,throttle,texts}.ts (+ tests), {send-code,request-code,verify-code,dialog}.ts (new)
apps/web/src/server/sign-in/sign-in-action.ts the one Server Action ('use server', new)
apps/web/src/server/request-context.ts        signedInPlayer, requestContext (new)
apps/web/src/server/shell-for.ts              shellViewFor, shellPlayer (+ test, new)
apps/web/src/app/login/route.ts, app/logout/route.ts   (new)
apps/web/src/app/layout.tsx                   the view from requestContext, the dialog for a guest
apps/web/src/components/shell/
  sign-in-state.ts        SignInState, SignInStep, ShellSignIn, OPEN_SIGN_IN_COOKIE (new)
  sign-in-link.tsx        SignInLink (client)                    (+ test, new)
  sign-in-dialog.tsx      SignInDialog (client)                  (+ test, new)
  shell-paths.ts          + PLAYER_HOME, ShellLinks, SHELL_LINKS, SPORTBET_LINKS (+ test, new)
  icon.tsx                + arrow-left, box-arrow-in-right, envelope, x-lg (+ test)
  nav-styles.ts           + LOGIN_PILL, RAIL_LOGIN
  guest-rail.tsx, phone-header.tsx, rail-account.tsx, rail-tournament.tsx, player-rail.tsx, bottom-tabs.tsx, shell.tsx (+ tests)
apps/web/src/token-guard.test.ts              the login mail's inbox colours, in that file only
apps/web/src/env.test.ts                      mailEnvSchema (new)
apps/web/tests/support/app.ts                 + appEnv
apps/web/tests/support/{browser,mail-catcher,mailpit,accounts}.ts   a browser without JavaScript, the Mailpit stand-in (new)
apps/web/tests/feature/{global-setup.ts,health-down.test.ts,startup.test.ts}   the new settings
apps/web/tests/feature/{sign-in,sign-in-guards,session}.test.ts     (new)
apps/web/e2e/sign-in.spec.ts (new), apps/web/playwright.config.ts, apps/web/smoke/smoke.test.ts
infra/compose/e2e.yml, infra/compose/staging.yml, infra/ci/e2e-stack.sh, .github/workflows/ci.yml
CLAUDE.md, README.md                          the records
```

## Design decisions this plan makes

None is a game rule; each is how the spec is held. Where one departs from the spec's letter, the reason is given and it is listed again in the report to the owner.

1. **Sign-out is a POST-only route handler at `/logout`, not a Server Action.** It keeps sportbet's URL and method (the shell's three hidden forms already post there, `shell-paths.ts`), gives a GET the 405 #16 asks for (Next answers 405 for a method a route handler does not export), and checks the origin itself (`isSameOrigin`: `Origin`, else `Sec-Fetch-Site`). Request, verify and cancel are one Server Action, `signInAction`, dispatching on a hidden `intent`: the dialog has one `useActionState`, so only the last answer is shown, as sportbet's flashed errors were.
2. **Every Server Action checks the origin too.** Next refuses a mismatched `Origin` but lets a request with none through; `isSameOrigin` refuses that, unless `Sec-Fetch-Site` says `same-origin` (#16).
3. **The code is minted, hashed and stored after the response**, inside the same `after()` that mails it, and only for an existing account. The answer, its cookie and its timing are then the same for an unknown address; sportbet hashes before it answers for a known one only.
4. **scrypt from `node:crypto`** (N 2^14, r 8, p 1, about 25 ms) is the slow hash. The dummy hash is a real scrypt hash at the same cost, and the cost is read from each stored hash, so the two branches of verify cannot drift apart (sportbet's #37 item 1).
5. **The session cookie is `__Host-sb_session=<token>.<UTC day>`.** The token is 32 random bytes; the database holds its SHA-256 only. `proxy.ts` compares the day with today: on a new day it extends the session in the database (`expires_at` = now + 90 days) and re-issues the cookie (Max-Age 90 days); on the same day it touches nothing. A cookie whose session is gone is cleared on its next new day. A `__Host-` cookie is always cleared by setting it empty with Max-Age 0 and its own flags, never with `cookies().delete()` (which drops `Secure`, and a browser then ignores it).
6. **The pending sign-in is `__Host-sb_signin`**, HttpOnly, an HMAC-SHA256-signed JSON `{ email, sentAt, next }` keyed by `AUTH_SECRET`, Max-Age 2 hours (sportbet's session lifetime, which held `login_code_email`). It holds the address the visitor typed, never anything of the account.
7. **`/login` opens the dialog through a 60-second cookie, `__Host-sb_signin_open`**, holding where to go after sign-in (`/` or `/tournament/<slug>` from `?tournament=`). The layout reads it and draws the dialog open; the dialog clears it. The spec's "keeps a `?tournament=` as the place to go after sign-in" is held; sportbet itself keeps that parameter only for registration (`intended_tournament`, 4c).
8. **The dialog is sportbet's `#loginModal`, rebuilt as a `role="dialog"` panel** (not `<dialog>`: jsdom has no `showModal`), on sportbet's `sb-auth-*` rules in token utilities. 4b shows its sign-in side only: no tabs (registration is 4c) and no "Prisijungti su Google" (4c). "Atgal" leaves the dialog open on the email step, where sportbet's reload closed it.
9. **Feature tests talk to an in-process stand-in for Mailpit's HTTP API** (`tests/support/mail-catcher.ts`: send, search, message, delete), since no test starts a container except through `startTestDatabase`. The E2E suite runs the real Mailpit; both read codes through the same `tests/support/mailpit.ts`.
10. **Feature tests submit the dialog's forms as a browser without JavaScript would**: they read the form's fields from the served HTML, React's hidden `$ACTION_*` inputs included, and post them (`tests/support/browser.ts`). Next runs the action and renders the page with its answer, so each test asserts on what a visitor sees.
11. **`player_settings` carries `locale`, `admin_level` and `last_tournament_id`.** `receive_reminders` arrives with the reminders (slice 16), `result_amount` with the results page; `user_settings.time_zone` is unused since sportbet `6e04ac0` and is left behind (**Q5**).
12. **Throttle keys are stored as their SHA-256**, so `rate_limits` holds no address. Login codes older than a day, rate-limit windows older than a day and expired sessions are deleted after every code request.
13. **The email invariant refuses ASCII capitals only** (the two regex dialects share no wider class); `normalizeEmail` lowers every letter on every write. A production address that is not in the stored form is refused and counted by the reader, as the spec says.
14. **Two small display fixes, no rule:** the rail's initials take the first letter of the name and surname (sportbet's `strtoupper(substr(..., 0, 1))` takes the first byte, so "Žilvinas" draws a broken character); the code mail gets a text part beside sportbet's HTML.
15. **The shell links only to pages that exist:** profile, admin and "Keisti turnyrą" come through `ShellLinks`, all `null` in 4b; the league row is not drawn while `leagues` is `null` (slice 12); the bottom tabs are not drawn when there is no tab (a 4b player has none).

## Owner questions (Task 0 asks them; the tasks named wait on the answers)

| | Question | What sportbet does | The plan's proposal | Waits |
|---|---|---|---|---|
| **Q1** | A player in two or more tournaments whose last-used tournament (R-28) is not one of them - every migrated player in a second tournament, until they open one: which tournament does the shell show? | `SessionController::activeMembership()` takes `->first()` of their active league memberships with no `ORDER BY`: whichever row MySQL returns, in practice the membership joined first. The code leaves the case open. | The newest tournament (the highest id). Unreachable with today's production data (one Euroleague tournament); from slice 5 the hub writes the last-used one. | Task 4 |
| **Q2** | The Lithuanian text for a blank address, an address that is not one, and a blank code. | Laravel's English validation messages (sportbet has no `lang/lt/validation.php`): "The email field is required.", "The email field must be a valid email address.", "The code field is required." | "Įveskite el. pašto adresą.", "Įveskite teisingą el. pašto adresą.", "Įveskite kodą." | Task 12 |
| **Q3** | Does "Atsijungti" end the sign-in on this browser only, or on every device? | Laravel's `logout()` changes the account's remember token, so every other device is signed out once its 2-hour session lapses. | This browser only (each device has its own session, R-44). | Task 15 |
| **Q4** | Which address do code mails come from (sportbet's `MAIL_FROM_ADDRESS`, on the domain verified in its Resend account)? | Set in production's `.env` only. | `noreply@sportbet.lt`, if that is the verified domain. | Task 19 |
| **Q5** | `user_settings.time_zone` has been unused since `6e04ac0` (the DST fix): may it be left behind (decision 6)? | Written by no form, read by nothing. | Leave it behind. | Task 20 |

---

### Task 0 (lead): The gate, and the owner's questions

**Files:** none.

- [ ] **Step 1: A clean `main` with the spec on it**

```bash
git status --short | wc -l
git log --oneline -1 -- docs/superpowers/specs/2026-10-05-accounts-and-code-sign-in-design.md
grep -n "R-44" docs/owner-rulings.md | head -1
git -C /d/Projects/sportbet cat-file -t 1ac955f
git rev-parse --short HEAD
```

Expected: `0`; `56c91a1 docs: slice 4b spec - accounts, code sign-in, request context; R-44 and staging mail (#16)`; one line; `commit`; the gate's commit (this plan committed on top of `56c91a1`) - note it, Task 21 reviews from it.

- [ ] **Step 2: Record the baseline**

```bash
pnpm install --frozen-lockfile 2>&1 | tail -1
pnpm build 2>&1 | grep -c "build: Done"
pnpm test:unit 2>&1 | grep -E "Test Files|Tests "
pnpm test:component 2>&1 | grep -E "Test Files|Tests "
pnpm test:db 2>&1 | grep -E "Test Files|Tests "
pnpm test:feature 2>&1 | grep -E "Test Files|Tests "
```

Expected: `Done`; `3`; every suite passes - note each count; Task 21 compares against them.

- [ ] **Step 3: Ask the owner Q1 to Q5** (the table above), one message per question, waiting for each answer (the owner's preference: one step at a time). Record each answer as a comment on #16. Q1 must be answered before Task 4, Q2 before Task 12, Q3 before Task 15, Q4 before Task 19, Q5 before Task 20. An answer other than the proposal changes only the lines each task names.

---

### Task 1 (backend-dev): Email identity and names

**Files:**
- Create: `packages/domain/src/account/email.ts`, `packages/domain/src/account/person-name.ts`
- Test: `packages/domain/src/account/email.test.ts`, `packages/domain/src/account/person-name.test.ts`

sportbet's `EmailIdentity` (#41, #42): every address is trimmed and lowered on every write and lookup, and matched exactly; nothing folds accents in a lookup. The folded form exists only as the key of a unique index (Task 5).

- [ ] **Step 1: Write the failing tests**

`packages/domain/src/account/email.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import { refuse } from '../shared/result';
import { unwrap } from '../testing';
import {
  emailAddress,
  foldEmail,
  normalizeEmail,
  storedEmailAddress,
} from './email';

// sportbet's EmailIdentityTest and #41: an address is trimmed (PHP's
// trim) and lowered on every write and lookup, and never folded there.
describe('normalizeEmail', () => {
  it.each([
    ['already canonical', 'ada@example.com', 'ada@example.com'],
    ['upper case is lowered', 'Ada@Example.COM', 'ada@example.com'],
    ['surrounding spaces are trimmed', '  ada@example.com  ', 'ada@example.com'],
    ['tabs and newlines are trimmed', '\tada@example.com\n', 'ada@example.com'],
    [
      'Lithuanian letters are lowered without losing their accents',
      'Žukauskas@Example.LT',
      'žukauskas@example.lt',
    ],
  ])('%s', (_, typed, stored) => {
    expect(normalizeEmail(typed)).toBe(stored);
  });

  it('trims only what PHP trim() trims: a no-break space stays', () => {
    expect(normalizeEmail(' ada@example.com')).toBe(
      ' ada@example.com',
    );
  });
});

describe('emailAddress', () => {
  it('stores a typed address in its normalized form', () => {
    expect(unwrap(emailAddress('  Jonas@Example.LT '))).toBe(
      'jonas@example.lt',
    );
  });

  it('refuses what is no address once normalized', () => {
    expect(emailAddress('   ')).toEqual(refuse('not-an-email'));
    expect(emailAddress('jonas')).toEqual(refuse('not-an-email'));
  });
});

describe('storedEmailAddress', () => {
  it('reads a stored address as it is', () => {
    expect(unwrap(storedEmailAddress('žukauskas@example.lt'))).toBe(
      'žukauskas@example.lt',
    );
  });

  it('refuses a stored address that is not in the stored form, and never fixes it', () => {
    expect(storedEmailAddress('Jonas@example.lt')).toEqual(
      refuse('not-an-email'),
    );
    expect(storedEmailAddress(' jonas@example.lt')).toEqual(
      refuse('not-an-email'),
    );
  });
});

describe('foldEmail', () => {
  it("drops the accents of Lithuanian letters, as sportbet's utf8mb4_unicode_ci ignores them", () => {
    expect(foldEmail('ąčęėįšųūž@example.lt')).toBe('aceeisuuz@example.lt');
    expect(foldEmail('žukauskas@example.lt')).toBe(
      foldEmail('zukauskas@example.lt'),
    );
  });

  it('folds a decomposed letter as it folds the precomposed one', () => {
    expect(foldEmail('žukauskas@example.lt')).toBe('zukauskas@example.lt');
  });

  it('keeps a letter that does not decompose', () => {
    expect(foldEmail('straße@example.de')).toBe('straße@example.de');
  });
});
```

`packages/domain/src/account/person-name.test.ts`:

```ts
import { expect, it } from 'vitest';
import { personNameInvariant } from './person-name';

it('takes an empty name, as a Google sign-up stores a missing surname, and refuses one past 255 characters', () => {
  expect(personNameInvariant.schema.safeParse('').success).toBe(true);
  expect(personNameInvariant.schema.safeParse('Žilvinas').success).toBe(true);
  expect(personNameInvariant.schema.safeParse('a'.repeat(256)).success).toBe(
    false,
  );
});
```

- [ ] **Step 2: Run them to see them fail**

Run: `pnpm --filter @sportbet/domain exec vitest run src/account`
Expected: FAIL - `Failed to resolve import "./email"` and `"./person-name"`.

- [ ] **Step 3: Write `packages/domain/src/account/email.ts`**

```ts
import { z } from 'zod';
import { defineInvariant } from '../invariant/invariant';
import { ok, refuse, type Result } from '../shared/result';

const EMAIL_MAX_LENGTH = 255;

/**
 * An email address as an account stores it (sportbet's EmailIdentity,
 * #41, #42): trimmed and lower case, at most 255 characters (`users.email`
 * is varchar(255)), one @ with something on each side and no whitespace.
 * Only the ASCII capitals are refused here - the two regex dialects share
 * no wider class - and normalizeEmail lowers every letter on every write.
 * It is not RFC 5322: sportbet's `email` rule also takes a quoted local
 * part with a space or an @, which this refuses; the reader counts any
 * such production row and never fixes it (spec 4b).
 */
export const emailInvariant = defineInvariant({
  name: 'email address',
  pattern: '^[^\\t\\n\\v\\f\\r @A-Z]+@[^\\t\\n\\v\\f\\r @A-Z]+$',
  maxLength: EMAIL_MAX_LENGTH,
  accepts: [
    { label: 'a realistic address', value: 'jonas@example.lt' },
    { label: 'a Lithuanian letter', value: 'žukauskas@example.lt' },
    { label: 'a plus and dots', value: 'jonas.k+bet@gmail.com' },
    {
      label: 'a domain without a dot, as sportbet accepts',
      value: 'jonas@localhost',
    },
    {
      label: 'the maximum length',
      value: `${'a'.repeat(EMAIL_MAX_LENGTH - 12)}@example.com`,
    },
  ],
  refuses: [
    { label: 'empty', value: '' },
    { label: 'no @', value: 'jonas.example.lt' },
    { label: 'nothing before the @', value: '@example.lt' },
    { label: 'nothing after the @', value: 'jonas@' },
    { label: 'two @', value: 'jonas@example@lt' },
    { label: 'a capital letter', value: 'Jonas@example.lt' },
    { label: 'a leading space', value: ' jonas@example.lt' },
    { label: 'a trailing tab', value: 'jonas@example.lt\t' },
    { label: 'a space inside', value: 'jo nas@example.lt' },
    {
      label: 'too long',
      value: `${'a'.repeat(EMAIL_MAX_LENGTH - 11)}@example.com`,
    },
  ],
});

const emailSchema = emailInvariant.schema.brand<'EmailAddress'>();

/** An address in its stored form; only emailAddress and storedEmailAddress make one. */
export type EmailAddress = z.infer<typeof emailSchema>;

/** What PHP's trim() strips: space, tab, newline, carriage return, NUL and vertical tab. */
const PHP_TRIM = ' \t\n\r\0\u000b';

function phpTrim(value: string): string {
  let start = 0;
  let end = value.length;
  while (start < end && PHP_TRIM.includes(value.charAt(start))) start += 1;
  while (end > start && PHP_TRIM.includes(value.charAt(end - 1))) end -= 1;
  return value.slice(start, end);
}

/**
 * sportbet's EmailIdentity::normalize: PHP's trim(), then lower case
 * (Str::lower). Applied to every address that is typed, before it is
 * stored or looked up. Nothing folds accents: 'Žukauskas@' becomes
 * 'žukauskas@', never 'zukauskas@'.
 */
export function normalizeEmail(typed: string): string {
  return phpTrim(typed).toLowerCase();
}

/** A typed address in its stored form, or a refusal when that is no address. */
export function emailAddress(
  typed: string,
): Result<EmailAddress, 'not-an-email'> {
  return storedEmailAddress(normalizeEmail(typed));
}

/**
 * A stored address, read as it is: never normalized, so a row that is not
 * in the stored form is refused rather than silently changed (spec 4b).
 */
export function storedEmailAddress(
  value: string,
): Result<EmailAddress, 'not-an-email'> {
  const parsed = emailSchema.safeParse(value);
  return parsed.success ? ok(parsed.data) : refuse('not-an-email');
}

/** The combining marks NFD splits an accented letter into. */
const COMBINING_MARKS = /[̀-ͯ]/gu;

/**
 * The address with its accents dropped: NFD, then every combining mark
 * (U+0300 to U+036F) removed, so 'žukauskas@' and 'zukauskas@' fold
 * alike. The key of the unique index that refuses a second spelling, as
 * sportbet's utf8mb4_unicode_ci index does; never a lookup key - sign-in
 * matches the exact address (#41). The database's email_fold() is the
 * same function, proved equal on every BMP character
 * (packages/db/test/account.test.ts).
 */
export function foldEmail(email: string): string {
  return email.normalize('NFD').replace(COMBINING_MARKS, '');
}
```

- [ ] **Step 4: Write `packages/domain/src/account/person-name.ts`**

```ts
import { defineInvariant } from '../invariant/invariant';

const NAME_MAX_LENGTH = 255;

/**
 * A player's name or surname: at most 255 characters, possibly empty.
 * sportbet asks for a name on its form, but stores an empty one when
 * Google gives none, and an empty surname for every Google sign-up and
 * every form that leaves it blank (GoogleAuthController,
 * RegisteredUserController), so only the length is held.
 */
export const personNameInvariant = defineInvariant({
  name: 'person name',
  pattern: '^',
  maxLength: NAME_MAX_LENGTH,
  accepts: [
    { label: 'a first name', value: 'Jonas' },
    { label: 'a Lithuanian name', value: 'Žilvinas' },
    { label: 'empty, as a Google sign-up stores a missing surname', value: '' },
    { label: 'the maximum length', value: 'a'.repeat(NAME_MAX_LENGTH) },
  ],
  refuses: [{ label: 'too long', value: 'a'.repeat(NAME_MAX_LENGTH + 1) }],
});
```

- [ ] **Step 5: Run them to see them pass**

Run: `pnpm --filter @sportbet/domain exec vitest run src/account`
Expected: PASS, 2 files, 14 tests (`defineInvariant` also checks each invariant's own examples when the module loads, so a wrong example fails the import).

- [ ] **Step 6: Hand to the lead.** Files above; `pnpm format && pnpm lint && pnpm --filter @sportbet/domain typecheck` clean. Commit message: `feat(domain): email identity - normalized, exact, folded only for uniqueness (#16)`.

---

### Task 2 (backend-dev): Codes, sessions and settings

**Files:**
- Create: `packages/domain/src/account/login-code.ts`, `packages/domain/src/account/session.ts`, `packages/domain/src/account/player-settings.ts`
- Test: `packages/domain/src/account/login-code.test.ts`, `packages/domain/src/account/session.test.ts`, `packages/domain/src/account/player-settings.test.ts`

- [ ] **Step 1: Write the failing tests**

`packages/domain/src/account/login-code.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import { secondsAfter } from '../shared/instant';
import { at } from '../testing';
import {
  codeStepCounters,
  LOGIN_CODE_DIGITS,
  LOGIN_CODE_PURPOSES,
  LOGIN_CODE_TTL_MINUTES,
  loginCodeExpiresAt,
  RESEND_COOLDOWN_SECONDS,
} from './login-code';

const SENT = at('2026-10-05T12:00:00Z');

describe('a login code', () => {
  it('is eight digits and lives five minutes (OneTimeCodeService, #36, #77)', () => {
    expect(LOGIN_CODE_DIGITS).toBe(8);
    expect(LOGIN_CODE_TTL_MINUTES).toBe(5);
    expect(loginCodeExpiresAt(SENT)).toBe(at('2026-10-05T12:05:00Z'));
  });

  it("can be resent well before it dies (LoginCodeStepTest, #76)", () => {
    expect(RESEND_COOLDOWN_SECONDS).toBe(20);
    expect(RESEND_COOLDOWN_SECONDS * 2).toBeLessThan(
      LOGIN_CODE_TTL_MINUTES * 60,
    );
  });

  it('has one purpose per flow, and 4b issues only login (#43)', () => {
    expect(LOGIN_CODE_PURPOSES).toEqual([
      'login',
      'registration',
      'account_deletion',
      'email_change',
    ]);
  });
});

// sportbet's AuthCodeStepCountersTest.
describe('codeStepCounters', () => {
  it('just sent: the full cooldown and lifetime remain', () => {
    expect(codeStepCounters(SENT, SENT)).toEqual({
      resendIn: 20,
      expiresIn: 300,
    });
  });

  it('partway through: both count down', () => {
    expect(codeStepCounters(SENT, secondsAfter(SENT, 12))).toEqual({
      resendIn: 8,
      expiresIn: 288,
    });
  });

  it('past the cooldown: a resend is allowed while the code still lives', () => {
    expect(codeStepCounters(SENT, secondsAfter(SENT, 25))).toEqual({
      resendIn: 0,
      expiresIn: 275,
    });
  });

  it('past the lifetime: both are zero, never negative', () => {
    expect(codeStepCounters(SENT, secondsAfter(SENT, 301))).toEqual({
      resendIn: 0,
      expiresIn: 0,
    });
  });

  it('a send time ahead of the clock counts as just sent', () => {
    expect(codeStepCounters(secondsAfter(SENT, 5), SENT)).toEqual({
      resendIn: 20,
      expiresIn: 300,
    });
  });
});
```

`packages/domain/src/account/session.test.ts`:

```ts
import { expect, it } from 'vitest';
import { at } from '../testing';
import {
  AUDIT_LOGIN_METHODS,
  SESSION_LIFETIME_DAYS,
  sessionExpiresAt,
  utcDay,
} from './session';

it('R-44: a sign-in lasts 90 days from the last visit', () => {
  expect(SESSION_LIFETIME_DAYS).toBe(90);
  expect(sessionExpiresAt(at('2026-10-05T12:00:00Z'))).toBe(
    at('2027-01-03T12:00:00Z'),
  );
});

it("names the UTC day an instant falls on, at either end of it", () => {
  expect(utcDay(at('2026-10-05T00:00:00Z'))).toBe('2026-10-05');
  expect(utcDay(at('2026-10-05T23:59:59Z'))).toBe('2026-10-05');
});

it('records a code sign-in as email_code, as sportbet does', () => {
  expect(AUDIT_LOGIN_METHODS).toEqual(['email_code']);
});
```

`packages/domain/src/account/player-settings.test.ts`:

```ts
import { expect, it } from 'vitest';
import { adminLevelInvariant, isAdmin, localeInvariant } from './player-settings';

it("carries sportbet's two locales and its admin levels as they are", () => {
  expect(localeInvariant.schema.safeParse('lt').success).toBe(true);
  expect(localeInvariant.schema.safeParse('en').success).toBe(true);
  expect(localeInvariant.schema.safeParse('de').success).toBe(false);
  for (const level of [0, 1, 5, 8, 9]) {
    expect(adminLevelInvariant.schema.safeParse(level).success).toBe(true);
  }
  expect(adminLevelInvariant.schema.safeParse(-1).success).toBe(false);
});

it("is an admin from level 1, as sportbet's admin link and AdminMiddleware say", () => {
  expect(isAdmin(0)).toBe(false);
  expect(isAdmin(1)).toBe(true);
  expect(isAdmin(9)).toBe(true);
});
```

- [ ] **Step 2: Run them to see them fail**

Run: `pnpm --filter @sportbet/domain exec vitest run src/account`
Expected: FAIL - `Failed to resolve import "./login-code"`, `"./session"`, `"./player-settings"`.

- [ ] **Step 3: Write `packages/domain/src/account/login-code.ts`**

```ts
import { secondsAfter, type Instant } from '../shared/instant';

/** OneTimeCodeService::DIGITS (#36 item 4): eight digits, a keyspace of 1e8. */
export const LOGIN_CODE_DIGITS = 8;

/** OneTimeCodeService::TTL_MINUTES (#77): a code lives five minutes. */
export const LOGIN_CODE_TTL_MINUTES = 5;

/** EmailCodeLoginController::RESEND_COOLDOWN_SECONDS (#75, #76): well under the code's life. */
export const RESEND_COOLDOWN_SECONDS = 20;

/**
 * LoginCode's purposes. Every lookup is scoped by one (#43), so a code
 * minted for one flow never redeems another. 4b issues `login` only;
 * `registration` is 4c's, `account_deletion` and `email_change` slice
 * 17's (R-24).
 */
export const LOGIN_CODE_PURPOSES = [
  'login',
  'registration',
  'account_deletion',
  'email_change',
] as const;

export type LoginCodePurpose = (typeof LOGIN_CODE_PURPOSES)[number];

/** When a code issued at `issuedAt` stops being redeemable. */
export function loginCodeExpiresAt(issuedAt: Instant): Instant {
  return secondsAfter(issuedAt, LOGIN_CODE_TTL_MINUTES * 60);
}

export interface CodeStepCounters {
  /** Seconds until "siųskite iš naujo" unlocks. */
  readonly resendIn: number;
  /** Seconds the code still lives. */
  readonly expiresIn: number;
}

/**
 * AuthCodeStep::counters: the seconds left, at `now`, of the resend
 * cooldown and of the code's life since it was sent, never negative.
 */
export function codeStepCounters(
  sentAt: Instant,
  now: Instant,
): CodeStepCounters {
  const elapsed = Math.max(0, Math.floor((now - sentAt) / 1000));
  return {
    resendIn: Math.max(0, RESEND_COOLDOWN_SECONDS - elapsed),
    expiresIn: Math.max(0, LOGIN_CODE_TTL_MINUTES * 60 - elapsed),
  };
}
```

- [ ] **Step 4: Write `packages/domain/src/account/session.ts`**

```ts
import { secondsAfter, type Instant } from '../shared/instant';

/** R-44: a sign-in lasts 90 days from the last visit, and every visit extends it. */
export const SESSION_LIFETIME_DAYS = 90;

const DAY_SECONDS = 86_400;

/** When a session last seen at `lastSeen` ends. */
export function sessionExpiresAt(lastSeen: Instant): Instant {
  return secondsAfter(lastSeen, SESSION_LIFETIME_DAYS * DAY_SECONDS);
}

/**
 * The UTC calendar day of an instant, `YYYY-MM-DD`. A session is extended
 * at most once a day: its cookie carries the day it was last re-issued.
 */
export function utcDay(instant: Instant): string {
  return new Date(instant).toISOString().slice(0, 10);
}

/**
 * How a player came in, as audit_logins records it (sportbet's
 * `login_method`). 4b writes `email_code`; 4c adds Google's and
 * registration's.
 */
export const AUDIT_LOGIN_METHODS = ['email_code'] as const;

export type AuditLoginMethod = (typeof AUDIT_LOGIN_METHODS)[number];
```

- [ ] **Step 5: Write `packages/domain/src/account/player-settings.ts`**

```ts
import { defineInvariant } from '../invariant/invariant';
import { defineRangeInvariant } from '../invariant/range-invariant';
import type { PlayerId } from '../shared/ids';

/**
 * sportbet's two locales (LocaleController: `in:lt,en`). Carried with each
 * player and unused: the app is Lithuanian only (decision 13).
 */
export const localeInvariant = defineInvariant({
  name: 'locale',
  pattern: '^(lt|en)$',
  accepts: [
    { label: 'Lithuanian', value: 'lt' },
    { label: 'English', value: 'en' },
  ],
  refuses: [
    { label: 'empty', value: '' },
    { label: 'another language', value: 'de' },
    { label: 'a region', value: 'lt-LT' },
  ],
});

const ADMIN_LEVEL_MAX = 127;

/**
 * sportbet's `user_settings.admin`, carried as it is: a signed tinyint its
 * admin form fills with 0, 1, 5, 8 or 9 (UserController::updateUser). The
 * CHECK holds the column's non-negative range, so no stored level is
 * refused; R-26's tiers are mapped from it by the admin slices (13, 14).
 */
export const adminLevelInvariant = defineRangeInvariant({
  name: 'admin level',
  min: 0,
  max: ADMIN_LEVEL_MAX,
  accepts: [
    { label: 'a player', value: 0 },
    { label: "sportbet's top level", value: 9 },
    { label: 'the tinyint maximum', value: ADMIN_LEVEL_MAX },
  ],
  refuses: [
    { label: 'negative', value: -1 },
    { label: 'past the tinyint', value: ADMIN_LEVEL_MAX + 1 },
  ],
});

/**
 * A player's settings (sportbet's `user_settings`, the columns 4b reads)
 * and R-28's last-used tournament, which sportbet kept in the session.
 */
export interface StoredPlayerSettings {
  readonly player: PlayerId;
  readonly locale: string;
  readonly adminLevel: number;
  /** R-28: the tournament the player used last, by id; null until they use one. */
  readonly lastTournament: number | null;
}

/** sportbet's admin link (`session('admin') >= 1`) and AdminMiddleware (`admin > 0`). */
export function isAdmin(adminLevel: number): boolean {
  return adminLevel >= 1;
}
```

- [ ] **Step 6: Run them to see them pass**

Run: `pnpm --filter @sportbet/domain exec vitest run src/account`
Expected: PASS, 5 files, 27 tests.

- [ ] **Step 7: Hand to the lead.** Files above; `pnpm format && pnpm lint && pnpm --filter @sportbet/domain typecheck` clean. Commit message: `feat(domain): login code, session and player settings rules (#16)`.

---

### Task 3 (backend-dev): An account on the stored player, and sportbet's user columns

**Files:**
- Modify: `packages/domain/src/player/player.ts`, `packages/domain/src/stored/sportbet-columns.ts`, `packages/domain/src/testing.ts`, `packages/domain/src/index.ts`
- Test: `packages/domain/src/stored/sportbet-columns.test.ts`

A player now carries what sign-in needs: the address, and the name and surname the rail shows ("Jonas P."). The reader maps sportbet's `users` and `user_settings` through `sportbetColumns`, which refuses a row it cannot store.

- [ ] **Step 1: Write the failing tests**

In `packages/domain/src/stored/sportbet-columns.test.ts`, replace the whole `describe('sportbet columns: users', ...)` block with:

```ts
describe('sportbet columns: users', () => {
  const row = {
    id: 7,
    username: 'ada',
    name: 'Ada',
    surname: 'Žukauskaitė',
    email: 'žukauskaitė@example.lt',
  };

  it('stored rows: a user reads back as its id, as text, its username, its address as stored, its name and surname', () => {
    expect(unwrap(sportbetColumns.player(row))).toEqual({
      id: player('7'),
      username: 'ada',
      email: 'žukauskaitė@example.lt',
      name: 'Ada',
      surname: 'Žukauskaitė',
    });
  });

  it('stored rows: an empty name and surname, as a Google sign-up stores them, are kept', () => {
    expect(
      unwrap(sportbetColumns.player({ ...row, name: '', surname: '' })),
    ).toMatchObject({ name: '', surname: '' });
  });

  it.each([
    ['blank', '  '],
    ['longer than 255 characters', 'a'.repeat(256)],
  ])('stored rows: a username that is %s is refused', (_, username) => {
    expect(sportbetColumns.player({ ...row, username })).toEqual(
      refuse('bad-username'),
    );
  });

  it.each([
    ['not lower case', 'Ada@example.lt'],
    ['not trimmed', 'ada@example.lt '],
    ['no address', 'ada'],
  ])('stored rows: an address that is %s is refused, never fixed', (_, email) => {
    expect(sportbetColumns.player({ ...row, email })).toEqual(
      refuse('bad-email'),
    );
  });

  it('stored rows: a name or surname past 255 characters is refused', () => {
    expect(
      sportbetColumns.player({ ...row, name: 'a'.repeat(256) }),
    ).toEqual(refuse('bad-name'));
    expect(
      sportbetColumns.player({ ...row, surname: 'a'.repeat(256) }),
    ).toEqual(refuse('bad-name'));
  });

  it.each([
    ['0', 0],
    ['negative', -7],
    ['a fraction', 7.5],
  ])('stored rows: a user whose id is %s is refused as a bad id', (_, id) => {
    expect(sportbetColumns.player({ ...row, id })).toEqual(refuse('bad-id'));
  });
});

describe('sportbet columns: user_settings', () => {
  it("stored rows: a user's settings read back as their admin level and locale, with no last tournament (sportbet kept it in the session)", () => {
    expect(
      unwrap(
        sportbetColumns.settings({ player: player('7'), admin: 9, locale: 'en' }),
      ),
    ).toEqual({
      player: player('7'),
      locale: 'en',
      adminLevel: 9,
      lastTournament: null,
    });
  });

  it('stored rows: a negative admin level or an unknown locale is refused', () => {
    expect(
      sportbetColumns.settings({ player: player('7'), admin: -1, locale: 'lt' }),
    ).toEqual(refuse('bad-admin-level'));
    expect(
      sportbetColumns.settings({ player: player('7'), admin: 0, locale: 'de' }),
    ).toEqual(refuse('bad-locale'));
  });
});
```

- [ ] **Step 2: Run them to see them fail**

Run: `pnpm --filter @sportbet/domain exec vitest run src/stored/sportbet-columns.test.ts`
Expected: FAIL - the user cases fail (`toEqual` shows no `email`, `name`, `surname`; `bad-email` and `bad-name` never returned), and `sportbetColumns.settings is not a function`.

- [ ] **Step 3: The stored player**

In `packages/domain/src/player/player.ts`, replace the `StoredPlayer` doc comment and interface with:

```ts
/**
 * A player as stored: the id and the username scoring names them by, and
 * the account sign-in needs (spec 4b) - the address, matched exactly, and
 * the name and surname the rail shows as "Jonas P.".
 */
export interface StoredPlayer {
  readonly id: PlayerId;
  readonly username: string;
  readonly email: EmailAddress;
  readonly name: string;
  readonly surname: string;
}
```

and add at the top, below the existing imports:

```ts
import type { EmailAddress } from '../account/email';
```

- [ ] **Step 4: sportbet's user and settings columns**

In `packages/domain/src/stored/sportbet-columns.ts`:

Replace the import `import { usernameInvariant, type StoredPlayer } from '../player/player';` with:

```ts
import { storedEmailAddress } from '../account/email';
import { personNameInvariant } from '../account/person-name';
import {
  adminLevelInvariant,
  localeInvariant,
  type StoredPlayerSettings,
} from '../account/player-settings';
import { usernameInvariant, type StoredPlayer } from '../player/player';
```

In the module comment, replace the `users` bullet:

```
 * - `users`: only `id` and `username` are read (the id, a positive
 *   integer, as the player's id, its decimal text); names, emails and
 *   sign-in columns never are.
```

with:

```
 * - `users`: `id` (a positive integer, as the player's id, its decimal
 *   text), `username`, `email` (as stored: an address sportbet did not
 *   normalize is refused, never fixed), `name` and `surname` (either may
 *   be empty) - the owner's consent for slice 4b. A Google id, a remember
 *   token or a password never is.
 * - `user_settings`: `admin` as it is (its non-negative tinyint range) and
 *   `locale` (`lt` or `en`); the last-used tournament is not stored by
 *   sportbet (it lived in the session), so it reads back as none (R-28).
```

Replace the `SportbetUserRow` interface with:

```ts
export interface SportbetUserRow {
  readonly id: number;
  readonly username: string;
  readonly email: string;
  readonly name: string;
  readonly surname: string;
}

export interface SportbetSettingsRow {
  readonly player: PlayerId;
  /** `user_settings.admin`. */
  readonly admin: number;
  /** `user_settings.locale`. */
  readonly locale: string;
}
```

Replace the whole `player(row) { ... },` method with:

```ts
  player(
    row: SportbetUserRow,
  ): Result<StoredPlayer, 'bad-id' | 'bad-username' | 'bad-email' | 'bad-name'> {
    if (!sportbetIdSchema.safeParse(row.id).success) {
      return refuse('bad-id');
    }
    const id = playerId(String(row.id));
    if (!id.ok) {
      return refuse('bad-id');
    }
    if (!usernameInvariant.schema.safeParse(row.username).success) {
      return refuse('bad-username');
    }
    const email = storedEmailAddress(row.email);
    if (!email.ok) {
      return refuse('bad-email');
    }
    if (
      !personNameInvariant.schema.safeParse(row.name).success ||
      !personNameInvariant.schema.safeParse(row.surname).success
    ) {
      return refuse('bad-name');
    }
    return ok({
      id: id.value,
      username: row.username,
      email: email.value,
      name: row.name,
      surname: row.surname,
    });
  },

  settings(
    row: SportbetSettingsRow,
  ): Result<StoredPlayerSettings, 'bad-admin-level' | 'bad-locale'> {
    if (!adminLevelInvariant.schema.safeParse(row.admin).success) {
      return refuse('bad-admin-level');
    }
    if (!localeInvariant.schema.safeParse(row.locale).success) {
      return refuse('bad-locale');
    }
    return ok({
      player: row.player,
      locale: row.locale,
      adminLevel: row.admin,
      lastTournament: null,
    });
  },
```

- [ ] **Step 5: A test player with an account**

In `packages/domain/src/testing.ts`, add to the imports:

```ts
import { emailAddress } from './account/email';
import type { StoredPlayer } from './player/player';
```

and below `export const player = ...`:

```ts
/** A player with an account: `<username>@example.test`, the username as the name, no surname. */
export function testPlayer(id: PlayerId, username: string): StoredPlayer {
  return {
    id,
    username,
    email: unwrap(emailAddress(`${username}@example.test`)),
    name: username,
    surname: '',
  };
}
```

- [ ] **Step 6: Export what Tasks 1 to 3 added**

In `packages/domain/src/index.ts`, replace `export { usernameInvariant, type StoredPlayer } from './player/player';` with:

```ts
export { usernameInvariant, type StoredPlayer } from './player/player';
export {
  emailAddress,
  emailInvariant,
  foldEmail,
  normalizeEmail,
  storedEmailAddress,
  type EmailAddress,
} from './account/email';
export { personNameInvariant } from './account/person-name';
export {
  adminLevelInvariant,
  isAdmin,
  localeInvariant,
  type StoredPlayerSettings,
} from './account/player-settings';
export {
  codeStepCounters,
  LOGIN_CODE_DIGITS,
  LOGIN_CODE_PURPOSES,
  LOGIN_CODE_TTL_MINUTES,
  loginCodeExpiresAt,
  RESEND_COOLDOWN_SECONDS,
  type CodeStepCounters,
  type LoginCodePurpose,
} from './account/login-code';
export {
  AUDIT_LOGIN_METHODS,
  SESSION_LIFETIME_DAYS,
  sessionExpiresAt,
  utcDay,
  type AuditLoginMethod,
} from './account/session';
```

and add `type SportbetSettingsRow,` to the `sportbetColumns` export list, after `type SportbetPredictionRow,`.

- [ ] **Step 7: Run the domain suite**

Run: `pnpm --filter @sportbet/domain exec vitest run && pnpm --filter @sportbet/domain typecheck`
Expected: PASS; typecheck clean. (`packages/db` and `tools/migrate` do not typecheck yet: their saves still build players without an account. Tasks 5 and 10 fix them; do not run `pnpm typecheck` across the repo until Task 5.)

- [ ] **Step 8: Hand to the lead.** Files above; `pnpm format && pnpm lint` clean. Commit message: `feat(domain): a player's account, and sportbet's user and settings columns (#16)`. The lead holds this commit and Task 5's together if the repository-wide typecheck must stay green on every commit; otherwise commit as is.

---

### Task 4 (backend-dev): Which tournament, and what the shell shows of it

**Files:**
- Create: `packages/domain/src/context/tournament-context.ts`
- Modify: `packages/domain/src/index.ts`
- Test: `packages/domain/src/context/tournament-context.test.ts`

The parts of sportbet's `SessionController::setSession` that are rules, made pure: which tournament (R-28, then `activeMembership`'s fallback), the current round (the domain's `Season.currentRound`, already under the rule set), `started` (`NavVisibility::hasKickedOff`), `standingsLocked` (`StandingsDeadline::passedAt`) and the three navigation flags. **Q1 must be answered first** (Task 0).

- [ ] **Step 1: Write the failing tests**

`packages/domain/src/context/tournament-context.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import { Season } from '../round/season';
import { ruledRules, sportbetRules } from '../rules/rule-set';
import { at, makeGame, makeRound, unwrap } from '../testing';
import {
  chooseTournament,
  NO_TOURNAMENT_NAV,
  tournamentContext,
} from './tournament-context';

const END = at('2027-05-31T00:00:00Z');

/** Round 1 (survival as given) with games at 18:00 on 10-01 and 10-02; round 5 on 10-29. */
function season(
  options: { round1Survival?: boolean; scored?: boolean } = {},
): Season {
  return unwrap(
    Season.create({
      rounds: [
        makeRound({ number: 1, survival: options.round1Survival ?? true }),
        makeRound({ number: 5 }),
      ],
      games: [
        makeGame({
          id: 1,
          round: 1,
          home: 'ZAL',
          away: 'OLY',
          tipOff: '2026-10-01T18:00:00Z',
          ...(options.scored === true ? { result: [80, 75] as const } : {}),
        }),
        makeGame({
          id: 2,
          round: 1,
          home: 'RMB',
          away: 'FCB',
          tipOff: '2026-10-02T18:00:00Z',
        }),
        makeGame({
          id: 3,
          round: 5,
          home: 'ZAL',
          away: 'RMB',
          tipOff: '2026-10-29T18:00:00Z',
        }),
      ],
      endsAt: END,
    }),
  );
}

const context = (
  when: string,
  options: { round1Survival?: boolean; scored?: boolean; survival?: boolean } = {},
) =>
  tournamentContext({
    season: season(options),
    survival: options.survival ?? true,
    now: at(when),
    rules: ruledRules,
  });

// sportbet's NavVisibilityTest::test_has_kicked_off.
describe('started (NavVisibility::hasKickedOff)', () => {
  it('no games yet: not started', () => {
    const empty = unwrap(Season.create({ rounds: [], games: [], endsAt: END }));
    expect(
      tournamentContext({
        season: empty,
        survival: true,
        now: at('2026-10-01T18:00:00Z'),
        rules: ruledRules,
      }).started,
    ).toBe(false);
  });

  it('first game tomorrow: not started', () => {
    expect(context('2026-09-30T18:00:00Z').started).toBe(false);
  });

  it('first game an hour ago: started', () => {
    expect(context('2026-10-01T19:00:00Z').started).toBe(true);
  });

  it('exactly at kick-off: not yet', () => {
    expect(context('2026-10-01T18:00:00Z').started).toBe(false);
  });
});

// sportbet's NavVisibilityTest::test_show_survival and TournamentSessionTest.
describe('nav.survival (NavVisibility::showSurvival)', () => {
  it('the current round and the tournament both play survival: shown', () => {
    expect(context('2026-09-30T18:00:00Z').nav.survival).toBe(true);
  });

  it('the current round does not: hidden', () => {
    expect(
      context('2026-09-30T18:00:00Z', { round1Survival: false }).nav.survival,
    ).toBe(false);
  });

  it('the tournament does not: hidden, whatever the round says', () => {
    expect(
      context('2026-09-30T18:00:00Z', { survival: false }).nav.survival,
    ).toBe(false);
  });

  it('no current round (every game scored): hidden', () => {
    const allScored = unwrap(
      Season.create({
        rounds: [makeRound({ number: 1 })],
        games: [
          makeGame({
            id: 1,
            round: 1,
            home: 'ZAL',
            away: 'OLY',
            tipOff: '2026-10-01T18:00:00Z',
            result: [80, 75],
          }),
        ],
        endsAt: END,
      }),
    );
    const scored = tournamentContext({
      season: allScored,
      survival: true,
      now: at('2026-10-05T12:00:00Z'),
      rules: sportbetRules,
    });
    expect(scored.currentRound).toBeNull();
    expect(scored.nav.survival).toBe(false);
  });
});

// sportbet's NavVisibilityTest: show_summary and show_survival_summary.
describe('nav.summary and nav.survivalSummary', () => {
  it('the summary shows once the tournament has started', () => {
    expect(context('2026-09-30T18:00:00Z').nav.summary).toBe(false);
    expect(context('2026-10-01T19:00:00Z').nav.summary).toBe(true);
  });

  it('the summary shows once any result is in, even before the first game', () => {
    expect(context('2026-09-30T18:00:00Z', { scored: true }).nav.summary).toBe(
      true,
    );
  });

  it('the survival summary follows the tournament flag alone', () => {
    expect(context('2026-09-30T18:00:00Z').nav.survivalSummary).toBe(true);
    expect(
      context('2026-09-30T18:00:00Z', { survival: false }).nav.survivalSummary,
    ).toBe(false);
  });
});

// sportbet's StandingsDeadlineTest, through Season (ST-2).
describe('standingsLocked (StandingsDeadline::passedAt)', () => {
  it('open before the first game of the deadline round, locked from it', () => {
    expect(context('2026-10-29T17:59:59Z').standingsLocked).toBe(false);
    expect(context('2026-10-29T18:00:00Z').standingsLocked).toBe(true);
  });

  it('never locks a tournament with no game in its deadline round', () => {
    const short = unwrap(
      Season.create({
        rounds: [makeRound({ number: 1 })],
        games: [
          makeGame({
            id: 1,
            round: 1,
            home: 'ZAL',
            away: 'OLY',
            tipOff: '2026-10-01T18:00:00Z',
          }),
        ],
        endsAt: END,
      }),
    );
    expect(
      tournamentContext({
        season: short,
        survival: true,
        now: at('2027-01-01T00:00:00Z'),
        rules: ruledRules,
      }).standingsLocked,
    ).toBe(false);
  });
});

it('the current round is the rule set\'s (LR-3): the ruled set takes the soonest open game', () => {
  expect(context('2026-10-01T19:00:00Z').currentRound).toBe(1);
  expect(context('2026-10-03T12:00:00Z').currentRound).toBe(5);
});

it("a player in no tournament has every flag off (SessionController::setLeaguelessSession)", () => {
  expect(NO_TOURNAMENT_NAV).toEqual({
    survival: false,
    summary: false,
    survivalSummary: false,
  });
});

// R-28, then SessionController::activeMembership.
describe('chooseTournament', () => {
  it('R-28: the last-used tournament, when the player is in it', () => {
    expect(chooseTournament({ lastUsed: 4, playing: [2, 4, 7] })).toBe(4);
  });

  it('not the last-used one when the player is no longer in it', () => {
    expect(chooseTournament({ lastUsed: 9, playing: [4] })).toBe(4);
  });

  it('the one tournament a player is in, with none last used', () => {
    expect(chooseTournament({ lastUsed: null, playing: [4] })).toBe(4);
  });

  it('none for a player in no tournament', () => {
    expect(chooseTournament({ lastUsed: null, playing: [] })).toBeNull();
    expect(chooseTournament({ lastUsed: 4, playing: [] })).toBeNull();
  });

  it('Q1, the owner: among several, with none last used, the newest', () => {
    expect(chooseTournament({ lastUsed: null, playing: [2, 7, 4] })).toBe(7);
  });
});
```

- [ ] **Step 2: Run them to see them fail**

Run: `pnpm --filter @sportbet/domain exec vitest run src/context`
Expected: FAIL - `Failed to resolve import "./tournament-context"`.

- [ ] **Step 3: Write `packages/domain/src/context/tournament-context.ts`**

```ts
import type { Season } from '../round/season';
import type { RuleSet } from '../rules/rule-set';
import type { RoundNumber } from '../shared/ids';
import type { Instant } from '../shared/instant';

/** Which conditional entries the navigation shows (sportbet's navShow* session keys). */
export interface NavVisibility {
  /** The survival pick page: the current round and the tournament both play survival. */
  readonly survival: boolean;
  /** The summary pages: the tournament has started, or some result is in. */
  readonly summary: boolean;
  /** The survival summary: the tournament plays survival at all. */
  readonly survivalSummary: boolean;
}

/** The request's tournament as the shell and the pages read it, per request (decision 5). */
export interface TournamentContext {
  /** LR-3, under the rule set given; null when no round is current. */
  readonly currentRound: RoundNumber | null;
  /** The first game has tipped off (sportbet's `disabled`). */
  readonly started: boolean;
  /** Standings no longer take edits (CONTEXT.md > Standings deadline). */
  readonly standingsLocked: boolean;
  readonly nav: NavVisibility;
}

/** setLeaguelessSession: a player in no tournament sees no conditional entry. */
export const NO_TOURNAMENT_NAV: NavVisibility = Object.freeze({
  survival: false,
  summary: false,
  survivalSummary: false,
});

/**
 * SessionController::setSession's rules, for one tournament at `now`.
 * `started` is NavVisibility::hasKickedOff - the earliest game of all
 * strictly before `now`, so exactly at kick-off it has not; the summary
 * shows once started or once any game has a result (#129's
 * anyScoredGame); the survival entry needs the current round's survival
 * flag and the tournament's; standings lock at Season.standingsDeadline,
 * and a tournament with no game in its deadline round never locks.
 */
export function tournamentContext(input: {
  readonly season: Season;
  /** The tournament plays survival (sportbet's `survival_game`). */
  readonly survival: boolean;
  readonly now: Instant;
  readonly rules: RuleSet;
}): TournamentContext {
  const { season, survival, now, rules } = input;
  const currentRound = season.currentRound(now, rules);
  const firstTipOff = season.games.reduce<Instant | null>(
    (first, game) =>
      first === null || game.tipOff < first ? game.tipOff : first,
    null,
  );
  const started = firstTipOff !== null && firstTipOff < now;
  const anyScored = season.games.some((game) => game.result !== null);
  const roundPlaysSurvival =
    currentRound !== null && (season.round(currentRound)?.survival ?? false);
  return {
    currentRound,
    started,
    standingsLocked: !season.isStandingsOpenAt(now),
    nav: {
      survival: roundPlaysSurvival && survival,
      summary: started || anyScored,
      survivalSummary: survival,
    },
  };
}

/**
 * The tournament a request is about, by id (R-28, then
 * SessionController::activeMembership): the one the player used last, if
 * they are still in it; else the only one they are in; else none. With
 * several and none last used, sportbet takes whichever active membership
 * MySQL returns first (no ORDER BY); the owner ruled (Q1) the newest - the
 * highest id.
 */
export function chooseTournament(input: {
  readonly lastUsed: number | null;
  readonly playing: readonly number[];
}): number | null {
  const { lastUsed, playing } = input;
  if (lastUsed !== null && playing.includes(lastUsed)) return lastUsed;
  if (playing.length <= 1) return playing[0] ?? null;
  return Math.max(...playing);
}
```

If the owner's answer to Q1 differs from the proposal, change only the last line of `chooseTournament` and the last test's name and expectation (e.g. the oldest: `Math.min(...playing)`, expecting `2`), and the sentence naming the ruling in the comment.

- [ ] **Step 4: Export it**

In `packages/domain/src/index.ts`, add:

```ts
export {
  chooseTournament,
  NO_TOURNAMENT_NAV,
  tournamentContext,
  type NavVisibility,
  type TournamentContext,
} from './context/tournament-context';
```

- [ ] **Step 5: Run them to see them pass**

Run: `pnpm --filter @sportbet/domain exec vitest run src/context && pnpm --filter @sportbet/domain typecheck`
Expected: PASS, 20 tests; typecheck clean.

- [ ] **Step 6: Hand to the lead.** Files above; `pnpm format && pnpm lint` clean. Commit message: `feat(domain): the request's tournament and sportbet's NavVisibility (#16)`.

---

### Task 5 (backend-dev): The account schema, and email_fold() **(sensitive)**

**Files:**
- Create: `packages/db/migrations/0006_email-fold.sql` (custom), `packages/db/migrations/0007_accounts.sql` (generated), `packages/db/src/account/schema.ts`
- Modify: `packages/db/src/player/schema.ts`, `packages/db/src/player/repository.ts`, `packages/db/src/schema.ts`, `packages/db/src/counts.ts`, `packages/db/src/index.ts`, `packages/db/src/testing/index.ts`, `packages/db/test/world.ts`, `packages/db/test/golden.test.ts`, `packages/db/test/snapshot.test.ts`
- Test: `packages/db/test/email-fold.test.ts` (new), `packages/db/test/schema.test.ts`, `packages/db/test/player.test.ts`, `packages/db/test/points.test.ts`; `packages/db/test/invariant-checks.test.ts` proves the new CHECKs unchanged

sportbet's `users.email` is unique under `utf8mb4_unicode_ci`, which ignores accents: a second account cannot take `zukauskas@` beside `žukauskas@`. Here a unique index on `email_fold(email)` refuses it the same way, while every lookup compares `email` exactly (#41, Task 6).

- [ ] **Step 1: Write the failing tests**

`packages/db/test/email-fold.test.ts`:

```ts
import { foldEmail } from '@sportbet/domain';
import { everyBmpCharacter } from '@sportbet/domain/testing';
import { expect, it } from 'vitest';
import { z } from 'zod';
import { useTestDatabase } from '../src/testing';

const { client } = useTestDatabase();

const folded = z.array(z.object({ value: z.string(), folded: z.string() }));

it('email_fold() drops the accents of Lithuanian letters', async () => {
  const result = await client.query(
    'select $1::text as value, email_fold($1) as folded',
    ['ąčęėįšųūž@example.lt'],
  );
  expect(folded.parse(result.rows)).toEqual([
    { value: 'ąčęėįšųūž@example.lt', folded: 'aceeisuuz@example.lt' },
  ]);
});

// The unique index's key and the domain's foldEmail are one function: on
// every BMP character, in the middle of an address, they agree.
it('email_fold() is foldEmail on every BMP character', async () => {
  const values = everyBmpCharacter().map((character) => `a${character}@x`);
  const result = await client.query(
    'select value, email_fold(value) as folded from unnest($1::text[]) as value',
    [values],
  );
  const rows = folded.parse(result.rows);
  expect(rows).toHaveLength(values.length);
  const differ = rows
    .filter(({ value, folded: sql }) => sql !== foldEmail(value))
    .map(({ value }) =>
      Array.from(value).map((character) => character.codePointAt(0)),
    );
  expect(differ).toEqual([]);
});
```

In `packages/db/test/schema.test.ts`:

Change the import `import { useTestDatabase, withDatabaseAt } from '../src/testing';` to:

```ts
import {
  migrateThrough,
  useTestDatabase,
  withDatabaseAt,
} from '../src/testing';
```

In `world()`, replace the players insert with:

```ts
  await run(
    `insert into players (id, username, email, name, surname) overriding system value values
       (1, 'ada', 'ada@example.test', 'Ada', ''), (2, 'ben', 'ben@example.test', 'Ben', '')`,
  );
```

In `describe('players constraints')`, replace the first test's statement with:

```ts
        `insert into players (id, username, email, name, surname)
         overriding system value values (3, 'ada', 'ada3@example.test', 'Ada', '')`,
```

and add after `describe('players constraints', ...)`:

```ts
const PLAYER = `insert into players (id, username, email, name, surname)
  overriding system value values ($1, $2, $3, '', '')`;
const SESSION = `insert into sessions (token_hash, player_id, created_at, last_seen_at, expires_at)
  values ($1, $2, now(), now(), now() + interval '90 days')`;

describe('account constraints', () => {
  beforeEach(world);

  it("refuse a second spelling of an address once accents are dropped, as sportbet's collation does", async () => {
    expect(await verdict(PLAYER, [3, 'zuk', 'žukauskas@example.lt'])).toBe(
      'accepted',
    );
    expect(await verdict(PLAYER, [4, 'zuk2', 'zukauskas@example.lt'])).toEqual(
      refusedBy(UNIQUE, 'players_email_folded_unique'),
    );
    expect(await verdict(PLAYER, [5, 'zuk3', 'žukauskas@example.lt'])).toEqual(
      refusedBy(UNIQUE, 'players_email_folded_unique'),
    );
  });

  it('keep settings, sessions and sign-in records to a known player, and a last tournament to a known one', async () => {
    expect(
      await verdict(`insert into player_settings (player_id) values (1)`),
    ).toBe('accepted');
    expect(
      await verdict(`insert into player_settings (player_id) values (9)`),
    ).toEqual(refusedBy(FOREIGN_KEY, 'player_settings_player_fk'));
    expect(
      await verdict(
        `update player_settings set last_tournament_id = 9 where player_id = 1`,
      ),
    ).toEqual(refusedBy(FOREIGN_KEY, 'player_settings_last_tournament_fk'));
    expect(await verdict(SESSION, ['a'.repeat(64), 1])).toBe('accepted');
    expect(await verdict(SESSION, ['a'.repeat(64), 2])).toEqual(
      refusedBy(UNIQUE, 'sessions_token_hash_unique'),
    );
    expect(await verdict(SESSION, ['b'.repeat(64), 9])).toEqual(
      refusedBy(FOREIGN_KEY, 'sessions_player_fk'),
    );
    expect(
      await verdict(
        `insert into audit_logins (player_id, method, at) values (9, 'email_code', now())`,
      ),
    ).toEqual(refusedBy(FOREIGN_KEY, 'audit_logins_player_fk'));
  });

  it("forget a deleted tournament as a player's last one, and a deleted player's settings, sessions and sign-in records (R-25)", async () => {
    await insertTournament(3, 'euroleague-2028-29');
    await run(
      `insert into player_settings (player_id, last_tournament_id) values (2, 3)`,
    );
    await run(`delete from tournaments where id = 3`);
    expect(
      (
        await run(
          `select last_tournament_id from player_settings where player_id = 2`,
        )
      ).rows,
    ).toEqual([{ last_tournament_id: null }]);
    await run(SESSION, ['c'.repeat(64), 2]);
    await run(
      `insert into audit_logins (player_id, method, at) values (2, 'email_code', now())`,
    );
    await run(`delete from players where id = 2`);
    const left = await run(
      `select (select count(*) from player_settings where player_id = 2)::int as settings,
              (select count(*) from sessions where player_id = 2)::int as sessions,
              (select count(*) from audit_logins where player_id = 2)::int as audit`,
    );
    expect(left.rows).toEqual([{ settings: 0, sessions: 0, audit: 0 }]);
  });

  it('refuse a login code for a purpose no flow has', async () => {
    expect(
      await verdict(
        `insert into login_codes (email, purpose, code_hash, created_at, expires_at)
         values ('ada@example.test', 'other', 'x', now(), now())`,
      ),
    ).toMatchObject({ code: '22P02' });
  });
});
```

In the migrations `describe`, inside the test `keep each production survival row's id as its sportbet_id when the column arrives`, replace `await runMigrations(before.url, MIGRATIONS_FOLDER);` with:

```ts
      // Through 0006_email-fold: 0007_accounts gives players an address,
      // which a player saved before it cannot have (the next test).
      await migrateThrough(before.url, 7);
```

and add after that test:

```ts
  it('refuse to add accounts to a database that holds players without one, and apply none of it', async () => {
    // Migrated through 0006_email-fold, where a player had no address.
    await withDatabaseAt(connection, 7, async (before) => {
      await before.client.query(
        `insert into players (id, username) overriding system value values (1, 'ada')`,
      );
      await expect(
        runMigrations(before.url, MIGRATIONS_FOLDER),
      ).rejects.toMatchObject({ cause: { code: '23502', column: 'email' } });
      const columns = await before.client.query(
        `select column_name from information_schema.columns
         where table_name = 'players' and column_name = 'email'`,
      );
      expect(columns.rows).toEqual([]);
      const applied = await before.client.query(
        `select count(*)::int as applied from drizzle.__drizzle_migrations`,
      );
      expect(applied.rows).toEqual([{ applied: 7 }]);
    });
  });
```

In the survival test the same file inserts a player at migration 3 with `insert into players (id, username) ...` - leave it: that database stops at 0006.

In `packages/db/test/points.test.ts`, add `SIGN_IN_TABLES,` to the `../src` import; in `countStoredRows`'s `counts` object add `player_settings: 0,` after `players: 3,`; in `names every table the schema has` replace `[...STORED_TABLES].sort()` with `[...STORED_TABLES, ...SIGN_IN_TABLES].sort()`.

In `packages/db/test/player.test.ts`, add `testPlayer` to the `@sportbet/domain/testing` import (it imports `tournamentKey` from there) and replace the first test with:

```ts
  it('keeps the id, the username and the account of a player', async () => {
    expect(await listPlayers(db)).toEqual([
      testPlayer(ADA, 'ada'),
      testPlayer(BEN, 'ben'),
      testPlayer(CAI, 'cai'),
    ]);
    const renamed = { ...testPlayer(ADA, 'ada-2'), surname: 'Žukauskaitė' };
    await savePlayers(db, [renamed]);
    expect((await listPlayers(db))[0]).toEqual(renamed);
  });
```

- [ ] **Step 2: Run them to see them fail**

Run: `pnpm --filter @sportbet/db exec vitest run test/email-fold.test.ts test/schema.test.ts`
Expected: FAIL - `function email_fold(text) does not exist`, `column "email" of relation "players" does not exist`, `migrateThrough` is not exported.

- [ ] **Step 3: The fold, as a custom migration**

```bash
pnpm --filter @sportbet/db db:generate --custom --name email-fold
ls packages/db/migrations/0006_email-fold.sql
```

Expected: the file exists, holding drizzle-kit's one-line placeholder comment. Replace its whole content with:

```sql
-- The key of players' unique address index (0007_accounts): the stored,
-- normalized address in NFD with every combining mark (U+0300 to U+036F)
-- dropped, so 'žukauskas@' and 'zukauskas@' fold alike, as sportbet's
-- utf8mb4_unicode_ci index refuses them. Never a lookup key (#41). The
-- domain's foldEmail is the same function (test/email-fold.test.ts).
CREATE FUNCTION email_fold(email text) RETURNS text
  LANGUAGE sql IMMUTABLE STRICT PARALLEL SAFE
  RETURN regexp_replace(normalize(email, NFD), '[̀-ͯ]', '', 'g');
```

(`normalize` and `regexp_replace` are immutable, so the function may key an index; checked on `postgres:18.6`.)

- [ ] **Step 4: Players' account columns**

Replace `packages/db/src/player/schema.ts`'s imports and the `players` table with:

```ts
import {
  emailInvariant,
  fillInCountInvariant,
  personNameInvariant,
  usernameInvariant,
} from '@sportbet/domain';
import { sql } from 'drizzle-orm';
import {
  boolean,
  foreignKey,
  index,
  integer,
  pgTable,
  primaryKey,
  text,
  uniqueIndex,
} from 'drizzle-orm/pg-core';
import { invariantCheck, type InvariantCheck } from '../invariant';
import { tournaments } from '../tournament/schema';

/**
 * A player: the id and username scoring names them by, and the account
 * (spec 4b) - the address sign-in matches exactly (EmailIdentity, #41),
 * and the name and surname the rail shows. Google ids wait for 4c.
 */
export const players = pgTable(
  'players',
  {
    id: integer('id').primaryKey().generatedAlwaysAsIdentity(),
    // Unique by exact text (P12: none duplicated in production).
    username: text('username').notNull().unique('players_username_unique'),
    /** Trimmed and lower case (normalizeEmail), on every write. */
    email: text('email').notNull(),
    name: text('name').notNull(),
    surname: text('surname').notNull(),
  },
  (table) => [
    // sportbet's users_email_unique under utf8mb4_unicode_ci refuses a
    // second spelling once accents are ignored; so does this. Never a
    // lookup key: sign-in uses players_email_idx, exactly.
    uniqueIndex('players_email_folded_unique').on(
      sql`email_fold(${table.email})`,
    ),
    index('players_email_idx').on(table.email),
    ...playerInvariantChecks.map(invariantCheck),
  ],
);
```

and replace `playerInvariantChecks` with:

```ts
/** Every CHECK on `players`: each holds a domain invariant. */
export const playerInvariantChecks: readonly InvariantCheck[] = [
  {
    constraint: 'players_username_format',
    column: players.username,
    invariant: usernameInvariant,
  },
  {
    constraint: 'players_email_format',
    column: players.email,
    invariant: emailInvariant,
  },
  {
    constraint: 'players_name_length',
    column: players.name,
    invariant: personNameInvariant,
  },
  {
    constraint: 'players_surname_length',
    column: players.surname,
    invariant: personNameInvariant,
  },
];
```

- [ ] **Step 5: The account area**

`packages/db/src/account/schema.ts`:

```ts
import {
  adminLevelInvariant,
  AUDIT_LOGIN_METHODS,
  emailInvariant,
  localeInvariant,
  LOGIN_CODE_PURPOSES,
} from '@sportbet/domain';
import {
  foreignKey,
  index,
  integer,
  pgEnum,
  pgTable,
  smallint,
  text,
  timestamp,
} from 'drizzle-orm/pg-core';
import { invariantCheck, type InvariantCheck } from '../invariant';
import { players } from '../player/schema';
import { tournaments } from '../tournament/schema';

/** Built from the domain's lists, so the enums and the types cannot drift. */
export const loginCodePurposeEnum = pgEnum(
  'login_code_purpose',
  LOGIN_CODE_PURPOSES,
);
export const auditLoginMethodEnum = pgEnum(
  'audit_login_method',
  AUDIT_LOGIN_METHODS,
);

const moment = (name: string) => timestamp(name, { withTimezone: true });

/**
 * A player's settings: sportbet's `user_settings` columns 4b reads, and
 * R-28's last-used tournament, stored with the player rather than in the
 * session (decision 5). Every account has one row.
 */
export const playerSettings = pgTable(
  'player_settings',
  {
    playerId: integer('player_id').primaryKey(),
    /** Carried, unused: the app is Lithuanian only (decision 13). */
    locale: text('locale').notNull().default('lt'),
    /** sportbet's `admin`, as it is; R-26's tiers are mapped by slices 13 and 14. */
    adminLevel: smallint('admin_level').notNull().default(0),
    lastTournamentId: integer('last_tournament_id'),
  },
  (table) => [
    foreignKey({
      name: 'player_settings_player_fk',
      columns: [table.playerId],
      foreignColumns: [players.id],
    }).onDelete('cascade'),
    foreignKey({
      name: 'player_settings_last_tournament_fk',
      columns: [table.lastTournamentId],
      foreignColumns: [tournaments.id],
    }).onDelete('set null'),
    ...playerSettingsInvariantChecks.map(invariantCheck),
  ],
);

/**
 * One-time codes (sportbet's login_codes): stored only as a hash, scoped
 * by purpose (#43), live until consumed or expired. Keyed by the address,
 * not the player: registration's codes (4c) are mailed before any account
 * exists.
 */
export const loginCodes = pgTable(
  'login_codes',
  {
    id: integer('id').primaryKey().generatedAlwaysAsIdentity(),
    email: text('email').notNull(),
    purpose: loginCodePurposeEnum('purpose').notNull(),
    codeHash: text('code_hash').notNull(),
    createdAt: moment('created_at').notNull(),
    expiresAt: moment('expires_at').notNull(),
    consumedAt: moment('consumed_at'),
  },
  (table) => [
    index('login_codes_email_purpose_idx').on(table.email, table.purpose),
    ...loginCodeInvariantChecks.map(invariantCheck),
  ],
);

/**
 * A signed-in browser (R-44): the cookie's random token is stored only as
 * its SHA-256, and the session lasts 90 days from its last visit.
 */
export const sessions = pgTable(
  'sessions',
  {
    id: integer('id').primaryKey().generatedAlwaysAsIdentity(),
    tokenHash: text('token_hash')
      .notNull()
      .unique('sessions_token_hash_unique'),
    playerId: integer('player_id').notNull(),
    createdAt: moment('created_at').notNull(),
    lastSeenAt: moment('last_seen_at').notNull(),
    expiresAt: moment('expires_at').notNull(),
  },
  (table) => [
    foreignKey({
      name: 'sessions_player_fk',
      columns: [table.playerId],
      foreignColumns: [players.id],
    }).onDelete('cascade'),
    index('sessions_player_idx').on(table.playerId),
  ],
);

/**
 * The sign-in throttles' fixed windows (sportbet's cache-backed
 * RateLimiter; Vercel has no shared memory): a hashed key, when its
 * window began, and how many attempts it has counted.
 */
export const rateLimits = pgTable(
  'rate_limits',
  {
    key: text('key').primaryKey(),
    windowStartedAt: moment('window_started_at').notNull(),
    hits: integer('hits').notNull(),
  },
  (table) => [index('rate_limits_window_idx').on(table.windowStartedAt)],
);

/** Each sign-in (sportbet's audit_logins), erased with the account (R-25). */
export const auditLogins = pgTable(
  'audit_logins',
  {
    id: integer('id').primaryKey().generatedAlwaysAsIdentity(),
    playerId: integer('player_id').notNull(),
    method: auditLoginMethodEnum('method').notNull(),
    at: moment('at').notNull(),
  },
  (table) => [
    foreignKey({
      name: 'audit_logins_player_fk',
      columns: [table.playerId],
      foreignColumns: [players.id],
    }).onDelete('cascade'),
    index('audit_logins_player_idx').on(table.playerId),
  ],
);

/** Every CHECK on `player_settings`: each holds a domain invariant. */
export const playerSettingsInvariantChecks: readonly InvariantCheck[] = [
  {
    constraint: 'player_settings_locale_format',
    column: playerSettings.locale,
    invariant: localeInvariant,
  },
  {
    constraint: 'player_settings_admin_level_range',
    column: playerSettings.adminLevel,
    invariant: adminLevelInvariant,
  },
];

/** Every CHECK on `login_codes`: each holds a domain invariant. */
export const loginCodeInvariantChecks: readonly InvariantCheck[] = [
  {
    constraint: 'login_codes_email_format',
    column: loginCodes.email,
    invariant: emailInvariant,
  },
];
```

In `packages/db/src/schema.ts`, add the import

```ts
import {
  loginCodeInvariantChecks,
  playerSettingsInvariantChecks,
} from './account/schema';
```

the line `export * from './account/schema';` above `export * from './player/schema';`, and to `INVARIANT_CHECKS`, after `...tournamentPlayerInvariantChecks,`:

```ts
  ...playerSettingsInvariantChecks,
  ...loginCodeInvariantChecks,
```

- [ ] **Step 6: Counts**

In `packages/db/src/counts.ts`: import `playerSettings` from `./account/schema`; in `STORED_TABLES` add `'player_settings',` after `'players',`; in `countStoredRows`'s result add `player_settings: await all(playerSettings),` after `players: await all(players),`; and add below `StoredTable`:

```ts
/**
 * The tables no load writes: sign-in's own state. A production copy never
 * carries sportbet's login codes, sessions or audit rows (spec 4b).
 */
export const SIGN_IN_TABLES = [
  'login_codes',
  'sessions',
  'rate_limits',
  'audit_logins',
] as const;
```

In `packages/db/src/index.ts`, replace the `./counts` export with:

```ts
export {
  countStoredRows,
  SIGN_IN_TABLES,
  STORED_TABLES,
  type StoredTable,
} from './counts';
```

- [ ] **Step 7: Generate and review the migration**

```bash
pnpm --filter @sportbet/db db:generate --name accounts
cat packages/db/migrations/0007_accounts.sql
```

Expected, and check each by eye (the order drizzle-kit chooses may differ):
- `CREATE TYPE "public"."audit_login_method" AS ENUM('email_code');` and `CREATE TYPE "public"."login_code_purpose" AS ENUM('login', 'registration', 'account_deletion', 'email_change');`
- `CREATE TABLE` for `audit_logins`, `login_codes`, `player_settings`, `rate_limits`, `sessions`, each with the columns above, `CONSTRAINT "sessions_token_hash_unique" UNIQUE("token_hash")`, the three `CHECK`s (`player_settings_locale_format`, `player_settings_admin_level_range`, `login_codes_email_format`);
- `ALTER TABLE "players" ADD COLUMN "email" text NOT NULL;` and the same for `name` and `surname` - no `DEFAULT` (a database holding players refuses the migration, Step 1's test);
- the four foreign keys (`player_settings_player_fk` and `sessions_player_fk` and `audit_logins_player_fk` `ON DELETE cascade`, `player_settings_last_tournament_fk` `ON DELETE set null`);
- `CREATE UNIQUE INDEX "players_email_folded_unique" ON "players" USING btree (email_fold("email"));`, `CREATE INDEX "players_email_idx" ...`, and the four other indexes;
- `ALTER TABLE "players" ADD CONSTRAINT "players_email_format" CHECK (...)`, `"players_name_length"` and `"players_surname_length"`.

Nothing else: no `DROP`, no change to another table. `git status --short packages/db/migrations` shows `0006_email-fold.sql`, `0007_accounts.sql`, `meta/_journal.json`, `meta/0006_snapshot.json`, `meta/0007_snapshot.json`.

- [ ] **Step 8: Save and list players with their accounts**

In `packages/db/src/player/repository.ts`: add `personNameInvariant` and `storedEmailAddress` to the `@sportbet/domain` import; replace `playerRows`, `savePlayers` and `listPlayers` with:

```ts
const playerRows = z.array(
  z.object({
    id: z.int(),
    username: usernameInvariant.schema,
    email: z.string(),
    name: personNameInvariant.schema,
    surname: personNameInvariant.schema,
  }),
);

/** Upserts players by id: the username and the account. */
export async function savePlayers(
  db: Executor,
  saved: readonly StoredPlayer[],
): Promise<void> {
  await inChunks(saved, (chunk) =>
    db
      .insert(players)
      .overridingSystemValue()
      .values(
        chunk.map(({ id, username, email, name, surname }) => ({
          id: keyOf(id, 'player'),
          username,
          email,
          name,
          surname,
        })),
      )
      .onConflictDoUpdate({
        target: players.id,
        set: {
          username: excluded(players.username),
          email: excluded(players.email),
          name: excluded(players.name),
          surname: excluded(players.surname),
        },
      }),
  );
}

/** Every player, by id, with their account. */
export async function listPlayers(db: Executor): Promise<StoredPlayer[]> {
  const rows = await db
    .select({
      id: players.id,
      username: players.username,
      email: players.email,
      name: players.name,
      surname: players.surname,
    })
    .from(players)
    .orderBy(asc(players.id));
  return playerRows.parse(rows).map((row) => ({
    id: playerOf(row.id),
    username: row.username,
    email: stored(storedEmailAddress(row.email), 'players', row.id),
    name: row.name,
    surname: row.surname,
  }));
}
```

- [ ] **Step 9: Every saved test player has an account**

`packages/db/test/world.ts`: add `testPlayer` to its `@sportbet/domain/testing` import and replace the `savePlayers` call in `saveWorld` with:

```ts
  await savePlayers(db, [
    testPlayer(ADA, 'ada'),
    testPlayer(BEN, 'ben'),
    testPlayer(CAI, 'cai'),
  ]);
```

`packages/db/test/snapshot.test.ts`: add `testPlayer` to its `@sportbet/domain/testing` import and replace the `savePlayers` call in its `beforeEach` the same way.

`packages/db/test/golden.test.ts`: add `testPlayer` to its `@sportbet/domain/testing` import and replace the `savePlayers` call in `saveGolden` with:

```ts
  await savePlayers(
    database,
    GOLDEN.players.map((name) => testPlayer(IDS.player(name), name)),
  );
```

`packages/db/src/testing/index.ts`: replace the `./migrated-database` export with:

```ts
export {
  migrateThrough,
  withDatabaseAt,
  type DatabaseAtMigration,
} from './migrated-database';
```

and in `packages/db/src/testing/migrated-database.ts` change `async function migrateThrough(` to `export async function migrateThrough(`.

- [ ] **Step 10: Run the db suite**

Run: `pnpm --filter @sportbet/db typecheck && pnpm test:db`
Expected: typecheck clean; PASS - every earlier test, the new ones, and `invariant-checks.test.ts` now also proves `players_email_format`, `players_name_length`, `players_surname_length`, `player_settings_locale_format`, `player_settings_admin_level_range` and `login_codes_email_format` against their invariants' examples, and still lists every CHECK in the database.

- [ ] **Step 11: Hand to the lead.** Files above; `pnpm format && pnpm lint` clean (`tools/migrate` and `apps/web` may not typecheck until Tasks 10 and 11). Commit message: `feat(db): accounts - players' address and names, settings, codes, sessions, throttles, sign-in records (#16)`.

---

### Task 6 (backend-dev): Finding an account, its settings and its tournaments **(sensitive)**

**Files:**
- Create: `packages/db/src/account/repository.ts`
- Modify: `packages/db/src/tournament/repository.ts`, `packages/db/src/index.ts`
- Test: `packages/db/test/account.test.ts`

- [ ] **Step 1: Write the failing test**

`packages/db/test/account.test.ts`:

```ts
import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { emailAddress, type StoredPlayer } from '@sportbet/domain';
import { player, unwrap } from '@sportbet/domain/testing';
import { beforeEach, describe, expect, it } from 'vitest';
import {
  findAccountByEmail,
  findTournamentById,
  listPlayerSettings,
  listPlayerTournaments,
  savePlayers,
  savePlayerSettings,
} from '../src';
import { saveTournamentPlayers } from '../src/player/repository';
import { saveTournament } from '../src/tournament/repository';
import { useTestDatabase } from '../src/testing';
import { ADA, BEN, OTHER, saveWorld, TOURNAMENT } from './world';

const { db } = useTestDatabase();

const email = (typed: string) => unwrap(emailAddress(typed));

const ZUKAUSKAS: StoredPlayer = {
  id: player('9'),
  username: 'zuk',
  email: email('žukauskas@example.lt'),
  name: 'Žilvinas',
  surname: 'Žukauskas',
};

beforeEach(async () => {
  await saveWorld(db);
  await savePlayers(db, [ZUKAUSKAS]);
});

// sportbet's EmailCodeLoginTest, #41: the lookup is exact.
describe('findAccountByEmail', () => {
  it('finds the account under its own spelling', async () => {
    expect(await findAccountByEmail(db, email('žukauskas@example.lt'))).toEqual(
      { player: ZUKAUSKAS.id, email: 'žukauskas@example.lt' },
    );
  });

  it('finds nothing under the ASCII spelling of an accented address (#41)', async () => {
    expect(
      await findAccountByEmail(db, email('zukauskas@example.lt')),
    ).toBeUndefined();
  });

  it('finds nothing for an address no account has', async () => {
    expect(
      await findAccountByEmail(db, email('nobody@example.lt')),
    ).toBeUndefined();
  });
});

describe('player settings', () => {
  it("upserts a player's settings by player", async () => {
    await savePlayerSettings(db, [
      { player: ADA, locale: 'lt', adminLevel: 0, lastTournament: null },
      { player: BEN, locale: 'en', adminLevel: 9, lastTournament: null },
    ]);
    await savePlayerSettings(db, [
      {
        player: ADA,
        locale: 'lt',
        adminLevel: 1,
        lastTournament: TOURNAMENT.id,
      },
    ]);
    expect(await listPlayerSettings(db)).toEqual([
      {
        player: ADA,
        locale: 'lt',
        adminLevel: 1,
        lastTournament: TOURNAMENT.id,
      },
      { player: BEN, locale: 'en', adminLevel: 9, lastTournament: null },
    ]);
  });
});

describe('listPlayerTournaments', () => {
  it("lists the tournaments a player plays, by id, and none of another's", async () => {
    await saveTournament(db, OTHER);
    const row = { switchedOff: false, adminHidden: false, fillIns: 0 };
    await saveTournamentPlayers(db, OTHER, [{ player: ADA, ...row }]);
    await saveTournamentPlayers(db, TOURNAMENT, [
      { player: ADA, ...row },
      { player: BEN, ...row },
    ]);
    expect(await listPlayerTournaments(db, ADA)).toEqual(
      [TOURNAMENT.id, OTHER.id].sort((a, b) => a - b),
    );
    expect(await listPlayerTournaments(db, ZUKAUSKAS.id)).toEqual([]);
  });
});

it('findTournamentById finds a tournament by its id, and nothing for another', async () => {
  expect(await findTournamentById(db, TOURNAMENT.id)).toEqual(TOURNAMENT);
  expect(await findTournamentById(db, 999_999)).toBeUndefined();
});

it('no account lookup folds an address: no ILIKE, unaccent, citext or email_fold outside the index (#16, #41)', () => {
  const area = join(import.meta.dirname, '..', 'src', 'account');
  const sources = readdirSync(area)
    .filter((name) => name.endsWith('.ts') && name !== 'schema.ts')
    .map((name) => readFileSync(join(area, name), 'utf8'));
  expect(sources.length).toBeGreaterThan(0);
  expect(
    sources.filter((text) => /ilike|unaccent|citext|email_fold/i.test(text)),
  ).toEqual([]);
});
```

- [ ] **Step 2: Run it to see it fail**

Run: `pnpm --filter @sportbet/db exec vitest run test/account.test.ts`
Expected: FAIL - `findAccountByEmail` (and the others) are not exported by `../src`.

- [ ] **Step 3: Write `packages/db/src/account/repository.ts`**

```ts
import {
  adminLevelInvariant,
  localeInvariant,
  storedEmailAddress,
  type EmailAddress,
  type PlayerId,
  type StoredPlayerSettings,
} from '@sportbet/domain';
import { asc, eq } from 'drizzle-orm';
import { z } from 'zod';
import type { Executor } from '../client';
import { excluded, inChunks, keyOf, playerOf, stored } from '../edge';
import { players, tournamentPlayers } from '../player/schema';
import { playerSettings } from './schema';

/** An account as sign-in finds it: the player, and the address exactly as stored. */
export interface Account {
  readonly player: PlayerId;
  readonly email: EmailAddress;
}

const accountRows = z.array(z.object({ id: z.int(), email: z.string() }));

const settingsRows = z.array(
  z.object({
    player: z.int(),
    locale: localeInvariant.schema,
    adminLevel: adminLevelInvariant.schema,
    lastTournament: z.int().nullable(),
  }),
);

/**
 * The account whose address is exactly `email` (EmailIdentity::firstMatching,
 * #41): equality on the stored, normalized address, never a folded or
 * case-insensitive comparison, so 'zukauskas@' never finds 'žukauskas@'.
 */
export async function findAccountByEmail(
  db: Executor,
  email: EmailAddress,
): Promise<Account | undefined> {
  const rows = await db
    .select({ id: players.id, email: players.email })
    .from(players)
    .where(eq(players.email, email))
    .limit(1);
  return accountRows.parse(rows).map((row) => ({
    player: playerOf(row.id),
    email: stored(storedEmailAddress(row.email), 'players', row.id),
  }))[0];
}

/** Upserts players' settings by player. */
export async function savePlayerSettings(
  db: Executor,
  saved: readonly StoredPlayerSettings[],
): Promise<void> {
  await inChunks(saved, (chunk) =>
    db
      .insert(playerSettings)
      .values(
        chunk.map((row) => ({
          playerId: keyOf(row.player, 'player'),
          locale: row.locale,
          adminLevel: row.adminLevel,
          lastTournamentId: row.lastTournament,
        })),
      )
      .onConflictDoUpdate({
        target: playerSettings.playerId,
        set: {
          locale: excluded(playerSettings.locale),
          adminLevel: excluded(playerSettings.adminLevel),
          lastTournamentId: excluded(playerSettings.lastTournamentId),
        },
      }),
  );
}

/** Every player's settings, by player. */
export async function listPlayerSettings(
  db: Executor,
): Promise<StoredPlayerSettings[]> {
  const rows = await db
    .select({
      player: playerSettings.playerId,
      locale: playerSettings.locale,
      adminLevel: playerSettings.adminLevel,
      lastTournament: playerSettings.lastTournamentId,
    })
    .from(playerSettings)
    .orderBy(asc(playerSettings.playerId));
  return settingsRows.parse(rows).map((row) => ({
    player: playerOf(row.player),
    locale: row.locale,
    adminLevel: row.adminLevel,
    lastTournament: row.lastTournament,
  }));
}

/** The tournaments the player plays (`tournament_players`), by id. */
export async function listPlayerTournaments(
  db: Executor,
  player: PlayerId,
): Promise<number[]> {
  const rows = await db
    .select({ tournament: tournamentPlayers.tournamentId })
    .from(tournamentPlayers)
    .where(eq(tournamentPlayers.playerId, keyOf(player, 'player')))
    .orderBy(asc(tournamentPlayers.tournamentId));
  return z
    .array(z.object({ tournament: z.int() }))
    .parse(rows)
    .map(({ tournament }) => tournament);
}
```

- [ ] **Step 4: A tournament by its id**

In `packages/db/src/tournament/repository.ts`, add below `findTournamentBySlug`:

```ts
export async function findTournamentById(
  db: Executor,
  id: number,
): Promise<Tournament | undefined> {
  const rows = await db
    .select(columns)
    .from(tournaments)
    .where(eq(tournaments.id, id))
    .limit(1);
  return tournamentRows.parse(rows)[0];
}
```

In `packages/db/src/index.ts`, add `findTournamentById,` to the `./tournament/repository` export, and:

```ts
export {
  findAccountByEmail,
  listPlayerSettings,
  listPlayerTournaments,
  savePlayerSettings,
  type Account,
} from './account/repository';
```

- [ ] **Step 5: Run it to see it pass**

Run: `pnpm --filter @sportbet/db exec vitest run test/account.test.ts`
Expected: PASS, 7 tests.

- [ ] **Step 6: Hand to the lead.** Files above; `pnpm format && pnpm lint && pnpm --filter @sportbet/db typecheck` clean. Commit message: `feat(db): find an account exactly, its settings and its tournaments (#16)`.

---

### Task 7 (backend-dev): Login codes, sessions and sign-in records **(sensitive)**

**Files:**
- Create: `packages/db/src/account/login-codes.ts`, `packages/db/src/account/sessions.ts`
- Modify: `packages/db/src/index.ts`
- Test: `packages/db/test/login-codes.test.ts`, `packages/db/test/sessions.test.ts`

sportbet's `OneTimeCodeService` (issue voids the live code of the same address and purpose, found exactly; `findLive` is the newest unconsumed and unexpired one; `claim` is atomic and never past expiry), and the session behind the cookie (R-44).

- [ ] **Step 1: Write the failing tests**

`packages/db/test/login-codes.test.ts`:

```ts
import { emailAddress, secondsAfter } from '@sportbet/domain';
import { at, unwrap } from '@sportbet/domain/testing';
import { describe, expect, it } from 'vitest';
import { z } from 'zod';
import {
  claimLoginCode,
  findLiveLoginCode,
  issueLoginCode,
} from '../src';
import { useTestDatabase } from '../src/testing';

const { db, client } = useTestDatabase();

const NOW = at('2026-10-05T12:00:00Z');
const ADA = unwrap(emailAddress('ada@example.lt'));
const ZUK = unwrap(emailAddress('žukauskas@example.lt'));
const ZUK_ASCII = unwrap(emailAddress('zukauskas@example.lt'));

const issue = (email = ADA, hash = 'hash-1', now = NOW, purpose = 'login' as const) =>
  issueLoginCode(db, { email, purpose, codeHash: hash, now });

const live = z.array(z.object({ live: z.int() }));
const liveCount = async () =>
  live.parse(
    (
      await client.query(
        'select count(*)::int as live from login_codes where consumed_at is null',
      )
    ).rows,
  )[0]?.live;

describe('issueLoginCode', () => {
  it('stores the hash, never the code, and an expiry five minutes on', async () => {
    await issue();
    const rows = await client.query(
      `select email, purpose, code_hash, created_at, expires_at, consumed_at from login_codes`,
    );
    expect(rows.rows).toEqual([
      {
        email: 'ada@example.lt',
        purpose: 'login',
        code_hash: 'hash-1',
        created_at: new Date('2026-10-05T12:00:00Z'),
        expires_at: new Date('2026-10-05T12:05:00Z'),
        consumed_at: null,
      },
    ]);
  });

  it('voids the live code of the same address and purpose: a new code supersedes it', async () => {
    await issue(ADA, 'hash-1');
    await issue(ADA, 'hash-2', secondsAfter(NOW, 30));
    expect((await findLiveLoginCode(db, ADA, 'login', secondsAfter(NOW, 31)))?.codeHash).toBe('hash-2');
    expect(await liveCount()).toBe(1);
  });

  it("never voids another address's code, not even one equal once accents are dropped (#41)", async () => {
    await issue(ZUK, 'hash-zuk');
    await issue(ZUK_ASCII, 'hash-ascii');
    expect((await findLiveLoginCode(db, ZUK, 'login', NOW))?.codeHash).toBe(
      'hash-zuk',
    );
  });

  it("never voids another purpose's code (#43)", async () => {
    await issue(ADA, 'hash-registration', NOW, 'registration');
    await issue(ADA, 'hash-login');
    expect(
      (await findLiveLoginCode(db, ADA, 'registration', NOW))?.codeHash,
    ).toBe('hash-registration');
  });

  it('leaves one live code when several are issued at once', async () => {
    await Promise.all(
      ['a', 'b', 'c', 'd', 'e'].map((hash) => issue(ADA, hash)),
    );
    expect(await liveCount()).toBe(1);
  });
});

describe('findLiveLoginCode', () => {
  it('finds nothing once the code has expired', async () => {
    await issue();
    expect(
      await findLiveLoginCode(db, ADA, 'login', secondsAfter(NOW, 299)),
    ).toBeDefined();
    expect(
      await findLiveLoginCode(db, ADA, 'login', secondsAfter(NOW, 300)),
    ).toBeUndefined();
  });

  it('finds nothing for another purpose or under the ASCII spelling', async () => {
    await issue(ZUK);
    expect(
      await findLiveLoginCode(db, ZUK, 'account_deletion', NOW),
    ).toBeUndefined();
    expect(await findLiveLoginCode(db, ZUK_ASCII, 'login', NOW)).toBeUndefined();
  });
});

describe('claimLoginCode', () => {
  it('claims a live code once, and never again', async () => {
    await issue();
    const code = await findLiveLoginCode(db, ADA, 'login', NOW);
    if (code === undefined) throw new Error('no live code');
    expect(await claimLoginCode(db, code.id, NOW)).toBe(true);
    expect(await claimLoginCode(db, code.id, NOW)).toBe(false);
    expect(await findLiveLoginCode(db, ADA, 'login', NOW)).toBeUndefined();
  });

  it('never claims a code that expired between finding it and claiming it', async () => {
    await issue();
    const code = await findLiveLoginCode(db, ADA, 'login', secondsAfter(NOW, 299));
    if (code === undefined) throw new Error('no live code');
    expect(await claimLoginCode(db, code.id, secondsAfter(NOW, 300))).toBe(
      false,
    );
  });

  it('lets exactly one of two racing claims win', async () => {
    await issue();
    const code = await findLiveLoginCode(db, ADA, 'login', NOW);
    if (code === undefined) throw new Error('no live code');
    const won = await Promise.all([
      claimLoginCode(db, code.id, NOW),
      claimLoginCode(db, code.id, NOW),
    ]);
    expect(won.filter(Boolean)).toHaveLength(1);
  });
});
```

`packages/db/test/sessions.test.ts`:

```ts
import { secondsAfter } from '@sportbet/domain';
import { at } from '@sportbet/domain/testing';
import { beforeEach, describe, expect, it } from 'vitest';
import {
  createSession,
  deleteSession,
  findSignedInPlayer,
  recordLogin,
  savePlayerSettings,
  touchSession,
} from '../src';
import { useTestDatabase } from '../src/testing';
import { ADA, BEN, saveWorld, TOURNAMENT } from './world';

const { db, client } = useTestDatabase();

const NOW = at('2026-10-05T12:00:00Z');
const DAY = 86_400;
const HASH = 'a'.repeat(64);

beforeEach(async () => {
  await saveWorld(db);
  await savePlayerSettings(db, [
    { player: ADA, locale: 'lt', adminLevel: 9, lastTournament: TOURNAMENT.id },
  ]);
  await createSession(db, { player: ADA, tokenHash: HASH, now: NOW });
});

describe('a session', () => {
  it('holds the token only as its hash, and names its player, with what the shell shows', async () => {
    expect(await findSignedInPlayer(db, HASH, NOW)).toEqual({
      player: ADA,
      name: 'ada',
      surname: '',
      adminLevel: 9,
      lastTournament: TOURNAMENT.id,
    });
    const rows = await client.query(
      'select token_hash, created_at, last_seen_at, expires_at from sessions',
    );
    expect(rows.rows).toEqual([
      {
        token_hash: HASH,
        created_at: new Date('2026-10-05T12:00:00Z'),
        last_seen_at: new Date('2026-10-05T12:00:00Z'),
        expires_at: new Date('2027-01-03T12:00:00Z'),
      },
    ]);
  });

  it('R-44: ends 90 days after its last visit', async () => {
    expect(
      await findSignedInPlayer(db, HASH, secondsAfter(NOW, 90 * DAY - 1)),
    ).toBeDefined();
    expect(
      await findSignedInPlayer(db, HASH, secondsAfter(NOW, 90 * DAY)),
    ).toBeUndefined();
  });

  it('R-44: a visit extends it to 90 days from that visit', async () => {
    const visit = secondsAfter(NOW, 60 * DAY);
    expect(await touchSession(db, HASH, visit)).toBe(true);
    expect(
      await findSignedInPlayer(db, HASH, secondsAfter(visit, 90 * DAY - 1)),
    ).toBeDefined();
    const rows = await client.query('select last_seen_at, expires_at from sessions');
    expect(rows.rows).toEqual([
      {
        last_seen_at: new Date('2026-12-04T12:00:00Z'),
        expires_at: new Date('2027-03-04T12:00:00Z'),
      },
    ]);
  });

  it('is never revived once it has ended, and an unknown token touches nothing', async () => {
    expect(await touchSession(db, HASH, secondsAfter(NOW, 90 * DAY))).toBe(
      false,
    );
    expect(await touchSession(db, 'b'.repeat(64), NOW)).toBe(false);
    expect(
      await findSignedInPlayer(db, HASH, secondsAfter(NOW, 90 * DAY)),
    ).toBeUndefined();
  });

  it('ends when it is deleted, and only that one', async () => {
    await createSession(db, { player: ADA, tokenHash: 'c'.repeat(64), now: NOW });
    await deleteSession(db, HASH);
    expect(await findSignedInPlayer(db, HASH, NOW)).toBeUndefined();
    expect(await findSignedInPlayer(db, 'c'.repeat(64), NOW)).toBeDefined();
  });

  it('throws for a player with no settings row: every account has one', async () => {
    await createSession(db, { player: BEN, tokenHash: 'd'.repeat(64), now: NOW });
    await expect(
      findSignedInPlayer(db, 'd'.repeat(64), NOW),
    ).rejects.toThrow(/player 2 has no player_settings row/);
  });
});

it('records a sign-in by its method and moment', async () => {
  await recordLogin(db, { player: ADA, method: 'email_code', at: NOW });
  const rows = await client.query('select player_id, method, at from audit_logins');
  expect(rows.rows).toEqual([
    { player_id: 1, method: 'email_code', at: new Date('2026-10-05T12:00:00Z') },
  ]);
});
```

- [ ] **Step 2: Run them to see them fail**

Run: `pnpm --filter @sportbet/db exec vitest run test/login-codes.test.ts test/sessions.test.ts`
Expected: FAIL - `issueLoginCode`, `createSession` and the rest are not exported by `../src`.

- [ ] **Step 3: Write `packages/db/src/account/login-codes.ts`**

```ts
import {
  loginCodeExpiresAt,
  type EmailAddress,
  type Instant,
  type LoginCodePurpose,
} from '@sportbet/domain';
import { and, desc, eq, gt, isNull, sql } from 'drizzle-orm';
import { z } from 'zod';
import type { Executor } from '../client';
import { loginCodes } from './schema';

export interface NewLoginCode {
  readonly email: EmailAddress;
  readonly purpose: LoginCodePurpose;
  /** The code's slow hash; the code itself never reaches the database. */
  readonly codeHash: string;
  readonly now: Instant;
}

/** A code that can still be redeemed: its id, to claim it, and its hash, to check it. */
export interface LiveLoginCode {
  readonly id: number;
  readonly codeHash: string;
}

const liveRows = z.array(z.object({ id: z.int(), codeHash: z.string() }));

/**
 * OneTimeCodeService::issue: in one transaction, voids every unconsumed
 * code of exactly this address and purpose (#41, #43), then stores the new
 * one, live for five minutes. An advisory lock on the address and purpose
 * makes two issues at once take turns, so at most one code is live.
 */
export async function issueLoginCode(
  db: Executor,
  code: NewLoginCode,
): Promise<void> {
  const now = new Date(code.now);
  await db.transaction(async (tx) => {
    await tx.execute(
      sql`select pg_advisory_xact_lock(hashtextextended(${`login_codes:${code.purpose}:${code.email}`}, 0))`,
    );
    await tx
      .update(loginCodes)
      .set({ consumedAt: now })
      .where(
        and(
          eq(loginCodes.email, code.email),
          eq(loginCodes.purpose, code.purpose),
          isNull(loginCodes.consumedAt),
        ),
      );
    await tx.insert(loginCodes).values({
      email: code.email,
      purpose: code.purpose,
      codeHash: code.codeHash,
      createdAt: now,
      expiresAt: new Date(loginCodeExpiresAt(code.now)),
    });
  });
}

/** OneTimeCodeService::findLive: the newest unconsumed, unexpired code of exactly this address and purpose. */
export async function findLiveLoginCode(
  db: Executor,
  email: EmailAddress,
  purpose: LoginCodePurpose,
  now: Instant,
): Promise<LiveLoginCode | undefined> {
  const rows = await db
    .select({ id: loginCodes.id, codeHash: loginCodes.codeHash })
    .from(loginCodes)
    .where(
      and(
        eq(loginCodes.email, email),
        eq(loginCodes.purpose, purpose),
        isNull(loginCodes.consumedAt),
        gt(loginCodes.expiresAt, new Date(now)),
      ),
    )
    .orderBy(desc(loginCodes.id))
    .limit(1);
  return liveRows.parse(rows)[0];
}

/**
 * OneTimeCodeService::claim: consumes the code if it is still unconsumed
 * and unexpired, in one statement, so of two racing verifies (or a verify
 * racing the code's expiry) exactly one wins. True for the winner.
 */
export async function claimLoginCode(
  db: Executor,
  id: number,
  now: Instant,
): Promise<boolean> {
  const at = new Date(now);
  const claimed = await db
    .update(loginCodes)
    .set({ consumedAt: at })
    .where(
      and(
        eq(loginCodes.id, id),
        isNull(loginCodes.consumedAt),
        gt(loginCodes.expiresAt, at),
      ),
    )
    .returning({ id: loginCodes.id });
  return claimed.length === 1;
}
```

- [ ] **Step 4: Write `packages/db/src/account/sessions.ts`**

```ts
import {
  adminLevelInvariant,
  personNameInvariant,
  sessionExpiresAt,
  type AuditLoginMethod,
  type Instant,
  type PlayerId,
} from '@sportbet/domain';
import { and, eq, gt } from 'drizzle-orm';
import { z } from 'zod';
import type { Executor } from '../client';
import { keyOf, playerOf } from '../edge';
import { players } from '../player/schema';
import { auditLogins, playerSettings, sessions } from './schema';

/** The player behind a live session, and what the shell and the context read of them. */
export interface SignedInPlayer {
  readonly player: PlayerId;
  readonly name: string;
  readonly surname: string;
  readonly adminLevel: number;
  /** R-28: the last-used tournament's id, or null. */
  readonly lastTournament: number | null;
}

const signedInRows = z.array(
  z.object({
    player: z.int(),
    name: personNameInvariant.schema,
    surname: personNameInvariant.schema,
    adminLevel: adminLevelInvariant.schema.nullable(),
    lastTournament: z.int().nullable(),
  }),
);

/** Starts a session for the player: last seen now, ending 90 days on (R-44). */
export async function createSession(
  db: Executor,
  session: {
    readonly player: PlayerId;
    readonly tokenHash: string;
    readonly now: Instant;
  },
): Promise<void> {
  const now = new Date(session.now);
  await db.insert(sessions).values({
    tokenHash: session.tokenHash,
    playerId: keyOf(session.player, 'player'),
    createdAt: now,
    lastSeenAt: now,
    expiresAt: new Date(sessionExpiresAt(session.now)),
  });
}

/**
 * The signed-in player of the session whose token hashes to `tokenHash`,
 * if it has not ended by `now`. An account with no settings row is an
 * impossible state (the reader, the seed and registration write one with
 * every account): it throws.
 */
export async function findSignedInPlayer(
  db: Executor,
  tokenHash: string,
  now: Instant,
): Promise<SignedInPlayer | undefined> {
  const rows = await db
    .select({
      player: players.id,
      name: players.name,
      surname: players.surname,
      adminLevel: playerSettings.adminLevel,
      lastTournament: playerSettings.lastTournamentId,
    })
    .from(sessions)
    .innerJoin(players, eq(players.id, sessions.playerId))
    .leftJoin(playerSettings, eq(playerSettings.playerId, players.id))
    .where(
      and(eq(sessions.tokenHash, tokenHash), gt(sessions.expiresAt, new Date(now))),
    )
    .limit(1);
  const [row] = signedInRows.parse(rows);
  if (row === undefined) return undefined;
  if (row.adminLevel === null) {
    throw new Error(
      `sessions: player ${String(row.player)} has no player_settings row`,
    );
  }
  return {
    player: playerOf(row.player),
    name: row.name,
    surname: row.surname,
    adminLevel: row.adminLevel,
    lastTournament: row.lastTournament,
  };
}

/**
 * R-44: a visit at `now` extends the session to 90 days from it. A session
 * that has already ended is not revived. True if the session is live.
 */
export async function touchSession(
  db: Executor,
  tokenHash: string,
  now: Instant,
): Promise<boolean> {
  const at = new Date(now);
  const touched = await db
    .update(sessions)
    .set({ lastSeenAt: at, expiresAt: new Date(sessionExpiresAt(now)) })
    .where(and(eq(sessions.tokenHash, tokenHash), gt(sessions.expiresAt, at)))
    .returning({ id: sessions.id });
  return touched.length === 1;
}

/** Ends one session (sign-out on this browser). */
export async function deleteSession(
  db: Executor,
  tokenHash: string,
): Promise<void> {
  await db.delete(sessions).where(eq(sessions.tokenHash, tokenHash));
}

/** AuditLoginsController::insertAuditLogin: who signed in, how, when. */
export async function recordLogin(
  db: Executor,
  login: {
    readonly player: PlayerId;
    readonly method: AuditLoginMethod;
    readonly at: Instant;
  },
): Promise<void> {
  await db.insert(auditLogins).values({
    playerId: keyOf(login.player, 'player'),
    method: login.method,
    at: new Date(login.at),
  });
}
```

If the owner's answer to Q3 is "every device", add here, and call it from Task 15's `/logout` instead of `deleteSession`:

```ts
/** Ends every session of the player behind `tokenHash` (sign-out everywhere, Q3). */
export async function deleteSessionsOfPlayerBehind(
  db: Executor,
  tokenHash: string,
): Promise<void> {
  const [row] = await db
    .select({ player: sessions.playerId })
    .from(sessions)
    .where(eq(sessions.tokenHash, tokenHash));
  if (row !== undefined) {
    await db.delete(sessions).where(eq(sessions.playerId, row.player));
  }
}
```

with a test in `sessions.test.ts`: two sessions of ADA, `deleteSessionsOfPlayerBehind(db, HASH)`, neither found.

- [ ] **Step 5: Export them**

In `packages/db/src/index.ts`, add:

```ts
export {
  claimLoginCode,
  findLiveLoginCode,
  issueLoginCode,
  type LiveLoginCode,
  type NewLoginCode,
} from './account/login-codes';
export {
  createSession,
  deleteSession,
  findSignedInPlayer,
  recordLogin,
  touchSession,
  type SignedInPlayer,
} from './account/sessions';
```

- [ ] **Step 6: Run them to see them pass**

Run: `pnpm --filter @sportbet/db exec vitest run test/login-codes.test.ts test/sessions.test.ts`
Expected: PASS, 10 and 7 tests. (In `login-codes.test.ts`, the `issue` helper's `'login' as const` default is a const assertion, which lint allows.)

- [ ] **Step 7: Hand to the lead.** Files above; `pnpm format && pnpm lint && pnpm --filter @sportbet/db typecheck` clean. Commit message: `feat(db): login codes, sessions and sign-in records, as OneTimeCodeService (#16)`.

---

### Task 8 (backend-dev): Throttle windows, and pruning sign-in state **(sensitive)**

**Files:**
- Create: `packages/db/src/account/rate-limits.ts`
- Modify: `packages/db/src/index.ts`
- Test: `packages/db/test/rate-limits.test.ts`

Laravel's `RateLimiter` as sportbet's throttles use it: a fixed window opened by the first hit (`hit` adds the `:timer` and the counter together), `tooManyAttempts` refuses once the count has reached the maximum while the window lasts and does not count the refused attempt, and a lapsed window starts again from zero. `availableIn` is the seconds until the window ends.

- [ ] **Step 1: Write the failing test**

`packages/db/test/rate-limits.test.ts`:

```ts
import { emailAddress, secondsAfter } from '@sportbet/domain';
import { at, unwrap } from '@sportbet/domain/testing';
import { describe, expect, it } from 'vitest';
import { z } from 'zod';
import {
  attemptRateLimit,
  createSession,
  issueLoginCode,
  pruneSignInState,
} from '../src';
import { useTestDatabase } from '../src/testing';
import { ADA, saveWorld } from './world';

const { db, client } = useTestDatabase();

const NOW = at('2026-10-05T12:00:00Z');
const attempt = (seconds: number, key = 'k') =>
  attemptRateLimit(db, {
    key,
    maxAttempts: 3,
    windowSeconds: 600,
    now: secondsAfter(NOW, seconds),
  });

describe('attemptRateLimit', () => {
  it('allows the maximum, then refuses with the seconds left in the window', async () => {
    expect(await attempt(0)).toEqual({ allowed: true });
    expect(await attempt(10)).toEqual({ allowed: true });
    expect(await attempt(20)).toEqual({ allowed: true });
    expect(await attempt(30)).toEqual({
      allowed: false,
      retryAfterSeconds: 570,
    });
  });

  it("opens the window at the first hit, and a refused attempt does not count: once it lapses, the count starts again", async () => {
    for (const second of [0, 300, 590]) await attempt(second);
    expect(await attempt(599)).toEqual({ allowed: false, retryAfterSeconds: 1 });
    expect(await attempt(600)).toEqual({ allowed: true });
    expect(await attempt(601)).toEqual({ allowed: true });
    expect(await attempt(602)).toEqual({ allowed: true });
    expect(await attempt(603)).toEqual({
      allowed: false,
      retryAfterSeconds: 597,
    });
  });

  it('keeps each key to itself', async () => {
    for (const second of [0, 1, 2]) await attempt(second, 'one');
    expect(await attempt(3, 'one')).toMatchObject({ allowed: false });
    expect(await attempt(3, 'two')).toEqual({ allowed: true });
  });

  it('never allows more than the maximum, however many arrive at once', async () => {
    const verdicts = await Promise.all(
      Array.from({ length: 10 }, () => attempt(0)),
    );
    expect(verdicts.filter(({ allowed }) => allowed)).toHaveLength(3);
  });
});

it('prunes windows and codes past a day and sessions that have ended, and keeps the rest', async () => {
  await saveWorld(db);
  const email = unwrap(emailAddress('ada@example.test'));
  await attempt(0, 'old');
  await attemptRateLimit(db, {
    key: 'new',
    maxAttempts: 3,
    windowSeconds: 600,
    now: secondsAfter(NOW, 2 * 86_400),
  });
  await issueLoginCode(db, { email, purpose: 'login', codeHash: 'old', now: NOW });
  await issueLoginCode(db, {
    email,
    purpose: 'registration',
    codeHash: 'new',
    now: secondsAfter(NOW, 2 * 86_400),
  });
  await createSession(db, { player: ADA, tokenHash: 'a'.repeat(64), now: NOW });
  await createSession(db, {
    player: ADA,
    tokenHash: 'b'.repeat(64),
    now: secondsAfter(NOW, 2 * 86_400),
  });
  await pruneSignInState(db, secondsAfter(NOW, 91 * 86_400));
  const left = await client.query(
    `select (select string_agg(key, ',') from rate_limits) as windows,
            (select string_agg(code_hash, ',') from login_codes) as codes,
            (select string_agg(left(token_hash, 1), ',') from sessions) as sessions`,
  );
  expect(
    z
      .array(
        z.object({
          windows: z.string().nullable(),
          codes: z.string().nullable(),
          sessions: z.string().nullable(),
        }),
      )
      .parse(left.rows),
  ).toEqual([{ windows: null, codes: null, sessions: 'b' }]);
});
```

(At 91 days every window and code is more than a day old, the first session ended at day 90, the second ends at day 92.)

- [ ] **Step 2: Run it to see it fail**

Run: `pnpm --filter @sportbet/db exec vitest run test/rate-limits.test.ts`
Expected: FAIL - `attemptRateLimit` and `pruneSignInState` are not exported by `../src`.

- [ ] **Step 3: Write `packages/db/src/account/rate-limits.ts`**

```ts
import { secondsAfter, type Instant } from '@sportbet/domain';
import { eq, lt } from 'drizzle-orm';
import { z } from 'zod';
import type { Executor } from '../client';
import { loginCodes, rateLimits, sessions } from './schema';

export interface RateLimitAttempt {
  /** The limit's key, hashed by the caller: no address is stored. */
  readonly key: string;
  readonly maxAttempts: number;
  readonly windowSeconds: number;
  readonly now: Instant;
}

export type RateLimitVerdict =
  | { readonly allowed: true }
  | { readonly allowed: false; readonly retryAfterSeconds: number };

const windowRows = z.array(
  z.object({ windowStartedAt: z.date(), hits: z.int() }),
);

/**
 * One attempt against one limit, as Laravel's ThrottleRequests makes it
 * (tooManyAttempts, then hit): refused, uncounted, while the window holds
 * the maximum; otherwise counted, a lapsed window starting afresh at
 * `now`. The row is locked for the decision, so racing attempts take
 * turns and never pass the maximum.
 */
export async function attemptRateLimit(
  db: Executor,
  attempt: RateLimitAttempt,
): Promise<RateLimitVerdict> {
  const now = new Date(attempt.now);
  return db.transaction(async (tx) => {
    await tx
      .insert(rateLimits)
      .values({ key: attempt.key, windowStartedAt: now, hits: 0 })
      .onConflictDoNothing({ target: rateLimits.key });
    const [row] = windowRows.parse(
      await tx
        .select({
          windowStartedAt: rateLimits.windowStartedAt,
          hits: rateLimits.hits,
        })
        .from(rateLimits)
        .where(eq(rateLimits.key, attempt.key))
        .for('update'),
    );
    if (row === undefined) {
      throw new Error('rate_limits: the window just ensured is missing');
    }
    const endsAt = row.windowStartedAt.getTime() + attempt.windowSeconds * 1000;
    const lapsed = endsAt <= attempt.now;
    const hits = lapsed ? 0 : row.hits;
    if (hits >= attempt.maxAttempts) {
      return {
        allowed: false,
        retryAfterSeconds: Math.floor((endsAt - attempt.now) / 1000),
      };
    }
    await tx
      .update(rateLimits)
      .set({
        windowStartedAt: lapsed ? now : row.windowStartedAt,
        hits: hits + 1,
      })
      .where(eq(rateLimits.key, attempt.key));
    return { allowed: true };
  });
}

const DAY_SECONDS = 86_400;

/**
 * Deletes what sign-in no longer needs: throttle windows and login codes
 * more than a day old, and sessions that have ended. Run after each code
 * request (Task 15), never in its answer.
 */
export async function pruneSignInState(
  db: Executor,
  now: Instant,
): Promise<void> {
  const dayAgo = new Date(secondsAfter(now, -DAY_SECONDS));
  await db.delete(rateLimits).where(lt(rateLimits.windowStartedAt, dayAgo));
  await db.delete(loginCodes).where(lt(loginCodes.expiresAt, dayAgo));
  await db.delete(sessions).where(lt(sessions.expiresAt, new Date(now)));
}
```

`secondsAfter` with a negative count is a plain subtraction (`instantSchema.parse(instant + seconds * 1000)`).

- [ ] **Step 4: Export them**

In `packages/db/src/index.ts`, add:

```ts
export {
  attemptRateLimit,
  pruneSignInState,
  type RateLimitAttempt,
  type RateLimitVerdict,
} from './account/rate-limits';
```

- [ ] **Step 5: Run it to see it pass**

Run: `pnpm --filter @sportbet/db exec vitest run test/rate-limits.test.ts && pnpm test:db`
Expected: PASS, 5 tests; the whole db suite passes.

- [ ] **Step 6: Hand to the lead.** Files above; `pnpm format && pnpm lint && pnpm --filter @sportbet/db typecheck` clean. Commit message: `feat(db): sign-in throttle windows, as Laravel's RateLimiter, and pruning (#16)`.

---

### Task 9 (backend-dev): The staging account

**Files:**
- Modify: `packages/db/src/seed/staging.ts`, `packages/db/src/bin/seed-staging.ts`
- Test: `packages/db/test/seed.test.ts`

Staging gets one account, with the owner's address from a secret (`STAGING_ACCOUNT_EMAIL`), so the owner can sign in there; it plays Euroleague 2026/27, so the player shell has a tournament to show. The E2E stack seeds the same account with a test address (Task 17).

- [ ] **Step 1: Write the failing test**

Replace `packages/db/test/seed.test.ts` with:

```ts
import { emailAddress, newTournamentSchema } from '@sportbet/domain';
import { unwrap } from '@sportbet/domain/testing';
import { expect, it } from 'vitest';
import { z } from 'zod';
import { listPlayers, listPlayerSettings, listTournaments } from '../src';
import {
  STAGING_ACCOUNT,
  STAGING_TOURNAMENTS,
  seedStaging,
} from '../src/seed/staging';
import { useTestDatabase } from '../src/testing';

const { db, client } = useTestDatabase();

const OWNER = unwrap(emailAddress('owner@example.test'));

it('seeds the staging tournaments, and running it again adds nothing', async () => {
  await seedStaging(db, null);
  await seedStaging(db, null);
  const listed = (await listTournaments(db)).map((tournament) =>
    newTournamentSchema.parse(tournament),
  );
  expect(listed).toEqual([...STAGING_TOURNAMENTS]);
  expect(await listPlayers(db)).toEqual([]);
});

it('seeds one account with the address given, playing Euroleague 2026/27, and running it again keeps one with the newest address', async () => {
  await seedStaging(db, OWNER);
  await seedStaging(db, unwrap(emailAddress('owner2@example.test')));
  const players = await listPlayers(db);
  expect(players).toMatchObject([
    {
      username: STAGING_ACCOUNT.username,
      email: 'owner2@example.test',
      name: STAGING_ACCOUNT.name,
      surname: STAGING_ACCOUNT.surname,
    },
  ]);
  expect(await listPlayerSettings(db)).toMatchObject([
    { locale: 'lt', adminLevel: 0, lastTournament: null },
  ]);
  const playing = await client.query(
    `select t.slug from tournament_players tp join tournaments t on t.id = tp.tournament_id`,
  );
  expect(
    z.array(z.object({ slug: z.string() })).parse(playing.rows),
  ).toEqual([{ slug: STAGING_ACCOUNT.plays }]);
});
```

- [ ] **Step 2: Run it to see it fail**

Run: `pnpm --filter @sportbet/db exec vitest run test/seed.test.ts`
Expected: FAIL - `STAGING_ACCOUNT` is not exported; `seedStaging` takes one argument.

- [ ] **Step 3: Write `packages/db/src/seed/staging.ts`**

```ts
import type { EmailAddress } from '@sportbet/domain';
import { playerSettings } from '../account/schema';
import type { Db } from '../client';
import { excluded } from '../edge';
import { players, tournamentPlayers } from '../player/schema';
import {
  findTournamentBySlug,
  insertTournaments,
  type NewTournament,
} from '../tournament/repository';

/** Staging's fake data. Never real players or real tournaments' results. */
export const STAGING_TOURNAMENTS: readonly NewTournament[] = [
  {
    slug: 'euroleague-2025-26',
    name: 'Euroleague 2025/26',
    format: 'euroleague',
    endsOn: '2026-05-24',
    standingsDeadlineRound: null,
    survival: true,
    standingsTableFinal: false,
  },
  {
    slug: 'euroleague-2026-27',
    name: 'Euroleague 2026/27',
    format: 'euroleague',
    endsOn: '2027-05-23',
    standingsDeadlineRound: null,
    survival: true,
    standingsTableFinal: false,
  },
];

/**
 * The one staging account: its address comes from STAGING_ACCOUNT_EMAIL (a
 * secret; the owner's on staging, a test address in CI's E2E stack), never
 * from this file. A player, not an admin: admin tiers are slice 13's.
 */
export const STAGING_ACCOUNT = {
  username: 'savininkas',
  name: 'Savininkas',
  surname: '',
  plays: 'euroleague-2026-27',
} as const;

/**
 * Inserts the staging tournaments, and, given an address, the staging
 * account, its settings and its place in one tournament. Running it again
 * keeps one account and moves it to the address given.
 */
export async function seedStaging(
  db: Db,
  accountEmail: EmailAddress | null,
): Promise<void> {
  await insertTournaments(db, STAGING_TOURNAMENTS);
  if (accountEmail === null) return;
  await db.transaction(async (tx) => {
    const [account] = await tx
      .insert(players)
      .values({
        username: STAGING_ACCOUNT.username,
        email: accountEmail,
        name: STAGING_ACCOUNT.name,
        surname: STAGING_ACCOUNT.surname,
      })
      .onConflictDoUpdate({
        target: players.username,
        set: { email: excluded(players.email) },
      })
      .returning({ id: players.id });
    const tournament = await findTournamentBySlug(tx, STAGING_ACCOUNT.plays);
    if (account === undefined || tournament === undefined) {
      throw new Error('seed: the staging account or its tournament is missing');
    }
    await tx
      .insert(playerSettings)
      .values({ playerId: account.id })
      .onConflictDoNothing({ target: playerSettings.playerId });
    await tx
      .insert(tournamentPlayers)
      .values({
        tournamentId: tournament.id,
        playerId: account.id,
        switchedOff: false,
        fillIns: 0,
      })
      .onConflictDoNothing({
        target: [tournamentPlayers.tournamentId, tournamentPlayers.playerId],
      });
  });
}
```

- [ ] **Step 4: Write `packages/db/src/bin/seed-staging.ts`**

```ts
import { emailAddress } from '@sportbet/domain';
import { createDb } from '../client';
import { databaseEnvSchema } from '../config';
import { seedStaging } from '../seed/staging';

const env = databaseEnvSchema.parse(process.env);

// Read by hand, not through a schema: a refusal must never print the value.
const typed = process.env['STAGING_ACCOUNT_EMAIL'] ?? '';
const address = typed === '' ? null : emailAddress(typed);
if (address !== null && !address.ok) {
  console.error('seed: STAGING_ACCOUNT_EMAIL is not an email address');
  process.exit(1);
}

const { db, close } = createDb(env.DATABASE_URL);
try {
  await seedStaging(db, address === null ? null : address.value);
  console.log(
    address === null
      ? 'seed: staging tournaments present; no STAGING_ACCOUNT_EMAIL, so no staging account'
      : 'seed: staging tournaments and the staging account present',
  );
} finally {
  await close();
}
```

- [ ] **Step 5: Run it to see it pass**

Run: `pnpm --filter @sportbet/db exec vitest run test/seed.test.ts && pnpm --filter @sportbet/db build`
Expected: PASS, 2 tests; the build writes `dist/seed-staging.mjs`.

- [ ] **Step 6: Hand to the lead.** Files above; `pnpm format && pnpm lint && pnpm --filter @sportbet/db typecheck` clean. Commit message: `feat(db): the staging account, its address from STAGING_ACCOUNT_EMAIL (#16)`.

---

### Task 10 (backend-dev): The reader loads accounts, and prints none of them **(sensitive)**

**Files:**
- Modify: `tools/migrate/src/read-columns.ts`, `tools/migrate/src/map.ts`, `tools/migrate/src/load.ts`, `tools/migrate/src/reconcile.ts`, `tools/migrate/README.md`
- Test: `tools/migrate/src/read-columns.test.ts`, `tools/migrate/src/reconcile.test.ts`, `tools/migrate/test/map.test.ts`, `tools/migrate/test/load.test.ts`, `tools/migrate/test/reader.test.ts`, `tools/migrate/test/reader-failures.test.ts`

The owner's consent (spec 4b, 2026-10-05): the reader reads `users.email`, `users.name` and `users.surname` into the throwaway Postgres only, never printed or logged, deleted after every run. Google ids wait for 4c. The synthetic dump already holds a sentinel name, surname, email and Google id on every user (`test/fixtures/sportbet-dump.ts`), so the fixture needs no change.

- [ ] **Step 1: Write the failing tests**

`tools/migrate/src/read-columns.test.ts` - replace `FORBIDDEN_COLUMNS` and its first test:

```ts
/** Sign-in material and Google's id (4c): never selected from any table. */
const FORBIDDEN_COLUMNS: readonly string[] = [
  'google_id',
  'remember_token',
  'ip_address',
  'password',
];
```

```ts
  it("reads a user's id, username, name, surname and email - the owner's consent for 4b - and nothing else", () => {
    expect(columnsOf('users')).toEqual([
      'id',
      'username',
      'name',
      'surname',
      'email',
    ]);
  });

  it("reads a user's switch, admin level and locale from user_settings", () => {
    expect(columnsOf('user_settings')).toEqual([
      'user_id',
      'active',
      'admin',
      'locale',
    ]);
  });
```

and rename the third test to `'never reads a Google id, token, IP address or password'`.

`tools/migrate/src/reconcile.test.ts` - in `stored()`, add `player_settings: rows,` after `players: rows,`.

`tools/migrate/test/load.test.ts` - in the first test's `toMatchObject`, add `player_settings: 4,` after `players: 4,`.

`tools/migrate/test/map.test.ts` - replace the test `'map: a player keeps only the id and the username'` with:

```ts
  it('map: a player carries the account the reader now reads, and their settings', () => {
    expect(mapped.players[0]).toEqual({
      id: '1',
      username: 'ada',
      email: 'sentinel.ada@example.invalid',
      name: 'Sentinel-Name-ada',
      surname: 'Sentinel-Surname-ada',
    });
    expect(mapped.settings.map(({ player: id }) => id)).toEqual([
      '1',
      '2',
      '3',
      '4',
    ]);
    expect(mapped.settings[0]).toEqual({
      player: '1',
      locale: 'lt',
      adminLevel: 0,
      lastTournament: null,
    });
  });
```

and add, after the test `'map: a blank username is refused without naming it, ...'`:

```ts
  it('map: an address sportbet did not store normalized is refused without naming it, never fixed, and the rows its player owns with it', () => {
    const mapped = map(
      changed('users', (rows) =>
        rows.map((row) =>
          row['id'] === IDS.player('cai')
            ? { ...row, email: 'Sentinel.Cai@example.invalid' }
            : row,
        ),
      ),
    );
    expect(countOf(mapped, 'users').refusals).toEqual([
      { reason: 'bad-email', row: '' },
    ]);
    expect(countOf(mapped, 'prediction_results').refused).toMatchObject({
      'depends-on-refused (bad-email)': 3,
    });
    expect(mapped.players.map(({ id }) => id)).toEqual(['1', '2', '4']);
  });

  it('map: two users whose addresses are equal once accents are dropped are both refused, neither chosen', () => {
    const mapped = map(
      changed('users', (rows) =>
        rows.map((row) =>
          row['id'] === IDS.player('ben')
            ? { ...row, email: 'sentinėl.ada@example.invalid' }
            : row,
        ),
      ),
    );
    expect(countOf(mapped, 'users').refused).toEqual({ 'email-collision': 2 });
    expect(countOf(mapped, 'users').refusals).toEqual([
      { reason: 'email-collision', row: '' },
      { reason: 'email-collision', row: '' },
    ]);
    expect(mapped.players.map(({ id }) => id)).toEqual(['3', '4']);
  });

  it('map: a user_settings row with a negative admin level refuses the player, and every row they own depends on it', () => {
    const mapped = map(
      changed('user_settings', (rows) =>
        rows.map((row) =>
          row['user_id'] === IDS.player('cai') ? { ...row, admin: -1 } : row,
        ),
      ),
    );
    expect(countOf(mapped, 'user_settings').refused).toEqual({
      'bad-admin-level': 1,
    });
    expect(countOf(mapped, 'users').refused).toEqual({
      'depends-on-refused (bad-admin-level)': 1,
    });
    expect(mapped.players.map(({ id }) => id)).toEqual(['1', '2', '4']);
  });
```

`tools/migrate/test/reader.test.ts` - add `GOLDEN` to the `@sportbet/domain/testing` import and `listPlayerSettings` to the `@sportbet/db` import; replace the test `'loads no sentinel into Postgres: a pg_dump of it holds none'` with:

```ts
  it("loads the loaded players' emails, names and surnames into the throwaway Postgres only, and no Google id, IP address or skipped user", () => {
    const url = new URL(result.kept?.url ?? '');
    const dumped = execFileSync(
      'docker',
      [
        'exec',
        '-e',
        'PGPASSWORD',
        result.kept?.containerId ?? '',
        'pg_dump',
        '--username',
        decodeURIComponent(url.username),
        url.pathname.slice(1),
      ],
      {
        encoding: 'utf8',
        windowsHide: true,
        env: { ...process.env, PGPASSWORD: decodeURIComponent(url.password) },
      },
    );
    expect(dumped).toContain('COPY public.players');
    const loaded = GOLDEN.players.flatMap((name) => [
      `sentinel.${name}@example.invalid`,
      `Sentinel-Name-${name}`,
      `Sentinel-Surname-${name}`,
    ]);
    expect(loaded.filter((sentinel) => !dumped.includes(sentinel))).toEqual([]);
    const never = SENTINELS.filter(
      (sentinel) =>
        !loaded.includes(sentinel) &&
        // eve plays nothing and fbfan only football: neither loads.
        (sentinel.startsWith('sentinel-google-') ||
          sentinel === '203.0.113.77' ||
          sentinel.includes('eve') ||
          sentinel.includes('fbfan')),
    );
    expect(never.length).toBeGreaterThan(0);
    expect(never.filter((sentinel) => dumped.includes(sentinel))).toEqual([]);
  });

  it("loads each loaded player's settings", async () => {
    expect(
      (await listPlayerSettings(database.db)).map(({ adminLevel, locale }) => ({
        adminLevel,
        locale,
      })),
    ).toEqual(GOLDEN.players.map(() => ({ adminLevel: 0, locale: 'lt' })));
  });
```

and in the test `'stores exactly the id and the username of a player'`, rename it `'stores a player as their id, username and account, and nothing more'` and expect `['id', 'username', 'email', 'name', 'surname']`.

`tools/migrate/test/reader-failures.test.ts` - make the load failure name which constraint it trips. Replace the hoisted `failing` and the `vi.mock` body's `if (failing.load)` block:

```ts
/** Which constraint the next load trips after writing, if any. */
type LoadFailure = 'username' | 'email' | null;

const failing = vi.hoisted(
  (): { load: LoadFailure; loseRow: boolean } => ({ load: null, loseRow: false }),
);
```

```ts
      if (failing.load === 'username') {
        // A duplicate username: the driver's detail quotes it.
        await args[0].execute(
          "insert into players (username, email, name, surname) select username, 'x' || email, name, surname from players order by id limit 1",
        );
      }
      if (failing.load === 'email') {
        // A second spelling of an address: the detail quotes the folded address.
        await args[0].execute(
          "insert into players (username, email, name, surname) select username || '-2', email, name, surname from players order by id limit 1",
        );
      }
```


In the `Case` interface replace `readonly loadFails?: boolean;` with `readonly loadFails?: 'username' | 'email';`; in `CASES`, change the case `'an exception during load'` to `loadFails: 'username',` and add after it:

```ts
  {
    name: 'a load where two players share an address once accents are dropped',
    fetch: () => writing(dump()),
    loadFails: 'email',
    problem:
      /^loading Postgres: a query failed: insert into players, SQLSTATE 23505, table players, constraint players_email_folded_unique$/,
  },
```

In the `it.each(CASES)` body replace `async ({ fetch, problem, loadFails = false, loadLosesRow = false }) => {` and `failing.load = loadFails;` with `async ({ fetch, problem, loadFails, loadLosesRow = false }) => {` and `failing.load = loadFails ?? null;`; in `afterEach`, `failing.load = null;`.

- [ ] **Step 2: Run the unit tests to see them fail**

Run: `pnpm --filter @sportbet/migrate exec vitest run src/read-columns.test.ts src/reconcile.test.ts`
Expected: FAIL - `columnsOf('users')` is `['id', 'username']`; `stored()` has a key `LOADED_INTO` does not know (typecheck) or the counts differ.

- [ ] **Step 3: Read the columns**

In `tools/migrate/src/read-columns.ts`, replace the `users` and `user_settings` entries with:

```ts
  users: z.object({
    id: id(),
    username: text('varchar(255)'),
    name: text('varchar(255)'),
    surname: text('varchar(255)'),
    email: text('varchar(255)'),
  }),
  user_settings: z.object({
    user_id: id(),
    active: whole('tinyint(1)'),
    admin: whole('tinyint'),
    locale: text('varchar(5)'),
  }),
```

and in the comment above `READ_COLUMNS`, replace the sentence "From `users` it reads the id and the username only - never a name, surname, email, Google id or remember token - so none of those ever reaches the reader's memory." with:

```
 * From `users` it reads the id, the username, the name, the surname and
 * the email - the owner's consent for slice 4b, into the throwaway
 * Postgres only - and never a Google id, remember token or password; from
 * `user_settings` the switch, the admin level and the locale.
```

- [ ] **Step 4: Map accounts and settings**

In `tools/migrate/src/map.ts`:

Add `foldEmail` and `type StoredPlayerSettings` to the `@sportbet/domain` import, and `type SportbetRow` to the `./read-columns` import.

In `Mapped`, replace the `players` line and add `settings`:

```ts
  /** Every loaded player: the id, the username and the account. */
  readonly players: readonly StoredPlayer[];
  /** Each loaded player's settings (user_settings: admin level, locale). */
  readonly settings: readonly StoredPlayerSettings[];
```

Replace everything from the comment `// users: the id and the username, nothing else` down to (not including) the comment `// leagues and league_members: who plays a tournament` with:

```ts
  // users: the id, the username and the account (spec 4b)
  const userFates = new Map<number, Fate>();
  const users = new Map<number, StoredPlayer>();
  for (const row of rows.users) {
    const mapped = sportbetColumns.player(row);
    if (mapped.ok) {
      users.set(row.id, mapped.value);
      userFates.set(row.id, LOADED);
    } else {
      userFates.set(row.id, refused(mapped.refusal));
      ledger.refuse('users', mapped.refusal);
    }
  }
  // Two users whose addresses are equal once accents are dropped cannot
  // both load: players_email_folded_unique refuses the second, as
  // sportbet's collation would have. Neither is chosen over the other and
  // neither address is changed (spec 4b): both are refused.
  const byFolded = new Map<string, number[]>();
  for (const [id, player] of users) {
    const key = foldEmail(player.email);
    byFolded.set(key, [...(byFolded.get(key) ?? []), id]);
  }
  for (const ids of byFolded.values()) {
    if (ids.length < 2) continue;
    for (const id of ids) {
      users.delete(id);
      userFates.set(id, refused('email-collision'));
      ledger.refuse('users', 'email-collision');
    }
  }

  // user_settings: one global switch per user, and the settings 4b reads
  const active = new Map<number, boolean>();
  const settings = new Map<number, StoredPlayerSettings>();
  const settingsRows = new Map<number, SportbetRow<'user_settings'>[]>();
  for (const row of rows.user_settings) {
    settingsRows.set(row.user_id, [
      ...(settingsRows.get(row.user_id) ?? []),
      row,
    ]);
  }
  /** What two rows of one user must agree on to count as one. */
  const settingsKey = (row: SportbetRow<'user_settings'>) =>
    `${String(row.active !== 0)}|${String(row.admin)}|${row.locale}`;
  const settingsFate = new Map<
    number,
    'kept' | 'duplicate' | 'refused' | 'unsettled'
  >();
  // Users kept although their settings cannot be read (refuseUnsettled).
  const unsettled = new Set<number>();
  /** Refuses a user's settings rows, and the user with them if they loaded. */
  const refuseSettings = (
    user: number,
    values: readonly unknown[],
    reason: string,
  ) => {
    values.forEach(() => {
      ledger.refuse('user_settings', reason);
    });
    if (userFates.get(user)?.kind === 'loaded') {
      userFates.set(user, refused(reason));
      users.delete(user);
      ledger.refuse('users', dependsOn(reason));
    }
    settingsFate.set(user, 'refused');
  };
  for (const [user, values] of settingsRows) {
    if (userFates.get(user) === undefined) {
      values.forEach(() => {
        ledger.refuse('user_settings', 'orphan');
      });
      continue;
    }
    const [first] = values;
    if (first === undefined) continue;
    if (new Set(values.map(settingsKey)).size > 1) {
      if (!refuseUnsettled.has(user)) {
        unsettled.add(user);
        settingsFate.set(user, 'unsettled');
        continue;
      }
      refuseSettings(user, values, 'duplicate-key');
      continue;
    }
    const mappedSettings = sportbetColumns.settings({
      player: playerOf(user),
      admin: first.admin,
      locale: first.locale,
    });
    if (!mappedSettings.ok) {
      refuseSettings(user, values, mappedSettings.refusal);
      continue;
    }
    active.set(user, first.active !== 0);
    settings.set(user, mappedSettings.value);
    settingsFate.set(user, values.length > 1 ? 'duplicate' : 'kept');
  }
  // A user with no user_settings row: whether they are switched off cannot
  // be read, so the player is refused rather than guessed active.
  for (const [user, fate] of userFates) {
    if (fate.kind === 'loaded' && !active.has(user)) {
      if (!refuseUnsettled.has(user)) {
        unsettled.add(user);
        continue;
      }
      userFates.set(user, refused('player-without-settings'));
      users.delete(user);
      ledger.refuse('users', 'player-without-settings');
    }
  }

```

(An unsettled user - kept in the first pass only - has no settings row mapped; `mapSportbet` discards that pass, so `settings` is complete for every loaded player of the second.)

In `mappedRows`, add after `players: ...,`:

```ts
    settings: [...loadedUsers]
      .sort((a, b) => a - b)
      .flatMap((id) => {
        const each = settings.get(id);
        return each === undefined ? [] : [each];
      }),
```

- [ ] **Step 5: Load and reconcile the settings**

In `tools/migrate/src/load.ts`, add `savePlayerSettings,` to the `@sportbet/db` import and, after `await savePlayers(tx, mapped.players);`:

```ts
    await savePlayerSettings(tx, mapped.settings);
```

In `tools/migrate/src/reconcile.ts`, change `user_settings: 'players',` to `user_settings: 'player_settings',`, and in the comment above `LOADED_INTO` replace "each user's one player (and one `user_settings` row, whose `active` becomes the player's switch in each tournament)" with "each user's one player, and each user's one `user_settings` row, which becomes the player's settings (its `active` the player's switch in each tournament)".

- [ ] **Step 6: The guarantees table**

In `tools/migrate/README.md`, replace the row **Emails and names dropped.** with:

```
| **Emails and names: in the throwaway Postgres only.** | The owner's consent for slice 4b (2026-10-05). `src/read-columns.ts` is the only place a sportbet column is named: from `users` it reads `id`, `username`, `name`, `surname` and `email`, and never a Google id, remember token or password; nothing is read from the audit or sign-in tables. They load into the run's own Postgres - deleted with it, or kept on this PC only with `--keep` - and nowhere else. The load report never holds a username, name, email or player id (with `--parity`, the parity report may name players by username - see "Parity"): every reported problem is the stage plus fixed text, a Zod or query summary without values, or an error's class (`src/problem.ts`); a refused address is counted by reason (`bad-email`, `email-collision`), never shown. | `test/reader.test.ts` (no sentinel or `@` in the report or the JSON report; a `pg_dump` of the loaded Postgres holds the loaded players' emails and names and no Google id, IP address or skipped user's); `src/problem.test.ts`; `test/reader-failures.test.ts` (no sentinel or `@` on any failure path, a folded-address collision at load included) |
```

and in "Verifying after a run", replace "check `\d players` has two columns (`id`, `username`), or `pg_dump` it and search for an `@`" with "check `\d players` has five columns (`id`, `username`, `email`, `name`, `surname`) and that nothing else holds an `@`: `pg_dump` it and search".

- [ ] **Step 7: Run the reader's suites**

```bash
docker ps --filter label=sportbet-migrate --format '{{.ID}}' | wc -l
pnpm --filter @sportbet/migrate typecheck
pnpm test:migrate
```

Expected: `0` (nothing else running it); typecheck clean; PASS - the new map cases, the load's `player_settings: 4`, the end-to-end reader (exit 1 as before: the fixture's refusals), its pg_dump test, and every failure path, the new one included, with no sentinel and no `@` in any output. Time-box: stop and report if the run passes 15 minutes.

- [ ] **Step 8: Hand to the lead.** Files above; `pnpm format && pnpm lint` clean. Commit message: `feat(migrate): load players' emails and names into the throwaway Postgres, print none (#16)`.

---

### Task 11 (web-dev): The environment, the mailer and the code mail **(sensitive)**

**Files:**
- Modify: `apps/web/src/env.ts`, `apps/web/src/token-guard.test.ts`
- Create: `apps/web/src/server/mail/mail.ts`, `mailpit.ts`, `resend.ts`, `allow-list.ts`, `create-mailer.ts`, `login-code-mail.ts` (all under `apps/web/src/server/mail/`)
- Test: `apps/web/src/env.test.ts`, `apps/web/src/server/mail/mailer.test.ts`, `apps/web/src/server/mail/login-code-mail.test.ts`

Decision 8 as amended: Mailpit in CI and local runs, Resend to an allow-list on staging, Resend on production. Missing configuration stops the server at start (`instrumentation-node.ts` already parses `env()` there) - stronger than sportbet's critical log on a missing key, and there is no log-only mailer to refuse.

- [ ] **Step 1: Write the failing tests**

`apps/web/src/env.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import { mailEnvSchema } from './env';

const FROM = { MAIL_FROM_ADDRESS: 'noreply@sportbet.lt' };
const KEY = { RESEND_API_KEY: 're_test_123' };

describe('mailEnvSchema', () => {
  it('takes Mailpit with its URL', () => {
    expect(
      mailEnvSchema.safeParse({
        MAIL_TRANSPORT: 'mailpit',
        MAILPIT_URL: 'http://mailpit:8025',
        ...FROM,
      }).success,
    ).toBe(true);
  });

  it('refuses Resend without a key, and a key that is not one', () => {
    expect(
      mailEnvSchema.safeParse({ MAIL_TRANSPORT: 'resend', ...FROM }).success,
    ).toBe(false);
    expect(
      mailEnvSchema.safeParse({
        MAIL_TRANSPORT: 'resend',
        RESEND_API_KEY: 'sk_live_1',
        ...FROM,
      }).success,
    ).toBe(false);
  });

  it("reads staging's allow-list as normalized addresses, and refuses an empty or bad one", () => {
    const parsed = mailEnvSchema.parse({
      MAIL_TRANSPORT: 'resend-allow-list',
      MAIL_ALLOWED_RECIPIENTS: ' Owner@Example.LT ,second@example.lt',
      ...KEY,
      ...FROM,
    });
    expect(parsed).toMatchObject({
      MAIL_ALLOWED_RECIPIENTS: ['owner@example.lt', 'second@example.lt'],
    });
    for (const MAIL_ALLOWED_RECIPIENTS of ['', 'owner', 'a@b,,c@d']) {
      expect(
        mailEnvSchema.safeParse({
          MAIL_TRANSPORT: 'resend-allow-list',
          MAIL_ALLOWED_RECIPIENTS,
          ...KEY,
          ...FROM,
        }).success,
      ).toBe(false);
    }
  });

  it('refuses a sender that is not a lower-case address', () => {
    expect(
      mailEnvSchema.safeParse({
        MAIL_TRANSPORT: 'resend',
        ...KEY,
        MAIL_FROM_ADDRESS: 'SportBet <noreply@sportbet.lt>',
      }).success,
    ).toBe(false);
  });
});
```

`apps/web/src/server/mail/mailer.test.ts`:

```ts
import { emailAddress } from '@sportbet/domain';
import { unwrap } from '@sportbet/domain/testing';
import { describe, expect, it, vi } from 'vitest';
import { allowListMailer } from './allow-list';
import { createMailer } from './create-mailer';
import { MailDeliveryError, type Fetch, type OutgoingMail } from './mail';
import { mailpitMailer } from './mailpit';
import { resendMailer } from './resend';

const OWNER = unwrap(emailAddress('owner@example.lt'));
const MAIL: OutgoingMail = {
  to: OWNER,
  subject: 'Jūsų prisijungimo kodas',
  html: '<p>12345678</p>',
  text: '12345678',
};

/** A fetch that answers `status` and records what it was asked. */
function fetchAnswering(status: number) {
  const calls: { url: string; init: RequestInit }[] = [];
  const fetchFn: Fetch = (url, init) => {
    calls.push({ url: url.toString(), init });
    return Promise.resolve(new Response('{}', { status }));
  };
  return { calls, fetchFn };
}

const bodyOf = (init: RequestInit | undefined): unknown =>
  JSON.parse(typeof init?.body === 'string' ? init.body : '');

describe('mailpitMailer', () => {
  it("posts the message to Mailpit's send API, from SportBet", async () => {
    const { calls, fetchFn } = fetchAnswering(200);
    await expect(
      mailpitMailer('http://mailpit:8025', 'noreply@sportbet.test', fetchFn).send(MAIL),
    ).resolves.toBe('sent');
    expect(calls[0]?.url).toBe('http://mailpit:8025/api/v1/send');
    expect(bodyOf(calls[0]?.init)).toEqual({
      From: { Email: 'noreply@sportbet.test', Name: 'SportBet' },
      To: [{ Email: 'owner@example.lt' }],
      Subject: 'Jūsų prisijungimo kodas',
      HTML: '<p>12345678</p>',
      Text: '12345678',
    });
  });

  it('throws its status only when Mailpit refuses', async () => {
    const { fetchFn } = fetchAnswering(500);
    await expect(
      mailpitMailer('http://mailpit:8025', 'noreply@sportbet.test', fetchFn).send(MAIL),
    ).rejects.toThrow(new MailDeliveryError('mailpit', 500));
  });
});

describe('resendMailer', () => {
  it("posts the message to Resend's API with the key, from SportBet", async () => {
    const { calls, fetchFn } = fetchAnswering(200);
    await resendMailer('re_test_123', 'noreply@sportbet.lt', fetchFn).send(MAIL);
    expect(calls[0]?.url).toBe('https://api.resend.com/emails');
    expect(calls[0]?.init.headers).toMatchObject({
      Authorization: 'Bearer re_test_123',
    });
    expect(bodyOf(calls[0]?.init)).toEqual({
      from: 'SportBet <noreply@sportbet.lt>',
      to: ['owner@example.lt'],
      subject: 'Jūsų prisijungimo kodas',
      html: '<p>12345678</p>',
      text: '12345678',
    });
  });

  it('throws with the status, and never the address, when Resend refuses', async () => {
    const { fetchFn } = fetchAnswering(422);
    const sending = resendMailer('re_test_123', 'noreply@sportbet.lt', fetchFn).send(MAIL);
    await expect(sending).rejects.toThrow('resend refused the message: HTTP 422');
    await expect(sending).rejects.not.toThrow(/owner@/);
  });
});

describe('allowListMailer', () => {
  it('passes a message to an allowed address on, and refuses any other, logging no address', async () => {
    const inner = { send: vi.fn(() => Promise.resolve('sent' as const)) };
    const warn = vi.fn();
    const mailer = allowListMailer(inner, [OWNER], warn);
    await expect(mailer.send(MAIL)).resolves.toBe('sent');
    const stranger = unwrap(emailAddress('stranger@example.lt'));
    await expect(mailer.send({ ...MAIL, to: stranger })).resolves.toBe(
      'refused',
    );
    expect(inner.send).toHaveBeenCalledTimes(1);
    expect(warn).toHaveBeenCalledWith(
      'mail: refused a message to an address not on the staging allow-list',
    );
    expect(JSON.stringify(warn.mock.calls)).not.toContain('@');
  });
});

it('createMailer builds the allow-listed Resend mailer for staging', async () => {
  const { calls, fetchFn } = fetchAnswering(200);
  const warn = vi.fn();
  const mailer = createMailer(
    {
      MAIL_TRANSPORT: 'resend-allow-list',
      RESEND_API_KEY: 're_test_123',
      MAIL_FROM_ADDRESS: 'noreply@sportbet.lt',
      MAIL_ALLOWED_RECIPIENTS: [OWNER],
    },
    fetchFn,
    warn,
  );
  await mailer.send(MAIL);
  await mailer.send({ ...MAIL, to: unwrap(emailAddress('x@example.lt')) });
  expect(calls.map(({ url }) => url)).toEqual(['https://api.resend.com/emails']);
  expect(warn).toHaveBeenCalledTimes(1);
});
```

`apps/web/src/server/mail/login-code-mail.test.ts`:

```ts
import { emailAddress } from '@sportbet/domain';
import { unwrap } from '@sportbet/domain/testing';
import { expect, it } from 'vitest';
import { loginCodeMail } from './login-code-mail';

const TO = unwrap(emailAddress('jonas@example.lt'));

// sportbet's LoginCodeMail and emails/login-code.blade.php (#76: the
// lifetime is stated from the constant the expiry is set from).
it("carries sportbet's subject, the code, its lifetime and the line for whoever did not ask", () => {
  const mail = loginCodeMail(TO, '01234567');
  expect(mail.to).toBe('jonas@example.lt');
  expect(mail.subject).toBe('Jūsų prisijungimo kodas');
  for (const part of [mail.html, mail.text]) {
    expect(part).toContain('01234567');
    expect(part).toContain(
      'Įveskite šį kodą, kad prisijungtumėte. Kodas galioja 5 min.',
    );
    expect(part).toContain('Jei neprašėte šio kodo, galite ignoruoti šį laišką.');
  }
  expect(mail.html).toContain('<html lang="lt">');
});

it('refuses anything but an eight-digit code: a programmer error', () => {
  expect(() => loginCodeMail(TO, '1234')).toThrow(/not an 8-digit code/);
});
```

In `apps/web/src/token-guard.test.ts`, add below `TOKEN_FILE`:

```ts
/**
 * The one file that writes colours itself: the login code mail. An inbox
 * reads no stylesheet and no token, so it inlines the colours of sportbet's
 * own mail template (emails/login-code.blade.php), and only those.
 */
const INBOX_FILE = join(SRC, 'server', 'mail', 'login-code-mail.ts');
const INBOX_COLOURS = [
  '#111',
  '#1a1a2e',
  '#555',
  '#888',
  '#f0f0f0',
  '#f8f8f8',
  '#fff',
  'rgba(0,0,0,.08)',
];
```

in `describe('every other source file')`, change `const files = sourceFiles(SRC).map((path) => ({` to `const files = sourceFiles(SRC).filter((path) => path !== INBOX_FILE).map((path) => ({`, and add at the end of the file:

```ts
describe('the login code mail', () => {
  it("inlines sportbet's mail colours, and no other", () => {
    const text = readFileSync(INBOX_FILE, 'utf8');
    const colours = new Set(
      text.match(/#[0-9a-f]{3,8}\b|rgba\([^)]*\)/gi) ?? [],
    );
    expect([...colours].sort()).toEqual([...INBOX_COLOURS].sort());
  });
});
```

- [ ] **Step 2: Run them to see them fail**

Run: `pnpm --filter @sportbet/web exec vitest run --config vitest.component.config.ts src/env.test.ts src/server/mail src/token-guard.test.ts`
Expected: FAIL - `mailEnvSchema` is not exported; `Failed to resolve import "./allow-list"` (and the others); the token guard cannot read `login-code-mail.ts`.

- [ ] **Step 3: The environment**

Replace `apps/web/src/env.ts` with:

```ts
import { databaseEnvSchema } from '@sportbet/db';
import {
  emailAddress,
  emailInvariant,
  type EmailAddress,
} from '@sportbet/domain';
import { z } from 'zod';

/**
 * AdSense's publisher id, set on production only (spec 4a, "Cookie consent
 * and ads"; production's is ca-pub-7290396604686794). Unset, "Sutinku" on
 * the cookie banner loads no ad: staging and every test run that way.
 */
const adsenseClientSchema = z
  .string()
  .regex(/^ca-pub-\d{16}$/, 'an AdSense publisher id: ca-pub- and 16 digits');

/**
 * The key that signs the pending sign-in cookie (server/sign-in/pending.ts):
 * at least 32 characters, per environment, never committed. The staging
 * deploy creates staging's (.github/workflows/ci.yml).
 */
const authSecretSchema = z.string().min(32, 'at least 32 characters');

/** A Resend API key. */
const resendKeySchema = z
  .string()
  .regex(/^re_[A-Za-z0-9_]+$/, 'a Resend API key: re_ and the key');

/** The sender's address, on the domain verified in Resend; the name is SportBet (server/mail/mail.ts). */
const mailFromSchema = emailInvariant.schema;

/** Staging's allow-list: one or more addresses, comma-separated, each normalized. */
const recipientsSchema = z
  .string()
  .transform((value, context): EmailAddress[] => {
    const addresses: EmailAddress[] = [];
    for (const part of value.split(',')) {
      const address = emailAddress(part);
      if (!address.ok) {
        context.addIssue({
          code: 'custom',
          message: 'one or more email addresses, comma-separated',
        });
        return z.NEVER;
      }
      addresses.push(address.value);
    }
    return addresses;
  });

/**
 * How mail leaves the app (decision 8 as amended, spec 4b): Mailpit's HTTP
 * API in CI's E2E stack and local runs, Resend to an allow-list on
 * staging, Resend on production. A missing or bad setting stops the
 * server at start, never at the first sign-in.
 */
export const mailEnvSchema = z.discriminatedUnion('MAIL_TRANSPORT', [
  z.object({
    MAIL_TRANSPORT: z.literal('mailpit'),
    MAILPIT_URL: z.url({ protocol: /^https?$/ }),
    MAIL_FROM_ADDRESS: mailFromSchema,
  }),
  z.object({
    MAIL_TRANSPORT: z.literal('resend'),
    RESEND_API_KEY: resendKeySchema,
    MAIL_FROM_ADDRESS: mailFromSchema,
  }),
  z.object({
    MAIL_TRANSPORT: z.literal('resend-allow-list'),
    RESEND_API_KEY: resendKeySchema,
    MAIL_FROM_ADDRESS: mailFromSchema,
    MAIL_ALLOWED_RECIPIENTS: recipientsSchema,
  }),
]);

export type MailEnv = z.infer<typeof mailEnvSchema>;

const envSchema = databaseEnvSchema
  .extend({
    ADSENSE_CLIENT: adsenseClientSchema.optional(),
    AUTH_SECRET: authSecretSchema,
  })
  .and(mailEnvSchema);

export type Env = z.infer<typeof envSchema>;

let parsed: Env | undefined;

/** The parsed environment. Throws a ZodError naming every bad variable. */
export function env(): Env {
  parsed ??= envSchema.parse(process.env);
  return parsed;
}
```

- [ ] **Step 4: The mailer port and its adapters**

`apps/web/src/server/mail/mail.ts`:

```ts
import type { EmailAddress } from '@sportbet/domain';

/** One message to one address. */
export interface OutgoingMail {
  readonly to: EmailAddress;
  readonly subject: string;
  readonly html: string;
  readonly text: string;
}

/** Sent, or refused by staging's allow-list. */
export type MailOutcome = 'sent' | 'refused';

/** Where mail leaves the app (create-mailer.ts picks the adapter). */
export interface Mailer {
  readonly send: (mail: OutgoingMail) => Promise<MailOutcome>;
}

/** The part of fetch the adapters use, so tests can stand in for it. */
export type Fetch = (url: URL, init: RequestInit) => Promise<Response>;

/** Every mail's sender name, as sportbet's config/mail.php commits it. */
export const SENDER_NAME = 'SportBet';

/**
 * A mail service refused a message. Its message names the service and the
 * HTTP status only: a response body can echo the address.
 */
export class MailDeliveryError extends Error {
  readonly service: string;
  readonly status: number;

  constructor(service: string, status: number) {
    super(`${service} refused the message: HTTP ${String(status)}`);
    this.name = 'MailDeliveryError';
    this.service = service;
    this.status = status;
  }
}
```

`apps/web/src/server/mail/mailpit.ts`:

```ts
import {
  MailDeliveryError,
  SENDER_NAME,
  type Fetch,
  type Mailer,
} from './mail';

/** Mailpit's HTTP send API (POST /api/v1/send), for CI's E2E stack and local runs. */
export function mailpitMailer(
  baseUrl: string,
  from: string,
  fetchFn: Fetch,
): Mailer {
  return {
    send: async (mail) => {
      const response = await fetchFn(new URL('/api/v1/send', baseUrl), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          From: { Email: from, Name: SENDER_NAME },
          To: [{ Email: mail.to }],
          Subject: mail.subject,
          HTML: mail.html,
          Text: mail.text,
        }),
      });
      await response.text();
      if (!response.ok) throw new MailDeliveryError('mailpit', response.status);
      return 'sent';
    },
  };
}
```

`apps/web/src/server/mail/resend.ts`:

```ts
import {
  MailDeliveryError,
  SENDER_NAME,
  type Fetch,
  type Mailer,
} from './mail';

const RESEND_EMAILS = 'https://api.resend.com/emails';

/**
 * Resend's REST API (POST /emails), as sportbet sends through its Laravel
 * driver: one request, so no SDK. The key goes in the header only.
 */
export function resendMailer(
  apiKey: string,
  from: string,
  fetchFn: Fetch,
): Mailer {
  return {
    send: async (mail) => {
      const response = await fetchFn(new URL(RESEND_EMAILS), {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${apiKey}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          from: `${SENDER_NAME} <${from}>`,
          to: [mail.to],
          subject: mail.subject,
          html: mail.html,
          text: mail.text,
        }),
      });
      await response.text();
      if (!response.ok) throw new MailDeliveryError('resend', response.status);
      return 'sent';
    },
  };
}
```

`apps/web/src/server/mail/allow-list.ts`:

```ts
import type { EmailAddress } from '@sportbet/domain';
import type { Mailer, MailOutcome } from './mail';

/**
 * Staging's mail (spec 4b): only an address on the allow-list - the
 * owner's - is mailed; any other is refused and logged, without the
 * address. Staging holds fake data only, so no real player is ever mailed.
 */
export function allowListMailer(
  inner: Mailer,
  allowed: readonly EmailAddress[],
  warn: (message: string) => void,
): Mailer {
  return {
    send: (mail) => {
      if (!allowed.includes(mail.to)) {
        warn('mail: refused a message to an address not on the staging allow-list');
        return Promise.resolve<MailOutcome>('refused');
      }
      return inner.send(mail);
    },
  };
}
```

`apps/web/src/server/mail/create-mailer.ts`:

```ts
import type { MailEnv } from '../../env';
import { allowListMailer } from './allow-list';
import type { Fetch, Mailer } from './mail';
import { mailpitMailer } from './mailpit';
import { resendMailer } from './resend';

/** The mailer the environment names (env.ts, mailEnvSchema). */
export function createMailer(
  config: MailEnv,
  fetchFn: Fetch = fetch,
  warn: (message: string) => void = (message) => {
    console.warn(message);
  },
): Mailer {
  switch (config.MAIL_TRANSPORT) {
    case 'mailpit':
      return mailpitMailer(config.MAILPIT_URL, config.MAIL_FROM_ADDRESS, fetchFn);
    case 'resend':
      return resendMailer(config.RESEND_API_KEY, config.MAIL_FROM_ADDRESS, fetchFn);
    case 'resend-allow-list':
      return allowListMailer(
        resendMailer(config.RESEND_API_KEY, config.MAIL_FROM_ADDRESS, fetchFn),
        config.MAIL_ALLOWED_RECIPIENTS,
        warn,
      );
  }
}
```

- [ ] **Step 5: The code mail**

`apps/web/src/server/mail/login-code-mail.ts`:

```ts
import {
  LOGIN_CODE_DIGITS,
  LOGIN_CODE_TTL_MINUTES,
  type EmailAddress,
} from '@sportbet/domain';
import type { OutgoingMail } from './mail';

const SUBJECT = 'Jūsų prisijungimo kodas';
const LEAD = `Įveskite šį kodą, kad prisijungtumėte. Kodas galioja ${String(LOGIN_CODE_TTL_MINUTES)} min.`;
const IGNORE = 'Jei neprašėte šio kodo, galite ignoruoti šį laišką.';
const CODE = new RegExp(`^\\d{${String(LOGIN_CODE_DIGITS)}}$`);

/**
 * sportbet's LoginCodeMail and emails/login-code.blade.php: the subject,
 * the lead stating the code's life from the constant its expiry is set
 * from (#76), the code, and the line for whoever did not ask. Its colours
 * are the template's own, inline - no inbox reads the app's tokens
 * (token-guard.test.ts allows them in this file only). The text part is
 * this app's, for clients that show no HTML.
 */
export function loginCodeMail(to: EmailAddress, code: string): OutgoingMail {
  if (!CODE.test(code)) {
    throw new Error(`loginCodeMail: not an ${String(LOGIN_CODE_DIGITS)}-digit code`);
  }
  const html = [
    '<!DOCTYPE html>',
    '<html lang="lt">',
    '<head>',
    '<meta charset="utf-8">',
    '<meta name="viewport" content="width=device-width, initial-scale=1">',
    '</head>',
    '<body style="font-family:sans-serif;background:#f0f0f0;margin:0;padding:20px">',
    '<div style="max-width:480px;margin:0 auto;background:#fff;border-radius:8px;overflow:hidden;box-shadow:0 2px 8px rgba(0,0,0,.08)">',
    '<div style="background:#1a1a2e;padding:18px 24px;text-align:center">',
    '<span style="color:#fff;font-size:1rem;font-weight:700;letter-spacing:.5px">SportBet</span>',
    '</div>',
    '<div style="padding:28px 24px">',
    `<h2 style="margin:0 0 8px;font-size:1.05rem;color:#111">${SUBJECT}</h2>`,
    `<p style="color:#555;font-size:.9rem;margin:0 0 20px">${LEAD}</p>`,
    '<div style="background:#f8f8f8;border-radius:8px;padding:16px 20px;text-align:center;margin-bottom:20px">',
    `<span style="font-weight:700;font-size:1.8rem;letter-spacing:.4rem">${code}</span>`,
    '</div>',
    `<p style="color:#888;font-size:.8rem;margin:0">${IGNORE}</p>`,
    '</div>',
    '</div>',
    '</body>',
    '</html>',
  ].join('\n');
  return {
    to,
    subject: SUBJECT,
    html,
    text: [SUBJECT, '', LEAD, '', code, '', IGNORE].join('\n'),
  };
}
```

- [ ] **Step 6: Run them to see them pass**

Run: `pnpm --filter @sportbet/web exec vitest run --config vitest.component.config.ts src/env.test.ts src/server/mail src/token-guard.test.ts`
Expected: PASS. (`'sent' as const` in the test is a const assertion, which lint allows.)

- [ ] **Step 7: Hand to the lead.** Files above; `pnpm format && pnpm lint && pnpm --filter @sportbet/web typecheck` clean. Commit message: `feat(web): mail through Mailpit, Resend, or Resend to staging's allow-list; the code mail (#16)`.

---

### Task 12 (web-dev): The sign-in's pieces: origin, address, input, cookies, hash, throttle **(sensitive)**

**Q2 must be answered first** (Task 0).

**Files:**
- Create (all under `apps/web/src/server/`): `clock.ts`; `request/same-origin.ts`, `request/client-ip.ts`, `request/form-input.ts`, `request/next-path.ts`; `session/session-token.ts`, `session/session-cookie.ts`; `sign-in/code-hash.ts`, `sign-in/pending.ts`, `sign-in/throttle.ts`, `sign-in/texts.ts`
- Test: `apps/web/src/server/request/request.test.ts`, `apps/web/src/server/session/session.test.ts`, `apps/web/src/server/sign-in/code-hash.test.ts`, `apps/web/src/server/sign-in/pending.test.ts`, `apps/web/src/server/sign-in/throttle.test.ts`

Pure pieces, each unit-tested; Tasks 13 and 15 assemble them.

- [ ] **Step 1: Write the failing tests**

`apps/web/src/server/request/request.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import { clientIp } from './client-ip';
import { formText, trimInput } from './form-input';
import { safeNextPath } from './next-path';
import { isSameOrigin } from './same-origin';

const headers = (values: Record<string, string>) => new Headers(values);

// #16: a state-changing request must come from this site.
describe('isSameOrigin', () => {
  it('takes an Origin naming this host, as forwarded or as sent', () => {
    expect(
      isSameOrigin(headers({ origin: 'https://sportbet.lt', host: 'sportbet.lt' })),
    ).toBe(true);
    expect(
      isSameOrigin(
        headers({
          origin: 'https://staging.vercel.app',
          host: 'internal.vercel',
          'x-forwarded-host': 'staging.vercel.app',
        }),
      ),
    ).toBe(true);
  });

  it('refuses another origin, and an opaque one', () => {
    expect(
      isSameOrigin(headers({ origin: 'https://evil.example', host: 'sportbet.lt' })),
    ).toBe(false);
    expect(isSameOrigin(headers({ origin: 'null', host: 'sportbet.lt' }))).toBe(
      false,
    );
  });

  it('with no Origin, takes Sec-Fetch-Site: same-origin and refuses anything else, or nothing', () => {
    expect(
      isSameOrigin(headers({ 'sec-fetch-site': 'same-origin', host: 'x' })),
    ).toBe(true);
    expect(
      isSameOrigin(headers({ 'sec-fetch-site': 'cross-site', host: 'x' })),
    ).toBe(false);
    expect(isSameOrigin(headers({ host: 'sportbet.lt' }))).toBe(false);
  });
});

describe('clientIp', () => {
  it('takes the first X-Forwarded-For address, as Vercel and Caddy set it', () => {
    expect(
      clientIp(headers({ 'x-forwarded-for': '203.0.113.7, 10.0.0.1' })),
    ).toBe('203.0.113.7');
    expect(clientIp(headers({}))).toBe('unknown');
  });
});

// Laravel's TrimStrings middleware (Str::trim) trims every field first.
describe('trimInput and formText', () => {
  it("trims ASCII whitespace, NUL and Laravel's invisible characters at either end, and nothing inside", () => {
    expect(trimInput(' \t jonas@example.lt​﻿\n')).toBe(
      'jonas@example.lt',
    );
    expect(trimInput('jo nas')).toBe('jo nas');
    expect(trimInput('\u{1d173}x\u{e0020}')).toBe('x');
  });

  it('reads a missing field, or a file, as empty', () => {
    const form = new FormData();
    form.set('email', '  ada@example.lt ');
    form.set('file', new Blob(['x']));
    expect(formText(form, 'email')).toBe('ada@example.lt');
    expect(formText(form, 'code')).toBe('');
    expect(formText(form, 'file')).toBe('');
  });
});

// #16: back only to a same-origin path, never the Referer as given.
describe('safeNextPath', () => {
  it('takes a path on this site', () => {
    expect(safeNextPath('/')).toBe('/');
    expect(safeNextPath('/tournament/euroleague-2026-27')).toBe(
      '/tournament/euroleague-2026-27',
    );
    expect(safeNextPath('/a?b=c')).toBe('/a?b=c');
  });

  it('refuses anything that could leave it', () => {
    for (const value of [
      '',
      'https://evil.example/',
      '//evil.example/',
      '/\\evil.example',
      '/\t/evil.example',
      'javascript:alert(1)',
      'tournament/x',
    ]) {
      expect(safeNextPath(value)).toBeNull();
    }
  });
});
```

`apps/web/src/server/session/session.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import {
  cleared,
  readSessionCookie,
  SESSION_COOKIE,
  SESSION_COOKIE_OPTIONS,
  sessionCookieValue,
} from './session-cookie';
import { hashSessionToken, newSessionToken } from './session-token';

describe('the session token', () => {
  it('is 32 random bytes, stored only as its SHA-256', () => {
    const token = newSessionToken();
    expect(token).toMatch(/^[A-Za-z0-9_-]{43}$/);
    expect(newSessionToken()).not.toBe(token);
    expect(hashSessionToken(token)).toMatch(/^[0-9a-f]{64}$/);
    expect(hashSessionToken(token)).toBe(hashSessionToken(token));
  });
});

describe('the session cookie', () => {
  it('#16: is __Host-, HttpOnly, Secure, SameSite=Lax, Path=/, 90 days (R-44)', () => {
    expect(SESSION_COOKIE).toBe('__Host-sb_session');
    expect(SESSION_COOKIE_OPTIONS).toEqual({
      httpOnly: true,
      secure: true,
      sameSite: 'lax',
      path: '/',
      maxAge: 90 * 86_400,
    });
    expect(cleared(SESSION_COOKIE_OPTIONS)).toEqual({
      ...SESSION_COOKIE_OPTIONS,
      maxAge: 0,
    });
  });

  it('carries the token and the UTC day it was last re-issued', () => {
    const token = newSessionToken();
    const value = sessionCookieValue({ token, day: '2026-10-05' });
    expect(readSessionCookie(value)).toEqual({ token, day: '2026-10-05' });
  });

  it('reads nothing from a cookie that is not one', () => {
    expect(readSessionCookie(undefined)).toBeNull();
    expect(readSessionCookie('nonsense')).toBeNull();
    expect(readSessionCookie(`${newSessionToken()}.yesterday`)).toBeNull();
  });
});
```

`apps/web/src/server/sign-in/code-hash.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import {
  DUMMY_CODE_HASH,
  generateLoginCode,
  hashLoginCode,
  loginCodeMatches,
  SCRYPT_COST,
} from './code-hash';

describe('a login code', () => {
  it('is eight digits from a cryptographic source', () => {
    const codes = Array.from({ length: 50 }, generateLoginCode);
    for (const code of codes) expect(code).toMatch(/^\d{8}$/);
    expect(new Set(codes).size).toBeGreaterThan(1);
  });

  it('is stored as a salted scrypt hash that matches it and nothing else', async () => {
    const hash = await hashLoginCode('01234567');
    expect(hash).toMatch(/^scrypt\$16384\$8\$1\$[A-Za-z0-9_-]+\$[A-Za-z0-9_-]+$/);
    expect(hash).not.toContain('01234567');
    expect(await hashLoginCode('01234567')).not.toBe(hash);
    expect(await loginCodeMatches('01234567', hash)).toBe(true);
    expect(await loginCodeMatches('01234568', hash)).toBe(false);
  });
});

// sportbet's #36 item 2 and #37 item 1: with no live code, verify still
// pays a full hash, at the same cost as a real one.
describe('DUMMY_CODE_HASH', () => {
  it('is a real scrypt hash at the cost real codes are hashed at', async () => {
    expect(DUMMY_CODE_HASH.split('$').slice(1, 4)).toEqual([
      String(SCRYPT_COST.N),
      String(SCRYPT_COST.r),
      String(SCRYPT_COST.p),
    ]);
    expect(await loginCodeMatches('no-live-code', DUMMY_CODE_HASH)).toBe(true);
  });

  it('matches no eight-digit code', async () => {
    expect(await loginCodeMatches('00000000', DUMMY_CODE_HASH)).toBe(false);
  });
});

it('throws on a stored hash that is not one: an impossible state', async () => {
  await expect(loginCodeMatches('01234567', 'plain')).rejects.toThrow(
    /not a scrypt hash/,
  );
});
```

`apps/web/src/server/sign-in/pending.test.ts`:

```ts
import { emailAddress } from '@sportbet/domain';
import { at, unwrap } from '@sportbet/domain/testing';
import { describe, expect, it } from 'vitest';
import { openPending, PENDING_COOKIE, PENDING_COOKIE_OPTIONS, sealPending } from './pending';

const SECRET = 'test-secret-test-secret-test-secret';
const PENDING = {
  email: unwrap(emailAddress('jonas@example.lt')),
  sentAt: at('2026-10-05T12:00:00Z'),
  next: '/tournament/euroleague-2026-27',
};

describe('the pending sign-in cookie', () => {
  it('is __Host-, HttpOnly, Secure, SameSite=Lax, two hours', () => {
    expect(PENDING_COOKIE).toBe('__Host-sb_signin');
    expect(PENDING_COOKIE_OPTIONS).toEqual({
      httpOnly: true,
      secure: true,
      sameSite: 'lax',
      path: '/',
      maxAge: 7200,
    });
  });

  it('opens to what was sealed', () => {
    expect(openPending(sealPending(PENDING, SECRET), SECRET)).toEqual(PENDING);
  });

  it('opens to nothing when changed, sealed with another key, or not one at all', () => {
    const sealed = sealPending(PENDING, SECRET);
    const [body = '', signature = ''] = sealed.split('.');
    const forged = `${Buffer.from(
      JSON.stringify({ email: 'other@example.lt', sentAt: '2026-10-05T12:00:00Z', next: null }),
    ).toString('base64url')}.${signature}`;
    expect(openPending(forged, SECRET)).toBeNull();
    const altered = `${signature.startsWith('A') ? 'B' : 'A'}${signature.slice(1)}`;
    expect(openPending(`${body}.${altered}`, SECRET)).toBeNull();
    expect(openPending(sealed, `${SECRET}-other`)).toBeNull();
    expect(openPending('nonsense', SECRET)).toBeNull();
    expect(openPending(undefined, SECRET)).toBeNull();
  });

  it('drops a where-to-go that is not a path on this site', () => {
    const sealed = sealPending({ ...PENDING, next: '//evil.example/' }, SECRET);
    expect(openPending(sealed, SECRET)?.next).toBeNull();
  });
});
```

`apps/web/src/server/sign-in/throttle.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import { throttledText } from './texts';
import { codeRequestLimits, codeVerifyLimits, hashKey } from './throttle';

// sportbet's AppServiceProvider: 'login-code-request' and 'login-code-verify'.
describe('the sign-in throttles', () => {
  it('a code request: 3 per 10 minutes per address, 10 per IP', () => {
    expect(codeRequestLimits('  Jonas@Example.LT ', '203.0.113.7')).toEqual([
      {
        key: 'login-code-request:email:jonas@example.lt',
        maxAttempts: 3,
        windowSeconds: 600,
      },
      {
        key: 'login-code-request:ip:203.0.113.7',
        maxAttempts: 10,
        windowSeconds: 600,
      },
    ]);
  });

  it("a blank address counts on its own IP key, not the shared one, nor one bucket for every blank", () => {
    expect(codeRequestLimits('', '203.0.113.7')[0]?.key).toBe(
      'login-code-request:blank-email-ip:203.0.113.7',
    );
  });

  it('a verify: 5 per 10 minutes per pending address, 15 per IP', () => {
    expect(codeVerifyLimits('jonas@example.lt', '203.0.113.7')).toEqual([
      {
        key: 'login-code-verify:email:jonas@example.lt',
        maxAttempts: 5,
        windowSeconds: 600,
      },
      {
        key: 'login-code-verify:ip:203.0.113.7',
        maxAttempts: 15,
        windowSeconds: 600,
      },
    ]);
    expect(codeVerifyLimits(null, '203.0.113.7')[0]?.key).toBe(
      'login-code-verify:blank-email-ip:203.0.113.7',
    );
  });

  it('stores a key only as its SHA-256', () => {
    expect(hashKey('login-code-request:email:jonas@example.lt')).toMatch(
      /^[0-9a-f]{64}$/,
    );
  });

  it("answers a refusal with sportbet's text and the minutes (bootstrap/app.php, #75)", () => {
    expect(throttledText(10)).toBe(
      'Per daug bandymų. Pabandykite dar kartą po 10 min.',
    );
  });
});
```

- [ ] **Step 2: Run them to see them fail**

Run: `pnpm --filter @sportbet/web exec vitest run --config vitest.component.config.ts src/server`
Expected: FAIL - `Failed to resolve import` for each new module (the mail tests still pass).

- [ ] **Step 3: The clock**

`apps/web/src/server/clock.ts`:

```ts
import { instantFrom, type Instant } from '@sportbet/domain';

/** An instant (or any millisecond count) as ISO-8601 UTC to the second, the form instantFrom reads. */
export function isoSecond(ms: number): string {
  return new Date(Math.floor(ms / 1000) * 1000)
    .toISOString()
    .replace('.000Z', 'Z');
}

/** The current moment, to the second, as the domain takes time: injected, never read inside it. */
export function now(): Instant {
  const parsed = instantFrom(isoSecond(Date.now()));
  if (!parsed.ok) throw new Error('clock: the current time is not an instant');
  return parsed.value;
}
```

- [ ] **Step 4: The request's pieces**

`apps/web/src/server/request/same-origin.ts`:

```ts
/** The host an Origin header names, or null for an opaque or malformed one. */
function hostOf(origin: string): string | null {
  try {
    return new URL(origin).host;
  } catch {
    return null;
  }
}

/**
 * Whether a state-changing request comes from this site (#16): its Origin
 * names this host - as Next and Vercel forward it (`x-forwarded-host`) or
 * as sent (`host`); with no Origin, its Sec-Fetch-Site says same-origin;
 * with neither, it does not. Next's own check on Server Actions lets a
 * request without an Origin through, so every action asks this as well.
 */
export function isSameOrigin(headers: Headers): boolean {
  const origin = headers.get('origin');
  if (origin === null) return headers.get('sec-fetch-site') === 'same-origin';
  const host = hostOf(origin);
  if (host === null || host === '') return false;
  return [headers.get('x-forwarded-host'), headers.get('host')].some(
    (value) => value !== null && value.split(',')[0]?.trim() === host,
  );
}
```

`apps/web/src/server/request/client-ip.ts`:

```ts
/**
 * The client's address, for the per-IP throttles: the first entry of
 * X-Forwarded-For. Vercel and Caddy each overwrite what a client sends
 * there, and Next fills it from the socket when nothing stands in front.
 */
export function clientIp(headers: Headers): string {
  const first = headers.get('x-forwarded-for')?.split(',')[0]?.trim();
  return first === undefined || first === '' ? 'unknown' : first;
}
```

`apps/web/src/server/request/form-input.ts`:

```ts
const span = (from: number, to: number): number[] =>
  Array.from({ length: to - from + 1 }, (_, index) => from + index);

/**
 * What Laravel 12's TrimStrings middleware (Str::trim) strips from either
 * end of every field before sportbet's controllers read it: ASCII
 * whitespace, NUL, and Str::INVISIBLE_CHARACTERS.
 */
const TRIMMED: ReadonlySet<number> = new Set([
  0x00,
  0x09,
  0x0a,
  0x0b,
  0x0c,
  0x0d,
  0x20,
  0xa0,
  0xad,
  0x34f,
  0x61c,
  0x115f,
  0x1160,
  0x17b4,
  0x17b5,
  0x180e,
  ...span(0x2000, 0x200f),
  0x202f,
  0x205f,
  ...span(0x2060, 0x2065),
  ...span(0x206a, 0x206f),
  0x2800,
  0x3000,
  0x3164,
  0xfeff,
  0xffa0,
  0x1d159,
  ...span(0x1d173, 0x1d17a),
  0xe0020,
]);

const isTrimmed = (character: string | undefined) =>
  character !== undefined && TRIMMED.has(character.codePointAt(0) ?? -1);

/** A field as sportbet's controllers saw it: trimmed at both ends, by code point. */
export function trimInput(value: string): string {
  const characters = Array.from(value);
  let start = 0;
  let end = characters.length;
  while (start < end && isTrimmed(characters[start])) start += 1;
  while (end > start && isTrimmed(characters[end - 1])) end -= 1;
  return characters.slice(start, end).join('');
}

/** A form field's text, trimmed; empty for a field that is missing or a file. */
export function formText(form: FormData, name: string): string {
  const value = form.get(name);
  return typeof value === 'string' ? trimInput(value) : '';
}
```

`apps/web/src/server/request/next-path.ts`:

```ts
const BASE = 'http://sportbet.invalid';

/**
 * Where to go after sign-in, if `value` is a path on this site (#16: a
 * same-origin path, never the Referer as given): one leading '/', no
 * backslash, and it resolves to this origin. Null otherwise.
 */
export function safeNextPath(value: string): string | null {
  if (!value.startsWith('/') || value.startsWith('//') || value.includes('\\')) {
    return null;
  }
  try {
    const url = new URL(value, BASE);
    return url.origin === BASE ? `${url.pathname}${url.search}` : null;
  } catch {
    return null;
  }
}
```

- [ ] **Step 5: The session's token and cookie**

`apps/web/src/server/session/session-token.ts`:

```ts
import { createHash, randomBytes } from 'node:crypto';

/** A new session token: 32 random bytes, base64url. Only the cookie holds it. */
export function newSessionToken(): string {
  return randomBytes(32).toString('base64url');
}

/** What the database holds of a token: its SHA-256, hex. A token is random, so no slow hash is needed. */
export function hashSessionToken(token: string): string {
  return createHash('sha256').update(token).digest('hex');
}
```

`apps/web/src/server/session/session-cookie.ts`:

```ts
import { SESSION_LIFETIME_DAYS } from '@sportbet/domain';

/** #16: `__Host-`, so it is Secure, host-only and on '/'. */
export const SESSION_COOKIE = '__Host-sb_session';

/** #16 and R-44: HttpOnly, Secure, SameSite=Lax, Path=/, 90 days, set explicitly. */
export const SESSION_COOKIE_OPTIONS = {
  httpOnly: true,
  secure: true,
  sameSite: 'lax',
  path: '/',
  maxAge: SESSION_LIFETIME_DAYS * 86_400,
} as const;

/** A cookie's flags, as this app sets every one of its cookies. */
export interface CookieOptions {
  readonly httpOnly: boolean;
  readonly secure: true;
  readonly sameSite: 'lax';
  readonly path: '/';
  readonly maxAge: number;
}

/**
 * The options that clear a cookie: its own flags with Max-Age 0. Never
 * cookies().delete(), whose Set-Cookie drops Secure, which a browser then
 * refuses for a `__Host-` name, leaving the cookie in place.
 */
export function cleared(options: CookieOptions): CookieOptions {
  return { ...options, maxAge: 0 };
}

/** The cookie's value: the token, and the UTC day it was last re-issued (proxy.ts). */
export interface SessionCookie {
  readonly token: string;
  readonly day: string;
}

const VALUE = /^([A-Za-z0-9_-]{43})\.(\d{4}-\d{2}-\d{2})$/;

export function sessionCookieValue(cookie: SessionCookie): string {
  return `${cookie.token}.${cookie.day}`;
}

/** The cookie read back, or null for one that is missing or not this app's. */
export function readSessionCookie(
  value: string | undefined,
): SessionCookie | null {
  const parts = value === undefined ? null : VALUE.exec(value);
  const token = parts?.[1];
  const day = parts?.[2];
  return token === undefined || day === undefined ? null : { token, day };
}
```

- [ ] **Step 6: The code's hash**

`apps/web/src/server/sign-in/code-hash.ts`:

```ts
import { randomBytes, randomInt, scrypt, timingSafeEqual } from 'node:crypto';
import { LOGIN_CODE_DIGITS } from '@sportbet/domain';

/** scrypt's cost for a code: 2^14, block size 8, no parallelism - about 25 ms and 16 MiB. */
export const SCRYPT_COST = { N: 16_384, r: 8, p: 1 } as const;

const KEY_LENGTH = 32;
const SALT_LENGTH = 16;
const FORMAT =
  /^scrypt\$(\d+)\$(\d+)\$(\d+)\$([A-Za-z0-9_-]+)\$([A-Za-z0-9_-]+)$/;

/**
 * scrypt of 'no-live-code' (not eight digits, so no typed code equals it)
 * at SCRYPT_COST, with a fixed salt: what verify compares against when no
 * live code exists, so both branches pay one full hash (#36 item 2). Its
 * cost is read from it like any stored hash's, so it cannot drift from
 * the real ones' (#37 item 1); code-hash.test.ts proves it is real.
 */
export const DUMMY_CODE_HASH =
  'scrypt$16384$8$1$c3BvcnRiZXQtZHVtbXktbA$1CRkN_CFAEcMv9zlMH216XOHwQmlt70RrkRqQkiTBTQ';

function derive(
  code: string,
  salt: Buffer,
  cost: { readonly N: number; readonly r: number; readonly p: number },
): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    scrypt(code, salt, KEY_LENGTH, cost, (error, key) => {
      if (error === null) resolve(key);
      else reject(error);
    });
  });
}

/** A random code of LOGIN_CODE_DIGITS digits from a cryptographic source (sportbet's random_int). */
export function generateLoginCode(): string {
  return String(randomInt(0, 10 ** LOGIN_CODE_DIGITS)).padStart(
    LOGIN_CODE_DIGITS,
    '0',
  );
}

/** A code's stored form: `scrypt$N$r$p$salt$key`, the salt random per code. */
export async function hashLoginCode(code: string): Promise<string> {
  const salt = randomBytes(SALT_LENGTH);
  const key = await derive(code, salt, SCRYPT_COST);
  return [
    'scrypt',
    String(SCRYPT_COST.N),
    String(SCRYPT_COST.r),
    String(SCRYPT_COST.p),
    salt.toString('base64url'),
    key.toString('base64url'),
  ].join('$');
}

/**
 * Whether `code` is the code `stored` was made from: always one full
 * derivation at the stored hash's own cost, and a constant-time compare.
 * A stored value that is no scrypt hash is an impossible state: it throws.
 */
export async function loginCodeMatches(
  code: string,
  stored: string,
): Promise<boolean> {
  const [, n, r, p, salt, key] = FORMAT.exec(stored) ?? [];
  if (
    n === undefined ||
    r === undefined ||
    p === undefined ||
    salt === undefined ||
    key === undefined
  ) {
    throw new Error('login code hash: not a scrypt hash');
  }
  const expected = Buffer.from(key, 'base64url');
  const derived = await derive(code, Buffer.from(salt, 'base64url'), {
    N: Number(n),
    r: Number(r),
    p: Number(p),
  });
  return derived.length === expected.length && timingSafeEqual(derived, expected);
}
```

- [ ] **Step 7: The pending sign-in**

`apps/web/src/server/sign-in/pending.ts`:

```ts
import { createHmac, timingSafeEqual } from 'node:crypto';
import {
  instantFrom,
  storedEmailAddress,
  type EmailAddress,
  type Instant,
} from '@sportbet/domain';
import { z } from 'zod';
import { isoSecond } from '../clock';
import { safeNextPath } from '../request/next-path';

/**
 * A code in flight: the address the visitor typed, when the code went out,
 * and where to go after sign-in. A signed cookie, not session state
 * (decision 5); the code itself never leaves the server.
 */
export const PENDING_COOKIE = '__Host-sb_signin';

/** Two hours: sportbet's session lifetime, which held login_code_email. */
export const PENDING_COOKIE_OPTIONS = {
  httpOnly: true,
  secure: true,
  sameSite: 'lax',
  path: '/',
  maxAge: 2 * 60 * 60,
} as const;

/** /login's "open the dialog" for the next page (AuthenticatedSessionController's auth_dialog flash): read and cleared by the dialog. */
export const OPEN_SIGN_IN_COOKIE_OPTIONS = {
  httpOnly: false,
  secure: true,
  sameSite: 'lax',
  path: '/',
  maxAge: 60,
} as const;

export interface PendingSignIn {
  readonly email: EmailAddress;
  readonly sentAt: Instant;
  readonly next: string | null;
}

const payloadSchema = z.object({
  email: z.string(),
  sentAt: z.string(),
  next: z.string().nullable(),
});

const signatureOf = (body: string, secret: string) =>
  createHmac('sha256', secret).update(body).digest('base64url');

/** The cookie's value: the JSON, base64url, then its HMAC-SHA256 under AUTH_SECRET. */
export function sealPending(pending: PendingSignIn, secret: string): string {
  const body = Buffer.from(
    JSON.stringify({
      email: pending.email,
      sentAt: isoSecond(pending.sentAt),
      next: pending.next,
    }),
  ).toString('base64url');
  return `${body}.${signatureOf(body, secret)}`;
}

function decoded(body: string): unknown {
  try {
    const value: unknown = JSON.parse(Buffer.from(body, 'base64url').toString('utf8'));
    return value;
  } catch {
    return null;
  }
}

/** The pending sign-in, or null for a cookie that is missing, forged or not this app's. */
export function openPending(
  value: string | undefined,
  secret: string,
): PendingSignIn | null {
  const [body, signature, ...rest] = value?.split('.') ?? [];
  if (body === undefined || signature === undefined || rest.length > 0) {
    return null;
  }
  const expected = Buffer.from(signatureOf(body, secret));
  const given = Buffer.from(signature);
  if (expected.length !== given.length || !timingSafeEqual(expected, given)) {
    return null;
  }
  const payload = payloadSchema.safeParse(decoded(body));
  if (!payload.success) return null;
  const email = storedEmailAddress(payload.data.email);
  const sentAt = instantFrom(payload.data.sentAt);
  if (!email.ok || !sentAt.ok) return null;
  return {
    email: email.value,
    sentAt: sentAt.value,
    next: payload.data.next === null ? null : safeNextPath(payload.data.next),
  };
}
```

- [ ] **Step 8: The throttles and the texts**

`apps/web/src/server/sign-in/texts.ts`:

```ts
/**
 * The dialog's answers: sportbet's own (lang/lt.json), and, where sportbet
 * answered with Laravel's English validation messages, the owner's (Q2).
 */
export const SIGN_IN_TEXT = {
  /** Q2; sportbet: "The email field is required." */
  emailRequired: 'Įveskite el. pašto adresą.',
  /** Q2; sportbet: "The email field must be a valid email address." */
  emailInvalid: 'Įveskite teisingą el. pašto adresą.',
  /** Q2; sportbet: "The code field is required." */
  codeRequired: 'Įveskite kodą.',
  noPendingEmail: 'Pirmiausia įveskite el. pašto adresą.',
  wrongCode: 'Neteisingas arba pasibaigęs kodas.',
} as const;

/** bootstrap/app.php's answer to a throttled step (#75): the minutes until it lifts, at least one. */
export function throttledText(minutes: number): string {
  return `Per daug bandymų. Pabandykite dar kartą po ${String(minutes)} min.`;
}
```

If the owner's answer to Q2 differs, change only the three marked strings.

`apps/web/src/server/sign-in/throttle.ts`:

```ts
import { createHash } from 'node:crypto';
import { attemptRateLimit, type Executor } from '@sportbet/db';
import { normalizeEmail, type Instant } from '@sportbet/domain';

export interface ThrottleLimit {
  readonly key: string;
  readonly maxAttempts: number;
  readonly windowSeconds: number;
}

const TEN_MINUTES = 10 * 60;

/**
 * An address's key, or for a blank one its own per-IP key - not the
 * shared IP one, and not one bucket every blank request shares.
 */
const addressKey = (email: string, ip: string) =>
  email === '' ? `blank-email-ip:${ip}` : `email:${email}`;

/** AppServiceProvider's 'login-code-request': 3 per 10 minutes per address, 10 per IP. */
export function codeRequestLimits(
  typedEmail: string,
  ip: string,
): readonly ThrottleLimit[] {
  return [
    {
      key: `login-code-request:${addressKey(normalizeEmail(typedEmail), ip)}`,
      maxAttempts: 3,
      windowSeconds: TEN_MINUTES,
    },
    {
      key: `login-code-request:ip:${ip}`,
      maxAttempts: 10,
      windowSeconds: TEN_MINUTES,
    },
  ];
}

/** 'login-code-verify': 5 per 10 minutes per pending address (the code's own life twice over), 15 per IP. */
export function codeVerifyLimits(
  pendingEmail: string | null,
  ip: string,
): readonly ThrottleLimit[] {
  return [
    {
      key: `login-code-verify:${addressKey(pendingEmail ?? '', ip)}`,
      maxAttempts: 5,
      windowSeconds: TEN_MINUTES,
    },
    {
      key: `login-code-verify:ip:${ip}`,
      maxAttempts: 15,
      windowSeconds: TEN_MINUTES,
    },
  ];
}

/** What rate_limits holds of a key: its SHA-256, so no address is stored there. */
export function hashKey(key: string): string {
  return createHash('sha256').update(key).digest('hex');
}

export type ThrottleVerdict =
  | { readonly allowed: true }
  | { readonly allowed: false; readonly minutes: number };

/**
 * Laravel's ThrottleRequests::handleRequest: each limit in turn is checked
 * and then hit; the first already at its maximum refuses, and those before
 * it have counted the attempt. The minutes are the refusing window's rest,
 * rounded up, at least one.
 */
export async function throttle(
  db: Executor,
  limits: readonly ThrottleLimit[],
  now: Instant,
): Promise<ThrottleVerdict> {
  for (const limit of limits) {
    const verdict = await attemptRateLimit(db, {
      key: hashKey(limit.key),
      maxAttempts: limit.maxAttempts,
      windowSeconds: limit.windowSeconds,
      now,
    });
    if (!verdict.allowed) {
      return {
        allowed: false,
        minutes: Math.max(1, Math.ceil(verdict.retryAfterSeconds / 60)),
      };
    }
  }
  return { allowed: true };
}
```

- [ ] **Step 9: Run them to see them pass**

Run: `pnpm --filter @sportbet/web exec vitest run --config vitest.component.config.ts src/server`
Expected: PASS.

- [ ] **Step 10: Hand to the lead.** Files above; `pnpm format && pnpm lint && pnpm --filter @sportbet/web typecheck` clean. Commit message: `feat(web): sign-in's pieces - origin check, trimmed input, safe next path, session cookie, scrypt code hash, pending cookie, throttles (#16)`.

---

### Task 13 (web-dev): The request context, the player's view and the daily extension **(sensitive)**

**Files:**
- Create: `apps/web/src/server/request-context.ts`, `apps/web/src/server/shell-for.ts`, `apps/web/src/proxy.ts`
- Test: `apps/web/src/server/shell-for.test.ts` (the context and the proxy are proved end to end by Task 16's feature tests)

- [ ] **Step 1: Write the failing test**

`apps/web/src/server/shell-for.test.ts`:

```ts
import type { Tournament } from '@sportbet/domain';
import { player, roundNo } from '@sportbet/domain/testing';
import { describe, expect, it } from 'vitest';
import { guestView } from '../components/shell/shell-view';
import type { RequestContext } from './request-context';
import { shellPlayer, shellViewFor } from './shell-for';

const TOURNAMENT: Tournament = {
  id: 4,
  slug: 'euroleague-2026-27',
  name: 'Euroleague 2026/27',
  format: 'euroleague',
  endsOn: '2027-05-23',
  standingsDeadlineRound: null,
  survival: true,
  standingsTableFinal: false,
};

const JONAS = { id: player('1'), name: 'Jonas', surname: 'Petraitis', isAdmin: false };

describe('shellViewFor', () => {
  it('gives a guest the guest view', () => {
    expect(shellViewFor({ player: null, tournament: null })).toEqual(guestView());
  });

  it("gives a player their tournament and its flags, no leagues (slice 12) and so no league tab (#16's comment)", () => {
    const context: RequestContext = {
      player: JONAS,
      tournament: {
        tournament: TOURNAMENT,
        currentRound: roundNo(1),
        started: true,
        standingsLocked: false,
        nav: { survival: true, summary: true, survivalSummary: true },
      },
    };
    expect(shellViewFor(context)).toEqual({
      player: { name: 'Jonas P.', initials: 'JP', isAdmin: false },
      tournament: { name: 'Euroleague 2026/27', slug: 'euroleague-2026-27' },
      nav: { survival: true, summary: true, survivalSummary: true },
      badges: { results: 0, standings: 0, survival: 0, invites: 0 },
      leagues: null,
      leagueTab: false,
    });
  });

  it('gives a player in no tournament every flag off', () => {
    expect(shellViewFor({ player: JONAS, tournament: null }).nav).toEqual({
      survival: false,
      summary: false,
      survivalSummary: false,
    });
  });
});

// sportbet's partials/rail-account: "{name} {surname's first letter}." and
// the two initials.
describe('shellPlayer', () => {
  it('shows the name and the first letter of the surname, and never the surname itself', () => {
    expect(shellPlayer(JONAS)).toEqual({
      name: 'Jonas P.',
      initials: 'JP',
      isAdmin: false,
    });
  });

  it('takes a Lithuanian first letter whole, where sportbet took its first byte', () => {
    expect(
      shellPlayer({ name: 'žilvinas', surname: 'Šimkus', isAdmin: true }),
    ).toEqual({ name: 'žilvinas Š.', initials: 'ŽŠ', isAdmin: true });
  });

  it('shows the name alone when there is no surname, as a Google sign-up leaves it', () => {
    expect(shellPlayer({ name: 'Jonas', surname: '', isAdmin: false })).toEqual({
      name: 'Jonas',
      initials: 'J',
      isAdmin: false,
    });
  });
});
```

- [ ] **Step 2: Run it to see it fail**

Run: `pnpm --filter @sportbet/web exec vitest run --config vitest.component.config.ts src/server/shell-for.test.ts`
Expected: FAIL - `Failed to resolve import "./shell-for"`.

- [ ] **Step 3: Write `apps/web/src/server/request-context.ts`**

```ts
import {
  findSignedInPlayer,
  findTournamentById,
  listPlayerTournaments,
  loadSeason,
  type SignedInPlayer,
} from '@sportbet/db';
import {
  chooseTournament,
  isAdmin,
  ruledRules,
  tournamentContext,
  type PlayerId,
  type Tournament,
  type TournamentContext,
} from '@sportbet/domain';
import { cookies } from 'next/headers';
import { cache } from 'react';
import { now } from './clock';
import { getDb } from './db';
import { readSessionCookie, SESSION_COOKIE } from './session/session-cookie';
import { hashSessionToken } from './session/session-token';

/** Who the request is from: what the shell and the pages may read of them. */
export interface ContextPlayer {
  readonly id: PlayerId;
  readonly name: string;
  /** Read on the server only; the shell is told its first letter (shell-for.ts). */
  readonly surname: string;
  readonly isAdmin: boolean;
}

export interface ContextTournament extends TournamentContext {
  readonly tournament: Tournament;
}

export interface RequestContext {
  readonly player: ContextPlayer | null;
  readonly tournament: ContextTournament | null;
}

/** The player this request's session cookie names, if the session is live (read every request). */
export const signedInPlayer = cache(async (): Promise<SignedInPlayer | null> => {
  const cookie = readSessionCookie((await cookies()).get(SESSION_COOKIE)?.value);
  if (cookie === null) return null;
  const found = await findSignedInPlayer(
    getDb(),
    hashSessionToken(cookie.token),
    now(),
  );
  return found ?? null;
});

/**
 * Who the request is from and the tournament it is about, read fresh each
 * request (decision 5: the session holds only the player): the player's
 * last-used tournament if they are in it (R-28), else sportbet's fallback
 * (chooseTournament); its current round under the live rule set, whether
 * it has started, whether standings are locked, and the navigation's flags
 * (tournamentContext).
 */
export const requestContext = cache(async (): Promise<RequestContext> => {
  const signedIn = await signedInPlayer();
  if (signedIn === null) return { player: null, tournament: null };
  const player: ContextPlayer = {
    id: signedIn.player,
    name: signedIn.name,
    surname: signedIn.surname,
    isAdmin: isAdmin(signedIn.adminLevel),
  };
  const db = getDb();
  const chosen = chooseTournament({
    lastUsed: signedIn.lastTournament,
    playing: await listPlayerTournaments(db, signedIn.player),
  });
  const tournament =
    chosen === null ? undefined : await findTournamentById(db, chosen);
  if (tournament === undefined) return { player, tournament: null };
  const season = await loadSeason(db, tournament);
  return {
    player,
    tournament: {
      tournament,
      ...tournamentContext({
        season,
        survival: tournament.survival,
        now: now(),
        rules: ruledRules,
      }),
    },
  };
});
```

- [ ] **Step 4: Write `apps/web/src/server/shell-for.ts`**

```ts
import { NO_TOURNAMENT_NAV } from '@sportbet/domain';
import {
  guestView,
  showsLeagueTab,
  type ShellPlayer,
  type ShellView,
} from '../components/shell/shell-view';
import type { RequestContext } from './request-context';

const firstLetter = (text: string) => Array.from(text)[0] ?? '';

/**
 * What the rail shows of a player (sportbet's partials/rail-account): the
 * name and the surname's first letter ("Jonas P."), and the two first
 * letters as initials ("JP") - by letter, where sportbet's substr took a
 * byte. The surname itself never reaches the shell (#16).
 */
export function shellPlayer(player: {
  readonly name: string;
  readonly surname: string;
  readonly isAdmin: boolean;
}): ShellPlayer {
  const initial = firstLetter(player.surname);
  return {
    name: `${player.name} ${initial}${initial === '' ? '' : '.'}`.trim(),
    initials: `${firstLetter(player.name)}${initial}`.toUpperCase(),
    isAdmin: player.isAdmin,
  };
}

/**
 * The shell's view of a request: a guest's, or the player's from the
 * request context. Leagues arrive with slice 12: until then they are
 * null, the shell draws no league row, and the league tab follows them
 * through showsLeagueTab (#16's comment). Badges are slice 6's.
 */
export function shellViewFor(context: RequestContext): ShellView {
  const { player, tournament } = context;
  if (player === null) return guestView();
  const leagues = null;
  return {
    player: shellPlayer(player),
    tournament:
      tournament === null
        ? null
        : { name: tournament.tournament.name, slug: tournament.tournament.slug },
    nav: tournament?.nav ?? NO_TOURNAMENT_NAV,
    badges: guestView().badges,
    leagues,
    leagueTab: showsLeagueTab(leagues),
  };
}
```

- [ ] **Step 5: Write `apps/web/src/proxy.ts`**

```ts
import { touchSession } from '@sportbet/db';
import { utcDay } from '@sportbet/domain';
import { NextResponse, type NextRequest } from 'next/server';
import { now } from './server/clock';
import { getDb } from './server/db';
import {
  cleared,
  readSessionCookie,
  SESSION_COOKIE,
  SESSION_COOKIE_OPTIONS,
  sessionCookieValue,
} from './server/session/session-cookie';
import { hashSessionToken } from './server/session/session-token';

/**
 * R-44: every visit extends the sign-in. The session cookie carries the
 * UTC day it was last re-issued; on a visit on a later day this extends
 * the session in the database (90 days from now) and re-issues the cookie
 * for 90 days, so a day of visits costs one write. A cookie that is not
 * this app's, or whose session has ended, is cleared.
 */
export async function proxy(request: NextRequest): Promise<NextResponse> {
  const response = NextResponse.next();
  const value = request.cookies.get(SESSION_COOKIE)?.value;
  if (value === undefined) return response;
  const cookie = readSessionCookie(value);
  const at = now();
  const today = utcDay(at);
  if (cookie !== null && cookie.day === today) return response;
  const live =
    cookie !== null &&
    (await touchSession(getDb(), hashSessionToken(cookie.token), at));
  if (cookie !== null && live) {
    response.cookies.set(
      SESSION_COOKIE,
      sessionCookieValue({ token: cookie.token, day: today }),
      SESSION_COOKIE_OPTIONS,
    );
  } else {
    response.cookies.set(SESSION_COOKIE, '', cleared(SESSION_COOKIE_OPTIONS));
  }
  return response;
}

export const config = {
  // Every page and action; not Next's own files, sportbet's images or the health check.
  matcher: ['/((?!_next/static|_next/image|img/|favicon|api/health).*)'],
};
```

(Next 16 runs `proxy.ts` on Node.js, so it may reach Postgres; `apps/web/node_modules/next/dist/docs/01-app/03-api-reference/03-file-conventions/proxy.md`, "Runtime".)

- [ ] **Step 6: Run it to see it pass**

Run: `pnpm --filter @sportbet/web exec vitest run --config vitest.component.config.ts src/server/shell-for.test.ts && pnpm --filter @sportbet/web typecheck`
Expected: PASS, 6 tests; typecheck clean.

- [ ] **Step 7: Hand to the lead.** Files above; `pnpm format && pnpm lint` clean. Commit message: `feat(web): the request context, the player's shell view, and the daily session extension (#16)`.

---

### Task 14 (web-dev): "Prisijungti", the sign-in dialog, and a shell that links only to pages that exist

**Files:**
- Create: `apps/web/src/components/shell/sign-in-state.ts`, `apps/web/src/components/shell/sign-in-link.tsx`, `apps/web/src/components/shell/sign-in-dialog.tsx`
- Modify: `apps/web/src/components/shell/shell-paths.ts`, `icon.tsx`, `nav-styles.ts`, `guest-rail.tsx`, `phone-header.tsx`, `rail-account.tsx`, `rail-tournament.tsx`, `player-rail.tsx`, `bottom-tabs.tsx`, `shell.tsx` (all under `apps/web/src/components/shell/`)
- Test: `sign-in-link.test.tsx`, `sign-in-dialog.test.tsx`, `shell-paths.test.ts` (new); `icon.test.tsx`, `guest-rail.test.tsx`, `phone-header.test.tsx`, `rail-account.test.tsx`, `rail-tournament.test.tsx`, `player-rail.test.tsx`, `bottom-tabs.test.tsx`, `shell.test.tsx` (all under `apps/web/src/components/shell/`)

sportbet's dialog (CLAUDE.md > The sign-in dialog; `modals/main`, `modals/login`, `partials/auth/login-code-step`, `AuthDialogComposer`), on its `sb-auth-*` rules in token utilities; "Prisijungti" in the guest rail's foot (`.sb-rail-login`) and on the phone bar (`.sb-nav-pill`). The dialog is told everything by the server (`ShellSignIn`), and its action is passed in, so a component test never reaches the server.

- [ ] **Step 1: Write the failing tests**

`apps/web/src/components/shell/sign-in-link.test.tsx`:

```tsx
import { fireEvent, render, screen } from '@testing-library/react';
import { expect, it, vi } from 'vitest';
import { SignInLink } from './sign-in-link';
import { SIGN_IN_DIALOG_ID, SIGN_IN_EVENT } from './sign-in-state';

// sportbet issue 106: "Prisijungti" opens the dialog where the visitor is;
// without the dialog (or JavaScript) it is an ordinary link to /login.
it('opens the dialog in place when the page has one', () => {
  const opened = vi.fn();
  window.addEventListener(SIGN_IN_EVENT, opened);
  render(
    <>
      <div id={SIGN_IN_DIALOG_ID} />
      <SignInLink className="">Prisijungti</SignInLink>
    </>,
  );
  const link = screen.getByRole('link', { name: 'Prisijungti' });
  expect(link.getAttribute('href')).toBe('/login');
  expect(fireEvent.click(link)).toBe(false);
  expect(opened).toHaveBeenCalledTimes(1);
  window.removeEventListener(SIGN_IN_EVENT, opened);
});

it('follows its href when the page has no dialog', () => {
  render(<SignInLink className="">Prisijungti</SignInLink>);
  expect(fireEvent.click(screen.getByRole('link', { name: 'Prisijungti' }))).toBe(
    true,
  );
});
```

`apps/web/src/components/shell/sign-in-dialog.test.tsx`:

```tsx
import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { SignInDialog } from './sign-in-dialog';
import {
  SIGN_IN_EVENT,
  SIGN_IN_IDLE,
  type ShellSignIn,
  type SignInAction,
} from './sign-in-state';

const idle: SignInAction = () => Promise.resolve(SIGN_IN_IDLE);
const EMAIL_STEP: ShellSignIn = {
  step: { kind: 'email' },
  open: false,
  next: null,
  codeMinutes: 5,
  action: idle,
};
const CODE = {
  kind: 'code',
  email: 'jonas@example.lt',
  sentAt: '2026-10-05T12:00:00Z',
  resendIn: 20,
  expiresIn: 300,
} as const;

const dialog = () => screen.getByTestId('sign-in-dialog');
const answering = (state: Awaited<ReturnType<SignInAction>>) =>
  vi.fn<SignInAction>(() => Promise.resolve(state));

afterEach(() => {
  vi.useRealTimers();
});

describe('the sign-in dialog', () => {
  it('is on the page, closed, with its address form, until "Prisijungti" opens it', () => {
    render(<SignInDialog {...EMAIL_STEP} />);
    expect(dialog().hidden).toBe(true);
    act(() => {
      window.dispatchEvent(new Event(SIGN_IN_EVENT));
    });
    expect(dialog().hidden).toBe(false);
    expect(screen.getByRole('dialog', { name: 'Prisijungti' })).toBeDefined();
    expect(screen.getByPlaceholderText('El. paštas')).toBeDefined();
    expect(
      screen.getByText('Atsiųsime 8 skaitmenų kodą. Jis galios 5 min.'),
    ).toBeDefined();
    expect(
      screen.getByRole('button', { name: 'Gauti prisijungimo kodą' }),
    ).toBeDefined();
  });

  it('opens itself on arrival from /login, carrying where to go after sign-in', () => {
    const { container } = render(
      <SignInDialog {...EMAIL_STEP} open next="/tournament/euroleague-2026-27" />,
    );
    expect(dialog().hidden).toBe(false);
    expect(
      container.querySelector('input[name="next"]')?.getAttribute('value'),
    ).toBe('/tournament/euroleague-2026-27');
  });

  it('closes on "Uždaryti" and on Escape', () => {
    render(<SignInDialog {...EMAIL_STEP} open />);
    fireEvent.click(screen.getByRole('button', { name: 'Uždaryti' }));
    expect(dialog().hidden).toBe(true);
    act(() => {
      window.dispatchEvent(new Event(SIGN_IN_EVENT));
    });
    fireEvent.keyDown(window, { key: 'Escape' });
    expect(dialog().hidden).toBe(true);
  });

  it('asks for a code for the address typed', async () => {
    const action = answering({ kind: 'sent', resent: false });
    render(<SignInDialog {...EMAIL_STEP} open action={action} />);
    fireEvent.change(screen.getByPlaceholderText('El. paštas'), {
      target: { value: 'jonas@example.lt' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Gauti prisijungimo kodą' }));
    await waitFor(() => {
      expect(action).toHaveBeenCalledTimes(1);
    });
    const form = action.mock.calls[0]?.[1];
    expect(form?.get('intent')).toBe('request');
    expect(form?.get('email')).toBe('jonas@example.lt');
  });

  it('shows a refusal of the address above the address form', async () => {
    const message = 'Per daug bandymų. Pabandykite dar kartą po 10 min.';
    render(
      <SignInDialog
        {...EMAIL_STEP}
        open
        action={answering({ kind: 'refused', field: 'email', message })}
      />,
    );
    fireEvent.click(screen.getByRole('button', { name: 'Gauti prisijungimo kodą' }));
    expect((await screen.findByRole('alert')).textContent).toBe(message);
  });
});

// sportbet's LoginCodeStepTest and AuthCodeStep.
describe('the code step', () => {
  it('opens itself, names the address the code went to, and drops the address form', () => {
    render(<SignInDialog {...EMAIL_STEP} step={CODE} />);
    expect(dialog().hidden).toBe(false);
    expect(screen.getByText('jonas@example.lt').tagName).toBe('STRONG');
    expect(screen.getByText(/Kodą išsiuntėme į/)).toBeDefined();
    expect(screen.queryByPlaceholderText('El. paštas')).toBeNull();
    const input = screen.getByLabelText('8 skaitmenų kodas');
    expect(input.getAttribute('placeholder')).toBe('•'.repeat(8));
    expect(input.getAttribute('autocomplete')).toBe('one-time-code');
    expect(input.getAttribute('inputmode')).toBe('numeric');
    expect(input.getAttribute('maxlength')).toBe('8');
  });

  it('counts the code down, and says so once it has died', () => {
    vi.useFakeTimers();
    render(<SignInDialog {...EMAIL_STEP} step={{ ...CODE, expiresIn: 2 }} />);
    expect(screen.getByText('Kodas galioja dar 0:02')).toBeDefined();
    act(() => {
      vi.advanceTimersByTime(2000);
    });
    expect(
      screen.getByText('Kodo galiojimas baigėsi - išsiųskite naują.'),
    ).toBeDefined();
  });

  it('keeps the resend locked for its cooldown, counting, then offers it with the address', () => {
    vi.useFakeTimers();
    const { container } = render(<SignInDialog {...EMAIL_STEP} step={CODE} />);
    const resend = screen.getByRole('button', { name: 'Siųsti kodą iš naujo' });
    expect(resend).toHaveProperty('disabled', true);
    expect(resend.textContent).toBe('siųskite iš naujo (0:20)');
    act(() => {
      vi.advanceTimersByTime(20_000);
    });
    expect(resend).toHaveProperty('disabled', false);
    expect(resend.textContent).toBe('siųskite iš naujo');
    expect(
      container
        .querySelector('[data-testid="sign-in-resend"] input[name="email"]')
        ?.getAttribute('value'),
    ).toBe('jonas@example.lt');
  });

  it('acknowledges a resend on its countdown line, and a first send not at all', async () => {
    render(
      <SignInDialog
        {...EMAIL_STEP}
        step={{ ...CODE, resendIn: 0 }}
        action={answering({ kind: 'sent', resent: true })}
      />,
    );
    expect(screen.queryByText('Kodą išsiuntėme iš naujo.')).toBeNull();
    fireEvent.click(screen.getByRole('button', { name: 'Siųsti kodą iš naujo' }));
    expect(await screen.findByText('Kodą išsiuntėme iš naujo.')).toBeDefined();
  });

  it('sends the code typed, and shows the one answer to a wrong one', async () => {
    const action = answering({
      kind: 'refused',
      field: 'code',
      message: 'Neteisingas arba pasibaigęs kodas.',
    });
    render(<SignInDialog {...EMAIL_STEP} step={CODE} action={action} />);
    fireEvent.change(screen.getByLabelText('8 skaitmenų kodas'), {
      target: { value: '01234567' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Prisijungti' }));
    expect((await screen.findByRole('alert')).textContent).toBe(
      'Neteisingas arba pasibaigęs kodas.',
    );
    const form = action.mock.calls[0]?.[1];
    expect(form?.get('intent')).toBe('verify');
    expect(form?.get('code')).toBe('01234567');
  });

  it('backs out with "Atgal"', async () => {
    const action = answering(SIGN_IN_IDLE);
    render(<SignInDialog {...EMAIL_STEP} step={CODE} action={action} />);
    fireEvent.click(screen.getByRole('button', { name: 'Atgal' }));
    await waitFor(() => {
      expect(action.mock.calls[0]?.[1].get('intent')).toBe('cancel');
    });
  });
});
```

`apps/web/src/components/shell/shell-paths.test.ts`:

```ts
import { existsSync } from 'node:fs';
import { join } from 'node:path';
import { expect, it } from 'vitest';
import { SHELL_LINKS } from './shell-paths';

const APP = join(import.meta.dirname, '..', '..', 'app');

// #16: each player link is listed only once its page exists.
it('lists a player link only once its page exists', () => {
  const missing = Object.values(SHELL_LINKS)
    .flatMap((href) => (href === null ? [] : [href]))
    .filter(
      (href) => !existsSync(join(APP, ...href.split('/'), 'page.tsx')),
    );
  expect(missing).toEqual([]);
});
```

In `icon.test.tsx`, add `'arrow-left'`, `'box-arrow-in-right'`, `'envelope'` and `'x-lg'` to `NAMES` in alphabetical order.

In `guest-rail.test.tsx`, add:

```tsx
it('ends with "Prisijungti", leading to the sign-in route without JavaScript', () => {
  render(<GuestRail view={guestView()} entries={NAV_ENTRIES} />);
  expect(
    screen.getByRole('link', { name: 'Prisijungti' }).getAttribute('href'),
  ).toBe('/login');
});
```

In `rail-tournament.test.tsx`, pass `exitHref="/tournaments/exit"` to the existing render, and add:

```tsx
it('offers no way out while that page does not exist', () => {
  render(
    <RailTournament
      tournament={{ name: 'Eurolyga 2026-27', slug: 'euroleague-2026-27' }}
      exitHref={null}
    />,
  );
  expect(screen.getByText('Eurolyga 2026-27')).toBeDefined();
  expect(screen.queryByRole('link', { name: 'Keisti turnyrą' })).toBeNull();
});
```

In `rail-account.test.tsx`, add `import { SHELL_LINKS, SPORTBET_LINKS } from './shell-paths';`, pass `links={SPORTBET_LINKS}` to every existing `<RailAccount ... />`, and add:

```tsx
it('shows the name and initials without a link, and offers no administration, while those pages do not exist', () => {
  render(<RailAccount player={{ ...JONAS, isAdmin: true }} links={SHELL_LINKS} />);
  expect(screen.getByText('Jonas P.')).toBeDefined();
  expect(screen.getByText('JP')).toBeDefined();
  expect(screen.queryAllByRole('link')).toEqual([]);
  expect(screen.getByRole('button', { name: 'Atsijungti' })).toBeDefined();
});
```

In `player-rail.test.tsx`, add `import { SPORTBET_LINKS, type ShellLinks } from './shell-paths';`; change `renderRail` to

```tsx
function renderRail(
  view: PlayerShellView = playerView(),
  entries: readonly NavEntry[] = ENTRIES,
  links: ShellLinks = SPORTBET_LINKS,
) {
  return render(<PlayerRail view={view} entries={entries} links={links} />);
}
```

replace the test `'keeps the card with its league row for a player with no tournament and no league'` with:

```tsx
  // sportbet's partials/rail: a player in no league still gets the league
  // row, saying "Lyga".
  it('keeps the league row, saying Lyga, for a player in no league', () => {
    renderRail(playerView({ tournament: null, leagues: { items: [] } }));
    const card = screen.getByTestId('rail-context');
    expect(within(card).queryByText('Turnyras')).toBeNull();
    expect(within(card).getByText('Lyga', { selector: 'span' })).toBeDefined();
    expect(within(card).getByRole('button', { name: 'Lyga' })).toBeDefined();
  });

  // Until slice 12 the app knows no leagues: nothing links to a page that
  // does not exist.
  it('draws no league row while leagues are not known, and no card with nothing in it', () => {
    renderRail(playerView({ leagues: null }));
    const card = screen.getByTestId('rail-context');
    expect(within(card).getByText('Eurolyga 2026-27')).toBeDefined();
    expect(within(card).queryByText('Lyga')).toBeNull();
    cleanup();
    renderRail(playerView({ tournament: null, leagues: null }));
    expect(screen.queryByTestId('rail-context')).toBeNull();
  });
```

(add `cleanup` to its `@testing-library/react` import).

In `bottom-tabs.test.tsx`, add:

```tsx
  it('is not drawn when the player has no tab and no league tab', () => {
    const { container } = render(
      <BottomTabs view={playerView({ leagues: null })} entries={[]} />,
    );
    expect(container.innerHTML).toBe('');
  });
```

In `phone-header.test.tsx`, add `import { SHELL_LINKS, SPORTBET_LINKS, type ShellLinks } from './shell-paths';`; change `openMenu` to

```tsx
function openMenu(
  view: ShellView = playerView(),
  links: ShellLinks = SPORTBET_LINKS,
) {
  const rendered = render(
    <PhoneHeader view={view} entries={MENU} links={links} />,
  );
  fireEvent.click(screen.getByRole('button', { name: 'Atidaryti meniu' }));
  return rendered;
}
```

and add to `describe("a guest's phone bar")`:

```tsx
  it('offers "Prisijungti", named where its label is hidden', () => {
    render(<PhoneHeader view={guestView()} entries={[PILL]} />);
    expect(
      screen.getByRole('link', { name: 'Prisijungti' }).getAttribute('href'),
    ).toBe('/login');
  });
```

and to `describe("a player's phone bar")`:

```tsx
  it('links to no page that does not exist: no Profilis, Admin or Keisti turnyrą in 4b, for an admin too', () => {
    openMenu(playerView({ player: { ...JONAS, isAdmin: true } }), SHELL_LINKS);
    expect(screen.queryByRole('link', { name: 'Profilis' })).toBeNull();
    expect(screen.queryByRole('link', { name: 'Admin' })).toBeNull();
    expect(screen.queryByRole('link', { name: 'Keisti turnyrą' })).toBeNull();
    expect(screen.getByText('Eurolyga 2026-27')).toBeDefined();
    expect(screen.getByRole('button', { name: 'Atsijungti' })).toBeDefined();
  });
```

In `shell.test.tsx`, add the imports `import { SHELL_LINKS, SPORTBET_LINKS } from './shell-paths';` and `import { SIGN_IN_IDLE, type ShellSignIn } from './sign-in-state';`, and a tab entry below `SURVIVAL`:

```tsx
const RESULTS: NavEntry = {
  label: 'Spėjimai',
  href: '/results',
  icon: 'trophy',
  audience: 'player',
  group: 'main',
  surfaces: ['rail', 'menu', 'tabs'],
};

const SIGN_IN: ShellSignIn = {
  step: { kind: 'email' },
  open: false,
  next: null,
  codeMinutes: 5,
  action: () => Promise.resolve(SIGN_IN_IDLE),
};
```

In `"frames a player's page: the player rail, the menu, the tabs"`, render with `entries={[...NAV_ENTRIES, RESULTS]}`. In `'offers administration to an admin only, in the rail and the menu'`, pass `links={SPORTBET_LINKS}` to both `<Shell>`s. Add:

```tsx
  it('gives a guest the sign-in dialog, and a player none', () => {
    const { unmount } = render(
      <Shell view={guestView()} adsenseClient={null} signIn={SIGN_IN}>
        <p />
      </Shell>,
    );
    expect(screen.getByTestId('sign-in-dialog')).toBeDefined();
    unmount();
    render(
      <Shell view={playerView()} adsenseClient={null} signIn={SIGN_IN}>
        <p />
      </Shell>,
    );
    expect(screen.queryByTestId('sign-in-dialog')).toBeNull();
  });

  it('links to no page that does not exist: in 4b no profile, administration or way out of the tournament, for an admin too (#16)', () => {
    render(
      <Shell
        view={playerView({ player: { ...JONAS, isAdmin: true } })}
        adsenseClient={null}
        links={SHELL_LINKS}
      >
        <p />
      </Shell>,
    );
    for (const href of ['/userProfile', '/admin', '/tournaments/exit']) {
      expect(document.querySelector(`a[href="${href}"]`)).toBeNull();
    }
  });
```

- [ ] **Step 2: Run them to see them fail**

Run: `pnpm --filter @sportbet/web exec vitest run --config vitest.component.config.ts src/components/shell`
Expected: FAIL - the new modules do not resolve; `SHELL_LINKS` is not exported; the components take no `links` or `exitHref`.

- [ ] **Step 3: The dialog's shared names and shapes**

`apps/web/src/components/shell/sign-in-state.ts`:

```ts
// The sign-in dialog's names and shapes, shared by the server that fills
// it (server/sign-in) and the client that draws it. No imports: a client
// component reads this file.

/** /login's 60-second cookie: open the dialog on the next page, and where to go after sign-in. */
export const OPEN_SIGN_IN_COOKIE = '__Host-sb_signin_open';

/** sportbet's #loginModal: the one dialog on a page. */
export const SIGN_IN_DIALOG_ID = 'loginModal';

/** What "Prisijungti" dispatches to open the dialog in place. */
export const SIGN_IN_EVENT = 'sportbet:sign-in';

/** sportbet's route('login'): "Prisijungti" without JavaScript. */
export const SIGN_IN_PATH = '/login';

/** The answer to the last thing asked in the dialog (sportbet's flashed errors and code_resent). */
export type SignInState =
  | { readonly kind: 'idle' }
  | { readonly kind: 'sent'; readonly resent: boolean }
  | {
      readonly kind: 'refused';
      readonly field: 'email' | 'code';
      readonly message: string;
    };

export const SIGN_IN_IDLE: SignInState = { kind: 'idle' };

/** Which step the dialog draws: the address, or a code still alive (AuthCodeStep::login). */
export type SignInStep =
  | { readonly kind: 'email' }
  | {
      readonly kind: 'code';
      /** The address the visitor typed, never anything of an account. */
      readonly email: string;
      /** When the code went out (ISO), so a new code restarts the countdowns. */
      readonly sentAt: string;
      readonly resendIn: number;
      readonly expiresIn: number;
    };

/** The dialog's Server Action (server/sign-in/sign-in-action.ts), passed in. */
export type SignInAction = (
  state: SignInState,
  form: FormData,
) => Promise<SignInState>;

/** What a guest's shell is told about signing in. */
export interface ShellSignIn {
  readonly step: SignInStep;
  /** Open on arrival: from /login, or with a code to type. */
  readonly open: boolean;
  /** Where to go after sign-in, carried by the address form. */
  readonly next: string | null;
  /** The code's life, as the server's constant says it (sportbet #76). */
  readonly codeMinutes: number;
  readonly action: SignInAction;
}
```

- [ ] **Step 4: Links only to pages that exist**

In `apps/web/src/components/shell/shell-paths.ts`, replace the opening comment's last sentence ("Nothing renders them before 4b switches the player shell on; each is served by the slice that owns it, at the same URL and method as sportbet.") with "Each is served by the slice that owns it, at the same URL and method as sportbet, and linked only once it is (`SHELL_LINKS`)." and add at the end:

```ts
/** Where a player goes after sign-in: '/' until /main exists (slice 8). */
export const PLAYER_HOME = '/';

/**
 * The player shell's links outside the navigation entries. Each is null
 * until its page exists in this app (#16), so the shell never links to a
 * 404; shell-paths.test.ts checks every one that is set has its page.
 */
export interface ShellLinks {
  readonly profile: string | null;
  readonly admin: string | null;
  readonly tournamentExit: string | null;
}

/** Slice 4b's: the profile (17), administration (13) and the tournament exit (5) do not exist yet. */
export const SHELL_LINKS: ShellLinks = {
  profile: null,
  admin: null,
  tournamentExit: null,
};

/** Every link sportbet's player shell has, for the tests that draw it whole. */
export const SPORTBET_LINKS: ShellLinks = {
  profile: PROFILE_PATH,
  admin: ADMIN_PATH,
  tournamentExit: TOURNAMENT_EXIT_PATH,
};
```

- [ ] **Step 5: Four icons and two classes**

In `apps/web/src/components/shell/icon.tsx`, add `| 'arrow-left'`, `| 'box-arrow-in-right'`, `| 'envelope'` and `| 'x-lg'` to `IconName` in alphabetical order, and to `ICONS` (Bootstrap Icons 1.11.1, `icons/<name>.svg`):

```ts
  'arrow-left': [
    {
      evenOdd: true,
      d: 'M15 8a.5.5 0 0 0-.5-.5H2.707l3.147-3.146a.5.5 0 1 0-.708-.708l-4 4a.5.5 0 0 0 0 .708l4 4a.5.5 0 0 0 .708-.708L2.707 8.5H14.5A.5.5 0 0 0 15 8z',
    },
  ],
  'box-arrow-in-right': [
    {
      evenOdd: true,
      d: 'M6 3.5a.5.5 0 0 1 .5-.5h8a.5.5 0 0 1 .5.5v9a.5.5 0 0 1-.5.5h-8a.5.5 0 0 1-.5-.5v-2a.5.5 0 0 0-1 0v2A1.5 1.5 0 0 0 6.5 14h8a1.5 1.5 0 0 0 1.5-1.5v-9A1.5 1.5 0 0 0 14.5 2h-8A1.5 1.5 0 0 0 5 3.5v2a.5.5 0 0 0 1 0v-2z',
    },
    {
      evenOdd: true,
      d: 'M11.854 8.354a.5.5 0 0 0 0-.708l-3-3a.5.5 0 1 0-.708.708L10.293 7.5H1.5a.5.5 0 0 0 0 1h8.793l-2.147 2.146a.5.5 0 0 0 .708.708l3-3z',
    },
  ],
  envelope: [
    {
      d: 'M0 4a2 2 0 0 1 2-2h12a2 2 0 0 1 2 2v8a2 2 0 0 1-2 2H2a2 2 0 0 1-2-2V4Zm2-1a1 1 0 0 0-1 1v.217l7 4.2 7-4.2V4a1 1 0 0 0-1-1H2Zm13 2.383-4.708 2.825L15 11.105V5.383Zm-.034 6.876-5.64-3.471L8 9.583l-1.326-.795-5.64 3.47A1 1 0 0 0 2 13h12a1 1 0 0 0 .966-.741ZM1 11.105l4.708-2.897L1 5.383v5.722Z',
    },
  ],
  'x-lg': [
    {
      d: 'M2.146 2.854a.5.5 0 1 1 .708-.708L8 7.293l5.146-5.147a.5.5 0 0 1 .708.708L8.707 8l5.147 5.146a.5.5 0 0 1-.708.708L8 8.707l-5.146 5.147a.5.5 0 0 1-.708-.708L7.293 8 2.146 2.854Z',
    },
  ],
```

In `apps/web/src/components/shell/nav-styles.ts`, add:

```ts
/** .sb-nav-pill: the guest's "Prisijungti" on the phone bar, in the accent, icon only below 576px. */
export const LOGIN_PILL =
  'rounded-full border-2 border-accent px-5 py-1.5 text-[0.875rem] leading-[1.4] font-semibold whitespace-nowrap text-accent no-underline transition-[background-color,color] duration-150 hover:bg-accent hover:text-on-accent max-sm:px-3';

/** .sb-rail-login, in .sb-rail-foot: the guest rail's "Prisijungti". */
export const RAIL_LOGIN =
  'flex items-center justify-center gap-2 rounded-md bg-accent px-3.5 py-2.5 text-[0.92rem] font-bold text-on-accent no-underline hover:opacity-90';
```

- [ ] **Step 6: "Prisijungti"**

`apps/web/src/components/shell/sign-in-link.tsx`:

```tsx
'use client';

import type { ReactNode } from 'react';
import { SIGN_IN_DIALOG_ID, SIGN_IN_EVENT, SIGN_IN_PATH } from './sign-in-state';

/**
 * "Prisijungti" (sportbet's .sb-rail-login and .sb-nav-pill, issue 106):
 * opens the dialog where the visitor is, so the page they are reading
 * survives the click; without the dialog, or JavaScript, it is a link to
 * /login, which opens the dialog on '/'.
 */
export function SignInLink({
  className,
  label,
  children,
}: {
  className: string;
  label?: string;
  children: ReactNode;
}) {
  return (
    <a
      href={SIGN_IN_PATH}
      className={className}
      aria-label={label}
      onClick={(event) => {
        if (document.getElementById(SIGN_IN_DIALOG_ID) === null) return;
        event.preventDefault();
        window.dispatchEvent(new Event(SIGN_IN_EVENT));
      }}
    >
      {children}
    </a>
  );
}
```

(The guest rail's foot is drawn in Step 8.)

- [ ] **Step 7: The dialog**

`apps/web/src/components/shell/sign-in-dialog.tsx`:

```tsx
'use client';

import { useActionState, useEffect, useState } from 'react';
import { Icon } from './icon';
import {
  OPEN_SIGN_IN_COOKIE,
  SIGN_IN_DIALOG_ID,
  SIGN_IN_EVENT,
  SIGN_IN_IDLE,
  type ShellSignIn,
  type SignInState,
  type SignInStep,
} from './sign-in-state';

type FormAction = (form: FormData) => void;
type CodeStepView = Extract<SignInStep, { kind: 'code' }>;

/** sportbet's Alpine clock(): m:ss. */
const clock = (seconds: number) =>
  `${String(Math.floor(seconds / 60))}:${String(seconds % 60).padStart(2, '0')}`;

/** Seconds counted down once a second from `seconds`, to zero (the code step's x-data). */
function useCountdown(seconds: number): number {
  const [left, setLeft] = useState(seconds);
  useEffect(() => {
    const timer = setInterval(() => {
      setLeft((value) => Math.max(0, value - 1));
    }, 1000);
    return () => {
      clearInterval(timer);
    };
  }, []);
  return left;
}

/** .alert.alert-danger in .sb-auth-body. */
function Refusal({ message }: { message: string }) {
  return (
    <div
      role="alert"
      className="mb-3 rounded-[10px] bg-bad-tint px-3 py-2 text-[0.875rem] text-bad"
    >
      {message}
    </div>
  );
}

/** modals/login: the address, and "Gauti prisijungimo kodą". Google's way in is 4c's. */
function EmailStep({
  state,
  formAction,
  pending,
  next,
  codeMinutes,
}: {
  state: SignInState;
  formAction: FormAction;
  pending: boolean;
  next: string | null;
  codeMinutes: number;
}) {
  return (
    <div className="p-6">
      {state.kind === 'refused' && state.field === 'email' ? (
        <Refusal message={state.message} />
      ) : null}
      <form action={formAction} data-testid="sign-in-request">
        <input type="hidden" name="intent" value="request" />
        {next === null ? null : <input type="hidden" name="next" value={next} />}
        <div className="mb-4 flex items-stretch overflow-hidden rounded-md border border-border">
          <span
            aria-hidden="true"
            className="flex items-center bg-surface-2 px-3 text-muted"
          >
            <Icon name="envelope" />
          </span>
          <input
            type="email"
            name="email"
            aria-label="El. paštas"
            placeholder="El. paštas"
            autoComplete="email"
            className="min-w-0 flex-1 bg-card py-2 pr-3 pl-1 text-text outline-none placeholder:text-dim"
          />
        </div>
        <p className="mb-3.5 text-[0.78rem] leading-[1.45] text-muted">
          {`Atsiųsime 8 skaitmenų kodą. Jis galios ${String(codeMinutes)} min.`}
        </p>
        <button
          type="submit"
          disabled={pending}
          className="block w-full cursor-pointer rounded-md border-none bg-accent px-3 py-2 font-semibold text-on-accent hover:bg-accent-hover"
        >
          Gauti prisijungimo kodą
        </button>
      </form>
    </div>
  );
}

/** partials/auth/login-code-step: one job on screen - the code - and its own way back. */
function CodeStep({
  step,
  state,
  formAction,
  pending,
}: {
  step: CodeStepView;
  state: SignInState;
  formAction: FormAction;
  pending: boolean;
}) {
  const expiresIn = useCountdown(step.expiresIn);
  const resendIn = useCountdown(step.resendIn);
  const resent = state.kind === 'sent' && state.resent;
  const refusal = state.kind === 'refused' ? state.message : null;
  return (
    <div className="p-6">
      <form action={formAction} data-testid="sign-in-cancel">
        <input type="hidden" name="intent" value="cancel" />
        <button
          type="submit"
          className="mb-2 inline-flex cursor-pointer items-center gap-1.5 border-none bg-transparent py-1 pr-1.5 text-[0.85rem] font-medium text-muted hover:text-text"
        >
          <Icon name="arrow-left" /> Atgal
        </button>
      </form>
      <div className="mb-4 flex items-center gap-3">
        <span
          aria-hidden="true"
          className="flex size-[38px] shrink-0 items-center justify-center rounded-full bg-accent-tint text-accent"
        >
          <Icon name="envelope" />
        </span>
        <p className="m-0 text-[0.85rem] leading-[1.45] text-muted">
          Kodą išsiuntėme į{' '}
          <strong className="font-semibold text-text">{step.email}</strong>
        </p>
      </div>
      {refusal === null ? null : <Refusal message={refusal} />}
      <form action={formAction} data-testid="sign-in-verify">
        <input type="hidden" name="intent" value="verify" />
        <label htmlFor="sign-in-code" className="sr-only">
          8 skaitmenų kodas
        </label>
        <input
          id="sign-in-code"
          name="code"
          type="text"
          inputMode="numeric"
          autoComplete="one-time-code"
          maxLength={8}
          placeholder="••••••••"
          autoFocus
          className={`mb-2 block w-full rounded-[12px] border-[1.5px] bg-surface-2 px-4 py-3.5 text-center text-[1.4rem] font-bold tracking-[0.3em] indent-[0.3em] text-text outline-none placeholder:text-dim focus:border-accent focus:shadow-[0_0_0_3px_var(--color-accent-tint)] ${refusal === null ? 'border-border' : 'border-bad'}`}
        />
        <p className="mb-3.5 text-center text-[0.78rem] text-muted">
          {resent ? (
            <span className="font-semibold text-ok">Kodą išsiuntėme iš naujo.</span>
          ) : null}
          {expiresIn > 0
            ? `${resent ? ' Galioja dar' : 'Kodas galioja dar'} ${clock(expiresIn)}`
            : 'Kodo galiojimas baigėsi - išsiųskite naują.'}
        </p>
        <button
          type="submit"
          disabled={pending}
          className="mb-3 block w-full cursor-pointer rounded-full border-none bg-accent p-3.5 text-base font-bold text-on-accent hover:bg-accent-hover"
        >
          Prisijungti
        </button>
      </form>
      <div className="m-0 text-[0.78rem] leading-[1.5] text-muted">
        Negavote? Patikrinkite šlamšto aplanką arba{' '}
        <form action={formAction} className="inline" data-testid="sign-in-resend">
          <input type="hidden" name="intent" value="request" />
          <input type="hidden" name="email" value={step.email} />
          <button
            type="submit"
            aria-label="Siųsti kodą iš naujo"
            disabled={resendIn > 0 || pending}
            className="cursor-pointer border-none bg-transparent p-0 font-semibold text-accent hover:underline disabled:cursor-not-allowed disabled:text-dim disabled:no-underline"
          >
            {resendIn > 0
              ? `siųskite iš naujo (${clock(resendIn)})`
              : 'siųskite iš naujo'}
          </button>
        </form>
        .
      </div>
    </div>
  );
}

/**
 * The sign-in dialog (sportbet's #loginModal, CLAUDE.md > The sign-in
 * dialog): one per page, for a guest; the whole flow in place - ask for a
 * code, type it, resend it, back out - each answered by the one Server
 * Action. It opens on "Prisijungti" (SIGN_IN_EVENT), on arrival from
 * /login, with a code to type, and on an answer to something asked in it;
 * 4b draws its sign-in side only (registration's tab is 4c's), so there
 * are no tabs to hide while a code is in flight.
 */
export function SignInDialog({
  step,
  open,
  next,
  codeMinutes,
  action,
}: ShellSignIn) {
  const [state, formAction, pending] = useActionState(action, SIGN_IN_IDLE);
  const [isOpen, setOpen] = useState(open || state.kind !== 'idle');

  useEffect(() => {
    const show = () => {
      setOpen(true);
    };
    window.addEventListener(SIGN_IN_EVENT, show);
    return () => {
      window.removeEventListener(SIGN_IN_EVENT, show);
    };
  }, []);

  // /login's cookie has done its job once the dialog is open.
  useEffect(() => {
    if (open) {
      document.cookie = `${OPEN_SIGN_IN_COOKIE}=; Max-Age=0; Path=/; Secure; SameSite=Lax`;
    }
  }, [open]);

  useEffect(() => {
    if (!isOpen) return;
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setOpen(false);
    };
    window.addEventListener('keydown', closeOnEscape);
    return () => {
      window.removeEventListener('keydown', closeOnEscape);
    };
  }, [isOpen]);

  return (
    <div id={SIGN_IN_DIALOG_ID} data-testid="sign-in-dialog" hidden={!isOpen}>
      <div
        aria-hidden="true"
        className="fixed inset-0 z-[1050] bg-scrim"
        onClick={() => {
          setOpen(false);
        }}
      />
      {/* .modal-dialog-centered at 420px, .modal-content with radius 12px */}
      <div
        role="dialog"
        aria-modal="true"
        aria-label="Prisijungti"
        className="fixed top-1/2 left-1/2 z-[1055] w-[calc(100%-2rem)] max-w-[420px] -translate-x-1/2 -translate-y-1/2 overflow-hidden rounded-[12px] bg-card text-text shadow-[0_8px_32px_var(--color-shadow-strong)]"
      >
        {/* .sb-auth-header, bare while a code is in flight */}
        <div
          className={`bg-surface px-6 pt-5 text-text ${step.kind === 'code' ? 'pb-1.5' : 'pb-0'}`}
        >
          <div className="flex items-center justify-between">
            <span className="text-[0.82rem] font-extrabold tracking-[0.09em] uppercase">
              Sport<i className="text-accent not-italic">Bet</i>
            </span>
            <button
              type="button"
              aria-label="Uždaryti"
              onClick={() => {
                setOpen(false);
              }}
              className="cursor-pointer border-none bg-transparent p-1 text-[0.8rem] text-muted hover:text-text"
            >
              <Icon name="x-lg" />
            </button>
          </div>
        </div>
        {step.kind === 'code' ? (
          <CodeStep
            key={step.sentAt}
            step={step}
            state={state}
            formAction={formAction}
            pending={pending}
          />
        ) : (
          <EmailStep
            state={state}
            formAction={formAction}
            pending={pending}
            next={next}
            codeMinutes={codeMinutes}
          />
        )}
      </div>
    </div>
  );
}
```

(The code input's placeholder is eight `U+2022`; the test writes it as an escape. The countdown line reads "Kodą išsiuntėme iš naujo. Galioja dar 4:12" after a resend, "Kodas galioja dar 4:12" otherwise, exactly as sportbet's two `x-show` spans.)

- [ ] **Step 8: The rail's and the menu's links**

Replace `apps/web/src/components/shell/rail-tournament.tsx` with:

```tsx
import { Icon } from './icon';
import { RAIL_CARD_LABEL } from './nav-styles';
import type { ShellTournament } from './shell-view';

/**
 * The tournament the menu is scoped to: label, full name - wrapped, never
 * clipped (sportbet #69) - and the way out of it once that page exists
 * (slice 5; ShellLinks). Drawn inside a rail card by the rail and by the
 * phone menu (sportbet's partials/rail-tournament). The way out is a plain
 * link: a GET that changes the session must never be prefetched, as
 * next/link would.
 */
export function RailTournament({
  tournament,
  exitHref,
}: {
  tournament: ShellTournament;
  exitHref: string | null;
}) {
  return (
    <>
      <span className={RAIL_CARD_LABEL}>Turnyras</span>
      <span className="block text-[0.82rem] leading-[1.3] font-bold wrap-anywhere text-on-rail">
        {tournament.name}
      </span>
      {exitHref === null ? null : (
        <a
          href={exitHref}
          className="mt-[7px] inline-flex items-center gap-[5px] rounded-sm text-[0.72rem] font-bold tracking-[0.04em] text-rail-accent no-underline hover:underline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent"
        >
          <Icon name="arrow-left-right" /> Keisti turnyrą
        </a>
      )}
    </>
  );
}
```

Replace `apps/web/src/components/shell/rail-account.tsx` with:

```tsx
import { Icon } from './icon';
import { NavLink } from './nav-link';
import { RAIL_LABEL, RAIL_LINK } from './nav-styles';
import type { ShellLinks } from './shell-paths';
import type { ShellPlayer } from './shell-view';
import { SignOut } from './sign-out';

/** .sb-rail-avatar */
function Initials({ initials }: { initials: string }) {
  return (
    <span
      aria-hidden="true"
      className="inline-flex size-[22px] shrink-0 items-center justify-center rounded-full bg-accent text-[0.6rem] font-bold tracking-[-0.2px] text-on-accent"
    >
      {initials}
    </span>
  );
}

/**
 * The signed-in rail's foot (sportbet's partials/rail-account, issue 135):
 * a labelled "Paskyra" section - the player's own name (a link to the
 * profile once it exists), administration for an admin once it exists,
 * and sign-out, which submits this rail's own hidden form (POST /logout).
 */
export function RailAccount({
  player,
  links,
}: {
  player: ShellPlayer;
  links: ShellLinks;
}) {
  return (
    <div className="mt-auto border-t border-rail-line pt-3">
      <div className={RAIL_LABEL}>Paskyra</div>
      <nav className="flex flex-col">
        {links.profile === null ? (
          <div
            className={`${RAIL_LINK.base} border-transparent tracking-normal text-rail-dim normal-case`}
          >
            <Initials initials={player.initials} />
            <span className="truncate">{player.name}</span>
          </div>
        ) : (
          <NavLink
            href={links.profile}
            styles={RAIL_LINK}
            className="tracking-normal normal-case"
          >
            <Initials initials={player.initials} />
            <span className="sr-only">Profilis:</span>{' '}
            <span className="truncate">{player.name}</span>
          </NavLink>
        )}
        {player.isAdmin && links.admin !== null ? (
          <NavLink
            href={links.admin}
            styles={RAIL_LINK}
            className={RAIL_LINK.caps}
          >
            <Icon name="database-gear" /> Administravimas
          </NavLink>
        ) : null}
        <SignOut
          formId="logout-form-rail"
          className={`${RAIL_LINK.base} ${RAIL_LINK.caps} ${RAIL_LINK.idle} w-full cursor-pointer bg-transparent text-left`}
        />
      </nav>
    </div>
  );
}
```

Replace `apps/web/src/components/shell/player-rail.tsx` with:

```tsx
import { RailBrand } from './brand';
import { LeagueSwitcher } from './league-switcher';
import { NAV_ENTRIES, sectionsFor, type NavEntry } from './nav-entries';
import { RAIL, RAIL_CARD, RAIL_CARD_LABEL } from './nav-styles';
import { RailAccount } from './rail-account';
import { RailSections } from './rail-nav';
import { RailTournament } from './rail-tournament';
import { SHELL_LINKS, type ShellLinks } from './shell-paths';
import type { PlayerShellView } from './shell-view';

/**
 * A signed-in player's rail (sportbet's partials/rail): the brand; the
 * card naming the tournament (when there is one) and, once the app knows
 * leagues (slice 12), the league the menu is scoped to, above the menu it
 * scopes (#69); the rail's blocks (sectionsFor); and the account section
 * at the foot. `entries` is NAV_ENTRIES and `links` SHELL_LINKS except in
 * tests.
 */
export function PlayerRail({
  view,
  entries = NAV_ENTRIES,
  links = SHELL_LINKS,
}: {
  view: PlayerShellView;
  entries?: readonly NavEntry[];
  links?: ShellLinks;
}) {
  const { tournament, leagues } = view;
  return (
    <aside data-testid="rail" className={RAIL}>
      <RailBrand />
      {tournament === null && leagues === null ? null : (
        <div
          data-testid="rail-context"
          className="mb-2 border-b border-rail-line px-4 pb-3.5"
        >
          <div className={RAIL_CARD}>
            {tournament === null ? null : (
              <RailTournament
                tournament={tournament}
                exitHref={links.tournamentExit}
              />
            )}
            {/* .sb-rail-card-row, ruled off from the tournament above it */}
            {leagues === null ? null : (
              <div
                className={
                  tournament === null
                    ? ''
                    : 'mt-[9px] border-t border-rail-line pt-[9px]'
                }
              >
                <span className={RAIL_CARD_LABEL}>Lyga</span>
                <LeagueSwitcher
                  leagues={leagues}
                  variant="rail"
                  invites={view.badges.invites}
                />
              </div>
            )}
          </div>
        </div>
      )}
      <RailSections
        sections={sectionsFor(view, 'rail', entries)}
        badges={view.badges}
      />
      <RailAccount player={view.player} links={links} />
    </aside>
  );
}
```

Replace `apps/web/src/components/shell/guest-rail.tsx` with:

```tsx
import { RailBrand } from './brand';
import { Icon } from './icon';
import { NAV_ENTRIES, sectionsFor, type NavEntry } from './nav-entries';
import { RAIL, RAIL_LOGIN } from './nav-styles';
import { RailSections } from './rail-nav';
import type { ShellView } from './shell-view';
import { SignInLink } from './sign-in-link';

/**
 * A guest's rail (sportbet's partials/rail-guest): the brand, the public
 * entries, and after a separator the information pages; it ends with
 * "Prisijungti" (.sb-rail-foot). sportbet's language switch is gone
 * (decision 13). `entries` is NAV_ENTRIES except in tests.
 */
export function GuestRail({
  view,
  entries = NAV_ENTRIES,
}: {
  view: ShellView;
  entries?: readonly NavEntry[];
}) {
  return (
    <aside data-testid="rail" className={RAIL}>
      <RailBrand />
      <RailSections
        sections={sectionsFor(view, 'rail', entries)}
        badges={view.badges}
      />
      {/* .sb-rail-foot */}
      <div className="mt-auto flex flex-col gap-2.5 border-t border-rail-line px-4 py-3.5">
        <SignInLink className={RAIL_LOGIN}>
          <Icon name="box-arrow-in-right" /> Prisijungti
        </SignInLink>
      </div>
    </aside>
  );
}
```

Replace `apps/web/src/components/shell/phone-header.tsx` with:

```tsx
import type { ReactNode } from 'react';
import { PhoneBrand } from './brand';
import { EntryLink } from './entry-link';
import { Icon } from './icon';
import { NAV_ENTRIES, sectionsFor, type NavEntry } from './nav-entries';
import { NavLink } from './nav-link';
import { LOGIN_PILL, MENU_LINK, RAIL_CARD } from './nav-styles';
import { PhoneMenu } from './phone-menu';
import { RailTournament } from './rail-tournament';
import { SHELL_LINKS, type ShellLinks } from './shell-paths';
import {
  isPlayerView,
  type PlayerShellView,
  type ShellView,
} from './shell-view';
import { SignInLink } from './sign-in-link';
import { SignOut } from './sign-out';

/** .sb-topnav, trimmed below 576px (sportbet issue 130). */
const BAR =
  'mx-auto flex h-12 w-full max-w-[1280px] items-center gap-0.5 px-5 max-sm:px-3';

/**
 * The phone's top bar, below 992px (sportbet's partials/header, .sb-navbar):
 * a guest gets the brand, their pills and "Prisijungti"; a player gets the
 * brand and the menu. `entries` is NAV_ENTRIES and `links` SHELL_LINKS
 * except in tests.
 */
export function PhoneHeader({
  view,
  entries = NAV_ENTRIES,
  links = SHELL_LINKS,
}: {
  view: ShellView;
  entries?: readonly NavEntry[];
  links?: ShellLinks;
}) {
  return (
    <nav
      data-testid="phone-header"
      className="bg-rail shadow-[0_1px_8px_var(--color-shadow-strong)] lg:hidden"
    >
      {!isPlayerView(view) ? (
        <div className={BAR}>
          <PhoneBrand />
          <div className="ml-auto flex items-center gap-1">
            {sectionsFor(view, 'pills', entries)
              .flatMap((section) => section.entries)
              .map((entry) => (
                <EntryLink
                  key={entry.href}
                  entry={entry}
                  surface="pills"
                  badges={view.badges}
                />
              ))}
            <SignInLink className={LOGIN_PILL} label="Prisijungti">
              <span className="text-[0.75rem]">
                <Icon name="box-arrow-in-right" />
              </span>
              <span className="hidden sm:inline"> Prisijungti</span>
            </SignInLink>
          </div>
        </div>
      ) : (
        <PhoneMenu bar={BAR} brand={<PhoneBrand />}>
          <MenuPanel view={view} entries={entries} links={links} />
        </PhoneMenu>
      )}
    </nav>
  );
}

/** The panel: the tournament card, the menu's blocks (sectionsFor), and the account. */
function MenuPanel({
  view,
  entries,
  links,
}: {
  view: PlayerShellView;
  entries: readonly NavEntry[];
  links: ShellLinks;
}) {
  return (
    <>
      {view.tournament === null ? null : (
        <MenuGroup>
          <div className={RAIL_CARD}>
            <RailTournament
              tournament={view.tournament}
              exitHref={links.tournamentExit}
            />
          </div>
        </MenuGroup>
      )}
      {sectionsFor(view, 'menu', entries).map((section) => (
        <MenuGroup key={section.label} label={section.label}>
          {section.entries.map((entry) => (
            <EntryLink
              key={entry.href}
              entry={entry}
              surface="menu"
              badges={view.badges}
            />
          ))}
        </MenuGroup>
      ))}
      <MenuGroup label="Paskyra">
        {links.profile === null ? null : (
          <NavLink href={links.profile} styles={MENU_LINK}>
            <Icon name="person-fill" /> Profilis
          </NavLink>
        )}
        {view.player.isAdmin && links.admin !== null ? (
          <NavLink href={links.admin} styles={MENU_LINK}>
            <Icon name="database-gear" /> Admin
          </NavLink>
        ) : null}
        <SignOut
          formId="logout-form-m"
          className={`${MENU_LINK.base} ${MENU_LINK.idle} cursor-pointer border-none bg-transparent text-left`}
        />
      </MenuGroup>
    </>
  );
}

/** .sb-mobile-group with its .sb-mobile-label; a line between groups. */
function MenuGroup({
  label = null,
  children,
}: {
  label?: string | null;
  children: ReactNode;
}) {
  return (
    <div className="flex flex-col gap-0.5 border-t border-rail-wash-sm px-4 pt-2.5 pb-1 first:border-t-0">
      {label === null ? null : (
        <div className="px-0.5 pb-1 text-[0.65rem] font-bold tracking-[0.6px] text-rail-dim uppercase">
          {label}
        </div>
      )}
      {children}
    </div>
  );
}
```

Replace `apps/web/src/components/shell/bottom-tabs.tsx` with:

```tsx
import { EntryLink } from './entry-link';
import { LeagueSwitcher } from './league-switcher';
import { NAV_ENTRIES, sectionsFor, type NavEntry } from './nav-entries';
import type { ShellView } from './shell-view';

/**
 * A signed-in player's tab bar along the phone's bottom, below 992px
 * (sportbet's partials/bottom-nav, .sb-bottom-nav): a tab per entry, and
 * the league drop-up when the view's leagueTab says so (showsLeagueTab).
 * sportbet always has three tabs; a bar with none would be no navigation
 * at all, so it is not drawn (a 4b player has none yet). `entries` is
 * NAV_ENTRIES except in tests.
 */
export function BottomTabs({
  view,
  entries = NAV_ENTRIES,
}: {
  view: ShellView;
  entries?: readonly NavEntry[];
}) {
  const { leagues } = view;
  const tabs = sectionsFor(view, 'tabs', entries).flatMap(
    (section) => section.entries,
  );
  const leagueTab = view.leagueTab && leagues !== null;
  if (tabs.length === 0 && !leagueTab) return null;
  return (
    <nav
      data-testid="bottom-tabs"
      className="fixed inset-x-0 bottom-0 z-[1025] flex border-t border-rail-line bg-rail pt-1.5 pb-[env(safe-area-inset-bottom,6px)] lg:hidden"
    >
      {tabs.map((entry) => (
        <EntryLink
          key={entry.href}
          entry={entry}
          surface="tabs"
          badges={view.badges}
        />
      ))}
      {leagueTab && leagues !== null ? (
        <LeagueSwitcher leagues={leagues} variant="tab" />
      ) : null}
    </nav>
  );
}
```

Replace `apps/web/src/components/shell/shell.tsx` with:

```tsx
import type { ReactNode } from 'react';
import { BottomTabs } from './bottom-tabs';
import { CookieConsent } from './cookie-consent';
import { GuestRail } from './guest-rail';
import { NAV_ENTRIES, privacyHref, type NavEntry } from './nav-entries';
import { PhoneHeader } from './phone-header';
import { PlayerRail } from './player-rail';
import { SHELL_LINKS, type ShellLinks } from './shell-paths';
import { isPlayerView, type ShellView } from './shell-view';
import { SignInDialog } from './sign-in-dialog';
import type { ShellSignIn } from './sign-in-state';

/**
 * The frame every page sits in (sportbet's layouts/master): the rail from
 * 992px, the phone bar below it, the page in the centred container, the
 * bottom tabs for a player, the cookie banner, and, for a guest, the
 * sign-in dialog. Told everything by the view; `entries` is NAV_ENTRIES
 * and `links` SHELL_LINKS except in tests.
 */
export function Shell({
  view,
  adsenseClient,
  entries = NAV_ENTRIES,
  links = SHELL_LINKS,
  signIn = null,
  children,
}: {
  view: ShellView;
  adsenseClient: string | null;
  entries?: readonly NavEntry[];
  links?: ShellLinks;
  signIn?: ShellSignIn | null;
  children: ReactNode;
}) {
  return (
    // .sb-layout (its colours and font are sportbet's body rule, globals.css)
    <div className="flex min-h-screen flex-col">
      {/* .sb-shell: two columns from 992px, the rail's 212px and the rest */}
      <div className="grid min-h-screen grid-cols-1 lg:grid-cols-[212px_1fr]">
        {isPlayerView(view) ? (
          <PlayerRail view={view} entries={entries} links={links} />
        ) : (
          <GuestRail view={view} entries={entries} />
        )}
        {/* .sb-shell-main: min-w-0 lets the column shrink below its content on a phone */}
        <div className="flex min-h-full min-w-0 flex-col">
          <PhoneHeader view={view} entries={entries} links={links} />
          {/* .sb-main and .sb-container: sideways overflow is clipped here,
              never on <body> (sportbet's LayoutOverflowRegressionTest) */}
          <main className="flex-1 overflow-x-hidden pt-6 pb-[calc(72px_+_env(safe-area-inset-bottom,0px))] lg:pb-6">
            <div className="mx-auto w-full max-w-[1280px] px-5">{children}</div>
          </main>
        </div>
      </div>
      {isPlayerView(view) ? <BottomTabs view={view} entries={entries} /> : null}
      <CookieConsent
        adsenseClient={adsenseClient}
        privacyHref={privacyHref(entries)}
      />
      {signIn !== null && !isPlayerView(view) ? (
        <SignInDialog {...signIn} />
      ) : null}
    </div>
  );
}
```

- [ ] **Step 9: Run them to see them pass**

Run: `pnpm --filter @sportbet/web exec vitest run --config vitest.component.config.ts && pnpm --filter @sportbet/web typecheck`
Expected: PASS - every component test, the changed ones and the new ones; typecheck clean.

- [ ] **Step 10: Hand to the lead.** Files above; `pnpm format && pnpm lint` clean. Commit message: `feat(web): "Prisijungti" and sportbet's sign-in dialog; the shell links only to pages that exist (#16)`.

---

### Task 15 (web-dev): Signing in, signing out, and the shell switched on **(sensitive)**

**Q3 must be answered first** (Task 0).

**Files:**
- Create (under `apps/web/src/server/sign-in/`): `send-code.ts`, `request-code.ts`, `verify-code.ts`, `dialog.ts`, `sign-in-action.ts`; `apps/web/src/app/login/route.ts`, `apps/web/src/app/logout/route.ts`; `apps/web/tests/support/browser.ts`, `mail-catcher.ts`, `mailpit.ts`, `accounts.ts`; `apps/web/tests/feature/sign-in.test.ts`
- Modify: `apps/web/src/app/layout.tsx`, `apps/web/tests/support/app.ts`, `apps/web/tests/feature/global-setup.ts`, `apps/web/tests/feature/health-down.test.ts`, `apps/web/src/components/shell/shell-paths.test.ts`

sportbet's `EmailCodeLoginController` (request, verify, cancel), `AuthenticatedSessionController` (`/login`, sign-out), `AuthDialogComposer`, and the tests that pin them (`EmailCodeLoginTest`, `LoginCodeStepTest`, `SignInDialogTest`, `AuditLoginTest`, `SessionCookieSecurityTest`).

- [ ] **Step 1: The feature harness**

`apps/web/tests/support/mail-catcher.ts`:

```ts
import { createServer, type IncomingMessage, type ServerResponse } from 'node:http';
import { z } from 'zod';

export interface MailCatcher {
  readonly url: string;
  readonly stop: () => Promise<void>;
}

const sentSchema = z.object({
  From: z.object({ Email: z.string(), Name: z.string() }),
  To: z.array(z.object({ Email: z.string() })).min(1),
  Subject: z.string(),
  HTML: z.string(),
  Text: z.string(),
});

interface Caught {
  readonly ID: string;
  readonly to: string;
  readonly Subject: string;
  readonly Text: string;
  readonly HTML: string;
}

async function bodyOf(request: IncomingMessage): Promise<unknown> {
  const chunks: Buffer[] = [];
  for await (const chunk of request) {
    chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(String(chunk)));
  }
  try {
    const parsed: unknown = JSON.parse(Buffer.concat(chunks).toString('utf8'));
    return parsed;
  } catch {
    return null;
  }
}

/**
 * A stand-in for the part of Mailpit's HTTP API the app and the tests use
 * (spec 4b; the real Mailpit runs in E2E): POST /api/v1/send, GET
 * /api/v1/search?query=to:"<address>" (newest first), GET
 * /api/v1/message/<ID>, DELETE /api/v1/messages. In memory, on a free
 * loopback port: a feature test starts no container (CLAUDE.md).
 */
export async function startMailCatcher(): Promise<MailCatcher> {
  const caught: Caught[] = [];
  let sent = 0;
  const reply = (response: ServerResponse, status: number, body: unknown) => {
    response.writeHead(status, { 'Content-Type': 'application/json' });
    response.end(JSON.stringify(body));
  };
  const handle = async (request: IncomingMessage, response: ServerResponse) => {
    const url = new URL(request.url ?? '/', 'http://catcher');
    if (request.method === 'POST' && url.pathname === '/api/v1/send') {
      const message = sentSchema.safeParse(await bodyOf(request));
      if (!message.success) {
        reply(response, 400, { Error: 'not a message' });
        return;
      }
      sent += 1;
      const ID = String(sent);
      for (const { Email } of message.data.To) {
        caught.push({
          ID,
          to: Email,
          Subject: message.data.Subject,
          Text: message.data.Text,
          HTML: message.data.HTML,
        });
      }
      reply(response, 200, { ID });
      return;
    }
    if (request.method === 'GET' && url.pathname === '/api/v1/search') {
      const address = /^to:"(.*)"$/.exec(url.searchParams.get('query') ?? '')?.[1];
      const messages = caught
        .filter(({ to }) => to === address)
        .toReversed()
        .map(({ ID, to, Subject }) => ({ ID, To: [{ Address: to }], Subject }));
      reply(response, 200, { messages, messages_count: messages.length });
      return;
    }
    const id = /^\/api\/v1\/message\/(.+)$/.exec(url.pathname)?.[1];
    if (request.method === 'GET' && id !== undefined) {
      const found = caught.find(({ ID }) => ID === id);
      if (found === undefined) {
        reply(response, 404, {});
        return;
      }
      reply(response, 200, {
        ID: found.ID,
        To: [{ Address: found.to }],
        Subject: found.Subject,
        Text: found.Text,
        HTML: found.HTML,
      });
      return;
    }
    if (request.method === 'DELETE' && url.pathname === '/api/v1/messages') {
      caught.length = 0;
      reply(response, 200, {});
      return;
    }
    reply(response, 404, {});
  };
  const server = createServer((request, response) => {
    void handle(request, response);
  });
  await new Promise<void>((resolve) => {
    server.listen(0, '127.0.0.1', resolve);
  });
  const address = server.address();
  if (address === null || typeof address === 'string') {
    throw new Error('mail catcher: no port');
  }
  return {
    url: `http://127.0.0.1:${String(address.port)}`,
    stop: () =>
      new Promise((resolve, reject) => {
        server.close((error) => {
          if (error === undefined) resolve();
          else reject(error);
        });
      }),
  };
}
```

`apps/web/tests/support/mailpit.ts`:

```ts
import { z } from 'zod';

// Reading codes back from Mailpit's API - the real one in E2E, the
// stand-in (mail-catcher.ts) in feature tests.

const searchSchema = z.object({ messages: z.array(z.object({ ID: z.string() })) });
const messageSchema = z.object({ Text: z.string() });
const CODE = /\b(\d{8})\b/;

/** Every code mailed to `address`, oldest first. */
export async function codesTo(
  mailpitUrl: string,
  address: string,
): Promise<string[]> {
  const search = new URL('/api/v1/search', mailpitUrl);
  search.searchParams.set('query', `to:"${address}"`);
  const found = searchSchema.parse(await (await fetch(search)).json());
  const codes: string[] = [];
  for (const { ID } of found.messages.toReversed()) {
    const message = messageSchema.parse(
      await (await fetch(new URL(`/api/v1/message/${ID}`, mailpitUrl))).json(),
    );
    const code = CODE.exec(message.Text)?.[1];
    if (code !== undefined) codes.push(code);
  }
  return codes;
}

/**
 * Waits until at least `count` codes have been mailed to `address` - a code
 * goes out after the response - and returns them, oldest first.
 */
export async function waitForCodes(
  mailpitUrl: string,
  address: string,
  count = 1,
  timeoutMs = 10_000,
): Promise<string[]> {
  const deadline = Date.now() + timeoutMs;
  for (;;) {
    const codes = await codesTo(mailpitUrl, address);
    if (codes.length >= count) return codes;
    if (Date.now() > deadline) {
      throw new Error(`mail: ${String(count)} code(s) did not arrive in time`);
    }
    await new Promise((resolve) => setTimeout(resolve, 100));
  }
}

export async function clearMail(mailpitUrl: string): Promise<void> {
  await fetch(new URL('/api/v1/messages', mailpitUrl), { method: 'DELETE' });
}
```

`apps/web/tests/support/browser.ts`:

```ts
import { JSDOM } from 'jsdom';

export interface Page {
  readonly path: string;
  readonly status: number;
  readonly location: string | null;
  readonly html: string;
  readonly setCookies: readonly string[];
}

export interface From {
  /** The Origin header: this site's unless given; null sends none. */
  readonly origin?: string | null;
  readonly secFetchSite?: string;
}

/** The page's document, to read it as a browser would. */
export const documentOf = (page: Page) => new JSDOM(page.html).window.document;

/** The Set-Cookie line `page` sent for `name`, if any. */
export const setCookieFor = (page: Page, name: string) =>
  page.setCookies.find((line) => line.startsWith(`${name}=`));

/**
 * A browser without JavaScript, for feature tests: a cookie jar, a client
 * address (X-Forwarded-For, for the per-IP throttles), and forms submitted
 * as the served HTML writes them - React's hidden $ACTION_* fields
 * included - so Next runs the Server Action and answers with the page a
 * visitor would see (or its redirect).
 */
export class Browser {
  readonly #base: URL;
  readonly #ip: string;
  readonly #jar = new Map<string, string>();

  constructor(base: string, ip: string) {
    this.#base = new URL(base);
    this.#ip = ip;
  }

  get origin(): string {
    return this.#base.origin;
  }

  cookie(name: string): string | undefined {
    return this.#jar.get(name);
  }

  setCookie(name: string, value: string): void {
    this.#jar.set(name, value);
  }

  get(path: string): Promise<Page> {
    return this.#send(path, 'GET', undefined, {});
  }

  post(path: string, body?: FormData, from: From = {}): Promise<Page> {
    return this.#send(path, 'POST', body, from);
  }

  /** Submits the form `data-testid={testId}` on `page`, its fields as served unless `fields` says otherwise. */
  submit(
    page: Page,
    testId: string,
    fields: Readonly<Record<string, string>> = {},
    from: From = {},
  ): Promise<Page> {
    const form = documentOf(page).querySelector(`form[data-testid="${testId}"]`);
    if (form === null) throw new Error(`no form ${testId} on ${page.path}`);
    const body = new FormData();
    for (const input of form.querySelectorAll('input')) {
      if (input.name !== '' && !(input.name in fields)) {
        body.append(input.name, input.value);
      }
    }
    for (const [name, value] of Object.entries(fields)) body.append(name, value);
    return this.post(page.path, body, from);
  }

  async #send(
    path: string,
    method: string,
    body: FormData | undefined,
    from: From,
  ): Promise<Page> {
    const headers: Record<string, string> = { 'X-Forwarded-For': this.#ip };
    const origin = from.origin === undefined ? this.origin : from.origin;
    if (method === 'POST' && origin !== null) headers['Origin'] = origin;
    if (from.secFetchSite !== undefined) headers['Sec-Fetch-Site'] = from.secFetchSite;
    const cookie = [...this.#jar]
      .map(([name, value]) => `${name}=${value}`)
      .join('; ');
    if (cookie !== '') headers['Cookie'] = cookie;
    const response = await fetch(new URL(path, this.#base), {
      method,
      headers,
      redirect: 'manual',
      ...(body === undefined ? {} : { body }),
    });
    const setCookies = response.headers.getSetCookie();
    for (const line of setCookies) {
      const [pair = ''] = line.split(';');
      const at = pair.indexOf('=');
      const name = pair.slice(0, at);
      const value = pair.slice(at + 1);
      if (value === '' || /max-age=0/i.test(line)) this.#jar.delete(name);
      else this.#jar.set(name, value);
    }
    return {
      path,
      status: response.status,
      location: response.headers.get('location'),
      html: await response.text(),
      setCookies,
    };
  }
}
```

`apps/web/tests/support/accounts.ts`:

```ts
import { savePlayers, savePlayerSettings, type Db } from '@sportbet/db';
import { emailAddress, type StoredPlayer } from '@sportbet/domain';
import { player, unwrap } from '@sportbet/domain/testing';

export const JONAS_EMAIL = 'jonas.petraitis@example.lt';
export const ZUKAUSKAS_EMAIL = 'žukauskas@example.lt';

export const JONAS_ACCOUNT: StoredPlayer = {
  id: player('1'),
  username: 'jonas',
  email: unwrap(emailAddress(JONAS_EMAIL)),
  name: 'Jonas',
  surname: 'Petraitis',
};

export const ZUKAUSKAS_ACCOUNT: StoredPlayer = {
  id: player('2'),
  username: 'zuk',
  email: unwrap(emailAddress(ZUKAUSKAS_EMAIL)),
  name: 'Žilvinas',
  surname: 'Žukauskas',
};

/** Saves the accounts with their settings, as every account has (sessions.ts). */
export async function saveAccounts(
  db: Db,
  accounts: readonly StoredPlayer[],
  adminLevel = 0,
): Promise<void> {
  await savePlayers(db, accounts);
  await savePlayerSettings(
    db,
    accounts.map((account) => ({
      player: account.id,
      locale: 'lt',
      adminLevel,
      lastTournament: null,
    })),
  );
}
```

In `apps/web/tests/support/app.ts`, add:

```ts
/** What every feature test's server runs with: its database, the Mailpit stand-in, and a key no environment uses. */
export function appEnv(
  databaseUrl: string,
  mailpitUrl: string,
): Record<string, string> {
  return {
    DATABASE_URL: databaseUrl,
    AUTH_SECRET: 'feature-tests-only-not-a-secret-0123456789',
    MAIL_TRANSPORT: 'mailpit',
    MAILPIT_URL: mailpitUrl,
    MAIL_FROM_ADDRESS: 'noreply@sportbet.test',
  };
}
```

Replace `apps/web/tests/feature/global-setup.ts` with:

```ts
import { startTestDatabase } from '@sportbet/db/testing';
import type { TestProject } from 'vitest/node';
import { appEnv, startServer, type RunningServer } from '../support/app';
import { startMailCatcher } from '../support/mail-catcher';

export default async function setup(
  project: TestProject,
): Promise<() => Promise<void>> {
  const database = await startTestDatabase();
  const mail = await startMailCatcher();
  let server: RunningServer;
  try {
    server = await startServer(appEnv(database.url, mail.url));
  } catch (error) {
    await mail.stop();
    await database.stop();
    throw error;
  }
  project.provide('databaseUrl', database.url);
  project.provide('baseUrl', server.url);
  project.provide('mailpitUrl', mail.url);
  return async () => {
    await server.stop();
    await mail.stop();
    await database.stop();
  };
}

declare module 'vitest' {
  export interface ProvidedContext {
    baseUrl: string;
    mailpitUrl: string;
  }
}
```

In `apps/web/tests/feature/health-down.test.ts`, change the import to `import { appEnv, startServer } from '../support/app';` and the start to `startServer(appEnv(database.url, 'http://127.0.0.1:9'))` (it sends no mail).

- [ ] **Step 2: Write the failing feature test**

`apps/web/tests/feature/sign-in.test.ts`:

```ts
import { useTestDatabase } from '@sportbet/db/testing';
import { beforeEach, describe, expect, inject, it } from 'vitest';
import { z } from 'zod';
import { hashSessionToken } from '../../src/server/session/session-token';
import {
  JONAS_ACCOUNT,
  JONAS_EMAIL,
  saveAccounts,
  ZUKAUSKAS_ACCOUNT,
  ZUKAUSKAS_EMAIL,
} from '../support/accounts';
import {
  Browser,
  documentOf,
  setCookieFor,
  type Page,
} from '../support/browser';
import { clearMail, codesTo, waitForCodes } from '../support/mailpit';

// sportbet's EmailCodeLoginTest, LoginCodeStepTest, SignInDialogTest,
// AuditLoginTest and SessionCookieSecurityTest, against the built app.

const baseUrl = inject('baseUrl');
const mailpitUrl = inject('mailpitUrl');
const { db, client } = useTestDatabase();

const SESSION = '__Host-sb_session';
const PENDING = '__Host-sb_signin';
const OPEN = '__Host-sb_signin_open';

const visitor = (ip = '203.0.113.10') => new Browser(baseUrl, ip);

const rowsIn = async (table: string) =>
  z
    .array(z.object({ rows: z.int() }))
    .parse(
      (await client.query(`select count(*)::int as rows from ${table}`)).rows,
    )[0]?.rows;

const dialogText = (page: Page) =>
  documentOf(page).querySelector('[role="dialog"]')?.textContent ?? '';

async function askForCode(browser: Browser, email: string): Promise<Page> {
  return browser.submit(await browser.get('/'), 'sign-in-request', { email });
}

async function onlyCode(email: string): Promise<string> {
  const [code] = await waitForCodes(mailpitUrl, email);
  if (code === undefined) throw new Error('no code');
  return code;
}

beforeEach(async () => {
  await clearMail(mailpitUrl);
  await saveAccounts(db, [JONAS_ACCOUNT, ZUKAUSKAS_ACCOUNT]);
});

describe('the dialog and /login (SignInDialogTest)', () => {
  it('a guest page carries the dialog, closed, with its address form, and "Prisijungti" leading to /login', async () => {
    const home = await visitor().get('/');
    const page = documentOf(home);
    expect(page.querySelector('[data-testid="sign-in-dialog"]')?.hasAttribute('hidden')).toBe(true);
    expect(page.querySelector('form[data-testid="sign-in-request"]')).not.toBeNull();
    expect(page.querySelectorAll('a[href="/login"]').length).toBeGreaterThanOrEqual(2);
  });

  it('/login renders nothing: it sends a guest to / with the dialog to open there', async () => {
    const browser = visitor();
    const login = await browser.get('/login');
    expect(login.status).toBe(302);
    expect(login.location).toBe('/');
    expect(setCookieFor(login, OPEN)).toMatch(/Max-Age=60/);
    const home = documentOf(await browser.get('/'));
    expect(home.querySelector('[data-testid="sign-in-dialog"]')?.hasAttribute('hidden')).toBe(false);
  });

  it('/login keeps a ?tournament= slug as where sign-in goes, and drops anything else', async () => {
    const browser = visitor();
    await browser.get('/login?tournament=euroleague-2026-27');
    const home = documentOf(await browser.get('/'));
    expect(
      home.querySelector('form[data-testid="sign-in-request"] input[name="next"]')?.getAttribute('value'),
    ).toBe('/tournament/euroleague-2026-27');
    const other = visitor();
    await other.get('/login?tournament=https://evil.example/');
    const plain = documentOf(await other.get('/'));
    expect(
      plain.querySelector('form[data-testid="sign-in-request"] input[name="next"]')?.getAttribute('value'),
    ).toBe('/');
  });
});

describe('asking for a code (EmailCodeLoginController::request)', () => {
  it("shows the code step for the address, mails the account one code, and stores only its hash", async () => {
    const browser = visitor();
    const step = await askForCode(browser, JONAS_EMAIL);
    expect(step.status).toBe(200);
    expect(dialogText(step)).toContain(`Kodą išsiuntėme į ${JONAS_EMAIL}`);
    expect(dialogText(step)).toMatch(/Kodas galioja dar [45]:\d\d/);
    expect(browser.cookie(PENDING)).toBeDefined();
    const code = await onlyCode(JONAS_EMAIL);
    expect(code).toMatch(/^\d{8}$/);
    const stored = await client.query('select email, code_hash from login_codes');
    expect(stored.rows).toHaveLength(1);
    expect(stored.rows[0]).toMatchObject({ email: JONAS_EMAIL });
    expect(JSON.stringify(stored.rows)).not.toContain(code);
  });

  it('answers an address with no account exactly as one with: the same step, the same cookie, and no mail or code (#36)', async () => {
    const known = visitor();
    const unknown = visitor('203.0.113.11');
    const a = await askForCode(known, JONAS_EMAIL);
    const b = await askForCode(unknown, 'nobody@example.lt');
    expect(b.status).toBe(a.status);
    // The same words but the address, and a countdown a second apart at most.
    const words = (page: Page, email: string) =>
      dialogText(page).replace(email, 'X').replace(/\d:\d\d/g, 'm:ss');
    expect(words(b, 'nobody@example.lt')).toBe(words(a, JONAS_EMAIL));
    expect(unknown.cookie(PENDING)).toBeDefined();
    await onlyCode(JONAS_EMAIL);
    expect(await codesTo(mailpitUrl, 'nobody@example.lt')).toEqual([]);
    expect(await rowsIn('login_codes')).toBe(1);
  });

  it('finds the account whatever the case and the spaces typed', async () => {
    const browser = visitor();
    const step = await askForCode(browser, '  Jonas.Petraitis@Example.LT ');
    expect(dialogText(step)).toContain(JONAS_EMAIL);
    const code = await onlyCode(JONAS_EMAIL);
    expect((await browser.submit(step, 'sign-in-verify', { code })).status).toBe(303);
  });

  it('Q2: answers a blank address and one that is not an address in Lithuanian', async () => {
    const browser = visitor();
    const blank = await askForCode(browser, '');
    expect(dialogText(blank)).toContain('Įveskite el. pašto adresą.');
    const bad = await askForCode(browser, 'jonas');
    expect(dialogText(bad)).toContain('Įveskite teisingą el. pašto adresą.');
    expect(browser.cookie(PENDING)).toBeUndefined();
  });

  it('acknowledges a resend, and the new code supersedes the old one', async () => {
    const browser = visitor();
    const first = await askForCode(browser, JONAS_EMAIL);
    await onlyCode(JONAS_EMAIL);
    const second = await browser.submit(first, 'sign-in-resend');
    expect(dialogText(second)).toContain('Kodą išsiuntėme iš naujo.');
    const [old, current] = await waitForCodes(mailpitUrl, JONAS_EMAIL, 2);
    if (old === undefined || current === undefined) throw new Error('two codes');
    expect(dialogText(await browser.submit(second, 'sign-in-verify', { code: old }))).toContain(
      'Neteisingas arba pasibaigęs kodas.',
    );
    expect((await browser.submit(second, 'sign-in-verify', { code: current })).status).toBe(303);
  });

  it('"Atgal" drops the step: the pending cookie goes and the address form is back', async () => {
    const browser = visitor();
    const step = await askForCode(browser, JONAS_EMAIL);
    const back = await browser.submit(step, 'sign-in-cancel');
    expect(browser.cookie(PENDING)).toBeUndefined();
    expect(documentOf(back).querySelector('form[data-testid="sign-in-request"]')).not.toBeNull();
    expect(documentOf(back).querySelector('form[data-testid="sign-in-verify"]')).toBeNull();
  });
});

describe('typing the code (EmailCodeLoginController::verify)', () => {
  it('a right code signs the player in: the session cookie with its flags, back to /, the step gone, an email_code record', async () => {
    const browser = visitor();
    const step = await askForCode(browser, JONAS_EMAIL);
    const signedIn = await browser.submit(step, 'sign-in-verify', { code: await onlyCode(JONAS_EMAIL) });
    // Next answers a Server Action's redirect() with 303 See Other.
    expect(signedIn.status).toBe(303);
    expect(signedIn.location).toBe('/');
    const cookie = setCookieFor(signedIn, SESSION) ?? '';
    expect(cookie).toMatch(/^__Host-sb_session=[A-Za-z0-9_-]{43}\.\d{4}-\d{2}-\d{2};/);
    for (const flag of [/; Path=\//, /; Max-Age=7776000/, /; Secure/, /; HttpOnly/, /; SameSite=lax/i]) {
      expect(cookie).toMatch(flag);
    }
    expect(setCookieFor(signedIn, PENDING)).toMatch(/Max-Age=0/);
    const token = (browser.cookie(SESSION) ?? '').split('.')[0] ?? '';
    const sessions = await client.query('select token_hash from sessions');
    expect(sessions.rows).toEqual([{ token_hash: hashSessionToken(token) }]);
    const audit = await client.query('select player_id, method from audit_logins');
    expect(audit.rows).toEqual([{ player_id: 1, method: 'email_code' }]);
    const home = await browser.get('/');
    expect(documentOf(home).querySelector('[data-testid="rail"]')?.textContent).toContain('Jonas P.');
    expect(documentOf(home).querySelector('[data-testid="sign-in-dialog"]')).toBeNull();
  });

  it('goes where /login?tournament= said, after sign-in', async () => {
    const browser = visitor();
    await browser.get('/login?tournament=euroleague-2026-27');
    const step = await askForCode(browser, JONAS_EMAIL);
    const signedIn = await browser.submit(step, 'sign-in-verify', { code: await onlyCode(JONAS_EMAIL) });
    expect(signedIn.location).toBe('/tournament/euroleague-2026-27');
  });

  it('refuses a wrong code with the one answer, and still takes the right one after', async () => {
    const browser = visitor();
    const step = await askForCode(browser, JONAS_EMAIL);
    const code = await onlyCode(JONAS_EMAIL);
    const wrong = code === '00000000' ? '11111111' : '00000000';
    const refused = await browser.submit(step, 'sign-in-verify', { code: wrong });
    expect(refused.status).toBe(200);
    expect(dialogText(refused)).toContain('Neteisingas arba pasibaigęs kodas.');
    expect(browser.cookie(SESSION)).toBeUndefined();
    expect((await browser.submit(step, 'sign-in-verify', { code })).status).toBe(303);
  });

  it('refuses an expired code with the same answer', async () => {
    const browser = visitor();
    const step = await askForCode(browser, JONAS_EMAIL);
    const code = await onlyCode(JONAS_EMAIL);
    await client.query("update login_codes set expires_at = now() - interval '1 second'");
    expect(dialogText(await browser.submit(step, 'sign-in-verify', { code }))).toContain(
      'Neteisingas arba pasibaigęs kodas.',
    );
  });

  it('refuses a code used once already', async () => {
    const browser = visitor();
    const step = await askForCode(browser, JONAS_EMAIL);
    const pending = browser.cookie(PENDING) ?? '';
    const code = await onlyCode(JONAS_EMAIL);
    expect((await browser.submit(step, 'sign-in-verify', { code })).status).toBe(303);
    const again = visitor('203.0.113.12');
    again.setCookie(PENDING, pending);
    expect(dialogText(await again.submit(step, 'sign-in-verify', { code }))).toContain(
      'Neteisingas arba pasibaigęs kodas.',
    );
    expect(await rowsIn('sessions')).toBe(1);
  });

  it("#41: the ASCII spelling of an accented address gets no code, and cannot claim the accented one's", async () => {
    const ascii = visitor();
    const accented = visitor('203.0.113.13');
    const asciiStep = await askForCode(ascii, 'zukauskas@example.lt');
    const accentedStep = await askForCode(accented, ZUKAUSKAS_EMAIL);
    const code = await onlyCode(ZUKAUSKAS_EMAIL);
    expect(await codesTo(mailpitUrl, 'zukauskas@example.lt')).toEqual([]);
    expect(await rowsIn('login_codes')).toBe(1);
    expect(dialogText(await ascii.submit(asciiStep, 'sign-in-verify', { code }))).toContain(
      'Neteisingas arba pasibaigęs kodas.',
    );
    expect((await accented.submit(accentedStep, 'sign-in-verify', { code })).status).toBe(303);
  });

  it('asks for the address first when no code was asked for in this browser', async () => {
    const step = await askForCode(visitor(), JONAS_EMAIL);
    const stranger = visitor('203.0.113.14');
    expect(dialogText(await stranger.submit(step, 'sign-in-verify', { code: '12345678' }))).toContain(
      'Pirmiausia įveskite el. pašto adresą.',
    );
  });

  it('Q2: answers a blank code in Lithuanian', async () => {
    const browser = visitor();
    const step = await askForCode(browser, JONAS_EMAIL);
    expect(dialogText(await browser.submit(step, 'sign-in-verify', { code: '' }))).toContain(
      'Įveskite kodą.',
    );
  });

  it('sends a signed-in visitor at /login to / without opening anything', async () => {
    const browser = visitor();
    const step = await askForCode(browser, JONAS_EMAIL);
    await browser.submit(step, 'sign-in-verify', { code: await onlyCode(JONAS_EMAIL) });
    const login = await browser.get('/login');
    expect(login.location).toBe('/');
    expect(setCookieFor(login, OPEN)).toBeUndefined();
  });
});
```

In `apps/web/src/components/shell/shell-paths.test.ts`, add:

```ts
it("serves sign-in and sign-out at sportbet's URLs", () => {
  expect(existsSync(join(APP, 'login', 'route.ts'))).toBe(true);
  expect(existsSync(join(APP, 'logout', 'route.ts'))).toBe(true);
});
```

- [ ] **Step 3: Run it to see it fail**

Run: `pnpm build && pnpm --filter @sportbet/web exec vitest run --config vitest.feature.config.ts tests/feature/sign-in.test.ts`
Expected: FAIL - the page has no `sign-in-dialog` (the layout still draws `guestView()` without one) and `/login` answers 404.

- [ ] **Step 4: Mail the code after the response**

`apps/web/src/server/sign-in/send-code.ts`:

```ts
import { issueLoginCode } from '@sportbet/db';
import type { EmailAddress, Instant } from '@sportbet/domain';
import { env } from '../../env';
import { getDb } from '../db';
import { createMailer } from '../mail/create-mailer';
import { loginCodeMail } from '../mail/login-code-mail';
import { MailDeliveryError } from '../mail/mail';
import { generateLoginCode, hashLoginCode } from './code-hash';

/** What a failure is, for the log: the mail service's status, or the error's kind. Never its message, which can quote a row. */
const kindOf = (error: unknown) =>
  error instanceof MailDeliveryError
    ? error.message
    : error instanceof Error
      ? error.name
      : 'unknown error';

/**
 * Mints a sign-in code for an account's address, stores its hash (voiding
 * the live one) and mails it. Run after the response, never queued
 * (sportbet's dispatch()->afterResponse(), #36 item 1). A failure is
 * logged by its kind only - never the address, never the code (#36 item
 * 3) - and the visitor's answer, already sent, cannot change.
 */
export async function sendLoginCode(
  email: EmailAddress,
  now: Instant,
): Promise<void> {
  try {
    const code = generateLoginCode();
    await issueLoginCode(getDb(), {
      email,
      purpose: 'login',
      codeHash: await hashLoginCode(code),
      now,
    });
    await createMailer(env()).send(loginCodeMail(email, code));
  } catch (error) {
    console.error(`sign-in: a login code could not be sent (${kindOf(error)})`);
  }
}
```

- [ ] **Step 5: Request, verify, cancel**

`apps/web/src/server/sign-in/request-code.ts`:

```ts
import { findAccountByEmail, pruneSignInState } from '@sportbet/db';
import { emailAddress } from '@sportbet/domain';
import { cookies } from 'next/headers';
import { after } from 'next/server';
import {
  OPEN_SIGN_IN_COOKIE,
  type SignInState,
} from '../../components/shell/sign-in-state';
import { env } from '../../env';
import { now } from '../clock';
import { getDb } from '../db';
import { formText } from '../request/form-input';
import { safeNextPath } from '../request/next-path';
import { cleared } from '../session/session-cookie';
import {
  OPEN_SIGN_IN_COOKIE_OPTIONS,
  openPending,
  PENDING_COOKIE,
  PENDING_COOKIE_OPTIONS,
  sealPending,
} from './pending';
import { sendLoginCode } from './send-code';
import { SIGN_IN_TEXT, throttledText } from './texts';
import { codeRequestLimits, throttle } from './throttle';

const refused = (message: string): SignInState => ({
  kind: 'refused',
  field: 'email',
  message,
});

/**
 * EmailCodeLoginController::request: throttled first, then the address
 * checked. The answer - the code step, its cookie, its timing - is the
 * same whether or not the address has an account (#36): the code is
 * minted, stored and mailed after the response, and only for an account.
 * A request for the address the step already showed is a resend
 * (issue 114).
 */
export async function requestCode(
  form: FormData,
  ip: string,
): Promise<SignInState> {
  const db = getDb();
  const at = now();
  const typed = formText(form, 'email');
  const verdict = await throttle(db, codeRequestLimits(typed, ip), at);
  if (!verdict.allowed) return refused(throttledText(verdict.minutes));
  if (typed === '') return refused(SIGN_IN_TEXT.emailRequired);
  const email = emailAddress(typed);
  if (!email.ok) return refused(SIGN_IN_TEXT.emailInvalid);
  const jar = await cookies();
  const secret = env().AUTH_SECRET;
  const previous = openPending(jar.get(PENDING_COOKIE)?.value, secret);
  const account = await findAccountByEmail(db, email.value);
  if (account !== undefined) {
    const address = account.email;
    after(() => sendLoginCode(address, at));
  }
  after(async () => {
    try {
      await pruneSignInState(db, at);
    } catch (error) {
      console.error(
        `sign-in: pruning failed (${error instanceof Error ? error.name : 'unknown error'})`,
      );
    }
  });
  jar.set(
    PENDING_COOKIE,
    sealPending(
      {
        email: email.value,
        sentAt: at,
        next: safeNextPath(formText(form, 'next')) ?? previous?.next ?? null,
      },
      secret,
    ),
    PENDING_COOKIE_OPTIONS,
  );
  jar.set(OPEN_SIGN_IN_COOKIE, '', cleared(OPEN_SIGN_IN_COOKIE_OPTIONS));
  return { kind: 'sent', resent: previous?.email === email.value };
}
```

`apps/web/src/server/sign-in/verify-code.ts`:

```ts
import {
  claimLoginCode,
  createSession,
  findAccountByEmail,
  findLiveLoginCode,
  recordLogin,
} from '@sportbet/db';
import { utcDay } from '@sportbet/domain';
import { cookies } from 'next/headers';
import { redirect } from 'next/navigation';
import { PLAYER_HOME } from '../../components/shell/shell-paths';
import type { SignInState } from '../../components/shell/sign-in-state';
import { env } from '../../env';
import { now } from '../clock';
import { getDb } from '../db';
import { formText } from '../request/form-input';
import {
  cleared,
  SESSION_COOKIE,
  SESSION_COOKIE_OPTIONS,
  sessionCookieValue,
} from '../session/session-cookie';
import { hashSessionToken, newSessionToken } from '../session/session-token';
import { DUMMY_CODE_HASH, loginCodeMatches } from './code-hash';
import { openPending, PENDING_COOKIE, PENDING_COOKIE_OPTIONS } from './pending';
import { SIGN_IN_TEXT, throttledText } from './texts';
import { codeVerifyLimits, throttle } from './throttle';

const refused = (message: string): SignInState => ({
  kind: 'refused',
  field: 'code',
  message,
});

/**
 * EmailCodeLoginController::verify, for the address the pending cookie
 * holds: always one full hash comparison - against a dummy of the same
 * cost when no live code exists (#36 item 2) - then the atomic claim, then
 * the account, matched exactly (#41); one answer for every failure. On
 * success: a new session (there is none to fixate: the guest had none), its
 * cookie, the step forgotten, an email_code record (AuditLoginTest), and
 * on to where the visitor came for, else the player's home.
 */
export async function verifyCode(
  form: FormData,
  ip: string,
): Promise<SignInState> {
  const db = getDb();
  const at = now();
  const jar = await cookies();
  const pending = openPending(jar.get(PENDING_COOKIE)?.value, env().AUTH_SECRET);
  const verdict = await throttle(
    db,
    codeVerifyLimits(pending?.email ?? null, ip),
    at,
  );
  if (!verdict.allowed) return refused(throttledText(verdict.minutes));
  const code = formText(form, 'code');
  if (code === '') return refused(SIGN_IN_TEXT.codeRequired);
  if (pending === null) return refused(SIGN_IN_TEXT.noPendingEmail);
  const live = await findLiveLoginCode(db, pending.email, 'login', at);
  const matches = await loginCodeMatches(code, live?.codeHash ?? DUMMY_CODE_HASH);
  const claimed =
    live !== undefined && matches && (await claimLoginCode(db, live.id, at));
  const account = claimed
    ? await findAccountByEmail(db, pending.email)
    : undefined;
  if (account === undefined) return refused(SIGN_IN_TEXT.wrongCode);
  const token = newSessionToken();
  await createSession(db, {
    player: account.player,
    tokenHash: hashSessionToken(token),
    now: at,
  });
  await recordLogin(db, { player: account.player, method: 'email_code', at });
  jar.set(
    SESSION_COOKIE,
    sessionCookieValue({ token, day: utcDay(at) }),
    SESSION_COOKIE_OPTIONS,
  );
  jar.set(PENDING_COOKIE, '', cleared(PENDING_COOKIE_OPTIONS));
  redirect(pending.next ?? PLAYER_HOME);
}
```

`apps/web/src/server/sign-in/sign-in-action.ts`:

```ts
'use server';

import { cookies, headers } from 'next/headers';
import { redirect } from 'next/navigation';
import {
  SIGN_IN_IDLE,
  type SignInState,
} from '../../components/shell/sign-in-state';
import { clientIp } from '../request/client-ip';
import { formText } from '../request/form-input';
import { isSameOrigin } from '../request/same-origin';
import { signedInPlayer } from '../request-context';
import { cleared } from '../session/session-cookie';
import { PENDING_COOKIE, PENDING_COOKIE_OPTIONS } from './pending';
import { requestCode } from './request-code';
import { verifyCode } from './verify-code';

/**
 * The sign-in dialog's one Server Action (spec 4b): ask for a code, type
 * it, or back out, by the form's `intent`. A request from another origin
 * is refused before anything happens (#16; Next lets one without an
 * Origin through), and a signed-in visitor goes to '/', as sportbet's
 * `guest` middleware sent them.
 */
export async function signInAction(
  _state: SignInState,
  form: FormData,
): Promise<SignInState> {
  const requestHeaders = await headers();
  if (!isSameOrigin(requestHeaders)) {
    throw new Error('sign-in: refused a request from another origin');
  }
  if ((await signedInPlayer()) !== null) redirect('/');
  const ip = clientIp(requestHeaders);
  const intent = formText(form, 'intent');
  if (intent === 'request') return requestCode(form, ip);
  if (intent === 'verify') return verifyCode(form, ip);
  if (intent === 'cancel') {
    // EmailCodeLoginController::cancel: forget the step.
    (await cookies()).set(PENDING_COOKIE, '', cleared(PENDING_COOKIE_OPTIONS));
  }
  return SIGN_IN_IDLE;
}
```

`apps/web/src/server/sign-in/dialog.ts`:

```ts
import { codeStepCounters, LOGIN_CODE_TTL_MINUTES } from '@sportbet/domain';
import { cookies } from 'next/headers';
import {
  OPEN_SIGN_IN_COOKIE,
  type ShellSignIn,
  type SignInStep,
} from '../../components/shell/sign-in-state';
import { env } from '../../env';
import { isoSecond, now } from '../clock';
import { safeNextPath } from '../request/next-path';
import { openPending, PENDING_COOKIE } from './pending';
import { signInAction } from './sign-in-action';

/**
 * What a guest's dialog draws (AuthCodeStep::login, AuthDialogComposer):
 * the code step while a code sent to the address typed is still alive - an
 * expired one is dropped, so a dead countdown never opens over a page -
 * else the address form; open on arrival from /login or with a code to
 * type.
 */
export async function guestSignIn(): Promise<ShellSignIn> {
  const jar = await cookies();
  const pending = openPending(jar.get(PENDING_COOKIE)?.value, env().AUTH_SECRET);
  const opened = jar.get(OPEN_SIGN_IN_COOKIE)?.value;
  const counters =
    pending === null ? null : codeStepCounters(pending.sentAt, now());
  const step: SignInStep =
    pending !== null && counters !== null && counters.expiresIn > 0
      ? {
          kind: 'code',
          email: pending.email,
          sentAt: isoSecond(pending.sentAt),
          resendIn: counters.resendIn,
          expiresIn: counters.expiresIn,
        }
      : { kind: 'email' };
  return {
    step,
    open: step.kind === 'code' || opened !== undefined,
    next: pending?.next ?? (opened === undefined ? null : safeNextPath(opened)),
    codeMinutes: LOGIN_CODE_TTL_MINUTES,
    action: signInAction,
  };
}
```

- [ ] **Step 6: `/login` and `/logout`**

`apps/web/src/app/login/route.ts`:

```ts
import { slugInvariant } from '@sportbet/domain';
import { cookies } from 'next/headers';
import { OPEN_SIGN_IN_COOKIE } from '../../components/shell/sign-in-state';
import { signedInPlayer } from '../../server/request-context';
import { OPEN_SIGN_IN_COOKIE_OPTIONS } from '../../server/sign-in/pending';

/**
 * sportbet's AuthenticatedSessionController::create (issue 111): renders
 * nothing; a guest goes to '/' with the sign-in dialog to open there, a
 * `?tournament=` slug kept as where to go after sign-in (spec 4b); a
 * signed-in visitor just goes to '/'.
 */
export async function GET(request: Request): Promise<Response> {
  if ((await signedInPlayer()) === null) {
    const slug = new URL(request.url).searchParams.get('tournament');
    const next =
      slug !== null && slugInvariant.schema.safeParse(slug).success
        ? `/tournament/${slug}`
        : '/';
    (await cookies()).set(OPEN_SIGN_IN_COOKIE, next, OPEN_SIGN_IN_COOKIE_OPTIONS);
  }
  return new Response(null, { status: 302, headers: { Location: '/' } });
}
```

`apps/web/src/app/logout/route.ts`:

```ts
import { deleteSession } from '@sportbet/db';
import { cookies } from 'next/headers';
import { getDb } from '../../server/db';
import { isSameOrigin } from '../../server/request/same-origin';
import {
  cleared,
  readSessionCookie,
  SESSION_COOKIE,
  SESSION_COOKIE_OPTIONS,
} from '../../server/session/session-cookie';
import { hashSessionToken } from '../../server/session/session-token';

/**
 * "Atsijungti" (AuthenticatedSessionController::destroy), at sportbet's URL
 * and method: POST only - Next answers any other method 405 (#16) - and
 * only from this site. It ends this browser's session (Q3) and goes back
 * to '/'.
 */
export async function POST(request: Request): Promise<Response> {
  if (!isSameOrigin(request.headers)) {
    return new Response(null, { status: 403 });
  }
  const jar = await cookies();
  const cookie = readSessionCookie(jar.get(SESSION_COOKIE)?.value);
  if (cookie !== null) {
    await deleteSession(getDb(), hashSessionToken(cookie.token));
  }
  jar.set(SESSION_COOKIE, '', cleared(SESSION_COOKIE_OPTIONS));
  return new Response(null, { status: 302, headers: { Location: '/' } });
}
```

If the owner's answer to Q3 is "every device", call `deleteSessionsOfPlayerBehind` (Task 7) here instead of `deleteSession`, and change the comment's "this browser's session" to "every session of the player".

- [ ] **Step 7: The layout builds the view from the request**

In `apps/web/src/app/layout.tsx`, replace the import `import { guestView } from '../components/shell/shell-view';` with:

```tsx
import { requestContext } from '../server/request-context';
import { shellViewFor } from '../server/shell-for';
import { guestSignIn } from '../server/sign-in/dialog';
```

and the body of `RootLayout` from `await connection();` on with:

```tsx
  // Per request, never at build: the shell's view is this visitor's, read
  // fresh from the request context (decision 5), and ADSENSE_CLIENT is read
  // where the page is served.
  await connection();
  const context = await requestContext();
  const signIn = context.player === null ? await guestSignIn() : null;
  return (
    // The theme script sets data-theme before React hydrates.
    <html lang="lt" className={inter.variable} suppressHydrationWarning>
      <head>
        <ThemeScript />
      </head>
      <body>
        <Shell
          view={shellViewFor(context)}
          signIn={signIn}
          adsenseClient={env().ADSENSE_CLIENT ?? null}
        >
          {children}
        </Shell>
      </body>
    </html>
  );
```

- [ ] **Step 8: Run it to see it pass**

Run: `pnpm build && pnpm --filter @sportbet/web exec vitest run --config vitest.feature.config.ts && pnpm --filter @sportbet/web exec vitest run --config vitest.component.config.ts src/components/shell/shell-paths.test.ts`
Expected: PASS - `sign-in.test.ts` (18 tests) and every earlier feature test (`routes.test.ts` still sees the guest shell). If the harness's first test cannot find `form[data-testid="sign-in-request"]`, the layout is not drawing the dialog; if a `submit` answers 404 or 500 with `Failed to find Server Action`, the posted fields lost React's `$ACTION_*` inputs - print `documentOf(page).querySelector('form[data-testid=...]')?.outerHTML` to see what the server rendered.

- [ ] **Step 9: Hand to the lead.** Files above; `pnpm format && pnpm lint && pnpm typecheck` clean. Commit message: `feat(web): code sign-in and sign-out, as sportbet's; the player shell switched on (#16)`.

---

### Task 16 (web-dev): Throttles, cross-origin refusals, the session's life and nothing personal on the page **(sensitive)**

**Files:**
- Create: `apps/web/tests/feature/sign-in-guards.test.ts`, `apps/web/tests/feature/session.test.ts`
- Modify: `apps/web/tests/feature/startup.test.ts`

Every #16 note and every sportbet throttle gets a named test against the built app. These test code that Tasks 13 and 15 wrote; a failure here is a bug to fix there.

- [ ] **Step 1: Write the tests**

`apps/web/tests/feature/sign-in-guards.test.ts`:

```ts
import { useTestDatabase } from '@sportbet/db/testing';
import { beforeEach, describe, expect, inject, it } from 'vitest';
import { z } from 'zod';
import { JONAS_ACCOUNT, JONAS_EMAIL, saveAccounts } from '../support/accounts';
import { Browser, documentOf, setCookieFor, type Page } from '../support/browser';
import { clearMail, codesTo, waitForCodes } from '../support/mailpit';

// sportbet's throttle tests (EmailCodeLoginTest) and #16's CSRF notes.

const baseUrl = inject('baseUrl');
const mailpitUrl = inject('mailpitUrl');
const { db, client } = useTestDatabase();

const SESSION = '__Host-sb_session';
const PENDING = '__Host-sb_signin';
const THROTTLED = 'Per daug bandymų. Pabandykite dar kartą po 10 min.';
const EVIL = 'https://evil.example';

const visitor = (ip = '198.51.100.10') => new Browser(baseUrl, ip);
const dialogText = (page: Page) =>
  documentOf(page).querySelector('[role="dialog"]')?.textContent ?? '';
const rowsIn = async (table: string) =>
  z
    .array(z.object({ rows: z.int() }))
    .parse(
      (await client.query(`select count(*)::int as rows from ${table}`)).rows,
    )[0]?.rows;

async function askForCode(browser: Browser, email: string): Promise<Page> {
  return browser.submit(await browser.get('/'), 'sign-in-request', { email });
}

async function signedIn(): Promise<Browser> {
  const browser = visitor();
  const step = await askForCode(browser, JONAS_EMAIL);
  const [code] = await waitForCodes(mailpitUrl, JONAS_EMAIL);
  if (code === undefined) throw new Error('no code');
  await browser.submit(step, 'sign-in-verify', { code });
  return browser;
}

beforeEach(async () => {
  await clearMail(mailpitUrl);
  await saveAccounts(db, [JONAS_ACCOUNT]);
});

describe('the throttles (AppServiceProvider)', () => {
  it('a code request: the fourth for one address in ten minutes is refused, and mints nothing', async () => {
    const browser = visitor();
    for (let attempt = 0; attempt < 3; attempt += 1) {
      expect(dialogText(await askForCode(browser, JONAS_EMAIL))).not.toContain(THROTTLED);
    }
    await waitForCodes(mailpitUrl, JONAS_EMAIL, 3);
    expect(dialogText(await askForCode(browser, JONAS_EMAIL))).toContain(THROTTLED);
    await new Promise((resolve) => setTimeout(resolve, 500));
    expect(await codesTo(mailpitUrl, JONAS_EMAIL)).toHaveLength(3);
    expect(await rowsIn('login_codes')).toBe(3);
  });

  it('a code request: the eleventh from one IP in ten minutes is refused, across addresses', async () => {
    const browser = visitor('198.51.100.20');
    for (let attempt = 0; attempt < 10; attempt += 1) {
      expect(
        dialogText(await askForCode(browser, `guest${String(attempt)}@example.lt`)),
      ).not.toContain(THROTTLED);
    }
    expect(dialogText(await askForCode(browser, 'overflow@example.lt'))).toContain(THROTTLED);
  });

  it('a blank address counts on its own IP key: another IP is answered by validation, not the throttle', async () => {
    const first = visitor('198.51.100.30');
    for (let attempt = 0; attempt < 3; attempt += 1) await askForCode(first, '');
    expect(dialogText(await askForCode(first, ''))).toContain(THROTTLED);
    const second = dialogText(await askForCode(visitor('198.51.100.31'), ''));
    expect(second).not.toContain(THROTTLED);
    expect(second).toContain('Įveskite el. pašto adresą.');
  });

  it('a verify: the sixth for one pending address in ten minutes is refused, on the code', async () => {
    const browser = visitor('198.51.100.40');
    const step = await askForCode(browser, JONAS_EMAIL);
    for (let attempt = 0; attempt < 5; attempt += 1) {
      expect(dialogText(await browser.submit(step, 'sign-in-verify', { code: 'x' }))).toContain(
        'Neteisingas arba pasibaigęs kodas.',
      );
    }
    expect(dialogText(await browser.submit(step, 'sign-in-verify', { code: 'x' }))).toContain(
      THROTTLED,
    );
  });

  it('a verify: the sixteenth from one IP in ten minutes is refused, across addresses', async () => {
    const ip = '198.51.100.50';
    for (const address of ['a@example.lt', 'b@example.lt', 'c@example.lt']) {
      const browser = visitor(ip);
      const step = await askForCode(browser, address);
      for (let attempt = 0; attempt < 5; attempt += 1) {
        await browser.submit(step, 'sign-in-verify', { code: 'x' });
      }
    }
    const fourth = visitor(ip);
    const step = await askForCode(fourth, 'd@example.lt');
    expect(dialogText(await fourth.submit(step, 'sign-in-verify', { code: 'x' }))).toContain(
      THROTTLED,
    );
  });
});

// #16: every state-changing request refuses another origin, and changes nothing.
describe('cross-origin requests', () => {
  it.each(['sign-in-request', 'sign-in-verify', 'sign-in-cancel'])(
    'the %s form posted from another site is refused and changes nothing',
    async (testId) => {
      const browser = visitor('198.51.100.60');
      const step = await askForCode(browser, JONAS_EMAIL);
      const pending = browser.cookie(PENDING);
      await waitForCodes(mailpitUrl, JONAS_EMAIL);
      const form = testId === 'sign-in-request' ? await browser.get('/') : step;
      const fields: Record<string, string> =
        testId === 'sign-in-request'
          ? { email: JONAS_EMAIL }
          : testId === 'sign-in-verify'
            ? { code: '12345678' }
            : {};
      const refused = await browser.submit(form, testId, fields, { origin: EVIL });
      expect(refused.status).toBeGreaterThanOrEqual(400);
      expect(setCookieFor(refused, PENDING)).toBeUndefined();
      expect(setCookieFor(refused, SESSION)).toBeUndefined();
      expect(browser.cookie(PENDING)).toBe(pending);
      expect(await rowsIn('login_codes')).toBe(1);
      expect(await rowsIn('sessions')).toBe(0);
    },
  );

  it('a request with no Origin is refused unless Sec-Fetch-Site says it is this site', async () => {
    const browser = visitor('198.51.100.61');
    const home = await browser.get('/');
    for (const from of [{ origin: null }, { origin: null, secFetchSite: 'cross-site' }]) {
      const refused = await browser.submit(home, 'sign-in-request', { email: JONAS_EMAIL }, from);
      expect(refused.status).toBeGreaterThanOrEqual(400);
    }
    expect(browser.cookie(PENDING)).toBeUndefined();
  });

  it('sign-out from another site is refused, and the player stays signed in', async () => {
    const browser = await signedIn();
    const refused = await browser.post('/logout', undefined, { origin: EVIL });
    expect(refused.status).toBe(403);
    expect(await rowsIn('sessions')).toBe(1);
  });
});

describe('/logout', () => {
  it('refuses a GET (405) and signs no one out', async () => {
    const browser = await signedIn();
    expect((await browser.get('/logout')).status).toBe(405);
    expect(await rowsIn('sessions')).toBe(1);
  });

  it('a POST ends the session, clears the cookie and goes back to /', async () => {
    const browser = await signedIn();
    const out = await browser.post('/logout');
    expect(out.status).toBe(302);
    expect(out.location).toBe('/');
    expect(setCookieFor(out, SESSION)).toMatch(/Max-Age=0.*Secure|Secure.*Max-Age=0/);
    expect(await rowsIn('sessions')).toBe(0);
    const home = documentOf(await browser.get('/'));
    expect(home.querySelector('[data-testid="sign-in-dialog"]')).not.toBeNull();
  });
});

it("a signed-in visitor's code request goes to / and mints nothing (sportbet's guest middleware)", async () => {
  const guest = visitor('198.51.100.70');
  const home = await guest.get('/');
  const browser = await signedIn();
  await clearMail(mailpitUrl);
  const answer = await browser.submit(home, 'sign-in-request', { email: JONAS_EMAIL });
  expect(answer.status).toBe(303);
  expect(answer.location).toBe('/');
  await new Promise((resolve) => setTimeout(resolve, 500));
  expect(await codesTo(mailpitUrl, JONAS_EMAIL)).toEqual([]);
});
```

`apps/web/tests/feature/session.test.ts`:

```ts
import { createSession, insertTournaments, listTournaments } from '@sportbet/db';
import { useTestDatabase } from '@sportbet/db/testing';
import { secondsAfter, utcDay } from '@sportbet/domain';
import { describe, expect, inject, it } from 'vitest';
import { z } from 'zod';
import { now } from '../../src/server/clock';
import {
  hashSessionToken,
  newSessionToken,
} from '../../src/server/session/session-token';
import { JONAS_ACCOUNT, saveAccounts } from '../support/accounts';
import { Browser, documentOf, setCookieFor } from '../support/browser';
import { EUROLEAGUE_2026_27 } from '../support/tournaments';

// R-44, and #16: what the page tells the browser about the player.

const baseUrl = inject('baseUrl');
const { db, client } = useTestDatabase();

const SESSION = '__Host-sb_session';
const DAY = 86_400;

/** A browser holding a session for Jonas that began `daysAgo` days ago and was last re-issued then. */
async function sessionFrom(daysAgo: number, adminLevel = 0): Promise<{ browser: Browser; token: string }> {
  await saveAccounts(db, [JONAS_ACCOUNT], adminLevel);
  const token = newSessionToken();
  const began = secondsAfter(now(), -daysAgo * DAY);
  await createSession(db, {
    player: JONAS_ACCOUNT.id,
    tokenHash: hashSessionToken(token),
    now: began,
  });
  const browser = new Browser(baseUrl, '192.0.2.10');
  browser.setCookie(SESSION, `${token}.${utcDay(began)}`);
  return { browser, token };
}

const endOf = async () =>
  z
    .array(z.object({ expires_at: z.date() }))
    .parse((await client.query('select expires_at from sessions')).rows)[0]
    ?.expires_at.getTime() ?? 0;

describe('R-44: a sign-in lasts 90 days from the last visit', () => {
  it('a visit on a new day extends the session to 90 days on and re-issues the cookie for 90 days', async () => {
    const { browser, token } = await sessionFrom(2);
    const before = await endOf();
    const page = await browser.get('/');
    const cookie = setCookieFor(page, SESSION) ?? '';
    expect(cookie).toMatch(new RegExp(`^${SESSION}=${token}\\.${utcDay(now())};`));
    expect(cookie).toMatch(/Max-Age=7776000/);
    const after = await endOf();
    expect(after - before).toBeGreaterThanOrEqual(2 * DAY * 1000 - 60_000);
    expect(Math.abs(after - (now() + 90 * DAY * 1000))).toBeLessThan(60_000);
  });

  it('a visit on the same day writes nothing and re-issues nothing', async () => {
    const { browser } = await sessionFrom(0);
    const before = await endOf();
    const page = await browser.get('/');
    expect(setCookieFor(page, SESSION)).toBeUndefined();
    expect(await endOf()).toBe(before);
  });

  it('a session over 90 days old is over: the cookie is cleared and the visitor is a guest', async () => {
    const { browser } = await sessionFrom(91);
    const page = await browser.get('/');
    expect(setCookieFor(page, SESSION)).toMatch(/Max-Age=0/);
    expect(documentOf(page).querySelector('[data-testid="sign-in-dialog"]')).not.toBeNull();
  });

  it('a cookie that is not a session is cleared', async () => {
    const browser = new Browser(baseUrl, '192.0.2.11');
    browser.setCookie(SESSION, 'nonsense');
    expect(setCookieFor(await browser.get('/'), SESSION)).toMatch(/Max-Age=0/);
  });
});

describe("the player's shell (#16)", () => {
  it('reaches the browser with the display name and initials only: no surname, no address', async () => {
    const { browser } = await sessionFrom(0);
    const page = await browser.get('/');
    expect(page.html).toContain('Jonas P.');
    expect(page.html).toContain('>JP<');
    expect(page.html).not.toContain('Petraitis');
    expect(page.html).not.toContain('jonas.petraitis');
    expect(page.html).not.toContain('@example.lt');
  });

  it("shows the tournament the player plays, and links to no page that does not exist - an admin's included", async () => {
    const { browser } = await sessionFrom(0, 9);
    await insertTournaments(db, [EUROLEAGUE_2026_27]);
    const [tournament] = await listTournaments(db);
    if (tournament === undefined) throw new Error('no tournament');
    await client.query(
      `insert into tournament_players (tournament_id, player_id, switched_off, fill_ins) values ($1, 1, false, 0)`,
      [tournament.id],
    );
    const page = documentOf(await browser.get('/'));
    expect(page.querySelector('[data-testid="rail-context"]')?.textContent).toContain(
      tournament.name,
    );
    for (const href of ['/userProfile', '/admin', '/tournaments/exit']) {
      expect(page.querySelector(`a[href="${href}"]`)).toBeNull();
    }
    expect(page.querySelector('form[action="/leagues/switch"]')).toBeNull();
    expect(page.querySelector('[data-testid="bottom-tabs"]')).toBeNull();
    expect(page.querySelector('form[action="/logout"]')).not.toBeNull();
  });
});
```

(`tests/support/tournaments.ts` already exports `EUROLEAGUE_2026_27`, a `NewTournament`; check its name and use it as it is.)

In `apps/web/tests/feature/startup.test.ts`, add:

```ts
/** A server environment that would start, but for what each test takes out or breaks. */
const VALID: Readonly<Record<string, string>> = {
  DATABASE_URL: 'postgres://sportbet@127.0.0.1:1/sportbet',
  AUTH_SECRET: 'startup-tests-only-not-a-secret-0123456789',
  MAIL_TRANSPORT: 'mailpit',
  MAILPIT_URL: 'http://127.0.0.1:1',
  MAIL_FROM_ADDRESS: 'noreply@sportbet.test',
};

const without = (name: string) =>
  Object.fromEntries(Object.entries(VALID).filter(([key]) => key !== name));

it('refuses to start without AUTH_SECRET, naming it', async () => {
  const { code, output } = await runServerUntilExit(without('AUTH_SECRET'));
  expect(code).toBe(1);
  expect(output).toContain('AUTH_SECRET');
});

it('refuses to start with Resend and no key, naming RESEND_API_KEY', async () => {
  const { code, output } = await runServerUntilExit({
    ...without('MAILPIT_URL'),
    MAIL_TRANSPORT: 'resend',
  });
  expect(code).toBe(1);
  expect(output).toContain('RESEND_API_KEY');
});

it("refuses to start with staging's allow-list and no address on it, naming MAIL_ALLOWED_RECIPIENTS", async () => {
  const { code, output } = await runServerUntilExit({
    ...without('MAILPIT_URL'),
    MAIL_TRANSPORT: 'resend-allow-list',
    RESEND_API_KEY: 're_test_123',
  });
  expect(code).toBe(1);
  expect(output).toContain('MAIL_ALLOWED_RECIPIENTS');
});
```

- [ ] **Step 2: Run them**

Run: `pnpm build && pnpm test:feature`
Expected: PASS - `sign-in-guards.test.ts` (13 tests), `session.test.ts` (6), `startup.test.ts` (3 more), and every other feature test. A failure is a bug in Task 13's or 15's code: fix it there (in the same hand-over), never by loosening a test.

- [ ] **Step 3: Hand to the lead.** Files above; `pnpm format && pnpm lint && pnpm typecheck` clean. Commit message: `test(web): sign-in's throttles, cross-origin refusals, the 90-day session and the payload, end to end (#16)`.

---

### Task 17 (devops): Mailpit in CI's E2E stack, the staging account's secret, staging's key **(sensitive)**

**Files:**
- Modify: `infra/compose/e2e.yml`, `infra/compose/staging.yml`, `infra/ci/e2e-stack.sh`, `.github/workflows/ci.yml`

CI's E2E stack gets a real Mailpit (`axllent/mailpit:v1.31.4`, the current release), the web server its mail and key settings, and the seed the test account. The staging deploy seeds the owner's account from a secret, makes staging's `AUTH_SECRET` itself the first time (never printed), and stops early, by name, if a sign-in setting is missing from Vercel. Changing the workflow is a repository change; the first run that creates `AUTH_SECRET` is a cloud change, and waits for the owner's yes (Task 19, step 4).

- [ ] **Step 1: The E2E stack**

Replace `infra/compose/e2e.yml` with:

```yaml
# A throwaway stack for CI's E2E job: database in memory, web on a random
# loopback port (read it with `docker compose port web 3000`), and Mailpit,
# whose API on another random loopback port is where the sign-in journey
# reads its code (`docker compose port mailpit 8025`).
services:
  postgres:
    tmpfs:
      - /var/lib/postgresql

  mailpit:
    image: axllent/mailpit:v1.31.4
    ports:
      - '127.0.0.1::8025'

  seed:
    environment:
      # The one account E2E signs in with: a test address, never a real one.
      STAGING_ACCOUNT_EMAIL: e2e.player@sportbet.test

  web:
    ports:
      - '127.0.0.1::3000'
    environment:
      AUTH_SECRET: e2e-stack-only-not-a-secret-0123456789abcdef
      MAIL_TRANSPORT: mailpit
      MAILPIT_URL: http://mailpit:8025
      MAIL_FROM_ADDRESS: noreply@sportbet.test
    depends_on:
      mailpit:
        condition: service_started
```

In `infra/ci/e2e-stack.sh`, change the usage lines in the header to

```bash
#   WEB_IMAGE=... MIGRATE_IMAGE=... infra/ci/e2e-stack.sh up <project>    # prints the base URL
#   infra/ci/e2e-stack.sh mailpit <project>                               # prints Mailpit's API URL
#   infra/ci/e2e-stack.sh down <project>
```

the `action=` line's message to `usage: e2e-stack.sh up|mailpit|down <project>`, and add before `down)`:

```bash
  mailpit)
    addr="$("${compose[@]}" port mailpit 8025)"
    if [ -z "$addr" ]; then
      echo "e2e-stack.sh: docker compose port mailpit 8025 returned nothing" >&2
      exit 1
    fi
    echo "http://$addr"
    ;;
```

and the last case's message to `usage: e2e-stack.sh up|mailpit|down <project>`.

- [ ] **Step 2: Oracle's staging, for when it comes back**

In `infra/compose/staging.yml`, add under `web:` (before `restart:`):

```yaml
    # Sign-in's settings (apps/web/src/env.ts), from the host's .env. The
    # Oracle deploy is off (decision 12); moving back means adding these
    # there first, or compose refuses to start.
    environment:
      AUTH_SECRET: ${AUTH_SECRET:?AUTH_SECRET is required}
      MAIL_TRANSPORT: ${MAIL_TRANSPORT:?MAIL_TRANSPORT is required}
      MAIL_FROM_ADDRESS: ${MAIL_FROM_ADDRESS:?MAIL_FROM_ADDRESS is required}
      RESEND_API_KEY: ${RESEND_API_KEY:?RESEND_API_KEY is required}
      MAIL_ALLOWED_RECIPIENTS: ${MAIL_ALLOWED_RECIPIENTS:-}
```

and a `seed:` service entry:

```yaml
  seed:
    environment:
      STAGING_ACCOUNT_EMAIL: ${STAGING_ACCOUNT_EMAIL:-}
```

- [ ] **Step 3: The workflow**

In `.github/workflows/ci.yml`:

The `e2e` job's step `Start the stack from this commit's images` becomes:

```yaml
      - name: Start the stack from this commit's images
        # Separate assignments, so a failing `up` fails this step (a command
        # substitution inside echo's argument would hide it).
        run: |
          url="$(infra/ci/e2e-stack.sh up "$PROJECT")"
          mailpit="$(infra/ci/e2e-stack.sh mailpit "$PROJECT")"
          echo "E2E_BASE_URL=$url" >> "$GITHUB_ENV"
          echo "E2E_MAILPIT_URL=$mailpit" >> "$GITHUB_ENV"
```

The `staging` job's step `Migrate and seed the Neon staging database` becomes:

```yaml
      - name: Migrate and seed the Neon staging database
        env:
          DATABASE_URL: ${{ secrets.STAGING_DATABASE_URL_UNPOOLED }}
          # The owner's address, for the one staging account (spec 4b).
          STAGING_ACCOUNT_EMAIL: ${{ secrets.STAGING_OWNER_EMAIL }}
        run: |
          if [ -z "$STAGING_ACCOUNT_EMAIL" ]; then
            echo "::error::The STAGING_OWNER_EMAIL secret is not set: staging would have no account to sign in with."
            exit 1
          fi
          node packages/db/dist/migrate.mjs
          node packages/db/dist/seed-staging.mjs
```

and after `- run: npm install --global vercel@61.0.0`, add:

```yaml
      # The pending sign-in cookie's key (apps/web/src/env.ts): made on the
      # runner the first time, piped into the Vercel project, never printed
      # (the owner agreed, #16). Then every sign-in setting must be there, or
      # the new deployment would refuse to start.
      - name: Staging's sign-in settings
        run: |
          listed="$(vercel env ls production --token="$VERCEL_TOKEN" 2>/dev/null)"
          if ! grep -qw AUTH_SECRET <<< "$listed"; then
            openssl rand -base64 48 | tr -d '\n' \
              | vercel env add AUTH_SECRET production --sensitive --token="$VERCEL_TOKEN" >/dev/null
            echo "::notice::Created staging's AUTH_SECRET"
            listed="$(vercel env ls production --token="$VERCEL_TOKEN" 2>/dev/null)"
          fi
          for name in AUTH_SECRET MAIL_TRANSPORT MAIL_FROM_ADDRESS RESEND_API_KEY MAIL_ALLOWED_RECIPIENTS; do
            if ! grep -qw "$name" <<< "$listed"; then
              echo "::error::Vercel's production environment has no $name (the 4b plan, Task 19)."
              exit 1
            fi
          done
```

- [ ] **Step 4: Verify on this PC**

```bash
npx --yes vercel@61.0.0 env add --help | grep -n -- '--sensitive'
docker build -q --target web -t sportbet-web:e2e-local .
docker build -q --target migrate -t sportbet-migrate:e2e-local .
url="$(WEB_IMAGE=sportbet-web:e2e-local MIGRATE_IMAGE=sportbet-migrate:e2e-local infra/ci/e2e-stack.sh up sportbet-e2e-local)"
mailpit="$(infra/ci/e2e-stack.sh mailpit sportbet-e2e-local)"
curl -fsS "$url/api/health"
curl -fsS -X POST "$mailpit/api/v1/send" -H 'Content-Type: application/json' \
  -d '{"From":{"Email":"noreply@sportbet.test","Name":"SportBet"},"To":[{"Email":"e2e.player@sportbet.test"}],"Subject":"check","Text":"12345678","HTML":"<p>12345678</p>"}'
curl -fsS "$mailpit/api/v1/search?query=to%3A%22e2e.player%40sportbet.test%22" | grep -c '"ID"'
echo "E2E_BASE_URL=$url E2E_MAILPIT_URL=$mailpit"
```

Expected: a line naming `--sensitive` (if none, drop the flag from the workflow and say so in the hand-over); both images build; `{"status":"ok"}`; `{"ID":"..."}`; `1` or more; the two URLs - give them to `qa` for Task 18, and leave the stack up until `qa` is done, then `infra/ci/e2e-stack.sh down sportbet-e2e-local`. `actionlint` (if installed: `actionlint .github/workflows/ci.yml`) is clean.

- [ ] **Step 5: Hand to the lead.** Files above; the outputs of Step 4. Commit message: `ci: Mailpit in the E2E stack; staging's account from STAGING_OWNER_EMAIL, its AUTH_SECRET made once, its sign-in settings checked (#16)`.

---

### Task 18 (qa): The sign-in journey end to end, and its smoke

**Files:**
- Create: `apps/web/e2e/sign-in.spec.ts`
- Modify: `apps/web/playwright.config.ts`, `apps/web/smoke/smoke.test.ts`

At 390 and 1280 (spec 4b, Testing): sign in through the dialog with a code read from Mailpit, see the player shell, sign out. Only CI's stack has Mailpit; against staging (Resend, allow-listed to the owner) the journey is left out by configuration - not skipped - and the owner signs in by hand (Task 22).

- [ ] **Step 1: Write the spec**

`apps/web/e2e/sign-in.spec.ts`:

```ts
import { expect, test, type Page } from '@playwright/test';
import { clearMail, waitForCodes } from '../tests/support/mailpit';

// The sign-in journey (spec 4b, issue #16): "Prisijungti", an address, the
// code from Mailpit, the player shell, sign-out. The stack seeds one
// account at this address (infra/compose/e2e.yml); only CI's stack has
// Mailpit, so playwright.config.ts leaves this file out against staging.

const MAILPIT = process.env['E2E_MAILPIT_URL'] ?? '';
const PLAYER = 'e2e.player@sportbet.test';

// One account, one inbox: one journey at a time.
test.describe.configure({ mode: 'serial' });

/** From an open dialog to a signed-in page: the address, the mailed code. */
async function signIn(page: Page): Promise<void> {
  await clearMail(MAILPIT);
  const dialog = page.getByRole('dialog', { name: 'Prisijungti' });
  await expect(dialog).toBeVisible();
  await dialog.getByPlaceholder('El. paštas').fill(PLAYER);
  await dialog.getByRole('button', { name: 'Gauti prisijungimo kodą' }).click();
  await expect(dialog.getByText(PLAYER)).toBeVisible();
  const [code] = await waitForCodes(MAILPIT, PLAYER);
  if (code === undefined) throw new Error('no code was mailed');
  await dialog.getByLabel('8 skaitmenų kodas').fill(code);
  await dialog.getByRole('button', { name: 'Prisijungti', exact: true }).click();
  await expect(dialog).toBeHidden();
}

test.describe('at a phone width', () => {
  test.use({ viewport: { width: 390, height: 844 } });

  test('signs in with a mailed code from the phone bar, sees the player shell, and signs out', async ({
    page,
  }) => {
    await page.goto('/');
    const bar = page.getByTestId('phone-header');
    await bar.getByRole('link', { name: 'Prisijungti' }).click();
    await signIn(page);
    await bar.getByRole('button', { name: 'Atidaryti meniu' }).click();
    await expect(bar.getByText('Euroleague 2026/27')).toBeVisible();
    await bar.getByRole('button', { name: 'Atsijungti' }).click();
    await expect(bar.getByRole('link', { name: 'Prisijungti' })).toBeVisible();
    expect(
      await page.evaluate(
        () =>
          document.documentElement.scrollWidth >
          document.documentElement.clientWidth,
      ),
    ).toBe(false);
  });
});

test.describe('at a desktop width', () => {
  test.use({ viewport: { width: 1280, height: 800 } });

  test('signs in with a mailed code from the rail, sees the player shell, and signs out', async ({
    page,
  }) => {
    await page.goto('/');
    const rail = page.getByTestId('rail');
    await rail.getByRole('link', { name: 'Prisijungti' }).click();
    await signIn(page);
    await expect(rail.getByText('Savininkas')).toBeVisible();
    await expect(
      page.getByTestId('rail-context').getByText('Euroleague 2026/27'),
    ).toBeVisible();
    await rail.getByRole('button', { name: 'Atsijungti' }).click();
    await expect(rail.getByRole('link', { name: 'Prisijungti' })).toBeVisible();
  });

  test('/login opens the dialog on the tournaments page', async ({ page }) => {
    await page.goto('/login');
    await expect(page).toHaveURL('/');
    await expect(page.getByRole('dialog', { name: 'Prisijungti' })).toBeVisible();
  });
});
```

- [ ] **Step 2: Leave it out where there is no Mailpit**

In `apps/web/playwright.config.ts`, add below the `baseURL` check:

```ts
// The sign-in journey reads its code from Mailpit, which only CI's stack
// runs; against staging (Resend, allow-listed to the owner) it is left out
// here rather than skipped in the spec.
const mailpit = process.env['E2E_MAILPIT_URL'];
const signInJourney =
  mailpit === undefined || mailpit === '' ? ['**/sign-in.spec.ts'] : [];
```

and add `testIgnore: signInJourney,` to the object passed to `defineConfig`, after `testDir`.

- [ ] **Step 3: The smoke**

In `apps/web/smoke/smoke.test.ts`, add inside the `describe`:

```ts
  it('sends /login to / (the sign-in dialog opens there)', async () => {
    const response = await fetch(new URL('/login', base), { redirect: 'manual' });
    expect(response.status).toBe(302);
    expect(new URL(response.headers.get('location') ?? '', base).pathname).toBe(
      '/',
    );
    await response.text();
  });

  it('refuses a GET to /logout (#16)', async () => {
    const response = await fetch(new URL('/logout', base), { redirect: 'manual' });
    expect(response.status).toBe(405);
    await response.text();
  });
```

- [ ] **Step 4: Run them against the local stack (Task 17, Step 4)**

```bash
export E2E_BASE_URL="http://$(docker port sportbet-e2e-local-web-1 3000)"
export E2E_MAILPIT_URL="$(infra/ci/e2e-stack.sh mailpit sportbet-e2e-local)"
pnpm test:e2e 2>&1 | tail -5
E2E_MAILPIT_URL= pnpm test:e2e 2>&1 | tail -3
```

Expected: every spec passes, `sign-in.spec.ts`'s three tests included; without `E2E_MAILPIT_URL`, the same run lists none of `sign-in.spec.ts`'s tests and passes. (The smoke suite needs HTTPS; it runs against staging in CI after the push.) Then tell `devops` the stack may come down.

- [ ] **Step 5: Hand to the lead.** Files above; `pnpm format && pnpm lint` clean; the run's last lines. Commit message: `test(e2e): sign in with a mailed code at 390 and 1280, see the player shell, sign out; /login and /logout smoke (#16)`.

---

### Task 19 (lead, with the owner): Staging's configuration

**Files:** none. Done before Task 21's push. **Each numbered instruction is one message to the owner; wait for "done" before the next** (the owner's preference). Q4's answer (the sender) must be in hand.

- [ ] **Step 1: The Resend key (owner).** Send:

> Please create a Resend API key for the new app's staging: in resend.com go to API Keys, Create API Key, name it "sportbet_new staging", permission "Sending access", domain the one sportbet sends from. Then in vercel.com open the sportbet_new project, Settings, Environment Variables, add `RESEND_API_KEY` with that key, for the Production environment only, marked Sensitive. Tell me "done" - never paste the key to me.

- [ ] **Step 2: The allow-list (owner).** Send:

> In the same Vercel page, please add `MAIL_ALLOWED_RECIPIENTS` with your own email address (the one you want staging's codes mailed to), Production only. Staging will mail nobody else. Tell me "done".

- [ ] **Step 3: The staging account's address (owner).** Send:

> On GitHub, in tomyka/sportbet_new, Settings, Secrets and variables, Actions, please add a repository secret `STAGING_OWNER_EMAIL` with the same address. The staging deploy creates your staging account with it. Tell me "done".

- [ ] **Step 4: The key that signs the sign-in cookie (owner's yes).** Send:

> May the staging deploy create one more setting on the Vercel project by itself, `AUTH_SECRET` - a random key it makes on GitHub's runner and never shows anyone? It only signs the short-lived cookie that remembers which address a code was sent to. Yes or no?

On "no", ask instead for the owner to add `AUTH_SECRET` in Vercel themselves from a value generated on their PC (`node -e "console.log(require('crypto').randomBytes(48).toString('base64url'))"`), and remove the creating `if` block from Task 17's step (keep the check).

- [ ] **Step 5: The two plain settings (lead).** With the owner's yes for setting them (ask in one message: "May I add two plain staging settings on Vercel: `MAIL_TRANSPORT=resend-allow-list` and `MAIL_FROM_ADDRESS=<Q4's answer>`?"), add both to the project's Production environment (the Vercel tool `create_project_env`, or the dashboard), then list the project's Production variables and check that `RESEND_API_KEY`, `MAIL_ALLOWED_RECIPIENTS`, `MAIL_TRANSPORT` and `MAIL_FROM_ADDRESS` are there (names only; never read a value back).

---

### Task 20 (lead): The records

**Files:**
- Modify: `CLAUDE.md`, `README.md`, `docs/owner-rulings.md`

- [ ] **Step 1: `CLAUDE.md`**

In "Code rules", replace in the reader bullet "reads only `READ_COLUMNS` (`users`: `id` and `username`, never a name or email)" with "reads only `READ_COLUMNS` (`users`: `id`, `username`, `name`, `surname` and `email` - the owner's consent, slice 4b - never a Google id, token or password)", and add a bullet after the invariant bullet:

```
- An email address is an identity (sportbet #41): stored normalized
  (`normalizeEmail`), and looked up only by exact equality
  (`findAccountByEmail`). `email_fold()` / `foldEmail` is the key of the
  unique index that refuses a second spelling, never a lookup; no ILIKE,
  `unaccent` or citext touches an address (`packages/db/test/account.test.ts`).
  Sign-in state is cookies the server signs or hashes (`__Host-sb_session`,
  `__Host-sb_signin`); a `__Host-` cookie is cleared with its own flags and
  Max-Age 0, never `cookies().delete()`.
```

- [ ] **Step 2: `README.md`**

Add a section after the local-settings paragraph:

```
## Signing in, locally and on each environment

The web server refuses to start without these (`apps/web/src/env.ts`):

| Variable | Local and CI's E2E stack | Staging (Vercel) | Production |
|---|---|---|---|
| `AUTH_SECRET` | any 32+ characters | made once by the deploy | to set at switch-over |
| `MAIL_TRANSPORT` | `mailpit` | `resend-allow-list` | `resend` |
| `MAILPIT_URL` | `http://localhost:8025` | - | - |
| `MAIL_FROM_ADDRESS` | `noreply@sportbet.test` | the owner's sender (Q4) | the same |
| `RESEND_API_KEY` | - | the staging key | production's key |
| `MAIL_ALLOWED_RECIPIENTS` | - | the owner's address | - |

For `next dev`, run Mailpit (`docker run --rm -p 8025:8025 axllent/mailpit:v1.31.4`),
put the left column in `apps/web/.env.local`, seed an account with
`STAGING_ACCOUNT_EMAIL=you@example.test node packages/db/dist/seed-staging.mjs`,
and read your code at http://localhost:8025. The feature tests use an
in-process stand-in for Mailpit's API (`apps/web/tests/support/mail-catcher.ts`).
```

- [ ] **Step 3: `docs/owner-rulings.md`**

Record Q1 and Q3's answers as rulings, numbered on from the last one (R-45, R-46 if R-44 is the last), in the "Players" or the sign-in section next to R-44, each in the file's form: the ruling as a bold sentence, `(slice 4b plan, 2026-10-05)`, what sportbet does, what the new app does. Q2's texts and Q4's sender are not rulings; Q5's answer goes into `docs/phase-2-inventory.md`'s list of what is left behind, if the owner agrees.

- [ ] **Step 4: Commit.** `docs: slice 4b - sign-in settings, the reader's consent, the address rule; R-45, R-46 (#16)`.

---

### Task 21 (lead): Verify everything, review, push, watch CI

- [ ] **Step 1: The whole check, as CI runs it**

```bash
pnpm install --frozen-lockfile 2>&1 | tail -1
pnpm format:check 2>&1 | tail -1
pnpm lint && pnpm typecheck 2>&1 | grep -c "typecheck: Done"
pnpm build 2>&1 | grep -c "build: Done"
pnpm test:unit 2>&1 | grep -E "Test Files|Tests "
pnpm test:component 2>&1 | grep -E "Test Files|Tests "
pnpm test:db 2>&1 | grep -E "Test Files|Tests "
docker ps --filter label=sportbet-migrate --format '{{.ID}}' | wc -l
pnpm test:migrate 2>&1 | grep -E "Test Files|Tests "
pnpm test:feature 2>&1 | grep -E "Test Files|Tests "
git status --short | wc -l
```

Expected: `Done`; `All matched files use Prettier code style!`; lint silent, `4`; `3`; every suite passes, each with more tests than Task 0 recorded; `0` before the reader runs; `0` at the end. No new dependency: `git diff <gate> -- pnpm-lock.yaml | wc -l` is `0`.

- [ ] **Step 2: Review.** Run `mp-code-review` against `<gate>..HEAD` (Standards and Spec; the spec is `docs/superpowers/specs/2026-10-05-accounts-and-code-sign-in-design.md`) and fix what it confirms, each fix its own commit ending with the trailer and `#16`, re-running Step 1 after the last. A new feature landed, so run `improve-codebase-architecture` over `apps/web/src/server/`, `packages/db/src/account/`, `packages/domain/src/account/` and `packages/domain/src/context/`, present its report to the owner, and act on no candidate unless the owner picks one. `security-reviewer` reviews every task marked **(sensitive)** against sportbet's Security rules and #16's notes - in particular: the same answer for an unknown address (timing included), the dummy hash, purpose scoping, the atomic claim, the throttles' keys and order, the origin checks, the cookie flags and their clearing, the redirect target, the RSC payload, nothing personal in a log, the reader's consent boundary, and the CI step that makes `AUTH_SECRET`.

- [ ] **Step 3: Push, and watch the run to the end** (Task 19 done first)

```bash
git push origin main
sleep 10
run=$(gh run list --branch main --limit 1 --json databaseId --jq '.[0].databaseId')
gh run watch "$run" --exit-status
```

Expected: `check` (with the reader and feature suites), `image`, `e2e` (the sign-in journey at both widths, against Mailpit), `staging` (migrations 0006 and 0007 on Neon, the seeded account, `AUTH_SECRET` created once, every sign-in setting found) and `smoke` (`/login` 302, `/logout` GET 405, and the E2E suite without the sign-in journey). A failing job: read it with `gh run view "$run" --log-failed`, fix the cause, commit, push again; never re-run a failed job to make it pass.

- [ ] **Step 4: Report on #16.** Comment with the green run's link, the test counts per suite, the design decisions at the top of this plan and the owner's answers to Q1 to Q5; tick each criterion that holds with its evidence. Leave #16 open for Task 22.

---

### Task 22 (the owner, with the lead): Signing in on staging

- [ ] **Step 1: The instruction the lead sends (one step)**

> The sign-in is on staging: (the `staging` job's URL, from Task 21's run). Please open it, press "Prisijungti", type your address and press "Gauti prisijungimo kodą". A code should arrive within a minute (look in spam too). Type it and press "Prisijungti": the rail should show "Savininkas" and Euroleague 2026/27. Then press "Atsijungti". Tell me "works", or what happened instead.

- [ ] **Step 2: Close #16** once the owner says it works (tick "On staging, the owner signs in with a code mailed to them and sees the player shell; sign-out works", quoting the answer). A problem the owner names becomes a fix on this plan's files, verified as in Task 21 Step 1, pushed, and Step 1 again.

---

## Self-review against the spec

| Spec requirement | Task |
|---|---|
| Codes: 8 digits, 5 minutes, hashed; issuing voids the live code of the same email and purpose; atomic claim; every lookup scoped by purpose (`login` only issued in 4b) | 2 (rules), 7 (issue, find, claim, racing claims and issues), 12 (scrypt, cryptographic source), 15 (voided by a newer request) |
| Request: the same answer whether or not the account exists | 15 (same step, cookie, no mail, no code), design decision 3 (the timing too) |
| Verify: always the hash comparison, a dummy when no live code; one error for every failure | 12 (dummy at the same cost, proven real), 15 (wrong, expired, used, voided, ASCII-fold, no pending: one answer) |
| On success: sign in, a new session, audit `email_code`, the page the visitor came for, else home | 7 (session, record), 15 (cookie, 303 to `/` or `/tournament/<slug>`, audit row) |
| Mail after the response, never queued; the code never logged; missing mail configuration fails at start | 11 (adapters, errors without values, env), 15 (`after()`, logs by kind), 16 (startup refusals) |
| Throttles: request 3 / 10 min per email and 10 per IP; verify 5 per pending email and 15 per IP; blank email on its own IP key; refusal on the field with "Per daug bandymų..." and the minutes | 8 (windows), 12 (limits, keys, text), 16 (each at its limit) |
| Email identity: lowercase and trim on every write and lookup; exact equality; never a folding lookup (#41) | 1, 6 (exact lookup, no ILIKE/unaccent/citext/email_fold in lookups), 15 (case and spaces; ASCII fold refused) |
| Dialog: one dialog, opened by "Prisijungti", `/login`, an error or a code to type; drops an expired step; sign-in side only | 14 (dialog, link, step, countdowns, resend), 15 (`/login`, `dialog.ts` dropping an expired step), 18 (E2E) |
| Sign-out ends the session, back to `/`; `/logout` refuses GET | 15 (route), 16 (405, POST, cross-origin 403) |
| Server Actions for request, verify, cancel (and sign-out); same-origin check; cross-origin POST refused and changes nothing | 15 (one action, `isSameOrigin`), 16 (every form, no Origin, `/logout`); design decision 1 (sign-out a route handler) |
| Session cookie `__Host-sb_session`, HttpOnly, Secure, SameSite=Lax, Path=/, Max-Age 90 days, re-issued at most once a day on a visit | 12 (options), 13 (proxy), 15 (flags), 16 (extension, same day, ended, malformed) |
| Pending sign-in a short-lived signed cookie; the code never leaves the server | 12 (sealed, forged refused), 15 |
| Mailer port: Mailpit (CI, local), Resend with allow-list (staging), Resend (production) | 11, 17 (Mailpit in E2E), 19 (staging) |
| `/login` redirects to `/` with the dialog open, keeps `?tournament=`; a signed-in visitor at `/login` goes to `/`; home is `/` | 15 |
| Data: `players` email/name/surname, folded unique index, email invariant | 1, 5 |
| `player_settings`: locale, admin_level, last_tournament_id, other columns read | 2, 5, 6; design decision 11 (which columns) |
| `login_codes`, `sessions`, `rate_limits`, `audit_logins` | 5, 7, 8 |
| Request context: player, tournament (R-28, then sportbet's fallback, open case to the owner), current round, started, standingsLocked, NavVisibility flags by a pure domain function, `leagueTab` through `showsLeagueTab`, leagues null | 4 (Q1), 13, 16 (tournament shown) |
| Player shell: `guestView()` replaced; player links only with their pages (sign-out only in 4b); "Prisijungti" joins the guest entries | 13, 14, 15, 16 |
| ShellView to the client: display name and initials only (#16) | 13 (`shellPlayer`), 16 (payload test) |
| `/leagues/switch` (#16) | not served in 4b and not drawn (leagues null): 16 proves no form posts there; its rules are slice 12's |
| Admin link display only; `/admin` gated on the server (#16) | no `/admin` page exists, so no link even for an admin: 14, 16; the gate is slice 13's |
| Reader: `users.email`, `name`, `surname` and the settings columns; report names no player; guarantees table and sentinel tests; invariant failures and folded collisions refused and counted | 10 |
| Staging seed: one account with the owner's address from a secret | 9, 17, 19 |
| Testing - domain, database, feature, E2E, reader, as listed | 1-4, 5-9, 15-16, 18, 10 |
| Done: owner signs in on staging; every sportbet rule and #16 note has a test or is shown not to apply; reader loads emails and names and prints none | 22, the rows above, 10 |
| Out of scope: registration, Google, first admin (4c); leagues (12); `/main` (8); profile, email change, deletion, theme (17); admin (13, 14) | in no task; their purposes, tiers and links are carried only as names |

Where the plan departs from the spec's letter, the reason is in "Design decisions this plan makes": sign-out is a route handler (1), the code is minted after the response (3), feature tests use a Mailpit stand-in (9), `player_settings` carries three columns (11), the bottom tabs and the league row are not drawn when empty (15).
