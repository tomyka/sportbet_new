# Slice 5: the tournaments hub, the tournament page and joining from it

A2 of `docs/phase-2-inventory.md`. Built in two parts on one spec: **5a**,
the read-only pages; **5b**, the actions. The tournament page's public league
table and game history wait for slice 8, which builds the same parts for the
leaderboard.

Binding: decisions 5 and 13; R-7, R-8, R-9, R-18, R-19, R-21, R-27, R-28,
R-30, R-46, R-48, R-49 and the new R-50 to R-56 (`docs/owner-rulings.md`);
the 4b and 4c rules in `CLAUDE.md` (cookies, sessions, joining); the notes
carried on #16 for slice 5.

## The reference

sportbet at **3eb95e7** (none of the slice-5 files changed since 1ac955f):
`app/Http/Controllers/TournamentController.php` (hub 30-108, enter 110-131,
register 142-198, show 217-264, exit), `app/Models/Tournament.php`
(`effectiveStatus` 210-236, `orderByEffectiveStatus` 257-274),
`app/Support/{PlayerTotals,MedalTally,TeamLogo,GameLock}.php`,
`resources/views/tournaments/{hub,show,register}.blade.php`,
`resources/views/partials/rail-tournament.blade.php`, `public/img/teams/`.

## Owner answers at the brainstorm (2026-10-06)

- Hub groups as sportbet: the admin's status and start date are added and
  copied from production. The "Pasibaigę" group follows R-21 (R-55).
- Non-public tournaments are shown only to members and admins; anyone else
  gets "not found" (R-50).
- Game times in Vilnius time, Lithuanian (R-51).
- Football wording becomes basketball: "krepšinio prognozių žaidimas",
  "taškų skirtumą" (R-52).
- A member opening the registration form is taken into the tournament
  (R-53).
- The form shows the closing date and time (R-54).

## Owner answers at the plan review (2026-10-06)

- Sign-up never joins a non-public tournament under the ruled set, neither
  by R-27 nor through `?tournament=` (R-50, amended; the same RuleSet
  field).
- The sport is named in Lithuanian: "Krepšinis" for basketball, "Futbolas"
  for football, matched without regard to case; any other value as typed
  (R-56; display only, not a RuleSet field).
- Accepted departures from this spec as first written: the rail's
  "Turnyrai" stays current on the hub only, as sportbet; the return path
  after sign-in is its own cookie; enter, exit and the form's submit are
  route handlers; totals of stored rows come from one exported sum; the
  staging seed gets a game; R-54's sentence is left out when no moment
  closes registration.

## Design

### Data

- `tournaments` gains sportbet's `status` (`upcoming` | `active` |
  `finished`, default `upcoming`), `starts_on` (date, nullable), `sport`
  (text, default `basketball`), `description` (text, nullable) and
  `is_public` (boolean, default true). The production-copy reader reads
  `status`, `start_date`, `sport`, `description`, `is_public` - tournament
  settings, no personal data - and the parity fixtures carry them.
- Staging's seed fills them so every group and both public states appear
  (the non-public tournament is a finished one), and gives Euroleague
  2026/27 one game, so R-48 still joins staging sign-ups to it.
- No admin screen edits them yet (the admin slices).

### Domain

- `hubGroup(tournament, census, today, rules)`: `active` | `upcoming` |
  `finished`. Under `sportbetRules`, sportbet's `effectiveStatus`: finished
  if the status is finished, every game is scored (at least one game), or
  the end date is before today (UTC); else upcoming if the status is
  upcoming or the start date is after today; else active. Under
  `ruledRules`, finished only as R-21 (`isFinishedWindowAt`); the rest
  unchanged. `RuleSet.hubFinishedFollowsR21` (R-55).
- `orderHub(tournaments)`: active, upcoming, finished; within a group by
  start date, no date first, then id (sportbet leaves the tie to MySQL; id
  is its practical order).
- `canSeeTournament(tournament, viewer, rules)`: under `ruledRules` a
  non-public tournament is seen only by a player in it or an admin (admin
  level above 0); under `sportbetRules` every tournament is seen.
  `RuleSet.nonPublicTournamentsHidden` (R-50).
- Each card's button, as sportbet decides it from group, viewer and
  whether registration is open (`Season.isRegistrationOpenAt`): a pure
  `cardAction(...)` returning `play` | `register` | `join` | `view` |
  `viewResults` | none, with sportbet's labels in the component.

- Sign-up (4c): `joinableOnSignUp(isPublic, rules)` (R-50). Under
  `ruledRules` a non-public tournament is never joined by R-27 nor by a
  `?tournament=` slug (`tournamentToJoin`), and never opens sign-up by
  itself (`registrationIsOpen`, R-49): on a site where only non-public
  tournaments take players the "Registruotis" tab is hidden. R-49's empty
  installation (no game anywhere) still reads every tournament.
- Totals of a rule set's stored rows (the guest top 5) come from
  `sumTournamentTotals`, the one sum `recalculateTournament` uses too.

### Database

- `loadHub(db, viewer, now, rules)`: the visible tournaments in hub order,
  each with its group, its card action, and - only where sportbet shows
  them - its widgets: next 3 unplayed games (upcoming cards for everyone;
  active cards for guests), and for guests on an active card the top 5
  (`rankPlayers(..., 'lyderiai', rules)`, the eligible players as the
  leaderboard counts them: R-7, R-19), the medal tally (`final_place` per
  team for active players), the participant count (`tournament_players`)
  and the prediction count (match prediction rows). One query per kind of
  data across all cards, not one per card.
- `loadTournamentPage(db, slug, viewer, now, rules)`: the header card's
  data, or not found (unknown slug, or not visible under R-50).
- Medal tally parity: sportbet counts a `final = 0` row as the team with no
  medals; the new `final_place` maps 0 to null. qa checks production for
  such rows; if any, the tally lists those teams with zeros as sportbet does.

### Web - 5a

- `/` (the hub): sportbet's flash area, the charity card (R-52 wording,
  7 500€, link to the charity page path sportbet uses, unlinked until it
  exists), the empty state ("Turnyrų kol kas nėra" ...; "Sukurti turnyrą"
  only when the admin page exists), then the three groups with sportbet's
  headings, cards, buttons and widgets. "Visos vietos →" is plain text until
  slice 8 builds `/leaderboard`. Times as R-51.
- Team crests: sportbet's 20 images and `_placeholder.svg` copied to
  `apps/web/public/img/teams/`, chosen by sportbet's `TeamLogo` rule
  (lower-cased, whitespace collapsed, SVG before PNG, URL-encoded), as a
  small web helper with its own test.
- `/tournament/[slug]`: the header card (name, description, sport, year,
  "{n} dalyviai"; signed in with registration open: "Registruotis į
  turnyrą"; signed in otherwise: "Sukurti lygą šiame turnyre", plain text
  until slice 12; guest: "Prisijungti ir dalyvauti" to
  `/login?tournament=slug`). A finished tournament shows only "← Turnyrai",
  as sportbet. Unknown or hidden: a server-rendered not-found page inside
  the shell (#16's note; Next 16's default arrives client-filled).
- The rail's "Turnyrai" stays current on the hub only, as sportbet's
  `routeIs('tournaments.hub')`; section matching waits for slices 12 and
  13, whose entries (`leagues.*`, `admin*`) need it.
- The sport is shown in Lithuanian (R-56): "Krepšinis", "Futbolas", else
  as typed.

### Web - 5b

- Enter, exit and the form's submit are route handlers answering a real
  redirect (a Server Action's redirect would show a one-time message
  twice).
- **Enter** (`POST /tournament/[slug]/enter`, and a `GET` that R-53 sends a
  member to; the card's "Žaisti →" /
  "Peržiūrėti →" as a form): a guest goes to `/login`; a member's
  `player_settings.last_tournament_id` is set (R-28) and they go to
  `PLAYER_HOME` (`/` until slice 8 builds `/main`); a non-member goes to the
  tournament page. A POST is same-origin checked (#16).
- **Exit** (`GET /tournaments/exit`, "Keisti turnyrą" in the rail, as
  sportbet): clears `last_tournament_id`, goes to `/`. With it null,
  `chooseTournament` picks by R-46, as sportbet's next `/main` re-picks.
  Sets `SHELL_LINKS.tournamentExit`.
- **Registration form** (`/tournament/[slug]/register`, signed in only):
  - A guest is sent to sign in and brought back after: `/login?intended=`
    keeps the path in its own cookie, `__Host-sb_return` (sportbet's
    `url.intended`; `__Host-sb_intended` stays registration's slug),
    accepted only as a same-origin path after normalizing (one leading
    `/`, never `//` or `/\`, no scheme, no control character).
  - A member is taken in as by Enter (R-53), open or closed.
  - Registration closed: home with "Registracija į šį turnyrą jau
    pasibaigė.".
  - Otherwise sportbet's form: "Registracija į turnyrą", "Ką gausite
    užsiregistravę" with the game and team counts, "Registracija galima iki
    {date, time}." (R-54; left out when no moment closes it) and the
    Taisyklės link, the checkbox "Patvirtinu,
    kad noriu dalyvauti šiame turnyre.", "Registruotis į turnyrą" /
    "Atšaukti".
  - Submit (`POST /tournament/[slug]/register/submit`): unchecked answers "Patvirtinkite, kad norite dalyvauti šiame
    turnyre."; then `registerForTournament` (4c; R-9's fill-ins under
    `ruledRules`); a refusal because it closed meanwhile answers the closed
    message; success sets `last_tournament_id` and goes to `PLAYER_HOME`
    with "Užsiregistravote į turnyrą: {name}".
- **One-time messages**: a signed `__Host-sb_flash` cookie in `cookies.ts`
  (purpose-bound, short-lived, cleared on read), shown by the hub's flash
  area as sportbet's success and error alerts.

### Left for later

- Slice 8: the tournament page's public league table, game trend and
  medal table (`partials.points`, `partials.standings`); the leaderboard
  link.
- Slice 12: leagues. Until then "dalyviai" counts every player in the
  tournament; sportbet leaves out guests and inactive league members. The
  parity run reports whether production has any.

## Testing

- R-50 at sign-up: R-27 and `?tournament=` skip a non-public tournament and it
  never opens sign-up, under `ruledRules`; both join it under `sportbetRules`
  (domain, db, feature). R-56: the sport names (a web helper test).
- Domain: `hubGroup` under both rule sets (status, start date, all scored,
  end date, no games); `orderHub`; `canSeeTournament` under both; every
  `cardAction` branch; the crest name rule.
- Database: `loadHub` per viewer (guest, member, non-member, admin),
  hidden tournaments, the widgets only where shown, the top 5's order and
  eligibility, the medal tally (including a zero place); the reader reads
  the five new columns.
- Components: hub cards in each group and viewer state, charity card,
  empty state, widgets, the tournament header, the form, the flash alert.
- Feature: hub as guest and signed in; a hidden tournament's page 404s for a
  guest and opens for a member; Enter and Exit; the form's guest round trip
  through sign-in (and a hostile intended path refused); member taken in;
  closed; unchecked; success joins and seeds rows; closing between page and
  submit; cross-origin refusals.
- E2E at 390 and 1280: guest hub, sign in, join a tournament through its
  form, Keisti turnyrą.

## Done means

On staging the owner sees the hub's three groups signed out and signed in,
a non-public tournament hidden from a signed-out visitor, joins a tournament
with the second test account through its form, and uses "Žaisti" and
"Keisti turnyrą"; every sportbet rule above has a named test.
