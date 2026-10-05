# Slice 4c: two-step registration and joining a tournament

The third part of slice 4 (4a, the page shell, #15; 4b, accounts and code
sign-in, #16). Google sign-in, first planned here, is split off as 4d: it
needs the owner's Google client and consent for the reader to read Google
ids.

Binding: decisions 5 and 13; R-8 (registration open until the standings
deadline, `RuleSet.registrationClosesAt`), R-9 (a late joiner is filled in for
games already played, `RuleSet.lateJoinersFilledIn`), R-27 (a front-page
sign-up joins the soonest open tournament), R-45 (no IP in the audit); the
4b rules in `CLAUDE.md` (email identity, cookies, the session module); the
notes carried on #16 for 4c.

## The reference

sportbet at **3eb95e7**, what production runs since 2026-10-05 (not
`1ac955f`): it carries the newer sign-in fixes - the per-address limit on
registration mail (2821fe0), a new account joins only a tournament still open
(2357c2e), account creation in one transaction (2de0b2e). Files:
`app/Http/Controllers/Auth/RegisteredUserController.php`,
`PostRegisterController.php`, `app/Services/TournamentRegistrationService.php`,
`app/Support/PredictionRows.php`, `app/Providers/AppServiceProvider.php`
(throttles), `bootstrap/app.php` (throttle answers),
`resources/views/modals/{main,register}.blade.php`,
`partials/auth/register-code-step.blade.php`,
`emails/registration-code.blade.php`, `lang/lt.json`. Moving the scoring
pins to 3eb95e7 is #17, separate.

## Owner answers at the brainstorm (2026-10-05)

- A registration email with capitals is accepted and lowercased (sportbet
  refuses it): like sign-in, the address is normalized, never refused for
  case.
- Lithuanian texts for the errors sportbet shows in Laravel's English:
  no username "Įveskite vartotojo vardą."; no first name "Įveskite vardą.";
  no email "Įveskite el. pašto adresą."; bad email "Įveskite teisingą el.
  pašto adresą."; over 255 characters "Per ilgas: daugiausia 255
  simboliai."; email already registered "Šis el. pašto adresas jau
  užregistruotas."

## Design

### Joining a tournament (domain and db; shared with slice 5)

- `joinTournament(player, tournament, ruleSet, now)`: refused unless the
  tournament is open for registration at `now` under the rule set
  (`Season.isRegistrationOpenAt`); idempotent for a player already in it.
  It writes the `tournament_players` row and a blank `match_predictions` row
  per game and `standings_predictions` row per team, in one transaction
  (sportbet's `TournamentRegistrationService::register` and
  `PredictionRows::seedMissing`); survival needs no seeded row (picks are a
  history).
- Under `ruledRules` a late joiner (R-9) is filled in for games already
  played at the moment of joining, through `recalculateUnderRuleSet` - the
  one way derived rows are made. Under `sportbetRules` nothing more happens,
  as in sportbet.
- League membership (sportbet's public league) waits for slice 12; when it
  lands, every `tournament_players` row gets its membership.
- Which tournament a new account joins: the one named by `?tournament=` on
  `/login` or `/register` if it is open, else R-27's (the open tournament
  whose next game is soonest), else none. The slug is carried in the pending
  registration, never in the sign-in.

### Two-step registration (web)

- `/register` redirects to `/` with the dialog on its "Registruotis" tab
  (sportbet's `create`), keeping a valid `?tournament=` slug; when no
  tournament is open it goes home and the tab is not drawn.
- Step one (a Server Action, same-origin checked like sign-in): the
  `website` honeypot (filled: a silent redirect home); username and first
  name required, surname optional, each at most 255; the email normalized
  (owner's answer) and refused if registered (the folded unique index plus an
  exact check, #16's note). The answers and the slug wait in a signed,
  short-lived `__Host-` cookie in `cookies.ts`; a `registration` code is
  mailed after the response (the 4b mailer). Resend posts step one again.
- Step two: the code checked against the dummy hash when none is live, one
  message for every failure ("Neteisingas arba pasibaigęs kodas."); the
  deadline re-checked; then one transaction creates the player, their
  `player_settings` (admin level 0, locale `lt`) and joins the tournament.
  A username or email taken meanwhile - username compared ignoring case and
  accents, as sportbet's collation does - answers sportbet's "Šis el. paštas
  arba vartotojo vardas jau užimtas. Pradėkite iš naujo." and clears the
  pending registration; any other failure answers "Registracijos užbaigti
  nepavyko. Bandykite dar kartą." and keeps it. Success signs the player in
  through the session module, records audit `register`, and goes home.
- Throttles as sportbet 3eb95e7, in the domain beside 4b's: step one per
  address and per IP, the page per IP, step two per pending address and per
  IP, with sportbet's refusal text; cancel clears the pending registration.
- The dialog gains the "Prisijungti" / "Registruotis" tabs and the register
  code step with sportbet's texts; the mail is sportbet's
  "Registracijos patvirtinimo kodas".

### Unchanged

`player_settings` admin level stays 0 for every new account: who becomes the
first admin is the admin slices' question (admins are copied from production
at switch-over). The tournament page's own register form is slice 5.

## Testing

- Domain: joining's open check under both rule sets; the R-27 choice; the
  username fold; the throttle limits.
- Database: joining writes the rows once and only while open; a late joiner
  is filled in under `ruledRules` and not under `sportbetRules`; the
  creation transaction rolls back whole.
- Feature (Mailpit stand-in): the full registration; honeypot; each
  validation text; email taken at step one; username or email taken at step
  two (clears) and another failure (keeps); wrong, expired and
  other-purpose codes; the deadline closing between the steps; each
  throttle; cross-origin refusals; `?tournament=` joining that tournament,
  an unknown or closed slug falling back to R-27, none open joining none.
- E2E: register at 390 and 1280 with the code from Mailpit, land signed in.

## Done means

On staging the owner registers a second test account with a code mailed to
an address on `MAIL_ALLOWED_RECIPIENTS` (the owner adds a second one, e.g. a
plus-address) and lands signed in, in the open tournament; every
sportbet rule above has a named test.
