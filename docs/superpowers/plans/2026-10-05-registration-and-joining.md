# Registration and Joining a Tournament (Slice 4c) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** A visitor registers in two steps exactly as sportbet 3eb95e7 does - the "Registruotis" tab of the sign-in dialog takes a username, name, surname and address (lowercased, the owner's answer), a code is mailed with purpose `registration`, and only that code creates the account, its settings and its place in a tournament (the `?tournament=` one if open, else R-27's, else none), in one transaction, signed in and recorded as `register`; joining a tournament writes the player's place and blank prediction rows once, only while registration is open (R-8), and under `ruledRules` fills a late joiner in for the games already played (R-9) through `recalculateUnderRuleSet`.

**Architecture:** The rules are in `packages/domain`: the answers and their refusals (`account/registration.ts`), sportbet's collation for usernames (`account/username.ts`), the registration throttles beside 4b's (`account/sign-in-throttle.ts`), and joining (`joining/joining.ts`: whether a tournament takes players, what a join writes, whether registration is open at all, which tournament a new account joins). `packages/db` writes them: `registerForTournament` (sportbet's `TournamentRegistrationService::register`, insert-missing only, late fill-ins then one recalculation) and `createAccount` (one transaction behind an advisory lock: the taken checks, the player, the settings, the join). `apps/web` holds the use cases: one more Server Action, `registerAction` (request, confirm, cancel), a `/register` route handler, the pending registration in a signed `__Host-sb_register` cookie, the intended slug in `__Host-sb_intended`, and the dialog's tabs, register form and one shared code step.

**Tech Stack:** Next.js 16.3.6 (App Router, Server Actions, `after()`, `proxy.ts`), React 19.3 (`useActionState`), Drizzle ORM 0.45.3 and drizzle-kit 0.31.11 on Postgres 18.6, Zod 4.6.5, `node:crypto` (HMAC-SHA256, `randomInt`), Vitest 5, Testing Library, jsdom 30, Playwright 1.63. **No new dependency.**

**Spec:** `docs/superpowers/specs/2026-10-05-registration-and-joining-design.md` (approved by the owner). **Rulings:** R-8, R-9, R-27, R-44 to R-47 (`docs/owner-rulings.md`). **Decisions:** 5, 6, 10, 13. **Issue:** #18 (part of #1), and the notes carried from #16 (`email_fold` is not utf8mb4_unicode_ci, so uniqueness is checked as well as indexed; the `/login ?tournament=` slug is registration's; R-45). **Reference:** sportbet (`D:\Projects\sportbet`) at `3eb95e7`, production's commit since 2026-10-05.

---

## Conventions for every task

- Work on `main` (trunk-based, `CLAUDE.md`). Each task names the teammate role that owns its folders (`docs/agent-team.md`): `backend-dev` edits `packages/domain` and `packages/db`; `web-dev` edits `apps/web` (its component and feature tests included); `qa` edits E2E and smoke files only; the lead edits the records and is the only one who talks to the owner. There is no `devops` task: CI's E2E stack already runs Mailpit and seeds an open tournament, migration 0008 reaches Neon through the existing deploy, and staging needs only Task 14's setting. `qa` reviews every task against #18's criteria and sportbet's behaviour, `architect` against `CLAUDE.md` and the spec, `security-reviewer` every task marked **(sensitive)**; **only the lead commits**, once those have passed the task. A teammate's last step is "hand to the lead": the files changed, the commands run and their results, and the commit message given. Every commit message references `#18` and ends with the trailer lines the lead's session gives (`Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>` and the `Claude-Session:` line).
- Do not push until Task 16. Task 14 (the second allowed recipient) is done before that push.
- Shell snippets are Git Bash on Windows, run from `D:\Projects\sportbet_new`. The db and feature suites need Docker running; the feature suite needs a fresh `pnpm build`.
- Every verify step runs `pnpm format` first; the code below is written as Prettier leaves it, but a line Prettier rewraps is not a failure - `pnpm format:check` must pass after `pnpm format`.
- "sportbet" means the old app at `3eb95e7`. Read any of its files with `git -C /d/Projects/sportbet show 3eb95e7:<path>`. Every Lithuanian text below is sportbet's (its views and `lang/lt.json`), except the six the owner gave at the brainstorm (spec, "Owner answers") and 4b's `Įveskite kodą.` (#16, Q2), each marked where it is used.
- Code rules (`CLAUDE.md`): `packages/domain` imports only `zod` and takes time and randomness as parameters; web reaches the database only through `@sportbet/db`; pages only load data and return one component; no `any`, no `as` other than `as const`, no `!`; a refusal is a `Result`, an impossible state throws; a skipped or focused test is a lint error; every query result is parsed before it leaves `db`; derived points rows only through `recalculateUnderRuleSet`.
- **Invisible and non-ASCII characters in tests are escapes** (`'\u2028'`, `'\u{1F600}'`, `'\u2022'`). The Write and Edit tools turn a typed `\uXXXX` into the raw character, so after writing any file this plan shows with such an escape, check it: `LC_ALL=C.UTF-8 grep -nP '[\x{2028}\x{2022}\x{1F600}]' <file>` must print nothing, and `grep -n 'u2028\|u2022\|u{1F600}' <file>` must show the escapes. If a raw character landed, run, in Git Bash (it writes the backslash itself, as a shell may eat a typed one):

```bash
node -e 'const fs=require("fs"),f=process.argv[1],b=String.fromCharCode(92);fs.writeFileSync(f,fs.readFileSync(f,"utf8").replace(/[\u2028\u2022]|\uD83D\uDE00/g,(c)=>{const p=c.codePointAt(0);return p>0xffff?b+"u{"+p.toString(16).toUpperCase()+"}":b+"u"+p.toString(16).padStart(4,"0");}));' <file>
```

  Lithuanian letters (`ą`, `ž`, `ė`) are visible and stay as they are.
- Unit runs: `pnpm --filter @sportbet/domain exec vitest run <file>`; db runs: `pnpm --filter @sportbet/db exec vitest run <file>`; component and web unit runs: `pnpm --filter @sportbet/web exec vitest run --config vitest.component.config.ts <file>`; feature runs: `pnpm build && pnpm --filter @sportbet/web exec vitest run --config vitest.feature.config.ts <file>`.
- **Nothing personal in any log or output.** No address, username, name, surname, code or hash is passed to `console.*` or put in an error message. A catch logs `errorKind(error)` only (`apps/web/src/server/error-kind.ts`).

## File map

```
packages/domain/src/account/
  registration.ts         REGISTRATION_FIELDS, registrationProblems, registrationAnswers   (+ test, new)
  username.ts             foldUsername                                                       (+ test, new)
  sign-in-throttle.ts     + registerRequestLimits, registerPageLimits, registerConfirmLimits (+ test)
  session.ts              AUDIT_LOGIN_METHODS + 'register'                                   (+ test)
packages/domain/src/joining/
  joining.ts              isOpenForRegistration, joinTournament, registrationIsOpen,
                          tournamentToJoin, JoinCandidate                                    (+ test, new)
packages/domain/src/index.ts                  the new exports

packages/db/migrations/0008_audit-register.sql   audit_login_method gains 'register' (generated, new)
packages/db/src/joining/repository.ts         loadJoinCandidates, registerForTournament (new)
packages/db/src/account/registration.ts       isEmailRegistered, createAccount (new)
packages/db/src/sql-state.ts                  violatedUnique (new)
packages/db/src/index.ts                      the new exports
packages/db/test/joining.test.ts, registration.test.ts, sql-state.test.ts (new)
packages/db/test/account.test.ts              the address guard allows registration's uniqueness check
packages/db/test/sessions.test.ts             a 'register' record

apps/web/src/server/sealed.ts                 seal, unseal: an HMAC bound to a purpose (+ test, new)
apps/web/src/server/cookies.ts                + PENDING_REGISTRATION_COOKIE, INTENDED_TOURNAMENT_COOKIE, dialogTabOf (+ test)
apps/web/src/server/dice.ts                   cryptoDice (+ test, new)
apps/web/src/server/sign-in/pending.ts        sealed through sealed.ts
apps/web/src/server/sign-in/prune.ts          pruneLater (new)
apps/web/src/server/sign-in/send-code.ts      sendCode(email, now, purpose)
apps/web/src/server/sign-in/request-code.ts   sendCode, pruneLater
apps/web/src/server/sign-in/dialog-step.ts    dialogStep (+ test, new)
apps/web/src/server/sign-in/dialog.ts         tab, registrationOpen, registerAction, the step chosen
apps/web/src/server/mail/code-mail.ts         codeMail: sportbet's one code-mail layout (new)
apps/web/src/server/mail/login-code-mail.ts   through codeMail
apps/web/src/server/mail/registration-code-mail.ts   (+ test, new)
apps/web/src/server/register/
  pending-registration.ts  PendingRegistration, seal/open/read/write/clear, fitsInCookie  (+ test, new)
  intended.ts              readIntended, rememberIntended, forgetIntended                 (+ test, new)
  texts.ts                 REGISTER_TEXT, problemTexts                                    (+ test, new)
  registration-window.ts   registrationOpenAt, registrationOpenNow (new)
  request-registration.ts  step one (new)
  confirm-registration.ts  step two (new)
  register-action.ts       registerAction ('use server', new)
apps/web/src/app/register/route.ts            /register (new)
apps/web/src/app/login/route.ts               keeps ?tournament= for registration, opens on 'login'
apps/web/src/proxy.ts                         forwards the tab to open
apps/web/src/components/shell/
  register-state.ts        RegisterState, RegisterAction, EMPTY_REGISTER_VALUES (new)
  sign-in-state.ts         DialogTab, the register code step, ShellSignIn's new fields
  dialog-parts.tsx         clock, useCountdown, Refusal (moved out of sign-in-dialog.tsx, new)
  code-step.tsx            CodeStep: one code step for both flows (new)
  register-pane.tsx        RegisterPane: modals/register (new)
  sign-in-dialog.tsx       the tabs, both panes, both code steps (+ test)
  icon.tsx                 + person (+ test)
  shell.test.tsx           the fixture's new fields
apps/web/src/token-guard.test.ts              the inbox colours now in code-mail.ts
apps/web/tests/support/registration.ts        tournaments with games, ANSWERS, startRegistration (new)
apps/web/tests/feature/registration.test.ts, registration-guards.test.ts (new)
apps/web/tests/feature/sign-in.test.ts        /login keeps the slug for registration
apps/web/e2e/register.spec.ts (new), e2e/sign-in.spec.ts, playwright.config.ts, smoke/smoke.test.ts
CLAUDE.md, docs/owner-rulings.md               the records
```

## Design decisions this plan makes

None is a scoring rule; each is how the spec is held. Where one departs from the spec's or sportbet's letter, the reason is given and it is listed again in the report to the owner.

1. **One more Server Action, `registerAction`** (intents `request`, `confirm`, `cancel`), beside 4b's `signInAction`. The dialog holds one `useActionState` for each, so each side shows its own last answer; a resend is `request` again with the pending answers (sportbet issue 114).
2. **The pending registration is `__Host-sb_register`**, HttpOnly, an HMAC-SHA256-signed JSON `{ username, name, surname, email, tournament, sentAt }`, Max-Age 2 hours (sportbet's session lifetime, which held `registration_pending`). Seals are now bound to a purpose (`server/sealed.ts`: the HMAC covers `<purpose>.<body>`), so a sign-in cookie's value never opens as a registration's. A sign-in cookie sealed before this change stops opening: a visitor with a code in flight on staging at the deploy asks again.
3. **The intended slug waits in `__Host-sb_intended`** (2 hours; sportbet's session key `intended_tournament`), set by `/login` and `/register` from a `?tournament=` that is a slug. Step one copies it into the pending registration (the spec: "carried in the pending registration, never in the sign-in"); a completed registration forgets it.
4. **`/register` and `/login` open the dialog on a tab:** `__Host-sb_signin_open` now holds `login` or `register`, and `proxy.ts` forwards it as the header's value.
5. **The registration code is minted, stored and mailed after the response** (4b's `sendCode`, purpose `registration`); sportbet mints it before answering and mails after. The visitor's answer is the same.
6. **Usernames are compared as sportbet's collation compares them** (`foldUsername`: lower case, accents dropped as `foldEmail` drops them, trailing spaces ignored - utf8mb4_unicode_ci is a PAD SPACE collation), in TypeScript over every stored username, under the lock of decision 7. No SQL twin: the check needs no index, and production holds a few hundred players. `players_username_unique` stays exact.
7. **Account creation takes `pg_advisory_xact_lock` on `'registration'`**, so two confirmations take turns and the folded checks cannot race. A unique violation on `players_username_unique` or `players_email_folded_unique` still answers "taken" (sportbet's `UniqueConstraintViolationException`); any other error, a primary-key collision included, is the other failure.
8. **An address is "registered" when it equals a stored one or folds like one** (`isEmailRegistered`: `email = $1 or email_fold(email) = email_fold($1)`), at both steps, as sportbet's `unique:users` and `orWhere('email', ...)` compare under utf8mb4_unicode_ci; #16's note: the index alone is not trusted to match. It is a uniqueness check, never a lookup: `account.test.ts`'s guard allows `email_fold` in exactly this function.
9. **Joining is decided in the domain and written by the database.** `joinTournament` (domain) says what a join writes; `registerForTournament` (db) inserts only what is missing (sportbet's `PredictionRows::seedMissing`), so it is idempotent; the late fill-ins it writes are scored by `recalculateUnderRuleSet` inside the same transaction, so an account whose join fails is rolled back whole.
10. **R-27 is not a `RuleSet` field.** Like R-28 and R-46 it is an accounts ruling the parity checker never compares, and sportbet's own order (the newest `active` tournament, then the newest; `PostRegisterController::resolveIntendedTournament`) reads a `status` column the new schema does not have. Both rule sets choose R-27's way. Listed for the architect and the owner; if they want a field, it is `signUpJoins: 'newest-open' | 'soonest-next-game'` in Task 3.
11. **"Registration is open" is sportbet's `anyTournamentIsJoinable`**: open while some tournament that is not finished takes players; with no unfinished tournament, open only when no game exists at all (an empty installation, Q4). "Finished" is `Season.isFinishedAt`, the new app's `effectiveStatus()`.
12. **The throttles check the IP limit first**, as 4b decided for sign-in (#16 review: a request the IP refuses counts on no address); sportbet checks the address first.
13. **The pending cookie must fit a browser's 4,096 bytes.** Answers that would not fit (reachable only with names of 255 four-byte characters) are refused as too long ("Per ilgas: daugiausia 255 simboliai.") on the name field holding the most bytes.
14. **A username of only characters JavaScript counts as space and Laravel's trim keeps** (e.g. U+2028) is refused as missing: the username invariant, which every production username satisfies, refuses it; sportbet would store it.
15. **Fill-in dice are `node:crypto`'s `randomInt`** (sportbet's `random_int`, `GeneratedScore`), in `apps/web/src/server/dice.ts`.
16. **One code-mail layout** (`server/mail/code-mail.ts`) for both mails, as sportbet's two templates share theirs; the token guard's inbox file moves there.
17. **One code step** (`components/shell/code-step.tsx`) for both flows, as sportbet's two partials share their shape ("The code step has one implementation"); the sign-in's test ids stay.

## Owner questions (Task 0 asks them; the tasks named wait on the answers)

| | Question | What sportbet does | The plan's proposal | Waits |
|---|---|---|---|---|
| **Q1** | R-27 says a sign-up joins the open tournament "whose next game is soonest". Which comes first when an open tournament has no game left to predict (no fixtures yet, or none open), and when two have their next game at the same moment? | Not this rule at all: the newest `active` tournament that is open, then the newest of any (`PostRegisterController`). | A tournament with a next game comes before one without; among those without, and on a tie, the newest (highest id), as R-46 settles its tie. | Task 3 |
| **Q2** | Which tab shows a refusal from registration that is about the address only - "Šis el. pašto adresas jau užregistruotas.", a throttled "Per daug bandymų...", step two's "Šis el. paštas arba vartotojo vardas jau užimtas. Pradėkite iš naujo." and "Pirmiausia užpildykite registracijos formą."? | `modals/main` opens the Registruotis tab only for a username, name or surname error, so an address-only refusal opens on the Prisijungti tab, whose alert shows `$errors->first('email')` - the registration's message above the sign-in form (and a `code` error, the last one, shows nowhere). | The Registruotis tab: the text under the address field, or above the form when it belongs to no field. | Task 10 |
| **Q3** | What does `/register` answer once one IP has opened it more than 10 times in a minute? | Laravel's English "429 Too Many Requests" page (the route is not in `bootstrap/app.php`'s list that turns a throttle into a dialog message). | HTTP 429 with the dialog's text, "Per daug bandymų. Pabandykite dar kartą po 1 min.", as plain text. | Task 9 |
| **Q4** | With no tournament at all, may a visitor still register (an account in no tournament)? The spec says "/register goes home when no tournament is open". | Yes: `anyTournamentIsJoinable` keeps registration open while there is no tournament and no game ("With no tournaments and no games at all it stays open, as it always was"); the first account on an empty database is the one that creates tournaments. | Keep sportbet's rule (decision 11). It is also the only way the spec's "none open joining none" happens: with any tournament, registration is open only while one takes players. | Task 3 |

---

### Task 0 (lead): The gate, and the owner's questions

**Files:** none.

- [ ] **Step 1: A clean `main` with the spec on it**

```bash
git status --short | wc -l
git log --oneline -1 -- docs/superpowers/specs/2026-10-05-registration-and-joining-design.md
git -C /d/Projects/sportbet cat-file -t 3eb95e7
git rev-parse --short HEAD
```

Expected: `0`; `5e5daa7 docs: slice 4c spec - two-step registration and joining a tournament (#18)`; `commit`; the gate's commit (this plan committed on top of `5e5daa7`) - note it, Task 16 reviews from it.

- [ ] **Step 2: Record the baseline**

```bash
pnpm install --frozen-lockfile 2>&1 | tail -1
pnpm build 2>&1 | grep -c "build: Done"
pnpm test:unit 2>&1 | grep -E "Test Files|Tests "
pnpm test:component 2>&1 | grep -E "Test Files|Tests "
pnpm test:db 2>&1 | grep -E "Test Files|Tests "
pnpm test:feature 2>&1 | grep -E "Test Files|Tests "
```

Expected: `Done`; `3`; every suite passes - note each count; Task 16 compares against them.

- [ ] **Step 3: Ask the owner Q1 to Q4** (the table above), one message per question, waiting for each answer (the owner's preference: one step at a time). Record each answer as a comment on #18. Q1 and Q4 before Task 3, Q3 before Task 9, Q2 before Task 10. An answer other than the proposal changes only the lines each task names.

---

### Task 1 (backend-dev): The registration answers, and usernames as sportbet's collation compares them

sportbet's `RegisteredUserController::store` validates `username` and `name` as `required|string|max:255`, `surname` as `nullable|string|max:255`, `email` as `required|string|lowercase|email|max:255|unique` (the owner replaced `lowercase` with lowering, spec "Owner answers"); `createAccount` finds a taken username with `where('username', ...)` under utf8mb4_unicode_ci. Laravel's TrimStrings has already trimmed every field (4b's `formText`).

**Files:**
- Create: `packages/domain/src/account/registration.ts`, `packages/domain/src/account/registration.test.ts`
- Create: `packages/domain/src/account/username.ts`, `packages/domain/src/account/username.test.ts`
- Modify: `packages/domain/src/index.ts` (after the `./account/display-name` export block)

- [ ] **Step 1: Write the failing tests**

`packages/domain/src/account/registration.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import { registrationAnswers, registrationProblems } from './registration';

const TYPED = {
  username: 'naujoke',
  name: 'Rūta',
  surname: '',
  email: 'Ruta.Naujoke@Example.LT',
};

/** 255 characters, and one more: sportbet's max:255 counts characters (mb_strlen). */
const AT_MOST = 'ž'.repeat(255);
const OVER = 'ž'.repeat(256);
const ADDRESS_AT_MOST = `${'a'.repeat(244)}@example.lt`;
const ADDRESS_OVER = `${'a'.repeat(245)}@example.lt`;

// sportbet's RegisteredUserController::store rules, with the owner's
// answers (2026-10-05): an address with capitals is lowered, not refused.
describe('registration answers', () => {
  it('registration: takes a username, a name, no surname and an address, lowering the address (the owner, 2026-10-05)', () => {
    expect(registrationProblems(TYPED)).toEqual({});
    expect(registrationAnswers(TYPED)).toEqual({
      ok: true,
      value: {
        username: 'naujoke',
        name: 'Rūta',
        surname: '',
        email: 'ruta.naujoke@example.lt',
      },
    });
  });

  it('registration: a username, a name and an address are required; a surname is not', () => {
    const blank = { username: '', name: '', surname: '', email: '' };
    expect(registrationProblems(blank)).toEqual({
      username: 'required',
      name: 'required',
      email: 'required',
    });
    expect(registrationAnswers(blank)).toEqual({
      ok: false,
      refusal: 'answers-refused',
    });
  });

  it('registration: an address that is not one is refused before its length is', () => {
    expect(registrationProblems({ ...TYPED, email: 'ruta.naujoke' })).toEqual(
      { email: 'not-an-email' },
    );
    expect(
      registrationProblems({ ...TYPED, email: 'x'.repeat(300) }),
    ).toEqual({ email: 'not-an-email' });
  });

  it('registration: every answer is at most 255 characters, counted as characters', () => {
    expect(
      registrationProblems({
        username: AT_MOST,
        name: AT_MOST,
        surname: AT_MOST,
        email: ADDRESS_AT_MOST,
      }),
    ).toEqual({});
    expect(
      registrationProblems({
        username: OVER,
        name: OVER,
        surname: OVER,
        email: ADDRESS_OVER,
      }),
    ).toEqual({
      username: 'too-long',
      name: 'too-long',
      surname: 'too-long',
      email: 'too-long',
    });
  });

  it('registration: a username of only a space JavaScript knows and Laravel does not trim is missing (plan decision 14)', () => {
    expect(registrationProblems({ ...TYPED, username: '\u2028' })).toEqual({
      username: 'required',
    });
  });
});
```

`packages/domain/src/account/username.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import { foldUsername } from './username';

// RegisteredUserController::createAccount asks
// User::where('username', ...) under utf8mb4_unicode_ci: case and accents
// ignored, trailing spaces ignored (a PAD SPACE collation).
describe('foldUsername', () => {
  it.each([
    ['Naujoke', 'naujoke'],
    ['NAUJOKĖ', 'naujoke'],
    ['Žilvinas', 'zilvinas'],
    ['ĄČĘĖĮŠŲŪŽ', 'aceeisuuz'],
    ['STRASSE', 'straße'],
    ['jonas ', 'jonas'],
  ])('username: %s and %s are one username', (a, b) => {
    expect(foldUsername(a)).toBe(foldUsername(b));
  });

  it.each([
    ['jonas', 'jonas2'],
    ['jonas', ' jonas'],
    ['jonas', 'jonas\t'],
    ['jonas', 'jonas.k'],
  ])('username: %s and %s are two', (a, b) => {
    expect(foldUsername(a)).not.toBe(foldUsername(b));
  });
});
```

After writing them, check the escape: `LC_ALL=C.UTF-8 grep -nP '\x{2028}' packages/domain/src/account/registration.test.ts` prints nothing.

- [ ] **Step 2: Run them to see them fail**

Run: `pnpm --filter @sportbet/domain exec vitest run src/account/registration.test.ts src/account/username.test.ts`
Expected: FAIL - `Failed to resolve import "./registration"` and `"./username"`.

- [ ] **Step 3: Write the code**

`packages/domain/src/account/registration.ts`:

```ts
import { usernameInvariant } from '../player/player';
import { ok, refuse, type Result } from '../shared/result';
import {
  emailInvariant,
  normalizeEmail,
  storedEmailAddress,
  type EmailAddress,
} from './email';

/** RegisteredUserController::store's fields, in the form's order. */
export const REGISTRATION_FIELDS = [
  'username',
  'name',
  'surname',
  'email',
] as const;

export type RegistrationField = (typeof REGISTRATION_FIELDS)[number];

/** The form's fields as typed, each trimmed as Laravel's TrimStrings trims it. */
export type TypedRegistration = Readonly<Record<RegistrationField, string>>;

/** Why an answer is refused, the first of sportbet's rules it fails. */
export type AnswerProblem = 'required' | 'not-an-email' | 'too-long';

export type RegistrationProblems = Readonly<
  Partial<Record<RegistrationField, AnswerProblem>>
>;

/** What a pending registration keeps and an account is created from. */
export interface RegistrationAnswers {
  readonly username: string;
  readonly name: string;
  readonly surname: string;
  readonly email: EmailAddress;
}

/** `max:255`, counted in characters as PHP's mb_strlen counts them. */
const ANSWER_MAX_LENGTH = 255;

const tooLong = (value: string) =>
  Array.from(value).length > ANSWER_MAX_LENGTH;

/** An address's shape: emailInvariant's pattern, without its length. */
const ADDRESS_SHAPE = new RegExp(emailInvariant.pattern, 'u');

function usernameProblem(typed: string): AnswerProblem | null {
  if (typed === '') return 'required';
  if (tooLong(typed)) return 'too-long';
  // Only characters JavaScript's \s knows and Laravel's trim keeps (e.g.
  // U+2028): sportbet would store it, the username invariant - which every
  // production username satisfies - refuses it, so it is missing.
  return usernameInvariant.schema.safeParse(typed).success
    ? null
    : 'required';
}

function nameProblem(typed: string): AnswerProblem | null {
  if (typed === '') return 'required';
  return tooLong(typed) ? 'too-long' : null;
}

function surnameProblem(typed: string): AnswerProblem | null {
  return tooLong(typed) ? 'too-long' : null;
}

/**
 * `required|string|lowercase|email|max:255`, with `lowercase` replaced by
 * lowering (the owner, 2026-10-05): sign-in normalizes an address, and so
 * does registration. The length is the stored address's. Whether it is
 * already registered is the database's to answer (isEmailRegistered).
 */
function emailProblem(typed: string): AnswerProblem | null {
  if (typed === '') return 'required';
  const normalized = normalizeEmail(typed);
  if (!ADDRESS_SHAPE.test(normalized)) return 'not-an-email';
  return tooLong(normalized) ? 'too-long' : null;
}

/** Each refused field and why; empty when every answer passes. */
export function registrationProblems(
  typed: TypedRegistration,
): RegistrationProblems {
  const found: Readonly<Record<RegistrationField, AnswerProblem | null>> = {
    username: usernameProblem(typed.username),
    name: nameProblem(typed.name),
    surname: surnameProblem(typed.surname),
    email: emailProblem(typed.email),
  };
  const problems: Partial<Record<RegistrationField, AnswerProblem>> = {};
  for (const field of REGISTRATION_FIELDS) {
    const problem = found[field];
    if (problem !== null) problems[field] = problem;
  }
  return problems;
}

/**
 * The answers as a registration keeps them - the address normalized - or a
 * refusal when any field has a problem (registrationProblems says which).
 */
export function registrationAnswers(
  typed: TypedRegistration,
): Result<RegistrationAnswers, 'answers-refused'> {
  if (Object.keys(registrationProblems(typed)).length > 0) {
    return refuse('answers-refused');
  }
  const email = storedEmailAddress(normalizeEmail(typed.email));
  if (!email.ok) {
    throw new Error('registrationAnswers: an address that passed is not one');
  }
  return ok({
    username: typed.username,
    name: typed.name,
    surname: typed.surname,
    email: email.value,
  });
}
```

`packages/domain/src/account/username.ts`:

```ts
import { foldEmail } from './email';

/** utf8mb4_unicode_ci pads with spaces: trailing ones never tell two apart. */
const TRAILING_SPACES = / +$/u;

/**
 * A username as sportbet's collation compares it (RegisteredUserController
 * ::createAccount's `where('username', ...)` under utf8mb4_unicode_ci):
 * lower case, accents dropped as foldEmail drops them, trailing spaces
 * ignored, so 'Naujokė', 'NAUJOKE' and 'naujoke ' are one username. Lowered
 * again after folding, as NFKD can turn a letter into a capital (U+210C).
 * The key the taken check compares (createAccount), never stored; its gaps
 * are foldEmail's, and the collation's ignorable characters are kept.
 */
export function foldUsername(username: string): string {
  return foldEmail(username.toLowerCase())
    .toLowerCase()
    .replace(TRAILING_SPACES, '');
}
```

In `packages/domain/src/index.ts`, after the `./account/display-name` export block, add:

```ts
export {
  REGISTRATION_FIELDS,
  registrationAnswers,
  registrationProblems,
  type AnswerProblem,
  type RegistrationAnswers,
  type RegistrationField,
  type RegistrationProblems,
  type TypedRegistration,
} from './account/registration';
export { foldUsername } from './account/username';
```

- [ ] **Step 4: Run them to see them pass**

Run: `pnpm format && pnpm --filter @sportbet/domain exec vitest run src/account/registration.test.ts src/account/username.test.ts`
Expected: PASS, 2 files, 15 tests.

Run: `pnpm --filter @sportbet/domain typecheck && pnpm lint`
Expected: no output from either but the commands.

- [ ] **Step 5: Hand to the lead**

Files: the four new files and `index.ts`. Commit message: `feat(domain): the registration answers and their refusals, and usernames compared as sportbet's collation compares them (#18)`.

---

### Task 2 (backend-dev): The registration throttles, the `register` sign-in record, migration 0008 **(sensitive)**

sportbet's `AppServiceProvider`: `register` - `Limit::perMinutes(10, 3)` by the normalized address (a blank one by `blank-email-ip:<ip>`) and `Limit::perMinute(3)` by IP; `register-page` - `Limit::perMinute(10)` by IP; `register-confirm` - `Limit::perMinutes(10, 5)` by the pending address (`strtolower(trim())`; none: `no-pending-ip:<ip>`) and `Limit::perMinutes(10, 15)` by IP. Laravel names each key after its limiter. `AuditLoginsController::insertAuditLogin($user->id, $ip, 'register')` records a registration (R-45: without the IP).

**Files:**
- Modify: `packages/domain/src/account/sign-in-throttle.ts`, `packages/domain/src/account/sign-in-throttle.test.ts`
- Modify: `packages/domain/src/account/session.ts:18-27`, `packages/domain/src/account/session.test.ts:22-24`
- Modify: `packages/domain/src/index.ts` (the `./account/sign-in-throttle` block)
- Create (generated): `packages/db/migrations/0008_audit-register.sql`, `packages/db/migrations/meta/0008_snapshot.json`, `packages/db/migrations/meta/_journal.json` (one entry)
- Modify: `packages/db/test/sessions.test.ts` (after "records a sign-in by its method and moment")

- [ ] **Step 1: Write the failing tests**

Append to `packages/domain/src/account/sign-in-throttle.test.ts` (and add `registerConfirmLimits, registerPageLimits, registerRequestLimits` to its import from `./sign-in-throttle`):

```ts
// sportbet's AppServiceProvider: 'register', 'register-page' and
// 'register-confirm' (3eb95e7). The IP limit first, as for sign-in.
describe('the registration throttles', () => {
  it('throttle: step one, 3 per 10 minutes per address as normalized, 3 a minute per IP', () => {
    expect(
      registerRequestLimits('  Ruta.Naujoke@Example.LT ', '203.0.113.7'),
    ).toEqual([
      { key: 'register:ip:203.0.113.7', maxAttempts: 3, windowSeconds: 60 },
      {
        key: 'register:email:ruta.naujoke@example.lt',
        maxAttempts: 3,
        windowSeconds: 600,
      },
    ]);
  });

  it('throttle: step one with a blank address counts on its own IP key', () => {
    expect(registerRequestLimits('', '203.0.113.7')[1]?.key).toBe(
      'register:blank-email-ip:203.0.113.7',
    );
  });

  it('throttle: /register, 10 a minute per IP', () => {
    expect(registerPageLimits('203.0.113.7')).toEqual([
      { key: 'register-page:ip:203.0.113.7', maxAttempts: 10, windowSeconds: 60 },
    ]);
  });

  it('throttle: step two, 5 per 10 minutes per pending address, 15 per IP', () => {
    expect(
      registerConfirmLimits('ruta.naujoke@example.lt', '203.0.113.7'),
    ).toEqual([
      {
        key: 'register-confirm:ip:203.0.113.7',
        maxAttempts: 15,
        windowSeconds: 600,
      },
      {
        key: 'register-confirm:email:ruta.naujoke@example.lt',
        maxAttempts: 5,
        windowSeconds: 600,
      },
    ]);
  });

  it('throttle: step two with no pending registration counts on its own IP key', () => {
    expect(registerConfirmLimits(null, '203.0.113.7')[1]?.key).toBe(
      'register-confirm:no-pending-ip:203.0.113.7',
    );
  });
});
```

In `packages/domain/src/account/session.test.ts`, replace the test at lines 22-24 with:

```ts
it('records a code sign-in as email_code and a registration as register, as sportbet does', () => {
  expect(AUDIT_LOGIN_METHODS).toEqual(['email_code', 'register']);
});
```

In `packages/db/test/sessions.test.ts`, after the test "records a sign-in by its method and moment", add:

```ts
it("records a registration as 'register' (RegisteredUserController::confirm), without the IP (R-45)", async () => {
  await recordLogin(db, { player: ADA, method: 'register', at: NOW });
  const rows = await client.query('select * from audit_logins');
  expect(rows.rows).toEqual([
    {
      id: 1,
      player_id: 1,
      method: 'register',
      at: new Date('2026-10-05T12:00:00Z'),
    },
  ]);
});
```

- [ ] **Step 2: Run them to see them fail**

Run: `pnpm --filter @sportbet/domain exec vitest run src/account/sign-in-throttle.test.ts src/account/session.test.ts`
Expected: FAIL - `registerRequestLimits is not a function` (and the like), and `expected [ 'email_code' ] to deeply equal [ 'email_code', 'register' ]`.

- [ ] **Step 3: Write the code**

In `packages/domain/src/account/sign-in-throttle.ts`, after `const TEN_MINUTES = 10 * 60;` add:

```ts
/** sportbet's `Limit::perMinute(...)`. */
const ONE_MINUTE = 60;
```

and at the end of the file, before `throttledMinutes`, add:

```ts
/**
 * AppServiceProvider's 'register' (step one, #102, issue 260): 3 per 10
 * minutes per address as typed, normalized (EmailIdentity::normalize), so
 * one address cannot be mailed more than three codes whatever its
 * spelling, and 3 a minute per IP. The IP limit first, as for sign-in.
 */
export function registerRequestLimits(
  typedEmail: string,
  ip: string,
): readonly ThrottleLimit[] {
  return [
    {
      key: `register:ip:${ip}`,
      maxAttempts: 3,
      windowSeconds: ONE_MINUTE,
    },
    {
      key: `register:${addressKey(normalizeEmail(typedEmail), ip)}`,
      maxAttempts: 3,
      windowSeconds: TEN_MINUTES,
    },
  ];
}

/** AppServiceProvider's 'register-page': /register, 10 a minute per IP. */
export function registerPageLimits(ip: string): readonly ThrottleLimit[] {
  return [
    {
      key: `register-page:ip:${ip}`,
      maxAttempts: 10,
      windowSeconds: ONE_MINUTE,
    },
  ];
}

/**
 * AppServiceProvider's 'register-confirm' (#102): 5 per 10 minutes per
 * pending address - tighter than sign-in's, the code is in front of the
 * person typing it - else per `no-pending-ip:<ip>`, and 15 per IP. The IP
 * limit first, as for sign-in.
 */
export function registerConfirmLimits(
  pendingEmail: string | null,
  ip: string,
): readonly ThrottleLimit[] {
  const email = normalizeEmail(pendingEmail ?? '');
  return [
    {
      key: `register-confirm:ip:${ip}`,
      maxAttempts: 15,
      windowSeconds: TEN_MINUTES,
    },
    {
      key: `register-confirm:${email === '' ? `no-pending-ip:${ip}` : `email:${email}`}`,
      maxAttempts: 5,
      windowSeconds: TEN_MINUTES,
    },
  ];
}
```

In `packages/domain/src/account/session.ts`, replace the `AUDIT_LOGIN_METHODS` comment and constant with:

```ts
/**
 * How a player came in, as audit_logins records it (sportbet's
 * `login_method`): `email_code` (4b) and `register` (4c, a completed
 * registration); Google's arrive with 4d.
 */
export const AUDIT_LOGIN_METHODS = ['email_code', 'register'] as const;
```

In `packages/domain/src/index.ts`, replace the `./account/sign-in-throttle` export block with:

```ts
export {
  codeRequestLimits,
  codeVerifyLimits,
  registerConfirmLimits,
  registerPageLimits,
  registerRequestLimits,
  throttledMinutes,
  type ThrottleLimit,
} from './account/sign-in-throttle';
```

- [ ] **Step 4: Run the domain tests to see them pass**

Run: `pnpm format && pnpm --filter @sportbet/domain exec vitest run src/account/sign-in-throttle.test.ts src/account/session.test.ts`
Expected: PASS.

- [ ] **Step 5: Generate the migration**

The enum `audit_login_method` is built from `AUDIT_LOGIN_METHODS` (`packages/db/src/account/schema.ts`), so the schema has changed:

```bash
pnpm --filter @sportbet/db db:generate --name audit-register
cat packages/db/migrations/0008_audit-register.sql
git status --short packages/db/migrations
```

Expected: the file holds exactly

```sql
ALTER TYPE "public"."audit_login_method" ADD VALUE 'register';
```

and git lists `0008_audit-register.sql`, `meta/0008_snapshot.json` and a modified `meta/_journal.json`, nothing else. Postgres allows `ADD VALUE` inside the migrator's transaction because no later statement of it uses the value. Review the SQL; never edit it by hand.

- [ ] **Step 6: Run the db test to see it pass**

Run: `pnpm --filter @sportbet/db exec vitest run test/sessions.test.ts test/schema.test.ts test/invariant-checks.test.ts`
Expected: PASS (the test database migrates through 0008).

Run: `pnpm typecheck && pnpm lint`
Expected: clean.

- [ ] **Step 7: Hand to the lead**

Files: the domain files, the three migration files, `sessions.test.ts`. Commit message: `feat(domain,db): the registration throttles as sportbet's, and 'register' sign-in records - migration 0008 (#18)`.

---

### Task 3 (backend-dev): Joining a tournament, and which one a new account joins

Waits on Q1 and Q4. sportbet's `TournamentRegistrationService` (`isOpenForRegistration`: not finished, and `registrationIsOpen($id)`; `register`: the membership, then `seedPredictions`, each seeding only what is missing), `ChecksRegistrationDeadline` (`anyTournamentIsJoinable`) and `PostRegisterController::resolveIntendedTournament` (the intended slug if open, else a fallback, else none). R-8 is `Season.isRegistrationOpenAt` under the rule set (`RuleSet.registrationClosesAt`); R-9 is `lateJoinerFillIns` (`RuleSet.lateJoinersFilledIn`); R-27 replaces sportbet's fallback (decision 10, Q1). Survival needs no seeded row: the new app's picks are a history (spec).

**Files:**
- Create: `packages/domain/src/joining/joining.ts`, `packages/domain/src/joining/joining.test.ts`
- Modify: `packages/domain/src/index.ts` (after the `./fill-in/fill-in` export block)

- [ ] **Step 1: Write the failing test**

`packages/domain/src/joining/joining.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import { Season } from '../round/season';
import type { Game } from '../round/game';
import { ruledRules, sportbetRules } from '../rules/rule-set';
import {
  at,
  gameNo,
  makeGame,
  makeRound,
  player,
  scriptedDice,
  team,
  unwrap,
} from '../testing';
import type { Tournament } from '../tournament/tournament';
import {
  isOpenForRegistration,
  joinTournament,
  registrationIsOpen,
  tournamentToJoin,
  type JoinCandidate,
} from './joining';

const JONAS = player('jonas');
const TEAMS = [team('ZAL'), team('OLY'), team('MON'), team('VIR')];
const END = at('2027-05-24T00:00:00Z');

/** Rounds 1 to 5: round 5's first game is the standings deadline (ST-2, R-8). */
function seasonOf(games: readonly Game[], endsAt = END): Season {
  return unwrap(
    Season.create({
      rounds: [1, 2, 3, 4, 5].map((number) => makeRound({ number })),
      games,
      endsAt,
    }),
  );
}

const ROUND_1 = makeGame({
  id: 1,
  round: 1,
  home: 'ZAL',
  away: 'OLY',
  tipOff: '2026-10-02T18:00:00Z',
});
const ROUND_1_SCORED = makeGame(
  {
    id: 1,
    round: 1,
    home: 'ZAL',
    away: 'OLY',
    tipOff: '2026-10-02T18:00:00Z',
    result: [88, 79],
  },
  ruledRules,
);
const ROUND_2 = makeGame({
  id: 2,
  round: 2,
  home: 'MON',
  away: 'VIR',
  tipOff: '2026-10-09T18:00:00Z',
});
const ROUND_5 = makeGame({
  id: 5,
  round: 5,
  home: 'ZAL',
  away: 'MON',
  tipOff: '2026-11-03T18:00:00Z',
});

const tournament = (id: number, slug: string): Tournament => ({
  id,
  slug,
  name: slug,
  format: 'euroleague',
  endsOn: '2027-05-23',
  standingsDeadlineRound: null,
  survival: true,
  standingsTableFinal: false,
});

const candidate = (
  id: number,
  slug: string,
  games: readonly Game[],
  endsAt = END,
): JoinCandidate => ({
  tournament: tournament(id, slug),
  season: seasonOf(games, endsAt),
});

const join = (
  season: Season,
  now: string,
  rules = ruledRules,
  alreadyIn = false,
) =>
  joinTournament({
    player: JONAS,
    season,
    teams: TEAMS,
    alreadyIn,
    rules,
    now: at(now),
    dice: scriptedDice([0, 0, 0, 17, 17, 17]),
  });

describe('a tournament taking players (TournamentRegistrationService::isOpenForRegistration)', () => {
  const season = seasonOf([ROUND_1, ROUND_2, ROUND_5]);

  it('registration (sportbet): open until the first game tips off, closed from then', () => {
    expect(
      isOpenForRegistration(season, at('2026-10-02T17:59:59Z'), sportbetRules),
    ).toBe(true);
    expect(
      isOpenForRegistration(season, at('2026-10-02T18:00:00Z'), sportbetRules),
    ).toBe(false);
  });

  it('registration (ruled): open until round 5 starts (R-8)', () => {
    expect(
      isOpenForRegistration(season, at('2026-11-03T17:59:59Z'), ruledRules),
    ).toBe(true);
    expect(
      isOpenForRegistration(season, at('2026-11-03T18:00:00Z'), ruledRules),
    ).toBe(false);
  });

  it('registration: a finished tournament takes nobody, even one with no games', () => {
    const over = seasonOf([], at('2026-05-25T00:00:00Z'));
    expect(
      isOpenForRegistration(over, at('2026-10-05T12:00:00Z'), sportbetRules),
    ).toBe(false);
    expect(
      isOpenForRegistration(over, at('2026-10-05T12:00:00Z'), ruledRules),
    ).toBe(false);
  });
});

describe('joining (TournamentRegistrationService::register, PredictionRows::seedMissing)', () => {
  it('joining: a newcomer gets a blank row for every game and a standings row for every team', () => {
    const joined = unwrap(
      join(seasonOf([ROUND_1, ROUND_2]), '2026-10-01T12:00:00Z'),
    );
    expect(joined.newcomer).toBe(true);
    expect(joined.blankGames).toEqual([gameNo(1), gameNo(2)]);
    expect(joined.standingsTeams).toEqual(TEAMS);
    expect(joined.lateFillIns).toEqual([]);
  });

  it('joining: refused while the tournament takes nobody, under either set', () => {
    const season = seasonOf([ROUND_1, ROUND_2, ROUND_5]);
    expect(join(season, '2026-10-03T12:00:00Z', sportbetRules)).toEqual({
      ok: false,
      refusal: 'registration-closed',
    });
    expect(join(season, '2026-11-04T12:00:00Z', ruledRules)).toEqual({
      ok: false,
      refusal: 'registration-closed',
    });
  });

  it('late joiner (ruled): the games already played are filled in, the rest blank (R-9)', () => {
    const joined = unwrap(
      join(seasonOf([ROUND_1_SCORED, ROUND_2, ROUND_5]), '2026-10-05T12:00:00Z'),
    );
    expect(joined.lateFillIns.map((prediction) => prediction.game)).toEqual([
      gameNo(1),
    ]);
    expect(joined.lateFillIns[0]?.origin).toBe('late-fill-in');
    expect(joined.lateFillIns[0]?.filledInAt).toBe(at('2026-10-05T12:00:00Z'));
    expect(joined.blankGames).toEqual([gameNo(2), gameNo(5)]);
  });

  it('late joiner (sportbet): never filled in - a tournament under way takes nobody', () => {
    expect(
      join(
        seasonOf([ROUND_1_SCORED, ROUND_2]),
        '2026-10-05T12:00:00Z',
        sportbetRules,
      ).ok,
    ).toBe(false);
  });

  it('joining again fills nobody in: a player already in only gets the rows they miss', () => {
    const joined = unwrap(
      join(
        seasonOf([ROUND_1_SCORED, ROUND_2, ROUND_5]),
        '2026-10-05T12:00:00Z',
        ruledRules,
        true,
      ),
    );
    expect(joined.newcomer).toBe(false);
    expect(joined.lateFillIns).toEqual([]);
    expect(joined.blankGames).toEqual([gameNo(1), gameNo(2), gameNo(5)]);
  });
});

describe('registration open at all (ChecksRegistrationDeadline::anyTournamentIsJoinable)', () => {
  const NOW = at('2026-10-05T12:00:00Z');
  const open = candidate(2, 'euroleague-2026-27', [ROUND_5]);
  const started = candidate(1, 'euroleague-2025-26', [ROUND_1_SCORED], END);
  const finished = candidate(
    1,
    'euroleague-2025-26',
    [ROUND_1_SCORED],
    at('2026-05-25T00:00:00Z'),
  );

  it('registration: open while some unfinished tournament takes players', () => {
    expect(registrationIsOpen([started, open], NOW, sportbetRules)).toBe(true);
    expect(registrationIsOpen([started], NOW, sportbetRules)).toBe(false);
  });

  it('registration: with no tournament and no game at all, open (Q4: an empty installation)', () => {
    expect(registrationIsOpen([], NOW, ruledRules)).toBe(true);
  });

  it('registration: with only finished tournaments, closed while any game exists, open when none does', () => {
    expect(registrationIsOpen([finished], NOW, ruledRules)).toBe(false);
    const finishedEmpty = candidate(
      1,
      'euroleague-2025-26',
      [],
      at('2026-05-25T00:00:00Z'),
    );
    expect(registrationIsOpen([finishedEmpty], NOW, ruledRules)).toBe(true);
  });
});

describe('the tournament a new account joins (PostRegisterController, R-27)', () => {
  const NOW = at('2026-10-05T12:00:00Z');
  const sooner = candidate(2, 'euroleague-2026-27', [
    makeGame({
      id: 21,
      round: 1,
      home: 'ZAL',
      away: 'OLY',
      tipOff: '2026-10-09T18:00:00Z',
    }),
  ]);
  const later = candidate(3, 'euroleague-2027-28', [
    makeGame({
      id: 31,
      round: 1,
      home: 'ZAL',
      away: 'OLY',
      tipOff: '2026-10-16T18:00:00Z',
    }),
  ]);
  const closed = candidate(1, 'euroleague-2025-26', [ROUND_1_SCORED]);
  const choose = (intended: string | null, candidates: JoinCandidate[]) =>
    tournamentToJoin({ intended, candidates, now: NOW, rules: sportbetRules })
      ?.slug ?? null;

  it('joining (R-27): the ?tournament= one, when it takes players', () => {
    expect(choose('euroleague-2027-28', [closed, sooner, later])).toBe(
      'euroleague-2027-28',
    );
  });

  it('joining (R-27): an unknown or closed one falls back to the open tournament whose next game is soonest', () => {
    expect(choose('no-such-tournament', [later, sooner, closed])).toBe(
      'euroleague-2026-27',
    );
    expect(choose('euroleague-2025-26', [later, sooner, closed])).toBe(
      'euroleague-2026-27',
    );
    expect(choose(null, [later, sooner])).toBe('euroleague-2026-27');
  });

  it('joining (R-27): none open joins none', () => {
    expect(choose('euroleague-2025-26', [closed])).toBeNull();
    expect(choose(null, [])).toBeNull();
  });

  it('joining (R-27, Q1): one with a next game before one without; without one, or on a tie, the newest', () => {
    const noFixtures = candidate(4, 'euroleague-2028-29', []);
    const olderNoFixtures = candidate(1, 'euroleague-2024-25', []);
    expect(choose(null, [noFixtures, later])).toBe('euroleague-2027-28');
    expect(choose(null, [olderNoFixtures, noFixtures])).toBe(
      'euroleague-2028-29',
    );
    const sameMoment = candidate(5, 'euroleague-2029-30', [
      makeGame({
        id: 51,
        round: 1,
        home: 'ZAL',
        away: 'OLY',
        tipOff: '2026-10-09T18:00:00Z',
      }),
    ]);
    expect(choose(null, [sooner, sameMoment])).toBe('euroleague-2029-30');
  });
});
```

- [ ] **Step 2: Run it to see it fail**

Run: `pnpm --filter @sportbet/domain exec vitest run src/joining/joining.test.ts`
Expected: FAIL - `Failed to resolve import "./joining"`.

- [ ] **Step 3: Write the code**

`packages/domain/src/joining/joining.ts`:

```ts
import { lateJoinerFillIns, type FillInDice } from '../fill-in/fill-in';
import type { MatchPrediction } from '../prediction/match-prediction';
import type { Season } from '../round/season';
import type { RuleSet } from '../rules/rule-set';
import type { GameId, PlayerId, TeamId } from '../shared/ids';
import type { Instant } from '../shared/instant';
import { ok, refuse, type Result } from '../shared/result';
import type { Tournament } from '../tournament/tournament';

/**
 * TournamentRegistrationService::isOpenForRegistration: the tournament is
 * not finished (R-21; sportbet's effectiveStatus) and registration has not
 * closed under the rule set - at the first game for sportbet, at the
 * standings deadline under R-8 (Season.isRegistrationOpenAt).
 */
export function isOpenForRegistration(
  season: Season,
  now: Instant,
  rules: RuleSet,
): boolean {
  return !season.isFinishedAt(now) && season.isRegistrationOpenAt(now, rules);
}

/** What one player's join writes: each row only where it is missing. */
export interface Joining {
  /** The player had no place in the tournament: one is written. */
  readonly newcomer: boolean;
  /** A blank prediction row for each of these games. */
  readonly blankGames: readonly GameId[];
  /** A blank standings row for each of the tournament's teams. */
  readonly standingsTeams: readonly TeamId[];
  /** R-9: a late joiner's games already played; empty for sportbet. */
  readonly lateFillIns: readonly MatchPrediction[];
}

export type JoiningRefusal = 'registration-closed';

export interface JoiningInput {
  readonly player: PlayerId;
  readonly season: Season;
  /** The tournament's teams (sportbet seeds a standings row for each). */
  readonly teams: readonly TeamId[];
  /** The player already has a place in the tournament. */
  readonly alreadyIn: boolean;
  readonly rules: RuleSet;
  readonly now: Instant;
  readonly dice: FillInDice;
}

/**
 * TournamentRegistrationService::register: refused unless the tournament
 * takes players at `now`; else a place, a blank prediction row per game
 * and a standings row per team, each only where missing, so joining twice
 * changes nothing (PredictionRows::seedMissing). A newcomer joining late
 * under the ruled set gets a fill-in for each game they can no longer
 * predict instead of a blank row (R-9, lateJoinerFillIns); a player already
 * in is no late joiner. Survival needs no row: picks are a history.
 */
export function joinTournament(
  input: JoiningInput,
): Result<Joining, JoiningRefusal> {
  const { player, season, teams, alreadyIn, rules, now, dice } = input;
  if (!isOpenForRegistration(season, now, rules)) {
    return refuse('registration-closed');
  }
  const lateFillIns = alreadyIn
    ? Object.freeze([])
    : lateJoinerFillIns(player, season.games, dice, now, rules);
  const filled = new Set(lateFillIns.map((prediction) => prediction.game));
  return ok({
    newcomer: !alreadyIn,
    blankGames: Object.freeze(
      season.games.map((game) => game.id).filter((id) => !filled.has(id)),
    ),
    standingsTeams: Object.freeze([...teams]),
    lateFillIns,
  });
}

/** A tournament a new account might join, with its season. */
export interface JoinCandidate {
  readonly tournament: Tournament;
  readonly season: Season;
}

/**
 * ChecksRegistrationDeadline::anyTournamentIsJoinable: registration is open
 * while some tournament that is not finished takes players. With none
 * unfinished it is open only when no game exists at all - an empty
 * installation, whose first account creates the tournaments (Q4).
 */
export function registrationIsOpen(
  candidates: readonly JoinCandidate[],
  now: Instant,
  rules: RuleSet,
): boolean {
  const unfinished = candidates.filter(
    ({ season }) => !season.isFinishedAt(now),
  );
  if (unfinished.length === 0) {
    return candidates.every(({ season }) => season.games.length === 0);
  }
  return unfinished.some(({ season }) =>
    season.isRegistrationOpenAt(now, rules),
  );
}

/** The tip-off of the soonest game still open for predictions, or null. */
function nextGameAt(season: Season, now: Instant): Instant | null {
  return season.games
    .filter((game) => game.isOpenAt(now))
    .reduce<Instant | null>(
      (soonest, game) =>
        soonest === null || game.tipOff < soonest ? game.tipOff : soonest,
      null,
    );
}

/**
 * R-27 (Q1): the soonest next game first; a tournament with none after
 * every one that has one; on a tie, and among those with none, the newest
 * (the highest id), as R-46 settles its tie.
 */
function soonerFirst(now: Instant) {
  return (a: JoinCandidate, b: JoinCandidate): number => {
    const first = nextGameAt(a.season, now);
    const second = nextGameAt(b.season, now);
    if (first !== second) {
      if (first === null) return 1;
      if (second === null) return -1;
      return first - second;
    }
    return b.tournament.id - a.tournament.id;
  };
}

/**
 * PostRegisterController::resolveIntendedTournament, with R-27 for its
 * fallback: the tournament named by `intended` (the slug /login or
 * /register was given) if it takes players; else the open tournament whose
 * next game is soonest; else none - joining nothing is recoverable on the
 * hub, joining a tournament that cannot take the player is not.
 */
export function tournamentToJoin(input: {
  readonly intended: string | null;
  readonly candidates: readonly JoinCandidate[];
  readonly now: Instant;
  readonly rules: RuleSet;
}): Tournament | null {
  const { intended, candidates, now, rules } = input;
  const open = candidates.filter(({ season }) =>
    isOpenForRegistration(season, now, rules),
  );
  const named = open.find(({ tournament }) => tournament.slug === intended);
  if (named !== undefined) return named.tournament;
  return [...open].sort(soonerFirst(now))[0]?.tournament ?? null;
}
```

In `packages/domain/src/index.ts`, after the `./fill-in/fill-in` export block, add:

```ts
export {
  isOpenForRegistration,
  joinTournament,
  registrationIsOpen,
  tournamentToJoin,
  type JoinCandidate,
  type Joining,
  type JoiningInput,
  type JoiningRefusal,
} from './joining/joining';
```

If Q1's answer differs, only `soonerFirst` and the last test change; if Q4's does, `registrationIsOpen` returns `false` for an empty `unfinished` list and its two tests say so.

- [ ] **Step 4: Run it to see it pass**

Run: `pnpm format && pnpm --filter @sportbet/domain exec vitest run src/joining/joining.test.ts`
Expected: PASS, 15 tests.

Run: `pnpm test:unit 2>&1 | grep -E "Test Files|Tests " && pnpm --filter @sportbet/domain typecheck && pnpm lint`
Expected: every domain test passes; clean.

- [ ] **Step 5: Hand to the lead**

Files: `joining.ts`, `joining.test.ts`, `index.ts`. Commit message: `feat(domain): joining a tournament - open only while it takes players (R-8), late joiners filled in (R-9), the tournament a new account joins (R-27) (#18)`.

---

### Task 4 (backend-dev): Joining written to the database - `registerForTournament`, `loadJoinCandidates`

`TournamentRegistrationService::register` runs in one transaction; each seeder inserts only the rows the player lacks. The new app writes `tournament_players` (sportbet's public-league membership waits for slice 12, spec), blank `match_predictions` and `standings_predictions` rows, and under `ruledRules` a late joiner's fill-ins, scored by the one recalculation (`CLAUDE.md`: derived rows only through `recalculateUnderRuleSet`).

**Files:**
- Create: `packages/db/src/joining/repository.ts`
- Create: `packages/db/test/joining.test.ts`
- Modify: `packages/db/src/index.ts` (after the `./recalculation/repository` block)

- [ ] **Step 1: Write the failing test**

`packages/db/test/joining.test.ts`:

```ts
// TournamentRegistrationService::register and PredictionRows::seedMissing:
// a join writes the player's place and blank rows once, only while the
// tournament takes players; a late joiner is filled in and scored under
// ruledRules (R-9), never under sportbetRules (R-8 closes it first).

import {
  Game,
  ruledRules,
  sportbetRules,
  type RuleSet,
} from '@sportbet/domain';
import {
  at,
  gameNo,
  player,
  roundNo,
  seededDice,
  testPlayer,
  unwrap,
} from '@sportbet/domain/testing';
import { beforeEach, describe, expect, it } from 'vitest';
import { z } from 'zod';
import {
  loadJoinCandidates,
  loadTournamentPoints,
  registerForTournament,
  savePlayers,
} from '../src';
import { saveGames } from '../src/season/repository';
import { useTestDatabase } from '../src/testing';
import {
  G10,
  G7,
  G9,
  OLY,
  OTHER,
  REA,
  saveWorld,
  TOURNAMENT,
} from './world';
import { saveTournament } from '../src/tournament/repository';

const { db, client } = useTestDatabase();

const JONAS = player('9');

/** Game 11: round 1, still to come all season. */
const G11 = unwrap(
  Game.stored({
    id: gameNo(11),
    round: roundNo(1),
    home: REA,
    away: OLY,
    tipOff: at('2026-12-01T18:00:00Z'),
    result: null,
    recordedWinner: null,
    lockedSince: null,
    postponed: false,
  }),
);

const rowsOf = z.array(
  z.object({
    game_id: z.int(),
    home: z.int().nullable(),
    away: z.int().nullable(),
    origin: z.string(),
  }),
);

const predictions = async () =>
  rowsOf.parse(
    (
      await client.query(
        'select game_id, home, away, origin from match_predictions where player_id = 9 order by game_id',
      )
    ).rows,
  );

const count = async (table: string) =>
  z
    .array(z.object({ rows: z.int() }))
    .parse(
      (
        await client.query(
          `select count(*)::int as rows from ${table} where player_id = 9`,
        )
      ).rows,
    )[0]?.rows;

const join = (now: string, rules: RuleSet) =>
  registerForTournament(db, {
    player: JONAS,
    tournament: TOURNAMENT,
    rules,
    now: at(now),
    dice: seededDice(7),
  });

beforeEach(async () => {
  await saveWorld(db);
  await savePlayers(db, [testPlayer(JONAS, 'jonas')]);
  // 7 scored (10-02), 9 postponed before its tip-off, 10 locked after a
  // move (10-03), 11 still to come.
  await saveGames(db, TOURNAMENT, [G7, G9, G10, G11]);
});

describe('registerForTournament', () => {
  it('joining: a newcomer gets their place, a blank row per game and a standings row per team, once', async () => {
    expect(await join('2026-10-01T12:00:00Z', sportbetRules)).toEqual({
      ok: true,
      value: { newcomer: true, lateFillIns: 0 },
    });
    const blank = (game: number) => ({
      game_id: game,
      home: null,
      away: null,
      origin: 'real',
    });
    expect(await predictions()).toEqual([blank(7), blank(9), blank(10), blank(11)]);
    expect(await count('standings_predictions')).toBe(4);
    expect(
      (
        await client.query(
          'select tournament_id, switched_off, admin_hidden, fill_ins from tournament_players where player_id = 9',
        )
      ).rows,
    ).toEqual([
      {
        tournament_id: TOURNAMENT.id,
        switched_off: false,
        admin_hidden: false,
        fill_ins: 0,
      },
    ]);
    // Joining again changes nothing (PredictionRows::seedMissing).
    expect(await join('2026-10-01T13:00:00Z', sportbetRules)).toEqual({
      ok: true,
      value: { newcomer: false, lateFillIns: 0 },
    });
    expect(await count('match_predictions')).toBe(4);
    expect(await count('standings_predictions')).toBe(4);
    expect(await count('tournament_players')).toBe(1);
  });

  it('joining (sportbet): refused from the first game on, and nothing is written', async () => {
    expect(await join('2026-10-03T12:00:00Z', sportbetRules)).toEqual({
      ok: false,
      refusal: 'registration-closed',
    });
    expect(await count('tournament_players')).toBe(0);
    expect(await count('match_predictions')).toBe(0);
    expect(await count('standings_predictions')).toBe(0);
  });

  it('late joiner (ruled): the games already played are filled in and scored through the recalculation, the rest blank (R-9)', async () => {
    expect(await join('2026-10-12T12:00:00Z', ruledRules)).toEqual({
      ok: true,
      value: { newcomer: true, lateFillIns: 2 },
    });
    const rows = await predictions();
    expect(rows.map(({ game_id, origin }) => [game_id, origin])).toEqual([
      [7, 'late-fill-in'],
      [9, 'real'],
      [10, 'late-fill-in'],
      [11, 'real'],
    ]);
    expect(
      rows
        .filter(({ origin }) => origin === 'late-fill-in')
        .every(({ home, away }) => home !== null && away !== null),
    ).toBe(true);
    // Game 7 has a result: its fill-in is scored, under the ruled source only.
    const ruled = await loadTournamentPoints(db, TOURNAMENT, 'ruled');
    expect(ruled.matches.map(({ player: who, game }) => [who, game])).toEqual([
      [JONAS, gameNo(7)],
    ]);
    const sportbet = await loadTournamentPoints(db, TOURNAMENT, 'sportbet');
    expect(sportbet.matches).toEqual([]);
    // R-9: fill-ins at joining do not count toward being switched off (R-7).
    expect(
      (
        await client.query(
          'select fill_ins from tournament_players where player_id = 9',
        )
      ).rows,
    ).toEqual([{ fill_ins: 0 }]);
  });

  it('joining again fills nobody in: a player already in is no late joiner', async () => {
    await join('2026-10-01T12:00:00Z', sportbetRules);
    expect(await join('2026-10-12T12:00:00Z', ruledRules)).toEqual({
      ok: true,
      value: { newcomer: false, lateFillIns: 0 },
    });
    expect(
      (await predictions()).every(({ origin }) => origin === 'real'),
    ).toBe(true);
  });
});

it('loadJoinCandidates: every tournament with its season, by id', async () => {
  await saveTournament(db, OTHER);
  const candidates = await loadJoinCandidates(db);
  expect(
    candidates.map(({ tournament, season }) => [
      tournament.slug,
      season.games.map(({ id }) => id),
    ]),
  ).toEqual([
    [TOURNAMENT.slug, [gameNo(7), gameNo(9), gameNo(10), gameNo(11)]],
    [OTHER.slug, []],
  ]);
});
```

- [ ] **Step 2: Run it to see it fail**

Run: `pnpm --filter @sportbet/db exec vitest run test/joining.test.ts`
Expected: FAIL - `loadJoinCandidates` and `registerForTournament` are not exported (`is not a function`).

- [ ] **Step 3: Write the code**

`packages/db/src/joining/repository.ts`:

```ts
import {
  joinTournament,
  ok,
  type FillInDice,
  type Instant,
  type JoinCandidate,
  type JoiningRefusal,
  type PlayerId,
  type Result,
  type RuleSet,
  type Tournament,
} from '@sportbet/domain';
import { and, eq } from 'drizzle-orm';
import { z } from 'zod';
import type { Executor } from '../client';
import { inChunks, keyOf } from '../edge';
import { tournamentPlayers } from '../player/schema';
import { matchPredictions } from '../prediction/schema';
import { recalculateUnderRuleSet } from '../recalculation/repository';
import { loadSeason } from '../season/repository';
import { standingsPredictions } from '../standings/schema';
import { listTeams } from '../team/repository';
import { listTournaments } from '../tournament/repository';

/** Every tournament with its season, by id: what a new account may join. */
export async function loadJoinCandidates(
  db: Executor,
): Promise<JoinCandidate[]> {
  const candidates: JoinCandidate[] = [];
  for (const tournament of await listTournaments(db)) {
    candidates.push({ tournament, season: await loadSeason(db, tournament) });
  }
  return candidates;
}

export interface TournamentJoin {
  readonly player: PlayerId;
  readonly tournament: Tournament;
  readonly rules: RuleSet;
  readonly now: Instant;
  /** The fill-in generator's randomness (FI-2): a late joiner's rows. */
  readonly dice: FillInDice;
}

/** What a join wrote: whether the place is new, and how many late fill-ins. */
export interface Joined {
  readonly newcomer: boolean;
  readonly lateFillIns: number;
}

const placeRows = z.array(z.object({ player: z.int() }));

/**
 * TournamentRegistrationService::register, in one transaction (a savepoint
 * when `db` is one): the domain decides (joinTournament) from the
 * tournament's season, teams and whether the player is in it; each row is
 * then inserted only where it is missing, so a second join writes nothing
 * (PredictionRows::seedMissing). A late joiner's fill-ins (R-9) are scored
 * by recalculateUnderRuleSet under the same rule set - the one way derived
 * rows are made - whose refusal is an inconsistent database: it throws, and
 * the join is rolled back.
 */
export async function registerForTournament(
  db: Executor,
  joining: TournamentJoin,
): Promise<Result<Joined, JoiningRefusal>> {
  const { player, tournament, rules, now, dice } = joining;
  const playerKey = keyOf(player, 'player');
  return db.transaction(
    async (tx): Promise<Result<Joined, JoiningRefusal>> => {
      const season = await loadSeason(tx, tournament);
      const teams = (await listTeams(tx, tournament)).map(({ id }) => id);
      const places = placeRows.parse(
        await tx
          .select({ player: tournamentPlayers.playerId })
          .from(tournamentPlayers)
          .where(
            and(
              eq(tournamentPlayers.tournamentId, tournament.id),
              eq(tournamentPlayers.playerId, playerKey),
            ),
          ),
      );
      const decided = joinTournament({
        player,
        season,
        teams,
        alreadyIn: places.length > 0,
        rules,
        now,
        dice,
      });
      if (!decided.ok) return decided;
      const { newcomer, blankGames, standingsTeams, lateFillIns } =
        decided.value;
      if (newcomer) {
        await tx
          .insert(tournamentPlayers)
          .values({
            tournamentId: tournament.id,
            playerId: playerKey,
            switchedOff: false,
            adminHidden: false,
            fillIns: 0,
          })
          .onConflictDoNothing({
            target: [tournamentPlayers.tournamentId, tournamentPlayers.playerId],
          });
      }
      const predictions: (typeof matchPredictions.$inferInsert)[] = [
        ...blankGames.map((game) => ({
          playerId: playerKey,
          gameId: game,
          home: null,
          away: null,
          origin: 'real' as const,
          filledInAt: null,
        })),
        ...lateFillIns.map((prediction) => ({
          playerId: playerKey,
          gameId: prediction.game,
          home: prediction.home,
          away: prediction.away,
          origin: prediction.origin,
          filledInAt:
            prediction.filledInAt === null
              ? null
              : new Date(prediction.filledInAt),
        })),
      ];
      await inChunks(predictions, (chunk) =>
        tx
          .insert(matchPredictions)
          .values(chunk)
          .onConflictDoNothing({
            target: [matchPredictions.playerId, matchPredictions.gameId],
          }),
      );
      await inChunks(
        standingsTeams.map((team) => ({
          playerId: playerKey,
          teamId: keyOf(team, 'team'),
          place: null,
          playOffs: null,
          finalFour: null,
          finalPlace: null,
        })),
        (chunk) =>
          tx
            .insert(standingsPredictions)
            .values(chunk)
            .onConflictDoNothing({
              target: [
                standingsPredictions.playerId,
                standingsPredictions.teamId,
              ],
            }),
      );
      if (lateFillIns.length > 0) {
        const refusal = await recalculateUnderRuleSet(tx, tournament, rules);
        if (refusal !== null) {
          throw new Error(
            `registerForTournament: tournament ${String(tournament.id)} could not be recalculated (${refusal})`,
          );
        }
      }
      return ok({ newcomer, lateFillIns: lateFillIns.length });
    },
  );
}
```

In `packages/db/src/index.ts`, after the `./recalculation/repository` export block, add:

```ts
export {
  loadJoinCandidates,
  registerForTournament,
  type Joined,
  type TournamentJoin,
} from './joining/repository';
```

- [ ] **Step 4: Run it to see it pass**

Run: `pnpm format && pnpm --filter @sportbet/db exec vitest run test/joining.test.ts`
Expected: PASS, 5 tests.

Run: `pnpm test:db 2>&1 | grep -E "Test Files|Tests " && pnpm typecheck && pnpm lint`
Expected: every db test passes; clean.

- [ ] **Step 5: Hand to the lead**

Files: `packages/db/src/joining/repository.ts`, `packages/db/test/joining.test.ts`, `packages/db/src/index.ts`. Commit message: `feat(db): joining a tournament writes the place and blank rows once, and a late joiner's fill-ins through the one recalculation (#18)`.

---

### Task 5 (backend-dev): Creating an account - `isEmailRegistered`, `createAccount` **(sensitive)**

sportbet's `RegisteredUserController::createAccount`: in one transaction, `User::where('username', ...)->orWhere('email', ...)->exists()` (utf8mb4_unicode_ci: case and accents ignored) answers taken; else the user, `postRegisterActions` (the settings row, admin 0 - the spec keeps 0 even for id 1 - and the join); `UniqueConstraintViolationException` is taken too; any other failure is reported as itself (#270). Step one's `unique:users` is the same comparison on the address.

**Files:**
- Create: `packages/db/src/sql-state.ts`, `packages/db/test/sql-state.test.ts`
- Create: `packages/db/src/account/registration.ts`, `packages/db/test/registration.test.ts`
- Modify: `packages/db/test/account.test.ts:104-114` (the address guard)
- Modify: `packages/db/src/index.ts` (after the `./account/repository` block)

- [ ] **Step 1: Write the failing tests**

`packages/db/test/sql-state.test.ts`:

```ts
import { expect, it } from 'vitest';
import { violatedUnique } from '../src/sql-state';

class DatabaseError extends Error {
  readonly code: string;
  readonly constraint: string | undefined;

  constructor(code: string, constraint?: string) {
    super('duplicate key value violates unique constraint');
    this.code = code;
    this.constraint = constraint;
  }
}

it('names the unique constraint a statement broke, through Drizzle\'s cause', () => {
  const wrapped = new Error('Failed query', {
    cause: new DatabaseError('23505', 'players_username_unique'),
  });
  expect(violatedUnique(wrapped)).toBe('players_username_unique');
  expect(violatedUnique(new DatabaseError('23505', 'players_pkey'))).toBe(
    'players_pkey',
  );
});

it('names nothing for any other failure', () => {
  expect(violatedUnique(new DatabaseError('23514', 'players_name_length'))).toBeNull();
  expect(violatedUnique(new Error('connection lost'))).toBeNull();
  expect(violatedUnique('not an error')).toBeNull();
});
```

`packages/db/test/registration.test.ts`:

```ts
// RegisteredUserController::createAccount and PostRegisterController: the
// taken checks as sportbet's collation compares, one transaction for the
// player, the settings and the join, rolled back whole on any failure.

import {
  emailAddress,
  Game,
  Round,
  ruledRules,
  sportbetRules,
  type RuleSet,
} from '@sportbet/domain';
import {
  at,
  gameNo,
  player,
  rate,
  roundNo,
  seededDice,
  team,
  testPlayer,
  unwrap,
} from '@sportbet/domain/testing';
import { beforeEach, describe, expect, it } from 'vitest';
import { z } from 'zod';
import {
  advanceIdentitySequences,
  createAccount,
  isEmailRegistered,
  savePlayers,
  type NewAccount,
} from '../src';
import { saveGames, saveRounds } from '../src/season/repository';
import { saveTeams } from '../src/team/repository';
import { saveTournament } from '../src/tournament/repository';
import { useTestDatabase } from '../src/testing';
import { OLY, OTHER, REA, saveWorld, TOURNAMENT } from './world';

const { db, client } = useTestDatabase();

const NOW = at('2026-10-05T12:00:00Z');
const email = (typed: string) => unwrap(emailAddress(typed));

const RUTA: NewAccount = {
  username: 'naujoke',
  name: 'Rūta',
  surname: 'Naujokė',
  email: email('ruta.naujoke@example.lt'),
  intended: null,
};

const create = (
  account: NewAccount = RUTA,
  rules: RuleSet = ruledRules,
  now = NOW,
) => createAccount(db, account, { now, rules, dice: seededDice(3) });

const count = async (table: string) =>
  z
    .array(z.object({ rows: z.int() }))
    .parse(
      (await client.query(`select count(*)::int as rows from ${table}`)).rows,
    )[0]?.rows;

/** TOURNAMENT's game 11 on 12-01, OTHER's game 21 on 12-20: both open. */
beforeEach(async () => {
  await saveWorld(db);
  await saveGames(db, TOURNAMENT, [
    unwrap(
      Game.schedule({
        id: gameNo(11),
        round: roundNo(1),
        home: REA,
        away: OLY,
        tipOff: at('2026-12-01T18:00:00Z'),
      }),
    ),
  ]);
  await saveTournament(db, OTHER);
  await saveTeams(db, OTHER, [
    { id: team('31'), name: 'Paris' },
    { id: team('32'), name: 'Monaco' },
  ]);
  await saveRounds(db, OTHER, [
    {
      id: 41,
      name: '1 turas',
      round: Round.stored({
        number: roundNo(1),
        stage: 'regular',
        rate: rate(1),
        survival: true,
        knockout: false,
      }),
    },
  ]);
  await saveGames(db, OTHER, [
    unwrap(
      Game.schedule({
        id: gameNo(21),
        round: roundNo(1),
        home: team('31'),
        away: team('32'),
        tipOff: at('2026-12-20T18:00:00Z'),
      }),
    ),
  ]);
  // ada, ben and cai hold ids 1 to 3: a new account takes the next one.
  await advanceIdentitySequences(db);
});

describe('isEmailRegistered (unique:users under utf8mb4_unicode_ci)', () => {
  it('registration: the address, and a second spelling of it once accents are dropped, are registered; another is not', async () => {
    expect(await isEmailRegistered(db, email('ada@example.test'))).toBe(true);
    expect(await isEmailRegistered(db, email('adà@example.test'))).toBe(true);
    expect(await isEmailRegistered(db, email('ada2@example.test'))).toBe(
      false,
    );
  });
});

describe('createAccount', () => {
  it('registration: creates the player and their settings (admin level 0, lt), and joins the open tournament whose next game is soonest (R-27)', async () => {
    expect(await create()).toEqual({
      ok: true,
      value: { player: player('4'), tournament: TOURNAMENT },
    });
    expect(
      (
        await client.query(
          'select id, username, name, surname, email from players where id = 4',
        )
      ).rows,
    ).toEqual([
      {
        id: 4,
        username: 'naujoke',
        name: 'Rūta',
        surname: 'Naujokė',
        email: 'ruta.naujoke@example.lt',
      },
    ]);
    expect(
      (await client.query('select * from player_settings')).rows,
    ).toEqual([
      { player_id: 4, locale: 'lt', admin_level: 0, last_tournament_id: null },
    ]);
    expect(
      (await client.query('select tournament_id, player_id from tournament_players'))
        .rows,
    ).toEqual([{ tournament_id: TOURNAMENT.id, player_id: 4 }]);
    expect(await count('match_predictions')).toBe(1);
    expect(await count('standings_predictions')).toBe(4);
  });

  it('registration: joins the ?tournament= one when it takes players', async () => {
    const created = await create({ ...RUTA, intended: OTHER.slug });
    expect(created.ok && created.value.tournament).toEqual(OTHER);
  });

  it('registration: an unknown slug falls back to R-27', async () => {
    const created = await create({ ...RUTA, intended: 'no-such-tournament' });
    expect(created.ok && created.value.tournament).toEqual(TOURNAMENT);
  });

  it('registration: with no tournament taking players, the account joins none', async () => {
    const created = await create(
      RUTA,
      sportbetRules,
      at('2027-01-05T12:00:00Z'),
    );
    expect(created).toEqual({
      ok: true,
      value: { player: player('4'), tournament: null },
    });
    expect(await count('player_settings')).toBe(1);
    expect(await count('tournament_players')).toBe(0);
  });

  it.each([
    ['the address', 'ada@example.test'],
    ['a second spelling of the address', 'adà@example.test'],
  ])('registration: %s taken answers taken, and writes nothing', async (_label, typed) => {
    expect(await create({ ...RUTA, email: email(typed) })).toEqual({
      ok: false,
      refusal: 'taken',
    });
    expect(await count('players')).toBe(3);
    expect(await count('player_settings')).toBe(0);
  });

  it.each(['ada', 'ADA', 'Adà', 'ada '])(
    'registration: the username %s is taken, as sportbet\'s collation compares it',
    async (username) => {
      expect(await create({ ...RUTA, username })).toEqual({
        ok: false,
        refusal: 'taken',
      });
      expect(await count('players')).toBe(3);
    },
  );

  it('registration: a failure partway rolls the whole account back (#270)', async () => {
    await client.query(`
      create function refuse_standings() returns trigger language plpgsql
        as $$ begin raise exception 'simulated failure writing a standings row'; end $$;
      create trigger refuse_standings before insert on standings_predictions
        for each row execute function refuse_standings();
    `);
    try {
      await expect(create()).rejects.toThrow();
      expect(await count('players')).toBe(3);
      expect(await count('player_settings')).toBe(0);
      expect(await count('tournament_players')).toBe(0);
      expect(await count('match_predictions')).toBe(0);
    } finally {
      await client.query(`
        drop trigger refuse_standings on standings_predictions;
        drop function refuse_standings();
      `);
    }
  });

  it('registration: a collision that is no naming one is thrown, never answered as taken (#270)', async () => {
    // Saved under its own id after the sequence moved: the next generated
    // id collides with it on the primary key.
    await savePlayers(db, [testPlayer(player('4'), 'dan')]);
    await expect(create()).rejects.toThrow();
    expect(await count('players')).toBe(4);
  });
});
```

In `packages/db/test/account.test.ts`, replace the test "no account lookup folds an address..." (lines 104-114) with:

```ts
it('no account lookup folds an address: no ILIKE, unaccent, citext or email_fold outside the index and registration\'s uniqueness check (#16, #41)', () => {
  const area = join(import.meta.dirname, '..', 'src', 'account');
  const sources = readdirSync(area)
    .filter((name) => name.endsWith('.ts') && name !== 'schema.ts')
    .map((name) => ({ name, text: readFileSync(join(area, name), 'utf8') }));
  expect(sources.length).toBeGreaterThan(0);
  expect(
    sources
      .filter(
        ({ name, text }) =>
          /ilike|unaccent|citext/i.test(text) ||
          (name !== 'registration.ts' && /email_fold/i.test(text)),
      )
      .map(({ name }) => name),
  ).toEqual([]);
  // registration.ts folds in one place: isEmailRegistered's comparison.
  const registration = sources.find(({ name }) => name === 'registration.ts');
  expect(registration?.text.match(/email_fold\(/g)).toHaveLength(2);
});
```

- [ ] **Step 2: Run them to see them fail**

Run: `pnpm --filter @sportbet/db exec vitest run test/sql-state.test.ts test/registration.test.ts test/account.test.ts`
Expected: FAIL - `Failed to resolve import "../src/sql-state"`, `createAccount is not a function`, and the guard's `registration` is undefined.

- [ ] **Step 3: Write the code**

`packages/db/src/sql-state.ts`:

```ts
/** Postgres's SQLSTATE for a unique violation. */
const UNIQUE_VIOLATION = '23505';

/**
 * The unique constraint (or unique index) a statement broke, from pg's
 * error or the one Drizzle wraps in `cause`; null for any other failure.
 * Its message is never read: it quotes the row's values.
 */
export function violatedUnique(error: unknown): string | null {
  for (
    let current: unknown = error;
    current instanceof Error;
    current = current.cause
  ) {
    const code: unknown = Reflect.get(current, 'code');
    const constraint: unknown = Reflect.get(current, 'constraint');
    if (code === UNIQUE_VIOLATION && typeof constraint === 'string') {
      return constraint;
    }
  }
  return null;
}
```

`packages/db/src/account/registration.ts`:

```ts
import {
  foldUsername,
  ok,
  refuse,
  tournamentToJoin,
  usernameInvariant,
  type EmailAddress,
  type FillInDice,
  type Instant,
  type PlayerId,
  type Result,
  type RuleSet,
  type Tournament,
} from '@sportbet/domain';
import { eq, or, sql } from 'drizzle-orm';
import { z } from 'zod';
import type { Executor } from '../client';
import { playerOf } from '../edge';
import {
  loadJoinCandidates,
  registerForTournament,
} from '../joining/repository';
import { players } from '../player/schema';
import { violatedUnique } from '../sql-state';
import { playerSettings } from './schema';

const idRows = z.array(z.object({ id: z.int() }));
const usernameRows = z.array(z.object({ username: usernameInvariant.schema }));

/**
 * Whether an account holds this address (step one's `unique:users`, step
 * two's `orWhere('email', ...)`): the same address, or a second spelling
 * that folds like it as utf8mb4_unicode_ci folds it. A uniqueness check,
 * never a lookup - sign-in finds an account by the exact address only
 * (findAccountByEmail) - and asked of the rows, not left to the unique
 * index, whose fold is close to the collation's but not the same (#16).
 */
export async function isEmailRegistered(
  db: Executor,
  email: EmailAddress,
): Promise<boolean> {
  const rows = await db
    .select({ id: players.id })
    .from(players)
    .where(
      or(
        eq(players.email, email),
        sql`email_fold(${players.email}) = email_fold(${email})`,
      ),
    )
    .limit(1);
  return idRows.parse(rows).length > 0;
}

/** The answers a pending registration kept, and the slug it was given. */
export interface NewAccount {
  readonly username: string;
  readonly name: string;
  readonly surname: string;
  readonly email: EmailAddress;
  /** The `?tournament=` slug /login or /register was given, if any. */
  readonly intended: string | null;
}

/** The moment, the rule set and the dice the join is made with. */
export interface Registering {
  readonly now: Instant;
  readonly rules: RuleSet;
  readonly dice: FillInDice;
}

export interface CreatedAccount {
  readonly player: PlayerId;
  /** The tournament joined, or null when none took players. */
  readonly tournament: Tournament | null;
}

/** The constraints that mean a name is taken; any other is a failure (#270). */
const TAKEN = new Set(['players_username_unique', 'players_email_folded_unique']);

async function accountTaken(
  db: Executor,
  account: NewAccount,
): Promise<boolean> {
  if (await isEmailRegistered(db, account.email)) return true;
  const wanted = foldUsername(account.username);
  const rows = usernameRows.parse(
    await db.select({ username: players.username }).from(players),
  );
  return rows.some(({ username }) => foldUsername(username) === wanted);
}

/**
 * RegisteredUserController::createAccount and postRegisterActions, in one
 * transaction: taken (the address, or the username as sportbet's collation
 * compares it - foldUsername) answers 'taken' and writes nothing; else the
 * player, their settings (admin level 0, locale lt, no last tournament),
 * and the tournament they join (tournamentToJoin: the intended one if it
 * takes players, else R-27's, else none) through registerForTournament.
 * An advisory lock makes two creations take turns, so the checks cannot
 * race; a unique violation on the username or the folded address is taken
 * all the same. Any other failure throws, and nothing is kept.
 */
export async function createAccount(
  db: Executor,
  account: NewAccount,
  registering: Registering,
): Promise<Result<CreatedAccount, 'taken'>> {
  const { now, rules, dice } = registering;
  try {
    return await db.transaction(
      async (tx): Promise<Result<CreatedAccount, 'taken'>> => {
        await tx.execute(
          sql`select pg_advisory_xact_lock(hashtextextended('registration', 0))`,
        );
        if (await accountTaken(tx, account)) return refuse('taken');
        const [row] = idRows.parse(
          await tx
            .insert(players)
            .values({
              username: account.username,
              email: account.email,
              name: account.name,
              surname: account.surname,
            })
            .returning({ id: players.id }),
        );
        if (row === undefined) {
          throw new Error('createAccount: the insert returned no player');
        }
        const player = playerOf(row.id);
        await tx.insert(playerSettings).values({
          playerId: row.id,
          locale: 'lt',
          adminLevel: 0,
          lastTournamentId: null,
        });
        const tournament = tournamentToJoin({
          intended: account.intended,
          candidates: await loadJoinCandidates(tx),
          now,
          rules,
        });
        if (tournament !== null) {
          const joined = await registerForTournament(tx, {
            player,
            tournament,
            rules,
            now,
            dice,
          });
          if (!joined.ok) {
            throw new Error(
              `createAccount: tournament ${String(tournament.id)}, chosen as open, refused the player`,
            );
          }
        }
        return ok({ player, tournament });
      },
    );
  } catch (error) {
    const constraint = violatedUnique(error);
    if (constraint !== null && TAKEN.has(constraint)) return refuse('taken');
    throw error;
  }
}
```

In `packages/db/src/index.ts`, after the `./account/repository` export block, add:

```ts
export {
  createAccount,
  isEmailRegistered,
  type CreatedAccount,
  type NewAccount,
  type Registering,
} from './account/registration';
```

- [ ] **Step 4: Run them to see them pass**

Run: `pnpm format && pnpm --filter @sportbet/db exec vitest run test/sql-state.test.ts test/registration.test.ts test/account.test.ts`
Expected: PASS (`registration.test.ts`: 13 tests).

Run: `pnpm test:db 2>&1 | grep -E "Test Files|Tests " && pnpm typecheck && pnpm lint`
Expected: every db test passes; clean.

- [ ] **Step 5: Hand to the lead**

Files: `sql-state.ts`, `account/registration.ts`, `index.ts`, the three tests. Commit message: `feat(db): creating an account in one transaction - taken as sportbet's collation compares, the settings, the join, rolled back whole (#18)`.

---

### Task 6 (web-dev): The pending registration and the intended tournament, in signed cookies **(sensitive)**

sportbet keeps `registration_pending` (the four answers), `registration_sent_at` and `intended_tournament` in its session. The new app's session holds only who the player is (decision 5), so the answers wait in a signed cookie like 4b's pending sign-in, and the slug in its own (decisions 2, 3).

**Files:**
- Create: `apps/web/src/server/sealed.ts`, `apps/web/src/server/sealed.test.ts`
- Modify: `apps/web/src/server/sign-in/pending.ts`
- Modify: `apps/web/src/server/cookies.ts`, `apps/web/src/server/cookies.test.ts`
- Modify: `apps/web/src/components/shell/sign-in-state.ts` (one type, `DialogTab`)
- Create: `apps/web/src/server/register/pending-registration.ts`, `apps/web/src/server/register/pending-registration.test.ts`
- Create: `apps/web/src/server/register/intended.ts`, `apps/web/src/server/register/intended.test.ts`

- [ ] **Step 1: Write the failing tests**

`apps/web/src/server/sealed.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import { seal, unseal } from './sealed';

const SECRET = 'test-secret-test-secret-test-secret';

describe('a sealed cookie value', () => {
  it('opens to what was sealed, for the purpose it was sealed for', () => {
    const sealed = seal('registration', { a: 1, b: 'ž' }, SECRET);
    expect(unseal('registration', sealed, SECRET)).toEqual({ a: 1, b: 'ž' });
  });

  it('opens to nothing for another purpose, another key, a changed body or signature, or no value', () => {
    const sealed = seal('registration', { a: 1 }, SECRET);
    const [body = '', signature = ''] = sealed.split('.');
    expect(unseal('sign-in', sealed, SECRET)).toBeNull();
    expect(unseal('registration', sealed, `${SECRET}-other`)).toBeNull();
    const other = Buffer.from(JSON.stringify({ a: 2 })).toString('base64url');
    expect(unseal('registration', `${other}.${signature}`, SECRET)).toBeNull();
    const altered = `${signature.startsWith('A') ? 'B' : 'A'}${signature.slice(1)}`;
    expect(unseal('registration', `${body}.${altered}`, SECRET)).toBeNull();
    expect(unseal('registration', 'nonsense', SECRET)).toBeNull();
    expect(unseal('registration', undefined, SECRET)).toBeNull();
  });
});
```

Append to `apps/web/src/server/cookies.test.ts` (adding `dialogTabOf, INTENDED_TOURNAMENT_COOKIE, PENDING_REGISTRATION_COOKIE` to its import from `./cookies`):

```ts
describe('the registration cookies (spec 4c)', () => {
  it("the pending registration: two hours, sportbet's session lifetime, which held registration_pending", () => {
    expect(PENDING_REGISTRATION_COOKIE).toEqual({
      name: '__Host-sb_register',
      options: { ...COOKIE_FLAGS, maxAge: 7200 },
    });
  });

  it("the tournament a guest arrived to join: two hours, as sportbet's session held intended_tournament", () => {
    expect(INTENDED_TOURNAMENT_COOKIE).toEqual({
      name: '__Host-sb_intended',
      options: { ...COOKIE_FLAGS, maxAge: 7200 },
    });
  });

  it("the dialog opens on /register's tab, and on the sign-in's for anything else", () => {
    expect(dialogTabOf('register')).toBe('register');
    expect(dialogTabOf('login')).toBe('login');
    expect(dialogTabOf('1')).toBe('login');
    expect(dialogTabOf(null)).toBe('login');
  });
});
```

`apps/web/src/server/register/pending-registration.test.ts`:

```ts
import { emailAddress } from '@sportbet/domain';
import { at, unwrap } from '@sportbet/domain/testing';
import { describe, expect, it } from 'vitest';
import { sealPending } from '../sign-in/pending';
import {
  fitsInCookie,
  openRegistration,
  sealRegistration,
  type PendingRegistration,
} from './pending-registration';

const SECRET = 'test-secret-test-secret-test-secret';
const PENDING: PendingRegistration = {
  username: 'naujoke',
  name: 'Rūta',
  surname: 'Naujokė',
  email: unwrap(emailAddress('ruta.naujoke@example.lt')),
  tournament: 'euroleague-2026-27',
  sentAt: at('2026-10-05T12:00:00Z'),
};

describe('the pending registration cookie', () => {
  it('opens to what was sealed', () => {
    expect(openRegistration(sealRegistration(PENDING, SECRET), SECRET)).toEqual(
      PENDING,
    );
    const none = { ...PENDING, tournament: null };
    expect(openRegistration(sealRegistration(none, SECRET), SECRET)).toEqual(
      none,
    );
  });

  it("opens to nothing when sealed with another key, or as a sign-in's", () => {
    expect(
      openRegistration(sealRegistration(PENDING, SECRET), `${SECRET}-other`),
    ).toBeNull();
    expect(
      openRegistration(
        sealPending({ email: PENDING.email, sentAt: PENDING.sentAt }, SECRET),
        SECRET,
      ),
    ).toBeNull();
    expect(openRegistration(undefined, SECRET)).toBeNull();
  });

  it('holds the answers, the slug and when the code went out, and nothing else', () => {
    const [body = ''] = sealRegistration(PENDING, SECRET).split('.');
    expect(JSON.parse(Buffer.from(body, 'base64url').toString('utf8'))).toEqual(
      {
        username: 'naujoke',
        name: 'Rūta',
        surname: 'Naujokė',
        email: 'ruta.naujoke@example.lt',
        tournament: 'euroleague-2026-27',
        sentAt: '2026-10-05T12:00:00Z',
      },
    );
  });

  it("fits a browser's 4,096 bytes, unless the names are long in four-byte characters (plan decision 13)", () => {
    const longest = 'ž'.repeat(255);
    expect(
      fitsInCookie(
        { ...PENDING, username: longest, name: longest, surname: longest },
        SECRET,
      ),
    ).toBe(true);
    const wide = '\u{1F600}'.repeat(255);
    expect(
      fitsInCookie(
        { ...PENDING, username: wide, name: wide, surname: wide },
        SECRET,
      ),
    ).toBe(false);
  });
});
```

`apps/web/src/server/register/intended.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import type { CookieOptions } from '../cookies';
import { forgetIntended, readIntended, rememberIntended } from './intended';

function jar() {
  const values = new Map<string, string>();
  return {
    get: (name: string) => {
      const value = values.get(name);
      return value === undefined ? undefined : { value };
    },
    set: (name: string, value: string, options: CookieOptions) => {
      if (options.maxAge === 0) values.delete(name);
      else values.set(name, value);
    },
  };
}

// AuthenticatedSessionController::create and RegisteredUserController::create:
// a ?tournament= is remembered for registration (intended_tournament).
describe('the tournament a guest arrived to join', () => {
  it('remembers a slug, and forgets it', () => {
    const cookies = jar();
    rememberIntended(cookies, 'euroleague-2026-27');
    expect(readIntended(cookies)).toBe('euroleague-2026-27');
    forgetIntended(cookies);
    expect(readIntended(cookies)).toBeNull();
  });

  it('keeps nothing that is not a slug, and keeps the one it had', () => {
    const cookies = jar();
    rememberIntended(cookies, 'Euroleague 2026');
    rememberIntended(cookies, null);
    expect(readIntended(cookies)).toBeNull();
    rememberIntended(cookies, 'euroleague-2026-27');
    rememberIntended(cookies, '');
    expect(readIntended(cookies)).toBe('euroleague-2026-27');
  });
});
```

After writing `pending-registration.test.ts`, check the escape: `LC_ALL=C.UTF-8 grep -nP '\x{1F600}' apps/web/src/server/register/pending-registration.test.ts` prints nothing.

- [ ] **Step 2: Run them to see them fail**

Run: `pnpm --filter @sportbet/web exec vitest run --config vitest.component.config.ts src/server/sealed.test.ts src/server/cookies.test.ts src/server/register`
Expected: FAIL - `Failed to resolve import "./sealed"`, `"./pending-registration"`, `"./intended"`, and `PENDING_REGISTRATION_COOKIE` undefined.

- [ ] **Step 3: Write the code**

`apps/web/src/server/sealed.ts`:

```ts
import { createHmac, timingSafeEqual } from 'node:crypto';

/**
 * HMAC-SHA256 over the purpose and the body under AUTH_SECRET: a value
 * sealed for one cookie never opens as another's (plan 4c, decision 2).
 */
const signatureOf = (purpose: string, body: string, secret: string) =>
  createHmac('sha256', secret).update(`${purpose}.${body}`).digest('base64url');

/** A cookie value the server alone can make: the JSON, base64url, then its signature. */
export function seal(purpose: string, payload: unknown, secret: string): string {
  const body = Buffer.from(JSON.stringify(payload)).toString('base64url');
  return `${body}.${signatureOf(purpose, body, secret)}`;
}

/** The JSON a sealed value holds, or null for one missing, forged, or sealed for another purpose or key. */
export function unseal(
  purpose: string,
  value: string | undefined,
  secret: string,
): unknown {
  const [body, signature, ...rest] = value?.split('.') ?? [];
  if (body === undefined || signature === undefined || rest.length > 0) {
    return null;
  }
  const expected = Buffer.from(signatureOf(purpose, body, secret));
  const given = Buffer.from(signature);
  if (expected.length !== given.length || !timingSafeEqual(expected, given)) {
    return null;
  }
  try {
    const parsed: unknown = JSON.parse(
      Buffer.from(body, 'base64url').toString('utf8'),
    );
    return parsed;
  } catch {
    return null;
  }
}
```

Replace `apps/web/src/server/sign-in/pending.ts`'s imports, `signatureOf`, `sealPending`, `decoded` and `openPending` with:

```ts
import {
  instantFrom,
  storedEmailAddress,
  type EmailAddress,
  type Instant,
} from '@sportbet/domain';
import { z } from 'zod';
import { isoSecond } from '../clock';
import {
  clearCookie,
  PENDING_COOKIE,
  readCookie,
  setCookie,
  type CookieReader,
  type CookieWriter,
} from '../cookies';
import { seal, unseal } from '../sealed';

/**
 * A code in flight (PENDING_COOKIE, cookies.ts): the address the visitor
 * typed and when the code went out - nothing that steers where the
 * sign-in ends (review W5). A signed cookie, not session state (decision
 * 5); the code itself never leaves the server.
 */
export interface PendingSignIn {
  readonly email: EmailAddress;
  readonly sentAt: Instant;
}

/** What the seal is for: a sign-in's value never opens as a registration's. */
const PURPOSE = 'sign-in';

const payloadSchema = z.object({
  email: z.string(),
  sentAt: z.string(),
});

/** The cookie's value, sealed under AUTH_SECRET (server/sealed.ts). */
export function sealPending(pending: PendingSignIn, secret: string): string {
  return seal(
    PURPOSE,
    { email: pending.email, sentAt: isoSecond(pending.sentAt) },
    secret,
  );
}

/** The pending sign-in, or null for a cookie that is missing, forged or not this app's. */
export function openPending(
  value: string | undefined,
  secret: string,
): PendingSignIn | null {
  const payload = payloadSchema.safeParse(unseal(PURPOSE, value, secret));
  if (!payload.success) return null;
  const email = storedEmailAddress(payload.data.email);
  const sentAt = instantFrom(payload.data.sentAt);
  if (!email.ok || !sentAt.ok) return null;
  return { email: email.value, sentAt: sentAt.value };
}
```

(`readPending`, `writePending` and `clearPending` stay as they are.)

In `apps/web/src/components/shell/sign-in-state.ts`, after `SIGN_IN_IDLE`, add:

```ts
/** The dialog's two tabs (modals/main's #loginPane and #registerPane). */
export type DialogTab = 'login' | 'register';
```

In `apps/web/src/server/cookies.ts`, add at the top:

```ts
import type { DialogTab } from '../components/shell/sign-in-state';
```

replace the `OPEN_SIGN_IN_COOKIE` comment with:

```ts
/**
 * /login's and /register's "open the dialog" for the next page
 * (sportbet's `auth_dialog` flash): `login` or `register`, the tab to open
 * on, for 60 seconds. proxy.ts turns it into OPEN_SIGN_IN_HEADER for that
 * page and clears it on the page's response, so no script needs it.
 */
```

and after `OPEN_SIGN_IN_HEADER` add:

```ts
/** The tab an open-the-dialog value names: `register` is /register's, anything else the sign-in's. */
export function dialogTabOf(value: string | null | undefined): DialogTab {
  return value === 'register' ? 'register' : 'login';
}

/**
 * A registration waiting for its code (server/register/pending-registration.ts):
 * two hours, sportbet's session lifetime, which held registration_pending.
 */
export const PENDING_REGISTRATION_COOKIE: AppCookie = {
  name: '__Host-sb_register',
  options: { ...FLAGS, maxAge: 2 * 60 * 60 },
};

/**
 * The tournament a guest arrived to join, from /login's or /register's
 * `?tournament=` (server/register/intended.ts): two hours, as sportbet's
 * session held intended_tournament. Read by registration only.
 */
export const INTENDED_TOURNAMENT_COOKIE: AppCookie = {
  name: '__Host-sb_intended',
  options: { ...FLAGS, maxAge: 2 * 60 * 60 },
};
```

`apps/web/src/server/register/pending-registration.ts`:

```ts
import {
  instantFrom,
  registrationAnswers,
  slugSchema,
  type Instant,
  type RegistrationAnswers,
} from '@sportbet/domain';
import { z } from 'zod';
import { isoSecond } from '../clock';
import {
  clearCookie,
  PENDING_REGISTRATION_COOKIE,
  readCookie,
  setCookie,
  type CookieReader,
  type CookieWriter,
} from '../cookies';
import { seal, unseal } from '../sealed';

/**
 * A registration waiting for its code (sportbet's session keys
 * registration_pending and registration_sent_at, #102): the answers, the
 * slug /login or /register was given, and when the code went out. No
 * account, settings or tournament place exists until the code comes back,
 * so nothing is left to clean up when it never does.
 */
export interface PendingRegistration extends RegistrationAnswers {
  readonly tournament: string | null;
  readonly sentAt: Instant;
}

/** What the seal is for: a registration's value never opens as a sign-in's. */
const PURPOSE = 'registration';

const payloadSchema = z.object({
  username: z.string(),
  name: z.string(),
  surname: z.string(),
  email: z.string(),
  tournament: slugSchema.nullable(),
  sentAt: z.string(),
});

/** A browser keeps a cookie of at most 4,096 bytes, name and value together (RFC 6265, 6.1). */
const COOKIE_BYTES = 4096;

export function sealRegistration(
  pending: PendingRegistration,
  secret: string,
): string {
  return seal(
    PURPOSE,
    {
      username: pending.username,
      name: pending.name,
      surname: pending.surname,
      email: pending.email,
      tournament: pending.tournament,
      sentAt: isoSecond(pending.sentAt),
    },
    secret,
  );
}

/**
 * The pending registration, or null for a cookie that is missing, forged
 * or not this app's. Its answers are checked again, so only answers step
 * one would accept can ever become an account.
 */
export function openRegistration(
  value: string | undefined,
  secret: string,
): PendingRegistration | null {
  const payload = payloadSchema.safeParse(unseal(PURPOSE, value, secret));
  if (!payload.success) return null;
  const { tournament, sentAt, ...typed } = payload.data;
  const answers = registrationAnswers(typed);
  const at = instantFrom(sentAt);
  if (!answers.ok || !at.ok) return null;
  return { ...answers.value, tournament, sentAt: at.value };
}

/** Whether the sealed answers fit a browser's cookie (plan decision 13): the value is base64url, one byte a character. */
export function fitsInCookie(
  pending: PendingRegistration,
  secret: string,
): boolean {
  const value = sealRegistration(pending, secret);
  return PENDING_REGISTRATION_COOKIE.name.length + 1 + value.length <= COOKIE_BYTES;
}

/** This browser's registration waiting for its code, if its cookie is one this app sealed. */
export function readPendingRegistration(
  jar: CookieReader,
  secret: string,
): PendingRegistration | null {
  return openRegistration(readCookie(jar, PENDING_REGISTRATION_COOKIE), secret);
}

export function writePendingRegistration(
  jar: CookieWriter,
  pending: PendingRegistration,
  secret: string,
): void {
  setCookie(jar, PENDING_REGISTRATION_COOKIE, sealRegistration(pending, secret));
}

/** RegisteredUserController::SESSION_KEYS forgotten: cancelled, taken, closed or done. */
export function clearPendingRegistration(jar: CookieWriter): void {
  clearCookie(jar, PENDING_REGISTRATION_COOKIE);
}
```

`apps/web/src/server/register/intended.ts`:

```ts
import { slugSchema } from '@sportbet/domain';
import {
  clearCookie,
  INTENDED_TOURNAMENT_COOKIE,
  readCookie,
  setCookie,
  type CookieReader,
  type CookieWriter,
} from '../cookies';

/**
 * The tournament a guest arrived to join (sportbet's session key
 * intended_tournament, set by /login and /register from `?tournament=`),
 * if the cookie holds a slug. Registration reads it; sign-in never does.
 */
export function readIntended(jar: CookieReader): string | null {
  const parsed = slugSchema.safeParse(
    readCookie(jar, INTENDED_TOURNAMENT_COOKIE),
  );
  return parsed.success ? parsed.data : null;
}

/**
 * Remembers a `?tournament=` that is a slug (spec: "a valid slug");
 * anything else is not kept, and the slug already remembered stays, as
 * sportbet's `filled('tournament')` left the session alone.
 */
export function rememberIntended(jar: CookieWriter, typed: string | null): void {
  const parsed = slugSchema.safeParse(typed);
  if (parsed.success) setCookie(jar, INTENDED_TOURNAMENT_COOKIE, parsed.data);
}

/** PostRegisterController's Session::forget('intended_tournament'): a registration done. */
export function forgetIntended(jar: CookieWriter): void {
  clearCookie(jar, INTENDED_TOURNAMENT_COOKIE);
}
```

- [ ] **Step 4: Run them to see them pass**

Run: `pnpm format && pnpm --filter @sportbet/web exec vitest run --config vitest.component.config.ts src/server`
Expected: PASS - the new tests and 4b's `pending.test.ts` (whose forgeries still open to nothing).

Run: `pnpm typecheck && pnpm lint`
Expected: clean.

- [ ] **Step 5: Hand to the lead**

Files: `sealed.ts` (+ test), `sign-in/pending.ts`, `cookies.ts` (+ test), `sign-in-state.ts`, `register/pending-registration.ts`, `register/intended.ts` (+ tests). Commit message: `feat(web): the pending registration and the intended tournament in signed cookies; seals bound to their purpose (#18)`.

---

### Task 7 (web-dev): The registration code mail, sending it, the dice

sportbet's `RegistrationCodeMail` and `emails/registration-code.blade.php`: subject and heading "Registracijos patvirtinimo kodas", the lead "Įveskite šį kodą registracijos lange, kad užbaigtumėte registraciją. Kodas galioja :minutes min.", the code, and "Jei neregistravotės, ignoruokite šį laišką - paskyra nebus sukurta. Šiuo kodu prisijungti negalima." - the login mail's layout and colours. `RegisteredUserController::sendCode` mails after the response, never queued. `GeneratedScore` draws with `random_int`.

**Files:**
- Create: `apps/web/src/server/mail/code-mail.ts`
- Modify: `apps/web/src/server/mail/login-code-mail.ts`
- Create: `apps/web/src/server/mail/registration-code-mail.ts`, `apps/web/src/server/mail/registration-code-mail.test.ts`
- Modify: `apps/web/src/token-guard.test.ts:13-18`
- Modify: `apps/web/src/server/sign-in/send-code.ts`, `apps/web/src/server/sign-in/request-code.ts`
- Create: `apps/web/src/server/sign-in/prune.ts`
- Create: `apps/web/src/server/dice.ts`, `apps/web/src/server/dice.test.ts`

- [ ] **Step 1: Write the failing tests**

`apps/web/src/server/mail/registration-code-mail.test.ts`:

```ts
import { emailAddress } from '@sportbet/domain';
import { unwrap } from '@sportbet/domain/testing';
import { expect, it } from 'vitest';
import { registrationCodeMail } from './registration-code-mail';

const TO = unwrap(emailAddress('ruta.naujoke@example.lt'));

// sportbet's RegistrationCodeMail and emails/registration-code.blade.php:
// a mail that says which code it is, and that it signs nobody in.
it("carries sportbet's subject, the code, its lifetime and the line for whoever did not register", () => {
  const mail = registrationCodeMail(TO, '01234567');
  expect(mail.to).toBe('ruta.naujoke@example.lt');
  expect(mail.subject).toBe('Registracijos patvirtinimo kodas');
  for (const part of [mail.html, mail.text]) {
    expect(part).toContain('Registracijos patvirtinimo kodas');
    expect(part).toContain('01234567');
    expect(part).toContain(
      'Įveskite šį kodą registracijos lange, kad užbaigtumėte registraciją. Kodas galioja 5 min.',
    );
    expect(part).toContain(
      'Jei neregistravotės, ignoruokite šį laišką - paskyra nebus sukurta. Šiuo kodu prisijungti negalima.',
    );
  }
  expect(mail.html).toContain('<html lang="lt">');
  expect(mail.html).toContain('background:#1a1a2e');
});

it('refuses anything but an eight-digit code: a programmer error', () => {
  expect(() => registrationCodeMail(TO, '1234')).toThrow(
    /not an 8-digit code/,
  );
});
```

`apps/web/src/server/dice.test.ts`:

```ts
import { expect, it } from 'vitest';
import { cryptoDice } from './dice';

// GeneratedScore: random_int(0, die) per roll, random_int(0, 1) per coin.
it('rolls whole numbers from 0 to the die, both ends reached, and flips both ways', () => {
  const rolls = Array.from({ length: 2000 }, () => cryptoDice.roll(17));
  expect(rolls.every((roll) => Number.isInteger(roll) && roll >= 0 && roll <= 17)).toBe(true);
  expect(rolls).toContain(0);
  expect(rolls).toContain(17);
  const coins = new Set(Array.from({ length: 200 }, () => cryptoDice.coin()));
  expect(coins).toEqual(new Set([true, false]));
});
```

- [ ] **Step 2: Run them to see them fail**

Run: `pnpm --filter @sportbet/web exec vitest run --config vitest.component.config.ts src/server/mail src/server/dice.test.ts`
Expected: FAIL - `Failed to resolve import "./registration-code-mail"` and `"./dice"`.

- [ ] **Step 3: Write the code**

`apps/web/src/server/mail/code-mail.ts` (the HTML moves here unchanged from `login-code-mail.ts`, its three lines made parameters):

```ts
import { LOGIN_CODE_DIGITS, type EmailAddress } from '@sportbet/domain';
import type { OutgoingMail } from './mail';

/** A code mail's own three lines: the subject (its heading too), the lead, and the line for whoever did not ask. */
export interface CodeMailText {
  readonly subject: string;
  readonly lead: string;
  readonly ignore: string;
}

const CODE = new RegExp(`^\\d{${String(LOGIN_CODE_DIGITS)}}$`);

/**
 * sportbet's code-mail layout (emails/login-code.blade.php and
 * emails/registration-code.blade.php share it): a heading, the lead, the
 * code, and the line for whoever did not ask. Its colours are the
 * template's own, inline - no inbox reads the app's tokens
 * (token-guard.test.ts allows them in this file only). The text part is
 * this app's, for clients that show no HTML.
 */
export function codeMail(
  to: EmailAddress,
  code: string,
  text: CodeMailText,
): OutgoingMail {
  if (!CODE.test(code)) {
    throw new Error(
      `codeMail: not an ${String(LOGIN_CODE_DIGITS)}-digit code`,
    );
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
    `<h2 style="margin:0 0 8px;font-size:1.05rem;color:#111">${text.subject}</h2>`,
    `<p style="color:#555;font-size:.9rem;margin:0 0 20px">${text.lead}</p>`,
    '<div style="background:#f8f8f8;border-radius:8px;padding:16px 20px;text-align:center;margin-bottom:20px">',
    `<span style="font-weight:700;font-size:1.8rem;letter-spacing:.4rem">${code}</span>`,
    '</div>',
    `<p style="color:#888;font-size:.8rem;margin:0">${text.ignore}</p>`,
    '</div>',
    '</div>',
    '</body>',
    '</html>',
  ].join('\n');
  return {
    to,
    subject: text.subject,
    html,
    text: [text.subject, '', text.lead, '', code, '', text.ignore].join('\n'),
  };
}
```

Replace `apps/web/src/server/mail/login-code-mail.ts` with:

```ts
import { LOGIN_CODE_TTL_MINUTES, type EmailAddress } from '@sportbet/domain';
import { codeMail } from './code-mail';
import type { OutgoingMail } from './mail';

/**
 * sportbet's LoginCodeMail: the lead states the code's life from the
 * constant its expiry is set from (#76).
 */
export function loginCodeMail(to: EmailAddress, code: string): OutgoingMail {
  return codeMail(to, code, {
    subject: 'Jūsų prisijungimo kodas',
    lead: `Įveskite šį kodą, kad prisijungtumėte. Kodas galioja ${String(LOGIN_CODE_TTL_MINUTES)} min.`,
    ignore: 'Jei neprašėte šio kodo, galite ignoruoti šį laišką.',
  });
}
```

`apps/web/src/server/mail/registration-code-mail.ts`:

```ts
import { LOGIN_CODE_TTL_MINUTES, type EmailAddress } from '@sportbet/domain';
import { codeMail } from './code-mail';
import type { OutgoingMail } from './mail';

/**
 * sportbet's RegistrationCodeMail (#102): its own mail rather than the
 * sign-in one, because the codes are not interchangeable and this is the
 * one code that goes to an address with no account behind it - so the
 * mail says which code it is, and that it signs nobody in.
 */
export function registrationCodeMail(
  to: EmailAddress,
  code: string,
): OutgoingMail {
  return codeMail(to, code, {
    subject: 'Registracijos patvirtinimo kodas',
    lead: `Įveskite šį kodą registracijos lange, kad užbaigtumėte registraciją. Kodas galioja ${String(LOGIN_CODE_TTL_MINUTES)} min.`,
    ignore:
      'Jei neregistravotės, ignoruokite šį laišką - paskyra nebus sukurta. Šiuo kodu prisijungti negalima.',
  });
}
```

In `apps/web/src/token-guard.test.ts`, replace lines 13-18 (the `INBOX_FILE` comment and constant) with:

```ts
/**
 * The one file that writes colours itself: the code mails' layout. An
 * inbox reads no stylesheet and no token, so it inlines the colours of
 * sportbet's own mail templates (emails/login-code.blade.php,
 * emails/registration-code.blade.php), and only those.
 */
const INBOX_FILE = join(SRC, 'server', 'mail', 'code-mail.ts');
```

Replace `apps/web/src/server/sign-in/send-code.ts` with:

```ts
import { issueLoginCode } from '@sportbet/db';
import type { EmailAddress, Instant, LoginCodePurpose } from '@sportbet/domain';
import { env } from '../../env';
// Not '../db': lint reads that as packages/db (eslint.config.js).
import { getDb } from '../../server/db';
import { errorKind } from '../error-kind';
import { createMailer } from '../mail/create-mailer';
import { loginCodeMail } from '../mail/login-code-mail';
import { MailDeliveryError, type OutgoingMail } from '../mail/mail';
import { registrationCodeMail } from '../mail/registration-code-mail';
import { generateLoginCode, hashLoginCode } from './code-hash';

/** The purposes a visitor asks a code for in the dialog. */
type DialogCodePurpose = Extract<LoginCodePurpose, 'login' | 'registration'>;

/** Each purpose's own mail (sportbet's LoginCodeMail and RegistrationCodeMail). */
const MAIL_FOR: Readonly<
  Record<DialogCodePurpose, (to: EmailAddress, code: string) => OutgoingMail>
> = { login: loginCodeMail, registration: registrationCodeMail };

/** What a failure is, for the log: the mail service's status (its message names no address), or errorKind. */
const kindOf = (error: unknown) =>
  error instanceof MailDeliveryError ? error.message : errorKind(error);

/**
 * Mints a code for the address and purpose, stores its hash (voiding the
 * live one of that purpose) and mails it. Run after the response, never
 * queued (sportbet's dispatch()->afterResponse(), #36 item 1). A failure
 * is logged by its kind only - never the address, never the code (#36
 * item 3) - and the visitor's answer, already sent, cannot change.
 */
export async function sendCode(
  email: EmailAddress,
  now: Instant,
  purpose: DialogCodePurpose,
): Promise<void> {
  try {
    const code = generateLoginCode();
    await issueLoginCode(getDb(), {
      email,
      purpose,
      codeHash: await hashLoginCode(code),
      now,
    });
    await createMailer(env()).send(MAIL_FOR[purpose](email, code));
  } catch (error) {
    console.error(
      `sign-in: a ${purpose} code could not be sent (${kindOf(error)})`,
    );
  }
}
```

`apps/web/src/server/sign-in/prune.ts`:

```ts
import { pruneSignInState, type Executor } from '@sportbet/db';
import type { Instant } from '@sportbet/domain';
import { after } from 'next/server';
import { errorKind } from '../error-kind';

/**
 * After the response, never in it: what sign-in and registration no longer
 * need is deleted (pruneSignInState). A failure is logged by its kind.
 */
export function pruneLater(db: Executor, at: Instant): void {
  after(async () => {
    try {
      await pruneSignInState(db, at);
    } catch (error) {
      console.error(`sign-in: pruning failed (${errorKind(error)})`);
    }
  });
}
```

In `apps/web/src/server/sign-in/request-code.ts`: replace the import of `pruneSignInState` (keep `findAccountByEmail`), of `errorKind` and of `sendLoginCode` with

```ts
import { pruneLater } from './prune';
import { sendCode } from './send-code';
```

and replace

```ts
  if (account !== undefined) {
    const address = account.email;
    after(() => sendLoginCode(address, at));
  }
  after(async () => {
    try {
      await pruneSignInState(db, at);
    } catch (error) {
      console.error(`sign-in: pruning failed (${errorKind(error)})`);
    }
  });
```

with

```ts
  if (account !== undefined) {
    const address = account.email;
    after(() => sendCode(address, at, 'login'));
  }
  pruneLater(db, at);
```

`apps/web/src/server/dice.ts`:

```ts
import { randomInt } from 'node:crypto';
import type { FillInDice } from '@sportbet/domain';

/**
 * The fill-in generator's randomness (FI-2), as sportbet's GeneratedScore
 * draws it: random_int(0, die) for a roll, random_int(0, 1) for the coin
 * that moves a level away side. node:crypto's randomInt is uniform and its
 * upper bound exclusive.
 */
export const cryptoDice: FillInDice = {
  roll: (die) => randomInt(0, die + 1),
  coin: () => randomInt(0, 2) === 1,
};
```

- [ ] **Step 4: Run them to see them pass**

Run: `pnpm format && pnpm --filter @sportbet/web exec vitest run --config vitest.component.config.ts src/server/mail src/server/dice.test.ts src/token-guard.test.ts`
Expected: PASS, 4b's `login-code-mail.test.ts` included (its error still matches `/not an 8-digit code/`).

Run: `pnpm typecheck && pnpm lint`
Expected: clean.

- [ ] **Step 5: Hand to the lead**

Files: the mail files (+ test), `token-guard.test.ts`, `send-code.ts`, `request-code.ts`, `prune.ts`, `dice.ts` (+ test). Commit message: `feat(web): sportbet's registration code mail on the one code-mail layout, a code sent for either purpose, fill-in dice from node:crypto (#18)`.

---

### Task 8 (web-dev): Step one, step two and backing out - `registerAction` **(sensitive)**

sportbet's `RegisteredUserController`. `store`: (the `register` throttle) closed - home; honeypot `website` filled - home, silently; the rules; the address normalized; the answers and `sent_at` into the session; a code mailed after the response; a resend is the same address posted again (`code_resent`). `confirm`: (the `register-confirm` throttle) `code` required; no pending registration - "Pirmiausia užpildykite registracijos formą."; closed - the pending registration forgotten, home; the live `registration` code checked against the dummy hash when there is none, then claimed - one answer for every failure; the account in one transaction - taken: forgotten, "Šis el. paštas arba vartotojo vardas jau užimtas. Pradėkite iš naujo."; any other failure: kept, "Registracijos užbaigti nepavyko. Bandykite dar kartą."; done: forgotten, signed in (remembered: R-44's session), audited `register`, home. `cancel`: forgotten. Every route is `guest`. The throttled answer is bootstrap/app.php's "Per daug bandymų. Pabandykite dar kartą po :minutes min." on the address (step one) or the code (step two).

**Files:**
- Create: `apps/web/src/components/shell/register-state.ts`
- Create: `apps/web/src/server/register/texts.ts`, `apps/web/src/server/register/texts.test.ts`
- Create: `apps/web/src/server/register/registration-window.ts`
- Create: `apps/web/src/server/register/request-registration.ts`
- Create: `apps/web/src/server/register/confirm-registration.ts`
- Create: `apps/web/src/server/register/register-action.ts`

The action's behaviour is proved end to end by Tasks 11 and 12's feature tests (it needs the built server, the database and the mail stand-in); this task tests what is pure - the texts - and typechecks the rest.

- [ ] **Step 1: Write the failing test**

`apps/web/src/server/register/texts.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import { problemTexts } from './texts';

// The owner's six texts for what sportbet answers in Laravel's English
// (spec, "Owner answers"), and 4b's for the address.
describe('the registration form refusals', () => {
  it('names each refused field in Lithuanian', () => {
    expect(
      problemTexts({
        username: 'required',
        name: 'required',
        email: 'required',
      }),
    ).toEqual({
      username: 'Įveskite vartotojo vardą.',
      name: 'Įveskite vardą.',
      email: 'Įveskite el. pašto adresą.',
    });
    expect(problemTexts({ email: 'not-an-email' })).toEqual({
      email: 'Įveskite teisingą el. pašto adresą.',
    });
  });

  it('says the same for every answer over 255 characters', () => {
    expect(
      problemTexts({
        username: 'too-long',
        name: 'too-long',
        surname: 'too-long',
        email: 'too-long',
      }),
    ).toEqual({
      username: 'Per ilgas: daugiausia 255 simboliai.',
      name: 'Per ilgas: daugiausia 255 simboliai.',
      surname: 'Per ilgas: daugiausia 255 simboliai.',
      email: 'Per ilgas: daugiausia 255 simboliai.',
    });
  });

  it('says nothing when nothing is refused', () => {
    expect(problemTexts({})).toEqual({});
  });
});
```

- [ ] **Step 2: Run it to see it fail**

Run: `pnpm --filter @sportbet/web exec vitest run --config vitest.component.config.ts src/server/register/texts.test.ts`
Expected: FAIL - `Failed to resolve import "./texts"`.

- [ ] **Step 3: Write the code**

`apps/web/src/components/shell/register-state.ts`:

```ts
// The registration side of the sign-in dialog's shapes, shared by the
// server that answers it (server/register) and the client that draws it.
// No imports: a client component reads this file.

/** modals/register's fields, in the form's order. */
export type RegisterField = 'username' | 'name' | 'surname' | 'email';

/** What the form held when it was refused (sportbet's old()). */
export type RegisterValues = Readonly<Record<RegisterField, string>>;

/** Each refused field's text (sportbet's @error under its input). */
export type RegisterErrors = Readonly<Partial<Record<RegisterField, string>>>;

export const EMPTY_REGISTER_VALUES: RegisterValues = {
  username: '',
  name: '',
  surname: '',
  email: '',
};

/** The answer to the last thing asked of registration in the dialog. */
export type RegisterState =
  | { readonly kind: 'idle' }
  /** Step one passed: a code is on its way; `resent` for the same address again (issue 114). */
  | { readonly kind: 'sent'; readonly resent: boolean }
  /** The form refused: each field's text, and the answers to draw it with again. */
  | {
      readonly kind: 'refused';
      readonly errors: RegisterErrors;
      readonly values: RegisterValues;
    }
  /** Step two refused, or no registration to confirm: one text, in the code step or above the form. */
  | { readonly kind: 'code-refused'; readonly message: string };

export const REGISTER_IDLE: RegisterState = { kind: 'idle' };

/** The dialog's registration Server Action (server/register/register-action.ts), passed in. */
export type RegisterAction = (
  state: RegisterState,
  form: FormData,
) => Promise<RegisterState>;
```

`apps/web/src/server/register/texts.ts`:

```ts
import {
  REGISTRATION_FIELDS,
  type AnswerProblem,
  type RegistrationField,
  type RegistrationProblems,
} from '@sportbet/domain';
import type { RegisterErrors } from '../../components/shell/register-state';
import { SIGN_IN_TEXT } from '../sign-in/texts';

/**
 * Registration's answers: sportbet's own (lang/lt.json), and, where sportbet
 * answers in Laravel's English validation messages, the owner's
 * (spec 4c, "Owner answers", 2026-10-05).
 */
export const REGISTER_TEXT = {
  /** The owner's; sportbet: "The username field is required." */
  usernameRequired: 'Įveskite vartotojo vardą.',
  /** The owner's; sportbet: "The name field is required." */
  nameRequired: 'Įveskite vardą.',
  /** The owner's; sportbet: "The ... field must not be greater than 255 characters." */
  tooLong: 'Per ilgas: daugiausia 255 simboliai.',
  /** The owner's; sportbet: "The email has already been taken." */
  emailRegistered: 'Šis el. pašto adresas jau užregistruotas.',
  noPending: 'Pirmiausia užpildykite registracijos formą.',
  taken: 'Šis el. paštas arba vartotojo vardas jau užimtas. Pradėkite iš naujo.',
  failed: 'Registracijos užbaigti nepavyko. Bandykite dar kartą.',
} as const;

function textFor(field: RegistrationField, problem: AnswerProblem): string {
  switch (problem) {
    case 'too-long':
      return REGISTER_TEXT.tooLong;
    case 'not-an-email':
      return SIGN_IN_TEXT.emailInvalid;
    case 'required':
      switch (field) {
        case 'username':
          return REGISTER_TEXT.usernameRequired;
        case 'name':
          return REGISTER_TEXT.nameRequired;
        case 'email':
          return SIGN_IN_TEXT.emailRequired;
        case 'surname':
          throw new Error('registration: a surname is never required');
      }
  }
}

/** Each refused field's text, as sportbet's @error draws it under the field. */
export function problemTexts(problems: RegistrationProblems): RegisterErrors {
  const errors: Partial<Record<RegistrationField, string>> = {};
  for (const field of REGISTRATION_FIELDS) {
    const problem = problems[field];
    if (problem !== undefined) errors[field] = textFor(field, problem);
  }
  return errors;
}
```

`apps/web/src/server/register/registration-window.ts`:

```ts
import { loadJoinCandidates } from '@sportbet/db';
import { registrationIsOpen, ruledRules, type Instant } from '@sportbet/domain';
import { cache } from 'react';
import { now } from '../clock';
// Not '../db': lint reads that as packages/db (eslint.config.js).
import { getDb } from '../../server/db';

/**
 * ChecksRegistrationDeadline::registrationIsOpen() with no tournament: is
 * any tournament taking players (registrationIsOpen), under the live rule
 * set - R-8 closes a Euroleague season at its standings deadline.
 */
export async function registrationOpenAt(at: Instant): Promise<boolean> {
  return registrationIsOpen(
    await loadJoinCandidates(getDb()),
    at,
    ruledRules,
  );
}

/** The same, once per request, for the layout's dialog (AuthDialogComposer's registrationOpen). */
export const registrationOpenNow = cache(
  (): Promise<boolean> => registrationOpenAt(now()),
);
```

`apps/web/src/server/register/request-registration.ts`:

```ts
import { isEmailRegistered } from '@sportbet/db';
import {
  registerRequestLimits,
  registrationAnswers,
  registrationProblems,
  type RegistrationAnswers,
  type TypedRegistration,
} from '@sportbet/domain';
import { cookies } from 'next/headers';
import { redirect } from 'next/navigation';
import { after } from 'next/server';
import type {
  RegisterErrors,
  RegisterState,
} from '../../components/shell/register-state';
import { env } from '../../env';
import { now } from '../clock';
import { clearCookie, OPEN_SIGN_IN_COOKIE } from '../cookies';
// Not '../db': lint reads that as packages/db (eslint.config.js).
import { getDb } from '../../server/db';
import { formText } from '../request/form-input';
import { pruneLater } from '../sign-in/prune';
import { sendCode } from '../sign-in/send-code';
import { throttledText } from '../sign-in/texts';
import { throttle } from '../sign-in/throttle';
import { readIntended } from './intended';
import {
  fitsInCookie,
  readPendingRegistration,
  writePendingRegistration,
  type PendingRegistration,
} from './pending-registration';
import { registrationOpenAt } from './registration-window';
import { problemTexts, REGISTER_TEXT } from './texts';

/** The form's fields as sportbet's controller read them: trimmed (TrimStrings). */
const typedRegistration = (form: FormData): TypedRegistration => ({
  username: formText(form, 'username'),
  name: formText(form, 'name'),
  surname: formText(form, 'surname'),
  email: formText(form, 'email'),
});

const refusedForm = (
  errors: RegisterErrors,
  values: TypedRegistration,
): RegisterState => ({ kind: 'refused', errors, values });

const NAME_FIELDS = ['username', 'name', 'surname'] as const;

/** The name field holding the most bytes: the one a cookie that cannot fit is refused on (plan decision 13). */
function longestName(
  answers: RegistrationAnswers,
): (typeof NAME_FIELDS)[number] {
  const bytes = (value: string) => Buffer.byteLength(value);
  return NAME_FIELDS.reduce((longest, field) =>
    bytes(answers[field]) > bytes(answers[longest]) ? field : longest,
  );
}

/**
 * RegisteredUserController::store: throttled first (the route's
 * middleware); closed, or the honeypot filled - home, silently; the
 * answers checked, the address normalized (the owner, 2026-10-05) and
 * refused if registered (unique:users); then the answers, the slug /login
 * or /register was given and the moment wait in the signed cookie, and a
 * `registration` code is minted and mailed after the response. Nothing of
 * an account is written. The same address again is a resend (issue 114).
 */
export async function requestRegistration(
  form: FormData,
  ip: string,
): Promise<RegisterState> {
  const db = getDb();
  const at = now();
  const typed = typedRegistration(form);
  const verdict = await throttle(db, registerRequestLimits(typed.email, ip), at);
  if (!verdict.allowed) {
    return refusedForm({ email: throttledText(verdict.minutes) }, typed);
  }
  if (!(await registrationOpenAt(at))) redirect('/');
  // Honeypot: real visitors never see or fill it; bots do.
  if (formText(form, 'website') !== '') redirect('/');
  const answers = registrationAnswers(typed);
  if (!answers.ok) {
    return refusedForm(problemTexts(registrationProblems(typed)), typed);
  }
  if (await isEmailRegistered(db, answers.value.email)) {
    return refusedForm({ email: REGISTER_TEXT.emailRegistered }, typed);
  }
  const jar = await cookies();
  const secret = env().AUTH_SECRET;
  const pending: PendingRegistration = {
    ...answers.value,
    tournament: readIntended(jar),
    sentAt: at,
  };
  if (!fitsInCookie(pending, secret)) {
    const errors: Partial<Record<'username' | 'name' | 'surname', string>> =
      {};
    errors[longestName(answers.value)] = REGISTER_TEXT.tooLong;
    return refusedForm(errors, typed);
  }
  const previous = readPendingRegistration(jar, secret);
  const address = answers.value.email;
  after(() => sendCode(address, at, 'registration'));
  pruneLater(db, at);
  writePendingRegistration(jar, pending, secret);
  clearCookie(jar, OPEN_SIGN_IN_COOKIE);
  return { kind: 'sent', resent: previous?.email === address };
}
```

`apps/web/src/server/register/confirm-registration.ts`:

```ts
import {
  claimLoginCode,
  createAccount,
  findLiveLoginCode,
  recordLogin,
} from '@sportbet/db';
import { registerConfirmLimits, ruledRules } from '@sportbet/domain';
import { cookies } from 'next/headers';
import { redirect } from 'next/navigation';
import {
  EMPTY_REGISTER_VALUES,
  type RegisterState,
} from '../../components/shell/register-state';
import { PLAYER_HOME } from '../../components/shell/shell-paths';
import { env } from '../../env';
import { now } from '../clock';
// Not '../db': lint reads that as packages/db (eslint.config.js).
import { getDb } from '../../server/db';
import { cryptoDice } from '../dice';
import { errorKind } from '../error-kind';
import { formText } from '../request/form-input';
import { startSession } from '../session/session';
import { DUMMY_CODE_HASH, loginCodeMatches } from '../sign-in/code-hash';
import { SIGN_IN_TEXT, throttledText } from '../sign-in/texts';
import { throttle } from '../sign-in/throttle';
import { forgetIntended } from './intended';
import {
  clearPendingRegistration,
  readPendingRegistration,
} from './pending-registration';
import { registrationOpenAt } from './registration-window';
import { REGISTER_TEXT } from './texts';

const codeRefused = (message: string): RegisterState => ({
  kind: 'code-refused',
  message,
});

/**
 * RegisteredUserController::confirm: throttled by the pending address
 * first; the code required; a registration to confirm; registration still
 * open (checked again: the account comes into being now - if not, the
 * pending registration is forgotten and the visitor goes home); one full
 * hash comparison, against the dummy when no `registration` code is live,
 * then the atomic claim - one answer for every failure. Then the account,
 * its settings and its tournament in one transaction (createAccount, under
 * the live rule set): taken - forgotten, start again; any other failure -
 * kept, so a new code finishes it (#270), logged by its kind only; done -
 * forgotten, signed in on a new session, audited as `register` (without
 * the IP, R-45), home.
 */
export async function confirmRegistration(
  form: FormData,
  ip: string,
): Promise<RegisterState> {
  const db = getDb();
  const at = now();
  const jar = await cookies();
  const pending = readPendingRegistration(jar, env().AUTH_SECRET);
  const verdict = await throttle(
    db,
    registerConfirmLimits(pending?.email ?? null, ip),
    at,
  );
  if (!verdict.allowed) return codeRefused(throttledText(verdict.minutes));
  const code = formText(form, 'code');
  // 4b's text (#16, Q2); sportbet: "The code field is required."
  if (code === '') return codeRefused(SIGN_IN_TEXT.codeRequired);
  if (pending === null) return codeRefused(REGISTER_TEXT.noPending);
  if (!(await registrationOpenAt(at))) {
    clearPendingRegistration(jar);
    redirect('/');
  }
  const live = await findLiveLoginCode(db, pending.email, 'registration', at);
  const matches = await loginCodeMatches(
    code,
    live?.codeHash ?? DUMMY_CODE_HASH,
  );
  const claimed =
    live !== undefined && matches && (await claimLoginCode(db, live.id, at));
  if (!claimed) return codeRefused(SIGN_IN_TEXT.wrongCode);
  const created = await createAccount(
    db,
    {
      username: pending.username,
      name: pending.name,
      surname: pending.surname,
      email: pending.email,
      intended: pending.tournament,
    },
    { now: at, rules: ruledRules, dice: cryptoDice },
  ).catch((error: unknown) => {
    console.error(
      `registration: the account could not be created (${errorKind(error)})`,
    );
    return null;
  });
  if (created === null) return codeRefused(REGISTER_TEXT.failed);
  if (!created.ok) {
    clearPendingRegistration(jar);
    return {
      kind: 'refused',
      errors: { email: REGISTER_TEXT.taken },
      values: EMPTY_REGISTER_VALUES,
    };
  }
  clearPendingRegistration(jar);
  forgetIntended(jar);
  await startSession(db, jar, created.value.player, at);
  await recordLogin(db, { player: created.value.player, method: 'register', at });
  redirect(PLAYER_HOME);
}
```

`apps/web/src/server/register/register-action.ts`:

```ts
'use server';

import { cookies, headers } from 'next/headers';
import { redirect, unstable_rethrow } from 'next/navigation';
import {
  REGISTER_IDLE,
  type RegisterState,
} from '../../components/shell/register-state';
import { errorKind } from '../error-kind';
import { clientIp } from '../request/client-ip';
import { formText } from '../request/form-input';
import { isSameOrigin } from '../request/same-origin';
import { signedInPlayer } from '../request-context';
import { confirmRegistration } from './confirm-registration';
import { clearPendingRegistration } from './pending-registration';
import { requestRegistration } from './request-registration';

/**
 * The dialog's registration Server Action (spec 4c): step one (and its
 * resend), step two, or back out, by the form's `intent`. A request from
 * another origin is refused before anything happens (#16), and a
 * signed-in visitor goes to '/', as sportbet's `guest` middleware sent
 * them. Anything else that fails is logged by its kind and rethrown bare:
 * a database error's message quotes its parameters, the answers among
 * them.
 */
export async function registerAction(
  _state: RegisterState,
  form: FormData,
): Promise<RegisterState> {
  const requestHeaders = await headers();
  if (!isSameOrigin(requestHeaders)) {
    throw new Error('registration: refused a request from another origin');
  }
  try {
    return await answer(form, clientIp(requestHeaders));
  } catch (error) {
    // redirect() throws too: Next's own errors go on as they are.
    unstable_rethrow(error);
    console.error(`registration: the action failed (${errorKind(error)})`);
    // eslint-disable-next-line preserve-caught-error -- its message, or its cause's, can quote the answers (review W2)
    throw new Error('registration: the action failed');
  }
}

async function answer(form: FormData, ip: string): Promise<RegisterState> {
  if ((await signedInPlayer()) !== null) redirect('/');
  const intent = formText(form, 'intent');
  if (intent === 'request') return requestRegistration(form, ip);
  if (intent === 'confirm') return confirmRegistration(form, ip);
  if (intent === 'cancel') {
    // RegisteredUserController::cancel: forget the pending registration.
    clearPendingRegistration(await cookies());
  }
  return REGISTER_IDLE;
}
```

- [ ] **Step 4: Run it to see it pass, and typecheck the rest**

Run: `pnpm format && pnpm --filter @sportbet/web exec vitest run --config vitest.component.config.ts src/server/register`
Expected: PASS.

Run: `pnpm typecheck && pnpm lint`
Expected: clean. (Nothing calls `registerAction` yet; Task 9 wires it into the dialog's state.)

- [ ] **Step 5: Hand to the lead**

Files: `register-state.ts`, the six `server/register` files. Commit message: `feat(web): two-step registration - the answers and a code, then the account in one transaction, signed in and recorded (#18)`.

---

### Task 9 (web-dev): `/register`, `/login`'s slug, and what the dialog is told **(sensitive)**

Waits on Q3. sportbet's `RegisteredUserController::create` (`throttle:register-page`, `guest`): closed - home; else a filled `?tournament=` into `intended_tournament`, and the hub with `auth_dialog=register`. `AuthenticatedSessionController::create` keeps `?tournament=` the same way and opens on `login`. `AuthDialogComposer`: `registrationOpen`, and the code step of the flow asked for last (a tie to registration), an expired one dropped.

**Files:**
- Modify: `apps/web/src/components/shell/sign-in-state.ts`
- Create: `apps/web/src/server/sign-in/dialog-step.ts`, `apps/web/src/server/sign-in/dialog-step.test.ts`
- Modify: `apps/web/src/server/sign-in/dialog.ts`
- Modify: `apps/web/src/proxy.ts`
- Modify: `apps/web/src/app/login/route.ts`
- Create: `apps/web/src/app/register/route.ts`
- Modify: `apps/web/src/components/shell/shell.test.tsx:34-39`, `apps/web/src/components/shell/sign-in-dialog.test.tsx:17-23` (the fixtures)

- [ ] **Step 1: Write the failing test**

`apps/web/src/server/sign-in/dialog-step.test.ts`:

```ts
import { emailAddress } from '@sportbet/domain';
import { at, unwrap } from '@sportbet/domain/testing';
import { describe, expect, it } from 'vitest';
import { dialogStep } from './dialog-step';

const EMAIL = unwrap(emailAddress('ruta.naujoke@example.lt'));
const NOW = at('2026-10-05T12:01:00Z');
const login = (sentAt: string) => ({ email: EMAIL, sentAt: at(sentAt) });
const registration = (sentAt: string) => ({
  username: 'naujoke',
  name: 'Rūta',
  surname: 'Naujokė',
  email: EMAIL,
  tournament: null,
  sentAt: at(sentAt),
});

// AuthDialogComposer and AuthCodeStep (issue 108).
describe('the step the dialog draws', () => {
  it('the forms when nothing is pending', () => {
    expect(dialogStep(null, null, NOW)).toEqual({ kind: 'email' });
  });

  it("a pending registration: its code step, with the answers its resend posts again (issue 114)", () => {
    expect(dialogStep(null, registration('2026-10-05T12:00:00Z'), NOW)).toEqual(
      {
        kind: 'register-code',
        email: 'ruta.naujoke@example.lt',
        username: 'naujoke',
        name: 'Rūta',
        surname: 'Naujokė',
        sentAt: '2026-10-05T12:00:00Z',
        resendIn: 0,
        expiresIn: 240,
      },
    );
  });

  it('both pending: the one asked for last, a tie to the registration', () => {
    expect(
      dialogStep(
        login('2026-10-05T12:00:30Z'),
        registration('2026-10-05T12:00:00Z'),
        NOW,
      ).kind,
    ).toBe('code');
    expect(
      dialogStep(
        login('2026-10-05T12:00:00Z'),
        registration('2026-10-05T12:00:30Z'),
        NOW,
      ).kind,
    ).toBe('register-code');
    expect(
      dialogStep(
        login('2026-10-05T12:00:00Z'),
        registration('2026-10-05T12:00:00Z'),
        NOW,
      ).kind,
    ).toBe('register-code');
  });

  it('drops a step whose code has died: a dead countdown never opens over a page', () => {
    expect(
      dialogStep(
        login('2026-10-05T11:50:00Z'),
        registration('2026-10-05T11:55:00Z'),
        NOW,
      ),
    ).toEqual({ kind: 'email' });
    expect(
      dialogStep(
        login('2026-10-05T12:00:00Z'),
        registration('2026-10-05T11:50:00Z'),
        NOW,
      ).kind,
    ).toBe('code');
  });
});
```

- [ ] **Step 2: Run it to see it fail**

Run: `pnpm --filter @sportbet/web exec vitest run --config vitest.component.config.ts src/server/sign-in/dialog-step.test.ts`
Expected: FAIL - `Failed to resolve import "./dialog-step"`.

- [ ] **Step 3: Write the code**

In `apps/web/src/components/shell/sign-in-state.ts`: replace the first comment block with

```ts
// The sign-in dialog's names and shapes, shared by the server that fills
// it (server/sign-in, server/register) and the client that draws it. Type
// imports only: a client component reads this file.

import type { RegisterAction } from './register-state';
```

replace `SignInStep` with

```ts
/** Which step the dialog draws: the forms, or a code still alive (AuthCodeStep::login, ::registration). */
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
    }
  | {
      readonly kind: 'register-code';
      /** The answers waiting for the code: the resend posts them again (issue 114). */
      readonly email: string;
      readonly username: string;
      readonly name: string;
      readonly surname: string;
      readonly sentAt: string;
      readonly resendIn: number;
      readonly expiresIn: number;
    };
```

and replace `ShellSignIn` with

```ts
/** What a guest's shell is told about signing in and registering. */
export interface ShellSignIn {
  readonly step: SignInStep;
  /** Open on arrival: from /login or /register, or with a code to type. */
  readonly open: boolean;
  /** The tab it opens on: /register's, else the sign-in's. */
  readonly tab: DialogTab;
  /** Some tournament takes players (anyTournamentIsJoinable): else there is no Registruotis tab. */
  readonly registrationOpen: boolean;
  /** The code's life, as the server's constant says it (sportbet #76). */
  readonly codeMinutes: number;
  readonly action: SignInAction;
  readonly registerAction: RegisterAction;
}
```

`apps/web/src/server/sign-in/dialog-step.ts`:

```ts
import { codeStepCounters, type Instant } from '@sportbet/domain';
import type { SignInStep } from '../../components/shell/sign-in-state';
import { isoSecond } from '../clock';
import type { PendingRegistration } from '../register/pending-registration';
import type { PendingSignIn } from './pending';

const alive = (sentAt: Instant, now: Instant) =>
  codeStepCounters(sentAt, now).expiresIn > 0;

/**
 * AuthDialogComposer: the code step of a pending sign-in or registration
 * while its code lives - an expired one is dropped, so a dead countdown
 * never opens over a page - and with both alive, the one asked for last,
 * a tie to the registration (`$registration['sentAt'] >= $login['sentAt']`);
 * else the forms.
 */
export function dialogStep(
  login: PendingSignIn | null,
  registration: PendingRegistration | null,
  now: Instant,
): SignInStep {
  const signIn = login !== null && alive(login.sentAt, now) ? login : null;
  const register =
    registration !== null && alive(registration.sentAt, now)
      ? registration
      : null;
  if (register !== null && (signIn === null || register.sentAt >= signIn.sentAt)) {
    return {
      kind: 'register-code',
      email: register.email,
      username: register.username,
      name: register.name,
      surname: register.surname,
      sentAt: isoSecond(register.sentAt),
      ...codeStepCounters(register.sentAt, now),
    };
  }
  if (signIn !== null) {
    return {
      kind: 'code',
      email: signIn.email,
      sentAt: isoSecond(signIn.sentAt),
      ...codeStepCounters(signIn.sentAt, now),
    };
  }
  return { kind: 'email' };
}
```

Replace `apps/web/src/server/sign-in/dialog.ts` with:

```ts
import { LOGIN_CODE_TTL_MINUTES } from '@sportbet/domain';
import { cookies, headers } from 'next/headers';
import type { ShellSignIn } from '../../components/shell/sign-in-state';
import { env } from '../../env';
import { now } from '../clock';
import { dialogTabOf, OPEN_SIGN_IN_HEADER } from '../cookies';
import { readPendingRegistration } from '../register/pending-registration';
import { registerAction } from '../register/register-action';
import { registrationOpenNow } from '../register/registration-window';
import { dialogStep } from './dialog-step';
import { readPending } from './pending';
import { signInAction } from './sign-in-action';

/**
 * What a guest's dialog draws (AuthDialogComposer): the code step asked for
 * last while its code lives (dialogStep), else the forms - the
 * Registruotis tab only while registration is open; open on arrival from
 * /login or /register (proxy.ts's OPEN_SIGN_IN_HEADER, naming the tab) or
 * with a code to type.
 */
export async function signInDialogState(): Promise<ShellSignIn> {
  const jar = await cookies();
  const secret = env().AUTH_SECRET;
  const opened = (await headers()).get(OPEN_SIGN_IN_HEADER);
  const step = dialogStep(
    readPending(jar, secret),
    readPendingRegistration(jar, secret),
    now(),
  );
  return {
    step,
    open: step.kind !== 'email' || opened !== null,
    tab: dialogTabOf(opened),
    registrationOpen: await registrationOpenNow(),
    codeMinutes: LOGIN_CODE_TTL_MINUTES,
    action: signInAction,
    registerAction,
  };
}
```

In `apps/web/src/proxy.ts`, add `dialogTabOf` to the import from `./server/cookies`, and replace the body of `proxy` with:

```ts
  const opening = readCookie(request.cookies, OPEN_SIGN_IN_COOKIE);
  const headers = new Headers(request.headers);
  headers.delete(OPEN_SIGN_IN_HEADER);
  if (opening !== undefined) {
    headers.set(OPEN_SIGN_IN_HEADER, dialogTabOf(opening));
  }
  const response = NextResponse.next({ request: { headers } });
  await extendSession(getDb(), request.cookies, response.cookies, now());
  if (opening !== undefined) clearCookie(response.cookies, OPEN_SIGN_IN_COOKIE);
  return response;
```

and in its comment replace "/login's open-the-dialog cookie" with "/login's and /register's open-the-dialog cookie (its tab)".

Replace `apps/web/src/app/login/route.ts` with:

```ts
import { cookies } from 'next/headers';
import { OPEN_SIGN_IN_COOKIE, setCookie } from '../../server/cookies';
import { rememberIntended } from '../../server/register/intended';
import { signedInPlayer } from '../../server/request-context';

/**
 * sportbet's AuthenticatedSessionController::create (issue 111): renders
 * nothing; a guest goes to '/' with the dialog to open there on its
 * sign-in tab, a `?tournament=` slug remembered for registration
 * (intended_tournament) - it steers nothing of a sign-in (review W5); a
 * signed-in visitor just goes to '/'.
 */
export async function GET(request: Request): Promise<Response> {
  if ((await signedInPlayer()) === null) {
    const jar = await cookies();
    rememberIntended(jar, new URL(request.url).searchParams.get('tournament'));
    setCookie(jar, OPEN_SIGN_IN_COOKIE, 'login');
  }
  return new Response(null, { status: 302, headers: { Location: '/' } });
}
```

`apps/web/src/app/register/route.ts`:

```ts
import { registerPageLimits } from '@sportbet/domain';
import { cookies } from 'next/headers';
import { now } from '../../server/clock';
import { OPEN_SIGN_IN_COOKIE, setCookie } from '../../server/cookies';
import { getDb } from '../../server/db';
import { rememberIntended } from '../../server/register/intended';
import { registrationOpenAt } from '../../server/register/registration-window';
import { clientIp } from '../../server/request/client-ip';
import { signedInPlayer } from '../../server/request-context';
import { throttledText } from '../../server/sign-in/texts';
import { throttle } from '../../server/sign-in/throttle';

const home = () =>
  new Response(null, { status: 302, headers: { Location: '/' } });

/**
 * sportbet's RegisteredUserController::create (issue 111): renders nothing.
 * Throttled per IP (register-page; Q3: a 429 with the dialog's text); a
 * signed-in visitor, or anyone while registration is closed, just goes to
 * '/'; a guest goes to '/' with the dialog to open on its Registruotis tab,
 * a `?tournament=` slug remembered for the registration
 * (intended_tournament).
 */
export async function GET(request: Request): Promise<Response> {
  const at = now();
  const verdict = await throttle(
    getDb(),
    registerPageLimits(clientIp(request.headers)),
    at,
  );
  if (!verdict.allowed) {
    return new Response(throttledText(verdict.minutes), {
      status: 429,
      headers: {
        'Content-Type': 'text/plain; charset=utf-8',
        'Retry-After': String(verdict.minutes * 60),
      },
    });
  }
  if ((await signedInPlayer()) !== null || !(await registrationOpenAt(at))) {
    return home();
  }
  const jar = await cookies();
  rememberIntended(jar, new URL(request.url).searchParams.get('tournament'));
  setCookie(jar, OPEN_SIGN_IN_COOKIE, 'register');
  return home();
}
```

(If Q3's answer differs, only the `!verdict.allowed` branch changes.)

In `apps/web/src/components/shell/shell.test.tsx`, add `import { REGISTER_IDLE } from './register-state';` and replace the `SIGN_IN` fixture with:

```ts
const SIGN_IN: ShellSignIn = {
  step: { kind: 'email' },
  open: false,
  tab: 'login',
  registrationOpen: false,
  codeMinutes: 5,
  action: () => Promise.resolve(SIGN_IN_IDLE),
  registerAction: () => Promise.resolve(REGISTER_IDLE),
};
```

In `apps/web/src/components/shell/sign-in-dialog.test.tsx`, add `import { REGISTER_IDLE, type RegisterAction } from './register-state';`, and replace the `idle` and `EMAIL_STEP` constants with:

```ts
const idle: SignInAction = () => Promise.resolve(SIGN_IN_IDLE);
const registerIdle: RegisterAction = () => Promise.resolve(REGISTER_IDLE);
/** Registration closed: the dialog as 4b drew it, its sign-in side only. */
const EMAIL_STEP: ShellSignIn = {
  step: { kind: 'email' },
  open: false,
  tab: 'login',
  registrationOpen: false,
  codeMinutes: 5,
  action: idle,
  registerAction: registerIdle,
};
```

- [ ] **Step 4: Run it to see it pass**

Run: `pnpm format && pnpm --filter @sportbet/web exec vitest run --config vitest.component.config.ts src/server src/components/shell`
Expected: PASS - `dialog-step.test.ts`, and 4b's dialog and shell tests unchanged in behaviour.

Run: `pnpm typecheck && pnpm lint && pnpm build 2>&1 | grep -E "register|Done"`
Expected: clean; the build lists the route `/register` (`ƒ /register`).

- [ ] **Step 5: Hand to the lead**

Files: `sign-in-state.ts`, `dialog-step.ts` (+ test), `dialog.ts`, `proxy.ts`, `app/login/route.ts`, `app/register/route.ts`, the two fixtures. Commit message: `feat(web): /register opens the dialog on Registruotis and keeps ?tournament= for registration, as /login now does; the dialog draws the step asked for last (#18)`.

---

### Task 10 (web-dev): The dialog's tabs, the register form and one code step

Waits on Q2. sportbet's `modals/main` (the tab strip `.sb-auth-tabs`, a `.nav` with two `role="tab"` buttons; hidden while a code is in flight and while registration is closed; `#loginPane`, `#registerPane`), `modals/register` (the honeypot "Leave this blank" `website`, then "Slapyvardis" with a person icon, "Vardas" and "Pavardė" side by side, "El. paštas" with an envelope, each error under its field, `old()` kept, "Registruotis"), and `partials/auth/register-code-step` ("Atgal", "Kodą išsiuntėme į <address>", the alert, the code input "8 skaitmenų kodas", the countdown lines, "Užbaigti registraciją", "Negavote? Patikrinkite šlamšto aplanką arba siųskite iš naujo." whose form posts the four answers again). The look is rebuilt on the tokens (decision 13): `.sb-auth-tabs` is `margin-top 16px; gap 4px; padding 4px; radius 12px; background surface-2`, `.sb-auth-tab` `height 36px; radius 9px; .875rem/600; muted`, active `accent-tint, shadow, text, 700`; Bootstrap's `.is-invalid` is the `bad` border, `.invalid-feedback` `.875em` in `bad`.

**Files:**
- Create: `apps/web/src/components/shell/dialog-parts.tsx`
- Create: `apps/web/src/components/shell/code-step.tsx`
- Create: `apps/web/src/components/shell/register-pane.tsx`
- Modify: `apps/web/src/components/shell/sign-in-dialog.tsx` (whole file below)
- Modify: `apps/web/src/components/shell/icon.tsx`, `apps/web/src/components/shell/icon.test.tsx:5-19`
- Modify: `apps/web/src/components/shell/sign-in-dialog.test.tsx` (new tests appended)

- [ ] **Step 1: Write the failing tests**

In `apps/web/src/components/shell/icon.test.tsx`, add `'person',` to `NAMES` between `'list',` and `'person-fill',`.

Append to `apps/web/src/components/shell/sign-in-dialog.test.tsx` (its imports gain `type RegisterState` from `./register-state`):

```ts
const REGISTER_OPEN: ShellSignIn = { ...EMAIL_STEP, registrationOpen: true };
const REGISTER_CODE = {
  kind: 'register-code',
  email: 'ruta.naujoke@example.lt',
  username: 'naujoke',
  name: 'Rūta',
  surname: 'Naujokė',
  sentAt: '2026-10-05T12:00:00Z',
  resendIn: 0,
  expiresIn: 300,
} as const;
const registerAnswering = (state: RegisterState) =>
  vi.fn<RegisterAction>(() => Promise.resolve(state));
const pane = (container: HTMLElement, id: string) =>
  container.querySelector(`#${id}`);

/** Types the three required answers and presses "Registruotis". */
function register(): void {
  fireEvent.change(screen.getByPlaceholderText('Slapyvardis'), {
    target: { value: 'naujoke' },
  });
  fireEvent.change(screen.getByPlaceholderText('Vardas'), {
    target: { value: 'Rūta' },
  });
  const [, address] = screen.getAllByPlaceholderText('El. paštas');
  if (address === undefined) throw new Error('no register address field');
  fireEvent.change(address, { target: { value: 'ruta@example.lt' } });
  fireEvent.click(screen.getByRole('button', { name: 'Registruotis' }));
}

// sportbet's modals/main and modals/register (AuthDialogTest).
describe('the tabs and the register form', () => {
  it('draws "Prisijungti" and "Registruotis" as tabs while registration is open, the sign-in tab chosen', () => {
    const { container } = render(<SignInDialog {...REGISTER_OPEN} open />);
    expect(screen.getByRole('tablist')).toBeDefined();
    expect(
      screen.getAllByRole('tab').map((tab) => [
        tab.textContent,
        tab.getAttribute('aria-selected'),
      ]),
    ).toEqual([
      ['Prisijungti', 'true'],
      ['Registruotis', 'false'],
    ]);
    expect(pane(container, 'loginPane')?.hasAttribute('hidden')).toBe(false);
    expect(pane(container, 'registerPane')?.hasAttribute('hidden')).toBe(true);
    fireEvent.click(screen.getByRole('tab', { name: 'Registruotis' }));
    expect(pane(container, 'loginPane')?.hasAttribute('hidden')).toBe(true);
    expect(pane(container, 'registerPane')?.hasAttribute('hidden')).toBe(false);
  });

  it('draws no tab and no register form while registration is closed', () => {
    const { container } = render(<SignInDialog {...EMAIL_STEP} open />);
    expect(screen.queryAllByRole('tab')).toEqual([]);
    expect(pane(container, 'registerPane')).toBeNull();
  });

  it('opens on the Registruotis tab when /register sent the visitor', () => {
    render(<SignInDialog {...REGISTER_OPEN} open tab="register" />);
    expect(
      screen
        .getByRole('tab', { name: 'Registruotis' })
        .getAttribute('aria-selected'),
    ).toBe('true');
  });

  it("asks sportbet's four questions behind a honeypot, and posts them as step one", async () => {
    const action = registerAnswering({ kind: 'sent', resent: false });
    const { container } = render(
      <SignInDialog {...REGISTER_OPEN} open tab="register" registerAction={action} />,
    );
    const honeypot = container.querySelector('input[name="website"]');
    expect(honeypot?.getAttribute('tabindex')).toBe('-1');
    expect(honeypot?.closest('[aria-hidden="true"]')).not.toBeNull();
    expect(screen.getByPlaceholderText('Pavardė')).toBeDefined();
    register();
    await waitFor(() => {
      expect(action).toHaveBeenCalledTimes(1);
    });
    const form = action.mock.calls[0]?.[1];
    expect(form?.get('intent')).toBe('request');
    expect(form?.get('username')).toBe('naujoke');
    expect(form?.get('name')).toBe('Rūta');
    expect(form?.get('surname')).toBe('');
    expect(form?.get('email')).toBe('ruta@example.lt');
    expect(form?.get('website')).toBe('');
  });

  it('shows each refusal under its field on the Registruotis tab, the answers kept (Q2)', async () => {
    const action = registerAnswering({
      kind: 'refused',
      errors: {
        username: 'Įveskite vartotojo vardą.',
        email: 'Šis el. pašto adresas jau užregistruotas.',
      },
      values: {
        username: '',
        name: 'Rūta',
        surname: 'Naujokė',
        email: 'ruta@example.lt',
      },
    });
    const { container } = render(
      <SignInDialog {...REGISTER_OPEN} open tab="register" registerAction={action} />,
    );
    register();
    expect(await screen.findByText('Įveskite vartotojo vardą.')).toBeDefined();
    expect(
      screen.getByText('Šis el. pašto adresas jau užregistruotas.'),
    ).toBeDefined();
    expect(pane(container, 'registerPane')?.hasAttribute('hidden')).toBe(false);
    expect(screen.getByPlaceholderText('Pavardė')).toHaveProperty(
      'value',
      'Naujokė',
    );
    expect(
      screen.getByPlaceholderText('Slapyvardis').getAttribute('aria-invalid'),
    ).toBe('true');
  });

  it('shows a refusal that belongs to no field above the register form (Q2)', async () => {
    const message = 'Pirmiausia užpildykite registracijos formą.';
    render(
      <SignInDialog
        {...REGISTER_OPEN}
        open
        tab="register"
        registerAction={registerAnswering({ kind: 'code-refused', message })}
      />,
    );
    register();
    expect((await screen.findByRole('alert')).textContent).toBe(message);
  });
});

// sportbet's partials/auth/register-code-step (RegistrationTest).
describe('the register code step', () => {
  it('names the address, asks for the code, and draws no tab', () => {
    render(
      <SignInDialog {...REGISTER_OPEN} step={REGISTER_CODE} />,
    );
    expect(dialog().hidden).toBe(false);
    expect(screen.getByText('ruta.naujoke@example.lt').tagName).toBe('STRONG');
    expect(screen.queryAllByRole('tab')).toEqual([]);
    expect(screen.getByLabelText('8 skaitmenų kodas')).toBeDefined();
    expect(
      screen.getByRole('button', { name: 'Užbaigti registraciją' }),
    ).toBeDefined();
  });

  it('resends by posting the four answers again (issue 114)', () => {
    const { container } = render(
      <SignInDialog {...REGISTER_OPEN} step={REGISTER_CODE} />,
    );
    const resend = container.querySelector('[data-testid="register-resend"]');
    expect(
      ['intent', 'username', 'name', 'surname', 'email'].map((name) =>
        resend
          ?.querySelector(`input[name="${name}"]`)
          ?.getAttribute('value'),
      ),
    ).toEqual(['request', 'naujoke', 'Rūta', 'Naujokė', 'ruta.naujoke@example.lt']);
  });

  it('confirms with the code typed, and shows the answer to a refused one', async () => {
    const action = registerAnswering({
      kind: 'code-refused',
      message: 'Neteisingas arba pasibaigęs kodas.',
    });
    render(
      <SignInDialog {...REGISTER_OPEN} step={REGISTER_CODE} registerAction={action} />,
    );
    fireEvent.change(screen.getByLabelText('8 skaitmenų kodas'), {
      target: { value: '01234567' },
    });
    fireEvent.click(
      screen.getByRole('button', { name: 'Užbaigti registraciją' }),
    );
    expect((await screen.findByRole('alert')).textContent).toBe(
      'Neteisingas arba pasibaigęs kodas.',
    );
    const form = action.mock.calls[0]?.[1];
    expect(form?.get('intent')).toBe('confirm');
    expect(form?.get('code')).toBe('01234567');
  });

  it('backs out with "Atgal"', async () => {
    const action = registerAnswering(REGISTER_IDLE);
    render(
      <SignInDialog {...REGISTER_OPEN} step={REGISTER_CODE} registerAction={action} />,
    );
    fireEvent.click(screen.getByRole('button', { name: 'Atgal' }));
    await waitFor(() => {
      expect(action.mock.calls[0]?.[1].get('intent')).toBe('cancel');
    });
  });
});
```

- [ ] **Step 2: Run them to see them fail**

Run: `pnpm --filter @sportbet/web exec vitest run --config vitest.component.config.ts src/components/shell/sign-in-dialog.test.tsx src/components/shell/icon.test.tsx`
Expected: FAIL - no `tablist`, no "Slapyvardis", no register code step, and `person` is not an icon.

- [ ] **Step 3: Write the code**

In `apps/web/src/components/shell/icon.tsx`, add `| 'person'` to `IconName` before `| 'person-fill'`, and to `ICONS` before `'person-fill'`:

```ts
  person: [
    {
      d: 'M8 8a3 3 0 1 0 0-6 3 3 0 0 0 0 6Zm2-3a2 2 0 1 1-4 0 2 2 0 0 1 4 0Zm4 8c0 1-1 1-1 1H3s-1 0-1-1 1-4 6-4 6 3 6 4Zm-1-.004c-.001-.246-.154-.986-.832-1.664C11.516 10.68 10.289 10 8 10c-2.29 0-3.516.68-4.168 1.332-.678.678-.83 1.418-.832 1.664h10Z',
    },
  ],
```

Check the path against the package's: `curl -s https://cdn.jsdelivr.net/npm/bootstrap-icons@1.11.1/icons/person.svg` - its `d` must be the string above; if it differs, take the package's.

`apps/web/src/components/shell/dialog-parts.tsx` (moved from `sign-in-dialog.tsx`, unchanged):

```tsx
import { useEffect, useState } from 'react';

/** What a form's `action` is given by useActionState. */
export type FormAction = (form: FormData) => void;

/** sportbet's Alpine clock(): m:ss. */
export const clock = (seconds: number) =>
  `${String(Math.floor(seconds / 60))}:${String(seconds % 60).padStart(2, '0')}`;

/** Seconds counted down once a second from `seconds`, to zero (the code step's x-data). */
export function useCountdown(seconds: number): number {
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
export function Refusal({ message }: { message: string }) {
  return (
    <div
      role="alert"
      className="mb-3 rounded-[10px] bg-bad-tint px-3 py-2 text-[0.875rem] text-bad"
    >
      {message}
    </div>
  );
}
```

`apps/web/src/components/shell/code-step.tsx`:

```tsx
import { clock, Refusal, useCountdown, type FormAction } from './dialog-parts';
import { Icon } from './icon';

/** One of the step's forms: its test id and the intent it posts. */
interface StepForm {
  readonly testId: string;
  readonly intent: string;
}

export interface CodeStepForms {
  readonly cancel: StepForm;
  readonly verify: StepForm;
  readonly resend: StepForm;
}

export interface CodeStepProps {
  /** The address the code went to, as the visitor typed it. */
  readonly email: string;
  readonly resendIn: number;
  readonly expiresIn: number;
  /** The answer to the last code typed, or null. */
  readonly refusal: string | null;
  /** The code was sent again (issue 114). */
  readonly resent: boolean;
  readonly formAction: FormAction;
  readonly pending: boolean;
  readonly forms: CodeStepForms;
  readonly codeInputId: string;
  /** "Prisijungti" or "Užbaigti registraciją". */
  readonly submitLabel: string;
  /** What the resend posts besides its intent: the address, or the four answers again. */
  readonly resendFields: Readonly<Record<string, string>>;
}

/**
 * partials/auth/login-code-step and register-code-step, which share one
 * shape ("The code step has one implementation"): one job on screen - the
 * code - and its own way back; the code's life and the resend's cooldown
 * counted down; the resend a real form posting step one again.
 */
export function CodeStep({
  email,
  resendIn: resendFrom,
  expiresIn: expiresFrom,
  refusal,
  resent,
  formAction,
  pending,
  forms,
  codeInputId,
  submitLabel,
  resendFields,
}: CodeStepProps) {
  const expiresIn = useCountdown(expiresFrom);
  const resendIn = useCountdown(resendFrom);
  return (
    <div className="p-6">
      <form action={formAction} data-testid={forms.cancel.testId}>
        <input type="hidden" name="intent" value={forms.cancel.intent} />
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
          <strong className="font-semibold text-text">{email}</strong>
        </p>
      </div>
      {refusal === null ? null : <Refusal message={refusal} />}
      <form action={formAction} data-testid={forms.verify.testId}>
        <input type="hidden" name="intent" value={forms.verify.intent} />
        <label htmlFor={codeInputId} className="sr-only">
          8 skaitmenų kodas
        </label>
        <input
          id={codeInputId}
          name="code"
          type="text"
          inputMode="numeric"
          autoComplete="one-time-code"
          maxLength={8}
          placeholder={'\u2022'.repeat(8)}
          autoFocus
          className={`mb-2 block w-full rounded-[12px] border-[1.5px] bg-surface-2 px-4 py-3.5 text-center text-[1.4rem] font-bold tracking-[0.3em] indent-[0.3em] text-text outline-none placeholder:text-dim focus:border-accent focus:shadow-[0_0_0_3px_var(--color-accent-tint)] ${refusal === null ? 'border-border' : 'border-bad'}`}
        />
        <p className="mb-3.5 text-center text-[0.78rem] text-muted">
          {resent ? (
            <span className="font-semibold text-ok">
              Kodą išsiuntėme iš naujo.
            </span>
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
          {submitLabel}
        </button>
      </form>
      <div className="m-0 text-[0.78rem] leading-[1.5] text-muted">
        Negavote? Patikrinkite šlamšto aplanką arba{' '}
        <form
          action={formAction}
          className="inline"
          data-testid={forms.resend.testId}
        >
          <input type="hidden" name="intent" value={forms.resend.intent} />
          {Object.entries(resendFields).map(([name, value]) => (
            <input key={name} type="hidden" name={name} value={value} />
          ))}
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
```

`apps/web/src/components/shell/register-pane.tsx`:

```tsx
import { Refusal, type FormAction } from './dialog-parts';
import { Icon, type IconName } from './icon';
import {
  EMPTY_REGISTER_VALUES,
  type RegisterField,
  type RegisterState,
} from './register-state';

interface FieldProps {
  readonly name: RegisterField;
  readonly placeholder: string;
  readonly value: string;
  readonly error: string | undefined;
  readonly type?: 'text' | 'email';
  readonly icon?: IconName;
  readonly required?: boolean;
}

/** One input of modals/register: its icon, its answer kept, its error under it. */
function Field({
  name,
  placeholder,
  value,
  error,
  type = 'text',
  icon,
  required = false,
}: FieldProps) {
  return (
    <div className="min-w-0 flex-1">
      <div
        className={`flex items-stretch overflow-hidden rounded-md border ${error === undefined ? 'border-border' : 'border-bad'}`}
      >
        {icon === undefined ? null : (
          <span
            aria-hidden="true"
            className="flex items-center bg-surface-2 px-3 text-muted"
          >
            <Icon name={icon} />
          </span>
        )}
        <input
          type={type}
          name={name}
          aria-label={placeholder}
          placeholder={placeholder}
          defaultValue={value}
          required={required}
          aria-invalid={error !== undefined}
          className={`min-w-0 flex-1 bg-card py-2 pr-3 text-text outline-none placeholder:text-dim ${icon === undefined ? 'pl-3' : 'pl-1'}`}
        />
      </div>
      {error === undefined ? null : (
        <p className="mt-1 mb-0 text-[0.875em] text-bad">{error}</p>
      )}
    </div>
  );
}

/**
 * modals/register: step one of registering (#102) - a username, a name, a
 * surname and an address, behind a honeypot real visitors never see. A
 * refusal draws each field's text under it, the answers kept (sportbet's
 * old()); one that belongs to no field sits above the form (Q2).
 */
export function RegisterPane({
  state,
  formAction,
  pending,
}: {
  state: RegisterState;
  formAction: FormAction;
  pending: boolean;
}) {
  const errors = state.kind === 'refused' ? state.errors : {};
  const values = state.kind === 'refused' ? state.values : EMPTY_REGISTER_VALUES;
  return (
    <div className="p-6">
      {state.kind === 'code-refused' ? (
        <Refusal message={state.message} />
      ) : null}
      {/* Keyed by the answers: a refusal draws the form again with them. */}
      <form
        key={JSON.stringify(values)}
        action={formAction}
        data-testid="register-request"
      >
        <input type="hidden" name="intent" value="request" />
        {/* Honeypot: hidden from real users, bots fill it and get silently rejected */}
        <div
          aria-hidden="true"
          className="absolute -left-[9999px] h-0 w-0 overflow-hidden opacity-0"
        >
          <label htmlFor="website">Leave this blank</label>
          <input
            type="text"
            name="website"
            id="website"
            tabIndex={-1}
            autoComplete="off"
            defaultValue=""
          />
        </div>
        <div className="mb-3">
          <Field
            name="username"
            placeholder="Slapyvardis"
            icon="person"
            value={values.username}
            error={errors.username}
            required
          />
        </div>
        <div className="mb-3 flex gap-2">
          <Field
            name="name"
            placeholder="Vardas"
            value={values.name}
            error={errors.name}
            required
          />
          <Field
            name="surname"
            placeholder="Pavardė"
            value={values.surname}
            error={errors.surname}
          />
        </div>
        {/* The address is the credential (#35): sign-in codes are sent here. */}
        <div className="mb-4">
          <Field
            name="email"
            type="email"
            placeholder="El. paštas"
            icon="envelope"
            value={values.email}
            error={errors.email}
            required
          />
        </div>
        <button
          type="submit"
          disabled={pending}
          className="block w-full cursor-pointer rounded-md border-none bg-accent px-3 py-2 font-semibold text-on-accent hover:bg-accent-hover"
        >
          Registruotis
        </button>
      </form>
    </div>
  );
}
```

Replace `apps/web/src/components/shell/sign-in-dialog.tsx` with:

```tsx
'use client';

import { useActionState, useEffect, useState, type ReactNode } from 'react';
import { CodeStep, type CodeStepForms } from './code-step';
import { Refusal, type FormAction } from './dialog-parts';
import { Icon } from './icon';
import { RegisterPane } from './register-pane';
import { REGISTER_IDLE, type RegisterState } from './register-state';
import {
  SIGN_IN_DIALOG_ID,
  SIGN_IN_EVENT,
  SIGN_IN_IDLE,
  type DialogTab,
  type ShellSignIn,
  type SignInState,
} from './sign-in-state';

/** modals/login: the address, and "Gauti prisijungimo kodą". Google's way in is 4d's. */
function EmailStep({
  state,
  formAction,
  pending,
  codeMinutes,
}: {
  state: SignInState;
  formAction: FormAction;
  pending: boolean;
  codeMinutes: number;
}) {
  return (
    <div className="p-6">
      {/* Any refusal: a code typed with no address pending lands here too. */}
      {state.kind === 'refused' ? <Refusal message={state.message} /> : null}
      <form action={formAction} data-testid="sign-in-request">
        <input type="hidden" name="intent" value="request" />
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

const SIGN_IN_FORMS: CodeStepForms = {
  cancel: { testId: 'sign-in-cancel', intent: 'cancel' },
  verify: { testId: 'sign-in-verify', intent: 'verify' },
  resend: { testId: 'sign-in-resend', intent: 'request' },
};

const REGISTER_FORMS: CodeStepForms = {
  cancel: { testId: 'register-cancel', intent: 'cancel' },
  verify: { testId: 'register-confirm', intent: 'confirm' },
  resend: { testId: 'register-resend', intent: 'request' },
};

const TABS: readonly { readonly tab: DialogTab; readonly label: string }[] = [
  { tab: 'login', label: 'Prisijungti' },
  { tab: 'register', label: 'Registruotis' },
];

/** .sb-auth-tabs: a real tab list (sportbet issue 107), the chosen one on the accent tint. */
function Tabs({
  active,
  choose,
}: {
  active: DialogTab;
  choose: (tab: DialogTab) => void;
}) {
  return (
    <nav
      role="tablist"
      className="mt-4 flex gap-1 rounded-[12px] bg-surface-2 p-1"
    >
      {TABS.map(({ tab, label }) => (
        <button
          key={tab}
          id={`${tab}Tab`}
          type="button"
          role="tab"
          aria-controls={`${tab}Pane`}
          aria-selected={active === tab}
          onClick={() => {
            choose(tab);
          }}
          className={`h-9 flex-1 cursor-pointer rounded-[9px] border-none p-0 text-[0.875rem] ${active === tab ? 'bg-accent-tint font-bold text-text shadow-[0_1px_3px_var(--color-shadow)]' : 'bg-transparent font-semibold text-muted hover:text-text'}`}
        >
          {label}
        </button>
      ))}
    </nav>
  );
}

/**
 * The tab drawn: the sign-in's while registration is closed; else the one
 * the visitor chose, else Registruotis after a registration refusal (Q2),
 * else the one the dialog opened on.
 */
function activeTab(
  registrationOpen: boolean,
  chosen: DialogTab | null,
  registerState: RegisterState,
  tab: DialogTab,
): DialogTab {
  if (!registrationOpen) return 'login';
  if (chosen !== null) return chosen;
  return registerState.kind === 'refused' ||
    registerState.kind === 'code-refused'
    ? 'register'
    : tab;
}

/**
 * The sign-in dialog (sportbet's #loginModal, CLAUDE.md > The sign-in
 * dialog): one per page, for a guest; both flows in place - sign in or
 * register, a code typed, resent, or backed out of - each answered by its
 * own Server Action. It opens on "Prisijungti" (SIGN_IN_EVENT), on arrival
 * from /login or /register (on that tab), with a code to type, and on an
 * answer to something asked in it. The tabs are drawn only while
 * registration is open and no code is in flight.
 */
export function SignInDialog({
  step,
  open,
  tab,
  registrationOpen,
  codeMinutes,
  action,
  registerAction,
}: ShellSignIn) {
  const [state, formAction, pending] = useActionState(action, SIGN_IN_IDLE);
  const [registerState, registerFormAction, registering] = useActionState(
    registerAction,
    REGISTER_IDLE,
  );
  const [isOpen, setOpen] = useState(
    open ||
      step.kind !== 'email' ||
      state.kind !== 'idle' ||
      registerState.kind !== 'idle',
  );
  const [chosen, setChosen] = useState<DialogTab | null>(null);
  const active = activeTab(registrationOpen, chosen, registerState, tab);

  useEffect(() => {
    const show = () => {
      setOpen(true);
    };
    window.addEventListener(SIGN_IN_EVENT, show);
    return () => {
      window.removeEventListener(SIGN_IN_EVENT, show);
    };
  }, []);

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

  let body: ReactNode;
  if (step.kind === 'code') {
    body = (
      <CodeStep
        key={step.sentAt}
        email={step.email}
        resendIn={step.resendIn}
        expiresIn={step.expiresIn}
        refusal={state.kind === 'refused' ? state.message : null}
        resent={state.kind === 'sent' && state.resent}
        formAction={formAction}
        pending={pending}
        forms={SIGN_IN_FORMS}
        codeInputId="sign-in-code"
        submitLabel="Prisijungti"
        resendFields={{ email: step.email }}
      />
    );
  } else if (step.kind === 'register-code') {
    body = (
      <CodeStep
        key={step.sentAt}
        email={step.email}
        resendIn={step.resendIn}
        expiresIn={step.expiresIn}
        refusal={
          registerState.kind === 'code-refused' ? registerState.message : null
        }
        resent={registerState.kind === 'sent' && registerState.resent}
        formAction={registerFormAction}
        pending={registering}
        forms={REGISTER_FORMS}
        codeInputId="register-code"
        submitLabel="Užbaigti registraciją"
        resendFields={{
          username: step.username,
          name: step.name,
          surname: step.surname,
          email: step.email,
        }}
      />
    );
  } else {
    body = (
      <>
        <div
          id="loginPane"
          role={registrationOpen ? 'tabpanel' : undefined}
          aria-labelledby={registrationOpen ? 'loginTab' : undefined}
          hidden={active !== 'login'}
        >
          <EmailStep
            state={state}
            formAction={formAction}
            pending={pending}
            codeMinutes={codeMinutes}
          />
        </div>
        {registrationOpen ? (
          <div
            id="registerPane"
            role="tabpanel"
            aria-labelledby="registerTab"
            hidden={active !== 'register'}
          >
            <RegisterPane
              state={registerState}
              formAction={registerFormAction}
              pending={registering}
            />
          </div>
        ) : null}
      </>
    );
  }

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
          className={`bg-surface px-6 pt-5 text-text ${step.kind === 'email' ? 'pb-0' : 'pb-1.5'}`}
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
          {step.kind === 'email' && registrationOpen ? (
            <Tabs active={active} choose={setChosen} />
          ) : null}
        </div>
        {body}
      </div>
    </div>
  );
}
```

After writing `code-step.tsx`, check: `LC_ALL=C.UTF-8 grep -nP '\x{2022}' apps/web/src/components/shell/code-step.tsx` prints nothing (the placeholder is `'\u2022'.repeat(8)`, an expression, since a JSX attribute string reads no escapes).

If Q2's answer is sportbet's tab rule, `activeTab` returns `'register'` only when `registerState` is refused on `username`, `name` or `surname`, and RegisterPane's code-refused alert and the address error move to EmailStep's alert; the Q2 tests change with it.

- [ ] **Step 4: Run them to see them pass**

Run: `pnpm format && pnpm --filter @sportbet/web exec vitest run --config vitest.component.config.ts src/components/shell`
Expected: PASS - the new tests, and every 4b dialog and shell test unchanged.

Run: `pnpm typecheck && pnpm lint && pnpm --filter @sportbet/web exec vitest run --config vitest.component.config.ts src/token-guard.test.ts`
Expected: clean; the token guard passes (the new components use token utilities only).

- [ ] **Step 5: Hand to the lead**

Files: `dialog-parts.tsx`, `code-step.tsx`, `register-pane.tsx`, `sign-in-dialog.tsx` (+ test), `icon.tsx` (+ test). Commit message: `feat(web): the dialog's Prisijungti and Registruotis tabs, sportbet's register form and one code step for both flows (#18)`.

---

### Task 11 (web-dev): Registration end to end against the built app **(sensitive)**

sportbet's `RegistrationTest`, `RegistrationAtomicityTest`, `RegistrationDeadlineTest`, `RegistrationLandsInAnOpenTournamentTest` and `AuthDialogTest`, as feature tests: the built server, real Postgres, the Mailpit stand-in. The server's clock is real, so every game is dated from `Date.now()`.

**Files:**
- Create: `apps/web/tests/support/registration.ts`
- Create: `apps/web/tests/feature/registration.test.ts`
- Modify: `apps/web/tests/feature/sign-in.test.ts:132-144` (the `/login?tournament=` test)

- [ ] **Step 1: Write the test support**

`apps/web/tests/support/registration.ts`:

```ts
import {
  advanceIdentitySequences,
  saveTournamentSnapshot,
  type Db,
} from '@sportbet/db';
import {
  Game,
  instantFrom,
  Round,
  TeamOutcomes,
  type Instant,
  type NewTournament,
} from '@sportbet/domain';
import { gameNo, rate, roundNo, team, unwrap } from '@sportbet/domain/testing';
import { isoSecond } from '../../src/server/clock';
import type { Browser, Page } from './browser';
import { EUROLEAGUE_2025_26, EUROLEAGUE_2026_27 } from './tournaments';

// Tournaments the registration tests join, dated from the server's real
// clock, and the answers they register with. Test data only.

const DAY_MS = 86_400_000;

/** `days` from now (negative: ago), to the second. */
export const inDays = (days: number): Instant =>
  unwrap(instantFrom(isoSecond(Date.now() + days * DAY_MS)));

export interface PlannedTournament {
  readonly id: number;
  readonly tournament: NewTournament;
  /** Days from now to its round-1 game. */
  readonly firstGameInDays: number;
  /** Days from now to its round-5 game: the standings deadline, when R-8 closes it. */
  readonly deadlineInDays: number;
}

const EUROLEAGUE_2027_28: NewTournament = {
  ...EUROLEAGUE_2026_27,
  slug: 'euroleague-2027-28',
  name: 'Euroleague 2027/28',
  endsOn: '2028-05-21',
};

/** Open: its first game in a week. */
export const SOONER: PlannedTournament = {
  id: 41,
  tournament: EUROLEAGUE_2026_27,
  firstGameInDays: 7,
  deadlineInDays: 40,
};

/** Open: its first game in two weeks. */
export const LATER: PlannedTournament = {
  id: 42,
  tournament: EUROLEAGUE_2027_28,
  firstGameInDays: 14,
  deadlineInDays: 50,
};

/** Closed: round 5 began yesterday (R-8); its end date is a year off. */
export const CLOSED: PlannedTournament = {
  id: 43,
  tournament: { ...EUROLEAGUE_2025_26, endsOn: '2027-05-23' },
  firstGameInDays: -30,
  deadlineInDays: -1,
};

/**
 * Saves the tournament with two teams (id*10+1, +2), rounds 1 and 5
 * (id*10+1, +5) and one game in each (id*10+1, +5), unplayed, and moves
 * the identity sequences past every id.
 */
export async function saveTournamentWithGames(
  db: Db,
  plan: PlannedTournament,
): Promise<void> {
  const { id } = plan;
  const home = team(String(id * 10 + 1));
  const away = team(String(id * 10 + 2));
  const round = (number: number) => ({
    id: id * 10 + number,
    name: `${String(number)} turas`,
    round: Round.stored({
      number: roundNo(number),
      stage: 'regular',
      rate: rate(1),
      survival: false,
      knockout: false,
    }),
  });
  const game = (number: number, days: number) =>
    unwrap(
      Game.schedule({
        id: gameNo(id * 10 + number),
        round: roundNo(number),
        home,
        away,
        tipOff: inDays(days),
      }),
    );
  await saveTournamentSnapshot(db, {
    tournament: { id, ...plan.tournament },
    teams: [
      { id: home, name: `Home ${String(id)}` },
      { id: away, name: `Away ${String(id)}` },
    ],
    rounds: [round(1), round(5)],
    games: [game(1, plan.firstGameInDays), game(5, plan.deadlineInDays)],
    outcomes: unwrap(TeamOutcomes.stored([], false)),
    players: [],
    predictions: [],
    standings: [],
    runs: new Map(),
    production: { odds: [], matches: [], standings: [], survival: [] },
  });
  await advanceIdentitySequences(db);
}

/** A newcomer's answers, the address in its stored form. */
export const ANSWERS = {
  username: 'naujoke',
  name: 'Rūta',
  surname: 'Naujokė',
  email: 'ruta.naujoke@example.lt',
} as const;

/** Step one from the browser's own page, ANSWERS with `fields` over them. */
export async function startRegistration(
  browser: Browser,
  fields: Readonly<Record<string, string>> = {},
): Promise<Page> {
  return browser.submit(await browser.get('/'), 'register-request', {
    ...ANSWERS,
    ...fields,
  });
}
```

- [ ] **Step 2: Write the failing feature tests**

`apps/web/tests/feature/registration.test.ts`:

```ts
import { advanceIdentitySequences, issueLoginCode, savePlayers } from '@sportbet/db';
import { useTestDatabase } from '@sportbet/db/testing';
import { emailAddress } from '@sportbet/domain';
import { player, unwrap } from '@sportbet/domain/testing';
import { afterEach, beforeEach, describe, expect, inject, it } from 'vitest';
import { z } from 'zod';
import { now } from '../../src/server/clock';
import { hashLoginCode } from '../../src/server/sign-in/code-hash';
import { JONAS_ACCOUNT, JONAS_EMAIL, saveAccounts } from '../support/accounts';
import {
  Browser,
  documentOf,
  setCookieFor,
  type Page,
} from '../support/browser';
import { clearMail, settleMail, waitForCodes } from '../support/mailpit';
import {
  ANSWERS,
  CLOSED,
  LATER,
  saveTournamentWithGames,
  SOONER,
  startRegistration,
} from '../support/registration';

// sportbet's RegistrationTest, RegistrationAtomicityTest,
// RegistrationDeadlineTest, RegistrationLandsInAnOpenTournamentTest and
// AuthDialogTest (3eb95e7), against the built app.

const baseUrl = inject('baseUrl');
const mailpitUrl = inject('mailpitUrl');
const { db, client } = useTestDatabase();

const PENDING = '__Host-sb_register';
const INTENDED = '__Host-sb_intended';
const OPEN = '__Host-sb_signin_open';
const SESSION = '__Host-sb_session';
const WRONG = 'Neteisingas arba pasibaigęs kodas.';
const TAKEN = 'Šis el. paštas arba vartotojo vardas jau užimtas. Pradėkite iš naujo.';

const visitor = (ip = '192.0.2.10') => new Browser(baseUrl, ip);

const rowsIn = async (table: string) =>
  z
    .array(z.object({ rows: z.int() }))
    .parse(
      (await client.query(`select count(*)::int as rows from ${table}`)).rows,
    )[0]?.rows;

const dialogText = (page: Page) =>
  documentOf(page).querySelector('[role="dialog"]')?.textContent ?? '';

const registerPane = (page: Page) =>
  documentOf(page).querySelector('#registerPane');

async function onlyCode(email: string): Promise<string> {
  const [code] = await waitForCodes(mailpitUrl, email);
  if (code === undefined) throw new Error('no code');
  return code;
}

/** Steps one and two, ANSWERS with `fields` over them. */
async function registered(
  browser: Browser,
  fields: Readonly<Record<string, string>> = {},
): Promise<Page> {
  const step = await startRegistration(browser, fields);
  return browser.submit(step, 'register-confirm', {
    code: await onlyCode((fields['email'] ?? ANSWERS.email).toLowerCase()),
  });
}

const joinedTournaments = async () =>
  z
    .array(z.object({ tournament_id: z.int() }))
    .parse(
      (
        await client.query(
          'select tournament_id from tournament_players where player_id = (select id from players where username = $1)',
          [ANSWERS.username],
        )
      ).rows,
    )
    .map(({ tournament_id }) => tournament_id);

// A code still on its way must not land in the next test (settleMail).
afterEach(async () => {
  await settleMail(mailpitUrl);
});

beforeEach(async () => {
  await clearMail(mailpitUrl);
  await saveAccounts(db, [JONAS_ACCOUNT]);
  await advanceIdentitySequences(db);
});

describe('/register (RegisteredUserController::create)', () => {
  it('registration: sends a guest to / with the dialog to open on its Registruotis tab, keeping a ?tournament= slug', async () => {
    const browser = visitor();
    const sent = await browser.get('/register?tournament=euroleague-2026-27');
    expect(sent.status).toBe(302);
    expect(sent.location).toBe('/');
    expect(browser.cookie(OPEN)).toBe('register');
    expect(browser.cookie(INTENDED)).toBe('euroleague-2026-27');
    expect(setCookieFor(sent, INTENDED)).toMatch(/Max-Age=7200/);
    expect(setCookieFor(sent, INTENDED)).toMatch(/HttpOnly/);
    const home = documentOf(await browser.get('/'));
    expect(
      home
        .querySelector('[data-testid="sign-in-dialog"]')
        ?.hasAttribute('hidden'),
    ).toBe(false);
    expect(home.querySelector('#registerTab')?.getAttribute('aria-selected')).toBe(
      'true',
    );
    expect(home.querySelector('#registerPane')?.hasAttribute('hidden')).toBe(
      false,
    );
  });

  it('registration: keeps no ?tournament= that is not a slug', async () => {
    const browser = visitor();
    await browser.get('/register?tournament=Euroleague%202026');
    expect(browser.cookie(INTENDED)).toBeUndefined();
    expect(browser.cookie(OPEN)).toBe('register');
  });

  it('registration: /login keeps a ?tournament= slug for registration too, and opens on the sign-in tab', async () => {
    const browser = visitor();
    await browser.get('/login?tournament=euroleague-2027-28');
    expect(browser.cookie(INTENDED)).toBe('euroleague-2027-28');
    expect(browser.cookie(OPEN)).toBe('login');
  });

  it('registration (closed): /register goes home and opens nothing, and the dialog draws no Registruotis tab', async () => {
    await saveTournamentWithGames(db, CLOSED);
    const browser = visitor();
    const sent = await browser.get('/register?tournament=euroleague-2025-26');
    expect(sent.location).toBe('/');
    expect(browser.cookie(OPEN)).toBeUndefined();
    expect(browser.cookie(INTENDED)).toBeUndefined();
    const home = documentOf(await browser.get('/'));
    expect(home.querySelector('[role="tablist"]')).toBeNull();
    expect(home.querySelector('form[data-testid="register-request"]')).toBeNull();
    expect(
      home.querySelector('form[data-testid="sign-in-request"]'),
    ).not.toBeNull();
  });
});

describe('step one (RegisteredUserController::store)', () => {
  it('registration: the form creates nothing - a registration code mailed and stored as a hash, the answers in a signed cookie, the code step drawn', async () => {
    const browser = visitor();
    const step = await startRegistration(browser);
    expect(step.status).toBe(200);
    expect(dialogText(step)).toContain(`Kodą išsiuntėme į ${ANSWERS.email}`);
    expect(dialogText(step)).toMatch(/Kodas galioja dar [45]:\d\d/);
    expect(
      documentOf(step).querySelector('form[data-testid="register-confirm"]'),
    ).not.toBeNull();
    expect(documentOf(step).querySelector('[role="tablist"]')).toBeNull();
    for (const flag of [/Max-Age=7200/, /HttpOnly/, /Secure/, /Path=\//]) {
      expect(setCookieFor(step, PENDING)).toMatch(flag);
    }
    const code = await onlyCode(ANSWERS.email);
    const stored = await client.query(
      'select email, purpose, code_hash from login_codes',
    );
    expect(stored.rows).toHaveLength(1);
    expect(stored.rows[0]).toMatchObject({
      email: ANSWERS.email,
      purpose: 'registration',
    });
    expect(JSON.stringify(stored.rows)).not.toContain(code);
    expect(await rowsIn('players')).toBe(1);
    expect(await rowsIn('player_settings')).toBe(1);
    expect(await rowsIn('tournament_players')).toBe(0);
    expect(browser.cookie(SESSION)).toBeUndefined();
  });

  it('registration: an address with capitals is lowered, not refused (the owner, 2026-10-05)', async () => {
    const step = await startRegistration(visitor(), {
      email: '  Ruta.Naujoke@Example.LT ',
    });
    expect(dialogText(step)).toContain(`Kodą išsiuntėme į ${ANSWERS.email}`);
    await onlyCode(ANSWERS.email);
  });

  it('registration: a filled honeypot goes home silently - no code, nothing pending', async () => {
    const browser = visitor();
    const answer = await startRegistration(browser, { website: 'spam' });
    expect(answer.status).toBe(303);
    expect(answer.location).toBe('/');
    expect(browser.cookie(PENDING)).toBeUndefined();
    await new Promise((resolve) => setTimeout(resolve, 500));
    expect(await rowsIn('login_codes')).toBe(0);
  });

  it.each([
    ['no username', { username: '' }, 'Įveskite vartotojo vardą.'],
    ['no first name', { name: '' }, 'Įveskite vardą.'],
    ['no address', { email: '' }, 'Įveskite el. pašto adresą.'],
    [
      'an address that is not one',
      { email: 'ruta.naujoke' },
      'Įveskite teisingą el. pašto adresą.',
    ],
    [
      'a username over 255 characters',
      { username: 'a'.repeat(256) },
      'Per ilgas: daugiausia 255 simboliai.',
    ],
    [
      'a first name over 255 characters',
      { name: 'ž'.repeat(256) },
      'Per ilgas: daugiausia 255 simboliai.',
    ],
    [
      'a surname over 255 characters',
      { surname: 'ž'.repeat(256) },
      'Per ilgas: daugiausia 255 simboliai.',
    ],
    [
      'an address over 255 characters',
      { email: `${'a'.repeat(245)}@example.lt` },
      'Per ilgas: daugiausia 255 simboliai.',
    ],
    [
      'an address already registered',
      { email: JONAS_EMAIL },
      'Šis el. pašto adresas jau užregistruotas.',
    ],
    [
      'a second spelling of a registered address (unique:users)',
      { email: 'jonas.petraitis@exámple.lt' },
      'Šis el. pašto adresas jau užregistruotas.',
    ],
  ])(
    'registration: refuses %s with its text, under the form, and sends nothing',
    async (_label, fields, text) => {
      const browser = visitor();
      const page = await startRegistration(browser, fields);
      expect(page.status).toBe(200);
      expect(registerPane(page)?.textContent).toContain(text);
      expect(registerPane(page)?.hasAttribute('hidden')).toBe(false);
      expect(browser.cookie(PENDING)).toBeUndefined();
      expect(await rowsIn('login_codes')).toBe(0);
    },
  );

  it('registration: a refused form keeps the answers typed (old())', async () => {
    const page = await startRegistration(visitor(), { username: '' });
    const field = (name: string) =>
      registerPane(page)
        ?.querySelector(`input[name="${name}"]`)
        ?.getAttribute('value');
    expect(field('name')).toBe(ANSWERS.name);
    expect(field('surname')).toBe(ANSWERS.surname);
    expect(field('email')).toBe(ANSWERS.email);
  });

  it('registration: a resend is step one again - a new code, the old one void, "Kodą išsiuntėme iš naujo." (issue 114)', async () => {
    const browser = visitor();
    const step = await startRegistration(browser);
    const [first] = await waitForCodes(mailpitUrl, ANSWERS.email);
    const again = await browser.submit(step, 'register-resend');
    expect(dialogText(again)).toContain('Kodą išsiuntėme iš naujo.');
    const codes = await waitForCodes(mailpitUrl, ANSWERS.email, 2);
    expect(
      (
        await client.query(
          'select count(*)::int as live from login_codes where consumed_at is null',
        )
      ).rows,
    ).toEqual([{ live: 1 }]);
    if (first !== codes[1]) {
      expect(
        dialogText(
          await browser.submit(again, 'register-confirm', { code: first ?? '' }),
        ),
      ).toContain(WRONG);
    }
  });

  it('registration: "Atgal" forgets the pending registration', async () => {
    const browser = visitor();
    const step = await startRegistration(browser);
    const back = await browser.submit(step, 'register-cancel');
    expect(setCookieFor(back, PENDING)).toMatch(/Max-Age=0/);
    expect(
      documentOf(back).querySelector('form[data-testid="register-request"]'),
    ).not.toBeNull();
    expect(
      documentOf(back).querySelector('form[data-testid="register-confirm"]'),
    ).toBeNull();
  });

  it('registration (closed): step one goes home and creates nothing', async () => {
    const browser = visitor();
    const page = await browser.get('/');
    await saveTournamentWithGames(db, CLOSED);
    const answer = await browser.submit(page, 'register-request', ANSWERS);
    expect(answer.status).toBe(303);
    expect(answer.location).toBe('/');
    expect(browser.cookie(PENDING)).toBeUndefined();
    await new Promise((resolve) => setTimeout(resolve, 500));
    expect(await rowsIn('login_codes')).toBe(0);
  });
});

describe('step two (RegisteredUserController::confirm)', () => {
  it('registration: the code creates the account, its settings and its place in the open tournament, signs it in, records register, and goes home', async () => {
    await saveTournamentWithGames(db, SOONER);
    const browser = visitor();
    const done = await registered(browser);
    expect(done.status).toBe(303);
    expect(done.location).toBe('/');
    expect(setCookieFor(done, PENDING)).toMatch(/Max-Age=0/);
    expect(browser.cookie(SESSION)).toBeDefined();
    expect(
      (
        await client.query(
          'select id, username, name, surname, email from players where id = 2',
        )
      ).rows,
    ).toEqual([{ id: 2, ...ANSWERS }]);
    expect(
      (await client.query('select * from player_settings where player_id = 2'))
        .rows,
    ).toEqual([
      { player_id: 2, locale: 'lt', admin_level: 0, last_tournament_id: null },
    ]);
    expect(await joinedTournaments()).toEqual([SOONER.id]);
    expect(
      (
        await client.query(
          'select game_id, home, away, origin from match_predictions where player_id = 2 order by game_id',
        )
      ).rows,
    ).toEqual([
      { game_id: 411, home: null, away: null, origin: 'real' },
      { game_id: 415, home: null, away: null, origin: 'real' },
    ]);
    expect(
      (
        await client.query(
          'select count(*)::int as rows from standings_predictions where player_id = 2',
        )
      ).rows,
    ).toEqual([{ rows: 2 }]);
    expect(
      (await client.query('select player_id, method from audit_logins')).rows,
    ).toEqual([{ player_id: 2, method: 'register' }]);
    const home = documentOf(await browser.get('/'));
    expect(home.querySelector('[data-testid="rail"]')?.textContent).toContain(
      'Rūta N.',
    );
    expect(
      home.querySelector('[data-testid="rail-context"]')?.textContent,
    ).toContain('Euroleague 2026/27');
    expect(home.querySelector('[data-testid="sign-in-dialog"]')).toBeNull();
    // A signed-in visitor has no registration to make (`guest`).
    const again = await browser.get('/register');
    expect(again.location).toBe('/');
    expect(browser.cookie(OPEN)).toBeUndefined();
    const posted = await browser.submit(
      await visitor('192.0.2.11').get('/'),
      'register-request',
      { ...ANSWERS, username: 'kitas', email: 'kitas@example.lt' },
    );
    expect(posted.location).toBe('/');
    expect(await rowsIn('login_codes')).toBe(1);
  });

  it('registration: a wrong code, a sign-in code for the address and an expired code all get the one answer, and nothing is created', async () => {
    const browser = visitor();
    const step = await startRegistration(browser);
    const code = await onlyCode(ANSWERS.email);
    const wrong = code === '00000000' ? '11111111' : '00000000';
    expect(
      dialogText(await browser.submit(step, 'register-confirm', { code: wrong })),
    ).toContain(WRONG);
    // sportbet's test_a_sign_in_code_cannot_complete_a_registration
    const signInCode = code === '22223333' ? '33334444' : '22223333';
    await issueLoginCode(db, {
      email: unwrap(emailAddress(ANSWERS.email)),
      purpose: 'login',
      codeHash: await hashLoginCode(signInCode),
      now: now(),
    });
    expect(
      dialogText(
        await browser.submit(step, 'register-confirm', { code: signInCode }),
      ),
    ).toContain(WRONG);
    await client.query(
      "update login_codes set expires_at = now() - interval '1 second' where purpose = 'registration'",
    );
    expect(
      dialogText(await browser.submit(step, 'register-confirm', { code })),
    ).toContain(WRONG);
    expect(await rowsIn('players')).toBe(1);
    expect(browser.cookie(SESSION)).toBeUndefined();
  });

  it('registration: a registration code never signs in (purpose scoping, #43)', async () => {
    const browser = visitor();
    await startRegistration(browser);
    const code = await onlyCode(ANSWERS.email);
    // A second later, so the sign-in is the step asked for last (to the second).
    await new Promise((resolve) => setTimeout(resolve, 1100));
    const signInStep = await browser.submit(
      await visitor('192.0.2.12').get('/'),
      'sign-in-request',
      { email: ANSWERS.email },
    );
    const refused = await browser.submit(signInStep, 'sign-in-verify', { code });
    expect(dialogText(refused)).toContain(WRONG);
    expect(browser.cookie(SESSION)).toBeUndefined();
  });

  it('registration: a code with no registration pending in this browser asks for the form first', async () => {
    const step = await startRegistration(visitor());
    const other = visitor('192.0.2.13');
    const refused = await other.submit(step, 'register-confirm', {
      code: '12345678',
    });
    expect(refused.status).toBe(200);
    expect(registerPane(refused)?.textContent).toContain(
      'Pirmiausia užpildykite registracijos formą.',
    );
    expect(await rowsIn('players')).toBe(1);
  });

  it('registration: an address registered between the two steps - taken, the pending registration forgotten, nothing created', async () => {
    const browser = visitor();
    const step = await startRegistration(browser);
    const code = await onlyCode(ANSWERS.email);
    await savePlayers(db, [
      {
        id: player('7'),
        username: 'kita',
        email: unwrap(emailAddress(ANSWERS.email)),
        name: 'Kita',
        surname: '',
      },
    ]);
    const taken = await browser.submit(step, 'register-confirm', { code });
    expect(taken.status).toBe(200);
    expect(registerPane(taken)?.textContent).toContain(TAKEN);
    expect(setCookieFor(taken, PENDING)).toMatch(/Max-Age=0/);
    expect(browser.cookie(SESSION)).toBeUndefined();
    expect(await rowsIn('players')).toBe(2);
  });

  it('registration: a username taken between the two steps, ignoring case and accents as sportbet\'s collation does - the same', async () => {
    const browser = visitor();
    const step = await startRegistration(browser);
    const code = await onlyCode(ANSWERS.email);
    await savePlayers(db, [
      {
        id: player('7'),
        username: 'NAUJOKĖ',
        email: unwrap(emailAddress('kita@example.lt')),
        name: 'Kita',
        surname: '',
      },
    ]);
    const taken = await browser.submit(step, 'register-confirm', { code });
    expect(registerPane(taken)?.textContent).toContain(TAKEN);
    expect(setCookieFor(taken, PENDING)).toMatch(/Max-Age=0/);
    expect(await rowsIn('players')).toBe(2);
  });

  it('registration: any other failure is no naming conflict - its own answer, the pending registration kept, nothing created (#270)', async () => {
    const browser = visitor();
    const step = await startRegistration(browser);
    const code = await onlyCode(ANSWERS.email);
    await client.query(`
      create function refuse_settings() returns trigger language plpgsql
        as $$ begin raise exception 'simulated failure writing the settings row'; end $$;
      create trigger refuse_settings before insert on player_settings
        for each row execute function refuse_settings();
    `);
    try {
      const failed = await browser.submit(step, 'register-confirm', { code });
      expect(failed.status).toBe(200);
      expect(dialogText(failed)).toContain(
        'Registracijos užbaigti nepavyko. Bandykite dar kartą.',
      );
      expect(dialogText(failed)).not.toContain('jau užimtas');
      expect(setCookieFor(failed, PENDING)).toBeUndefined();
      expect(browser.cookie(PENDING)).toBeDefined();
      expect(
        documentOf(failed).querySelector('form[data-testid="register-confirm"]'),
      ).not.toBeNull();
      expect(await rowsIn('players')).toBe(1);
      expect(browser.cookie(SESSION)).toBeUndefined();
    } finally {
      await client.query(`
        drop trigger refuse_settings on player_settings;
        drop function refuse_settings();
      `);
    }
  });

  it('registration: the deadline passing between the two steps - home, the pending registration forgotten, nothing created', async () => {
    await saveTournamentWithGames(db, { ...SOONER, firstGameInDays: -10, deadlineInDays: 1 });
    const browser = visitor();
    const step = await startRegistration(browser);
    const code = await onlyCode(ANSWERS.email);
    // Round 5 starts: R-8 closes the season (sportbet: its first game).
    await client.query(
      "update games set tip_off = now() - interval '1 minute' where id = 415",
    );
    const closed = await browser.submit(step, 'register-confirm', { code });
    expect(closed.status).toBe(303);
    expect(closed.location).toBe('/');
    expect(setCookieFor(closed, PENDING)).toMatch(/Max-Age=0/);
    expect(await rowsIn('players')).toBe(1);
    expect(browser.cookie(SESSION)).toBeUndefined();
  });
});

describe('the tournament a new account joins (PostRegisterController, R-27)', () => {
  beforeEach(async () => {
    await saveTournamentWithGames(db, SOONER);
    await saveTournamentWithGames(db, LATER);
    await saveTournamentWithGames(db, CLOSED);
  });

  it('registration: the ?tournament= one, when it takes players', async () => {
    const browser = visitor();
    await browser.get('/register?tournament=euroleague-2027-28');
    await registered(browser);
    expect(await joinedTournaments()).toEqual([LATER.id]);
    expect(browser.cookie(INTENDED)).toBeUndefined();
  });

  it('registration: an unknown slug falls back to the open tournament whose next game is soonest', async () => {
    const browser = visitor();
    await browser.get('/register?tournament=no-such-tournament');
    await registered(browser);
    expect(await joinedTournaments()).toEqual([SOONER.id]);
  });

  it('registration: a closed one falls back too, and no row is written for its games', async () => {
    const browser = visitor();
    await browser.get('/login?tournament=euroleague-2025-26');
    await registered(browser);
    expect(await joinedTournaments()).toEqual([SOONER.id]);
    expect(
      (
        await client.query(
          'select count(*)::int as rows from match_predictions where game_id in (431, 435)',
        )
      ).rows,
    ).toEqual([{ rows: 0 }]);
  });
});

it('registration: with no tournament at all, the account joins none (Q4: an empty installation stays open)', async () => {
  const browser = visitor();
  const done = await registered(browser);
  expect(done.location).toBe('/');
  expect(await joinedTournaments()).toEqual([]);
  expect(await rowsIn('player_settings')).toBe(2);
});

it('the dialog draws the step asked for last when a sign-in and a registration are both pending (AuthDialogComposer)', async () => {
  const browser = visitor();
  await startRegistration(browser);
  // sentAt is kept to the second: one apart, the sign-in is the later.
  await new Promise((resolve) => setTimeout(resolve, 1100));
  const signIn = await browser.submit(
    await visitor('192.0.2.14').get('/'),
    'sign-in-request',
    { email: JONAS_EMAIL },
  );
  expect(
    documentOf(signIn).querySelector('form[data-testid="sign-in-verify"]'),
  ).not.toBeNull();
  expect(
    documentOf(signIn).querySelector('form[data-testid="register-confirm"]'),
  ).toBeNull();
});
```

In `apps/web/tests/feature/sign-in.test.ts`, replace the test at lines 132-144 ("/login?tournament= opens the dialog, and carries nothing into the sign-in") with:

```ts
  // #16's note: the slug is registration's (intended_tournament), never the sign-in's.
  it('/login?tournament= opens the dialog, keeps the slug for registration, and carries nothing into the sign-in', async () => {
    const browser = visitor();
    const login = await browser.get('/login?tournament=euroleague-2026-27');
    expect(login.location).toBe('/');
    expect(browser.cookie('__Host-sb_intended')).toBe('euroleague-2026-27');
    const home = documentOf(await browser.get('/'));
    expect(
      home
        .querySelector('[data-testid="sign-in-dialog"]')
        ?.hasAttribute('hidden'),
    ).toBe(false);
    expect(home.querySelector('input[name="next"]')).toBeNull();
    const step = await browser.submit(
      await browser.get('/'),
      'sign-in-request',
      { email: JONAS_EMAIL },
    );
    const [body = ''] = (browser.cookie(PENDING) ?? '').split('.');
    expect(Buffer.from(body, 'base64url').toString('utf8')).not.toContain(
      'euroleague',
    );
    expect(step.status).toBe(200);
  });
```

- [ ] **Step 3: Run them**

Run: `pnpm build && pnpm --filter @sportbet/web exec vitest run --config vitest.feature.config.ts tests/feature/registration.test.ts tests/feature/sign-in.test.ts`
Expected: PASS. Tasks 6 to 10 built everything these tests reach; a failure here is a finding in those tasks' code, fixed there, never in the test.

- [ ] **Step 4: The whole feature suite**

Run: `pnpm test:feature 2>&1 | grep -E "Test Files|Tests "`
Expected: every test passes, 4b's included.

- [ ] **Step 5: Hand to the lead**

Files: `tests/support/registration.ts`, `tests/feature/registration.test.ts`, `tests/feature/sign-in.test.ts`. Commit message: `test(web): registration end to end - the answers, the codes, taken and failed confirmations, the deadline, the tournament joined (#18)`.

---

### Task 12 (web-dev): The registration throttles and cross-origin refusals **(sensitive)**

sportbet's `RegistrationRateLimitTest`, `RegistrationTest::test_confirmation_attempts_are_rate_limited`, `RegistrationDeadlineTest`'s register-page limiter, and #16's CSRF notes, for the three registration forms.

**Files:**
- Create: `apps/web/tests/feature/registration-guards.test.ts`

- [ ] **Step 1: Write the tests**

`apps/web/tests/feature/registration-guards.test.ts`:

```ts
import { advanceIdentitySequences } from '@sportbet/db';
import { useTestDatabase } from '@sportbet/db/testing';
import { afterEach, beforeEach, describe, expect, inject, it } from 'vitest';
import { z } from 'zod';
import { JONAS_ACCOUNT, saveAccounts } from '../support/accounts';
import {
  Browser,
  documentOf,
  setCookieFor,
  type Page,
} from '../support/browser';
import { clearMail, settleMail, waitForCodes } from '../support/mailpit';
import { ANSWERS, startRegistration } from '../support/registration';

// sportbet's RegistrationRateLimitTest and the 'register',
// 'register-page' and 'register-confirm' limiters (3eb95e7), and #16's
// cross-origin refusals.

const baseUrl = inject('baseUrl');
const mailpitUrl = inject('mailpitUrl');
const { db, client } = useTestDatabase();

const PENDING = '__Host-sb_register';
const EVIL = 'https://evil.example';
const WRONG = 'Neteisingas arba pasibaigęs kodas.';
const TEN_MINUTES = 'Per daug bandymų. Pabandykite dar kartą po 10 min.';
const ONE_MINUTE = 'Per daug bandymų. Pabandykite dar kartą po 1 min.';

const visitor = (ip: string) => new Browser(baseUrl, ip);
const dialogText = (page: Page) =>
  documentOf(page).querySelector('[role="dialog"]')?.textContent ?? '';
const rowsIn = async (table: string) =>
  z
    .array(z.object({ rows: z.int() }))
    .parse(
      (await client.query(`select count(*)::int as rows from ${table}`)).rows,
    )[0]?.rows;

afterEach(async () => {
  await settleMail(mailpitUrl);
});

beforeEach(async () => {
  await clearMail(mailpitUrl);
  await saveAccounts(db, [JONAS_ACCOUNT]);
  await advanceIdentitySequences(db);
});

describe("the registration throttles (AppServiceProvider, bootstrap/app.php's answer)", () => {
  it('throttle: step one - the fourth for one address in ten minutes is refused, whatever its spelling, and mails nothing', async () => {
    const spellings = [
      ANSWERS.email,
      'Ruta.Naujoke@Example.LT',
      '  RUTA.NAUJOKE@EXAMPLE.LT  ',
    ];
    for (const [index, email] of spellings.entries()) {
      const page = await startRegistration(
        visitor(`192.0.2.${String(20 + index)}`),
        { email },
      );
      expect(dialogText(page)).not.toContain('Per daug bandymų');
    }
    await waitForCodes(mailpitUrl, ANSWERS.email, 3);
    const refused = await startRegistration(visitor('192.0.2.29'));
    expect(dialogText(refused)).toContain(TEN_MINUTES);
    await new Promise((resolve) => setTimeout(resolve, 500));
    expect(await rowsIn('login_codes')).toBe(3);
  });

  it('throttle: step one - the fourth from one IP in a minute is refused, across addresses', async () => {
    const browser = visitor('192.0.2.30');
    for (let attempt = 0; attempt < 3; attempt += 1) {
      const fresh = visitor('192.0.2.30');
      const page = await startRegistration(fresh, {
        username: `naujas${String(attempt)}`,
        email: `naujas${String(attempt)}@example.lt`,
      });
      expect(dialogText(page)).not.toContain('Per daug bandymų');
    }
    const refused = await startRegistration(browser, {
      username: 'naujas9',
      email: 'naujas9@example.lt',
    });
    expect(dialogText(refused)).toContain(ONE_MINUTE);
    await settleMail(mailpitUrl);
    expect(await rowsIn('login_codes')).toBe(3);
  });

  it('throttle: a blank address counts on its own IP key - another IP is answered by the form, not the throttle', async () => {
    const first = visitor('192.0.2.40');
    for (let attempt = 0; attempt < 3; attempt += 1) {
      await startRegistration(first, { email: '' });
    }
    expect(dialogText(await startRegistration(first, { email: '' }))).toContain(
      ONE_MINUTE,
    );
    const second = dialogText(
      await startRegistration(visitor('192.0.2.41'), { email: '' }),
    );
    expect(second).not.toContain('Per daug bandymų');
    expect(second).toContain('Įveskite el. pašto adresą.');
  });

  it('throttle: /register - the eleventh from one IP in a minute is refused (Q3)', async () => {
    const browser = visitor('192.0.2.50');
    for (let attempt = 0; attempt < 10; attempt += 1) {
      expect((await browser.get('/register')).status).toBe(302);
    }
    const refused = await browser.get('/register');
    expect(refused.status).toBe(429);
    expect(refused.html).toBe(ONE_MINUTE);
  });

  it('throttle: step two - the sixth for one pending address in ten minutes is refused, on the code', async () => {
    const browser = visitor('192.0.2.60');
    const step = await startRegistration(browser);
    await waitForCodes(mailpitUrl, ANSWERS.email);
    for (let attempt = 0; attempt < 5; attempt += 1) {
      expect(
        dialogText(
          await browser.submit(step, 'register-confirm', { code: '00000000' }),
        ),
      ).toContain(WRONG);
    }
    const refused = await browser.submit(step, 'register-confirm', {
      code: '00000000',
    });
    expect(dialogText(refused)).toContain(TEN_MINUTES);
    expect(await rowsIn('players')).toBe(1);
  });

  it('throttle: step two - the sixteenth from one IP in ten minutes is refused, across pending addresses', async () => {
    const steps: { browser: Browser; step: Page }[] = [];
    for (const name of ['pirmas', 'antras', 'trecias']) {
      const browser = visitor('192.0.2.70');
      steps.push({
        browser,
        step: await startRegistration(browser, {
          username: name,
          email: `${name}@example.lt`,
        }),
      });
    }
    await settleMail(mailpitUrl);
    for (const { browser, step } of steps) {
      for (let attempt = 0; attempt < 5; attempt += 1) {
        expect(
          dialogText(
            await browser.submit(step, 'register-confirm', { code: '00000000' }),
          ),
        ).toContain(WRONG);
      }
    }
    const [first] = steps;
    if (first === undefined) throw new Error('no step');
    // A fourth browser on the IP, with nothing pending: refused by the IP.
    const refused = await visitor('192.0.2.70').submit(
      first.step,
      'register-confirm',
      { code: '00000000' },
    );
    expect(dialogText(refused)).toContain(TEN_MINUTES);
  });
});

// #16: every state-changing request refuses another origin, and changes nothing.
describe('cross-origin registration requests', () => {
  it.each([
    ['register-request', { ...ANSWERS, username: 'kitas', email: 'kitas@example.lt' }],
    ['register-confirm', { code: '12345678' }],
    ['register-cancel', {}],
  ] as const)(
    'the %s form posted from another site is refused and changes nothing',
    async (testId, fields) => {
      const browser = visitor('192.0.2.80');
      const step = await startRegistration(browser);
      await waitForCodes(mailpitUrl, ANSWERS.email);
      const pending = browser.cookie(PENDING);
      const page =
        testId === 'register-request'
          ? await visitor('192.0.2.81').get('/')
          : step;
      const refused = await browser.submit(page, testId, fields, {
        origin: EVIL,
      });
      expect(refused.status).toBeGreaterThanOrEqual(400);
      expect(setCookieFor(refused, PENDING)).toBeUndefined();
      expect(browser.cookie(PENDING)).toBe(pending);
      expect(await rowsIn('login_codes')).toBe(1);
      expect(await rowsIn('players')).toBe(1);
    },
  );

  it('step one with no Origin is refused unless Sec-Fetch-Site says same-origin', async () => {
    const browser = visitor('192.0.2.82');
    const home = await browser.get('/');
    for (const from of [
      { origin: null },
      { origin: null, secFetchSite: 'cross-site' },
    ]) {
      const refused = await browser.submit(
        home,
        'register-request',
        ANSWERS,
        from,
      );
      expect(refused.status).toBeGreaterThanOrEqual(400);
    }
    expect(browser.cookie(PENDING)).toBeUndefined();
    expect(await rowsIn('login_codes')).toBe(0);
  });
});
```

- [ ] **Step 2: Run them**

Run: `pnpm build && pnpm --filter @sportbet/web exec vitest run --config vitest.feature.config.ts tests/feature/registration-guards.test.ts`
Expected: PASS (10 tests). A failure is a finding in Tasks 2, 8 or 9's code, fixed there.

- [ ] **Step 3: Hand to the lead**

Files: `tests/feature/registration-guards.test.ts`. Commit message: `test(web): registration's throttles as sportbet's, and its forms refused from another origin (#18)`.

---

### Task 13 (qa): Registering in a browser at 390 and 1280, and `/register`'s smoke

The spec's E2E: register at a phone's and a desktop's width with the code from Mailpit, and land signed in. CI's E2E stack seeds staging's tournaments (`packages/db/src/seed/staging.ts`): Euroleague 2026/27 has no games yet, so it takes players; 2025/26 ended. The stack's database lives for the whole run, so each test registers an address and username of its own. Two specs now read codes from the one Mailpit, and Playwright may run files side by side, so neither clears the shared inbox any more: each waits for one more code than its address already has, and types the newest.

**Files:**
- Create: `apps/web/e2e/register.spec.ts`
- Modify: `apps/web/e2e/sign-in.spec.ts` (the `signIn` helper; its import)
- Modify: `apps/web/playwright.config.ts:10-15`
- Modify: `apps/web/smoke/smoke.test.ts` (one test renamed, one added)

- [ ] **Step 1: Write the journey**

`apps/web/e2e/register.spec.ts`:

```ts
import { expect, test, type Page } from '@playwright/test';
import { codesTo, waitForCodes } from '../tests/support/mailpit';

// Registration (spec 4c, issue #18): the Registruotis tab, four answers,
// the code from Mailpit, signed in and in the tournament taking players.
// Only CI's stack has Mailpit, so playwright.config.ts leaves this file out
// against staging. The stack's database lives for the whole run: each test
// registers an address and a username no other test uses.

const MAILPIT = process.env['E2E_MAILPIT_URL'] ?? '';

test.describe.configure({ mode: 'serial' });

/** The cookie bar sits over the page's foot; the visitor answers it first. */
async function answerCookies(page: Page): Promise<void> {
  await page
    .getByTestId('cookie-consent')
    .getByRole('button', { name: 'Tik būtini' })
    .click();
}

interface Newcomer {
  readonly username: string;
  readonly name: string;
  readonly surname: string;
  readonly email: string;
}

/** A newcomer of this run, at this width. */
function newcomer(width: number): Newcomer {
  const tag = `${String(width)}x${String(Date.now())}`;
  return {
    username: `naujoke${tag}`,
    name: 'Rūta',
    surname: 'Naujokė',
    email: `e2e.naujoke.${tag}@sportbet.test`,
  };
}

/** From an open dialog to a signed-in page: the Registruotis tab, the answers, the mailed code. */
async function register(page: Page, who: Newcomer): Promise<void> {
  const dialog = page.getByRole('dialog', { name: 'Prisijungti' });
  await expect(dialog).toBeVisible();
  const tab = dialog.getByRole('tab', { name: 'Registruotis' });
  await tab.click();
  await expect(tab).toHaveAttribute('aria-selected', 'true');
  const form = dialog.getByTestId('register-request');
  await form.getByPlaceholder('Slapyvardis', { exact: true }).fill(who.username);
  await form.getByPlaceholder('Vardas', { exact: true }).fill(who.name);
  await form.getByPlaceholder('Pavardė', { exact: true }).fill(who.surname);
  await form.getByPlaceholder('El. paštas', { exact: true }).fill(who.email);
  const before = (await codesTo(MAILPIT, who.email)).length;
  await form.getByRole('button', { name: 'Registruotis' }).click();
  await expect(dialog.getByText(who.email)).toBeVisible();
  const code = (await waitForCodes(MAILPIT, who.email, before + 1)).at(-1);
  if (code === undefined) throw new Error('no code was mailed');
  await dialog.getByLabel('8 skaitmenų kodas').fill(code);
  await dialog.getByRole('button', { name: 'Užbaigti registraciją' }).click();
  await expect(dialog).toBeHidden();
}

/** sportbet's LayoutOverflowRegressionTest, in a browser: the page never scrolls sideways. */
async function scrollsSideways(page: Page): Promise<boolean> {
  return page.evaluate(
    () =>
      document.documentElement.scrollWidth >
      document.documentElement.clientWidth,
  );
}

test.describe('at a phone width', () => {
  test.use({ viewport: { width: 390, height: 844 } });

  test('registers from the phone bar with a mailed code and lands signed in, in the open tournament', async ({
    page,
  }) => {
    await page.goto('/');
    await answerCookies(page);
    const bar = page.getByTestId('phone-header');
    await bar.getByRole('link', { name: 'Prisijungti' }).click();
    expect(await scrollsSideways(page)).toBe(false);
    await register(page, newcomer(390));
    await bar.getByRole('button', { name: 'Atidaryti meniu' }).click();
    await expect(bar.getByText('Euroleague 2026/27')).toBeVisible();
    expect(await scrollsSideways(page)).toBe(false);
  });
});

test.describe('at a desktop width', () => {
  test.use({ viewport: { width: 1280, height: 800 } });

  test('/register opens the dialog on Registruotis; registering lands signed in, in the open tournament', async ({
    page,
  }) => {
    await page.goto('/register');
    await expect(page).toHaveURL('/');
    await answerCookies(page);
    await expect(
      page
        .getByRole('dialog', { name: 'Prisijungti' })
        .getByRole('tab', { name: 'Registruotis' }),
    ).toHaveAttribute('aria-selected', 'true');
    await register(page, newcomer(1280));
    const rail = page.getByTestId('rail');
    await expect(rail.getByText('Rūta N.')).toBeVisible();
    await expect(
      page.getByTestId('rail-context').getByText('Euroleague 2026/27'),
    ).toBeVisible();
    // Still signed in after a fresh load: registering signs in like a code does.
    await page.reload();
    await expect(rail.getByText('Rūta N.')).toBeVisible();
  });
});
```

In `apps/web/e2e/sign-in.spec.ts`, import `codesTo, waitForCodes` (not `clearMail`) from `../tests/support/mailpit`, and replace the body of `signIn` with:

```ts
  const dialog = page.getByRole('dialog', { name: 'Prisijungti' });
  await expect(dialog).toBeVisible();
  // The register form has an address field too: the sign-in form's own.
  const form = dialog.getByTestId('sign-in-request');
  await form.getByPlaceholder('El. paštas', { exact: true }).fill(PLAYER);
  const before = (await codesTo(MAILPIT, PLAYER)).length;
  await form.getByRole('button', { name: 'Gauti prisijungimo kodą' }).click();
  await expect(dialog.getByText(PLAYER)).toBeVisible();
  // register.spec.ts reads the same Mailpit, so the inbox is never cleared:
  // the newest code to this address is this sign-in's.
  const code = (await waitForCodes(MAILPIT, PLAYER, before + 1)).at(-1);
  if (code === undefined) throw new Error('no code was mailed');
  await dialog.getByLabel('8 skaitmenų kodas').fill(code);
  await dialog
    .getByRole('button', { name: 'Prisijungti', exact: true })
    .click();
  await expect(dialog).toBeHidden();
```

In `apps/web/playwright.config.ts`, replace lines 10-15 with:

```ts
// The sign-in and registration journeys read their codes from Mailpit,
// which only CI's stack runs; against staging (Resend, allow-listed to the
// owner) they are left out here rather than skipped in the specs.
const mailpit = process.env['E2E_MAILPIT_URL'];
const signInJourney =
  mailpit === undefined || mailpit === ''
    ? ['**/sign-in.spec.ts', '**/register.spec.ts']
    : [];
```

In `apps/web/smoke/smoke.test.ts`, rename the test "sends /login?tournament= to / as well: the slug steers nothing (sportbet keeps it for registration)" to "sends /login?tournament= to / as well: the slug waits for a registration, never steers the sign-in", and add after it:

```ts
  it('sends /register to / (the dialog opens there on Registruotis while registration is open)', async () => {
    const response = await fetch(new URL('/register', base), {
      redirect: 'manual',
    });
    expect(response.status).toBe(302);
    expect(new URL(response.headers.get('location') ?? '', base).pathname).toBe(
      '/',
    );
    await response.text();
  });
```

- [ ] **Step 2: Run them against a local stack**

The E2E stack is CI's (`infra/ci/e2e-stack.sh`, from this commit's images, migrated and seeded as staging is):

```bash
docker build --target web -t sportbet-web:e2e-local .
docker build --target migrate -t sportbet-migrate:e2e-local .
export WEB_IMAGE=sportbet-web:e2e-local MIGRATE_IMAGE=sportbet-migrate:e2e-local
url="$(infra/ci/e2e-stack.sh up sportbet-e2e-local)"
mailpit="$(infra/ci/e2e-stack.sh mailpit sportbet-e2e-local)"
E2E_BASE_URL="$url" E2E_MAILPIT_URL="$mailpit" pnpm test:e2e
infra/ci/e2e-stack.sh down sportbet-e2e-local
```

Expected: every spec passes, `register.spec.ts`'s two tests and `sign-in.spec.ts`'s three among them; `down` leaves no container (`docker ps --filter name=sportbet-e2e-local` lists nothing). If the images cannot be built on this PC, say so in the hand-off; CI's `e2e` job (Task 16) runs them.

Run: `pnpm typecheck && pnpm lint`
Expected: clean.

- [ ] **Step 3: Hand to the lead**

Files: `e2e/register.spec.ts`, `e2e/sign-in.spec.ts`, `playwright.config.ts`, `smoke/smoke.test.ts`. Commit message: `test(e2e): register at 390 and 1280 with a mailed code, land signed in in the open tournament; /register smoke (#18)`.

---

### Task 14 (lead, with the owner): A second allowed recipient on staging

**Files:** none. Done before Task 16's push: the deploy that push starts reads the new list.

- [ ] **Step 1: The instruction (one message; wait for "done")**

> On staging, codes are mailed only to the addresses in `MAIL_ALLOWED_RECIPIENTS`. To register a second test account there, please add a second address of yours: in vercel.com open the sportbet_new project, Settings, Environment Variables, edit `MAIL_ALLOWED_RECIPIENTS` (Production) and change its value from your address to your address, a comma, and a plus-address of it - for example `you@gmail.com,you+bandymas@gmail.com` (no spaces needed; mail to the plus-address lands in your own inbox). Save, and tell me "done" - never paste the value to me.

- [ ] **Step 2: Check the name is still there** (names only; never read a value back): list the project's Production variables (the Vercel tool `filter_project_envs`, or `vercel env ls production`) and confirm `MAIL_ALLOWED_RECIPIENTS` is listed. The value takes effect with the next deploy (Task 16).

---

### Task 15 (lead): The records

**Files:**
- Modify: `CLAUDE.md` (the address-identity bullet)
- Modify: `docs/owner-rulings.md` (the answers that are rulings)

- [ ] **Step 1: `CLAUDE.md`**

In the bullet that begins "An email address is an identity (sportbet #41)", replace "`email_fold()` / `foldEmail` is the key of the unique index that refuses a second spelling, never a lookup;" with "`email_fold()` / `foldEmail` is the key of the unique index that refuses a second spelling, and registration's uniqueness check (`isEmailRegistered`), never a lookup;", and replace "(`__Host-sb_session`, `__Host-sb_signin`, `__Host-sb_signin_open`)" with "(`__Host-sb_session`, `__Host-sb_signin`, `__Host-sb_signin_open`, `__Host-sb_register`, `__Host-sb_intended`), each sealed value bound to its purpose (`apps/web/src/server/sealed.ts`)". Add after that bullet:

```
- Joining a tournament is decided by `joinTournament`
  (`packages/domain/src/joining/`) and written only by
  `registerForTournament` (`packages/db/src/joining/`): rows inserted where
  missing, a late joiner's fill-ins scored through
  `recalculateUnderRuleSet`. An account is created only by `createAccount`,
  in one transaction with its settings and its tournament.
```

- [ ] **Step 2: `docs/owner-rulings.md`**

Record Q1's and Q4's answers as rulings, numbered on from the last (R-48, R-49 if R-47 is the last), in the "Accounts" section after R-27, each in the file's form: the ruling as a bold sentence, `(slice 4c plan, 2026-10-05)`, what sportbet does, what the new app does. Q2's and Q3's answers are display choices, recorded on #18 only.

- [ ] **Step 3: Commit.** `docs: slice 4c - registration's cookies and joining in CLAUDE.md; R-48, R-49 (#18)`.

---

### Task 16 (lead): Verify everything, review, push, watch CI

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
LC_ALL=C.UTF-8 grep -rnP '[\x{2028}\x{2022}\x{1F600}]' packages apps --include=*.ts --include=*.tsx | grep -v node_modules | wc -l
git diff <gate> -- pnpm-lock.yaml | wc -l
git status --short | wc -l
```

Expected: `Done`; `All matched files use Prettier code style!`; lint silent, `4`; `3`; every suite passes, each with more tests than Task 0 recorded; `0` raw invisible or wide characters; `0` lockfile lines (no new dependency); `0`. The reader is untouched by this slice (`git diff <gate> --stat -- tools/migrate` is empty), so `pnpm test:migrate` need not run.

- [ ] **Step 2: Review.** Run `mp-code-review` against `<gate>..HEAD` (Standards and Spec; the spec is `docs/superpowers/specs/2026-10-05-registration-and-joining-design.md`) and fix what it confirms, each fix its own commit ending with the trailer and `#18`, re-running Step 1 after the last. A new feature landed, so run `improve-codebase-architecture` over `packages/domain/src/joining/`, `packages/db/src/joining/`, `packages/db/src/account/registration.ts`, `apps/web/src/server/register/` and `apps/web/src/components/shell/`, present its report to the owner, and act on no candidate unless the owner picks one. `security-reviewer` reviews every task marked **(sensitive)** against sportbet's Security rules and #16's notes - in particular: purpose scoping (a registration code never signs in, a sign-in code never registers), the dummy hash and the atomic claim, the throttles' keys and order, the honeypot, the origin checks, the sealed cookies' purpose binding and flags, the taken checks and the advisory lock, the transaction's rollback, nothing personal in a log, and decision 10 (R-27 outside `RuleSet`) with the architect.

- [ ] **Step 3: Push, and watch the run to the end** (Task 14 done first)

```bash
git push origin main
sleep 10
run=$(gh run list --branch main --limit 1 --json databaseId --jq '.[0].databaseId')
gh run watch "$run" --exit-status
```

Expected: `check` (unit, component, db, feature), `image`, `e2e` (the sign-in and registration journeys at both widths, against Mailpit), `staging` (migration 0008 on Neon, the seeded account, every sign-in setting found) and `smoke` (`/login` and `/register` 302, `/logout` GET 405, and the E2E suite without the Mailpit journeys). A failing job: read it with `gh run view "$run" --log-failed`, fix the cause, commit, push again; never re-run a failed job to make it pass.

- [ ] **Step 4: Report on #18.** Comment with the green run's link, the test counts per suite, the design decisions at the top of this plan and the owner's answers to Q1 to Q4; tick each criterion that holds with its evidence (the named tests below). Leave #18 open for Task 17.

---

### Task 17 (the owner, with the lead): Registering on staging

- [ ] **Step 1: The instruction the lead sends (one step)**

> Registration is on staging: (the `staging` job's URL, from Task 16's run). Please open it in a private window, press "Prisijungti", choose the "Registruotis" tab, and fill it in with a new username, your name and the plus-address you added (for example `you+bandymas@gmail.com`), then press "Registruotis". A code should arrive within a minute (look in spam too). Type it and press "Užbaigti registraciją": you should be signed in as the new account, with Euroleague 2026/27 in the rail. Tell me "works", or what happened instead.

- [ ] **Step 2: Close #18** once the owner says it works (tick "On staging the owner registers a second account and lands signed in, in the open tournament", quoting the answer). A problem the owner names becomes a fix on this plan's files, verified as in Task 16 Step 1, pushed, and Step 1 again.

---

## Self-review against the spec

**Spec coverage** (each spec line, and the task and named test that hold it):

| Spec | Task | Named tests |
|---|---|---|
| `joinTournament` refused unless open under the rule set (`isRegistrationOpenAt`) | 3, 4 | `registration (sportbet): open until the first game tips off...`, `registration (ruled): open until round 5 starts (R-8)`, `joining: refused while the tournament takes nobody...`, `joining (sportbet): refused from the first game on, and nothing is written` |
| Idempotent for a player already in | 3, 4 | `joining again fills nobody in...` (domain and db), `joining: a newcomer gets their place ... once` |
| `tournament_players`, a blank prediction per game, a standings row per team, one transaction; no survival row | 3, 4 | `joining: a newcomer gets a blank row for every game and a standings row for every team`, the db twin |
| Late joiner filled in under `ruledRules` through `recalculateUnderRuleSet`; nothing more under `sportbetRules` | 3, 4 | `late joiner (ruled): ... (R-9)` (domain and db, scored under `ruled` only), `late joiner (sportbet): never filled in...` |
| League membership waits for slice 12 | - | nothing written for leagues |
| Which tournament: `?tournament=` if open, else R-27, else none; the slug in the pending registration, never the sign-in | 3, 5, 6, 8, 11 | `joining (R-27): ...` (4 tests), `registration: joins the ?tournament= one...`, feature `the tournament a new account joins` (3 tests), `/login?tournament= ... carries nothing into the sign-in`, `with no tournament at all, the account joins none` |
| `/register` to `/` on the Registruotis tab with a valid slug; closed: home, no tab | 9, 10, 11 | `registration: sends a guest to / with the dialog to open on its Registruotis tab...`, `keeps no ?tournament= that is not a slug`, `registration (closed): /register goes home...`, `draws no tab and no register form while registration is closed` |
| Step one: Server Action, same-origin; honeypot; required and max 255; email normalized and refused if registered (folded index plus exact check) | 1, 5, 8, 11, 12 | `registration: takes a username...`, the `refuses %s with its text` table (10 cases), `a filled honeypot goes home silently`, `isEmailRegistered`, `the register-request form posted from another site is refused`, `step one with no Origin is refused...` |
| Answers and slug in a signed short-lived `__Host-` cookie; code mailed after the response; resend posts step one again | 6, 7, 8, 11 | `the pending registration cookie` (4 tests), `the form creates nothing...`, `a resend is step one again...`, `resends by posting the four answers again` |
| Step two: dummy hash, one message; deadline re-checked; one transaction for player, settings (level 0, `lt`) and the join | 5, 8, 11 | `a wrong code, a sign-in code for the address and an expired code all get the one answer`, `the deadline passing between the two steps...`, `registration: creates the player and their settings...`, `the code creates the account, its settings and its place...` |
| Taken (username folded as the collation) - sportbet's text, pending cleared; other failure - its text, kept | 1, 5, 8, 11 | `foldUsername` (10 cases), `the username %s is taken...`, `an address registered between the two steps...`, `a username taken between the two steps...`, `any other failure is no naming conflict...`, `a failure partway rolls the whole account back`, `a collision that is no naming one is thrown...` |
| Success signs in through the session module, audit `register`, home | 2, 8, 11 | `records a registration as 'register'...`, the journey test (`audit_logins`, the rail) |
| Throttles as 3eb95e7, in the domain beside 4b's, sportbet's refusal text; cancel clears | 2, 9, 12, 11 | `the registration throttles` (5 domain tests), the 6 feature throttle tests, `"Atgal" forgets the pending registration` |
| The dialog's tabs and register code step with sportbet's texts; the mail | 7, 10 | `the tabs and the register form` (6 tests), `the register code step` (4 tests), `carries sportbet's subject, the code, its lifetime...` |
| Admin level 0 for every new account | 5, 11 | `creates the player and their settings (admin level 0, lt)` |
| R-45: no IP in the audit | 2 | `records a registration as 'register' ..., without the IP (R-45)` |
| E2E at 390 and 1280 with the code from Mailpit | 13 | `register.spec.ts` (2 tests) |
| Done: the owner registers a second account on staging | 14, 17 | the owner's answer |

**Placeholder scan:** every code step shows its code; the two points that wait on the owner (Q1 to Q4) carry the proposal's code and name the lines an other answer changes.

**Type consistency:** `RegistrationAnswers` (Task 1) is what `PendingRegistration` extends (Task 6) and `NewAccount` copies (Task 5); `JoinCandidate` and `tournamentToJoin` (Task 3) are what `loadJoinCandidates` returns and `createAccount` calls (Tasks 4, 5); `registerForTournament` takes a `TournamentJoin` and returns `Joined` (db), named apart from the domain's `Joining` so both packages' exports can sit side by side; `RegisterState`, `RegisterAction` and `EMPTY_REGISTER_VALUES` (Task 8) are what `ShellSignIn.registerAction` (Task 9) and `RegisterPane` (Task 10) use; `SignInStep`'s `register-code` (Task 9) is what `dialogStep` returns and `SignInDialog` draws; the test ids `register-request`, `register-confirm`, `register-cancel`, `register-resend` and the pane ids `loginPane`, `registerPane`, `loginTab`, `registerTab` are the same in Tasks 10 to 13.
