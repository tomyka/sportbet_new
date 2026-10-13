# Slice 12: leagues, invites, payments, messages (read side)

A12, A13 (the league admin's door) and A14 (the dashboard's read) of
`docs/phase-2-inventory.md` (#29): `/leagues*`, `/leagues/{league}/payments`,
the dashboard's messages and fee panel. It ends R-73: the tables that
sportbet scopes to a league narrow to the selected league's roster.

Binding: decisions 5, 10 and 13; R-20, R-23, R-25 (data only), R-29, R-73,
R-87 (data only), R-88, R-103, R-104, R-105 (`docs/owner-rulings.md`); the rules in `CLAUDE.md`
(route handlers answering a real 303, Laravel's answers, guarded pages,
`ShellView`, tokens, Lithuanian text in components, `RuleSet`).

## The reference

sportbet at **5aa8465** (the reader's schema pin is 3eb95e7; the plan
checks that 3eb95e7 already has `leagues.payment_*`, sportbet migration
`2026_10_02_000000`):

- `app/Http/Controllers/LeagueController.php` - index 59, create 76,
  update 124, invite 151 (R-20 at 170-180, `invitableInto` 225), accept 192,
  decline 246, switch 265, searchUsers 300, deleteLeague 412, leaveLeague
  463 (the "only league" count at 478, account-wide); `publicLeagueIn`
  (issue 267: the public league *of the league's tournament*).
- `app/Http/Controllers/LeaguePaymentController.php` (edit, update with a
  JSON autosave answer, updateDetails; `authorizeLeagueAdmin`: public league
  refused, `is_admin` re-read), `app/Http/Requests/UpdateLeaguePayments
  Request.php` (`paid.*`: comma as point, 0..999999.99, two decimals, blank =
  unpaid), `UpdateLeaguePaymentDetailsRequest.php` (beneficiary 70, IBAN 34
  validated by `App\Support\Iban`, note 500, both-or-neither).
- `app/Models/{League,LeagueMember,LeagueInvite,Message}.php`
  (`expectedPot` 43 = fee x full members; `collectedPot` 64 = sum of every
  member's paid amount), `app/Support/{LeagueRoster,FeePayment,Iban,
  PaymentReference}.php`, `app/Http/Controllers/FeeController.php`,
  `MessageController::getProfileMessages` (active messages of the league).
- Session league state: `SessionController::setSession` 18-103 (`leagueID`,
  `fee`, `guest` from the `active` membership), `TournamentController::enter`
  and `register` (the active membership of that tournament wins).
- Views: `leagues/index.blade.php`, `leagues/payments.blade.php`,
  `partials/{league-payments-form,fee,messages,rail}.blade.php`.
- sportbet `CLAUDE.md` > Leagues (incl. Entry fee payments, the three
  copyable rows, `Jaunimo linijai`, beneficiary is a person); `CONTEXT.md` >
  League, Guest, Fee, Paid amount.

What sportbet does, in short:

- **One public league per tournament** (no owner, cannot be left or
  deleted); every registered player is its member. **Private leagues** are
  created by any player inside the current tournament; the creator is owner
  and `is_admin`.
- **The selected league** is the membership with `active = true`, one per
  player per tournament (issue #63); `/leagues/switch` moves it.
- **Roster** (`LeagueRoster::visibleTo`): the league's members whose account
  is active and whose `is_guest <= viewer's is_guest` in that league - a
  full member sees full members, a guest sees everyone. Used by the game
  page's table and history, the rank history, the activity feed, the
  chart, the survival summary, the results and standings summaries, the
  "Visi dalyviai" users page and compare's 404, and the dashboard's top 4.
  **Not** used by `/leaderboard`, the hub's "Lyderiai" and medals
  (`PlayerTotals::forTournament`, `MedalTally::forTournament`) - tournament
  wide. The tournament page (`TournamentController::show`) shows the
  public league at viewer level 0 to everyone.
- **Invites:** a league admin invites a player found by `searchUsers` (LIKE
  on name, surname, username over every account, 10 results, members and
  pending invitees left out). Only a tournament player (R-20, applied in
  sportbet too). Accepting creates the membership (not selected) and
  deletes the invite; declining deletes it. The rail's invite badge counts
  pending invites in every tournament (issue 183).
- **Leave:** not the public league, not as owner ("Perduokite lygos valdymą
  kitam nariui prieš išeidami"), not your only league; leaving the selected
  league selects the public one. **Delete** (owner, private only): selected
  members go to the tournament's public league; the league's messages are
  detached (`league_id` null), then the league goes (members and invites
  cascade).
- **Fee panel** (dashboard, when the league's `base_fee > 0`): unpaid ->
  "Dalyvio mokestis :amount € dar nesumokėtas." with "Kaip sumokėti" (the
  three copyable rows, or "Mokėjimo rekvizitų administratorius dar
  nenurodė."); paid -> "Startinis dalyvio mokestis sumokėtas. Sėkmės
  totalizatoriuje!"; the counts and pots line; `reward_description`.
- **Messages:** the dashboard lists the selected league's active messages.

## Rulings applied

- **R-20** both rule sets (sportbet fixed too): invite and accept refuse a
  player not in the league's tournament; accept leaves the invite pending.
- **R-23** (new capability, no `RuleSet` field: no sportbet rule to keep):
  `/leagues/transfer` makes any member the owner (and `is_admin`); the
  former owner stays an admin member (R-105) and may then leave.
- **R-29** `RuleSet.lastLeagueCountedPer: 'account' | 'tournament'`:
  sportbet counts the player's other leagues anywhere; ruled counts this
  tournament's.
- **R-73 ends:** the roster replaces "every listed player" exactly where
  sportbet uses `LeagueRoster` (above).
- **R-87:** `is_guest` is carried and read; the superadmin's screen is
  slice 14.
- **R-88** two fields: `collectedPotLeavesGuestsOut` (sportbet sums every
  member) and `memberSearch: 'every-account' | 'tournament-players'`.
- **R-103:** the reader reads the leagues' payment details, the amounts
  paid and the message texts under the users' columns' rules (slice 4b):
  into the throwaway Postgres only, counts only in reports. `CLAUDE.md`'s
  reader rule changes (below, "Reader").
- **R-104** `RuleSet.feeDueHiddenFromGuests`: under `ruledRules` a guest
  member sees neither the fee-due line nor the payment pop-up (the counts
  and pots line and the reward stay); `sportbetRules` shows them to every
  member, as `partials/fee.blade.php:10`.
- **R-105:** only the owner and its former owners are a league's admins
  (`is_admin` set by `createLeague` and `transferLeague` only); no
  promotion screen, as sportbet.
- **R-25:** only the data it needs (`league_members.joined_at`, then id);
  the hand-over itself is slice 17.

## Lead decisions (technical)

- **The selected league is stored per (player, tournament)** on the
  membership `tournament_players.selected_league_id` (not null), as R-28
  stores the last tournament (decision 5: the session holds only who the
  player is). One per (player, tournament) is then structural, where
  sportbet's `active` flag needs code to keep it single. A composite FK
  (`selected_league_id`, `player_id`) -> `league_members(league_id,
  player_id)` makes "selected" imply "member"; a league with a member
  selecting it cannot be deleted until they are moved (`RESTRICT`).
- **The viewer's guest level is resolved per request** from their
  membership in the selected league (sportbet's `session('guest')`).
- **One roster function.** Domain `leagueRoster({ members, statuses,
  viewerIsGuest, tournament, rules })`: members listed (RA-4: R-7, R-19)
  and `isGuest <= viewerIsGuest`. Db `loadRoster(db, tournament, scope,
  rules)` with `RosterScope = 'whole-tournament' | 'public-league' |
  { selectedBy: PlayerId }`: the tournament's listed players (today's
  `loadListed`); the public league at full-member level
  (`TournamentController::show`'s level 0); the viewer's selected league
  at the viewer's level, or the public league at full-member level when
  the viewer plays no part in the tournament. `loadTournamentStanding`
  takes the scope and fills `listed` from it (its comment already says
  "here only"); `loadListed` becomes `loadRoster`. `/leaderboard` and the
  hub panels pass `'whole-tournament'` (sportbet's, R-77); the tournament
  page's table and medals (`server/public-league.ts`) pass
  `'public-league'`; the dashboard, summaries, chart and compare pass
  `{ selectedBy: viewer }`. Slices 10 and 11 read their
  players through `loadTournamentStanding` (told 2026-10-12), so this one
  change narrows them.
- **Every tournament has exactly one public league** (partial unique index
  on `tournament_id` where public). The migration creates one for each
  tournament without one, a membership for every `tournament_players` row
  and selects it. `registerForTournament` inserts the public membership
  before the `tournament_players` row; a tournament without a public league
  is an impossible state (throw). Tournament creation (slice 13) and the
  staging seed create it.
- **A league member is a tournament player** (R-20) is enforced by the
  domain and the writers (`acceptInvite`, `createLeague`), not an FK back to
  `tournament_players` (that would make the two FKs a cycle).
- **Money is fixed point:** `paid_amount` as integer cents (`Cents`),
  `base_fee` and `penalty_step` whole euros; pots are cents. Display as
  sportbet (`number_format(..., 2)`, comma in the fee line).
- **Only pending invites are stored.** sportbet deletes on accept and
  decline; the reader skips any `accepted`/`declined` row (counted in a
  notice). Unique (league, invitee).
- **Messages:** id, `league_id` nullable (detached as sportbet), text up to
  255, `active`, timestamps. Read-only here; writes are slice 14.
- **Not carried:** `leagues.use_league_odds` and `league_game_odds` (no
  reader in sportbet's `app/`).
- **Addresses:** the page is `/leagues`; every POST keeps sportbet's path
  (`/leagues/{create,update,invite,accept,decline,switch,leave,delete}`) plus
  `/leagues/transfer`, each a route handler answering a 303 with a sealed
  flash (`Lyga sukurta`, ...), 422 through `laravel-answers.ts`.
  `/leagues/searchUsers` is a GET handler answering JSON. Next cannot serve
  a page and a handler at one path (slice 9), so the payments save is
  `POST /leagues/{league}/payments/save` (JSON autosave or 303) and the
  details `POST /leagues/{league}/payment-details` (sportbet's).
  `/leagues` and `/leagues/{league}/payments` join `GUARDED_PAGES`.
- **A posted id** (`leagueID`, `inviteID`, `invitedUserID`, `{league}`, a
  member id in `paid[...]`) is read only by `idFromText`. A league not
  yours, an invite not yours, a member of another league: 404 as sportbet;
  not a league admin on payments: 403.
- **Search** is case- and accent-insensitive like MySQL's
  `utf8mb4_unicode_ci` (a `name_fold` beside `email_fold`; never on an
  address), at least 2 characters, 10 results, limited per account
  (`leagueSearchLimits`, 30 a minute) since it lists names.
- **Lock order:** league writes take the league row `FOR UPDATE`, then its
  `league_members` rows by player, then `tournament_players` through
  `lockPlayerStatuses`; no league writer holds a tournament, game or
  prediction lock, so the existing order is kept (added to `lock.ts`'s
  comment). League writes change no points: no recalculation, no
  `pointsChanged()`.
- **Participant counts** follow sportbet: the hub card counts distinct
  full (non-guest) members whose selected league is in the tournament, the
  tournament page distinct full members (`TournamentController` 69, 216).

## Design

### Schema and migration (`packages/db/src/league/schema.ts`)

- `leagues`: id, `tournament_id` FK restrict, name (100), description
  (500), `is_public`, `owner_id` FK players nullable (`SET NULL`; public has
  none, CHECK public => owner null), `base_fee`, `penalty_step` (>= 0,
  `defineRangeInvariant`), `reward_description`, `payment_beneficiary` (70),
  `payment_iban` (34), `payment_note`, `created_at`; unique (id,
  tournament_id); partial unique public per tournament.
- `league_members`: `league_id` FK cascade, `player_id` FK cascade, PK
  (league, player), `is_admin`, `is_guest`, `paid_amount_cents` nullable
  (0..99 999 999), `joined_at`, `sportbet_id`.
- `league_invites`: id, league FK cascade, invitee and inviter (`SET NULL`)
  FK players, unique (league, invitee), `created_at`.
- `messages`: as above.
- `tournament_players.selected_league_id` + the composite FK; the data step
  in the same migration. CHECKs listed as `InvariantCheck`s
  (`leagueInvariantChecks`) and in `INVARIANT_CHECKS`.

### Reader (`tools/migrate`)

- `READ_COLUMNS` grows: `leagues` (+ name, description, owner_id, base_fee,
  penalty_step, reward_description, payment_beneficiary, payment_iban,
  payment_note, created_at), `league_members` (+ id, is_admin, active,
  paid_amount, created_at), `league_invites` (id, league_id,
  invited_user_id, invited_by_id, status, created_at), `messages` (id,
  league_id, message, active, created_at, updated_at). The comment and
  `CLAUDE.md`'s reader paragraph change with it (R-103). The proposed
  sentence, replacing "reads only `READ_COLUMNS` (`users`: ... never a
  Google id, token or password),":

  > reads only `READ_COLUMNS` (`users`: `id`, `username`, `name`,
  > `surname` and `email` - the owner's consent, slice 4b - never a Google
  > id, token or password; the leagues' payment details, the amounts paid
  > and the message texts - R-103 - under the same rules),
- Mapping: leagues and messages keep sportbet's ids; the selected league is
  the tournament's `active` membership, else the public one (notice:
  how many had none, how many had two - the lowest id kept); a tournament
  player missing a public membership gets one (notice); non-pending
  invites skipped (notice). Notices are counts only.
- Parity: `compareRankings` already ranks each league "with every member
  visible"; it now also ranks each league at full-member level (guests out)
  against sportbet's `getAllUserPoints(league, 0)`. The report gives counts
  per class only.

### Domain (`packages/domain/src/league/`)

- `League`, `LeagueMember`, `Invite`, `Cents`; `leagueFormEntry` (create,
  update: every field listed, LeagueController 76/124's rules),
  `paymentsFormEntry`, `paymentDetailsFormEntry` (Iban port: compact,
  checksum, group in fours).
- Decisions, each a `Result`: `createLeague`, `updateLeague` (admin),
  `inviteToLeague` (admin; already member or invited; R-20), `acceptInvite`
  (R-20), `declineInvite`, `selectLeague`, `leaveLeague` (public, owner,
  only league per R-29), `deleteLeague` (owner, private; who moves where),
  `transferLeague` (R-23: owner only, to a member), `recordPayments`
  (league admin, private; every id a member).
- `leagueRoster` (above); `pots(members, baseFee, rules)` (R-88);
  `feePanel({ league, member, rules })` (R-104: no fee-due line or
  pop-up for a guest under `ruledRules`; the lines above, `FeePayment`
  rows, `Jaunimo linijai`); `leaguesPage` (my leagues in the tournament,
  pending invites everywhere, what each may do).

### Database (`packages/db/src/league/`)

- `loadRoster`; `loadLeaguesPage`, `loadPaymentsPage`,
  `loadDashboardLeague` (selected league, viewer's membership, fee panel
  inputs, active messages), `countPendingInvites` (the rail badge),
  `searchPlayers`.
- One writer per decision, each a transaction under the lock order above,
  parsing every row with the domain schema.

### Web (`apps/web`)

- `app/leagues/page.tsx`, `app/leagues/[league]/payments/page.tsx` load and
  return one component; the handlers above.
- `components/leagues/`: the leagues list (members, admin actions,
  create/edit/invite dialogs with the search box), pending invites, the
  league switcher in the rail (`ShellView` gains the switcher's leagues and
  the invite count; the "Lygos" entry lands with its page), the payments
  form (autosave, pots), the dashboard's fee panel and messages. Tokens
  only; Lithuanian text.

## Parity impact

- League tables now compare at sportbet's real viewer levels: production's
  guests and private leagues stop being R-73's known difference.
- New per-class counts: invites skipped, selections repaired, public
  memberships added. `/leaderboard` and the hub panels do not move.

## Testing

- Domain: every decision's refusals in order by name; the roster at both
  guest levels and with R-7/R-19; R-29, R-88 under `sportbetRules` and
  `ruledRules`; pots; the fee panel's three states; the forms field by
  field; the Iban port against sportbet's test vectors.
- Database: the migration on a filled database (every player selected in
  the public league); one selection per (player, tournament); deleting a
  league with selecting members refused by the FK unless moved; delete,
  leave and transfer under concurrent switches; search folding (`Š`, case),
  limits; a refused write writes nothing.
- Reader: the synthetic dump grows a private league, a guest, a paid
  member, a pending and a declined invite, a detached message, a player
  with two active rows; the drift check covers the new columns.
- Feature: every handler's answers (flash texts, 422, 404, 403, cross-site
  403, guest 401); the narrowed dashboard for a guest and a full member.
- Components and E2E at 390 and 1280: create a league, invite, accept,
  switch, see the narrowed table, record a payment, see the fee panel.

## Split

- **12a - schema, reader, roster:** tables, migration, reader and parity,
  `loadRoster` threaded through `loadTournamentStanding`, the existing
  `LeagueSwitcher` filled by `shellViewFor` with the invite badge, and
  `/leagues/switch`, the viewer's guest level. Ends R-73.
- **12b - `/leagues`:** create, update, invite, search, accept, decline,
  leave, delete, transfer (R-20, R-23, R-29, R-88 search, R-105), the
  `/leagues` nav entry with its page.
- **12c - money and messages:** payments page and details, the fee panel,
  pots (R-88), R-104, the dashboard's messages.

## Done means

On staging the owner creates a league, invites a tournament player (and is
refused for one who is not), accepts as that player, switches leagues and
sees the game page, summaries and chart narrow (a guest sees everyone, a
full member only full members), records a payment and sees both pots, sees
the fee panel and a message, hands the league over and leaves it; the
parity run holds with league rankings at both viewer levels; every
sportbet rule above and R-20, R-23, R-29, R-88, R-104 and R-105 has a
named test.
