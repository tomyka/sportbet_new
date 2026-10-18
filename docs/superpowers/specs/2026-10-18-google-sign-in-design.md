# Slice 19: Google sign-in and registration with Google

Issue #40, the parity gap that slice 4c split off as "4d" and no issue followed:
`GET /auth/google` and `GET /auth/google/callback`, the "Prisijungti su
Google" button of the sign-in dialog, the audit methods `google` and
`register_google`, and the "per Google" line of the profile's sign-in card.
Security-sensitive: every task marked **[SR]** in the plan goes to the
security reviewer. Status: **draft; the owner's questions are in the last
section, each with its default. Nothing below is a ruling until answered.**

Binding: decisions 5, 6, 13 and 14; R-8 as reversed by R-128 (registration
closes at the first game's start under both rule sets), R-24 (the address
changes only through the confirmed flow), R-25, R-44 (a session lasts 90 days),
R-45 (no IP in the sign-in record), R-132; issue 259 and #41 of sportbet (the
address is the credential: exact equality, verified claim); the rules in
`CLAUDE.md` (an address is an identity, cookies and sessions only through their
modules, an account is created only by `createAccount`, the emailed-code check,
tokens, Lithuanian text in components, `reminderEnv`'s lazy env, the network
guard and the feed's fail-closed setting).

## The reference

sportbet at the commit production runs. `app/Http/Controllers/Auth/GoogleAuthController.php`
(redirect 23-27; callback 29-146; `freeUsernameFor` 163-176; `addressIsVerified`
185-192), `routes/auth.php:35-36` (both routes inside the `guest` group, no
throttle), `config/services.php:52-56` (`GOOGLE_CLIENT_ID`,
`GOOGLE_CLIENT_SECRET`, `GOOGLE_REDIRECT_URI`), `resources/views/modals/login.blade.php:35-41`
(the divider "arba" and the button), `resources/views/userProfile.blade.php:147`
("per Google"), `tests/Feature/Auth/GoogleAuthTest.php` (20 cases: the parity
list the qa role reads), `CLAUDE.md` > Authentication and > Security
(589-603), `docs/production-env.md` (146-155).

What sportbet does, in short (Socialite's authorization-code flow, no PKCE
beyond Socialite's `state`):

1. `GET /auth/google` (guests only; a signed-in visitor is sent home by the
   `guest` middleware) redirects to Google. Scopes: Socialite's defaults,
   `openid profile email`.
2. `GET /auth/google/callback`. Any exception from Socialite (a denied
   consent, a bad `state`, a failed exchange): `/` with the error flash
   "Google prisijungimas nepavyko. Bandykite dar kartą.".
3. **By `google_id`** (`users.google_id` = Google's `sub`): found, the player
   signs in (remembered, session id regenerated), audit `google`, to `main`.
   Done before any address or `email_verified` check on purpose: the address
   was verified once at link time.
4. **Not verified** (`email_verified` in the raw payload is not exactly
   `true`; absent counts as unverified): `/` with "Google paskyros el. paštas
   nepatvirtintas.". Nothing is linked or created.
5. **By address, exact** (`EmailIdentity::firstMatching`, #41): found, its
   `google_id` is **overwritten** with this `sub`, the player signs in, audit
   `google`, to `main`.
6. **Registration closed** (`registrationIsOpen`, no tournament taking
   players): silent redirect to `main` (a guest then lands on the sign-in
   state; no message).
7. **Folded spelling only** (the address `normalize`d collates equal to an
   account's but is not it): `/` with "Google prisijungimas nepavyko. Bandykite
   dar kartą."; nobody is signed in (#41).
8. **Create:** username = the address's local part, suffixed 2, 3, ... until
   no account holds it (a word, "zaidejas", for an empty local part); name =
   Google's `name` split on the first space, surname the rest or empty; one
   transaction with the account, its settings and its tournament
   (`postRegisterActions`: the intended tournament, else R-27's). A failure:
   logged, "Registracijos užbaigti nepavyko. Bandykite dar kartą.". Success:
   signed in, audit `register_google`, to `main`.
9. Audit rows carry the IP in sportbet; here R-45 forbids it.

Differences from sportbet that are not owner questions (they follow from
rulings and decisions already taken): no IP in the audit row (R-45); the
signed-in session is a new session through `startSession` (R-44); the
return path `__Host-sb_return` and the intended tournament
`__Host-sb_intended` are honoured as the code sign-in honours them; the
registration check is R-128's `registrationOpenAt`.

## Lead decisions (technical)

Each is mine to make under "tech choices delegated"; the owner can overrule
any. Those that touch a rule are in the owner's questions instead.

1. **No OAuth library, no JWT library, no JWKS.** The flow is the
   authorization code flow with PKCE (S256), `state` and `nonce`, written
   directly with `fetch` and `node:crypto`. The id_token is taken from the
   direct server-to-server response of Google's token endpoint over TLS,
   authenticated by the client secret and the PKCE verifier; OpenID Connect
   Core 3.1.3.7 allows a client to rely on that channel instead of the
   token's signature, so the JWKS fetch, its cache and the RS256 check are
   not built. What *is* checked on the claims, each with a refusal test:
   `iss` is `https://accounts.google.com` or `accounts.google.com`; `aud`
   equals the client id (when it is a list, it has exactly that one entry
   and `azp` equals it); `exp` is in the future by the app's clock; `iat` is
   not in the future by more than 60 s; `nonce` equals the one this browser
   was given; `sub` is a non-empty string of at most 255 characters;
   `email_verified` is checked as the plan below says, never coerced
   ("true" the string is not `true`). Turned down: `jose` or `openid-client`
   (a dependency for a check this channel already makes), `google-auth-library`
   (heavy, pulls in more than the flow needs), Auth.js (owns sessions and
   cookies, against decision 5's "the session holds who the player is and
   nothing else" and the cookie rules). If the security reviewer wants the
   signature checked as defence in depth, the addition is one function over
   `node:crypto`'s `createPublicKey({ key: jwk, format: 'jwk' })` and a
   cached JWKS fetch, behind the same port; it changes nothing else.
2. **The provider is a port, `OAuthProvider`** (`apps/web/src/server/google/provider.ts`):
   `authorizationUrl({ state, nonce, challenge })` and
   `exchange({ code, verifier, nonce })`, the latter answering
   `Result<GoogleIdentity, 'failed'>`. `liveGoogleProvider` is the only code
   naming Google's hosts (`accounts.google.com`, `oauth2.googleapis.com`),
   chosen as `EUROLEAGUE_FEED` is: `GOOGLE_PROVIDER` is optional and `live`
   where `SPORTBET_ENV` is staging or production, **required and explicit**
   (`live` or `fixture`) in ci and local, so a forgotten setting fails closed.
   `fixtureGoogleProvider` serves tests and the CI E2E: its "consent page" is
   `GET /auth/google/fixture`, a route that answers 404 unless the fixture
   provider is chosen, and a code it issues carries a signed fake identity.
   **`fixture` is refused wherever `SPORTBET_ENV` is staging or production**
   (the env check answers "not configured", the routes 503): a public fixture
   would let anyone sign in as anyone. So the CI E2E uses the fixture, and
   staging is checked once by hand by the owner against the real Google (the
   done-means below). The live adapter takes its `fetch` as a parameter, so
   its tests inject a fake and the network guard stays untouched; the host
   names appear in `google-live.ts` alone, tests included (as `seasonUrl`).
3. **Where the claims are judged.** `identityFromIdToken(claims, expected)` is
   a pure function of the parsed payload (in `google-live.ts`, unit tested per
   claim). The domain never sees a token: it receives a `GoogleIdentity`
   `{ sub: GoogleId, email: EmailAddress | null, emailVerified: boolean,
   name: string | null }`, built by the factory `googleIdentity(...)` (a
   typed `Result`; an address that fails `emailInvariant` after
   `normalizeEmail` becomes `email: null`, which counts as unverified, as
   sportbet's missing claim does). `emailVerified` is `true` only for the
   JSON boolean `true`.
4. **The decision is the domain's** (`packages/domain/src/account/google-sign-in.ts`):
   `googleSignInPlan({ identity, bySub, byEmail, registrationOpen })` answers
   `{ kind: 'sign-in', player }`, `{ kind: 'link', player }`,
   `{ kind: 'register' }` or a refusal, in sportbet's order: sub first (no
   verification asked), then `unverified`, then the exact-address account
   (`link`), then `registration-closed`, then `register`. The folded-spelling
   case is not the plan's: it is `createAccount` answering `'taken'`.
   Also there: `googleUsernameBase(email)` (the local part, "zaidejas" when
   empty, cut so a suffix still fits 255), `googleNameParts(name)`,
   `GOOGLE_USERNAME_SUFFIX_LIMIT` and the throttles.
5. **`players.google_id`** (`text`, nullable, `players_google_id_unique`;
   a `googleIdInvariant` defined once in the domain and listed in
   `playerInvariantChecks`: 1 to 255 characters of `[A-Za-z0-9_-]`, Google's
   `sub` being digits in practice). Written only by `createAccount` (with the
   account) and `linkGoogleId` (`packages/db/src/account/google.ts`), whose one
   statement is `UPDATE players SET google_id = $sub WHERE id = $player AND
   google_id IS NULL`; it holds one row lock and no other lock, so it takes no
   place in the lock order and cannot deadlock `deleteAccount`. A sign-in finds
   an account by `sub` only through `findAccountByGoogleId` (exact equality).
   Google never writes `email`, `pending_email`, `name` or `surname` of an
   existing account: R-24's confirmed flow stays the only way an address moves,
   and the Google link survives it (the `sub` is the key, so a player who
   changes their address here still signs in with the same Google account).
6. **`createAccount` gains the Google door, it does not get a sibling.** Its
   input becomes either today's typed answers or `{ google: { sub, email, name } }`
   with the username *derived under the registration lock*:
   `freeUsername(base, isHeld)` tries `base`, `base2`, `base3` ... by
   `isUsernameHeld` (the collation's fold, one query per try, at most
   `GOOGLE_USERNAME_SUFFIX_LIMIT` = 1000 tries, then it throws: an impossible
   state). The address check, the settings row and `registerForTournament`
   are the same code, so "an account is created only by `createAccount`, in
   one transaction with its settings and its tournament" stays true, and a
   second account is never created for an address that folds onto one
   (`'taken'`). A unique violation on `players_google_id_unique` is `'taken'`
   too (two callbacks racing for one `sub`).
7. **The state is one sealed cookie** `__Host-sb_google` (purpose
   `google-oauth`, `apps/web/src/server/google/pending.ts`, declared in
   `cookies.ts` with the other flags: HttpOnly, Secure, SameSite=Lax, path `/`,
   Max-Age 600 s): `{ state, nonce, verifier, at }`, sealed with
   `sealed.ts`. It is the browser binding that stops login CSRF: a callback
   with no cookie, a forged or other-purpose cookie, one older than ten minutes,
   or a `state` that differs (timing-safe) is refused **before any request to
   Google**. It is cleared on every callback outcome, success or refusal, with
   its own flags and Max-Age 0 (never `cookies().delete()`), so a callback URL
   replayed from history finds no state. Lax is enough: Google's return is a
   top-level GET. The cookie holds no account and no address.
8. **The redirect URI is derived, never read from the request:**
   `${APP_URL}/auth/google/callback`. `APP_URL` is the site's address that
   `reminderEnv` already requires wherever `SPORTBET_ENV` is set; a Host
   header never names it. This replaces the lead's proposed `GOOGLE_REDIRECT`
   (one variable fewer, and a staging or production host cannot point at the
   wrong one); the path equals sportbet's, so at switch-over production's
   address stays the one Google already knows. Overruled by the owner if a
   separate variable is wanted.
9. **Env is read lazily, by the Google routes alone** (`googleEnv()` in
   `apps/web/src/env.ts` beside `reminderEnv`, a `googleEnvSchema` reading
   each key by name from `process.env` because Vercel's edge env object is not
   a plain object; `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET`, `GOOGLE_PROVIDER`
   and `APP_URL`). It is not part of `env()`, so a missing or bad value never
   stops the site: the routes answer the failure flash and log `google: not
   configured (<names>)`, never a value. The sign-in dialog shows the button
   only when `googleEnv()` is configured (the layout asks once per request,
   as it asks `registrationOpenNow`), so a deployment without the keys shows no
   dead button.
10. **Routes.** `GET /auth/google` and `GET /auth/google/callback` are route
    handlers (`apps/web/src/app/auth/google/route.ts`, `.../callback/route.ts`),
    `dynamic = 'force-dynamic'`, `Cache-Control: no-store`, answering a real
    303; the button is a plain `<a href="/auth/google">`, never a `Link`, so
    nothing prefetches it. A signed-in visitor (`currentPlayer`) is 303'd to
    `PLAYER_HOME` before anything is minted (sportbet's `guest` middleware).
    There is no same-origin check: Google's return is cross-site by nature,
    and the cookie plus `state` are the defence.
11. **Throttles** (sportbet has none; both new, domain, beside the sign-in
    ones, in `googleLimits`): `googleStartLimits(ip)` 20 per 10 minutes and
    `googleCallbackLimits(ip)` 30 per 10 minutes, checked first, IP only
    (nothing about a person is known before the exchange). A refused request
    answers the generic failure flash, never a 429 body (a browser navigation
    would show it raw). They exist because the callback makes an outbound
    request per call; a callback refused for its cookie or state is counted but
    makes none. Fixed windows through the same `throttle` module.
12. **Sign-in and sign-up each end as the code flow ends.** Sign-in: read
    `readReturn(jar)` first, `startSession`, `recordLogin(method: 'google')`,
    303 to the guarded page kept or `PLAYER_HOME`. Sign-up: `pointsChanged()`
    (the new account joined, its fill-ins scored), `forgetIntended`,
    `startSession`, `recordLogin('register_google')`, 303 to `PLAYER_HOME`. No
    mail is sent (and none is needed: Google sign-in works with the mailer
    down, which is its point).
13. **A link is atomic and never a takeover.** `link` runs only when the plan
    found the account by the exact address and Google said the address is
    verified; `linkGoogleId` refuses (`already-linked`) when the row has a
    `google_id` (this includes a second Google account with the same address
    string: question 3), and `taken` when the `sub` belongs to another row
    (the unique index). Both answer the generic failure flash and sign nobody
    in; the code sign-in is always the way back.
14. **Texts.** Lithuanian, in `apps/web/src/server/google/texts.ts`,
    sportbet's own: failure "Google prisijungimas nepavyko. Bandykite dar
    kartą.", unverified "Google paskyros el. paštas nepatvirtintas.",
    creation failed "Registracijos užbaigti nepavyko. Bandykite dar kartą.".
    They ride the sealed `__Host-sb_flash` as new kinds `google-failed`,
    `google-unverified`, `google-registration-failed`, all error tone, shown by
    the shell's alert (as the code flow's errors on `/`). The button reads
    "Prisijungti su Google", the divider "arba" (sportbet's).
15. **The look.** The dialog's login pane gains, under the "Gauti
    prisijungimo kodą" form, the divider "arba" and an outlined full-width
    button with Google's four-colour "G" and "Prisijungti su Google", exactly
    sportbet's markup in the dialog's tokens (`border-border`, `bg-card`,
    `text-text`). The mark's own colours are a static file,
    `apps/web/public/img/google-g.svg`, drawn with `<img>`, so no colour
    literal enters a component and `token-guard.test.ts` gets no new exception
    (sportbet's own view needed an `allow-colour-literal` marker for this). The
    register pane has no Google button, as in sportbet (a new visitor presses
    the same button on the login tab; the page says nothing else). The profile
    card's list gets "per Google" back as its first item, so it reads as in
    sportbet's: "Slaptažodžių nebenaudojame. Prisijungti galite dviem būdais:".
16. **Content-Security-Policy and the edge.** Nothing changes: the only
    policy is `frame-ancestors 'self'` (`next.config.ts`), the browser's trip
    to `accounts.google.com` is a navigation and the token exchange is the
    server's, and Caddy sets no CSP. Recorded so nobody adds a `connect-src`
    or `form-action` later without allowing the host.
17. **Logs.** `logInfo('google sign-in', { outcome })` with the outcome kind
    only (`signed-in`, `linked`, `registered`, `refused-state`,
    `refused-unverified`, ...); failures `console.error` by `errorKind` (a
    failed exchange's HTTP status class, a timeout). Never a code, a token, a
    `sub`, an address or a name.
18. **The live exchange is bounded** (as the feed's fetch is): POST
    `application/x-www-form-urlencoded` to `https://oauth2.googleapis.com/token`,
    `redirect: 'error'` (no redirect followed), 10 s `AbortSignal`, a response
    read to at most 64 KB, parsed with Zod (`id_token` a string of at most 8 KB,
    three dot-separated base64url segments, the payload JSON). The `code` taken
    from the query is a string of at most 2 KB of URL-safe characters or the
    request is refused before the exchange.
19. **Deletion and an address change need nothing new.** `google_id` is a
    column of `players`: `deleteAccount` removes it with the row, so the
    Google account is free to sign up again (a db test), the foreign-key
    coverage test is unaffected (no key), and R-24/R-132 are untouched (no
    session is ended by a link). `PLAYER_ROWS_DELETED` gains nothing.
20. **Audit.** `AUDIT_LOGIN_METHODS` gains `google` and `register_google`
    (enum migration `audit_login_google`), their admin labels "Google" and
    "Registracija (Google)" (sportbet's), no IP. This reverses R-45's second
    sentence; see question 2.
21. **The reader.** Unless question 1 is answered yes, `tools/migrate` reads
    nothing new: `users.google_id` stays unread, so no Google identifier of
    production enters the new database, and a Google player signs in after
    switch-over by address (step 5 above), which links them.

## Design

### Domain (`packages/domain/src/account/`)

- `google-id.ts`: `googleIdInvariant` (a `defineInvariant`, own accepted and
  refused examples), `GoogleId` brand and factory.
- `google-sign-in.ts`: `googleIdentity`, `googleSignInPlan`,
  `googleUsernameBase`, `googleNameParts`, `GoogleRefusal` =
  `'unverified' | 'registration-closed'` (the plan's) beside the db's
  `'already-linked' | 'taken'`.
- `google-throttle.ts`: `googleStartLimits`, `googleCallbackLimits`.
- `session.ts`: `AUDIT_LOGIN_METHODS`.

### Database (`packages/db/src/account/`)

- `schema.ts` / `player/players.ts`: `google_id`, its unique constraint and
  its CHECK in `playerInvariantChecks`; migration `google_id`; the enum
  migration.
- `google.ts`: `findAccountByGoogleId`, `linkGoogleId`.
- `registration.ts`: `createAccount` takes the Google door (decision 6).
- `entries/account.ts`: the exports.

### Web (`apps/web`)

- `server/google/`: `provider.ts` (the port, `GoogleIdentity` re-export,
  `chooseProvider(env)`), `google-live.ts`, `google-fixture.ts`,
  `pending.ts` (the sealed cookie: mint, read, clear), `pkce.ts` (verifier,
  S256 challenge, state, nonce from `node:crypto`), `start.ts`,
  `complete.ts` (the callback's use case: guard, exchange, plan, write, end),
  `texts.ts`.
- `app/auth/google/route.ts`, `app/auth/google/callback/route.ts`,
  `app/auth/google/fixture/route.ts` (404 unless the fixture is chosen).
- `server/cookies.ts`: `GOOGLE_COOKIE`; `server/flash.ts`: the three kinds;
  `env.ts`: `googleEnv`.
- `components/shell/sign-in-dialog.tsx`: the divider and the button, shown
  by a `googleEnabled` flag of `ShellView`; `shell-for.ts` sets it.
  `components/profile/sign-in-card.tsx`: "per Google".
  `components/admin`: the two audit labels, and the users table's "Auth"
  column (a Google badge when `google_id` is set) if the page has it; if the
  page lacks the column, it is added only when the owner asks (a note, not a
  task).
- `public/img/google-g.svg`.
- `infra/compose/{staging,production,e2e}.yml`, GitHub secrets and Vercel
  settings: the three variables (devops, owner's hands for secrets).

## Testing

- Domain: `googleSignInPlan` for every row of sportbet's list in order (sub
  first with an unverified address still signing in; unverified; link; closed;
  register; no email); `googleIdentity` (boolean `true` only; a bad address
  becomes null; a name of 300 characters); `googleUsernameBase` (empty local
  part, a 300-character one); `googleNameParts` (null, one word, "Jonas
  Jonaitis", three words, surrounding spaces); `googleIdInvariant` examples;
  the throttles' keys and order.
- Live adapter (`google-live.test.ts`, injected fetch): every claim refused in
  turn (`iss`, `aud` as string and as list, `azp`, `exp`, `iat`, `nonce`,
  `sub` empty or 256 long, `email_verified` as `"true"`, as `1`, absent), a
  non-200, a redirect, a timeout, an oversized body, a non-JSON body, a
  three-part `id_token` that is not base64url; the request carries the
  verifier and the redirect URI and never logs a secret; the host names occur
  in this file alone.
- Database: `findAccountByGoogleId`; `linkGoogleId` links, refuses
  `already-linked` (including the same `sub` again being a no-op answer),
  refuses `taken` (unique index); `createAccount` with the Google door: a
  derived username (free, suffixed, suffix skipping held ones, held by fold
  `Šarūnas`/`sarunas`, truncated base), a folded address refused `taken` with
  nothing written, two racing creations for one address or one `sub` leave one
  account, the tournament joined and its fill-ins scored like registration's;
  `deleteAccount` frees the `google_id`; the CHECK agrees with the invariant on
  every example (`invariant-checks.test.ts`).
- Feature (`apps/web/tests/feature/google.test.ts`, the fixture provider):
  every branch of sportbet's `GoogleAuthTest` (20 cases) by its name, plus: no
  cookie, a forged cookie, a cookie of another purpose, an expired one, a wrong
  `state`, `error=access_denied`, a missing or oversized `code`, a replayed
  callback (the cookie was cleared), a nonce of another browser; each flash
  text; the cookie's flags and its Max-Age 0 clearing; the signed-in visitor;
  the return path kept and used; the intended tournament joined; audit rows
  `google` and `register_google` and no IP; the throttles (the generic flash,
  nothing fetched past the limit); `GOOGLE_PROVIDER=fixture` under
  `SPORTBET_ENV=production` answers 503 and the fixture route 404; an unset
  `GOOGLE_CLIENT_ID` stops no other page (`/` still renders, the dialog shows
  no button).
- Components: the dialog with and without the button (divider, link target
  `/auth/google`, the `<img>`), the profile card's two items.
- E2E at 390 and 1280 (CI, fixture): a new visitor presses the button, picks
  "new person" on the fixture page and lands on `/main` with the derived
  username; the same address again signs in; an existing code-sign-in account's
  address is linked and signs in; an unverified fixture identity lands on `/`
  with "Google paskyros el. paštas nepatvirtintas.".
- Security review (task 12): the list in the plan.

## Done means

On staging, against the real Google, the owner presses "Prisijungti su Google"
as a new person and lands signed in with a username from their address and a
league; signs out, presses it again and lands in the same account; signs out
and signs in with the mailed code to the same address and finds the same
account; the profile card lists Google. A Google account with an unverified
address is refused with the text. The security reviewer has signed off every
**[SR]** task. After switch-over, an existing Google player signs in once and
is linked.

## Owner's questions

Each has a default; the work proceeds on the default of any left open, and an
answer different from it is a small change named in the plan.

1. **Does the reader read `users.google_id`?** (consent, as for `email`.)
   a) **No (default).** Production's Google ids never enter the new database;
   a Google player is matched by address at their first Google sign-in after
   switch-over and linked then. Risk: a player whose Google account address
   differs from the address stored here (they changed one side) is not
   matched and, if registration is closed (R-128), is sent home with no
   message; the mailed code still signs them in. b) Yes: matched by `sub` from
   day one, the admin users page shows the Google badge at once, and the
   address-differs case works; the reader adds one more personal identifier to
   what it reads (and `google_id` joins `READ_COLUMNS`, with its count of
   non-conforming rows as for the address). A middle road, c) read only whether
   it is set (a boolean), gives the badge but not the matching.
2. **Audit methods `google` and `register_google`** (sportbet records them;
   R-45's second sentence says they do not exist here). **Yes, as sportbet
   (default)**, still without the IP; or no, record both as `email_code` and
   `register`.
3. **A Google account arrives with a verified address that belongs to an
   account already linked to a different Google account.** sportbet overwrites
   the stored id and signs in. **Refuse and sign nobody in, with the generic
   failure text (default)**: the stored link never changes silently, and the
   mailed code is the way in; or follow sportbet (overwrite).
4. **A new visitor presses the Google button after registration has closed
   (R-128).** sportbet sends them to the start page with no message
   (**default, parity**); or show a message (the owner writes the text,
   e.g. a line that registration is over for this tournament).
5. **The profile's sign-in card gets "per Google" back** as the first item
   (**default yes**: slice 17 dropped it only until this slice).
