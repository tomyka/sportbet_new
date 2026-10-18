# Slice 19: Google sign-in and registration with Google - Implementation Plan

> **For agentic workers:** In this repo the team runs it (`docs/agent-team.md`): backend-dev takes tasks 1-4 and 11's db part, web-dev 5-9, devops 10, qa and architect review each, only the lead commits. **Tasks marked [SR] also go to the security reviewer before their commit.** Steps use checkbox syntax.

**Goal:** `GET /auth/google` and `/auth/google/callback` with sportbet's behaviour (by `google_id`, by verified exact address, else create while registration is open), the dialog's "Prisijungti su Google" button, the audit methods and the profile line (#40).

**Architecture:** The domain decides (`googleSignInPlan`, `googleIdentity`, the username and name rules, the throttles). `packages/db` stores `players.google_id` and writes it only through `createAccount` and `linkGoogleId`. `apps/web` runs the authorization code flow with PKCE, `state` and `nonce` by hand behind an `OAuthProvider` port (live adapter, fixture adapter), keeps its browser binding in one sealed `__Host-sb_google` cookie, and ends like the code flow ends (`startSession`, `recordLogin`, the guarded return). No library; the id_token's claims are checked on the back channel's response (spec decision 1).

**Tech Stack:** TypeScript, Zod, Drizzle on Postgres 18, Next.js route handlers, `node:crypto`, Vitest (unit, db, component, feature), Playwright.

**Spec:** `docs/superpowers/specs/2026-10-18-google-sign-in-design.md`. **Depends on:** slices 4b/4c (sign-in, registration), 17 (profile card), 13/14 (admin audit labels). All on `main`.

## Decisions taken while planning (record in the spec in Task 13)

1. The spec's five owner questions have defaults; Tasks 1 to 9 are written on those defaults. An answer that differs changes: Q1 (a or c) the reader task (14, optional) and Task 1's backfill note; Q2 = no drops Task 4's enum migration; Q3 = overwrite changes `linkGoogleId` (one `WHERE`) and its test; Q4 = message adds one flash kind and one text; Q5 = no drops one list item.
2. `createAccount` is extended, not copied (spec 6). Its existing tests stay; the Google door adds cases.
3. The fixture provider is the CI E2E's Google; staging uses the real one and is checked by hand (spec 2).
4. The Google button is `<a href>` plus a static `google-g.svg`, so `token-guard.test.ts` is not touched.

## File structure

| File | Responsibility |
| --- | --- |
| `packages/domain/src/account/google-id.ts` (create) | `googleIdInvariant`, `GoogleId` |
| `packages/domain/src/account/google-sign-in.ts` (create) | `googleIdentity`, `googleSignInPlan`, `googleUsernameBase`, `googleNameParts`, `freeUsername` |
| `packages/domain/src/account/google-throttle.ts` (create) | `googleStartLimits`, `googleCallbackLimits` |
| `packages/domain/src/account/session.ts`, `index.ts` (modify) | audit methods, exports |
| `packages/db/src/player/players.ts` (modify), migrations (generate) | `google_id`, unique, CHECK; enum values |
| `packages/db/src/account/google.ts` (create) | `findAccountByGoogleId`, `linkGoogleId` |
| `packages/db/src/account/registration.ts` (modify) | the Google door of `createAccount` |
| `packages/db/src/entries/account.ts` (modify) | exports |
| `packages/db/test/google.test.ts` (create); `registration.test.ts`, `account-deletion.test.ts`, `invariant-checks.test.ts` (modify) | db tests |
| `apps/web/src/env.ts` (modify) | `googleEnv` |
| `apps/web/src/server/cookies.ts`, `flash.ts` (modify) | `GOOGLE_COOKIE`, three kinds |
| `apps/web/src/server/google/*.ts` (create) | port, live, fixture, pending, pkce, start, complete, texts |
| `apps/web/src/app/auth/google/{route.ts,callback/route.ts,fixture/route.ts}` (create) | the routes |
| `apps/web/src/components/shell/sign-in-dialog.tsx`, `shell-for.ts`, `ShellView` (modify) | button, `googleEnabled` |
| `apps/web/src/components/profile/sign-in-card.tsx`, admin audit labels (modify) | "per Google"; two labels |
| `apps/web/public/img/google-g.svg` (create) | the mark |
| `apps/web/tests/feature/google.test.ts`, `e2e/google.spec.ts` (create) | routes, journey |
| `infra/compose/*.yml`, secrets (modify) | env |
| `CLAUDE.md`, the spec (modify) | write paths, cookie |

Run from the repo root. Domain: `pnpm --filter @sportbet/domain test -- <file>`; db: `pnpm --filter @sportbet/db test -- <file>` (Docker); component: `pnpm --filter @sportbet/web test:component -- <file>`; feature: `pnpm --filter @sportbet/web test:feature -- <file>`; e2e: `pnpm test:e2e`.

---

### Task 0: Owner steps - the Google OAuth client (owner; the lead hands them out one at a time)

Nothing is built that needs these until Task 10 and the staging check; Tasks 1 to 9 run on the fixture without them.

1. Open https://console.cloud.google.com/ signed in as the Google account that owns sportbet's current client, and pick the **same project** in the top bar (its consent screen then applies; a new project would need a new consent screen).
2. Left menu, **APIs & Services > OAuth consent screen** (now "Google Auth Platform > Audience / Branding" in the newer console). Check: user type **External**; publishing status **In production** (in "Testing" only listed test users can sign in and the refresh lasts 7 days); scopes only `openid`, `.../auth/userinfo.email`, `.../auth/userinfo.profile` (non-sensitive, no verification needed). Nothing to change if sportbet already works.
3. **APIs & Services > Credentials > Create credentials > OAuth client ID.** Application type **Web application**. Name `sportbet-new`. (A new client beside the old one: the old app stays untouched during the fallback window and the old client can be deleted when it retires. Reusing the old client also works if the owner prefers: add the URIs below to it and skip the creation; say which.)
4. **Authorised JavaScript origins:** leave empty (a server-side flow needs none).
5. **Authorised redirect URIs**, exactly these, each character for character (a mismatch is Google's `redirect_uri_mismatch` page):
   - `https://sportbet.lt/auth/google/callback` (production, and what the new app uses after switch-over; DNS may still point at the old app today, which does not matter to Google)
   - `https://new.sportbet.lt/auth/google/callback` (the production-host rehearsal)
   - `https://new.staging.sportbet.lt/auth/google/callback` (staging)
   - `http://localhost:3000/auth/google/callback` (local development; Google allows http for localhost only)
6. **Create.** Google shows the client id and the client secret once; copy both into the owner's password manager. **Never paste the secret into a chat, an issue, a commit or a log.**
7. Put them where the app reads them, by the owner's hands: GitHub secrets `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET` (CI and the deploy), Vercel environment variables of staging with the same names, and at switch-over the production host's env file (devops, Task 10, says where). `APP_URL` is already set per environment.
8. Tell the lead "done" (not the values).

### Task 1: The domain **[SR]**

**Files:** Create `packages/domain/src/account/{google-id,google-sign-in,google-throttle}.ts` and `.test.ts`; modify `session.ts`, `index.ts`.

- [ ] Tests first, then implement:
  - `googleIdInvariant`: accepted `'104520385693274017345'`, `'a'*255`, `'a_b-C'`; refused empty, 256, a space, a quote, `'1;2'`. `GoogleId` through its factory (a `Result`).
  - `googleIdentity({ sub, email, emailVerified, name })` -> `Result<GoogleIdentity, 'invalid'>`: `sub` invalid refuses; `emailVerified` is `true` only for the boolean `true` (`'true'`, `1`, `undefined` are false); an address failing `emailInvariant` after `normalizeEmail` becomes `email: null`; `name` null or non-string becomes null.
  - `googleSignInPlan({ identity, bySub, byEmail, registrationOpen })`: found by sub -> `sign-in` (even unverified, even closed, even with no address); else not verified (or no address) -> refuse `unverified`; else `byEmail` -> `link`; else closed -> refuse `registration-closed`; else `register`. One test per row of the spec's list, order proved by a case where two rows would both apply.
  - `googleUsernameBase`: `'jonas@x.lt'` -> `jonas`; local part empty -> `zaidejas`; a 300-character one cut so `base + '1000'` fits 255; a local part of ignorable-only characters -> `zaidejas` (the `usernameInvariant` refuses it).
  - `googleNameParts`: `null` -> `['', '']`; `'Jonas'` -> `['Jonas','']`; `'Jonas Jonaitis'`; `'Jonas Petras Jonaitis'` -> name `Jonas`, surname `Petras Jonaitis`; surrounding spaces trimmed; each part cut to 255 characters (an astral character counts as one).
  - `freeUsername(base, isHeld)`: free -> base; held -> `base2`; skips held `base2`; gives up after `GOOGLE_USERNAME_SUFFIX_LIMIT` (returns a refusal the db turns into a throw).
  - `googleStartLimits(ip)`, `googleCallbackLimits(ip)`: keys, counts, window, order.
  - `AUDIT_LOGIN_METHODS` equals `['email_code', 'register', 'google', 'register_google']` (update `session.test.ts`; the comment names slice 19).
- [ ] Commit - `feat(domain): Google sign-in - the identity, the plan, the username and name rules, the throttles (#40)`

### Task 2: Schema and the reads **[SR]**

**Files:** `packages/db/src/player/players.ts`; generate `pnpm --filter @sportbet/db db:generate --name google_id` and `--name audit_login_google`; create `packages/db/src/account/google.ts`, `test/google.test.ts`; modify `entries/account.ts`, `invariant-checks.test.ts`.

- [ ] `players.google_id text` nullable, `players_google_id_unique` (a unique constraint, exact text), CHECK `players_google_id_format` from `googleIdInvariant` in `playerInvariantChecks` (proved by `invariant-checks.test.ts`). The comment on `players` ("Google ids wait for 4c") is updated.
- [ ] `findAccountByGoogleId(db, googleId)` -> `{ player } | undefined`, exact equality, parsed. `linkGoogleId(db, { player, googleId })` -> `Result<'linked', 'already-linked' | 'taken'>`: one `UPDATE ... WHERE id = $1 AND google_id IS NULL RETURNING id`; no row updated and the row's `google_id` already equals the same `sub` is `linked` (idempotent), differs or another value is `already-linked`; a `players_google_id_unique` violation is `taken` (`violatedUnique`).
- [ ] Tests first: found / not found / a `sub` differing only in case is another `sub`; link a fresh account; link twice with the same `sub` (ok), with another (`already-linked`, row unchanged); a `sub` held by another account (`taken`, nothing written); two linking at once leave one winner; a CHECK refusal for a quote or a 256-character `sub`.
- [ ] Commit - `feat(db): players.google_id; findAccountByGoogleId and linkGoogleId (#40)`

### Task 3: `createAccount`'s Google door **[SR]**

**Files:** modify `packages/db/src/account/registration.ts`, `test/registration.test.ts` (or `account.test.ts`), `account-deletion.test.ts`.

- [ ] The input is `NewAccount | NewGoogleAccount` (`{ google: { sub, email, name }, tournament }`). Under the registration lock the address is checked (`isEmailRegistered`, the fold) and the `sub` too (`findAccountByGoogleId`: found -> `'taken'`), the username derived by `freeUsername` with `isUsernameHeld`, then the one `insertPlayer` (with `googleId`) and the same settings row and `registerForTournament`. A violation of `players_google_id_unique` is `'taken'` too (add it to `TAKEN`). Exhausting the suffix limit throws.
- [ ] Tests first: new Google account with a free username, a taken one (`jonas2`), a suffix skipping a held `jonas2`, one held by fold (`Šarūnas` held, local part `sarunas` -> `sarunas2`), the base cut at 255; name and surname split; settings row (role `player`, locale `lt`); joined to the open tournament with its fill-ins scored exactly as a registration's (reuse the registration test's world); the intended tournament honoured; a folded address (`zukauskas@` against stored `žukauskas@`) -> `'taken'`, nothing written; a stored address in another case is the same address -> `'taken'`; two creations at once for one address, and for one `sub`, leave one account; the existing form-door tests untouched.
- [ ] `account-deletion.test.ts`: after `deleteAccount` the player's `google_id` is free (`linkGoogleId`/`createAccount` with the same `sub` succeeds); `player-fk-coverage.test.ts` stays green (no key added).
- [ ] Commit - `feat(db): createAccount takes a Google sign-up - username derived under the lock (#40)`

### Task 4: Audit methods in the admin audit **[SR]** (needs owner answer 2)

**Files:** the enum migration from Task 2; `apps/web/src/components/admin/audit-tables.tsx` (+ test), `packages/domain/src/admin/audit-page.ts` (reads `AUDIT_LOGIN_METHODS`, no change expected).

- [ ] Labels "Google" and "Registracija (Google)" next to `register: 'Registracija'`; the audit page's component test lists all four; the admin audit feature test shows a `google` row.
- [ ] If the owner answers no to Q2: drop the two enum values (`AUDIT_LOGIN_METHODS` unchanged) and record Google logins as `email_code` / `register`.
- [ ] Commit - `feat(web): the audit page names the Google methods (#40)`

### Task 5: Env, cookie, flash kinds, texts **[SR]**

**Files:** `apps/web/src/env.ts`, `server/cookies.ts`, `server/flash.ts`, `server/google/texts.ts` (+ tests).

- [ ] `googleEnvSchema` read key by key (`GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET`, `GOOGLE_PROVIDER`, `APP_URL`, `SPORTBET_ENV`), `googleEnv(source = process.env)` -> `{ clientId, clientSecret, redirectUri, provider } | undefined`, logging `google: not configured (<names>)` by name only. Rules: where `SPORTBET_ENV` is staging or production the id and secret are required and `GOOGLE_PROVIDER` is optional, `live`, and `fixture` is refused; in ci and local `GOOGLE_PROVIDER` is required (`live` or `fixture`) and the id and secret are required only for `live`. `redirectUri` = `${APP_URL}/auth/google/callback` (APP_URL validated as `reminderEnv` does, https where deployed). Tests: each combination, a non-plain-object source, no value in any log line, **`env()` still parses with all four Google keys missing** (the site never stops for them).
- [ ] `GOOGLE_COOKIE` (`__Host-sb_google`, flags as the others, Max-Age 600); `cookies.test.ts` gains its row.
- [ ] Flash kinds `google-failed`, `google-unverified`, `google-registration-failed` (error tone, shell alert); `flash.test.ts`: round trip, a forged or other-purpose value opens as nothing.
- [ ] `texts.ts`: sportbet's three strings, exact.
- [ ] Commit - `feat(web): Google's env, cookie, flash kinds and texts (#40)`

### Task 6: PKCE, the pending cookie, the provider port **[SR]**

**Files:** create `apps/web/src/server/google/{pkce,pending,provider,google-fixture}.ts` (+ tests).

- [ ] `pkce.ts`: `newVerifier()` (43 to 128 URL-safe characters from `randomBytes(48)`), `challengeOf(verifier)` (base64url SHA-256, the RFC 7636 appendix B vector in the test), `newState()`, `newNonce()` (each 32 random bytes, base64url). Tests: the RFC vector, lengths, two calls differ.
- [ ] `pending.ts`: `mintPending(jar, secret, now)` seals `{ state, nonce, verifier, at }` for purpose `google-oauth`; `readPending(jar, secret, now)` -> value or null for missing, forged, another purpose (a `__Host-sb_flash` value in this cookie's place), another key, malformed payload, older than 600 s; `clearPending(jar)` with the cookie's own flags and Max-Age 0. Tests per refusal.
- [ ] `provider.ts`: the `OAuthProvider` port; `chooseProvider(googleEnv)` returns live or fixture.
- [ ] `google-fixture.ts`: `authorizationUrl` -> `/auth/google/fixture?state=..&nonce=..&challenge=..`; `exchange` verifies the PKCE pair the fixture signed into its code and the nonce, returns the identity the code carries (signed with `AUTH_SECRET`, purpose `google-fixture-code`, so a test cannot forge by accident and a stray code is refused). Identities offered: new person, existing address, unverified address, no address, a `sub` of a linked account.
- [ ] Commit - `feat(web): PKCE, the sealed state cookie and the provider port with its fixture (#40)`

### Task 7: The live provider **[SR]**

**Files:** create `apps/web/src/server/google/google-live.ts`, `.test.ts`.

- [ ] Tests first, with an injected `fetch`: every claim refused in turn (spec Testing list), a non-200, a redirect response, a timeout, an over-64 KB body, a non-JSON body, a malformed id_token; the request's method, URL, content type and form fields (including `code_verifier` and `redirect_uri`; the secret in the body, never the URL); `authorizationUrl` carries `response_type=code`, `client_id`, `redirect_uri`, `scope=openid email profile`, `state`, `nonce`, `code_challenge`, `code_challenge_method=S256`, no `access_type`, and `prompt=select_account` is **not** added (sportbet's Socialite default does not). A test that reads the source of every file under `apps/web/src` and finds `accounts.google.com` and `oauth2.googleapis.com` only here.
- [ ] Implement per spec decisions 1, 3 and 18. `identityFromIdToken` pure and exported for its own tests; the HTTP part thin.
- [ ] Commit - `feat(web): the live Google provider - authorization code, PKCE, the id_token's claims judged (#40)`

### Task 8: The use cases and the routes **[SR]**

**Files:** create `server/google/{start,complete}.ts`, `app/auth/google/{route.ts,callback/route.ts,fixture/route.ts}`; modify `server/shell-for.ts`.

- [ ] Feature tests (`tests/feature/google.test.ts`) first: all of the spec's feature list, each by sportbet's test name where one exists (`GoogleAuthTest`: redirect; existing user signs in; email match links and signs in; new user created; remember (the session is 90 days, R-44); session id is new in each of the three; registration closed; folded address does not adopt; folded address refused creation; another-case address matches; username suffixing x3; unverified does not adopt; missing claim is unverified; unverified does not create; already linked still signs in), plus the new refusals.
- [ ] `start.ts`: signed-in -> 303 `PLAYER_HOME`; `googleEnv()` missing -> failure flash 303 `/` (and the log line); throttle (`googleStartLimits`) -> same; mint pending; 303 to `provider.authorizationUrl`; `Cache-Control: no-store`.
- [ ] `complete.ts`, in this order: throttle (`googleCallbackLimits`); `error` query or a missing/oversized `code` -> failure; `readPending` + timing-safe `state` equality, then **clear the cookie** (every outcome from here); only then `provider.exchange`; `googleSignInPlan` with `findAccountByGoogleId`, the exact-address account (`findAccountByEmail`) and `registrationOpenAt(at)`; act: sign-in; link (`linkGoogleId`, a refusal -> failure) then sign-in; register (`createAccount` Google door; `'taken'` or any failure -> `google-failed` / `google-registration-failed` as sportbet; `unverified` -> `google-unverified`; closed -> 303 `/` silently, or the owner's message); end as spec decision 12. `logInfo` by outcome kind; `console.error` by `errorKind`. A thrown error anywhere answers the failure flash, never a 500 page.
- [ ] `fixture/route.ts`: 404 unless `chooseProvider` is the fixture; renders a small page of buttons (a form per identity) that 303 back to the callback with `code` and the posted `state`. Lithuanian text not needed (test-only), marked so in a comment.
- [ ] `shell-for.ts`: `googleEnabled` from `googleEnv() !== undefined`.
- [ ] Commit - `feat(web): /auth/google and its callback - sign in, link by verified address, register (#40)`

### Task 9: The dialog, the profile line, the mark

**Files:** `components/shell/sign-in-dialog.tsx` (+ test), `components/shell/` view types, `components/profile/sign-in-card.tsx` (+ `profile-view.test.tsx`), `public/img/google-g.svg`.

- [ ] Component tests first: login pane with `googleEnabled`: divider "arba", a link to `/auth/google` (an `<a>`, not a form), the `<img>` of `/img/google-g.svg` with empty alt, the text "Prisijungti su Google"; without it, none of these; the register pane never has it; the card's list is "per Google" then the code, with "Slaptažodžių nebenaudojame. Prisijungti galite dviem būdais:" (Q5 = no keeps today's text).
- [ ] Implement; tokens only (`token-guard.test.ts` stays green without a new exception); the svg is Google's brand mark as sportbet's markup has it.
- [ ] Commit - `feat(web): the Google button in the sign-in dialog and "per Google" in the profile (#40)`

### Task 10: Infrastructure (devops; secrets are the owner's)

- [ ] `infra/compose/production.yml` and `staging.yml`: `GOOGLE_CLIENT_ID: ${GOOGLE_CLIENT_ID:?}`, `GOOGLE_CLIENT_SECRET: ${GOOGLE_CLIENT_SECRET:?}` (no `GOOGLE_PROVIDER`: unset means live there); `e2e.yml`: `GOOGLE_PROVIDER: fixture`. The production host's env staging script (`infra/host`) and `docs/production-env.md`-equivalent gain the two keys; `.github/workflows` pass the secrets to the staging deploy; a CI check that fails the production deploy when either is missing (as `AUTH_SECRET`'s).
- [ ] Local development and CI's feature job set `GOOGLE_PROVIDER=fixture` (the "required and explicit" rule); the e2e stack's Playwright config likewise.
- [ ] Ask the owner (through the lead) before touching Vercel settings or GitHub secrets.
- [ ] Commit - `chore(infra): Google's client id and secret for staging and production, the fixture for CI (#40)`

### Task 11: E2E

- [ ] `apps/web/e2e/google.spec.ts` at 390 and 1280 against the fixture (spec Testing list): new visitor registers through the button and lands on `/main`; signs out; same identity signs in; an account made by code sign-in is linked by address and signs in; unverified identity lands on `/` with the text; the login pane shows the button, the register tab does not.
- [ ] Commit - `test(e2e): the Google journey on the fixture provider (#40)`

### Task 12: Security review **[SR]**

- [ ] The security reviewer reads Tasks 1 to 3, 5 to 8 together against sportbet's Security section (issue 259 and #41) and `CLAUDE.md`'s identity, cookie and session rules, and answers each of these in writing:
  - No path signs anyone in on an address Google did not call verified, except the `sub` match; no path writes `email`.
  - The callback makes no request to Google before the cookie, its purpose, its age and `state` are valid; the cookie is cleared on every outcome; a replay finds nothing.
  - PKCE verifier and nonce are random, bound to this browser, never logged, never in a URL; the redirect URI cannot be influenced by the request.
  - The claims check refuses each of: wrong issuer, wrong or extra audience, expired, wrong nonce, missing or non-boolean `email_verified`; the choice not to verify the signature (spec 1) is acceptable on this channel, or the JWKS check is added.
  - The fixture cannot be selected, reached or issued in staging or production, by env or by a stray code.
  - `createAccount` cannot produce two accounts for one address or one `sub`; the link is atomic and never overwrites; no lock-order change (a single-row update).
  - Throttles hold; no secret, `sub`, address, name, code or token in a log, a flash or a URL after the callback.
  - A missing or bad Google env stops nothing but the button.
  Findings fixed before Task 13.

### Task 13: Docs

- [ ] **CLAUDE.md** (the lead applies; this paragraph after the joining/registration ones, and the cookie list gains `__Host-sb_google`):

```markdown
- Google sign-in (slice 19) is the authorization code flow with PKCE, `state`
  and `nonce`, written by hand behind `OAuthProvider`
  (`apps/web/src/server/google/`): `liveGoogleProvider` is the only code naming
  Google's hosts, `fixtureGoogleProvider` the one tests and the CI E2E use,
  chosen by `GOOGLE_PROVIDER` (optional and `live` where `SPORTBET_ENV` is
  staging or production, where `fixture` is refused; required and explicit in
  ci and local). The browser binding is the sealed `__Host-sb_google` cookie
  (purpose `google-oauth`): the callback asks Google nothing until it, and the
  query's `state`, check out, and clears it on every outcome. What is decided
  is `googleSignInPlan` (`packages/domain/src/account/google-sign-in.ts`), in
  sportbet's order: a `sub` already linked signs in; an unverified address
  (only the JSON boolean `true` verifies) is refused; the exact-address
  account is linked and signs in; else, while registration is open, an account
  is made. `players.google_id` is written only by `createAccount` (which
  derives the username under the registration lock) and `linkGoogleId`
  (`packages/db/src/account/google.ts`, never overwriting, one row, no place in
  the lock order); Google never writes `email`, `name` or `surname` of an
  existing account. The redirect URI is `APP_URL` + `/auth/google/callback`,
  never from the request. `googleEnv()` is read by the Google routes alone
  (like `reminderEnv`): a missing or bad value stops no other page.
```

  The audit-methods note in the accounts paragraph gains `google` and `register_google`.
- [ ] **The spec:** the owner's answers become rulings R-135 onward in `docs/owner-rulings.md` and the questions section says "answered"; the planning decisions above.
- [ ] Commit - `docs: slice 19 - Google sign-in's write paths and cookie in CLAUDE.md; the owner's rulings (#40)`

### Task 14 (only if owner answers Q1 b or c): the reader

- [ ] backend-dev: `google_id` into `READ_COLUMNS.users` (`tools/migrate/src/read-columns.ts`, its test and comment, `CLAUDE.md`'s reader sentence naming the owner's consent and the date), mapped into `players.google_id` (or a boolean for c); the reader counts rows whose id fails `googleIdInvariant` and never fixes them (like the address); the synthetic dump gains a linked player; the parity run is unaffected (no stored point moves). **[SR]**

---

### Finish

- [ ] `pnpm lint && pnpm typecheck && pnpm test:unit && pnpm test:db && pnpm test:component && pnpm test:feature` all green; the quality gate (`node quality/gate.mjs all`) including mutation of the changed files: the claim checks and the plan's order are mutation-heavy, so each refusal has its own assertion.
- [ ] `mp-code-review` from the slice's base; `improve-codebase-architecture` on the new files (a new feature landed).
- [ ] Push; CI deploys staging; the owner checks the done-means with the real Google; close #40.
