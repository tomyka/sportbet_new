# Slice 7: results entry and the recalculation pipeline

A8 of `docs/phase-2-inventory.md`. Built in three parts on one spec: **7a**,
the admin gate and the results pages; **7b**, saving a result; **7c**,
recalculating everything. Security-sensitive throughout (admin gating).

Binding: decisions 3, 5, 10 and 13; LR-1, R-2, R-5, R-7, R-9, R-13, R-22,
R-26 (amended), R-32, R-38, R-39, R-41, R-43, R-51 and the new R-63 to R-66
(`docs/owner-rulings.md`); the 4b-6 rules in `CLAUDE.md` (sessions, route
handlers answering a real 303, same-origin checks, `savePrediction`'s lock
order); #20's carried note F1.

## The reference

sportbet at **3eb95e7**: `app/Http/Controllers/ResultController.php`,
`app/Http/Requests/UpdateResultRequest.php`, `app/Services/Recalculation.php`,
`app/Services/GeneratedPredictions.php`,
`app/Http/Controllers/PointStandingController.php` (121-133),
`app/Http/Middleware/{AdminMiddleware,SuperAdminMiddleware,EnsureIsLevel9Admin}.php`,
`resources/views/admin/{index,results}.blade.php`, `routes/web.php`
(150-247), and its tests (AdminResultEntryTest, ClearedResultRemovesPointsTest,
RecalculationEndpointTest, RecalculationTest,
SurvivalRecalculationIdempotenceTest, GoldenPointsTest). The inventory's
A8 table is out of date: both recalculation routes are POST since sportbet
issue 269, and a result before tip-off is refused since #274.

## Owner answers at the brainstorm (2026-10-07)

- **Roles (R-26 amended):** one account per person; Player, Results
  manager (results, standings facts, recalculation; sportbet's levels 1
  and 5), Superadmin (everything; sportbet's 8 and 9). Destructive
  superadmin actions are confirmed with a fresh emailed code (slices
  13-14); roles are given only by a superadmin, never to oneself.
- **R-63:** -1 : -1 marks a game postponed; emptying both boxes undoes it.
- **R-64:** a result with one box empty is refused.
- **R-65:** one "Perskaičiuoti taškus" recalculates everything; "Eigos
  taškai" goes.
- **R-66:** "Visi rezultatai" lists the current tournament's games.

## Lead decisions (technical)

- A non-admin opening an admin page is sent to `/`, as sportbet does.
- A refused result save shows the server's message (as R-59).
- Missing predictions are filled in when the result is saved (FI-1,
  sportbet), not by a separate pass at kick-off.
- F1: the result write holds the game row `FOR UPDATE`; `savePrediction`
  takes the game row `FOR SHARE` first, so a save cannot pass on a game
  whose result is being written. The lock order becomes: game row, then
  the prediction row, then the player's `tournament_players` rows.

## Design

### Roles

- `player_settings` gains a `role` (`player` | `results-manager` |
  `superadmin`); the reader maps sportbet's `user_settings.admin` (0 ->
  player; 1, 5 -> results manager; 8, 9 -> superadmin) and the staging
  seed makes the owner's account a superadmin. `admin_level` is replaced
  by the role (a migration maps existing values the same way).
- `mayEnterResults(role)` and `mayRecalculate(role)` in the domain; the R-50
  "admin sees hidden tournaments" check reads the role (any non-player).
- One server gate, `requireRole(...)`, re-reading the role from the
  session's account on every request; a refusal answers 303 to `/`.

### Domain

- `enterResult({ game, entry, now, rules })`, refused in sportbet's order
  with its texts: a winner not playing (kept for completeness, never shown
  for Euroleague); -1 : -1 accepted as postpone (R-63, through
  `Game.postpone`, R-41, R-13); any other negative "Rezultatas negali būti
  neigiamas. Atidėtoms rungtynėms įveskite -1 : -1."; both empty accepted as
  clear (`Game.withoutResult`); one empty "Įveskite abu rezultatus." (R-64);
  before tip-off "Rungtynės dar neprasidėjo - rezultato įvesti negalima.";
  level "Lygiosios negalimos - komandų rezultatai turi skirtis." (R-38);
  scores above 150 refused as sportbet's `max:150`. Accepted: the new game
  state.

### Database

- `saveResult(db, { game, entry, now, rules, dice })`: one transaction -
  the game row `FOR UPDATE`; `enterResult`; the game written; on a score,
  the fill-ins for players not switched off (`fillIns`, R-32, R-39) with
  `PlayerStatus.afterFillIn` (R-7) through `lockPlayerStatuses`; on a
  correction or clear, the rule set's handling of earlier fill-ins (FI-4,
  R-5); then `recalculateUnderRuleSet(ruledRules)` for the tournament when
  `Season.mayRecalculateAt` (R-22). Dice are cryptographic.
- `recalculateAll(db, now, rules)`: `recalculateUnderRuleSet` for every
  tournament that may be recalculated, returning each one's duration.
- `loadResultsPage(db, tournament, round | 'all', now)`.

### Web

- **7a.** `/admin` (the index with sportbet's tiles that exist:
  "Rezultatai (turas)", "Visi rezultatai", "Perskaičiuoti taškus"),
  `/admin/results` (the current round, R-6, R-40) and `/admin/resultsAll`
  (the current tournament, R-66): sportbet's results page - rounds,
  groups or Vilnius days, collapsed when fully scored, crests, "MMMM D ·
  H:i", two boxes per game, disabled before tip-off, "Atidėta" for a
  postponed game. The shell's admin link for non-players.
- **7b.** `POST /admin/updateResult`, a same-origin route handler for a
  results manager or superadmin; the autosave client as sportbet's (never
  a half pair; yellow when partial, green when saved, red with the
  server's message when refused).
- **7c.** `POST /admin/recalculateAllGamePoints` (sportbet's URL), for a
  results manager or superadmin, with sportbet's confirm "Perskaičiuoti
  visų rungtynių taškus? Tai gali užtrukti." and its answer "Visi taškų
  rezultatai perskaičiuoti." as a one-time message.
  `/admin/updateStandingPoints` is not served (R-65).

## Testing

- Domain: `enterResult` refusals in order, postpone and clear, R-38, R-64;
  role rules.
- Database: the result transaction (game lock, fill-ins and statuses,
  recalculation) and its rollback; FI-4/R-5 under both rule sets; R-22
  frozen; the F1 lock (a prediction save waits for a result write and is
  then refused); the role migration and the reader's mapping.
- Feature: the gate on every admin route for each role and a guest;
  cross-site refusals; every answer and text; recalculate's message.
- Parity: replaying a production copy's results through `saveResult`
  reproduces the stored rows except the random fill-in scores (inventory
  section 6); timings recorded.
- E2E at 390 and 1280: a superadmin enters a result and sees it scored.

## Done means

On staging the owner, as superadmin, enters a result for a started game
and sees the predictions scored, marks a game postponed with -1 : -1 and
clears it, runs "Perskaičiuoti taškus"; a player cannot reach any admin
page; the parity run still holds; every sportbet rule above has a named
test.
