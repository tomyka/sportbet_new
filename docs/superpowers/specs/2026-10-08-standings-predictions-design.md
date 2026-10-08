# Slice 9: standings predictions

A6 of `docs/phase-2-inventory.md` (#23): `/prediction/standings`, its row
autosave and `/prediction/standings/reorder`. Euroleague only (decision 11),
so only sportbet's ladder is built; football's group box is not.

Binding: decisions 5, 11 and 13; ST-1, ST-2, R-3, R-8, R-14, R-16, R-36,
R-43, R-51, R-59 and the new R-78 to R-80 (`docs/owner-rulings.md`); the
rules in `CLAUDE.md` (route handlers, Laravel's answers, guarded pages,
tokens, Lithuanian text in components).

## The reference

sportbet at **3eb95e7**: `app/Http/Controllers/PredictionStandingController.php`
(page 25-44, row save 47-93, reorder 114-161),
`app/Http/Requests/{UpdatePredictionStandingRequest,ReorderPredictionStandingsRequest}.php`,
`app/Services/StandingsPredictionValidator.php`,
`app/Support/{StandingsRules,StandingsReorder,StandingsFormat,StandingsDeadline}.php`,
`config/standings.php` (the `euroleague` entry),
`resources/views/prediction/standings.blade.php`, `routes/web.php` (119-121),
CLAUDE.md > Standings formats, CONTEXT.md > Standing, Standings deadline,
and its tests (StandingsReorderTest, StandingsSaveTargetTest,
StandingsFormatTest, PredictionStandingLockTest, Unit/StandingsRulesTest,
Unit/Support/StandingsReorderTest, Unit/Support/StandingsDeadlineTest).

What sportbet does, in short:

- **Row save** posts one team's place, the two ticks (`quarterfinal` "1/4",
  `semifinal` "1/2") and the final place. Checked in this order: the
  fields' rules (place 1..teams, tick 0/1, final 1..2), then, because the
  Euroleague format is enforced, the row's conflicts with the player's
  other rows: "Ši vieta jau užimta kitos komandos.", ":stage etape jau
  pažymėta :count komandų." (a tick when the stage already holds its count),
  "Ši finalo vieta jau užimta kitos komandos.". Then the row must be the
  player's ("Šios prognozės išsaugoti negalima.") and the deadline not
  passed ("Prognozių laikas baigėsi."). A blank place or final is stored
  null; a posted tick 0 or 1 as posted. An incomplete table is accepted.
- **Reorder** posts the whole order of ids. Each must be one of the
  player's rows in the tournament, every row named once
  ("Eilė nesutampa su jūsų lentele."); after the deadline "Prognozių laikas
  baigėsi.". It writes only the places, 1.. in posted order; ticks and the
  final place are untouched.
- **Deadline** (ST-2): the first tip-off in the tournament's deadline round
  (round 5, or the round an admin set) or any later round, re-read on every
  write. A tournament with no such game never locks.
- **Page**: one "Lentelė" card; rows in saved place order, unplaced teams
  last by name; ▲/▼ arrows ("Pakelti: {team}", "Nuleisti: {team}",
  `aria-disabled` at the ends), mouse drag, long-press touch drag (350 ms,
  8 px cancels, edge scroll), each move announced in a polite live region
  (":team - :position vieta iš :total") and saved as a reorder; a failed
  reorder restores the previous order and announces "Tvarkos išsaugoti
  nepavyko, grąžinta ankstesnė."; focus stays on the moved club's arrow.
  Legend, and counters "Vieta: x / N", "1/4: x / 8", "1/2: x / 4",
  "F: x / 2". After the deadline every control is disabled.

## Owner answers at the brainstorm (2026-10-08)

- **R-78. The stage chain is kept and enforced.** sportbet's page ticks the
  later stage when an earlier one is ticked (backwards), and its server
  checks no chain. The new page and server keep play-offs -> Final Four ->
  final place: ticking Final Four ticks play-offs, unticking play-offs
  clears Final Four and the final place, and a final place needs a Final
  Four tick. A save that breaks the chain is refused. Rows already stored
  are left as they are.
- **R-79. An unsaved ladder can be saved as shown.** sportbet saves places
  only after the first move, so a player who keeps the shown order, or only
  ticks, has no places. While none of the player's places is saved, the
  page says so and offers "Išsaugoti šią tvarką", which saves the order as
  shown (a reorder).
- **R-80. The page shows when standings close.** "Prognozės užsidaro
  {Vilnius date, time}." while open (R-51's format); "Prognozės uždarytos."
  once closed. Nothing is shown for a tournament with no deadline game.

None of the three is a `RuleSet` field: each acts on the one live write
path or on the page, never on how stored inputs are scored, so a parity run
(which scores stored inputs) is unaffected - as R-59 is not one.

## Lead decisions (technical)

- **A row is named by its team.** `standings_predictions` is keyed by
  (player, team) and has no row id, so the row save posts `teamID` where
  sportbet posts `prediction_standingID`, and the reorder posts team ids.
  Both are read only by `idFromText`. A team outside the player's
  tournament is "Šios prognozės išsaugoti negalima.", as a foreign row is
  in sportbet.
- **A missing row is written on save.** Joining seeds a blank row per team
  (`registerForTournament`), but a team added later has none (sportbet's
  admin insert seeds only the admin's). The page lists the tournament's
  teams with the player's rows joined, and both saves upsert.
- **Order of checks** as sportbet's, with the chain last among the
  conflicts: the fields (`standingsFormEntry`, Laravel's 422 summary with
  every field's error, R-59), then the conflicts and the chain (422 under
  `prediction_standingID`'s key, renamed `teamID`), then ownership and the
  deadline (422 `{success:false, message}`). Both shapes are built by
  `server/request/laravel-answers.ts`.
- **No recalculation on save.** While standings are open no stage can be
  decided and, under `ruledRules`, no place is scored (R-14, R-43); under
  `sportbetRules` points move only on the button (ST-8). A save therefore
  calls neither `recalculateUnderRuleSet` nor `pointsChanged()`. A save
  switches no status back on (sportbet's does not; R-7 counts games).
- **Throttle.** `standingsSaveLimits`: 120 accepted saves a minute per
  player across both routes, checked before anything is read; a post the
  form refuses does not count. Not sportbet's (it has none), the slice 6
  hardening. 120, not 60, because a ladder move is a save: the page sends
  one reorder after arrow presses pause (400 ms), so walking a team down
  the table is one save, not nineteen.
- **Locking.** Each save is one transaction that locks the player's rows
  for the tournament's teams (`FOR UPDATE`, by team) and judges the
  deadline at that moment, waiting at most 5 s for the lock (then 503,
  "Spėjimas neišsaugotas"). It takes no tournament lock: it writes no
  derived row. The lock order in `CLAUDE.md` gains this step.
- **Access** as `/prediction/results`: a guest goes to sign in and back
  through `signInAndReturn` (the page joins `GUARDED_PAGES`); a signed-in
  player without a current tournament goes home. Saves are same-origin
  checked route handlers. The page reads the player's own rows only;
  others' standings are slice 11's summary.
- **Navigation.** "Eigos spėjimai" (sportbet's rail label) joins
  `NAV_ENTRIES` after "Spėjimai", with the `standings` badge kind. The
  badge stays 0, as the results badge does, until the missing-predictions
  count is built.
- **Labels** stay sportbet's: "1/4", "1/2", "F" (Euroleague's play-offs
  are its quarter-finals, the Final Four its semi-finals).

## Design

### Domain (`packages/domain/src/standings/`)

- `standingsFormEntry(posted, teamCount)`: the posted row checked field by
  field in UpdatePredictionStandingRequest's order - `teamID` required and
  whole, `groupPosition` blank or 1..teamCount, `quarterfinal` and
  `semifinal` blank, 0 or 1, `final` blank, 1 or 2 - each field's error
  listed (the form exception in `CLAUDE.md`).
- `predictStandingsRow({ entry, others, teams, now, deadline })`: refused,
  in order:
  1. `place-taken` "Ši vieta jau užimta kitos komandos."
  2. `stage-full` "{1/4|1/2} etape jau pažymėta {8|4} komandų." (a tick of
     1 when the other rows already hold the count)
  3. `final-place-taken` "Ši finalo vieta jau užimta kitos komandos."
  4. `final-four-without-play-offs` "Komanda, pažymėta 1/2 etape, turi būti
     pažymėta ir 1/4 etape." (R-78)
  5. `final-place-without-final-four` "Finalo vietą galima nurodyti tik
     komandai, pažymėtai 1/2 etape." (R-78)
  6. `not-yours` "Šios prognozės išsaugoti negalima." (team not in the
     tournament)
  7. `closed` "Prognozių laikas baigėsi." (`Season.standingsDeadline`
     passed; none means open)

  Accepted: the row to store - blank place or final null, a posted tick as
  posted, an unposted tick null.
- `reorderStandings({ order, teams, now, deadline })`: refused `mismatch`
  "Eilė nesutampa su jūsų lentele." (an unknown, repeated or missing team)
  or `closed`; accepted: place n+1 for the n-th team, nothing else.
- `standingsLadder(teams, rows)`: the page's rows in sportbet's order
  (saved place, then unplaced by name), the counters, whether any place is
  saved (R-79), and the deadline's state (R-80).
- `standingsSaveLimits(player)`, beside `predictionSaveLimits`.

### Database (`packages/db/src/standings/`)

- `loadStandingsPage(db, player, tournament)`: the tournament's teams, the
  player's rows and the deadline, parsed before they leave `db`.
- `saveStandingsRow(db, ...)` and `saveStandingsOrder(db, ...)`: the
  transaction above, deciding through `predictStandingsRow` /
  `reorderStandings` on the rows read under the lock, then upserting.
  `saveStandingsOrder` writes only `place`.

### Web (`apps/web`)

- `app/prediction/standings/page.tsx` loads the page and returns one
  component; `app/prediction/standings/route.ts` (row save) and
  `app/prediction/standings/reorder/route.ts` answer JSON.
- `components/standings/`: the ladder card (rows, arrows, drag, touch
  drag, live region, focus), the tick boxes (R-78's chain, a full stage
  disabling its other boxes, the final place enabled only on a Final Four
  team), the counters and legend, the unsaved-order notice with
  "Išsaugoti šią tvarką" (R-79), the deadline line (R-80), and a refused
  save's message beside its row (R-59), where sportbet shows none. The
  hidden place each row posts is rewritten on every move, so a tick never
  posts a stale place (sportbet's invariant). Colours only from tokens.

## Testing

- Domain: `standingsFormEntry` field by field; `predictStandingsRow`'s
  refusals in order, each by name; R-78's chain (tick, untick, final place)
  under both rule sets; `reorderStandings` (unknown, repeated, missing,
  ticks untouched); `standingsLadder` order, counters, R-79, R-80.
- Database: the deadline judged under the lock (a save at the deadline
  instant refused); a reorder leaves ticks and final places; a missing row
  is written; a lock held over 5 s answers busy.
- Feature: every answer of both routes (each text, both 422 shapes, 429,
  cross-site 403, guest), the page for a player, locked, and without a
  tournament; the return after sign-in.
- Components: arrows and `aria-disabled`, focus following the club, the
  live region's text, a failed reorder restoring the order, the chain on
  the boxes, the notice and button, the deadline line, a refusal shown.
- E2E at 390 and 1280: move a team with the arrows, tick a team into the
  Final Four, save the shown order, and the locked page.

## Done means

On staging the owner opens "Eigos spėjimai", saves the shown order, moves
teams with arrows and by drag (touch on a phone), ticks play-off and Final
Four teams and names a champion, sees the chain kept and a refusal's
message, and sees when the page closes; after the deadline the table is
read-only; the parity run still holds; every sportbet rule above and
R-78 to R-80 has a named test.
