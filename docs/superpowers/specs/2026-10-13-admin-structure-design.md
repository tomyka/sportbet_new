# Slice 13: admin - tournaments, rounds, games, teams

A18 part 1 of `docs/phase-2-inventory.md` (#30): the admin screens that
let the new app run a tournament end to end without sportbet's admin -
`/admin/tournaments`, `/admin/events`, `/admin/games` (insert, update,
delete) and `/admin/teams` (the standings facts, team details, the
placeholder insert). Euroleague only (decision 11). It also builds the
two pieces slice 14 reuses: the `isSuperadmin` permission and the
**emailed confirmation** of a destructive superadmin action (R-26
amended).

Binding: decisions 4, 5, 10, 11 and 13; R-10, R-13, R-16, R-21, R-22,
R-26 (amended), R-37, R-41, R-43, R-55, R-67 and R-89 to R-92
(`docs/owner-rulings.md`); the rules in `CLAUDE.md` (the domain decides,
one transaction under the lock order, every derived row through
`recalculateUnderRuleSet`, route handlers answering a real 303, Laravel's
answers, `adminGate`, tokens, Lithuanian text in components, invariants
held once).

## The reference

sportbet at **5aa8465**: `routes/web.php` (152-241),
`app/Http/Controllers/TournamentController.php` (`adminIndex` 264-269,
`adminStore` 276-309, `adminUpdate` 316-340, `refuseSurvivalWithDraws`
351-368, `adminEnterContext` 370-375), `EventController.php`
(`insertEvent` 29-60, `updateEvent` 62-96), `GameController.php`
(`getGameAll` 36-68, `insertGame` 71-125, `updateGame` 128-157,
`refuseMixedTournament` 176-197, `deleteGame` 200-221),
`TeamController.php` (`getTeam` 36-56, `insertTeams` 58-112,
`updateTeams` 114-158, `updateTeamDetails` 160-190),
`app/Http/Requests/{Insert,Update}EventRequest.php`, and the views
`resources/views/admin/{games,events,teams,teaminsert}.blade.php`,
`admin/tournaments/{index,form}.blade.php`.

What sportbet does, in short:

- **Tiers.** `admin` (level > 0) sees `/admin/games` and may update a
  game; `level9admin` inserts and deletes games and does everything on
  `/admin/tournaments`; `superadmin` (level >= 5) owns `/admin/events`
  (delete re-checks level 9 in the controller), `/admin/teams`,
  `/admin/teaminsert` and `updateTeamDetails`. Every middleware re-reads
  the level.
- **The admin's tournament** is the session's (`CurrentTournament::id()`),
  set by "Dirbti šiame turnyre" / "▶ Kontekstas" on the tournaments list
  (`adminEnterContext`). With none, rounds, teams and team details refuse:
  "Nepasirinktas turnyras. Pasirinkite jį ir bandykite dar kartą."
- **Tournaments** ("Turnyrai", newest first: name, sport, status, start).
  The form ("Naujas turnyras" / "Redaguoti turnyrą"): `name` (required,
  255), `slug` (required, 100, `[a-z0-9-]`, unique), `sport` (required,
  50), the standings format (one: Euroleague), the standings deadline round
  (1-255, empty "Tuščia - formato numatytasis."), `status`
  (`upcoming|active|finished`), start and end dates (end not before start),
  description (1000), cover image path, public and survival switches.
  Survival is refused for a format with draws unless it was already on with
  that format: "Išlikimo žaidimas galimas tik turnyrams be lygiųjų."
  Creating one creates its public league. Flashes "Turnyras sukurtas." /
  "Turnyras atnaujintas.".
- **Rounds** ("Turai", every round of every tournament): name ("Turo
  pavadinimas…", required), day (`event_day`, required integer, min 1),
  survival ("Išlikimo turas"), knockout ("Play-off turas (baudinių
  serija)"), football's `round_type`, `active`, rate ("Koeficientas",
  integer 0-127). Inserted into the session's tournament; deleted
  ("Ištrinti turą") with no check of its games. English flashes.
- **Games** ("Žaidimai", every game of every tournament, newest id first;
  a row opens a modal "Redaguoti žaidimą" / "Naujas žaidimas": "Data ir
  laikas", "Šeimininkai", "Svečiai", "Etapas", "Ištrinti žaidimą" for level
  9). The dropdowns offer only the round's tournament's teams (issue 272),
  and the server refuses a team of another tournament: "Komanda ir turas
  priklauso skirtingiems turnyrams." The typed time is Vilnius
  (`Carbon::parse(..., 'Europe/Vilnius')->utc()`, no refusal of a missing
  or doubled hour). Insert seeds a blank `prediction_results` row for every
  player in the tournament and a blank `game_odds` row. Update changes
  date, teams and round with no check of tip-off or predictions. Delete is
  refused when any `prediction_results` row exists - so in practice always,
  since insert seeded them: "Šių rungtynių ištrinti negalima: jos jau turi
  spėjimų." English flashes ("Game N has been inserted").
- **Teams** ("Komandos", the session tournament's): one form posting every
  row's place, stage ticks (football's Š16, Š8; Euroleague's KF = play-offs,
  PF = Final Four) and final place, with no check that places differ; a
  modal renames a team and its group ("Komanda atnaujinta"); a missing logo
  shows "Trūksta logotipo failo: :file". With no team yet the page is the
  insert form ("Įveskite komandų kiekį:", 2-64), which inserts `team1` ...
  `teamN` and seeds rows for the inserting admin only. Nothing recalculates;
  `updateStandingPoints` is a separate button.

## Rulings applied

- **R-26 amended.** Rounds, games, teams' details, the placeholder insert
  and tournaments are **superadmin** (`isSuperadmin`, new). The standings
  facts - places, ticks, final place and the "final" mark - are the
  **results manager**'s (`mayEnterStandingsFacts`, new; any role but a
  player), as sportbet's level 5 had them. A destructive superadmin action
  is confirmed with a fresh emailed code (below); in this slice that is
  deleting a game.
- **R-89.** A game may be deleted until any player saves a real
  prediction on it (`origin = 'real'` with a score); its blank rows go with
  it. After that the refusal is sportbet's text, and the game is postponed
  instead (R-63, on the results page). Deleting needs the emailed code.
- **R-90.** On a started game (`hasTippedOffAt`) the date and round may
  change, but not the two teams once a real prediction exists:
  "Pradėtų rungtynių, kurias jau spėjo žaidėjai, komandų keisti negalima."
  (new text). Before tip-off anything may change, as in sportbet.
- **R-13.** A changed date goes through `Game.reschedule(tipOff, now,
  rules)`: a game moved later that had already locked stays locked.
- **R-91.** A typed Vilnius time that does not exist (the spring hour) or
  is ambiguous (the autumn hour) is refused: "Šis laikas Vilniuje
  neegzistuoja (laikrodžio persukimas)." / "Šis laikas Vilniuje
  dviprasmiškas (laikrodžio persukimas)." (new texts). The form shows the
  UTC time it will save under the box before saving.
- **R-92 and R-43.** "Final" is accepted only with every team holding a
  place and the places exactly 1..N (N the tournament's teams):
  "Galutinė lentelė galima tik užpildžius visas vietas 1..N be
  pasikartojimų." (new). Only a superadmin may take the mark off; the
  points follow (R-37).
- **R-16, R-37.** Every write that can change a point recalculates at
  once, through `recalculateUnderRuleSet`, and calls `pointsChanged()`.
  sportbet's `updateStandingPoints` button is not carried.
- **R-10.** A round's stage is chosen on the form (`STAGES`); its rate is
  prefilled from the stage (play-in 1, play-offs 2, Final Four 3, final 3,
  regular 1) and stays editable.
- **R-21, R-22, R-67.** See OPEN QUESTION 3: writes that change points are
  refused in a finished tournament, as results are.

## Open questions for the owner

1. **Tournament status.** Keep `status` on the form with "Artėjantis" and
   "Vykstantis" only (R-55; `hub.ts:31,36` reads it), or drop it as the
   slice plan says (R-21)? Recommended: keep.
2. **A game with a result.** R-89 allows deleting a game with no real
   prediction, but a scored game holds fill-ins and `audit_results` rows,
   which R-69 keeps and whose FK is `restrict`
   (`packages/db/src/result/schema.ts:48`). Recommended: refuse
   ("Šių rungtynių ištrinti negalima: jos jau turi rezultatą.").
3. **A finished tournament (R-21).** Recommended: as R-67 refuses its
   results, refuse its rounds, games, teams, standings facts, end date,
   survival and deadline round ("Turnyras baigtas - keisti negalima."); its
   name, description, public switch, status and start date stay editable.
4. **sportbet's English flashes** become Lithuanian (decision 13):
   "Žaidimas #N pridėtas.", "Žaidimas #N atnaujintas.", "Žaidimas #N
   ištrintas.", "Turas pridėtas.", "Turas atnaujintas.", "Turas ištrintas.",
   "Komandos atnaujintos.", "Pridėta komandų: N.".

## Lead decisions (technical)

From the slice plan, with what planning added:

- **A round with games cannot be deleted:** "Turo, kuriame yra rungtynių,
  ištrinti negalima." (new). The round FK is `restrict`, so this is the
  domain's refusal, not a 500.
- **The tournament `status` field** - the slice plan drops it under R-21,
  but R-55 keeps "the admin's status and start date" deciding
  "Artėjantys" / "Vykstantys" and `hubGroup` reads it under both rule sets
  (`packages/domain/src/hub/hub.ts:31,36`). OPEN QUESTION 1; until
  answered the spec keeps the field (upcoming, active) and never offers
  "finished".
- **A rate is any whole number from 1** (`rateInvariant`), up to 127 on
  the form (sportbet's `max:127`, and the `smallint`).
- **`refuseSurvivalWithDraws`** is a domain rule on the format's
  `drawAllowed`, sportbet's exception kept (already on with the same format
  passes). Euroleague has no draws, so today it never refuses; it is tested
  through its pure rule.
- **Placeholder teams are per tournament** (`team1`..`teamN`, 2-64, only
  while the tournament has no team) and seed every tournament player's
  standings rows (sportbet seeded only the admin's).
- **Inserting a game seeds every tournament player's blank match row.**
  **No blank `game_odds` row**: CLAUDE.md lets only
  `recalculateTournament` derive `game_odds`, and odds before a result are
  computed on read (R-61), so sportbet's blank row has no reader here. The
  insert's recalculation is the only writer.
- **One seeding helper.** `seedBlankRows(tx, tournament, scope)` inserts
  blank match and standings rows where missing; `registerForTournament`,
  `insertGame` and `insertPlaceholderTeams` all use it.
- **The admin's tournament** is stored with the account
  (`player_settings.admin_tournament_id`, nullable FK, `set null`), set by
  `POST /admin/tournaments/{id}/context` (sportbet's route), and read by
  `/admin/events`, `/admin/games` and `/admin/teams`; with none set, the
  request context's tournament (R-28). The session stays the player only
  (decision 5). Every page heads with the tournament's name. The results
  pages keep R-66.
- **Lists are one tournament's** (issue 272/273's direction): rounds and
  games of the admin's tournament only; games newest id first.
- **The tournament form** drops `sport` (always basketball, decision 11),
  the cover image (not carried, A23) and the format select (one format);
  `name`, `slug` through `tournamentNameInvariant` / `slugInvariant`.
- **No audit rows** for structure changes; slice 14's audit covers
  sign-ins, predictions and results (R-69).
- **Answers.** Every write is a form post to a route handler answering a
  real 303 back to its page with a flash (`server/flash.ts`); a form
  refusal returns the page's 422-style error summary through
  `laravel-answers.ts`' shape as a flash; cross-site 403; a non-permitted
  role goes home (`adminGate`). Throttles: `adminWriteLimits(player)`, 60
  accepted writes a minute, a refused form not counted.

## The emailed confirmation (reusable)

R-26 amended: "a destructive superadmin action is confirmed with a fresh
code emailed at that moment". One piece, two steps, any action:

1. **Ask.** The action's own route (`POST /admin/deleteGame`) checks the
   role and asks the domain whether the action is allowed now (so a
   refused delete sends no mail). If so, `requestConfirmation(admin,
   action)` issues a code for the admin's own address under the new purpose
   `admin_action` (`issueLoginCode`, which voids any earlier one, so at most
   one action is pending per admin), mails it (`adminConfirmationMail`,
   naming the action in Lithuanian), sets the sealed
   `__Host-sb_confirm` cookie `{ account, action, issuedAt }` (5 minutes,
   bound to its purpose in `sealed.ts`) and answers 303 to
   `/admin/confirm`.
2. **Confirm.** `/admin/confirm` shows what will happen ("Ištrinti
   žaidimą #N: A - B, data") and one code box. `POST /admin/confirm`
   re-runs the action's gate, reads the cookie (it must name this account),
   checks the code through the shared `checkCode` (purpose
   `admin_action`), clears the cookie, then performs the action, which
   decides again under its own locks. A wrong code: "Neteisingas arba
   pasibaigęs kodas." and the cookie kept until it expires.

`ConfirmableAction` is a discriminated union in the domain
(`{ kind: 'delete-game', game }` now; slice 14 adds `delete-user`,
`change-role`, `delete-league-message`), each kind registered once in
`apps/web/src/server/admin/confirm/actions.ts` with its permission, its
description and its performer. Limits: `adminConfirmLimits(player)` - 5
codes and 10 checks per 10 minutes per account. The code's lifetime,
digits and hashing are sign-in's. A mail failure is logged by kind only.

## Design

### Domain

- `account/role.ts`: `isSuperadmin`, `mayEnterStandingsFacts`,
  `mayUnmarkFinalTable` (superadmin).
- `account/login-code.ts`: `admin_action` joins `LOGIN_CODE_PURPOSES`.
- `admin/confirmable-action.ts`: `ConfirmableAction`, its schema (the
  cookie's body is parsed with it), `adminConfirmLimits`.
- `admin/admin-write-throttle.ts`: `adminWriteLimits`.
- `shared/vilnius-time.ts`: `vilniusTipOff(text)` ->
  `Result<Instant, 'bad-time' | 'nonexistent-time' | 'ambiguous-time'>`
  and `utcPreview(instant)` (R-91), beside `vilniusDay`.
- `round/round-form.ts`: `roundFormEntry` (name, number, stage, rate,
  survival, knockout), field by field; `round/round-admin.ts`:
  `insertRound`, `changeRound`, `deleteRound` on a `Season` -> refusals
  `duplicate-number`, `has-games`, `tournament-finished`; `stageRate`.
- `round/game-form.ts`: `gameFormEntry` (time, home, away, round);
  `round/game-admin.ts`: `planNewGame`, `planGameChange` (R-90 `teams-fixed`,
  R-13 via `reschedule`, `mixed-tournament`, `same-team-twice`,
  `duplicate-pair`), `gameDeletion` (R-89 `has-real-predictions`, and
  per OPEN QUESTION 2 `has-result`).
- `team/team-admin.ts`: `placeholderTeams(count)` (2-64,
  `teams-exist`), `teamRenameEntry`.
- `standings/standings-facts.ts`: `standingsFactsEntry` (the posted rows)
  -> `TeamOutcomes.enter`, then `finalMark(outcomes, teamCount, role,
  wasFinal)` (R-92: `places-incomplete`, `unmark-not-allowed`).
- `tournament/tournament-form.ts`: `tournamentFormEntry`;
  `survivalAllowed({ drawAllowed, existing })`.
- Finished guard: each decision takes `finished` (R-21's
  `isFinishedWindowAt`) and refuses `tournament-finished`.

### Database

- Migration: `login_code_purpose` gains `admin_action`;
  `player_settings.admin_tournament_id`.
- `joining/seed-blank-rows.ts`: `seedBlankRows` (extracted).
- `tournament/admin.ts`: `createTournament` (tournament, profile and
  `ensurePublicLeague` in one transaction), `updateTournament` (under the
  tournament lock; recalculates when a scoring field changed),
  `chooseAdminTournament`, `loadAdminTournament`.
- `season/admin.ts`: `insertRound`, `updateRound`, `deleteRound`,
  `insertGame`, `updateGame`, `deleteGame`. Each: `lockTournamentForRecalculation`,
  then the game row (`FOR UPDATE` for a delete or a change, so no prediction
  save slips in), then the season and the game's real-prediction count read
  under the lock, the domain decides, write, `recalculateUnderRuleSet`. A
  delete removes the game's blank rows then the game.
- `team/admin.ts`: `insertPlaceholderTeams`, `renameTeam`,
  `saveStandingsFacts` (tournament lock, `saveTeamOutcomes` and the final
  mark, recalculation).
- `admin/pages.ts`: `loadAdminTournaments`, `loadAdminRounds`,
  `loadAdminGames` (with each game's real-prediction count and the round
  tournament's teams), `loadAdminTeams`; every result parsed with the
  domain schema.

### Web

- Pages (load, return one component): `app/admin/tournaments/page.tsx`,
  `create/page.tsx`, `[id]/edit/page.tsx`; `app/admin/events/page.tsx`;
  `app/admin/games/page.tsx`; `app/admin/teams/page.tsx` (the insert form
  when the tournament has no team); `app/admin/teaminsert/page.tsx` (the
  same view); `app/admin/confirm/page.tsx`.
- Route handlers (303): `admin/tournaments/route.ts` (store),
  `[id]/route.ts` (update), `[id]/context/route.ts`; `events/save`
  (sportbet's `POST /admin/events`; Next serves the page at
  `/admin/events`), `eventInsert`; `insertGame`, `updateGame`,
  `deleteGame`; `teams/save`, `teaminsert/save`, `updateTeamDetails`;
  `confirm/save`.
- `server/admin/confirm/`: `request.ts`, `check.ts`, `actions.ts`, the
  cookie in `server/cookies.ts`, `mail/admin-confirmation-mail.ts`.
- `components/admin/`: tournaments list and form, rounds table, games
  table and modal (UTC preview from `utcPreview`), teams table, insert
  form, confirm view; admin index tiles per permission.

## Testing

- Domain: each form's refusals; `vilniusTipOff` on 2027-03-28 03:30
  (nonexistent), 2026-10-25 03:30 (ambiguous), an ordinary time, bad text;
  round insert, change, delete (`has-games`, duplicate number); game plan
  and change (R-90 started with and without real predictions, R-13 moved
  later after lock), deletion (R-89 blank only, real, result); placeholder
  teams; R-92 complete, gap, duplicate, unmark by each role;
  `survivalAllowed`; roles; `ConfirmableAction` schema; finished guard.
  Under both rule sets where a recalculation follows.
- Database: every writer recalculates and the stored totals change (a rate
  change, a moved round, standings facts, final mark off); a refusal writes
  nothing; insert seeds every player's blank row and no `game_odds` row;
  delete removes blank rows; a prediction save waiting on a delete's game
  lock fails or sees the game gone; `createTournament` creates the public
  league; `seedBlankRows` behind `registerForTournament` unchanged.
- Feature: each route's gate (player, results manager, superadmin), 403,
  303 and flash; the confirmation (no cookie, another account's cookie,
  wrong code, expired code, another action's code, success deletes, a
  second ask voids the first code, throttle).
- Components: every view, the UTC preview, the modal, tiles per role.
- E2E at 390 and 1280: create a tournament, add a round, add a game, edit
  its time, enter the standings facts and mark final, delete a fresh game
  with the code from Mailpit.

## Done means

On staging the owner creates a tournament, chooses it, adds rounds, teams
and games with Vilnius times (a clock-change hour refused, the UTC shown),
moves a game, enters the table and marks it final (refused while
incomplete), sees the points change, and deletes an unpredicted game with
an emailed code; a game with a real prediction cannot be deleted; a results
manager sees only the standings facts. #30 is closed, and every rule above
has a named test.
