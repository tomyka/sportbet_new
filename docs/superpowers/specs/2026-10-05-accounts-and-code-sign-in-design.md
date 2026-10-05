# Slice 4b: accounts, code sign-in, request context

Issue #16. The second of slice 4's three parts (4a, the page shell, #15, is
done; 4c is registration and Google sign-in). It turns the player shell on.

Binding: decision 5 (the session holds only the player), decision 8 as
amended (mail), decision 13 (Lithuanian only), R-28 (last-used tournament
stored with the player), R-44 (90-day sign-in, extended by every visit), and
every note carried on #16 from #15's security review.

## Owner rulings and consents at the brainstorm (2026-10-05)

- **Email accents:** as sportbet. Two addresses equal once accents are
  ignored cannot both have an account; sign-in matches the exact (trimmed,
  lowercased) address. Parity, not a ruling.
- **Sign-in length:** R-44, 90 days from the last visit.
- **Staging mail:** Resend, only to an allow-list holding the owner's
  address; any other recipient is refused and logged (no address in the log).
- **Reader:** the owner consents to the production-copy reader reading
  `users.email`, `users.name` and `users.surname`, into the throwaway
  Postgres only, never printed or logged, deleted after every run. Google
  ids wait for 4c and their own question.

## What sportbet does (the reference, commit `1ac955f`)

From the old repo's `CLAUDE.md` > Authentication, Security, The sign-in
dialog, Session-driven state, and `CONTEXT.md` > Registration, Standings
deadline; code paths are in `docs/phase-2-inventory.md` A1, A3.

- No password: two ways in, a mailed code (here) and Google (4c).
- **Codes** (`app/Services/OneTimeCodeService.php`): 8 digits, valid 5
  minutes, stored hashed. Issuing a code voids the live one for the same
  email and purpose; the claim is atomic (unconsumed and unexpired). Every
  lookup is scoped by purpose; 4b uses `login` only (`registration` is 4c,
  `account_deletion` and `email_change` slice 17, R-24).
- **Request** (`EmailCodeLoginController`): the same answer whether or not
  the account exists. **Verify** always does the hash comparison (against a
  dummy when there is no live code) and gives one error for every failure.
  On success: sign in, rotate the session, write audit `email_code`, go to
  the page the visitor came for, else the player's home.
- **Mail** is sent after the response, never queued; the code is never
  logged. A missing mail key, or a log-only mailer outside tests, is logged
  as critical.
- **Throttles** (`AppServiceProvider.php:71-160`): code request 3 per 10 min
  per email and 10 per 10 min per IP; verify 5 per 10 min per email (the
  pending one) and 15 per 10 min per IP; a blank email counts on its own IP
  key. A refusal answers on the email or code field with sportbet's text
  ("Per daug bandymų...", with the minutes).
- **Email identity** (`app/Support/EmailIdentity.php`): lowercase and trim on
  every write and lookup; exact equality; never a folding lookup (#41).
- **Dialog** (CLAUDE.md > The sign-in dialog): one dialog, opened by
  "Prisijungti", by `/login` (which renders nothing and redirects to `/` with
  the dialog open), by an error, or by a code to type; it hides its tabs while
  a code is in flight and drops an expired step. 4b shows its sign-in side
  only; the register tab arrives with 4c.
- **Sign-out:** ends the session, back to `/`.

## Design

Our own small module, not a sign-in library: sportbet's flow (codes, not
links; per-purpose codes; its exact throttles and answers) is specific and
security-critical, and a library would be bent to it. Turned down: Auth.js
(link-first), Better Auth (its own tables and limits to reshape).

### Data (`packages/db`, new area `account`)

- `players` gains `email` (text, not null, stored trimmed and lowercased),
  `name`, `surname`. A unique index on the accent-folded email (an
  `unaccent`-style immutable function over `lower(email)`), so a second
  spelling is refused as sportbet's MySQL collation refuses it; lookups use
  exact equality on `email`, never the folded value. The email rule is a
  `defineInvariant` (CLAUDE.md, invariants).
- `player_settings`: `locale` (carried, unused - decision 13), `admin_level`
  (sportbet's integer, carried as is; the R-26 tiers are mapped when the
  admin slices need them), `last_tournament_id` (R-28), and the other
  `user_settings` columns slice 4b's reader reads.
- `login_codes`: email, purpose (`login` in 4b), hash, expires_at,
  consumed_at, created_at.
- `sessions`: a random token, stored only as its hash; player id; created_at,
  last_seen_at, expires_at (last_seen_at + 90 days, R-44).
- `rate_limits`: key, window start, count (Postgres, since Vercel has no
  shared memory).
- `audit_logins`: player id, method (`email_code` in 4b), at - no IP
  address (R-45).

### Sign-in flow (`apps/web`)

- A Server Action for request, verify and cancel, and a POST-only route
  handler at `/logout` (sportbet's URL and method; GET gets 405); each checks
  the request is same-origin itself (Origin, else `Sec-Fetch-Site`), the CSRF
  guard #16 asks for.
- The session cookie: `__Host-sb_session`, HttpOnly, Secure, SameSite=Lax,
  Path=/, Max-Age 90 days, re-issued (and `expires_at` moved) at most once a
  day per session on a visit, so a visit extends it without a write on every
  request.
- The pending sign-in (which email a code was sent to, when) is a short-lived
  signed cookie, not session state (decision 5); the code itself never leaves
  the server.
- Codes: random 8 digits from a cryptographic source, hashed with a slow hash;
  constant work on every verify.
- Mail through a `Mailer` port with three adapters: Mailpit (CI, local),
  Resend with an allow-list (staging), Resend (production). Sent after the
  response with Next's `after()`. Missing configuration fails at start.
- `/login` redirects to `/` with the dialog open. As in sportbet, its
  `?tournament=` does not steer a sign-in (sportbet keeps it only for
  registration, 4c); a sign-in ends on the page the visitor came for, else
  home. A signed-in visitor at `/login` goes to `/`. "The player's home" is `/` until `/main` exists (slice 8).

### Request context

One server function per request, `requestContext()`, returns the player (or
none) and what the shell and pages need, read fresh each time:

- the player's tournament: `last_tournament_id` if they are in it (R-28),
  else the one sportbet's `SessionController` would choose - the plan
  transcribes that fallback from the old code, and any case the code leaves
  open goes to the owner, not guessed;
- the current round (`RuleSet.currentRound`, the existing domain rule);
- `started` (the tournament's first game has tipped off), `standingsLocked`
  (CONTEXT.md > Standings deadline);
- the shell's flags by sportbet's `NavVisibility` (survival, summary), built
  into `ShellView` by a pure domain function with its tests;
- `leagueTab` through `showsLeagueTab` (#16); leagues are `null` until slice
  12 brings them, and the shell draws no league row then, by the 4a rule that
  nothing links to a page that does not exist.

The layout builds `ShellView` from it; pages read it for their own needs.

### The player shell

`guestView()` is replaced by the view built from `requestContext()`. Player
links appear only with their pages (#16): in 4b that is sign-out and, for an
admin, nothing yet (`/admin` is slice 13). "Prisijungti" joins the guest
entries.

### The reader (`tools/migrate`)

`READ_COLUMNS` gains `users.email`, `users.name`, `users.surname` and the
`user_settings` columns above; the load report still names no player by
anything but id. Its guarantees table and tests change with it: no email,
name or surname in any report or log (sentinel tests), and the dump and
containers deleted as now. Production emails that fail the email invariant
or collide once accents are folded are refused and counted, never fixed.

### Staging data

The staging seed gains one account with the owner's address (from a GitHub
secret, never committed), so the owner can sign in on staging.

## Testing

- Domain: the email invariant (trim, lowercase, accepted and refused
  examples), code generation and expiry, the shell flags, the context rules.
- Database: the folded unique index refuses `zukauskas@` beside
  `žukauskas@` and accepts exact lookup; atomic claim; voiding the previous
  code; session expiry and extension; throttle windows.
- Feature (the built app, Mailpit): request and verify happy path; the same
  answer for an unknown email; wrong, expired, reused and other-purpose codes
  refused with one message; each throttle at its limit; a cross-origin POST
  to every action refused and changing nothing; `/logout` GET refused; the
  cookie's flags; extension after a visit; nothing personal in the RSC
  payload beyond the display name and initials.
- E2E: sign in through the dialog with a code read from Mailpit, at 390 and
  1280; the player shell appears; sign out.
- Reader: sentinel tests that no email, name or surname reaches any output.

## Done means

- On staging, the owner signs in with a code mailed to them and sees the
  player shell; sign-out works.
- Every sportbet rule above has a named test; every #16 security note has a
  test or is shown not to apply.
- The reader loads emails and names from the synthetic dump into Postgres and
  prints none of them.

## Out of scope

Registration, Google, the first-admin rule (4c); leagues and the switcher's
action (12); `/main` and the player pages (5-8); profile, email change,
account deletion, theme setting (17); admin pages and tiers (13, 14).
