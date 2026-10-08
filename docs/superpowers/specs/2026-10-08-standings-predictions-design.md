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

Settled at the brainstorm, then while planning and building (the plan,
`docs/superpowers/plans/2026-10-08-standings-predictions.md`, and the
team's reviews).

- **A row is named by its team.** `standings_predictions` is keyed by
  (player, team) and has no row id, so the row save posts `teamID` where
  sportbet posts `prediction_standingID`, and the reorder posts team ids.
  Both are read only by `idFromText`, so `0`, a sign or an id past
  Postgres' integer is a field error where sportbet's `integer` would let it
  through to "not yours" (issue 254's precedent).
- **The tournament is the posted team's** (sportbet issue 255), never the
  request's: the row save's team, the reorder's first team. A team not
  stored, or a tournament the player does not play in, is "Šios prognozės
  išsaugoti negalima." - also for a reorder whose first team is foreign,
  where sportbet (reading the session's tournament) says "Eilė nesutampa su
  jūsų lentele.".
- **The row save's address is `/prediction/standings/save`.** Next cannot
  serve a page and a handler at one path (slice 6, decision 1); the reorder
  keeps sportbet's `/prediction/standings/reorder`.
- **A missing row is written on save.** Joining seeds a blank row per team
  (`registerForTournament`), but a team added later has none (sportbet's
  admin insert seeds only the admin's). The page lists the tournament's
  teams with the player's rows joined; a save seeds the player's missing
  rows before locking them. A refused save writes nothing: the seeding is
  rolled back with it.
- **Order of checks** as sportbet's: the fields (`standingsFormEntry`,
  every failing field listed in UpdatePredictionStandingRequest's rules()
  order - team, place, final place, then the stages); then, under the lock,
  `predictStandingsRow`: not yours, the place outside the table (sportbet's
  `max:positionMax`, a field error on `groupPosition`, "Tokios vietos
  lentelėje nėra."), the conflicts (place, play-offs full, Final Four full,
  final place), R-78's chain, then the deadline. Field errors, conflicts
  and the chain are Laravel's 422 summary (conflicts and the chain under
  `teamID`, sportbet's `prediction_standingID`); not yours, closed and
  mismatch are `{success: false, message}`.
- **Accepted differences from sportbet's answers**, each reachable only by
  a hand-made post: a save reports its first conflict only, where
  rowConflicts lists every one (the page shows one message); a place
  outside the table is not listed together with another field's error; a
  foreign row is answered "not yours" without first being checked against
  football's default format; a malformed reorder is one "Eilė neteisinga."
  under `order`, not an error per element. The field rules' texts are ours,
  in Lithuanian (decision 13): sportbet's are Laravel's English defaults,
  which its page never shows.
- **No recalculation on save.** While standings are open no stage can be
  decided and, under `ruledRules`, no place is scored (R-14, R-43); under
  `sportbetRules` points move only on the button (ST-8). A save therefore
  calls neither `recalculateUnderRuleSet` nor `pointsChanged()`. A save
  switches no status back on (sportbet's does not; R-7 counts games).
- **Throttle.** `standingsSaveLimits`: 120 accepted saves a minute per
  player across both routes; a post the form refuses does not count. Not
  sportbet's (it has none), the slice 6 hardening. 120, not 60, because a
  ladder move is a save: the page sends one reorder after arrow presses
  pause (400 ms), so walking a team down the table is one save.
- **Locking.** Each save is one transaction (a savepoint inside a caller's)
  that seeds and then locks the player's rows of the tournament's teams
  (`FOR UPDATE`, by team) and judges the deadline at the later of the call
  and the database's time once the lock is held, waiting at most 5 s (then
  503, "Spėjimas neišsaugotas"). It takes no tournament or game lock: it
  writes no derived row. The season's games are read unlocked, at read
  committed, as sportbet re-reads the deadline; do not add a game lock here,
  out of the lock order.
- **The deadline is the season's** (`Season.isStandingsOpenAt`, ST-2): the
  domain's decisions take the season with their target.
- **One stage chain.** R-78's rules are the domain's `chain.ts`
  (`afterTick`, `tickOpen`, `finalPlaceOpen`, `keptChain`), used by both
  `predictStandingsRow` and the page, so a box the page offers is never one
  the save refuses. Every row the page posts first goes through
  `keptChain`, as sportbet's page clears a broken chain on load, so a
  migrated row that breaks the chain can still be saved.
- **One save queue on the page.** Every post waits for the one before it,
  and a tick first sends a waiting reorder; a row posts its place as last
  saved, so a row save never races a reorder into "Ši vieta jau užimta
  kitos komandos.".
- **Access** as `/prediction/results`: a guest goes to sign in and back
  through `signInAndReturn` (the bare page joins `GUARDED_PAGES`); a player
  without a current tournament goes to `/`. Saves are same-origin checked
  route handlers. The page reads the player's own rows only; others'
  standings are slice 11's summary.
- **Navigation.** "Eiga" (sportbet's rail and tab label, `bi-table`) joins
  `NAV_ENTRIES` after "Spėjimai", with the `standings` badge kind. The
  badge stays 0, as the results badge does, until the missing-predictions
  count is built; whichever slice counts it must refresh the shell after a
  save, as sportbet's sbRefreshNavBadges does.
- **Labels** stay sportbet's: "1/4", "1/2", "F", and the legend's "1/4 -
  1/2" (Euroleague's play-offs are its quarter-finals, the Final Four its
  semi-finals). Ladder ties are broken by name in byte order, as PHP's
  strcmp sorts them, so the order "Išsaugoti šią tvarką" saves is
  sportbet's.

## Design

### Domain (`packages/domain/src/standings/`)

- `standingsFormEntry(posted)`: the row's shape, field by field (team an
  id, place a whole number from 1, ticks 0 or 1, final place 1 or 2); every
  failing field listed (the form exception in `CLAUDE.md`).
  `reorderFormEntry(order)`: at least one id, each an id, none repeated.
- `predictStandingsRow({ entry, target, now })`, the target being the
  tournament's teams, the player's rows and the season: refused, in order,
  `not-yours`, `place-out-of-table`, `place-taken`, `play-offs-full`,
  `final-four-full`, `final-place-taken`, `final-four-without-play-offs`
  (R-78), `final-place-without-final-four` (R-78), `closed`. Accepted: the
  row to store, as posted.
- `reorderStandings({ order, target, now })`: refused `not-yours`,
  `closed`, then `mismatch` (an unknown, repeated or missing team);
  accepted: place n+1 for the n-th team, nothing else.
- `chain.ts`: R-78 for the page and the save (above).
- `standingsLadder({ teams, rows, season, now })`: the page's rows in
  sportbet's order (saved place, then unplaced by name), the counters,
  whether any place is saved (R-79), and the deadline's state (R-80).
- `standingsSaveLimits(player)`, beside `predictionSaveLimits`.

### Database (`packages/db/src/standings/`)

- `loadStandingsPage(db, ...)`: the tournament's teams, the player's rows
  and the season, parsed through the one standings row reader.
- `saveStandingsRow(db, ...)` and `saveStandingsOrder(db, ...)`: the
  transaction above. `saveStandingsOrder` writes only `place`.

### Web (`apps/web`)

- `app/prediction/standings/page.tsx` loads the page and returns one
  component; `app/prediction/standings/save/route.ts` and
  `app/prediction/standings/reorder/route.ts` answer JSON.
- `components/standings/`: the ladder card (rows, arrows, drag, touch
  drag, live region, focus), the tick boxes, the counters and legend, the
  unsaved-order notice with "Išsaugoti šią tvarką" (R-79), the deadline
  line (R-80), and a refused save's message beside its row (R-59), where
  sportbet shows none. Colours only from tokens.

## Testing

- Domain: both forms field by field; `predictStandingsRow`'s refusals in
  order, each by name; the chain (every tick change keeps it, `keptChain`
  on every combination); `reorderStandings` (unknown, repeated, missing,
  ticks untouched); `standingsLadder` order, counters, R-79, R-80.
- Database: the deadline judged under the lock (at the deadline instant
  refused, a lagging database clock never early); a reorder leaves ticks
  and final places; a missing row is written; a refused save writes
  nothing, also inside a caller's transaction; a lock held over 5 s fails.
- Feature: every answer of both routes (each text, both 422 shapes,
  cross-site 403, guest 401), the page for a player, closed, and without a
  tournament; the return after sign-in.
- Components: arrows and `aria-disabled`, focus following the club, the
  live region's text, a failed reorder restoring the order, the queue, the
  chain on the boxes, the notice and button, the deadline line, a refusal
  shown, the closed page.
- E2E at 390 and 1280: save the shown order, move a team with the arrows,
  tick a team into the Final Four and name it champion. The staging seed's
  tournament has no round-5 game and never closes, so the closed page is
  covered by the feature tests. The journey runs inside
  `e2e/predictions.spec.ts`, after its sign-in: the seeded address allows
  three codes in ten minutes and the suite already uses them, so the return
  after sign-in to `/prediction/standings` is covered by the feature tests.
  Touch drag is covered by `use-touch-drag.test.tsx` (synthetic touches).

## Done means

On staging the owner opens "Eiga", saves the shown order, moves teams with
arrows and by drag (touch on a phone), ticks play-off and Final Four teams
and names a champion, sees the chain kept and a refusal's message, and sees
when the page closes; after the deadline the table is read-only; the parity
run still holds; every sportbet rule above and R-78 to R-80 has a named
test.
